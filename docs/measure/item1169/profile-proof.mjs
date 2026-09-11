/*
 * Item 1169's proof: running the playtest and a capture script leaves no Chrome
 * profile folder behind in G:/claude-tmp.
 *
 *   node docs/measure/item1169/profile-proof.mjs [--master <unpacked master tree>]
 *
 * Lists the profile-shaped folders (`*-chrome-*`, `*-flipshot-*`) in G:/claude-tmp,
 * then runs, one after another with TEMP and TMP set to G:/claude-tmp:
 *   - with --master, master's own playtest from an unpacked copy, its TEMP pointed at
 *     a scratch folder so its old-style profile never lands in G:/claude-tmp -- the
 *     check-by-check yardstick for "the playtest measures what it did";
 *   - this tree's playtest (port 9531);
 *   - this tree's docs/shots/item-1140/mode7-shots.mjs (port 9533).
 * While each runs it samples G:/claude-tmp every half second for the helper's
 * `pong-chrome-*` folders, so the listing shows the profile existing and then going.
 * Writes profile-proof.json beside this file and prints a summary.
 */
import { spawn } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const TMPROOT = 'G:/claude-tmp';
const i = process.argv.indexOf('--master');
const MASTER = i > 0 ? path.resolve(process.argv[i + 1]) : null;

const listing = () => readdirSync(TMPROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /-chrome-|-flipshot-/.test(d.name)).map((d) => d.name).sort();

function run(label, cwd, args, tempDir) {
  return new Promise((done) => {
    const started = Date.now();
    const child = spawn(process.execPath, args, {
      cwd, env: { ...process.env, TEMP: tempDir, TMP: tempDir }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { out += b; });
    const seen = new Set();
    const sample = setInterval(() => {
      for (const n of listing()) if (n.startsWith('pong-chrome-')) seen.add(n);
    }, 500);
    child.on('exit', (code) => {
      clearInterval(sample);
      const lines = out.split(/\r?\n/);
      done({
        label, cwd, args, exitCode: code, seconds: +((Date.now() - started) / 1000).toFixed(1),
        profilesSeenWhileRunning: [...seen].sort(),
        checks: lines.filter((l) => /^(PASS|FAIL) /.test(l)),
        summary: lines.filter((l) => /checks passed|Error|could not delete/.test(l)),
        output: out
      });
    });
  });
}

const before = listing();
const runs = [];
if (MASTER) {
  const scratchTemp = path.join(TMPROOT, 'item-1169-scratch', 'master-temp');
  mkdirSync(scratchTemp, { recursive: true });
  runs.push(await run('master playtest (old launch, TEMP in scratch)', MASTER, ['tools/playtest.mjs', '--port', '9535'], scratchTemp));
}
runs.push(await run('branch playtest', ROOT, ['tools/playtest.mjs', '--port', '9531'], TMPROOT));
runs.push(await run('branch mode7-shots', ROOT, ['docs/shots/item-1140/mode7-shots.mjs', '--port', '9533'], TMPROOT));
const after = listing();

const result = {
  when: new Date().toISOString(),
  before, after,
  newAfter: after.filter((n) => !before.includes(n)),
  goneAfter: before.filter((n) => !after.includes(n)),
  runs: runs.map(({ output, ...r }) => r),
  mode7Output: runs[runs.length - 1].output
};
writeFileSync(path.join(HERE, 'profile-proof.json'), JSON.stringify(result, null, 1) + '\n');
for (const r of runs) {
  console.log(`${r.label}: exit ${r.exitCode}, ${r.seconds}s, ${r.checks.filter((c) => c.startsWith('PASS')).length} PASS / ` +
    `${r.checks.filter((c) => c.startsWith('FAIL')).length} FAIL; profiles seen while running: ${r.profilesSeenWhileRunning.join(', ') || 'none'}`);
  for (const s of r.summary) console.log('    ' + s);
}
console.log(`before: ${before.length} profile folders; after: ${after.length}; new after: ${result.newAfter.join(', ') || 'none'}`);
