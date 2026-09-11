/*
 * The one way this repo's scripts start Chrome (item 1169): on a profile folder
 * of its own, made fresh under the temp directory, and deleted when Chrome
 * exits -- when the script finishes, when it throws, and on Ctrl+C.
 *
 *   import { launchChrome } from '../tools/chrome.mjs';
 *   const chrome = launchChrome(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, url],
 *     { name: 'playtest' });
 *   try { ...drive it over the DevTools port... } finally { await chrome.close(); }
 *
 * The caller's flags go to Chrome exactly as given; the helper adds only
 * --user-data-dir, and refuses flags that already carry one, because a
 * hand-built profile folder is the thing that was never cleaned up: every
 * capture script of 2026-09-10 left one or more 18 MB folders in G:/claude-tmp.
 *
 * The folder is `<temp>/pong-chrome-<name>-XXXXXX` (os.tmpdir(), so TEMP/TMP
 * decide where), unique per launch, so two scripts on two ports never share one.
 * Plain Node, no dependencies.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Every Chrome started here and not yet cleaned up, for the exit and signal hooks. */
const live = new Set();
let hooked = false;

const GAP_MS = 100;
const TRIES = 50; // five seconds: Windows holds the profile's files for a moment after Chrome ends

/** Sleep without the event loop -- the only kind of wait an 'exit' handler can do. */
function pauseSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function tryRemove(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* still locked: try again */ }
  return !existsSync(dir);
}

/** Delete a profile folder, retrying while Windows still holds it. True once it is gone. */
export function removeProfileSync(dir) {
  for (let i = 0; i < TRIES; i++) {
    if (tryRemove(dir)) return true;
    pauseSync(GAP_MS);
  }
  return false;
}

/** The same, without blocking the event loop. */
export async function removeProfile(dir) {
  for (let i = 0; i < TRIES; i++) {
    if (tryRemove(dir)) return true;
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  return false;
}

/** Stop Chrome and everything it started (renderer, GPU, crash handler), which hold the profile. */
function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  }
  try { child.kill(); } catch { /* already gone */ }
}

function warn(dir) {
  process.stderr.write(`chrome.mjs: could not delete the Chrome profile ${dir}\n`);
}

function installHooks() {
  if (hooked) return;
  hooked = true;
  // Covers the normal end, process.exit() from inside a script, and an uncaught error.
  process.on('exit', () => {
    for (const launch of [...live]) launch.closeSync();
  });
  // A listener on a signal replaces Node's own exit, so this one has to exit too.
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGBREAK', 149], ['SIGHUP', 129]]) {
    process.on(signal, () => {
      for (const launch of [...live]) launch.closeSync();
      process.exit(code);
    });
  }
}

/**
 * Start Chrome on a fresh profile folder. Returns { child, pid, profile, exited, close, closeSync }:
 * `exited` resolves once Chrome has ended and its folder has been deleted (true if the delete
 * worked), `close()` stops Chrome and waits for that, `closeSync()` does both without the event
 * loop. Nothing needs calling for the folder to go -- Chrome ending on its own deletes it, and so
 * does the script ending -- but `await chrome.close()` in a `finally` is the tidy shape.
 */
export function launchChrome(executable, args = [], { name = 'chrome', spawnOptions = {} } = {}) {
  if (!executable) throw new Error('No Chrome found; pass the path to chrome.exe');
  if (args.some((a) => String(a).startsWith('--user-data-dir'))) {
    throw new Error('launchChrome makes the profile folder itself; do not pass --user-data-dir');
  }
  installHooks();
  const profile = mkdtempSync(path.join(os.tmpdir(), `pong-chrome-${name}-`));
  const child = spawn(executable, [...args, '--user-data-dir=' + profile], { stdio: 'ignore', ...spawnOptions });

  let settled = false;
  let resolveExited;
  const exited = new Promise((r) => { resolveExited = r; });
  const launch = {
    child,
    pid: child.pid,
    profile,
    exited,
    async close() {
      killTree(child);
      return exited;
    },
    closeSync() {
      killTree(child);
      if (settled) return;
      settled = true;
      live.delete(launch);
      const gone = removeProfileSync(profile);
      if (!gone) warn(profile);
      resolveExited(gone);
    }
  };
  live.add(launch);

  const onEnd = async () => {
    if (settled) return;
    const gone = await removeProfile(profile);
    if (settled) return; // closeSync got there first
    settled = true;
    live.delete(launch);
    if (!gone) warn(profile);
    resolveExited(gone);
  };
  child.once('exit', onEnd);
  child.once('error', onEnd); // Chrome never started (a bad path): the empty folder still goes
  return launch;
}
