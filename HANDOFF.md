# HANDOFF · LifeFlow → Claude Web

给接手的 Claude 的完整上下文。读完这份 + `README.md` + 三个 HTML 文件前 200 行，就能独立维护。

---

## 1. 项目定位

吴昊的个人**每日积分驱动型 life tracker**，哲学上接近 RPG 经验值 + 番茄钟 + Notion 知识库索引。

- **不是 todo 应用**：没有"完成/未完成"概念，只有"发生了就算分"。
- **不是时间追踪**：专注时段是辅助维度，核心是积分。
- **单人使用**：吴昊自用，不做多账户、权限、分享。

---

## 2. 两份 JSON 的职责分工

### `config.json` — SSOT 配置
- **不每日刷新**。改动频率：周/月级。
- 包含：等级阶梯、积分规则单价、专注池默认时段、清晰度分档颜色、Notion 数据库 ID 路由。
- **Claude 改动约束**：任何阈值变动必须同步 `memory#12`（全局 memory），两处一致。

### `data.json` — L2 每日数据
- **每天至少一次**由 Claude 根据对话流水重算后整体覆写。
- 字段：
  - `user` — 当前总分 / level / streak（源头是 `memory#3`）
  - `today` — date / points / entries[]（每条流水：time, task, project_id, points）
  - `yesterday` — 对比基准
  - `history_points` — 过去 N 天每日总积分数组（升序，最后一项=昨天）
  - `projects` — 长期目标列表（含 visible 开关、进度百分比、色值）

---

## 3. Breath.html 代码地图

单文件 ~3000 行，分三段：

| 行区间 | 内容 |
|---|---|
| 1–800 | `<style>` · CSS 变量 + 所有组件样式 |
| 800–1600 | Focus Timer 浮窗 HTML + JS（独立模块） |
| 1600–1850 | `render(data)` 主渲染函数（Hero / Focus Bar / Entries / Projects 全在这里） |
| 1850–2200 | 各类辅助 render 函数 + 折叠绑定 + 状态持久化 |
| 2200–3038 | Focus Bar 时间池绘制 + session 持久化 + 入口 fetch |

### 关键 ID / class
- `#main` — 根挂载点
- `#entries-section` + `#entries-list` — 今日明细（可折叠）
- `#projects-section` + `#projects-list` — 长期目标（可折叠）
- `.focus-track` — 时间池柱条（高 32px）
- `.bins` — 右侧最近 7 天历史柱图（每根 `.bar`，今天加 `.today` class）

### localStorage keys
- `lifeflow_entries_collapsed` — 今日明细折叠状态
- `lifeflow_projects_collapsed` — 长期目标折叠状态
- `lifeflow_focus_session` — 进行中的专注计时状态（页面刷新恢复）

---

## 4. 已固化的设计决策（不要擅自翻）

这些是用户经过多轮迭代确认的，改前必须征询：

1. **Hero 区不要 state demo 彩条** — 曾经有过"↑比昨日多30 ↓比昨日少10"的示例条，已删。
2. **累计积分合并到今日积分**：格式 `350 分 (累计 2,910)`，不要独立 stats 块。
3. **历史排名 caption 只显示日差值** — 不显示"基于 N 天样本"。文案固定为 `比昨日 ↑ +X 个百分点`。
4. **最近 7 天柱图**：含今天（最右），今天深色 `var(--text)`，前 6 天浅灰 `var(--track)`。柱上显示积分、柱下显示 M/D 日期。
5. **今日明细倒序** — 最新 entry 在顶部。
6. **Focus Bar 柱条高度 32px** — 曾 18px，加粗后不要退回。
7. **暖纸色基调** — Breath.html 已定，不要改回 Editor 的冷中性。
8. **避免 AI slop**：不要加 emoji 装饰、渐变背景、玻璃拟态、左 border accent 卡片、SVG 画的插图。

---

## 5. 常见改动入口

### 新增一条今日流水
改 `data.json` → `today.entries[]` 追加：
```json
{ "time": "14:30", "task": "读论文 30min", "project_id": "papers", "points": 50, "project_delta_pct": 0.8 }
```
同步更新 `today.points` 总分。

### 调等级阈值
改 `config.json` → `levels[]` → 同步 `memory#12`。

### 新增项目
`data.json` → `projects[]` 加：
```json
{ "id": "newproj", "name": "新目标", "color": "#4a7", "pct": 0, "visible": true, ... }
```

### 改专注池默认时段
`config.json` → `focus_pool.start/end`。

---

## 6. 部署链路（Cloudflare Pages + Pages Functions）

两条写入 `data.json` 的链路**并存**，靠 GitHub Contents API 的 `sha` 乐观锁解决并发：

```
【主通道 · claude.ai 对话】
Claude (MCP: Composio Rube)
  └─ github_create_or_update_file(repo=hbhggh/lifeflow, path=data.json, content=...)
        │
【辅通道 · 浏览器直 push (finishRun 自动)】
flow.wu-happy.com 前端
  └─ POST /api/session  { sessions, entries }
        ↓
  CF Zero Trust Access  (Policy on /api/* → email = 吴昊 Gmail)
        ↓
  CF Pages Function  (functions/api/session.js)
        ├─ GET contents/data.json  (带 sha)
        ├─ 按 id 去重 merge → 重算 today.points → stringify
        └─ PUT with sha  (409 则 refetch + retry，最多 3 次)
        │
        ↓ 两条通道的终点同样是 master / data.json
  Cloudflare Pages build (静态 + Functions)
        ↓
  https://flow.wu-happy.com/  (静态页 public；/api/* 被 Access 挡住)
```

- 静态资源无 build command，直接 publish 根目录；Pages 自动识别 `functions/` 目录下的 Worker。
- Secrets (CF Pages → Settings → Environment variables)：
  - `GITHUB_TOKEN` (Secret, 必须) — fine-grained PAT, scope: Repository=`hbhggh/lifeflow`, Permissions=`Contents: Read & Write`
  - `GITHUB_REPO` (plain, 可选) — 默认 `hbhggh/lifeflow`
  - `GITHUB_BRANCH` (plain, 可选) — 默认 `master`
- Access (CF Zero Trust → Access → Applications)：
  - Type: Self-hosted, Domain: `flow.wu-happy.com`, Path: `/api/*`
  - Policy: Include → Emails → 你的 Gmail
- 前端同源 `fetch('./data.json')` + `fetch('./config.json')`，同源静态文件。
- 缓存：data.json 变化频率高，可给 URL 加 `?t=<ts>` 破 CF 边缘缓存。

---

## 7. MCP 工具惯例

- 读仓库内容：`GITHUB_GET_REPOSITORY_CONTENT` owner=`hbhggh` repo=`lifeflow` path=目标文件
- 写文件：`GITHUB_CREATE_OR_UPDATE_FILE` 同仓库，带 commit message
- commit message 约定：
  - `data: YYYY-MM-DD 日常刷新`
  - `config: 调整 XXX`
  - `ui: <简述>` — 前端改动
  - `fix: <简述>`

---

## 8. 下一步 roadmap（非必做，供参考）

- [x] ✅ Focus Timer 环形化 — FAB idle 56px pill → running 112×112 圆环进度浮窗（中心 MM:SS + 底部 ⏸/⏹，颜色跟 clarity_tiers，spring 过渡）。新增 `state.paused/pausedAt/totalPausedSec` + `pauseRun/resumeRun`，`elapsedSec()` 自动扣除暂停时长。stopwatch 进度圈默认每 25 分钟一圈，可由 `config.focus_timer.stopwatch_loop_sec` 覆盖。
- [x] ✅ Focus Timer 结束后自动回写 data.json — `functions/api/session.js` + 前端 `SyncClient` outbox + `POST /api/session`，finishRun → 自动 merge 入 master/data.json（由 CF Access 挡在 /api/*，PAT 作 CF secret，浏览器不存凭据）。断网/失败保留 outbox，下次或手动点 topbar `● 已同步` chip 重试。
- [ ] 给 data.json 加版本号字段防止并发覆写（SyncClient 已用 GitHub sha，但仍可追加应用层 `schema_version` 检查）
- [ ] history_points 携带日期戳（当前是纯数字数组，前端靠 today.date 倒推，不够健壮）
- [ ] 移动端触屏手势优化（当前 Focus Timer 浮窗在小屏偏大）

---

## 9. 联系 / 权限

- GitHub 仓库：`hbhggh/lifeflow`（吴昊个人）
- 对话入口：Claude Web + Rube MCP
- 设计原则：低饱和、克制、等宽字表达数字、数据说话
