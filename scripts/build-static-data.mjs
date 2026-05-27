import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAggregatedShops } from "../server.js";

const prefs = (process.env.PREFS || "tokyo,kanagawa,osaka,aichi,fukuoka")
  .split(",")
  .map((pref) => pref.trim())
  .filter(Boolean);
const limit = Math.min(Number(process.env.SNAPSHOT_LIMIT || 40), 80);
const outputDir = join(process.cwd(), "public", "data");

await mkdir(outputDir, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  limit,
  prefs,
  files: [],
};

for (const pref of prefs) {
  console.log(`Building snapshot for ${pref} (${limit})`);
  const data = await getAggregatedShops({ pref, limit, enrich: true });
  const fileName = `shops-${pref}.json`;
  await writeFile(join(outputDir, fileName), JSON.stringify(data, null, 2));
  manifest.files.push({ pref, fileName, count: data.count, fetchedAt: data.source.fetchedAt });
}

await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${manifest.files.length} snapshot files to ${outputDir}`);
