# pi 配置迁移包

由 `/migrate` 生成。

| 目录 | 还原到 |
|---|---|
| `agent/` | `~/.pi/agent/` |
| `agent-secrets/` | `~/.pi/agent/`（凭证明文，别外传） |
| `agents/` | `~/.agents/`（共享 skills） |
| `packages-local/` | 本地 pi package 源码，还原时以自身路径安装 |

## 新机器步骤

1. 安装 pi（Node >= 22.19）：

   ```powershell
   npm install -g --ignore-scripts @earendil-works/pi-coding-agent
   ```

   另需 Git for Windows（bash 工具依赖）。

2. 还原配置：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\restore.ps1
   ```

   已有文件会先备份为 `*.bak-<时间戳>`。

3. 验证：

   ```bash
   pi mcp list     # MCP 服务器是否 connected
   pi list         # 已安装的 package
   pi              # 检查模型、/skills、/settings
   ```


## 注意

- `agent-secrets/` 是明文 API key / OAuth token，勿提交公开仓库；也可以不用它，在新机器上重新登录。
- 本包不含 `bin/`（平台相关二进制）与 `sessions/`（会话历史）。
- 若新机器用 `PI_CODING_AGENT_DIR` 改了配置目录，请按该变量指向的位置还原。
