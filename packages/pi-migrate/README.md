# pi-migrate

一个 [pi](https://pi.dev) package，提供 `/migrate` 命令：把本机的 pi 配置导出成一个可直接拷走的目录（**不压缩、不打包**）。

## 安装

```bash
pi install ./pi-packages/pi-migrate      # 本地路径，直接引用不复制
# 或 pi install /绝对/路径/pi-migrate
pi list                                  # 确认已注册
```

## 用法

```text
/migrate                     导出到 ~/pi-migrate-<时间戳>/
/migrate --with-sessions     连会话历史一起导出
/migrate --no-secrets        不导出 auth.json / mcp-auth.json
/migrate --yes               跳过确认
/migrate D:\pi-export        指定导出目录（必须不存在或为空）
```

## 导出结构

```text
<dest>/
├── agent/            -> ~/.pi/agent/（settings / mcp / models / extensions / skills / prompts / themes / AGENTS.md…）
├── agent-secrets/    -> ~/.pi/agent/（auth.json、mcp-auth.json，明文凭证）
├── agents/           -> ~/.agents/（共享 skills、.skill-lock.json）
├── packages-local/   -> 以本地路径安装的 package 源码（跳过 node_modules、.git）
├── packages.txt      -> **仅本地包**的重装来源（local:<名字> 指向 packages-local/）；npm/git 包保留在 settings.json 里
├── restore.sh        -> macOS / Linux / WSL / Git Bash 一键还原
├── restore.ps1       -> Windows 一键还原
├── manifest.json     -> 导出清单
└── README.md         -> 新机器操作步骤
```

还原脚本会先给同名文件加 `.bak-<时间戳>` 备份，再复制；若存在 `packages.txt`，最后逐个 `pi install`。

## 规则

- 遵守 `PI_CODING_AGENT_DIR` / `PI_CODING_AGENT_SESSION_DIR`，默认 `~/.pi/agent` 与 `~/.pi/agent/sessions`。
- `bin/`（`rg.exe`、`fd.exe` 等平台相关二进制）永不导出。
- 会话历史默认不导出（`--with-sessions` 才带）。
- 导出的 `settings.json` 会剔除旧机器的本地 package 路径，避免新机器加载失败；由 `pi install` 重新写入本机路径。
- 只读源配置，所有写入都在目标目录内；目标目录不允许落在 pi 配置目录里。

## 开发

```bash
node scripts/dev-run.ts /tmp/test-export   # 直接跑导出逻辑，不启动 pi
```

源文件：`extensions/migrate.ts`（导出逻辑 + 命令注册）。
