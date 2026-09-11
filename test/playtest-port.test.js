// The playtest refuses a DevTools port somebody else already holds (item 1215).
// On 2026-09-10 a playtest on port 9341 launched its own Chrome, which could not
// bind the port, then attached to the Chrome that did -- another worker's game --
// and drove it for a minute. A throwaway listener stands in for that Chrome here,
// so no browser is needed: the refusal has to come before Chrome is launched.
const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const HELPER = pathToFileURL(path.join(ROOT, 'tools', 'chrome.mjs')).href;
const load = () => import(HELPER);

/** A listener on a free port the OS picks; resolves { server, port }. */
function listener(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((sock) => sock.destroy());
    server.once('error', reject);
    server.listen(0, host, () => resolve({ server, port: server.address().port }));
  });
}
const close = (server) => new Promise((r) => server.close(r));

/** Run the playtest on a port, with a Chrome path that cannot exist, and collect what it says. */
function playtest(port) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath,
      [path.join(ROOT, 'tools', 'playtest.mjs'), '--port', String(port), '--chrome', path.join(ROOT, 'no-such-chrome.exe')],
      { cwd: ROOT, windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill(), 20000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

test('portTaken: a port with a listener on 127.0.0.1 is taken, and free once it closes', async () => {
  const { portTaken } = await load();
  const { server, port } = await listener('127.0.0.1');
  assert.strictEqual(await portTaken(port), true);
  await close(server);
  assert.strictEqual(await portTaken(port), false);
});

test('portTaken: a listener on every address (0.0.0.0) takes the port too', async () => {
  const { portTaken } = await load();
  const { server, port } = await listener('0.0.0.0');
  try {
    assert.strictEqual(await portTaken(port), true);
  } finally {
    await close(server);
  }
});

test('the playtest refuses a taken port: one line naming it, a non-zero exit, no Chrome launched', async () => {
  const { server, port } = await listener('127.0.0.1');
  let r;
  try {
    r = await playtest(port);
  } finally {
    await close(server);
  }
  assert.notStrictEqual(r.code, 0, 'the playtest exited 0 on a taken port');
  const lines = r.err.trim().split(/\r?\n/);
  assert.strictEqual(lines.length, 1, 'expected one line, got: ' + r.err);
  assert.match(lines[0], new RegExp(`port ${port}\\b`));
  assert.match(lines[0], /--port/);
  assert.doesNotMatch(r.out, /chrome: pid/, 'a Chrome was launched on a taken port');
  assert.doesNotMatch(r.out, /PASS|FAIL/, 'checks ran against a port that was not ours');
});

test('pickOwnPage attaches only to this checkout\'s index.html', async () => {
  const { pickOwnPage } = await load();
  const asked = 'file:///G:/Claude Stuff/super-ultra-pong-64-item-1181/index.html?era=3&title=on';
  const ws = (n) => 'ws://127.0.0.1:9341/devtools/page/' + n;
  const ours = { type: 'page', url: 'file:///G:/Claude%20Stuff/super-ultra-pong-64-item-1181/index.html?era=3&title=on', webSocketDebuggerUrl: ws(1) };
  const theirs = { type: 'page', url: 'file:///G:/Claude%20Stuff/super-ultra-pong-64-item-1205/index.html', webSocketDebuggerUrl: ws(2) };
  const blank = { type: 'page', url: 'about:blank', webSocketDebuggerUrl: ws(3) };
  const worker = { type: 'service_worker', url: 'file:///x', webSocketDebuggerUrl: ws(4) };

  assert.strictEqual(pickOwnPage([theirs, ours], asked).own, ours);
  assert.strictEqual(pickOwnPage([theirs], asked).foreign, theirs, 'another checkout\'s page was not called foreign');
  assert.strictEqual(pickOwnPage([theirs], asked).own, undefined);
  assert.deepStrictEqual(pickOwnPage([blank, worker], asked), {}, 'a page still coming up is neither');
  assert.deepStrictEqual(pickOwnPage(null, asked), {});
});
