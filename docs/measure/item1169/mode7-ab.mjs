/*
 * Item 1169's third proof: does a fresh profile per launch change what
 * docs/shots/item-1140/mode7-shots.mjs measures?
 *
 *   git show master:docs/shots/item-1140/mode7-shots.mjs > docs/shots/item-1140/mode7-old-ab.mjs
 *   node docs/measure/item1169/mode7-ab.mjs [--rounds 3]
 *   (then delete mode7-old-ab.mjs and git checkout docs/shots/item-1140)
 *
 * Both scripts run from THIS tree, so they draw the same page and the only
 * difference is how Chrome is started. The old one (master's, before item 1169)
 * reuses one hand-built profile per port -- cold on its first run, warm after --
 * kept here in a scratch TEMP so it never lands in G:/claude-tmp itself; the new
 * one gets a fresh folder from tools/chrome.mjs every time. Runs alternate, old
 * then new, `rounds` of each, and each run's baseline and ring-frame timing and
 * first-ring hitch are recorded in mode7-ab.json beside this file.
 *
 * An earlier pass (kept in git history at 26de488^) compared master's TREE with
 * the branch's and was confounded: master's copy was a newer page.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const ROUNDS = Number(arg('rounds', 3));
const OLD = 'docs/shots/item-1140/mode7-old-ab.mjs';
const NEW = 'docs/shots/item-1140/mode7-shots.mjs';
if (!existsSync(path.join(ROOT, OLD))) throw new Error(`put master's mode7-shots.mjs at ${OLD} first`);
const SCRATCH_TEMP = path.join('G:/claude-tmp', 'item-1169-scratch', 'mode7-old-temp');
mkdirSync(SCRATCH_TEMP, { recursive: true });

function once(label, script, temp) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [script, '--port', '9551'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, TEMP: temp, TMP: temp }, timeout: 120000 });
  let out = {};
  try { out = JSON.parse(readFileSync(path.join(ROOT, 'docs/shots/item-1140/mode7-shots.json'), 'utf8')); } catch { /* none */ }
  return {
    label, exitCode: r.status, seconds: +((Date.now() - t0) / 1000).toFixed(1),
    baseline: out.baseline, ringFrames: out.ringFrames,
    firstHitchMs: out.hitches && out.hitches[0] ? out.hitches[0].ms : null,
    hitches: (out.hitches || []).map((h) => h.ms), errors: out.errors
  };
}

const runs = [];
for (let i = 1; i <= ROUNDS; i++) {
  runs.push(once(`old launch, run ${i} (${i === 1 ? 'cold' : 'warm, reused'} profile)`, OLD, SCRATCH_TEMP));
  runs.push(once(`new launch, run ${i} (fresh profile)`, NEW, 'G:/claude-tmp'));
}
writeFileSync(path.join(HERE, 'mode7-ab.json'), JSON.stringify({ when: new Date().toISOString(), runs }, null, 1) + '\n');
for (const r of runs) {
  console.log(`${r.label}: exit ${r.exitCode}, baseline mean ${r.baseline && r.baseline.meanMs} ms; ring ` +
    `${r.ringFrames && r.ringFrames.frames} frames, mean ${r.ringFrames && r.ringFrames.meanMs}, p95 ${r.ringFrames && r.ringFrames.p95Ms}, ` +
    `max ${r.ringFrames && r.ringFrames.maxMs}; hitches ${r.hitches.join(', ') || 'none'}`);
}
