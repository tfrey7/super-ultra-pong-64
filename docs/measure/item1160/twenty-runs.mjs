/*
 * item 1160 proof: run the playtest's scoring check N times in a row (default
 * 20) and count how many passed. Every run is a fresh Chrome on the real page;
 * the line counted is the playtest's own "the player can score against the
 * computer" output. Writes twenty-runs.txt beside itself.
 *
 *   node docs/measure/item1160/twenty-runs.mjs [--runs 20] [--port 9361]
 *
 * No dependencies. Exits 0 only when every run passed.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUNS = Number(arg('runs', 20));
const PORT = arg('port', '9361');
const CHECK = 'the player can score against the computer';

const rows = [];
let passed = 0;
for (let i = 1; i <= RUNS; i++) {
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'tools', 'playtest.mjs'), '--scoring', '--port', PORT],
    { cwd: ROOT, encoding: 'utf8' });
  const line = (r.stdout || '').split(/\r?\n/).find((l) => l.includes(CHECK)) ||
    `(no "${CHECK}" line) ${(r.stderr || '').trim()}`;
  if (line.startsWith('PASS')) passed += 1;
  const row = `run ${String(i).padStart(2)} exit ${r.status}: ${line}`;
  console.log(row);
  rows.push(row);
}

const summary = `${passed}/${RUNS} consecutive runs passed "${CHECK}"`;
console.log(summary);
writeFileSync(path.join(HERE, 'twenty-runs.txt'),
  [`measured ${new Date().toISOString()}`, ...rows, summary, ''].join('\n'));
process.exitCode = passed === RUNS ? 0 : 1;
