# LifeFlow

个人每日积分 / 专注流 / 长期目标追踪系统。HTML + Vanilla JS + JSON，静态部署。

## 架构

**三文件静态前端 + 两份 JSON 数据源**，无后端、无构建步骤。

```
lifeflow/
├── index.html      # 入口 · 两个视觉方向（Breath / Editor）的选择落地页
├── Breath.html     # 主视图 · 暖纸色 · 日常使用 · 当前主力
├── Editor.html     # 备选视图 · 冷中性 · 编辑器风
├── config.json     # 单一真相源 (SSOT) · 等级 / 积分规则 / 专注池 / Notion 路由
├── data.json       # L2 刷新 · 今日数据 / 昨日 / 历史积分 / 项目状态
└── README.md
```

## 数据流

```
Claude (对话中) ──┬─→ 读 config.json (规则)
                 └─→ 写 data.json (每日刷新)
                         │
                         ↓
                  GitHub (hbhggh/lifeflow)
                         │
                         ↓  Cloudflare Pages 自动构建
                         ↓
                  静态站点 (浏览器直接 fetch data.json)
```

- **config.json** = 配置。改动需要同步更新 `memory#12`。
- **data.json** = 每天由 Claude 根据对话流水重算覆写。
- **前端** = 纯渲染层。打开页面 → fetch `./data.json` + `./config.json` → 渲染。

## 核心功能 (Breath.html)

| 区块 | 职责 |
|---|---|
| Hero (今日积分) | 大数字 + 累计分括号 + 比昨日 delta chip + 右侧"昨日对比 + 最近 7 天柱图 + 历史排名百分位" |
| Focus Timer 浮窗 | 正/倒计时 · 清晰度 0-100 四档 · 挂 project · 结束后生成 entry |
| Focus Bar (时间池热力条) | 09:30-18:00 池 · 每个 session 为彩色 seg · 清晰度映射颜色 |
| 今日明细 | entries 列表 · 倒序 · 可折叠 (localStorage 持久化) |
| 长期目标 | projects 进度 · 可折叠 (localStorage 持久化) |

## 设计系统

- **配色**：暖纸色 (#f7f6f3) · 墨黑文字 · 低饱和正负色 (绿 #0e7a59 / 橙 #c45a2a)
- **字体**：系统 sans + JetBrains Mono (数字/等宽)
- **dark mode**：`prefers-color-scheme` 自动切换 · 深靛墨底
- **克制**：避免玻璃拟态、渐变、emoji 装饰。线条 hairline + 留白主导。

## 部署 (Cloudflare Pages)

1. GitHub 仓库 `hbhggh/lifeflow` 作为源
2. Cloudflare Pages 连接该仓库
3. **Build command**: 留空 (纯静态)
4. **Build output**: `/`
5. **Custom domain**: 可选

每次 push 到 master → 自动重新发布。

## Claude 如何维护这个项目

- 每天对话流水结束 → Claude 重算 `data.json` → 经 MCP (Composio / Rube) commit 到仓库 → CF 自动刷新
- 改规则 (等级阈值 / 积分单价 / 专注池时段) → 改 `config.json` + 同步 `memory#12`
- 改前端视觉 / 交互 → 改 `Breath.html`，单文件自包含 (CSS/JS 内联)

详见 `HANDOFF.md`。
