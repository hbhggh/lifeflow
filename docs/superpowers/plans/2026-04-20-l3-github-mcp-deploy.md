# L3 GitHub MCP + CF Pages Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the L3 infrastructure (private GitHub repo + Fine-grained PAT + Cloudflare Pages at flow.wu-happy.com + iOS claude.ai GitHub MCP) so that at the end of each daily L2 conversation Claude can write `data.json` into the repo and the site updates within 30 s.

**Architecture:** No new code in this plan — L3 is infrastructure glue. Work splits into (a) manual user actions on external consoles (GitHub, Cloudflare, iOS claude.ai), (b) local git operations that I run, (c) verification commands/visual checks that I prescribe after each manual step.

**Tech Stack:** Git (SSH + HTTPS), GitHub (private repo + Fine-grained PAT), Cloudflare Pages (static hosting + custom domain + free TLS), iOS claude.ai Connectors (GitHub MCP).

**File Structure (new/modified by this plan):**
```
~/lifeflow/
├── docs/
│   └── pat-rotation.md              (Task 9: 90-day rotation reminder)
└── [all other files pushed as-is from existing commits]
```

No source code changes. One new doc. All L3 work is external configuration + verification.

**Authority assumptions (must be true before starting):**
- [较确定] User can sign into github.com
- [较确定] User can sign into dash.cloudflare.com
- [较确定] User has iOS device with claude.ai app installed
- [未验证] User owns `wu-happy.com` and its DNS is in Cloudflare (verified in Task 1)

---

### Task 1: Verify 3 hard gates (pre-implementation)

**Files:** None (verification only)

- [ ] **Step 1 (user action): Verify wu-happy.com is in Cloudflare**

Go to https://dash.cloudflare.com/ → **Websites** list.

Expected: see `wu-happy.com` listed with status **Active**.

- If listed → proceed to Step 2
- If not listed but the domain is registered elsewhere → need to change nameservers to Cloudflare (CF provides the NS pair). Takes up to 24h for DNS propagation. Add a new task before Task 5 to handle this.
- If domain is not registered at all → either register via Cloudflare Registrar (~$10/yr) or pick a different `*.pages.dev` domain and update the spec.

- [ ] **Step 2 (user action): Gather GitHub username**

User opens https://github.com/settings/profile and reads the `Username` field.

Tell the agent: "My GitHub username is `<USERNAME>`". This value is referenced as `<GH_USERNAME>` in later tasks.

- [ ] **Step 3 (I run): Test SSH to GitHub**

Run:
```bash
ssh -T git@github.com 2>&1 | head -5
```

Expected output: `Hi <GH_USERNAME>! You've successfully authenticated, but GitHub does not provide shell access.`

If output says "Permission denied (publickey)":
- Check which public keys exist: `ls -1 ~/.ssh/*.pub`
- User copies one of them (`cat ~/.ssh/id_rsa.pub` or `id_ecdsa.pub`) and adds it at https://github.com/settings/keys → **New SSH key** → paste → Save.
- Retry `ssh -T git@github.com` until it succeeds.

- [ ] **Step 4 (checkpoint): All 3 gates clear**

Must-haves before proceeding:
- ✅ wu-happy.com is Active in CF
- ✅ `<GH_USERNAME>` is known
- ✅ `ssh -T git@github.com` authenticates

If any ✗: STOP and resolve.

---

### Task 2: Create private GitHub repo

**Files:** None (external action)

- [ ] **Step 1 (user action): Create the repo**

Go to https://github.com/new.

Fill in:
- **Repository name**: `lifeflow`
- **Visibility**: **Private** (radio)
- **Initialize this repository with**:
  - [ ] Add a README file — **unchecked**
  - [ ] Add .gitignore — **unchecked**
  - [ ] Choose a license — **unchecked**

Click **Create repository**.

- [ ] **Step 2 (user action): Copy the SSH clone URL**

On the new repo's empty page, click **SSH** tab under "Quick setup", copy the URL. Format: `git@github.com:<GH_USERNAME>/lifeflow.git`.

Paste it to the agent: "SSH URL is `git@github.com:<GH_USERNAME>/lifeflow.git`".

---

### Task 3: Local git remote + first push

**Files:** None (git state change only)

- [ ] **Step 1: Add remote**

Run:
```bash
cd ~/lifeflow
git remote add origin git@github.com:<GH_USERNAME>/lifeflow.git
git remote -v
```

Expected output:
```
origin  git@github.com:<GH_USERNAME>/lifeflow.git (fetch)
origin  git@github.com:<GH_USERNAME>/lifeflow.git (push)
```

- [ ] **Step 2: Add Breath.html + data.json (L4 scope files that L3 needs on GitHub)**

These were previously untracked (L4's business). L3 needs them on GitHub so Pages can serve them.

Run:
```bash
cd ~/lifeflow
git add Breath.html data.json
git -c user.email=wuh28893@gmail.com -c user.name='wuhao' commit -m "feat: include Breath.html and data.json for L3 Pages deploy

These files were kept untracked during L2 as L4 scope. L3 publishes
them so Cloudflare Pages has something to serve. L4 will still modify
Breath.html (refresh button), not move it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: First push**

Run:
```bash
cd ~/lifeflow
git push -u origin master
```

Expected: push shows `Writing objects: 100%`, ends with `Branch 'master' set up to track 'origin/master'`. No errors.

If it asks for password or says "permission denied": Gate 3 failed — return to Task 1 Step 3.

- [ ] **Step 4: Verify on GitHub**

User opens https://github.com/<GH_USERNAME>/lifeflow in browser.

Expected: see all files (Breath.html, data.json, prompts/, scripts/, tests/, docs/, .gitignore). Commit count ≥ 9.

---

### Task 4: Create Fine-grained PAT

**Files:** None (external action)

- [ ] **Step 1 (user action): Navigate to PAT creation**

Go to https://github.com/settings/tokens?type=beta (fine-grained tokens page).

Click **Generate new token**.

- [ ] **Step 2 (user action): Configure token**

Fill in:
- **Token name**: `lifeflow-mcp-write`
- **Expiration**: **90 days** (custom date)
- **Description**: `Claude MCP writes to lifeflow repo for L3 pipeline`
- **Resource owner**: your personal account
- **Repository access**: select **Only select repositories** → choose `lifeflow`
- **Permissions → Repository permissions**:
  - Find **Contents** → change dropdown from `No access` to **Read and write**
  - Leave all others as **No access**
  - (Account permissions section: leave all **No access**)

Click **Generate token**.

- [ ] **Step 3 (user action): SAVE the token NOW**

GitHub shows the token string **exactly once**. Copy it. Save it to a password manager (1Password / Bitwarden / macOS Keychain).

Format looks like: `github_pat_11AAAAAAA0NNN...NNN`.

**Do NOT paste it into chat.** Just confirm to the agent: "PAT saved in <password manager>, ready to use in Task 6."

- [ ] **Step 4 (user action, optional but recommended): Save expiration reminder**

Add a calendar reminder for ~85 days from today labeled "Rotate lifeflow-mcp-write PAT". (Task 9 writes a reminder file in the repo too, but a calendar ping is more reliable.)

---

### Task 5: Cloudflare Pages + custom domain

**Files:** None (external config)

- [ ] **Step 1 (user action): Connect Cloudflare Pages to GitHub**

Go to https://dash.cloudflare.com/ → **Workers & Pages** → **Create application** → **Pages** tab → **Connect to Git**.

Authorize GitHub access if prompted. When asked which repos to allow, select **Only select repositories** → `lifeflow`.

Select the `lifeflow` repo and click **Begin setup**.

- [ ] **Step 2 (user action): Build settings**

- **Project name**: `lifeflow` (default). Creates `lifeflow.pages.dev` if available, else `lifeflow-<hash>.pages.dev`.
- **Production branch**: `master`
- **Framework preset**: **None**
- **Build command**: (leave empty)
- **Build output directory**: `/` (or leave as default)
- **Root directory**: `/` (leave as default)

Click **Save and Deploy**.

- [ ] **Step 3 (user action + I verify): Wait for first build**

Watch the build log (CF shows it live). Expected: completes in ~10-30 s (there's no build, just copy files to CDN).

Expected final line: `Success: Your site was deployed!`

User tells me the default URL (e.g., `https://lifeflow.pages.dev`).

- [ ] **Step 4 (I run): Smoke test default URL**

```bash
curl -sI https://lifeflow.pages.dev/Breath.html | head -5
curl -s https://lifeflow.pages.dev/data.json | python3 -c 'import json, sys; d=json.load(sys.stdin); print("schema_version:", d.get("schema_version"))'
```

Expected:
- First curl: `HTTP/2 200` and `content-type: text/html...`
- Second curl: prints `schema_version: 0.1`

- [ ] **Step 5 (user action): Add custom domain flow.wu-happy.com**

In the CF Pages project for `lifeflow`, go to **Custom domains** → **Set up a custom domain** → enter `flow.wu-happy.com` → **Continue** → CF will auto-add a CNAME record in the `wu-happy.com` zone → **Activate domain**.

Wait 30-60 s for TLS cert issuance.

- [ ] **Step 6 (I run): Verify custom domain**

```bash
curl -sI https://flow.wu-happy.com/Breath.html | head -5
```

Expected: `HTTP/2 200` + `content-type: text/html`.

If it's 404 or TLS error: wait 2 more minutes, retry. If still failing, check CF dashboard for red banners.

---

### Task 6: iOS claude.ai GitHub Connector

**Files:** None (iOS app config)

- [ ] **Step 1 (user action): Open claude.ai on iPhone/iPad**

iOS claude.ai app → tap profile icon → **Settings** → scroll to **Connectors** section.

[不确定] Exact label may be "Integrations" or "Connectors" depending on app version. Look for the section that shows GitHub / Google Drive / etc as linkable services.

- [ ] **Step 2 (user action): Add GitHub connector**

Tap **GitHub** → authentication prompt.

- If prompted for OAuth → follow the OAuth flow in-app.
- If prompted for PAT → paste the token saved in Task 4.

Which method to use: if you saved a Fine-grained PAT and the connector accepts it → paste method preferred (scoped, revocable). OAuth tends to request broader scopes.

[不确定] Exact auth mechanism for iOS claude.ai GitHub connector — user might need to experiment. Fallback: if only OAuth is supported, use OAuth with the minimum scope claude.ai requests. PAT serves as a backup.

- [ ] **Step 3 (user action): Confirm connection**

After auth, Connectors page should show GitHub with a green dot or ✓. User tells me: "GitHub connector is live."

---

### Task 7: MCP write connectivity test

**Files:** None (live test)

- [ ] **Step 1 (user action): Open new claude.ai conversation**

On iOS claude.ai, start a new conversation.

- [ ] **Step 2 (user action): Ask Claude to read the repo**

Type: `用 GitHub connector 读我的 lifeflow repo 的 data.json 并告诉我 today.points 是多少`

Expected: Claude reads, responds with a value (e.g., "today.points 是 150").

If Claude says "I don't have access" or "connector error": return to Task 6, troubleshoot.

- [ ] **Step 3 (user action): Ask Claude to write a test file**

Type: `在 lifeflow repo 根目录创建一个叫 mcp-echo-test.md 的文件, 内容就一行 "MCP write OK - <当前时间>"`

Claude should call GitHub MCP create-or-update file API.

Expected: Claude confirms "已创建 mcp-echo-test.md".

- [ ] **Step 4 (I verify + user verify): Check file on GitHub**

User opens https://github.com/<GH_USERNAME>/lifeflow/blob/master/mcp-echo-test.md in browser.

Expected: file exists with the expected content and a commit like `Create mcp-echo-test.md` from author matching the PAT/OAuth identity.

Also I run:
```bash
cd ~/lifeflow
git pull
cat mcp-echo-test.md
```

Expected: prints `MCP write OK - <时间>`.

- [ ] **Step 5 (user action): Ask Claude to delete the test file**

Type: `删除 lifeflow repo 的 mcp-echo-test.md`

Claude deletes via MCP.

- [ ] **Step 6 (I verify): File gone**

```bash
cd ~/lifeflow
git pull
ls mcp-echo-test.md 2>&1
```

Expected: `ls: cannot access 'mcp-echo-test.md'...` (file gone locally after pull).

- [ ] **Step 7: Gate 2 officially clear**

iOS claude.ai GitHub MCP write ↔ read ↔ delete all work. L3 architecture is sound.

---

### Task 8: E2E smoke — full L2+L3 flow

**Files:** None (live use, no new artifacts)

This is the first real usage of the complete pipeline. Do it with minimal stakes (e.g., a trivial day).

- [ ] **Step 1 (user action): Prepare minimal Calflow data**

In Calflow, create 2-3 Reminders for today. Check one off (mark as done).

- [ ] **Step 2 (user action): Run L2 prompt**

On iOS claude.ai, new conversation. Paste the contents of `prompts/l2-calflow-to-lifeflow.md` (between `===START===` and `===END===`), replace `<TODAY>` with today's date, send.

Follow the 3-round protocol (list confirm → rules negotiate → JSON output).

- [ ] **Step 3 (user action): Append MCP write instruction to round 3**

When Claude is about to output data.json (round 3), add: `同时直接用 GitHub connector 写进 lifeflow repo 的 data.json, 覆盖现有内容, commit message 用 "data: daily sync <YYYY-MM-DD>".`

Expected: Claude outputs the JSON AND performs the MCP write.

- [ ] **Step 4 (I verify): Pull and check locally**

```bash
cd ~/lifeflow
git pull
python3 scripts/validate_data.py data.json
git log --oneline -3
```

Expected:
- `validate_data.py` prints `OK`
- Top log entry is `data: daily sync YYYY-MM-DD` authored by Claude/MCP

- [ ] **Step 5 (I verify): Cloudflare Pages redeploy**

Wait 30-60 s after the MCP push.

```bash
curl -s https://flow.wu-happy.com/data.json | python3 -c 'import json, sys; d=json.load(sys.stdin); print("updated_at:", d.get("updated_at"))'
```

Expected: `updated_at` reflects the new sync (today's date, recent time).

- [ ] **Step 6 (user action): Visual check in browser**

Open https://flow.wu-happy.com/Breath.html on iPhone/iPad/desktop. Hard refresh (Cmd+Shift+R).

Expected: Hero today.points + entries + projects all reflect today's Calflow data.

- [ ] **Step 7: Gate all green**

- ✅ L2 prompt works on iOS
- ✅ MCP write lands on GitHub
- ✅ CF Pages rebuilds on push
- ✅ Custom domain serves latest
- ✅ Validator accepts Claude's output

If any ✗: triage via spec's error-handling section.

---

### Task 9: PAT rotation reminder doc

**Files:**
- Create: `docs/pat-rotation.md`

- [ ] **Step 1: Write rotation doc**

Write `~/lifeflow/docs/pat-rotation.md`:

```markdown
# PAT Rotation · lifeflow-mcp-write

## 什么时候轮换

每 **85 天** (token 有效期 90 天, 留 5 天缓冲)。

当前 token 创建于: `<TODAY>` → 下次轮换截止: `<TODAY+85d>`

## 轮换步骤 (~5 min)

1. 在 https://github.com/settings/tokens?type=beta 找到 `lifeflow-mcp-write`
2. 点进去 → **Regenerate token** (或新建同名 token 并删旧的)
3. 配置: Fine-grained, 仅 `lifeflow` repo, `Contents: Read and write`, 90 天
4. **立刻** 复制新 token (只显示一次)
5. 打开 iOS claude.ai → Settings → Connectors → GitHub → 更新 PAT 字段 (如果是 PAT 模式; OAuth 模式则无此步)
6. 跑一次 Task 7 的 Step 3 写 echo test, 确认新 token 可用
7. 更新本文件的 "当前 token 创建于" 字段 + commit

## 轮换失败时

如果忘记轮换导致 MCP 写失败:
- L2 输出的 data.json 复制到 `/tmp/data-new.json`
- `python3 scripts/validate_data.py /tmp/data-new.json`
- `cp /tmp/data-new.json ~/lifeflow/data.json`
- `git add data.json && git commit -m "data: daily sync <date> (manual, PAT expired)" && git push`
- 事后补做轮换
```

Replace `<TODAY>` and `<TODAY+85d>` with actual dates when writing. Example: if today is 2026-04-20, use 2026-04-20 and 2026-07-14.

- [ ] **Step 2: Compute the rotation deadline**

Run:
```bash
date -d '+85 days' '+%Y-%m-%d'
```

Use this value in the doc above.

- [ ] **Step 3: Commit**

```bash
cd ~/lifeflow
git add docs/pat-rotation.md
git -c user.email=wuh28893@gmail.com -c user.name='wuhao' commit -m "docs: add PAT rotation reminder (85-day cycle)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push
```

Expected: pushes to GitHub, CF Pages rebuilds (but nothing visually changes — it's just a doc).

---

## Self-review outcomes

**Spec coverage check** (against `2026-04-20-l3-github-mcp-deploy-design.md`):

| Spec section | Implemented by |
|---|---|
| 4 决策 (visibility / domain / PAT / trigger) | Task 2 (private), Task 5 (flow.wu-happy.com), Task 4 (fine-grained PAT), Task 7-8 (Claude MCP write) |
| C1 GitHub private repo | Task 2 |
| C2 Fine-grained PAT | Task 4 |
| C3 本地 git remote + 首次 push | Task 3 |
| C4 Cloudflare Pages | Task 5 |
| C5 iOS claude.ai Connectors | Task 6 |
| Gate 1 (wu-happy.com + CF DNS) | Task 1 Step 1 |
| Gate 2 (MCP write capability) | Task 7 (deliberate verify) |
| Gate 3 (SSH key on GitHub) | Task 1 Step 3 |
| Repo 内容清单 | Task 3 Step 2 (Breath.html + data.json) + push |
| 日常运行 E2E | Task 8 |
| 错误处理 (MCP 失败降级 / PAT 过期 / JSON 损坏) | Task 9 (PAT expiry fallback), spec's "Error handling" referenced in Task 8 Step 7 |

**No spec section lacks a task.**

**Placeholder scan**: `<GH_USERNAME>`, `<TODAY>`, `<TODAY+85d>` are runtime-substituted placeholders, not "TBD" gaps. Each has a clear substitution source (Task 1 Step 2 for username, `date` command for dates). Not placeholder violations per the rule.

[不确定] labels on Tasks 6 Step 1 / Step 2 are honest confidence markers (iOS claude.ai Connectors UI evolves). They tell the engineer what to verify, not a gap.

**Type consistency**: no function signatures in this plan (infrastructure only). Repo URL format consistent throughout (`git@github.com:<GH_USERNAME>/lifeflow.git`). PAT name consistent (`lifeflow-mcp-write`). Project name consistent (`lifeflow`).

**Open questions** from spec (GitHub username, SSH vs HTTPS, project name, PAT rotation) are all resolved by this plan's concrete steps.
