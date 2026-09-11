/*
 * item 1160 drill: does the scoring check still FAIL when scoring against the
 * computer is really broken? Copies the page, the rules and the tools into a
 * temp directory, stops the player's points counting there (one line of the
 * copy's src/game.js), and runs the playtest's scoring check against the copy.
 * The worktree itself is never touched. Writes broken-run.txt beside itself.
 *
 *   node docs/measure/item1160/broken-scoring-drill.mjs [--port 9362]
 *
 * No dependencies. Exits 0 when the check failed, as it must.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = arg('port', '9362');
const CHECK = 'the player can score against the computer';
const COPY = path.join(os.tmpdir(), 'pong-item1160-broken');

rmSync(COPY, { recursive: true, force: true });
mkdirSync(COPY, { recursive: true });
for (const p of ['index.html', 'src', 'tools']) {
  cpSync(path.join(ROOT, p), path.join(COPY, p), { recursive: true });
}

const game = path.join(COPY, 'src', 'game.js');
const text = readFileSync(game, 'utf8');
const OLD = 'state.score[side] += 1;';
const NEW = "if (side !== 'left') state.score[side] += 1;   // BROKEN ON PURPOSE (item 1160 drill)";
if (text.split(OLD).length !== 2) throw new Error(`expected exactly one "${OLD}" in src/game.js`);
writeFileSync(game, text.replace(OLD, NEW));

const r = spawnSync(process.execPath,
  [path.join(COPY, 'tools', 'playtest.mjs'), '--scoring', '--port', PORT],
  { cwd: COPY, encoding: 'utf8' });
const out = (r.stdout || '').trim();
const line = out.split(/\r?\n/).find((l) => l.includes(CHECK)) || '(no check line)';
const failedAsItMust = line.startsWith('FAIL');
const verdict = failedAsItMust
  ? 'VERDICT: the check FAILED against broken scoring, as it must'
  : 'VERDICT: the check did NOT fail against broken scoring';

console.log(out);
console.log(verdict);
writeFileSync(path.join(HERE, 'broken-run.txt'), [
  `measured ${new Date().toISOString()}`,
  `the break, in a temp copy of src/game.js: ${OLD}  ->  ${NEW}`,
  `playtest exit ${r.status}`,
  out,
  verdict,
  ''
].join('\n'));
rmSync(COPY, { recursive: true, force: true });
process.exitCode = failedAsItMust ? 0 : 1;
