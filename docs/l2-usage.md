# L2 使用指南 · 每日数据翻译

对应 spec: `docs/superpowers/specs/2026-04-20-l2-claude-translation-layer-design.md`

## 每日 3 分钟流程

1. **打开 iOS claude.ai app**, 新开对话
2. 打开 `prompts/l2-calflow-to-lifeflow.md` (GitHub 网页 / 手机扫一眼都行), 复制 `===START===` 到 `===END===` 之间的全部内容
3. 替换 `<TODAY>` 为今天日期 (`YYYY-MM-DD`), 粘贴发送
4. Claude 会回 **回合 1**: 列出今日读到的 task + event 清单 → 确认清单后回复 "清单 OK, 进回合 2"
5. **回合 2**: Claude 逐条提议三映射规则的默认值, 你批准或改 — 走完 7 个 project 的协商
6. **回合 3**: Claude 输出完整 `data.json` in code block

## 校验 + 落地 (10 秒)

```bash
# 1. 从 Claude 对话复制 JSON block 内容, 保存到临时文件
nano /tmp/data-new.json   # 粘贴, 存盘, 退出

# 2. 结构校验
cd ~/lifeflow
python3 scripts/validate_data.py /tmp/data-new.json
```

- 输出 `OK` → 可以落地
- 输出 `ERROR: ...` → 把错误贴回 Claude 对话让它修正, 重新走回合 3

```bash
# 3. 落地
cp /tmp/data-new.json ~/lifeflow/data.json

# 4. 本地预览 (必须 http 协议, file:// 会 CORS)
cd ~/lifeflow && python3 -m http.server 8000 &
# 浏览器打开 http://localhost:8000/Breath.html
```

## 故障排查

| 症状 | 原因 | 修复 |
|---|---|---|
| Claude 说读不到 EventKit | iOS claude.ai 没拿到 Reminders/Calendar 权限 | iOS Settings → Claude → Reminders/Calendar = On |
| `validate` 报 `missing projects` | Claude 漏了某个 project_id | 要求 Claude 补齐 7 项完整列表 |
| `validate` 报 `today.entries[N] missing` | Claude 输出的 entry 缺字段 | 让 Claude 参照 spec 补完整字段后重发 |
| Breath.html 没更新 | 浏览器缓存 | hard refresh (Ctrl+Shift+R / Cmd+Shift+R) |
| JSON 解析失败 | 复制时把 markdown fence 也复进来了 | 只保留 `{ ... }` 内部, 去掉 triple-backtick 行 |

## 未实现 (等后续 session)

- **L3 自动推送**: 现在是手动 `cp data-new.json data.json`; L3 接入后 Claude 通过 GitHub MCP 直接写 repo
- **L4 网页刷新按钮**: 现在要手动 F5; L4 会在 Breath.html 加一个 "刷新" 按钮和"上次同步时间"显示
