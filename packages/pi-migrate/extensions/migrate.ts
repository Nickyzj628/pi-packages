/**
 * /migrate — 把本机 pi 配置导出成一个可迁移目录（不压缩、不打包）。
 *
 * 仅 Windows：还原脚本只生成 restore.ps1。
 *
 * 用法：
 *   /migrate                    导出到 ~/pi-migrate-<时间戳>/
 *   /migrate --with-sessions    连会话历史一起导出
 *   /migrate --no-secrets       不导出 auth.json / mcp-auth.json
 *   /migrate --yes              跳过确认
 *   /migrate <目录>             指定导出目录（须不存在）
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
 * 永不导出：bin/（rg.exe、fd.exe 等平台相关二进制）。sessions/ 默认不导出。
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
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

export interface ExportOptions {
	/** 目标目录；相对路径按当前工作目录解析。 */
	dest: string;
	/** 是否导出 auth.json / mcp-auth.json。 */
	withSecrets: boolean;
	/** 是否导出会话历史。 */
	withSessions: boolean;
}

interface ExportEntry {
	label: string;
	from: string;
	to: string;
	files: number;
	bytes: number;
}

export interface ExportResult {
	dest: string;
	entries: ExportEntry[];
	/** 个人设置里声明的 pi package 来源。 */
	packages: string[];
	/** 存在但按要求跳过的内容。 */
	skipped: string[];
}

function agentDir(): string {
	const override = process.env.PI_CODING_AGENT_DIR;
	if (override) return resolve(override.replace(/^~(?=$|[\\/])/, homedir()));
	return join(homedir(), ".pi", "agent");
}

function sessionDir(agent: string): string {
	const override = process.env.PI_CODING_AGENT_SESSION_DIR;
	if (override) return resolve(override.replace(/^~(?=$|[\\/])/, homedir()));
	return join(agent, "sessions");
}

function stamp(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isNonEmptyDir(path: string): boolean {
	return existsSync(path) && readdirSync(path).length > 0;
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
	return { label: basename(to), from, to, files, bytes };
}

/** 相对路径按 settings.json 所在目录解析，与 pi 的规则一致。 */
function resolveLocal(source: string, base: string): string {
	return resolve(base, source.replace(/^~(?=$|[\\/])/, homedir()));
}

/** 本地路径安装（相对路径、~ 或盘符）。 */
function isLocalSource(source: string): boolean {
	return /^[.~\\/]/.test(source) || /^[A-Za-z]:[\\/]/.test(source);
}

/** 复制 settings.json；剔除旧机器上的本地 package 绝对路径，还原后由 pi install 重新写入。 */
function copySettings(from: string, to: string, dropSources: string[]): ExportEntry {
	mkdirSync(dirname(to), { recursive: true });
	let text = readFileSync(from, "utf-8");
	if (dropSources.length > 0) {
		try {
			const parsed = JSON.parse(text) as { packages?: unknown };
			if (Array.isArray(parsed.packages)) {
				const kept = parsed.packages.filter((item: unknown) => {
					const source = typeof item === "string" ? item : (item as { source?: unknown } | null)?.source;
					return typeof source !== "string" || !dropSources.includes(source);
				});
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
	return { label: basename(to), from, to, files, bytes };
}

function readPackages(settingsPath: string): string[] {
	try {
		const parsed = JSON.parse(readFileSync(settingsPath, "utf-8")) as { packages?: unknown };
		if (!Array.isArray(parsed.packages)) return [];
		return parsed.packages
			.map((item) => {
				if (typeof item === "string") return item;
				if (item && typeof item === "object" && typeof (item as { source?: unknown }).source === "string") {
					return (item as { source: string }).source;
				}
				return undefined;
			})
			.filter((item): item is string => typeof item === "string" && item.length > 0);
	} catch {
		return [];
	}
}

/**
 * 导出本机配置。只读源目录，写操作全部发生在 dest 下。
 * 同步实现：配置体积通常很小，避免在命令处理里引入并发复杂度。
 */
export function exportConfig(options: ExportOptions): ExportResult {
	const dest = resolve(options.dest);
	const agent = agentDir();
	if (dest === agent || dest.startsWith(agent + sep)) {
		throw new Error("导出目录不能位于 pi 配置目录内");
	}
	if (isNonEmptyDir(dest)) {
		throw new Error(`目标目录已存在且非空：${dest}`);
	}

	const entries: ExportEntry[] = [];
	const skipped: string[] = [];
	mkdirSync(dest, { recursive: true });

	// 1. 个人设置里的 pi package：本地路径的源码一并带走，并在导出的 settings 里剔除旧机器路径
	const packages = readPackages(join(agent, "settings.json"));
	/** 导出清单里的包来源；本地包以 `local:<名字>` 记录。 */
	const recorded: string[] = [];
	const localSources: string[] = [];
	for (const source of packages) {
		if (!isLocalSource(source)) {
			recorded.push(source);
			continue;
		}
		localSources.push(source);
		const absolute = resolveLocal(source, agent);
		if (!existsSync(absolute)) {
			skipped.push(`本地包（路径不存在）：${source}`);
			continue;
		}
		const slug = basename(absolute);
		copyEntry(absolute, join(dest, "packages-local", slug), { skipNodeModules: true });
		recorded.push(`local:${slug}`);
	}
	// packages.txt 只记录本地包：npm/git 来源仍保留在导出的 settings.json 里，无需重复声明。
	const localSlugs = recorded.filter((source) => source.startsWith("local:"));

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

	// 2. 凭证
	if (options.withSecrets) {
		for (const name of SECRET_FILES) {
			const from = join(agent, name);
			if (existsSync(from)) entries.push(copyEntry(from, join(dest, "agent-secrets", name)));
		}
	} else {
		skipped.push("凭证（--no-secrets）");
	}

	// 3. 共享 Agent Skills 目录
	const shared = join(homedir(), ".agents");
	if (existsSync(join(shared, ".skill-lock.json"))) {
		entries.push(copyEntry(join(shared, ".skill-lock.json"), join(dest, "agents", ".skill-lock.json")));
	}
	if (existsSync(join(shared, "skills"))) {
		entries.push(copyEntry(join(shared, "skills"), join(dest, "agents", "skills")));
	}

	// 4. 会话历史（可选）
	const sessions = sessionDir(agent);
	if (options.withSessions && existsSync(sessions)) {
		entries.push(copyEntry(sessions, join(dest, "agent", "sessions")));
	} else if (existsSync(sessions)) {
		skipped.push("会话历史（--with-sessions 可包含）");
	}

	// 5. 本地 package 需要在新机器上重新安装；npm/git 来源已在 settings.json 里
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

	// 6. 还原脚本与说明
	writeFileSync(join(dest, "restore.ps1"), RESTORE_PS1);
	writeFileSync(join(dest, "README.md"), renderReadme(localSlugs));
	writeFileSync(
		join(dest, "manifest.json"),
		`${JSON.stringify(
			{
				createdAt: new Date().toISOString(),
				source: { agentDir: agent, sharedSkillsDir: shared, sessionsIncluded: options.withSessions, secretsIncluded: options.withSecrets },
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
- 本包不含 \`bin/\`（平台相关二进制）与 \`sessions/\`（除非导出时加了 \`--with-sessions\`）。
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

interface CommandOptions {
	dest?: string;
	withSecrets: boolean;
	withSessions: boolean;
	yes: boolean;
}

function parseArgs(raw: string): CommandOptions {
	const options: CommandOptions = { withSecrets: true, withSessions: false, yes: false };
	for (const token of raw.split(/\s+/).filter(Boolean)) {
		if (token === "--with-sessions" || token === "--sessions") options.withSessions = true;
		else if (token === "--no-secrets") options.withSecrets = false;
		else if (token === "--yes" || token === "-y") options.yes = true;
		else if (!token.startsWith("-")) {
			if (options.dest) throw new Error(`多余的参数：${token}`);
			options.dest = token;
		} else throw new Error(`未知选项：${token}`);
	}
	return options;
}

const ARGUMENTS = [
	{ value: "--with-sessions", label: "--with-sessions", description: "连会话历史一起导出" },
	{ value: "--no-secrets", label: "--no-secrets", description: "不导出 API key / OAuth 凭证" },
	{ value: "--yes", label: "--yes", description: "跳过确认" },
];

export default function migrateExtension(pi: ExtensionAPI): void {
	pi.registerCommand("migrate", {
		description: "把本机 pi 配置导出为可迁移目录（不压缩）",
		getArgumentCompletions: (prefix) =>
			ARGUMENTS.filter((item) => item.value.startsWith(prefix)).map((item) => ({ ...item })),
		handler: async (rawArgs, ctx: ExtensionCommandContext) => {
			if (process.platform !== "win32") {
				ctx.ui.notify("/migrate 仅支持 Windows", "error");
				return;
			}

			let options: CommandOptions;
			try {
				options = parseArgs(rawArgs);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}

			const dest = options.dest ? resolve(options.dest) : join(homedir(), `pi-migrate-${stamp()}`);
			if (isNonEmptyDir(dest)) {
				ctx.ui.notify(`目标目录已存在且非空：${dest}`, "error");
				return;
			}

			if (ctx.hasUI && !options.yes) {
				const notes = [
					`导出到：${dest}`,
					options.withSecrets ? "包含凭证（auth.json / mcp-auth.json，明文）" : "不含凭证（新机器需重新登录）",
					options.withSessions ? "包含会话历史" : "不含会话历史",
					"不含 bin/（平台相关二进制）",
				];
				const confirmed = await ctx.ui.confirm("导出 pi 配置？", notes.join("\n"));
				if (!confirmed) {
					ctx.ui.notify("已取消，没有写入任何文件", "info");
					return;
				}
			}

			try {
				const result = exportConfig({ dest, withSecrets: options.withSecrets, withSessions: options.withSessions });
				ctx.ui.notify(`配置已导出到 ${result.dest}`, "info");
				// 只在对话里留一份清单，不触发模型回合。
				await pi.sendMessage({ customType: "migrate", content: formatReport(result), display: true }, { triggerTurn: false });
			} catch (error) {
				ctx.ui.notify(`导出失败：${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}
