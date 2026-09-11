/*
 * Item 1169's third proof: does a fresh profile per launch change what
 * docs/shots/item-1140/mode7-shots.mjs measures?
 *
 *   node docs/measure/item1169/mode7-ab.mjs --master <unpacked master tree> [--rounds 2]
 *
 * Master's version reuses one hand-built profile per port, so its first run is
 * cold and every run after it is warm; the branch's version is cold every time.
 * This alternates master and branch runs, `rounds` of each (master's profile is
 * kept in a scratch TEMP so the warm reuse really happens), and records each
 * run's baseline and ring-frame timing and its first-ring hitch. Writes
 * mode7-ab.json beside this file. The branch runs rewrite item 1140's tracked
 * outputs; restore them afterwards with git checkout.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const MASTER = path.resolve(arg('master'));
const ROUNDS = Number(arg('rounds', 2));
const SCRATCH_TEMP = path.join('G:/claude-tmp', 'item-1169-scratch', 'mode7-master-temp');
mkdirSync(SCRATCH_TEMP, { recursive: true });

function once(label, tree, temp) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['docs/shots/item-1140/mode7-shots.mjs', '--port', '9551'],
    { cwd: tree, encoding: 'utf8', env: { ...process.env, TEMP: temp, TMP: temp }, timeout: 120000 });
  let out = {};
  try { out = JSON.parse(readFileSync(path.join(tree, 'docs/shots/item-1140/mode7-shots.json'), 'utf8')); } catch { /* none */ }
  return {
    label, exitCode: r.status, seconds: +((Date.now() - t0) / 1000).toFixed(1),
    baseline: out.baseline, ringFrames: out.ringFrames,
    firstHitchMs: out.hitches && out.hitches[0] ? out.hitches[0].ms : null,
    errors: out.errors
  };
}

const runs = [];
for (let i = 1; i <= ROUNDS; i++) {
  runs.push(once(`master run ${i} (${i === 1 ? 'cold' : 'warm, reused'} profile)`, MASTER, SCRATCH_TEMP));
  runs.push(once(`branch run ${i} (fresh profile)`, ROOT, 'G:/claude-tmp'));
}
writeFileSync(path.join(HERE, 'mode7-ab.json'), JSON.stringify({ when: new Date().toISOString(), runs }, null, 1) + '\n');
for (const r of runs) {
  console.log(`${r.label}: exit ${r.exitCode}, baseline mean ${r.baseline && r.baseline.meanMs} ms; ring ` +
    `${r.ringFrames && r.ringFrames.frames} frames, mean ${r.ringFrames && r.ringFrames.meanMs}, p95 ${r.ringFrames && r.ringFrames.p95Ms}, ` +
    `max ${r.ringFrames && r.ringFrames.maxMs}; first hitch ${r.firstHitchMs} ms`);
}
