# L2 Claude Translation Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship MVP artifacts for the L2 translation layer so user can run the daily Calflow → data.json pipeline via iOS claude.ai starting tomorrow.

**Architecture:** L2 is not a running service — no cron, no daemon, no webhook. Three artifacts only:
(a) a **prompt template** the user pastes into iOS claude.ai at the start of each daily translation conversation;
(b) a **Python structural validator** that confirms Claude's output data.json is well-formed before replacing the live file;
(c) a **usage guide** documenting the daily manual flow.

User's daily loop: paste prompt → negotiate 3 rules with Claude → copy JSON → `validate_data.py` → replace `~/lifeflow/data.json` → browser refresh.

**Tech Stack:** Markdown (prompt + docs), Python 3 stdlib only (validator — zero external deps to keep install friction at zero), pytest (unit tests).

**File layout after this plan:**
```
~/lifeflow/
├── Breath.html (existing)
├── data.json (existing)
├── prompts/
│   └── l2-calflow-to-lifeflow.md      (Task 1)
├── scripts/
│   ├── __init__.py                    (Task 2)
│   └── validate_data.py               (Task 3 + 4 + 5)
├── tests/
│   ├── __init__.py                    (Task 2)
│   └── test_validate_data.py          (Task 3 + 4)
└── docs/
    ├── superpowers/specs/...          (existing)
    ├── superpowers/plans/...          (this file)
    └── l2-usage.md                    (Task 6)
```

---

### Task 1: Create L2 prompt template

**Files:**
- Create: `prompts/l2-calflow-to-lifeflow.md`

- [ ] **Step 1: Create prompts dir and file**

```bash
mkdir -p ~/lifeflow/prompts
```

Then write `~/lifeflow/prompts/l2-calflow-to-lifeflow.md` with the following exact content:

````markdown
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
````

- [ ] **Step 2: Sanity check file**

Run:
```bash
wc -l ~/lifeflow/prompts/l2-calflow-to-lifeflow.md
```

Expected: at least 30 lines.

- [ ] **Step 3: Commit**

```bash
cd ~/lifeflow
git add prompts/
git commit -m "feat: add L2 Claude prompt template for daily translation"
```

---

### Task 2: Scaffold test + source package layout

**Files:**
- Create: `tests/__init__.py`
- Create: `scripts/__init__.py`

- [ ] **Step 1: Create directories and empty __init__.py files**

```bash
mkdir -p ~/lifeflow/tests ~/lifeflow/scripts
touch ~/lifeflow/tests/__init__.py ~/lifeflow/scripts/__init__.py
```

- [ ] **Step 2: Verify layout**

```bash
ls -la ~/lifeflow/tests/ ~/lifeflow/scripts/
```

Expected: each dir contains `__init__.py` (can be empty).

- [ ] **Step 3: Verify pytest is available**

```bash
python3 -m pytest --version
```

Expected: prints version like `pytest 7.x.x`. If missing, install via `pip install pytest` or `conda install pytest`.

- [ ] **Step 4: Commit**

```bash
cd ~/lifeflow
git add tests/__init__.py scripts/__init__.py
git commit -m "chore: scaffold tests/ and scripts/ packages"
```

---

### Task 3: Write failing test for validator (TDD RED)

**Files:**
- Create: `tests/test_validate_data.py`

- [ ] **Step 1: Write test file**

Write `~/lifeflow/tests/test_validate_data.py`:

```python
"""Structural validation of data.json produced by L2."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from scripts.validate_data import validate  # noqa: E402


def _sample():
    return {
        'schema_version': '0.1',
        'updated_at': '2026-04-20T16:00:00+09:00',
        'user': {
            'name': '吴昊',
            'level': 1,
            'level_name': '史莱姆',
            'total_points': 240,
            'streak_days': 3,
        },
        'today': {
            'date': '2026-04-20',
            'points': 150,
            'entries': [
                {
                    'time': '09:30',
                    'task': '跑步',
                    'project_id': 'weight_loss',
                    'project_delta_pct': 2,
                    'points': 50,
                }
            ],
        },
        'yesterday': {'date': '2026-04-19', 'points': 120},
        'projects': [
            {
                'id': pid,
                'name': pid,
                'pct': 0,
                'today_delta_pct': 0,
                'color': '#000000',
                'category': 'misc',
            }
            for pid in [
                'knowledge_v4',
                'knight_lv4',
                'streak',
                'japanese_n1',
                'clsbiogate',
                'weight_loss',
                'appearance',
            ]
        ],
    }


def test_valid_sample_passes():
    assert validate(_sample()) == []


def test_missing_top_key_caught():
    data = _sample()
    del data['user']
    errors = validate(data)
    assert any('user' in e for e in errors), f'expected missing-user error, got {errors}'


def test_missing_project_id_caught():
    data = _sample()
    data['projects'] = data['projects'][:6]  # drop one
    errors = validate(data)
    assert any('missing projects' in e for e in errors), f'expected missing-projects error, got {errors}'


def test_malformed_entry_caught():
    data = _sample()
    data['today']['entries'] = [{'time': '09:30'}]
    errors = validate(data)
    assert any('entries[0]' in e for e in errors), f'expected entries[0] error, got {errors}'


def test_non_dict_root_caught():
    errors = validate('not a dict')
    assert len(errors) > 0
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd ~/lifeflow
python3 -m pytest tests/test_validate_data.py -v
```

Expected: all 5 tests FAIL with `ModuleNotFoundError: No module named 'scripts.validate_data'`.

---

### Task 4: Implement minimum validator to pass tests (TDD GREEN)

**Files:**
- Create: `scripts/validate_data.py`

- [ ] **Step 1: Write validator module**

Write `~/lifeflow/scripts/validate_data.py`:

```python
"""Structural validator for lifeflow data.json (L2 output check)."""

REQUIRED_TOP_KEYS = {
    'schema_version', 'updated_at', 'user', 'today', 'yesterday', 'projects'
}
REQUIRED_USER_KEYS = {'name', 'level', 'level_name', 'total_points', 'streak_days'}
REQUIRED_TODAY_KEYS = {'date', 'points', 'entries'}
REQUIRED_YESTERDAY_KEYS = {'date', 'points'}
REQUIRED_ENTRY_KEYS = {
    'time', 'task', 'project_id', 'project_delta_pct', 'points'
}
REQUIRED_PROJECT_KEYS = {
    'id', 'name', 'pct', 'today_delta_pct', 'color', 'category'
}
EXPECTED_PROJECT_IDS = {
    'knowledge_v4', 'knight_lv4', 'streak', 'japanese_n1',
    'clsbiogate', 'weight_loss', 'appearance',
}


def validate(data):
    """Return a list of error strings. Empty list means valid."""
    errors = []
    if not isinstance(data, dict):
        return ['root: not a dict']

    missing_top = REQUIRED_TOP_KEYS - set(data.keys())
    if missing_top:
        errors.append(f'root missing keys: {sorted(missing_top)}')

    if isinstance(data.get('user'), dict):
        errors.extend(_missing(data['user'], REQUIRED_USER_KEYS, 'user'))

    today = data.get('today')
    if isinstance(today, dict):
        errors.extend(_missing(today, REQUIRED_TODAY_KEYS, 'today'))
        entries = today.get('entries')
        if isinstance(entries, list):
            for i, entry in enumerate(entries):
                errors.extend(_missing(entry, REQUIRED_ENTRY_KEYS, f'today.entries[{i}]'))

    if isinstance(data.get('yesterday'), dict):
        errors.extend(_missing(data['yesterday'], REQUIRED_YESTERDAY_KEYS, 'yesterday'))

    projects = data.get('projects')
    if projects is not None:
        if not isinstance(projects, list):
            errors.append('projects: not a list')
        else:
            found_ids = set()
            for i, p in enumerate(projects):
                errors.extend(_missing(p, REQUIRED_PROJECT_KEYS, f'projects[{i}]'))
                if isinstance(p, dict) and isinstance(p.get('id'), str):
                    found_ids.add(p['id'])
            missing_projects = EXPECTED_PROJECT_IDS - found_ids
            if missing_projects:
                errors.append(f'missing projects: {sorted(missing_projects)}')

    return errors


def _missing(obj, required, path):
    if not isinstance(obj, dict):
        return [f'{path}: not a dict']
    gap = required - set(obj.keys())
    if gap:
        return [f'{path} missing keys: {sorted(gap)}']
    return []
```

- [ ] **Step 2: Run tests and confirm they pass**

```bash
cd ~/lifeflow
python3 -m pytest tests/test_validate_data.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
cd ~/lifeflow
git add scripts/validate_data.py tests/test_validate_data.py
git commit -m "feat: add structural validator for L2 data.json output"
```

---

### Task 5: Add CLI entrypoint to validator

**Files:**
- Modify: `scripts/validate_data.py` (append `if __name__ == '__main__'` block)

- [ ] **Step 1: Append CLI wrapper**

Add this block to the end of `~/lifeflow/scripts/validate_data.py`:

```python


if __name__ == '__main__':
    import json
    import sys

    if len(sys.argv) != 2:
        sys.stderr.write('usage: validate_data.py <path/to/data.json>\n')
        sys.exit(2)

    try:
        with open(sys.argv[1], encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        sys.stderr.write(f'JSON parse error: {e}\n')
        sys.exit(3)
    except OSError as e:
        sys.stderr.write(f'file error: {e}\n')
        sys.exit(4)

    errors = validate(data)
    if errors:
        for err in errors:
            print(f'ERROR: {err}')
        sys.exit(1)
    print('OK')
    sys.exit(0)
```

- [ ] **Step 2: Smoke test on existing data.json**

```bash
cd ~/lifeflow
python3 scripts/validate_data.py data.json
```

Expected: prints `OK`, exit code 0. Verify with `echo $?` → `0`.

- [ ] **Step 3: Negative smoke test**

```bash
cd ~/lifeflow
python3 -c "import json; d=json.load(open('data.json')); del d['user']; json.dump(d, open('/tmp/bad.json', 'w'))"
python3 scripts/validate_data.py /tmp/bad.json ; echo "exit=$?"
rm /tmp/bad.json
```

Expected:
- prints `ERROR: root missing keys: ['user']`
- `exit=1`

- [ ] **Step 4: Commit**

```bash
cd ~/lifeflow
git add scripts/validate_data.py
git commit -m "feat: validate_data.py CLI wrapper with exit codes"
```

---

### Task 6: Write usage guide

**Files:**
- Create: `docs/l2-usage.md`

- [ ] **Step 1: Write usage doc**

Write `~/lifeflow/docs/l2-usage.md`:

````markdown
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
````

- [ ] **Step 2: Commit**

```bash
cd ~/lifeflow
git add docs/l2-usage.md
git commit -m "docs: add L2 daily usage guide"
```

---

### Task 7: End-to-end smoke verification

No code changes; this task confirms the pipeline's manual parts work as documented.

- [ ] **Step 1: Run full test suite**

```bash
cd ~/lifeflow
python3 -m pytest tests/ -v
```

Expected: 5 passing, 0 failing.

- [ ] **Step 2: Validate the live data.json**

```bash
cd ~/lifeflow
python3 scripts/validate_data.py data.json
```

Expected: `OK`.

- [ ] **Step 3: Serve and visual-check Breath.html**

```bash
cd ~/lifeflow
python3 -m http.server 8000
```

Open `http://<server-ip>:8000/Breath.html` in a browser. Verify:
- Hero number renders (150 分)
- 7 projects show
- Today entries list populated
- No JS console errors (open DevTools)

Stop the server (Ctrl+C) when done.

- [ ] **Step 4: Confirm git status is clean**

```bash
cd ~/lifeflow
git status
```

Expected: `nothing to commit, working tree clean` (the untracked `Breath.html` and `data.json` remaining from L4's scope are acceptable — they belong to L4 spec, not L2).

- [ ] **Step 5: Print completion summary**

No git commit — this is verification only. Write a one-line local note for yourself:

```bash
echo "L2 implementation complete $(date -Iseconds)" >> ~/lifeflow/.l2-log
```

---

## Self-review outcomes

Spec coverage check (against `2026-04-20-l2-claude-translation-layer-design.md`):

| Spec section | Implemented by |
|---|---|
| 输入契约 (Claude reads EventKit) | Prompt Task 1 explicitly asks Claude to read EventKit |
| 输出契约 (data.json schema) | Validator Tasks 3-5 enforce top-level + nested structure |
| 三条映射规则 | Prompt Task 1 lists all three rules and 7 project_ids |
| Claude Prompt 模板 + 三回合约束 | Prompt Task 1 hard-codes "严格走三回合, 不要跳步" |
| 交付物形态 (MVP 手动复制) | Usage guide Task 6 documents the copy-paste-validate-cp flow |
| 错误处理 (EventKit 权限, 空日等) | Usage guide Task 6 troubleshooting table covers these cases |
| 测试路径 (冒烟测试) | Task 7 runs pytest suite + manual browser check |
| Out of scope (L3, L4) | Usage guide Task 6 explicitly flags these as "未实现" |

No spec section lacks a task.

**Open questions from spec** (spec section "开放问题") are deliberately NOT locked in this plan — user flagged they can be decided later during real daily usage. Both heuristic defaults and total_points/rank_pct placeholders are encoded in the prompt itself, so revision is a one-file edit not a plan change.
