// radar-4: the calibrated radar. Reads /input/snapshot.json, fits the
// value model at runtime from the snapshot's own tokened comparables,
// ranks 198 pre-token protocols (the 40-slug watchlist plus 158 early
// finds), and writes board.json, the dashboard and dossier.json.
//
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
// The grader runs `node main.ts` with /input/snapshot.json and /output.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildBoard, checkGate, type BoardRow } from "./lib/board.ts";
import { buildDashboardData } from "./lib/data.ts";
import { emitDashboard, emitDossier, emitScreenshots } from "./lib/emit.ts";
import type { Snapshot } from "./lib/model.ts";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const inputPath = argValue("--input") ?? "/input/snapshot.json";
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });

  const snap: Snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
  const { rows, audit, fit } = buildBoard(snap);

  const boardPath = join(outDir, "board.json");
  writeFileSync(boardPath, JSON.stringify({ rows, as_of: snap.as_of }, null, 2) + "\n");

  const dataJs = buildDashboardData(rows, audit, fit, snap.as_of);
  const { dashboardTextBytes } = emitDashboard(outDir, dataJs);
  const shotBytes = emitScreenshots(outDir);
  const dossierBytes = await emitDossier(outDir);

  const errors = checkGate(rows, snap.watchlist, dossierBytes, dashboardTextBytes, shotBytes);
  if (errors.length > 0) {
    console.error(`GATE FAIL (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // Post-write assertion: re-read board.json from disk and re-check the
  // gate on what was actually written, so a truncated or corrupted write
  // can never pass as a good run. The in-memory rows are not trusted here.
  const written = JSON.parse(readFileSync(boardPath, "utf8")) as { rows: BoardRow[] };
  const reErrors = checkGate(written.rows, snap.watchlist, dossierBytes, dashboardTextBytes, shotBytes);
  if (reErrors.length > 0) {
    console.error(`POST-WRITE GATE FAIL (${reErrors.length}):`);
    for (const e of reErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
  const dossierOnDisk = readFileSync(join(outDir, "dossier.json"));
  if (dossierOnDisk.byteLength !== dossierBytes) {
    console.error(
      `POST-WRITE GATE FAIL: dossier.json on disk is ${dossierOnDisk.byteLength} bytes, expected ${dossierBytes}`,
    );
    process.exit(1);
  }

  console.log(
    `radar-4 ok: ${rows.length} rows, curve log10(mcap) = ${fit.inter.toFixed(4)} + ${fit.slope.toFixed(4)}*log10(TVL), R2=${fit.r2.toFixed(3)}`,
  );
  console.log(
    `LOO miss x${fit.loo.miss.toFixed(2)} (flat x${fit.flatLoo.miss.toFixed(2)}), ` +
      `time-split x${fit.timeSplit.curveMiss.toFixed(2)} (flat x${fit.timeSplit.flatMiss.toFixed(2)}), ` +
      `dossier ${dossierBytes} bytes, dashboard text ${dashboardTextBytes} bytes`,
  );
}

await main();
