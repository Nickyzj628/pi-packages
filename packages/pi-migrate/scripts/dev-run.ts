import { exportConfig, formatReport } from "../extensions/migrate.ts";

const dest = process.argv[2] ?? `${process.env.HOME ?? process.env.USERPROFILE}/pi-migrate-devtest`;
const result = exportConfig({ dest, withSecrets: true, withSessions: false });
console.log(formatReport(result));
