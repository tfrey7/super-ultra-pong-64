/*
 * Item 1182's proof: run `tools/playtest.mjs --ladder`, and once the ladder walk
 * has started, kill the harness's own Chrome by its recorded pid. Then record
 * what the playtest printed, whether it printed a summary, and its exit code.
 *
 *   node docs/measure/item1182/drop-repro.mjs <label> [playtest.mjs] [port]
 *
 * The pid is the one the playtest prints ("chrome: pid N"); a playtest from
 * before item 1182 prints none, so for that one the pid is looked up as the
 * chrome.exe whose parent is the playtest's node process. Writes
 * drop-repro-<label>.json and drop-repro-<label>.log beside this script.
 */
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] || 'branch';
const playtest = path.resolve(process.argv[3] || path.join(HERE, '..', '..', '..', 'tools', 'playtest.mjs'));
const port = process.argv[4] || '9411';
const TRIGGER = 'the ladder walk starts a fresh match on era 0';

function childChrome(parentPid) {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${parentPid} AND Name='chrome.exe'").ProcessId`],
    { encoding: 'utf8', windowsHide: true });
  const pid = Number(out.trim().split(/\s+/)[0]);
  return pid || null;
}

const t0 = Date.now();
const node = spawn(process.execPath, [playtest, '--ladder', '--port', port], { windowsHide: true });
let out = '';
let pid = null;
let pidFrom = null;
let killedAt = null;
let killNote = null;
const onData = (d) => {
  out += d;
  const m = /chrome: pid (\d+)/.exec(out);
  if (m && !pid) { pid = Number(m[1]); pidFrom = 'printed by the playtest'; }
  if (!killedAt && out.includes(TRIGGER)) {
    killedAt = -1; // armed
    setTimeout(() => {
      if (!pid) { pid = childChrome(node.pid); pidFrom = 'looked up as the playtest\'s chrome.exe child'; }
      try { process.kill(pid); killNote = `killed pid ${pid}`; } catch (e) { killNote = `kill failed: ${e.message}`; }
      killedAt = Date.now();
    }, 1500);
  }
};
node.stdout.on('data', onData);
node.stderr.on('data', onData);

const guard = setTimeout(() => { killNote = (killNote || '') + '; playtest still running 90 s after start, stopped'; node.kill(); }, 90000);
node.on('exit', (code, signal) => {
  clearTimeout(guard);
  const lines = out.split(/\r?\n/).filter(Boolean);
  const result = {
    label, playtest, port: Number(port),
    chromePid: pid, pidFrom, killNote,
    secondsFromStartToKill: killedAt > 0 ? +((killedAt - t0) / 1000).toFixed(1) : null,
    secondsFromKillToExit: killedAt > 0 ? +((Date.now() - killedAt) / 1000).toFixed(1) : null,
    exitCode: code, signal,
    printedSummary: /\d+\/\d+ checks passed/.test(out),
    failLines: lines.filter((l) => l.startsWith('FAIL')),
    lastLine: lines[lines.length - 1] || '',
    lineCount: lines.length
  };
  writeFileSync(path.join(HERE, `drop-repro-${label}.log`), out);
  writeFileSync(path.join(HERE, `drop-repro-${label}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
});
