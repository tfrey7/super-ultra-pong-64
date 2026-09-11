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
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

/*
 * A debugging port somebody else holds (item 1215). Chrome that cannot bind its
 * --remote-debugging-port starts anyway, with no port, and the DevTools endpoint
 * on that number is still the OTHER Chrome's -- so a harness that connects to it
 * drives another worker's page. On 2026-09-10 item 1181's playtest spent a
 * minute clicking item 1205's game on port 9341 and reported 16/21 from it.
 *
 * portTaken(port) answers before launch: taken if we cannot listen on it at
 * 127.0.0.1 (where Chrome binds it), or if something answers a connect there
 * (a listener on 0.0.0.0 does not always stop a 127.0.0.1 bind on Windows).
 */
export function portTaken(port, { host = '127.0.0.1', connectMs = 400 } = {}) {
  const listens = () => new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
  const answers = () => new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (yes) => { clearTimeout(timer); sock.destroy(); resolve(yes); };
    const timer = setTimeout(() => done(false), connectMs);
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
  return listens().then(async (free) => !free || await answers());
}

/** The one line a harness prints when its port is taken; it names the port and the way out. */
export function portTakenLine(port) {
  return `playtest: port ${port} is already in use by another program (probably another worker's Chrome); ` +
    `pick another with --port <n> -- nothing was launched`;
}

/** A URL compared as a file: no query, no hash, percent-decoded, and case-blind on Windows. */
function samePage(u) {
  let s = String(u || '');
  s = s.split('#')[0].split('?')[0];
  try { s = decodeURI(s); } catch { /* leave it as it is */ }
  s = s.replace(/\\/g, '/');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

/**
 * Which DevTools target is OUR page. `targets` is Chrome's /json/list, `asked` the file URL the
 * harness launched Chrome on. Answers { own } with the target whose URL is that page, or
 * { foreign } with a page that is plainly somebody else's (a real URL that is not ours -- our
 * Chrome was started on our page, so it cannot be showing another checkout's), or {} while
 * Chrome is still coming up (no page yet, or only about:blank).
 */
export function pickOwnPage(targets, asked) {
  const want = samePage(asked);
  const pages = (targets || []).filter((t) => t && t.type === 'page' && t.webSocketDebuggerUrl);
  const own = pages.find((t) => samePage(t.url) === want);
  if (own) return { own };
  const foreign = pages.find((t) => t.url && !/^(about:|chrome:|chrome-error:|devtools:)/.test(t.url));
  return foreign ? { foreign } : {};
}

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
