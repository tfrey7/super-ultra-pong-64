/*
 * Item 1299: WHAT is in the long frame that first draws a glTF figure?
 *
 * figfirst.mjs shows the page itself spends about 14 ms in that frame (unpack
 * the file, build the two posed copies, the WebGL render call) and the frame
 * still runs 83-150 ms. This records a Chrome trace of the same cold era 9
 * page from before it loads, with Skia's and ANGLE's categories in it (the
 * ones that name every GPU program built -- item 1203's --skia), and prints
 * the longest tasks in the trace by process and thread, so the rest of that
 * frame is named rather than guessed at.
 *
 *   node docs/measure/item-1299/figtrace.mjs [--port 9497] [--label figures]
 *        [--query "&figure=player-proof-hi"] [--seconds 4]
 *
 * Writes figtrace-<label>.json beside itself: the longest tasks, and every
 * event whose name mentions a program, a shader or a compile.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const argv = process.argv;
const str = (n, d) => { const i = argv.indexOf(n); return i !== -1 ? argv[i + 1] : d; };
const num = (n, d) => { const i = argv.indexOf(n); return i !== -1 ? Number(argv[i + 1]) : d; };
const PORT = num('--port', 9497);
const LABEL = str('--label', 'figures');
const QUERY = str('--query', '&figure=player-proof-hi');
const SECONDS = num('--seconds', 4);
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'blink', 'cc', 'gpu',
  'viz', 'v8', 'loading', 'disabled-by-default-gpu.service', 'benchmark', 'renderer.scheduler',
  'skia', 'disabled-by-default-skia', 'disabled-by-default-skia.gpu', 'disabled-by-default-skia.shaders',
  'gpu.angle', 'disabled-by-default-gpu.angle'];

class Session extends CdpConnection {
  constructor(ws) {
    super(ws);
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (!msg.method) return;
      const h = this.handlers.get(msg.method);
      if (h) h(msg.params);
    });
  }

  /** CdpConnection answers replies only; a trace arrives as events. */
  on(method, fn) { this.handlers.set(method, fn); }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
}

const flags = ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio',
  '--allow-file-access-from-files', '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
  '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'item1299trace' }).catch(refusePortTaken);
let ws, out = {};
try {
  let wsUrl = null;
  for (let t = 0; t < 60 && !wsUrl; t++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* coming up */ }
    if (!wsUrl) await sleep(250);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  const events = [];
  s.on('Tracing.dataCollected', (p) => { for (const e of p.value) events.push(e); });
  const complete = new Promise((done) => s.on('Tracing.tracingComplete', done));
  await s.send('Tracing.start', { traceConfig: { includedCategories: CATEGORIES, recordMode: 'recordAsMuchAsPossible' },
    transferMode: 'ReportEvents' });
  await s.send('Page.navigate', { url: `${base}?era=9${QUERY}` });
  await sleep(SECONDS * 1000);
  await s.send('Tracing.end');
  await complete;
  // Name the processes, then the longest tasks in each.
  const procName = {};
  for (const e of events) if (e.name === 'process_name' && e.args && e.args.name) procName[e.pid] = e.args.name;
  const withDur = events.filter((e) => (e.ph === 'X' || e.ph === 'x') && e.dur > 1000)
    .map((e) => ({ ms: +(e.dur / 1000).toFixed(2), name: e.name, cat: e.cat,
      proc: procName[e.pid] || ('pid ' + e.pid), ts: e.ts }));
  withDur.sort((a, b) => b.ms - a.ms);
  const byName = {};
  for (const e of withDur) {
    const key = (e.proc + ' | ' + e.name);
    byName[key] = byName[key] || { key, count: 0, ms: 0, longest: 0 };
    byName[key].count++; byName[key].ms += e.ms; byName[key].longest = Math.max(byName[key].longest, e.ms);
  }
  const totals = Object.values(byName).sort((a, b) => b.ms - a.ms).slice(0, 25);
  const shaderish = events.filter((e) => /program|shader|compile|link/i.test(e.name || ''))
    .map((e) => ({ name: e.name, cat: e.cat, ph: e.ph, ms: e.dur ? +(e.dur / 1000).toFixed(2) : null,
      proc: procName[e.pid] || ('pid ' + e.pid) }));
  const shaderTotals = {};
  for (const e of shaderish) {
    const key = e.proc + ' | ' + e.name;
    shaderTotals[key] = shaderTotals[key] || { key, count: 0, ms: 0, longest: 0 };
    shaderTotals[key].count++;
    if (e.ms) { shaderTotals[key].ms += e.ms; shaderTotals[key].longest = Math.max(shaderTotals[key].longest, e.ms); }
  }
  out = { label: LABEL, query: QUERY, events: events.length,
    longest: withDur.slice(0, 30), totals,
    shaders: Object.values(shaderTotals).sort((a, b) => b.ms - a.ms || b.count - a.count).slice(0, 30) };
  console.log(`${events.length} events; longest tasks over 1 ms:`);
  for (const e of withDur.slice(0, 12)) console.log(`  ${String(e.ms).padStart(8)} ms  ${e.proc.padEnd(18)} ${e.name} [${e.cat}]`);
  console.log('by name, total ms:');
  for (const t of totals.slice(0, 12)) console.log(`  ${String(t.ms.toFixed(1)).padStart(8)} ms over ${String(t.count).padStart(4)}, longest ${t.longest} ms  ${t.key}`);
  console.log('anything named program/shader/compile/link:');
  for (const t of out.shaders.slice(0, 12)) console.log(`  ${String(t.ms.toFixed(1)).padStart(8)} ms over ${String(t.count).padStart(4)}, longest ${t.longest} ms  ${t.key}`);
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const file = path.join(HERE, `figtrace-${LABEL}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log('wrote ' + file);
