// Token launch radar: read the DefiLlama snapshot, score every pre-token
// protocol with the radar-2 model, and write the board, the dashboard data and
// the dossier the judge reads.
//
//   node main.ts --input <snapshot.json|directory>
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output; inside it the
// program writes to /output. Node standard library only, no network, no build.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBoard, boardIssue, radarData, type Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

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

function parseArgs(argv: string[]): { input: string } {
  let input = '/input/snapshot.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) input = argv[++i]!;
    else if (argv[i]!.startsWith('--input=')) input = argv[i]!.slice('--input='.length);
    else fail(`unknown argument ${argv[i]}`);
  }
  return { input };
}

function readSnapshot(input: string): Snapshot {
  let path = input;
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'snapshot.json');
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    fail(`cannot read the snapshot at ${path}`);
  }
  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(text!) as Snapshot;
  } catch {
    fail(`the snapshot at ${path} is not JSON`);
  }
  if (!Array.isArray(snapshot!.protocols) || !Array.isArray(snapshot!.watchlist)) {
    fail('the snapshot has no protocols or watchlist array');
  }
  return snapshot!;
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
  const { input } = parseArgs(process.argv.slice(2));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const snapshot = readSnapshot(input);
  const board = buildBoard(snapshot);
  const issue = boardIssue(board.rows, snapshot.watchlist);
  if (issue !== null) fail(`the board is not valid: ${issue}`);
  const data = radarData(snapshot, board);

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board.rows })}\n`, 'utf8');
  writeFileSync(join(outDir, 'data.js'), `window.RADAR=${JSON.stringify(data)};\n`, 'utf8');
  copyTree(join(process.cwd(), 'dashboard'), join(outDir, 'dashboard'));
  copyTree(join(process.cwd(), 'screenshots'), join(outDir, 'screenshots'));
  const shots = readdirSync(join(outDir, 'screenshots')).filter((n) => !n.startsWith('.'));
  if (shots.length < 3) fail(`the dossier needs at least 3 screenshots, found ${shots.length}`);
  const dossier = buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: SCREENSHOT_MAX, max_bytes: SCREENSHOT_MAX_BYTES },
    dashboard: { max_files: DASHBOARD_MAX_FILES, max_bytes: DASHBOARD_MAX_BYTES },
  });
  if (dossier.length > DOSSIER_MAX_BYTES) {
    fail(`the dossier is ${dossier.length} bytes, over the ${DOSSIER_MAX_BYTES} it may hold`);
  }
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const top = board.rows[0]!;
  console.log(
    `token radar: ${snapshot.protocols.length} protocols, ${board.watchlistSize} on the watchlist, ` +
      `${board.rows.length} rows scored (${board.earlySize} early, ${board.liveSize} live set aside)`,
  );
  console.log(
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ` +
      `${join(outDir, 'dashboard')} (${readdirSync(join(outDir, 'dashboard')).length} files), ` +
      `${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}`,
  );
  console.log(`token radar: top implied value ${top.name} $${top.implied_value_usd.toLocaleString('en-US')}`);
}

main();
