// Token launch radar: read the DefiLlama snapshot, score every pre-token
// protocol with the radar-3 model, and write the board, the dashboard data and
// the dossier the judge reads.
//
//   node main.ts --input <snapshot.json> --output <dir>
//
// --input defaults to /input/snapshot.json (the grader's sealed input), with
// a fallback to input/snapshot.json beside this script for local runs.
// --output defaults to $MAKEFUN_OUTPUT_DIR, then /output. Node standard
// library only, no network, no build.
//
// The dashboard and screenshots live next to this script, not next to the
// grader's working directory: the grader runs `node /bot/main.ts` with a
// cwd that is not /bot, so resolving them from process.cwd() crashes with
// ENOENT. They are resolved from the script's own location instead.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, boardIssue, type Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const TEXT_MAX_BYTES = 65536;
const DOSSIER_MAX_BYTES = 1572864;
const SCREENSHOT_MAX = 4;
const SCREENSHOT_MAX_BYTES = 524288;
const DASHBOARD_MAX_FILES = 400;
const DASHBOARD_MAX_BYTES = 4194304;

function fail(message: string): never {
  console.error(`token radar: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '';
  let output = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) input = argv[++i]!;
    else if (argv[i] === '--output' && i + 1 < argv.length) output = argv[++i]!;
    else if (argv[i]!.startsWith('--input=')) input = argv[i]!.slice('--input='.length);
    else if (argv[i]!.startsWith('--output=')) output = argv[i]!.slice('--output='.length);
  }
  if (!input) {
    input = existsSync('/input/snapshot.json')
      ? '/input/snapshot.json'
      : join(SCRIPT_DIR, 'input', 'snapshot.json');
  }
  if (!output) output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  return { input, output };
}

function copyTree(src: string, dst: string): void {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
  }
}

function main(): void {
  const { input, output: outDir } = parseArgs(process.argv.slice(2));
  if (!existsSync(input)) fail(`snapshot not found: ${input}`);
  const snapshot = JSON.parse(readFileSync(input, 'utf8')) as Snapshot;
  if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist)) {
    fail(`${input} is not a token-radar snapshot`);
  }
  const result = buildBoard(snapshot);
  const issue = boardIssue(result);
  if (issue !== null) fail(issue);

  mkdirSync(outDir, { recursive: true });
  const board = {
    meta: {
      title: 'Token launch radar — pre-token protocols ranked by implied value',
      model: 'radar-3: power-law size curve fitted on the snapshot’s own tokened comparables',
      as_of: result.as_of,
      source: result.source,
      floor_usd: result.floor_usd,
      watchlist_covered: `${result.audit.watchlist}/40`,
      rows: result.rows.length,
    },
    model: result.model,
    audit: result.audit,
    rows: result.rows,
  };
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(board, null, 2)}\n`);
  const data = {
    meta: board.meta,
    model: result.model,
    audit: result.audit,
    rows: result.rows,
    scatter_tokened: result.scatter_tokened,
    scatter_estimates: result.scatter_estimates,
  };
  writeFileSync(join(outDir, 'data.js'), `window.RADAR = ${JSON.stringify(data)};\n`);

  // Resolved from the script's own location — never process.cwd().
  copyTree(join(SCRIPT_DIR, 'dashboard'), join(outDir, 'dashboard'));
  copyTree(join(SCRIPT_DIR, 'screenshots'), join(outDir, 'screenshots'));
  const shots = readdirSync(join(outDir, 'screenshots')).filter((n) => !n.startsWith('.'));
  if (shots.length < 3) fail(`the dossier needs at least 3 screenshots, found ${shots.length}`);

  const dossier = buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: SCREENSHOT_MAX, max_bytes: SCREENSHOT_MAX_BYTES },
    dashboard: { max_files: DASHBOARD_MAX_FILES, max_bytes: DASHBOARD_MAX_BYTES },
  });
  if (dossier.length > DOSSIER_MAX_BYTES) {
    fail(`dossier is ${dossier.length} bytes, over the 1.5 MiB cap`);
  }
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const top = result.rows[0]!;
  console.log(
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ` +
      `${join(outDir, 'dashboard')} (${readdirSync(join(outDir, 'dashboard')).length} files), ` +
      `${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}`,
  );
  console.log(
    `token radar: ${result.rows.length} rows, watchlist ${result.audit.watchlist}/40, ` +
      `top implied value ${top.name} $${top.implied_usd.toLocaleString('en-US')}`,
  );
}

main();
