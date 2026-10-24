import { exportConfig, exportDirName, formatReport } from "../extensions/migrate.ts";

const dest = process.argv[2] ?? `./${exportDirName()}`;
console.log(formatReport(exportConfig(dest)));
