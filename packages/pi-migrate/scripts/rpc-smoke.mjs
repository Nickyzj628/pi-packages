import { spawn } from "node:child_process";

const dest = process.argv[2] ?? "/tmp/pi-mig-rpc";
const child = spawn("pi", ["--mode", "rpc", "--no-mcp"], { shell: true, cwd: process.cwd() });

let buffer = "";
const lines = [];
child.stdout.on("data", (chunk) => {
	buffer += chunk.toString("utf8");
	let index;
	while ((index = buffer.indexOf("\n")) >= 0) {
		const line = buffer.slice(0, index).trim();
		buffer = buffer.slice(index + 1);
		if (!line) continue;
		lines.push(JSON.parse(line));
	}
});
child.stderr.on("data", (chunk) => process.stderr.write(`[stderr] ${chunk}`));

const send = (obj) => child.stdin.write(`${JSON.stringify(obj)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await sleep(2500);
send({ id: "1", type: "get_commands" });
await sleep(1500);
const cmds = lines.find((l) => l.command === "get_commands");
console.log("commands:", JSON.stringify(cmds?.data?.commands?.filter((c) => c.source === "extension"), null, 1));

send({ id: "2", type: "prompt", message: `/migrate --yes --no-secrets ${dest}` });
await sleep(4000);
console.log("prompt response:", JSON.stringify(lines.filter((l) => l.id === "2")));
console.log("custom/migrate messages:", JSON.stringify(lines.filter((l) => l.type === "message" || l.type === "custom").slice(-4), null, 1).slice(0, 2000));
child.kill();
process.exit(0);
