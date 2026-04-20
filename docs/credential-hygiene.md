# Credential Hygiene · lifeflow

L3 管线当前认证 = **Rube (Composio) OAuth 代理 → GitHub**。本文档管: Rube 挂了怎么办 / 怎么审查权限 / 备用 PAT 路径。

## 当前认证链

```
claude.ai web (Custom Connector)
   ↓ OAuth
Composio (Rube MCP host)
   ↓ OAuth
GitHub (hbhggh 账户的 lifeflow repo)
```

配置日期: **2026-04-21**
当前生效认证主体: Composio App Authorization (非用户手管的 token)

## 季度审查 checklist (每 3 个月一次)

下次审查截止: **2026-07-21**

1. 登录 https://github.com/settings/installations
2. 查看 "Composio" App 的授权
3. 确认 Repository access 仍是 **Only select: lifeflow** (不是 All repos)
4. 确认 Permissions 没被 Composio 悄悄扩大 (应只有 Contents R+W)
5. 登录 Composio dashboard (app.composio.dev) → GitHub connector 下看所有已建 tool bindings, 删无用的
6. 更新本文件的 "下次审查" 日期

## 紧急 fallback · Rube/Composio 宕机或失控

若某天 L2 对话结束时 Claude 报 "Rube connector error / unreachable":

### Fallback 1 (首选): Claude Code CLI 手推

1. 复制 Claude 对话里输出的完整 data.json code block
2. SSH 到服务器 (或本机) 打开 Claude Code
3. 告诉 Claude Code: "把这段 JSON 写到 ~/lifeflow/data.json, 验证, 提交, push"
4. CC 跑完整流程: `validate_data.py` → `git add data.json && git commit -m "data: daily sync ..." && git push`
5. CF Pages 30 秒后重建

### Fallback 2: 重建 Fine-grained PAT 走直连

如果连 Claude Code 都不顺手, 需要 claude.ai 自己能写:

1. github.com/settings/tokens?type=beta → Generate new token
2. Name: `lifeflow-mcp-write`, 90d, Only `lifeflow` repo, Contents R+W
3. claude.ai web → 断开 Rube 的 GitHub connector → 添加 Custom Connector 指向 GitHub 官方 MCP (需要自建或用 GitHub Copilot MCP 端点)
4. PAT 粘进去
5. 重跑写 test 确认

这条路 2026-04-20 曾建过一次 PAT (`lifeflow-mcp-write`), 已于 2026-04-21 删除。重建 5 min。

### Fallback 3 (terminal only): 完全绕开 claude.ai

最极端: 放弃 L2 + L3, 用户自己跑:
```bash
cd ~/lifeflow
nano data.json   # 手动改今天的数据
python3 scripts/validate_data.py data.json
git add data.json
git commit -m "data: manual sync $(date +%Y-%m-%d)"
git push
```
L2 的 "Claude 协商 3 规则" 就此失效, 退化成纯手工。只在 Rube + PAT 都失效的末日场景用。

## 关键密件位置提醒

**无密件需保管** (截至 2026-04-21):
- Fine-grained PAT 已删
- Composio OAuth token 由 Composio 后端管理, 用户不直接碰
- SSH key (`~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`) 已在 GitHub settings/keys 登记, 属服务器级密件, 按普通 SSH key 习惯保管即可

若未来启用 Fallback 2 并生成新 PAT, 请保存到密码管理器, **不要在对话 / git commit / 文件里明文出现**。

## 更新日志

- 2026-04-20: 原版 `pat-rotation.md` 为 PAT 旋转提醒
- 2026-04-21: 改名 `credential-hygiene.md`, 重写为 Rube/Composio 路径 + fallback playbook
