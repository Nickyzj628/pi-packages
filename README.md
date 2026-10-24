# pi-packages

我平时写的一些 pi 扩展和资源。把它们整理成了一个 monorepo，根目录本身就是一个聚合包，装一次就能把 `packages/*` 下面所有的扩展、skills、提示词和主题全部加载进来。

## 包含的包

| 包 | 命令 | 说明 |
|---|---|---|
| [`pi-clear`](packages/pi-clear/README.md) | `/clear` | 把当前会话文件移入 Windows 回收站，然后开个新会话 |
| [`pi-migrate`](packages/pi-migrate/README.md) | `/migrate` | 把本机的 pi 配置和数据打包导出到当前目录，顺便带个一键还原脚本 |

这两个包都用到了 Windows 特性（回收站 API 和 PowerShell 还原脚本），所以目前只能在 Windows 上跑。

## 目录结构

```text
pi-packages/
├── package.json              # 聚合包：通过 pi 清单汇总 packages/* 下的所有资源
├── pnpm-workspace.yaml
├── README.md
└── packages/
    ├── pi-clear/
    │   ├── package.json
    │   ├── README.md
    │   └── extensions/clear.ts
    └── pi-migrate/
        ├── package.json
        ├── README.md
        ├── extensions/migrate.ts
        └── scripts/dev-run.ts
```

根目录 `package.json` 里的 `pi` 字段负责做聚合：

```json
{
  "pi": {
    "extensions": ["./packages/*/extensions/*.ts"],
    "skills": ["./packages/*/skills/*"],
    "prompts": ["./packages/*/prompts/*.md"],
    "themes": ["./packages/*/themes/*.json"]
  }
}
```

以后想加新包的话，按这个结构放进去就能自动被识别，当然子包也支持单独安装。

## 安装

需要 Node.js >= 22.19，以及 Windows 环境（因为部分包依赖系统特性）。

```bash
# 推荐做法：在根目录下整体安装，加载全部资源
pi install ./            # 可以用相对路径或绝对路径

# 或者只装你需要的单个包
pi install ./packages/pi-clear
pi install ./packages/pi-migrate

# 临时试用，不写配置文件
pi -e ./packages/pi-clear
```

装完之后验证一下：

```bash
pi list                  # 查看已安装的 package
pi                       # 进 TUI 看看 /clear 和 /migrate 是不是都能用了
```

默认情况下，安装记录会写进 `~/.pi/agent/settings.json`。如果加了 `--local` 参数，就会写入当前项目的 `.pi/settings.json`（记得先给项目授权信任才会加载）。

## 开发与调试

```bash
pnpm install             # 仓库本身没啥运行时依赖，主要用来统一管理
```

- 改完扩展之后，重启 pi（或者重新开个会话）就能直接生效。
- `pi-migrate` 支持脱离 pi 环境单独测试导出逻辑：
  ```bash
  node packages/pi-migrate/scripts/dev-run.ts <目标目录>
  ```

各包的具体用法和限制看各自目录下的 `packages/*/README.md`。

## 许可证

MIT
