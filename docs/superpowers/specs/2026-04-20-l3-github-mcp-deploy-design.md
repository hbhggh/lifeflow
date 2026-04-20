# L3 · GitHub MCP 推送 + Cloudflare Pages 部署

**Status**: Amended 2026-04-21 (auth path pivoted from Fine-grained PAT → Rube/Composio OAuth)
**Date**: 2026-04-20 (original), 2026-04-21 (amendment)
**Session origin**: L3 brainstorming (post L2 完成)
**Scope**: L3 only — GitHub 基础设施 + CF Pages + claude.ai MCP 配置。L4 (网页刷新按钮) 另起 spec。

---

## UPDATE 2026-04-21 · 认证路径 pivot

原计划: iOS claude.ai app 的 built-in GitHub Connector + Fine-grained PAT。

**实际**: iOS claude.ai **没有** built-in GitHub connector (只在 claude.ai web / desktop 有, 且需要自建 custom connector)。

**新路径**: **Rube (Composio 托管) Custom Connector** 经 Composio OAuth 连 GitHub。

| 原决策 | 新决策 |
|---|---|
| 推送触发方式: Claude iOS Connector + Fine-grained PAT | Claude web claude.ai Connector + Rube via Composio OAuth |
| PAT: `lifeflow-mcp-write` (90d, Contents R+W) | **已删** — Composio OAuth 全权代理, PAT 失去用途 |
| Gate 2 验证在 iOS claude.ai | Gate 2 验证在 **claude.ai web** (desktop), iOS 仍未独立验证 [未验证] |

**验证证据** (2026-04-21): Rube `GITHUB_GET_REPOSITORY_CONTENT` / `GITHUB_COMMIT_MULTIPLE_FILES` read+write+delete 三路全通, commit SHAs `ccd47f8` (write) + `3c37035` (delete) 已上 master 并清理。

---

## 4 决策 (brainstorm 结果)

| 决策 | 选项 |
|---|---|
| GitHub repo visibility | **Private** |
| Cloudflare Pages 域名 | **flow.wu-happy.com** |
| PAT scope | **Fine-grained, 仅 lifeflow repo, `contents:read+write`** |
| 推送触发方式 | **Claude 对话末尾 via GitHub MCP 直接 PUT** |

---

## 架构

```
L2 出口: Claude 协商完 data.json
         │
         │ GitHub Contents API PUT
         │ (Fine-grained PAT via claude.ai MCP)
         ▼
GitHub private repo <you>/lifeflow
  master ← 新 commit: "data: daily sync <YYYY-MM-DD>"
         │
         │ CF Pages webhook
         ▼
Cloudflare Pages (build: 无, 纯静态)
  serve: flow.wu-happy.com
         │
         ▼
iPhone/iPad/Mac 浏览器 · 刷新即最新
```

**四件事分工回顾**: Calflow 记"现在" / Claude 翻译"意义" / **GitHub 存"历史"** (← 本 spec) / lifeflow 讲"故事" (L4)

---

## 组件清单 (5 个)

### C1 · GitHub private repo

- 名字: `lifeflow` (用户 account 下)
- Visibility: **private**
- 初始化时**不**自动 README / gitignore / LICENSE (repo 要空, 等我们 push 现有 8 个 commit)
- 默认分支: `master` (沿用本地现有)

### C2 · (DEPRECATED 2026-04-21) Fine-grained PAT

原设计: `lifeflow-mcp-write`, 90 天, 仅 lifeflow repo, Contents R+W, 存 iOS Connectors。

**已废弃**。Rube/Composio 接管了 GitHub 写权限, PAT 失去 consumer。**已删除** (见 UPDATE 2026-04-21 段)。

若未来需要 fallback(Rube 停服 / 改走 Claude Code CLI write): 按原描述重建 PAT 即可, 5 min。

### C3 · 本地 git remote + 首次 push

- `git remote add origin git@github.com:<you>/lifeflow.git` (SSH, 用现有 `~/.ssh/id_rsa` 或 `id_ecdsa`)
- `git push -u origin master`
- 前提: 对应 SSH 公钥已添加到 GitHub account (**[未验证] gate**)

### C4 · Cloudflare Pages

- CF account 里 Pages → **Connect to Git** → 授权 GitHub 访问 lifeflow repo
- Build settings:
  - Framework preset: **None** (纯静态)
  - Build command: (空)
  - Build output directory: `/` (repo 根)
  - Root directory: `/`
- Custom domain: `flow.wu-happy.com` → 自动发 CNAME, 需 wu-happy.com DNS 在 CF 管理
- HTTPS: 自动 (Let's Encrypt)

### C5 · (UPDATED 2026-04-21) claude.ai Custom Connector via Rube (Composio)

**平台**: claude.ai web (desktop). iOS 对等性 [未验证]。

**连接方式**: Settings → Connectors → **Custom** → Rube MCP 端点 → Composio OAuth 授权 → 选允许 `lifeflow` repo

**调用**: Rube 提供 `GITHUB_*` tool_slug (如 `GITHUB_GET_REPOSITORY_CONTENT`, `GITHUB_COMMIT_MULTIPLE_FILES`)。Claude 通过 `COMPOSIO_SEARCH_TOOLS` 先查 schema, 再 `COMPOSIO_MULTI_EXECUTE_TOOL` 跑。比官方 MCP 多一步, 但免去自部署。

**验证测试**: read `/` 目录 → write `rube-mcp-write-test.md` → delete 同文件。三步全通 (2026-04-21)。

---

## 3 个硬 gate (实施前必须清零)

### Gate 1 · wu-happy.com 域名所有权 + DNS 在 Cloudflare

[未验证] 用户选了 flow.wu-happy.com, 但未确认:
- 域名是否已注册到用户名下?
- DNS 是否已托管到 Cloudflare?

如果任一为否, 实施计划需插入"域名注册 / DNS 迁移"步骤 (~20 min 额外 + 可能费用)。

**验证方式**: 用户去 dash.cloudflare.com 看 Websites 列表里有没有 wu-happy.com。

### Gate 2 · iOS claude.ai GitHub MCP 支持 write 操作

[较确定 支持] 用户确认 iOS claude.ai 支持 GitHub MCP (Gate 2 from L2). 但没具体验证 PUT/write 动作是否能跑 — 可能只支持 read。

**验证方式**: L3 实施完 C2 后, 在 iOS claude.ai 里让 Claude 创建一个 test file 到 repo (e.g., `echo-test.md`) 验证 write 链路。通过后删 test file。

### Gate 3 · SSH key 已加到 GitHub

[未验证] `~/.ssh/id_rsa.pub` 或 `id_ecdsa.pub` 是否已在 github.com/settings/keys 登记?

**验证方式**: `ssh -T git@github.com`, 看是否认证成功 (成功会说 `Hi <username>! You've successfully authenticated...`).

若未登记, 需用户去 settings/keys 粘贴公钥 (或改走 HTTPS + token, 多一层配置)。

---

## Repo 内容清单 (首次 push)

推到 `<you>/lifeflow` master 的 8 个 commit 全带上, 对应文件:
```
.gitignore
Breath.html                                       ← L4 会改
data.json                                         ← Claude 每日写这个
prompts/l2-calflow-to-lifeflow.md
scripts/__init__.py
scripts/validate_data.py
tests/__init__.py
tests/test_validate_data.py
docs/l2-usage.md
docs/superpowers/specs/2026-04-20-l2-*-design.md
docs/superpowers/specs/2026-04-20-l3-*-design.md  (本 spec)
docs/superpowers/plans/2026-04-20-l2-*.md
```

**注意**: `Breath.html` 和 `data.json` 以前 untracked (L4 scope). L3 首次 push 时**加入 repo**, 因为 Pages 要 serve 它们。L4 只改内容, 不改存在性。

---

## 日常运行 E2E (L3 实施后)

```
22:00 · 用户打开 iOS claude.ai, 新开对话
22:01 · 粘 L2 prompt (from prompts/l2-calflow-to-lifeflow.md), 替换 <TODAY>
22:02 · 回合 1: Claude 列清单, 用户确认
22:03 · 回合 2: 协商三规则
22:04 · 回合 3: Claude 输出 data.json + 立即经 Rube 写 repo
        Claude 的收尾动作 (updated 2026-04-21):
          1. COMPOSIO_SEARCH_TOOLS → 查 GITHUB_COMMIT_MULTIPLE_FILES schema
          2. COMPOSIO_MULTI_EXECUTE_TOOL:
               tool: GITHUB_COMMIT_MULTIPLE_FILES
               upserts: [{ path: 'data.json', content: <new data.json> }]
               message: 'data: daily sync 2026-04-21'
               branch: 'master'
22:04:30 · Cloudflare Pages 收到 push webhook, 开始构建
22:05 · 构建完成 (纯静态, <30 秒)
22:05:10 · flow.wu-happy.com 已是最新
<任意> · 用户在任何浏览器访问 flow.wu-happy.com, F5 刷新
```

---

## 错误处理

- **MCP 写失败 (network / 401 / 403)**: Claude 降级为 "输出 data.json in code block, 请用户手动 copy + push" — 即退回 L2 MVP 模式
- **PAT 过期**: 90 天后 MCP 调用返回 401 → 用户重新生成 PAT, 更新 claude.ai Connectors
- **CF Pages 构建失败**: 几乎不可能 (无构建步骤). 若发生, CF 会邮件通知
- **repo 到 Pages 的 webhook 失效**: CF dashboard 手动 "Retry deployment"
- **data.json JSON 损坏**: Pages 仍 deploy 成功, 但 Breath.html 前端 fetch 会报错并显示 `.err` div. 需要用户手动回滚 (`git revert` + push) 或 Claude 再跑一轮

---

## 测试路径 (post 实施)

**Gate 连通性测试** (按顺序):

1. `ssh -T git@github.com` → 认证成功 (Gate 3)
2. `cd ~/lifeflow && git push -u origin master` → 推送成功, GitHub 能看到 repo 内容
3. Cloudflare Pages 里看到部署记录, flow.wu-happy.com 解析并加载 Breath.html (Gate 1)
4. iOS claude.ai 对话: "帮我在 lifeflow repo 读 data.json" → Claude 成功 MCP read
5. iOS claude.ai 对话: "在 lifeflow repo 根目录创建一个 test.md 文件, 内容 hello" → Claude 成功 MCP write (Gate 2)
6. 验证后, Claude 删掉 test.md
7. 走一次完整 L2+L3 真实流程: 跑步 → Calflow → Claude 协商 → MCP 写 → 30s 后 flow.wu-happy.com 显示新数据

**通过标准**: 步骤 1-7 全绿 = L3 landed。

---

## 本 Spec 未涵盖 (L4)

- **Breath.html "刷新数据"按钮**: 按钮 UX + 点击行为 (deep link / 剪贴板 / 提醒) — L4 spec
- **"上次同步时间"显示**: 网页顶部显示 `updated_at`, L4 顺手加
- **多端状态同步**: 如需 iPad/Mac 同时开多 claude.ai 对话的冲突处理 — 暂不考虑, 一天跑一次就不冲突

---

## 开放问题 (用户 review 时决定)

1. **GitHub username** 是什么? 决定 repo URL 格式。[未获取]
2. **SSH 还是 HTTPS + token**? 我倾向 SSH (公钥方式更稳), 但需要 Gate 3 先过。若 Gate 3 不过, fallback HTTPS + PAT (但那会和 MCP 用的 PAT 冲突, 需建两个 token)
3. **CF Pages 项目名称**? 默认用 `lifeflow` (和 repo 同名), 生成 `lifeflow-<hash>.pages.dev` 作为默认子域。同意吗?
4. **PAT 过期后的 rotation 流程** 现在写入 spec 还是等第一次过期再说? 建议: 现在先在 docs/ 里留一条 rotation 提醒, 90 天后自动提醒。
