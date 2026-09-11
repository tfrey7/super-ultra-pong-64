// tools/cdp.mjs: when Chrome's DevTools socket closes or errors, every request
// still waiting is rejected at once and later sends are refused (item 1182).
// Before, a waiting request hung forever and the playtest exited 0 with no
// summary. A plain EventTarget stands in for the socket, so no browser is needed.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'tools', 'cdp.mjs')).href);

/** A socket that records what was sent and lets the test answer or close it. */
function fakeSocket() {
  const ws = new EventTarget();
  ws.sent = [];
  ws.send = (text) => ws.sent.push(JSON.parse(text));
  ws.reply = (id, result) => ws.dispatchEvent(Object.assign(new Event('message'),
    { data: JSON.stringify({ id, result }) }));
  ws.closeWith = (code) => ws.dispatchEvent(Object.assign(new Event('close'), { code, reason: '' }));
  return ws;
}

test('a reply settles its own request, as before', async () => {
  const { CdpConnection } = await load();
  const ws = fakeSocket();
  const c = new CdpConnection(ws);
  const a = c.send('Page.enable');
  const b = c.send('Runtime.evaluate', { expression: '1' });
  ws.reply(ws.sent[1].id, { value: 1 });
  ws.reply(ws.sent[0].id, {});
  assert.deepStrictEqual(await b, { value: 1 });
  assert.deepStrictEqual(await a, {});
});

test('a close rejects every waiting request, naming the dropped connection', async () => {
  const { CdpConnection, DroppedConnection } = await load();
  const ws = fakeSocket();
  const c = new CdpConnection(ws);
  const waiting = [c.send('Page.enable'), c.send('Runtime.evaluate')];
  ws.closeWith(1006);
  for (const p of waiting) {
    await assert.rejects(p, (e) => e instanceof DroppedConnection &&
      /DevTools connection closed \(code 1006\)/.test(e.message));
  }
  assert.strictEqual(c.pending.size, 0);
});

test('after a close, a new send is refused rather than left hanging', async () => {
  const { CdpConnection, DroppedConnection } = await load();
  const ws = fakeSocket();
  const c = new CdpConnection(ws);
  ws.closeWith(1006);
  await assert.rejects(c.send('Input.dispatchMouseEvent'),
    (e) => e instanceof DroppedConnection && /refused to send Input\.dispatchMouseEvent/.test(e.message));
  assert.strictEqual(ws.sent.length, 0, 'nothing is written to a closed socket');
});

test('a socket error drops the connection the same way', async () => {
  const { CdpConnection, DroppedConnection } = await load();
  const ws = fakeSocket();
  const c = new CdpConnection(ws);
  const p = c.send('Page.captureScreenshot');
  ws.dispatchEvent(Object.assign(new Event('error'), { message: 'socket hang up' }));
  await assert.rejects(p, (e) => e instanceof DroppedConnection && /failed: socket hang up/.test(e.message));
});
