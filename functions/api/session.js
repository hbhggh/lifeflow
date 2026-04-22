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
    // `probe=1` never touches GitHub — use it to debug env / runtime on its own.
    const url = new URL(request.url);
    if (url.searchParams.get('probe') === '1') {
      return tokenProbe(env);
    }

    const token = String(env.GITHUB_TOKEN || '').trim();
    if (!token) {
      return json({ ok: false, error: 'GITHUB_TOKEN secret not configured in CF Pages (or empty after trim)' }, 500);
    }
    if (!/^[\x21-\x7e]+$/.test(token)) {
      // any non-printable-ASCII char would make the Authorization header invalid
      // and cause a raw CF 502 (Worker throws building the request).
      return json({ ok: false, error: 'GITHUB_TOKEN contains invalid chars (expected printable ASCII)' }, 500);
    }

    const repo   = env.GITHUB_REPO   || 'hbhggh/lifeflow';
    const branch = env.GITHUB_BRANCH || 'master';
    const path   = 'data.json';

    let payload;
    try { payload = await request.json(); }
    catch (e) { return json({ ok: false, error: 'invalid JSON body' }, 400); }

    const incomingSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
    const incomingEntries  = Array.isArray(payload.entries)  ? payload.entries  : [];
    const incomingProjects = Array.isArray(payload.projects) ? payload.projects : [];
    // Client tells us what *today* is from the device's perspective (JST/CST/whatever
    // the user is in). We never trust server-side Date() for the day boundary —
    // CF edges can be anywhere. Validate shape YYYY-MM-DD before use.
    const clientTodayRaw = typeof payload.today_date === 'string' ? payload.today_date.trim() : '';
    const clientToday = /^\d{4}-\d{2}-\d{2}$/.test(clientTodayRaw) ? clientTodayRaw : '';
    if (incomingSessions.length === 0 && incomingEntries.length === 0 && incomingProjects.length === 0 && !clientToday) {
      // pure no-op push (nothing to write, no date hint either) — succeed silently
      return json({ ok: true, accepted: { sessions: 0, entries: 0, projects: 0 }, noop: true });
    }

    const ghHeaders = {
      'Authorization': `Bearer ${token}`,
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

      // Day rollover: if the device tells us today ≠ data.today.date, archive
      // the old today as yesterday + push its points into history, then start
      // a fresh today. Idempotent — no-op when dates already match. Done
      // BEFORE upsert so the incoming session/entries land on the new day.
      let rolled = false;
      if (clientToday && data.today.date && data.today.date !== clientToday) {
        const oldToday = data.today;
        data.yesterday = { date: oldToday.date, points: Number(oldToday.points) || 0 };
        data.history_points = Array.isArray(data.history_points) ? data.history_points : [];
        data.history_points.push(Number(oldToday.points) || 0);
        if (data.history_points.length > 200) data.history_points = data.history_points.slice(-200);
        data.today = {
          date: clientToday,
          points: 0,
          rank_pct: oldToday.rank_pct || 0,
          focus_sessions: [],
          entries: []
        };
        rolled = true;
      } else if (clientToday && !data.today.date) {
        // first-ever write into a data.json with no today.date; stamp it
        data.today.date = clientToday;
      }

      // Upsert by id (sessions: id only; entries: id OR legacy (time, task) natural key).
      // "id already present → merge fields in place (incoming wins)" lets the browser
      // edit already-committed rows (e.g. user re-scoring an entry's points). "id absent
      // → append". Keeps Function idempotent while supporting edits.
      let upsertedSessions = 0, addedSessions = 0;
      for (const s of incomingSessions) {
        if (!s || !s.id) continue;
        const idx = data.today.focus_sessions.findIndex(x => x && x.id === s.id);
        if (idx >= 0) {
          Object.assign(data.today.focus_sessions[idx], s);
          upsertedSessions++;
        } else {
          data.today.focus_sessions.push(s);
          addedSessions++;
        }
      }

      let upsertedEntries = 0, addedEntries = 0;
      for (const e of incomingEntries) {
        if (!e) continue;
        let idx = -1;
        if (e.id) idx = data.today.entries.findIndex(x => x && x.id === e.id);
        if (idx < 0 && e.time && e.task) {
          idx = data.today.entries.findIndex(x => x && !x.id && x.time === e.time && x.task === e.task);
        }
        if (idx >= 0) {
          Object.assign(data.today.entries[idx], e);
          upsertedEntries++;
        } else {
          data.today.entries.push(e);
          addedEntries++;
        }
      }

      // Projects: upsert the long-term goal list. Used by the frontend to keep
      // project.pct / project.today_delta_pct in sync whenever the user edits
      // entry.project_delta_pct or moves an entry between projects. Schema
      // unchanged — we just accept partial patches on existing rows.
      data.projects = Array.isArray(data.projects) ? data.projects : [];
      let upsertedProjects = 0, addedProjects = 0;
      for (const p of incomingProjects) {
        if (!p || !p.id) continue;
        const idx = data.projects.findIndex(x => x && x.id === p.id);
        if (idx >= 0) {
          Object.assign(data.projects[idx], p);
          upsertedProjects++;
        } else {
          data.projects.push(p);
          addedProjects++;
        }
      }

      const touched = upsertedSessions + addedSessions + upsertedEntries + addedEntries + upsertedProjects + addedProjects;
      if (touched === 0 && !rolled) {
        return json({ ok: true, accepted: { sessions: 0, entries: 0, projects: 0 }, noop: true, sha });
      }

      // recompute today.points consistent with frontend renderer
      data.today.points = data.today.entries.reduce((acc, e) => acc + (Number(e && e.points) || 0), 0);
      data.updated_at = new Date().toISOString();

      const newContent = JSON.stringify(data, null, 2) + '\n';
      const newContentB64 = b64EncodeUtf8(newContent);
      const syncSummary = `${addedSessions}+${upsertedSessions}s · ${addedEntries}+${upsertedEntries}e · ${addedProjects}+${upsertedProjects}p`;
      const commitMessage = rolled
        ? `data: rollover to ${clientToday} + sync ${syncSummary} from web (auto)`
        : `data: sync ${syncSummary} from web (auto)`;

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
        rolled,
        today: data.today && data.today.date || null,
        accepted: {
          sessions_added: addedSessions,
          sessions_upserted: upsertedSessions,
          entries_added: addedEntries,
          entries_upserted: upsertedEntries,
          projects_added: addedProjects,
          projects_upserted: upsertedProjects
        },
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
// `?probe=1` returns token-characteristic diagnostics (never the token itself).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get('probe') === '1') {
    return tokenProbe(env);
  }
  return json({
    ok: true,
    hint: 'POST { sessions: [...], entries: [...] } here to merge into data.json. Add ?probe=1 for env diagnostics.',
    configured: !!env.GITHUB_TOKEN,
    repo: env.GITHUB_REPO || 'hbhggh/lifeflow',
    branch: env.GITHUB_BRANCH || 'master'
  });
}

// Returns token shape without ever exposing the secret itself.
// Enough to distinguish "token missing / empty / has whitespace / wrong format / looks right but rejected by GitHub".
function tokenProbe(env) {
  const raw = String(env.GITHUB_TOKEN || '');
  const trimmed = raw.trim();
  const looksLikePat  = trimmed.startsWith('github_pat_');
  const looksLikeGho  = trimmed.startsWith('gho_');
  const looksLikeGhs  = trimmed.startsWith('ghs_');
  const looksLikeGhp  = trimmed.startsWith('ghp_');
  const kind = looksLikePat ? 'fine-grained PAT' :
               looksLikeGho ? 'OAuth token' :
               looksLikeGhs ? 'server-to-server' :
               looksLikeGhp ? 'classic PAT' : 'unknown';
  return json({
    ok: true,
    probe: true,
    token_present: raw.length > 0,
    token_length_raw: raw.length,
    token_length_trimmed: trimmed.length,
    whitespace_stripped: raw.length - trimmed.length,
    ascii_clean: /^[\x21-\x7e]+$/.test(trimmed),
    prefix_looks_valid: looksLikePat || looksLikeGho || looksLikeGhs || looksLikeGhp,
    kind,
    repo: env.GITHUB_REPO || '(default) hbhggh/lifeflow',
    branch: env.GITHUB_BRANCH || '(default) master',
    note: looksLikePat
      ? 'fine-grained PAT expected length ~93 chars (github_pat_ + ~82 body); check token_length_trimmed matches'
      : 'prefix not recognized; go regenerate a fine-grained PAT with Contents RW on hbhggh/lifeflow'
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
