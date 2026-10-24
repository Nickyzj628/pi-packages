/**
 * /migrate — 把本机 pi 配置导出成一个可迁移目录（不压缩、不打包）。
 *
 * 仅 Windows：还原脚本只生成 restore.ps1。
 *
 * 用法：
 *   /migrate    在当前目录新建 pi-migrate-yyyyMMdd-HHmmss/ 并导出（不接受参数，不二次确认）
 *
 * 导出结构：
 *   <dest>/agent/           -> ~/.pi/agent/（settings / mcp / models / extensions / skills / prompts / themes / AGENTS.md…）
 *   <dest>/agent-secrets/   -> ~/.pi/agent/（auth.json、mcp-auth.json）
 *   <dest>/agents/          -> ~/.agents/（共享 skills 与 .skill-lock.json）
 *   <dest>/packages-local/  -> 以本地路径安装的 pi package 源码
 *   <dest>/packages.txt     -> 新机器需要 pi install 的来源
 *   <dest>/restore.ps1      -> Windows 一键还原（覆盖前自动 .bak 备份）
 *   <dest>/manifest.json    -> 导出清单
 *   <dest>/README.md        -> 新机器操作步骤
 *
 * 永不导出：bin/（rg.exe、fd.exe 等平台相关二进制）与 sessions/（会话历史）。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** ~/.pi/agent 下的单文件配置。 */
const AGENT_FILES = [
	"settings.json",
	"mcp.json",
	"models.json",
	"models-store.json",
	"keybindings.json",
	"AGENTS.override.md",
	"AGENTS.md",
	"CLAUDE.md",
	"SYSTEM.md",
	"APPEND_SYSTEM.md",
];

/** ~/.pi/agent 下的资源目录。 */
const AGENT_DIRS = ["extensions", "skills", "prompts", "themes"];

/** 凭证文件：只放进 agent-secrets/，方便单独处置。 */
const SECRET_FILES = ["auth.json", "mcp-auth.json"];

interface ExportEntry {
	label: string;
	files: number;
	bytes: number;
}

export interface ExportResult {
	dest: string;
	entries: ExportEntry[];
	/** 个人设置里声明的 pi package 来源。 */
	packages: string[];
	/** 存在但未导出的内容。 */
	skipped: string[];
}

function agentDir(): string {
	const override = process.env.PI_CODING_AGENT_DIR;
	if (override) return resolve(override.replace(/^~(?=$|[\\/])/, homedir()));
	return join(homedir(), ".pi", "agent");
}

/** 导出目录名：pi-migrate-yyyyMMdd-HHmmss。 */
export function exportDirName(date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return [
		"pi-migrate",
		`${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
		`${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
	].join("-");
}

function measure(path: string): { files: number; bytes: number } {
	let files = 0;
	let bytes = 0;
	const stack = [path];
	while (stack.length > 0) {
		const current = stack.pop() as string;
		const info = statSync(current, { throwIfNoEntry: false });
		if (!info) continue;
		if (info.isDirectory()) {
			for (const name of readdirSync(current)) stack.push(join(current, name));
			continue;
		}
		files += 1;
		bytes += info.size;
	}
	return { files, bytes };
}

function copyEntry(from: string, to: string, options: { skipNodeModules?: boolean } = {}): ExportEntry {
	mkdirSync(dirname(to), { recursive: true });
	cpSync(from, to, {
		recursive: true,
		dereference: true,
		force: true,
		// 本地 package 源码只带“可还原”的部分：依赖和 git 历史都能重新生成。
		filter: (src: string) =>
			!(options.skipNodeModules === true && /[\\/](node_modules|\.git)([\\/]|$)/.test(src)),
	});
	const { files, bytes } = measure(to);
	return { label: basename(to), files, bytes };
}

/** 相对路径按 settings.json 所在目录解析，与 pi 的规则一致。 */
function resolveLocal(source: string, base: string): string {
	return resolve(base, source.replace(/^~(?=$|[\\/])/, homedir()));
}

/** 本地路径安装（相对路径、~ 或盘符）。 */
function isLocalSource(source: string): boolean {
	return /^[.~\\/]/.test(source) || /^[A-Za-z]:[\\/]/.test(source);
}

/** child 与 parent 相同，或位于 parent 内部。 */
function isInside(child: string, parent: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** settings.json 里 packages 条目的来源：字符串，或带 source 字段的对象。 */
function packageSource(item: unknown): string | undefined {
	if (typeof item === "string") return item;
	return (item as { source?: string } | null)?.source;
}

/** 复制 settings.json；剔除旧机器上的本地 package 路径，还原后由 pi install 重新写入。 */
function copySettings(from: string, to: string, dropSources: string[]): ExportEntry {
	mkdirSync(dirname(to), { recursive: true });
	let text = readFileSync(from, "utf-8");
	if (dropSources.length > 0) {
		try {
			const parsed = JSON.parse(text) as { packages?: unknown };
			if (Array.isArray(parsed.packages)) {
				const kept = parsed.packages.filter((item) => !dropSources.includes(packageSource(item) ?? ""));
				if (kept.length === 0) delete parsed.packages;
				else parsed.packages = kept;
				text = `${JSON.stringify(parsed, null, 2)}\n`;
			}
		} catch {
			// settings.json 不是严格 JSON 时保持原样，宁可多带不可漏带。
		}
	}
	writeFileSync(to, text);
	const { files, bytes } = measure(to);
	return { label: basename(to), files, bytes };
}

function readPackages(settingsPath: string): string[] {
	try {
		const { packages } = JSON.parse(readFileSync(settingsPath, "utf-8")) as { packages?: unknown };
		if (!Array.isArray(packages)) return [];
		return packages
			.map(packageSource)
			.filter((source): source is string => typeof source === "string" && source.length > 0);
	} catch {
		return [];
	}
}

/**
 * 导出本机配置到 dest。只读源目录，写操作全部发生在 dest 下。
 * 同步实现：配置体积通常很小，避免在命令处理里引入并发复杂度。
 */
export function exportConfig(target: string): ExportResult {
	let dest = resolve(target);
	const agent = agentDir();
	if (isInside(dest, agent) || isInside(agent, dest)) {
		throw new Error("导出目录不能是 pi 配置目录或它的子目录");
	}

	const entries: ExportEntry[] = [];
	const skipped: string[] = [];
	mkdirSync(dest, { recursive: true });
	// 统一成真实路径，避免 8.3 短路径（如 ADMINI~1）让下面的包含关系判断失效。
	dest = realpathSync(dest);

	// 1. 个人设置里的 pi package：本地路径的源码一并带走，并在导出的 settings 里剔除旧机器路径
	const packages = readPackages(join(agent, "settings.json"));
	/** 导出清单里的包来源；本地包以 `local:<名字>` 记录。 */
	const recorded: string[] = [];
	const localSources: string[] = [];
	const localSlugs: string[] = [];
	for (const source of packages) {
		if (!isLocalSource(source)) {
			recorded.push(source);
			continue;
		}
		localSources.push(source);
		const absolute = realpathSync(resolveLocal(source, agent));
		if (!existsSync(absolute)) {
			skipped.push(`本地包（路径不存在）：${source}`);
			continue;
		}
		const slug = basename(absolute);
		const to = join(dest, "packages-local", slug);
		// 包源码与导出位置重叠时无法复制（自己拷进自己），只能请用户手动处理。
		if (isInside(to, absolute) || isInside(absolute, to)) {
			skipped.push(`本地包（与导出目录重叠，需手动拷贝）：${source}`);
			continue;
		}
		entries.push(copyEntry(absolute, to, { skipNodeModules: true }));
		localSlugs.push(slug);
		recorded.push(`local:${slug}`);
	}

	// 2. 普通配置
	for (const name of AGENT_FILES) {
		const from = join(agent, name);
		if (!existsSync(from)) continue;
		if (name === "settings.json") entries.push(copySettings(from, join(dest, "agent", name), localSources));
		else entries.push(copyEntry(from, join(dest, "agent", name)));
	}
	for (const name of AGENT_DIRS) {
		const from = join(agent, name);
		if (existsSync(from)) entries.push(copyEntry(from, join(dest, "agent", name)));
	}

	// 3. 凭证（明文，单独放一个目录方便处置）
	for (const name of SECRET_FILES) {
		const from = join(agent, name);
		if (existsSync(from)) entries.push(copyEntry(from, join(dest, "agent-secrets", name)));
	}

	// 4. 共享 Agent Skills 目录
	const shared = join(homedir(), ".agents");
	if (existsSync(join(shared, ".skill-lock.json"))) {
		entries.push(copyEntry(join(shared, ".skill-lock.json"), join(dest, "agents", ".skill-lock.json")));
	}
	if (existsSync(join(shared, "skills"))) {
		entries.push(copyEntry(join(shared, "skills"), join(dest, "agents", "skills")));
	}

	// 5. 会话历史永不导出
	if (existsSync(join(agent, "sessions"))) skipped.push("会话历史（sessions/）");

	// 6. 本地 package 需要在新机器上重新安装；npm/git 来源已在 settings.json 里
	if (localSlugs.length > 0) {
		writeFileSync(
			join(dest, "packages.txt"),
			[
				"# 新机器上执行： pi install <source>",
				"# local:<名字> 指本目录下的 packages-local/<名字>/",
				...localSlugs,
				"",
			].join("\n"),
		);
	}

	// 7. 还原脚本与说明
	writeFileSync(join(dest, "restore.ps1"), RESTORE_PS1);
	writeFileSync(join(dest, "README.md"), renderReadme(localSlugs));
	writeFileSync(
		join(dest, "manifest.json"),
		`${JSON.stringify(
			{
				createdAt: new Date().toISOString(),
				source: { agentDir: agent, sharedSkillsDir: shared },
				packages: recorded,
				entries: entries.map(({ label, files, bytes }) => ({ label, files, bytes })),
			},
			null,
			2,
		)}\n`,
	);

	return { dest, entries, packages: recorded, skipped };
}

export function formatReport(result: ExportResult): string {
	const lines: string[] = [`pi 配置已导出 → ${result.dest}`, ""];
	const width = Math.max(...result.entries.map((e) => e.label.length), 8);
	for (const entry of result.entries) {
		lines.push(`  ${entry.label.padEnd(width)}  ${String(entry.files).padStart(4)} 个文件  ${formatBytes(entry.bytes)}`);
	}
	if (result.entries.length === 0) lines.push("  （没有找到可导出的配置）");
	lines.push("");
	lines.push(
		result.packages.length > 0
			? `pi packages：${result.packages.join(", ")}（见 packages.txt / settings.json）`
			: "pi packages：无（未安装任何 npm/git/本地包）",
	);
	if (result.skipped.length > 0) lines.push(`已跳过：${result.skipped.join("；")}`);
	lines.push("", "下一步：整个目录拷到新机器，运行 restore.ps1。");
	return lines.join("\n");
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderReadme(packages: string[]): string {
	return `# pi 配置迁移包

由 \`/migrate\` 生成。

| 目录 | 还原到 |
|---|---|
| \`agent/\` | \`~/.pi/agent/\` |
| \`agent-secrets/\` | \`~/.pi/agent/\`（凭证明文，别外传） |
| \`agents/\` | \`~/.agents/\`（共享 skills） |
| \`packages-local/\` | 本地 pi package 源码，还原时以自身路径安装 |

## 新机器步骤

1. 安装 pi（Node >= 22.19）：

   \`\`\`powershell
   npm install -g --ignore-scripts @earendil-works/pi-coding-agent
   \`\`\`

   另需 Git for Windows（bash 工具依赖）。

2. 还原配置：

   \`\`\`powershell
   powershell -ExecutionPolicy Bypass -File .\\restore.ps1
   \`\`\`

   已有文件会先备份为 \`*.bak-<时间戳>\`。

3. 验证：

   \`\`\`bash
   pi mcp list     # MCP 服务器是否 connected
   pi list         # 已安装的 package
   pi              # 检查模型、/skills、/settings
   \`\`\`

${packages.length > 0 ? `4. 重新安装本地 package：\`restore.ps1\` 会自动执行；手动则按 \`packages.txt\` 逐个 \`pi install\`。npm/git 包已写在 settings.json 里，无需额外操作。\n` : ""}
## 注意

- \`agent-secrets/\` 是明文 API key / OAuth token，勿提交公开仓库；也可以不用它，在新机器上重新登录。
- 本包不含 \`bin/\`（平台相关二进制）与 \`sessions/\`（会话历史）。
- 若新机器用 \`PI_CODING_AGENT_DIR\` 改了配置目录，请按该变量指向的位置还原。
`;
}

const RESTORE_PS1 = `# 从本目录还原 pi 配置（Windows PowerShell 5.1+ / pwsh）
# 用法: powershell -ExecutionPolicy Bypass -File .\\restore.ps1 [-DryRun]
param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$src       = $PSScriptRoot
$stamp     = Get-Date -Format "yyyyMMdd-HHmmss"
$agentDst  = Join-Path $env:USERPROFILE ".pi\\agent"
$skillsDst = Join-Path $env:USERPROFILE ".agents"

function Copy-Tree([string]$From, [string]$To) {
  if (-not (Test-Path $From)) { Write-Host "skip (missing): $From"; return }
  New-Item -ItemType Directory -Force -Path $To | Out-Null
  Get-ChildItem -LiteralPath $From -Force | ForEach-Object {
    $target = Join-Path $To $_.Name
    if (Test-Path $target) {
      $bak = "$target.bak-$stamp"
      Write-Host "backup: $target -> $bak"
      if (-not $DryRun) { Move-Item -LiteralPath $target -Destination $bak }
    }
    Write-Host "copy:   $($_.FullName) -> $target"
    if (-not $DryRun) { Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force }
  }
}

Write-Host "==> pi agent 目录: $agentDst"
Copy-Tree (Join-Path $src "agent")         $agentDst
Copy-Tree (Join-Path $src "agent-secrets") $agentDst

Write-Host "==> 共享 skills 目录: $skillsDst"
Copy-Tree (Join-Path $src "agents")        $skillsDst

if ($DryRun) { Write-Host ""; Write-Host "DryRun: 未写入任何文件"; exit 0 }

$pkgFile = Join-Path $src "packages.txt"
if (Test-Path $pkgFile) {
  Write-Host ""
  Write-Host "==> 安装 pi packages"
  foreach ($line in Get-Content $pkgFile) {
    $entry = $line.Trim()
    if ($entry -eq "" -or $entry.StartsWith("#")) { continue }
    if ($entry.StartsWith("local:")) {
      pi install (Join-Path (Join-Path $src "packages-local") $entry.Substring(6))
    } else {
      pi install $entry
    }
  }
}

Write-Host ""
Write-Host "完成。请运行: pi --version ; pi mcp list ; pi list"
`;

export default function migrateExtension(pi: ExtensionAPI): void {
	pi.registerCommand("migrate", {
		description: "把本机 pi 配置导出到当前目录下的新文件夹（不压缩）",
		handler: async (rawArgs, ctx: ExtensionCommandContext) => {
			if (rawArgs.trim()) {
				ctx.ui.notify("/migrate 不接受参数，在当前目录新建 pi-migrate-<时间戳>/ 导出", "error");
				return;
			}
			if (process.platform !== "win32") {
				ctx.ui.notify("/migrate 仅支持 Windows", "error");
				return;
			}
			try {
				const result = exportConfig(join(ctx.cwd, exportDirName()));
				// 只在对话里留一份清单，不触发模型回合。
				await pi.sendMessage({ customType: "migrate", content: formatReport(result), display: true }, { triggerTurn: false });
			} catch (error) {
				ctx.ui.notify(`导出失败：${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}
