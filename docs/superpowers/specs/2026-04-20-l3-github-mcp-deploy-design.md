# L3 · GitHub MCP 推送 + Cloudflare Pages 部署

**Status**: Draft (pending user review)
**Date**: 2026-04-20
**Session origin**: L3 brainstorming (post L2 完成)
**Scope**: L3 only — GitHub 基础设施 + CF Pages + iOS claude.ai MCP 配置。L4 (网页刷新按钮) 另起 spec。

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

### C2 · Fine-grained PAT

- Name: `lifeflow-mcp-write`
- Expiration: 90 天 (合理 rotation 周期)
- Repository access: **Only select repositories** → `lifeflow`
- Permissions: `Contents: Read and write` (其他全 None)
- 存储位置: iOS claude.ai Connectors 里的 GitHub MCP token 字段

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

### C5 · iOS claude.ai Connectors

- Settings → Connectors → GitHub
- 填 Fine-grained PAT (C2 产物)
- 测试: 让 Claude 读一次 `lifeflow/data.json`, 验证 MCP 连通

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
22:04 · 回合 3: Claude 输出 data.json + 立即 MCP 写 repo
        Claude 的收尾动作是:
          call github.put_contents({
            path: 'data.json',
            content: <base64-encoded data.json>,
            message: 'data: daily sync 2026-04-20',
            branch: 'master'
          })
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
