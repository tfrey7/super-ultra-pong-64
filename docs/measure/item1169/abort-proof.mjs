/*
 * Item 1169's second proof: the helper's error and Ctrl+C paths, against REAL
 * Chrome rather than the stand-in the unit test uses.
 *
 *   node docs/measure/item1169/abort-proof.mjs
 *
 * For each ending it runs a small script that launches headless Chrome through
 * tools/chrome.mjs, waits until Chrome answers on its debugging port (so the
 * profile is really in use and holds real file locks), then ends:
 *   - error:  an uncaught throw
 *   - ctrl-c: process.emit('SIGINT'), the handler Node runs on Ctrl+C
 *             (Windows gives a script no way to press Ctrl+C in another
 *             process's console, so the handler is driven directly)
 *   - exit:   process.exit(3) from inside the script
 * and then checks that the profile folder is gone and that the Chrome it
 * started is no longer running. Writes abort-proof.json beside this file.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const HELPER = pathToFileURL(path.join(ROOT, 'tools', 'chrome.mjs')).href;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));

const alive = (pid) => {
  const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8', windowsHide: true });
  return r.stdout.includes(String(pid));
};

function run(label, how, port) {
  const code = `import { launchChrome } from ${JSON.stringify(HELPER)};
    const c = launchChrome(${JSON.stringify(CHROME)}, ['--headless=new', '--disable-gpu', '--mute-audio',
      '--remote-debugging-port=${port}', '--no-first-run', '--no-default-browser-check', 'about:blank'], { name: 'abort' });
    console.log(JSON.stringify({ profile: c.profile, pid: c.pid }));
    let up = false;
    for (let i = 0; i < 100 && !up; i++) {
      try { up = (await fetch('http://127.0.0.1:${port}/json/version')).ok; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    console.log(JSON.stringify({ answered: up }));
    ${how}`;
  const started = Date.now();
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 60000 });
  const lines = r.stdout.trim().split(/\r?\n/).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  const { profile, pid } = lines[0] || {};
  const answered = !!(lines[1] && lines[1].answered);
  return {
    label, exitCode: r.status, seconds: +((Date.now() - started) / 1000).toFixed(1),
    chromeAnsweredBeforeTheEnd: answered, profile,
    profileLeft: profile ? existsSync(profile) : null,
    chromePid: pid, chromeStillRunning: pid ? alive(pid) : null,
    stderr: r.stderr.trim().split(/\r?\n/).filter(Boolean).slice(0, 3)
  };
}

const runs = [
  run('error (uncaught throw)', "throw new Error('boom');", 9541),
  run('ctrl-c (the SIGINT handler)', "process.emit('SIGINT');", 9542),
  run('exit (process.exit(3))', 'process.exit(3);', 9543)
];
writeFileSync(path.join(HERE, 'abort-proof.json'), JSON.stringify({ when: new Date().toISOString(), chrome: CHROME, runs }, null, 1) + '\n');
for (const r of runs) {
  console.log(`${r.label}: exit ${r.exitCode}, ${r.seconds}s, Chrome answered first: ${r.chromeAnsweredBeforeTheEnd}, ` +
    `profile left: ${r.profileLeft}, Chrome still running: ${r.chromeStillRunning}`);
}
