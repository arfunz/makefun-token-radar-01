// Emit: copy the dashboard sources and the screenshots into the output
// directory, then write dossier.json with the kit's buildDossier library.
// Paths resolve from this file's own location, never from the process's
// working directory.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "../vendor/makefun-board.ts";

export const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else cpSync(s, d);
  }
}

export function emitDashboard(outDir: string, dataJs: string): { dashboardTextBytes: number } {
  const outDash = join(outDir, "dashboard");
  rmSync(outDash, { recursive: true, force: true });
  mkdirSync(outDash, { recursive: true });
  copyDir(join(REPO_ROOT, "dashboard"), outDash);
  writeFileSync(join(outDash, "data.js"), dataJs);
  let bytes = 0;
  for (const name of readdirSync(outDash)) {
    bytes += statSync(join(outDash, name)).size;
  }
  return { dashboardTextBytes: bytes };
}

export function emitScreenshots(outDir: string): number[] {
  const outShots = join(outDir, "screenshots");
  rmSync(outShots, { recursive: true, force: true });
  mkdirSync(outShots, { recursive: true });
  copyDir(join(REPO_ROOT, "screenshots"), outShots);
  return readdirSync(outShots)
    .filter((n) => !n.startsWith("."))
    .map((n) => statSync(join(outShots, n)).size);
}

export async function emitDossier(outDir: string): Promise<number> {
  const bytes = await buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, "dossier.json"), bytes);
  return bytes.byteLength;
}

export function outExists(path: string): boolean {
  return existsSync(path);
}
