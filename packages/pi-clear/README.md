# pi-clear

为 pi 提供 `/clear` 命令：将当前会话文件移动至 Windows 回收站，并新建一个空会话。

## 运行环境

- **操作系统**：Windows（依赖 Windows 文件系统回收站 API）。
- **运行模式**：需要可交互的 TUI（支持确认提示框）。非 TUI 环境下将提示并不执行。

## 用法

```text
/clear
```

确认后：旧会话移入回收站 → 立即创建新会话。取消则无任何操作。

## 安装

```bash
pi install ./packages/pi-clear        # 单独安装（也可通过根目录聚合包整体安装）
```
