# pi-clear

给 pi 加一个 `/clear`：把当前会话文件移进 Windows 回收站，然后开一个新会话。

## 依赖

- **仅 Windows**。通过 `Microsoft.VisualBasic.FileIO.FileSystem` 走 `SHFileOperation`，文件真的进回收站、可还原。
- 需要可交互的 TUI（会弹确认框）。非 Windows 或非 TUI 环境只提示不执行。

## 用法

```text
/clear
```

确认后：旧会话文件进回收站 → 立即新建空会话。取消则什么都不做。

## 安装

```bash
pi install ./packages/pi-clear        # 单装（仓库根也有聚合包）
```
