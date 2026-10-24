# pi-packages

个人 pi 扩展集合。**整个仓库就是一个 pi package**：根 `package.json` 的 `pi` 清单用 glob 把 `packages/*` 下的扩展/技能/提示词全部收进来，所以一条 `pi install` 就能装完所有子包。

## 结构

```
pi-packages/
├── package.json          # 聚合清单：唯一的 pi package
├── pnpm-workspace.yaml   # 子包各自有 package.json，便于将来加依赖/单独发布
├── packages/
│   ├── pi-clear/         # /clear
│   └── pi-migrate/       # /migrate
└── README.md
```

子包目录**不是**独立安装单元（虽然也可以单独 `pi install ./packages/pi-clear`），pi 眼里只有根这一个 package。

## 安装

```bash
# GitHub（推荐，tag 可锁版本）
pi install git:github.com/<you>/pi-packages@v1

# 本地开发：引用而非复制，改完 /reload 生效
pi install ./pi-packages
```

验证：

```bash
pi list
```

进入 pi 后 `/reload`，输入 `/` 应看到 `clear`、`migrate`。

## 只加载部分资源

安装是"全部"，加载可以筛。`~/.pi/agent/settings.json`：

```json
{
  "packages": [
    {
      "source": "git:github.com/<you>/pi-packages@v1",
      "extensions": ["!packages/pi-clear/extensions/*.ts"],
      "skills": []
    }
  ]
}
```

模式相对包根匹配，`!` 排除、`+` 精确包含、`[]` 整类不加载。也可以直接 `pi config` 交互式开关。

## 新增一个包

1. `mkdir -p packages/pi-foo/extensions`
2. 放 `packages/pi-foo/package.json`：
   ```json
   {
     "name": "pi-foo",
     "version": "0.1.0",
     "private": true,
     "type": "module",
     "keywords": ["pi-package"],
     "pi": { "extensions": ["./extensions/foo.ts"] },
     "peerDependencies": { "@earendil-works/pi-coding-agent": "*" }
   }
   ```
3. 放 `packages/pi-foo/extensions/foo.ts`，`/reload` 即可。

`skills/`、`prompts/`、`themes/` 同理，根清单已经按 glob 收好了。

## 为什么不直接把扩展丢进 `~/.pi/agent/extensions/`

- 这个仓库能一条命令装到任意机器，且能被 `/migrate` 作为一个 package 整体带走。
- 仍然可以只装单个子包做试验：`pi install ./packages/pi-clear`（本地路径引用，不复制）。
- **别同时装聚合包和同名子包**：同一扩展会被加载两次，命令变成 `clear` 和 `clear:2`。

## 维护

```bash
pi update --extensions                                   # 更新全部已装 package
pi remove git:github.com/<you>/pi-packages               # 卸载
pnpm install                                             # 仅当子包新增 npm 依赖时需要
```

## 关于 pnpm workspace

聚合包本身**不需要** pnpm：pi 只是读根 `package.json` 的 `pi` 清单。

保留 workspace 是为了两件事：

1. 子包将来引入 npm 依赖时，`pnpm install` 会把它们 hoist 到根 `node_modules`，pi 安装 git 包后依赖可用。
2. 想单独发布某个子包时，`pnpm -r publish` 直接可用（届时把该子包的 `private` 去掉）。

host 提供的包（`@earendil-works/pi-coding-agent` 等）只能写在 `peerDependencies`，不要放 `dependencies`，否则会出现重复实例。
