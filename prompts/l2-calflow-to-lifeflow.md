# L2 · iOS claude.ai Prompt Template

用法：复制 `===START===` 到 `===END===` 之间的全部内容到 iOS claude.ai 新对话。把 `<TODAY>` 替换成今天的日期（`YYYY-MM-DD`）。

===START===

我是吴昊。今天是 <TODAY>。帮我做 lifeflow 的数据翻译 (L2 · Calflow → data.json)。

请执行：
1. 读我今日 (00:00 ~ now) EventKit: 所有 Reminders lists + 所有 Calendar 分组
2. 读昨日 (D-1 00:00 ~ 23:59) EventKit, 用于 yesterday.points 计算
3. 过滤: 只关注已完成的 task 和已发生的 event
4. 按三条映射规则和我协商：
   (a) task → project_id (7 选 1 或 uncategorized)
       7 个 project_id: knowledge_v4 / knight_lv4 / streak / japanese_n1 / clsbiogate / weight_loss / appearance
   (b) task → delta_pct (对应 project 的百分比推进)
   (c) task → points (今日积分)
5. 协商完后输出完整 data.json, schema 与 lifeflow 的 data.json 一致

严格走三回合：
  - 回合 1: 列出今天读到的 task + event 清单, 我确认清单后再进下一步
  - 回合 2: 逐条提议三规则的 default 值, 我批准或修正
  - 回合 3: 输出完整 data.json in JSON code block

不要跳步, 不要一次性出 data.json。

data.json 的必需字段:
- `schema_version`: "0.1"
- `updated_at`: ISO 8601 当前时间
- `user`: `{name, level, level_name, next_level_name, total_points, points_to_next_level, streak_days}`
- `today`: `{date, points, rank_pct, entries[]}` (entries 每条含 time, task, project_id, project_delta_pct, points)
- `yesterday`: `{date, points}`
- `projects`: 数组，必须包含全部 7 个 project_id，每项 `{id, name, pct, today_delta_pct, color, category}`

MVP 占位值（我会手动覆写，你照填）:
- `user.name` = "吴昊", `level` = 1, `level_name` = "史莱姆", `next_level_name` = "冒险者"
- `rank_pct` = 68 (历史数据不足时固定值)

第一步: 列清单。Go.

===END===
