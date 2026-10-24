# pi-migrate

给 pi 加一个 `/migrate`：把本机的 pi 配置导出成一个可直接拷走的目录（不压缩），新机器跑一次 `restore.ps1` 即可。

## 依赖

- **仅 Windows**。非 Windows 上 `/migrate` 只提示不执行。
- pi 本身（Node >= 22.19），无额外 npm 依赖。
- TUI 里会弹确认框，`--yes` 跳过；新机器还原用 PowerShell 5.1+。

## 用法

```text
/migrate                     导出到 ~/pi-migrate-<时间戳>/
/migrate --with-sessions     连会话历史一起导出
/migrate --no-secrets        不导出 auth.json / mcp-auth.json
/migrate --yes               跳过确认
/migrate D:\pi-export        指定导出目录（必须不存在或为空）
```

导出结构：

```text
<dest>/
├── agent/           ~/.pi/agent 配置与资源（settings、MCP、models、扩展、skills、提示词、主题…）
├── agent-secrets/   auth.json、mcp-auth.json（明文凭证，别外传）
├── agents/          ~/.agents 共享 skills
├── packages-local/  本地路径安装的 package 源码（不含 node_modules / .git）
├── packages.txt     需要重装的本地包清单
├── restore.ps1      一键还原（PowerShell 5.1+ / pwsh）
├── manifest.json    导出清单
└── README.md        新机器操作步骤
```

默认不含 `bin/`（平台相关二进制）和会话历史。导出的 `settings.json` 会剔掉旧机器的本地包路径，由还原脚本重新 `pi install`。

还原时同名文件先备份为 `*.bak-<时间戳>`，再复制：

```powershell
powershell -ExecutionPolicy Bypass -File .\restore.ps1   # 加 -DryRun 只看不写
```

## 安装

```bash
pi install ./packages/pi-migrate     # 单装（仓库根也有聚合包）
pi list                              # 确认已注册
```

开发调试：`node scripts/dev-run.ts /tmp/test-export`（只跑导出逻辑，不启动 pi）。
