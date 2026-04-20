# L2 · Claude AI 翻译层 — Calflow → lifeflow data.json

**Status**: Draft (pending user review)
**Date**: 2026-04-20
**Session origin**: lifeflow 架构 brainstorming (post-pivot)
**Scope**: L2 only

---

## 四件事的分工 (架构一页图)

```
Calflow 记录 "现在"
    ↓ EventKit / iCloud

iOS claude.ai 翻译 "意义"   ← ← ← 本 spec = L2
    ↓ data.json

GitHub 存 "历史"             (L3 · 另起 spec)
    ↓

lifeflow Breath.html 讲 "故事"  (L4 · 另起 spec)
```

四件事各司其职，零角色重叠。

---

## 输入契约

Claude 通过 iOS claude.ai app 直接访问 EventKit（已验证 [确定]），读取：

- **今日 Reminders**（所有 list，含 Calflow 的分组）
  字段: `title`, `due_date`, `completion_date`, `is_completed`, `notes`, `list_name`
- **今日 Calendar events**（所有日历分组）
  字段: `title`, `start`, `end`, `calendar_name`, `notes`
- **昨日 Reminders + Events**（同上，用于对比 yesterday.points）

Claude 自己按日期过滤，无需用户输入。

---

## 输出契约

一份 JSON，schema 与 `~/lifeflow/data.json` 完全一致。关键字段：

```json
{
  "schema_version": "0.1",
  "updated_at": "<ISO 8601, 当前时间>",
  "user": { "name": "...", "level": N, "level_name": "...", "total_points": N, ... },
  "today": {
    "date": "YYYY-MM-DD",
    "points": N,                 // 规则 3 累加
    "rank_pct": N,               // 与过往对比（MVP 暂用固定值 68 / TODO）
    "entries": [
      { "time": "HH:MM", "task": "...", "project_id": "...", "project_delta_pct": N, "points": N }
    ]
  },
  "yesterday": { "date": "YYYY-MM-DD", "points": N },
  "projects": [ /* 7 项长期目标, 带 pct / today_delta_pct / color / category */ ]
}
```

**MVP 简化**：
- `rank_pct`：没有历史天数据时暂固定或 TODO
- `user.total_points`: 累加所有历史日的 points（L3 接入前 Claude 可要求用户提供历史数据或 placeholder）
- `user.level` / `user.level_name`: 固定 "史莱姆/Lv1"，跟 `/home/wuhao/lifeflow/data.json` 当前值

---

## 三条映射规则

Claude 每次对话和用户协商以下三条。规则每天可变（不固化成代码），目标协商耗时 < 30 秒/天。

### 规则 1 · task → project_id

将 EventKit 里的 task 文本映射到 lifeflow 的 7 个 project_id：
`knowledge_v4 / knight_lv4 / streak / japanese_n1 / clsbiogate / weight_loss / appearance`

**交互**: Claude 列出今日 task 清单，对每条提议一个 project_id，用户批准/修正。

**边界**:
- 无明显归属 → Claude 标 `uncategorized`，用户决定 (扔掉 / 新建 project)
- 一个 task 跨多个 project (如 "读论文 + 写代码") → 拆成两条 entry

### 规则 2 · task → delta_pct

将 task 的完成度折算成对 project 的进度推进百分比。

**Claude 启发式默认**（用户每条可覆写）:
| task 类型 | default delta |
|---|---|
| 跑步 30min | weight_loss +2% |
| 读 1 篇论文 | clsbiogate +1% |
| 背 50 词 | japanese_n1 +0.5% |
| 打卡类 / 轻量 | 对应 project +0% |

**边界**:
- 累计 pct ≥ 100% → Claude 提示 "项目已完成, 是否关掉?"
- delta < 0.1% → 归一到 0，entry 仍保留但 today_delta_pct=0

### 规则 3 · task → points

将 task 折算成今日积分。

**Claude 启发式默认**:
| task 类型 | default points |
|---|---|
| 30min 专注 task | 50 |
| 轻量 (<15min) | 20-30 |
| 深度 (>1h) | 80-100 |
| 空完成 (勾了没动) | 0 |

**连带规则**: `streak_days` 只看 "今日 points > 0" 作为连续打卡判断。

---

## Claude Prompt 模板

### First-turn prompt（用户起对话时粘贴）

```
我是吴昊。今天是 <YYYY-MM-DD>。帮我做 lifeflow 的数据翻译 (L2)。

请执行：
1. 读我今日 (00:00 ~ now) EventKit: 所有 Reminders lists + 所有 Calendar 分组
2. 读昨日 (D-1 00:00 ~ 23:59) EventKit, 用于 yesterday.points 计算
3. 过滤: 只关注已完成的 task 和已发生的 event
4. 按三条映射规则和我协商：
   (a) task → project_id (7 选 1 或 uncategorized)
   (b) task → delta_pct
   (c) task → points
5. 协商完输出一份完整 data.json (schema 和我 repo 里的 /data.json 一致)

第一步: 列出你今天读到的 task + event 清单, 我确认清单后再进规则协商。
不要跳步, 不要一次出 data.json, 严格走 "列清单 → 协商规则 → 出 JSON" 三段。
```

### 协商流程约束

Claude 必须分三个回合执行，不能一次出 data.json：

1. **回合 1**: 列清单 → 用户确认 / 补漏
2. **回合 2**: 逐条提议三规则 → 用户批准 / 修正
3. **回合 3**: 输出完整 data.json in code block

---

## 交付物形态 (MVP)

Claude 在回合 3 输出一整段 `data.json` 作为 code block，用户手动复制。

**MVP 期间**: 用户复制 → 覆盖本地 `~/lifeflow/data.json` → 浏览器刷新 Breath.html 看效果。

**L3 升级后**: Claude 直接调 GitHub MCP 写 repo，用户免复制。本 spec 不涵盖。

---

## 错误处理

- **EventKit 无权限**: Claude 提示用户去 iOS 设置里给 claude.ai app 授权 Reminders + Calendar
- **Yesterday EventKit 为空**: Claude 设 `yesterday.points = today.points`, Breath.html 的对比 chip 显示"持平"
- **映射冲突** (用户对同类 task 给不一致答案): Claude 明示冲突，请用户决断一次
- **空日** (今天零完成): 输出 data.json with `today.points=0, entries=[]`，不拒绝
- **超过 7 个 project 出现新的 project_id**: Claude 提议 "新增第 8 项长期目标" 或 "归入 uncategorized", 用户选

---

## 测试路径

**手动冒烟测试**（本 session 后, L2 实际跑起来时验证）:

1. 在 Calflow 建 3-5 条 Reminders, 勾完其中 2-3 条 (模拟典型一天)
2. 在 iOS claude.ai 新开对话, 粘贴 first-turn prompt
3. 验证 Claude 列出的 task 清单 ✅ 和 EventKit 里一致
4. 协商三规则
5. 回合 3 的 data.json 复制覆盖 `~/lifeflow/data.json`
6. 浏览器开 Breath.html (via `python3 -m http.server 8000`), 刷新, 看：
   - today.points 正确累加
   - entries 显示用户协商后的 project_id 映射
   - projects 区域 today_delta_pct 反映
   - 无 JS console error

**通过标准**:
- EventKit 读取完整度 ≥ 95% (人眼比对)
- data.json schema 合法 (被 Breath.html 渲染, 无 JS 错)
- 三回合协商耗时 < 3 min (日常可接受)

---

## 本 Spec 未涵盖 (各自另起)

- **L3 GitHub 推送**: Claude 经 GitHub MCP 写 repo/data.json。依赖: lifeflow 已上 GitHub + Cloudflare Pages
- **L4 Web 刷新按钮**: Breath.html 加按钮。依赖 L3 的触发机制
- **原生 Timer 倒计时补丁 (原 Step 1-5)**: 用户本 session 主动放弃

---

## 开放问题（待用户 review 时确认）

1. 三条映射规则的 **default 启发式**（表格里的数字）和你心中期望一致吗？还是只是"Claude 自己猜一个, 我都会修"？
2. MVP 期间的 `user.total_points` / `user.level` 怎么来？当前设定是：沿用 `~/lifeflow/data.json` 里的固定值（240/Lv1），每次 Claude 从 today.points 往上加。真实 total 需要历史数据，L3 接入后由 GitHub 上的 repo 计算。
3. `rank_pct` (超过过往百分比) 无历史天数据时怎么办？当前设定：固定 68 作为占位。历史足够 (L3 接入后) 再改成真实计算。
