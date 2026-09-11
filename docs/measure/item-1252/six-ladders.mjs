// Item 1252: six `node tools/playtest.mjs --ladder` runs in a row, one log each
// beside this script (ladder-run1.log .. ladder-run6.log), then one summary line
// per run naming its "era changes start from both edges" verdict.
//
//   node docs/measure/item-1252/six-ladders.mjs [--port 9521] [--runs 6]
//
// Each run gets its own debugging port (the base plus 2 per run) so a Chrome that
// is slow to let go of the last one never refuses the next.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const base = arg('--port', 9521);
const runs = arg('--runs', 6);

const summary = [];
for (let n = 1; n <= runs; n++) {
  const port = base + 2 * (n - 1);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['tools/playtest.mjs', '--ladder', '--port', String(port)],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '');
  const file = path.join(here, `ladder-run${n}.log`);
  writeFileSync(file, out);
  const line = out.split(/\r?\n/).find((l) => l.includes('era changes start from both edges')) || '(no both-edges line)';
  const verdict = /\bPASS\b/.test(line) ? 'PASS' : /\bFAIL\b/.test(line) ? 'FAIL' : '??';
  const s = `run ${n} (port ${port}, exit ${r.status}, ${((Date.now() - t0) / 1000).toFixed(0)} s): both edges ${verdict}`;
  summary.push(s + '\n    ' + line.trim());
  console.log(s);
}
writeFileSync(path.join(here, 'summary.txt'), summary.join('\n') + '\n');
console.log(summary.join('\n'));
