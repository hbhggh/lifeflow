// CF Pages Function — POST /api/session
//
// 浏览器（flow.wu-happy.com）专注结束后，前端会把本次 session + 产生的 entries
// 打包成 { sessions: [...], entries: [...] } POST 到这里。Function 会：
//   1) 用 env.GITHUB_TOKEN（fine-grained PAT）拉 hbhggh/lifeflow master 上的 data.json
//   2) 按 session.id / entry.id 去重 append（幂等：重复 push 同一条不会重复写入）
//   3) 重算 data.today.points = Σ entries.points、刷新 data.updated_at
//   4) PUT 回 GitHub，带上 sha；若 409（claude.ai MCP 那条链路同时写了 → sha 失效）
//      则 refetch → re-merge → retry，最多 3 次
//
// 并行写入者：
//   - 浏览器直 push（这条 Function）
//   - 你在 claude.ai 对话里 via Composio MCP github_create_or_update_file
//   两边都往 master 的 data.json 写，靠 GitHub Contents API 的 sha 乐观锁解决冲突。
//
// 访问控制：
//   由 CF Zero Trust → Access 在 /api/* 路径上托管（Policy: email = 你的 Gmail）。
//   未经 Access 鉴权的请求会在进入 Function 之前就被挡掉。
//
// Env (CF Pages Secrets):
//   GITHUB_TOKEN   (Secret, 必填) — fine-grained PAT, scope: Contents RW on hbhggh/lifeflow
//   GITHUB_REPO    (plain,  可选) — 默认 "hbhggh/lifeflow"
//   GITHUB_BRANCH  (plain,  可选) — 默认 "master"

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GITHUB_TOKEN) {
      return json({ ok: false, error: 'GITHUB_TOKEN secret not configured in CF Pages' }, 500);
    }

    const repo   = env.GITHUB_REPO   || 'hbhggh/lifeflow';
    const branch = env.GITHUB_BRANCH || 'master';
    const path   = 'data.json';

    let payload;
    try { payload = await request.json(); }
    catch (e) { return json({ ok: false, error: 'invalid JSON body' }, 400); }

    const incomingSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
    const incomingEntries  = Array.isArray(payload.entries)  ? payload.entries  : [];
    if (incomingSessions.length === 0 && incomingEntries.length === 0) {
      return json({ ok: true, accepted: { sessions: 0, entries: 0 }, noop: true });
    }

    const ghHeaders = {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lifeflow-pages-fn/1.0'
    };

    const contentsUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
    const putUrl      = `https://api.github.com/repos/${repo}/contents/${path}`;

    // Optimistic concurrency: up to 3 attempts
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const getRes = await fetch(contentsUrl, { headers: ghHeaders });
      if (!getRes.ok) {
        const txt = await safeText(getRes);
        return json({ ok: false, error: `GET contents failed ${getRes.status}: ${txt.slice(0, 300)}` }, 502);
      }
      const meta = await getRes.json();
      const sha = meta.sha;

      let raw;
      try { raw = b64DecodeUtf8(meta.content || ''); }
      catch (e) { return json({ ok: false, error: 'base64 decode failed' }, 502); }

      let data;
      try { data = JSON.parse(raw); }
      catch (e) { return json({ ok: false, error: 'remote data.json is not valid JSON' }, 502); }

      data.today = data.today || {};
      data.today.focus_sessions = Array.isArray(data.today.focus_sessions) ? data.today.focus_sessions : [];
      data.today.entries        = Array.isArray(data.today.entries)        ? data.today.entries        : [];

      const existingSessionIds = new Set(data.today.focus_sessions.map(s => s && s.id).filter(Boolean));
      const existingEntryIds   = new Set(data.today.entries.map(e => e && e.id).filter(Boolean));

      let addedSessions = 0;
      for (const s of incomingSessions) {
        if (s && s.id && !existingSessionIds.has(s.id)) {
          data.today.focus_sessions.push(s);
          existingSessionIds.add(s.id);
          addedSessions++;
        }
      }
      let addedEntries = 0;
      for (const e of incomingEntries) {
        if (e && e.id && !existingEntryIds.has(e.id)) {
          data.today.entries.push(e);
          existingEntryIds.add(e.id);
          addedEntries++;
        }
      }

      // nothing new after dedupe — treat as success to let client clear outbox
      if (addedSessions === 0 && addedEntries === 0) {
        return json({ ok: true, accepted: { sessions: 0, entries: 0 }, noop: true, sha });
      }

      // recompute today.points consistent with frontend renderer
      data.today.points = data.today.entries.reduce((acc, e) => acc + (Number(e && e.points) || 0), 0);
      data.updated_at = new Date().toISOString();

      const newContent = JSON.stringify(data, null, 2) + '\n';
      const newContentB64 = b64EncodeUtf8(newContent);
      const commitMessage = `data: sync ${addedSessions}s+${addedEntries}e from web (auto)`;

      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: { ...ghHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commitMessage,
          content: newContentB64,
          sha,
          branch
        })
      });

      if (putRes.status === 409) {
        // another writer (claude.ai MCP or another browser tab) slipped in; retry.
        lastError = '409 sha conflict';
        continue;
      }
      if (!putRes.ok) {
        const txt = await safeText(putRes);
        return json({ ok: false, error: `PUT failed ${putRes.status}: ${txt.slice(0, 300)}` }, 502);
      }
      const putData = await putRes.json();
      return json({
        ok: true,
        accepted: { sessions: addedSessions, entries: addedEntries },
        newSha: putData && putData.content && putData.content.sha || null,
        commit: putData && putData.commit && putData.commit.sha || null,
        attempt: attempt + 1
      });
    }

    return json({ ok: false, error: lastError || 'sha conflict, retries exhausted' }, 409);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) }, 500);
  }
}

// Health check — lets the client verify Access + env are wired up without writing.
export async function onRequestGet({ env }) {
  return json({
    ok: true,
    hint: 'POST { sessions: [...], entries: [...] } here to merge into data.json.',
    configured: !!env.GITHUB_TOKEN,
    repo: env.GITHUB_REPO || 'hbhggh/lifeflow',
    branch: env.GITHUB_BRANCH || 'master'
  });
}

// ---- helpers ----

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function b64DecodeUtf8(s) {
  const binary = atob(String(s).replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function b64EncodeUtf8(s) {
  const bytes = new TextEncoder().encode(String(s));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function safeText(res) {
  try { return await res.text(); } catch (e) { return ''; }
}
