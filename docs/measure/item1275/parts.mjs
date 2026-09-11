/*
 * Item 1275: which PART of an era makes it loud. Renders one era at one stage
 * of the match (the same four stages as render.mjs) with every part of its
 * arrangement played alone -- the engine's own lift layers (tom roll, crash)
 * included -- through the era's real effects, its period chain and the master
 * limiter, and prints each part's RMS beside the whole mix's.
 *
 *   node docs/measure/item1275/parts.mjs --era 7 --stage climax [--port 9487] [--label before]
 *
 * Writes parts-<label>-era<N>-<stage>.json beside itself.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg('port', 9487));
const ERA = Number(arg('era', 7));
const STAGE = arg('stage', 'climax');
const LABEL = arg('label', 'now');
const STAGES = {
  serve: { rally: 0, left: 0, right: 0 },
  build: { rally: 8, left: 3, right: 3 },
  climax: { rally: 12, left: 5, right: 4 },
  'match point': { rally: 12, left: 5, right: 5 }
};
const st = STAGES[STAGE];
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?title=off&music=off';

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }
}

/** Render the era with only part `solo` (an index into parts + lifts; -1 = everything). */
function renderExpr(solo) {
  return `(async () => {
    const M = window.PongMusic;
    const arr = M.ARRANGEMENTS[${ERA}];
    const keepParts = arr.parts, keepLift = M.LIFT.slice();
    const lifts = keepLift.filter((p) => arr.kit && arr.kit[p.hit]);
    const all = keepParts.concat(lifts);
    const solo = ${solo};
    if (solo >= 0) {
      const p = all[solo];
      arr.parts = solo < keepParts.length ? [p] : [];
      M.LIFT.length = 0;
      if (solo >= keepParts.length) M.LIFT.push(p);
    }
    arr._score = null;
    try {
      const SR = 22050, SECONDS = 16;
      const off = new OfflineAudioContext(2, SR * SECONDS, SR);
      let now = 0;
      const proxy = new Proxy(off, { get(t, p) {
        if (p === 'currentTime') return now;
        if (p === 'state') return 'running';
        const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
      const music = M.createMusic({ AudioContext: function () { return proxy; } });
      music.unlock();
      const game = { phase: 'playing', era: ${ERA}, rally: ${st.rally}, score: { left: ${st.left}, right: ${st.right} },
                     rules: { matchPoints: 11 }, events: [], time: 0 };
      const loop = 8 * 16 * (60 / 132 / 4) / (1 + Math.min(0.18, ${st.rally} * 0.012));
      for (now = 0; now < loop; now += 0.05) { game.time += 0.05; music.update(game); }
      const buf = await off.startRendering();
      let sum = 0, peak = 0, n = 0;
      const upTo = Math.min(buf.length, Math.floor(SR * (loop + 0.3)));
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < upTo; i++) { const a = Math.abs(d[i]); sum += d[i] * d[i]; n += 1; if (a > peak) peak = a; }
      }
      const p = solo >= 0 ? all[solo] : null;
      const what = p ? [p.play, p.rule || '', p.hit || (p.voice && p.voice.wave) || '', p.from ? 'from ' + p.from : '',
                        p.lift ? 'LIFT' : '', p.voice && p.voice.drive ? 'drive ' + p.voice.drive : ''].filter(Boolean).join(' ') : 'the whole mix';
      return { count: all.length, what, notes: music.scheduled,
               rmsDb: +(10 * Math.log10(sum / n + 1e-20)).toFixed(1), peak: +peak.toFixed(4) };
    } finally { arr.parts = keepParts; M.LIFT.length = 0; keepLift.forEach((x) => M.LIFT.push(x)); arr._score = null; }
  })()`;
}

const flags = ['--headless=new', '--mute-audio', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'item1275-parts' }).catch(refusePortTaken);
const rows = [];
let ws;
try {
  let wsUrl = null;
  for (let t = 0; t < 60 && !wsUrl; t++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const p = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch { /* coming up */ }
    if (!wsUrl) await sleep(250);
  }
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const s = new Session(ws);
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Page.navigate', { url: page });
  for (let t = 0; t < 100; t++) {
    if (await s.eval('!!(window.PongMusic && window.PongMusic.ARRANGEMENTS[10])').catch(() => false)) break;
    await sleep(100);
  }
  const whole = await s.eval(renderExpr(-1));
  rows.push({ solo: -1, ...whole });
  console.log(`era ${ERA} ${STAGE}: whole mix ${whole.rmsDb} dBFS RMS, peak ${whole.peak}`);
  for (let i = 0; i < whole.count; i++) {
    const r = await s.eval(renderExpr(i));
    rows.push({ solo: i, ...r });
    console.log(`  part ${String(i).padStart(2)} ${String(r.rmsDb).padStart(6)} dBFS  peak ${String(r.peak).padEnd(6)} ${r.what}`);
  }
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}
const out = path.join(HERE, `parts-${LABEL}-era${ERA}-${STAGE.replace(/ /g, '')}.json`);
writeFileSync(out, JSON.stringify({ taken: new Date().toISOString(), era: ERA, stage: STAGE, label: LABEL, rows }, null, 1) + '\n');
console.log('wrote ' + out);
