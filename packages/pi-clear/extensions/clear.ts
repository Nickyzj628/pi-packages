/**
 * /clear — delete the current session into the Windows Recycle Bin, then start a fresh one.
 *
 * Windows only. Uses Microsoft.VisualBasic.FileIO.FileSystem, which goes through
 * SHFileOperation: the file lands in the real Recycle Bin and can be restored.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Move a file or directory to the Recycle Bin. Returns an error message, or undefined on success. */
function recycle(target: string): string | undefined {
	const script = [
		"$ProgressPreference = 'SilentlyContinue'",
		"$ErrorActionPreference = 'Stop'",
		"Add-Type -AssemblyName Microsoft.VisualBasic",
		// Single-quoted PowerShell literal: escape ' by doubling it.
		`$p = '${target.replace(/'/g, "''")}'`,
		"if ([System.IO.Directory]::Exists($p)) {",
		"  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin')",
		"} elseif ([System.IO.File]::Exists($p)) {",
		"  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin')",
		"} else { throw \"not found: $p\" }",
	].join("\n");

	// -EncodedCommand sidesteps every quoting problem between Node and PowerShell.
	const encoded = Buffer.from(script, "utf16le").toString("base64");
	const run = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
		encoding: "utf-8",
		windowsHide: true,
	});

	if (run.status !== 0) {
		const detail = (run.stderr ?? "").trim() || run.error?.message || "PowerShell 调用失败";
		return detail.split("\n")[0];
	}
	if (existsSync(target)) return "删除后路径仍然存在";
	return undefined;
}

export default function clearExtension(pi: ExtensionAPI): void {
	pi.registerCommand("clear", {
		description: "把当前会话删除到回收站，并开启一个新会话",
		handler: async (_args, ctx) => {
			if (process.platform !== "win32") {
				ctx.ui.notify("/clear 仅支持 Windows", "error");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify("/clear 需要在 TUI 中确认后才能执行", "warning");
				return;
			}

			// Capture the path now: after newSession() this ctx is stale.
			const sessionFile = ctx.sessionManager.getSessionFile();
			if (!sessionFile) {
				ctx.ui.notify("当前会话还没有写入磁盘，没有可删除的内容", "info");
				return;
			}

			const confirmed = await ctx.ui.confirm(
				"删除当前会话？",
				`${basename(sessionFile)}\n\n文件会移入回收站，随后立即开启一个新会话。`,
			);
			if (!confirmed) {
				ctx.ui.notify("已取消，会话保留", "info");
				return;
			}

			// Replace the session first so Pi stops writing, then delete the old file.
			const result = await ctx.newSession({
				withSession: async (fresh) => {
					const error = recycle(sessionFile);
					if (error) fresh.ui.notify(`新会话已开启，但旧文件删除失败：${error}`, "error");
					else fresh.ui.notify("会话已移入回收站，新会话已开启", "info");
				},
			});

			if (result.cancelled) ctx.ui.notify("会话切换已取消，没有删除任何内容", "warning");
		},
	});
}
