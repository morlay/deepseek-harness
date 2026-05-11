import { analyzeLog, formatStats } from "../src/testing/analyze-logs.ts";

const file = process.argv[2];
if (!file) {
  console.error("用法: just analyze-log <log-file>");
  process.exit(1);
}

const stats = await analyzeLog(file);
console.log(formatStats(stats));
