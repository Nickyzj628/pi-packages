# pi-migrate

为 pi 提供 `/migrate` 命令：一条命令把本机 pi 配置与数据导出到当前目录下新建的 `pi-migrate-<时间戳>/`，可直接拷贝到新机器，用 `restore.ps1` 一键还原。

默认行为（无参数、无确认）：

- 在当前工作目录下新建 `pi-migrate-yyyyMMdd-HHmmss/` 存放导出内容（不污染当前目录）
- 导出凭证（`auth.json` / `mcp-auth.json`，明文）
- 不导出聊天会话历史
- 不弹二次确认

## 依赖与环境

- **操作系统**：Windows（还原脚本基于 PowerShell）。
- **Node.js**：Node >= 22.19。
- **还原工具**：PowerShell 5.1+ 或 pwsh。

## 用法

```text
/migrate
```

不接受任何参数（追加参数会报错）。输出示例：

```text
C:\some\project\pi-migrate-20261024-212415\
└── ...
```

该子目录不存在时自动创建；若导出目录与本地安装的 pi package 源码重叠（比如就在包的仓库里执行），该本地包会被跳过并提示手动拷贝。

## 导出结构

```text
<dest>/
├── agent/           ~/.pi/agent 配置与资源（settings、MCP、models、扩展、skills、提示词、主题…）
├── agent-secrets/   auth.json、mcp-auth.json（明文凭证，请妥善保管）
├── agents/          ~/.agents 共享 skills
├── packages-local/  本地路径安装的 package 源码（排除 node_modules / .git）
├── packages.txt     本地包重装清单
├── restore.ps1      一键还原脚本（PowerShell 5.1+）
├── manifest.json    导出清单
└── README.md        新机器操作指南
```

不含 `bin/` 平台二进制与 `sessions/` 会话历史。导出的 `settings.json` 会自动剥离旧机的本地包绝对路径，由还原脚本重新 `pi` 安装。

还原时，同名文件会先备份为 `*.bak-<timestamp>` 再覆盖：

```powershell
powershell -ExecutionPolicy Bypass -File .\restore.ps1   # 附加 -DryRun 参数可预演预览
```

## 安装

```bash
pi install ./packages/pi-migrate     # 单独安装（也可通过根目录聚合包整体安装）
pi list                              # 验证注册状态
```

本地开发调试：`node scripts/dev-run.ts <目录>`（仅执行导出逻辑，不启动 pi）。
