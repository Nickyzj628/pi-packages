针对本人需求定制的pi packages

> 仅支持Windows平台

| 包 | 命令 | 说明 |
|---|---|---|
| [`pi-clear`](packages/pi-clear/README.md) | `/clear` | 把当前会话文件放入回收站，然后开启新会话 |
| [`pi-migrate`](packages/pi-migrate/README.md) | `/migrate` | 把本机的pi配置导出至当前目录，提供一键迁移脚本 |

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

```bash
# 全部安装
pi install ./            # 可以用相对路径或绝对路径

# 安装单个包
pi install ./packages/pi-clear
pi install ./packages/pi-migrate

# 验证安装情况
pi list                  # 查看已安装的 package
```

## 开发与调试

```bash
pnpm install             # 仓库本身没啥运行时依赖，主要用来统一管理
```

- 改完扩展之后，重启pi或者/reload就能生效。
- `pi-migrate` 支持脱离pi环境单独测试导出逻辑：
  ```bash
  node packages/pi-migrate/scripts/dev-run.ts <目标目录>
  ```

各包的具体用法和限制看各自目录下的 `packages/*/README.md`。

## 许可证

MIT
