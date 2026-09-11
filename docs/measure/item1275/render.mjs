/*
 * Item 1275: how loud each of the eleven eras' music is, at the same four
 * stages of a match, measured through the real master limiter. It is item
 * 1242's docs/measure/item1242/render.mjs extended from eras 0-4 to all eleven
 * and made to measure whatever checkout it sits in, so the "before" and the
 * "after" are the same script run on two trees:
 *
 *   node docs/measure/item1275/render.mjs --label before [--port 9486]   # on master
 *   node docs/measure/item1275/render.mjs --label after  [--port 9486]   # on the branch
 *
 * In headless Chrome it hands the real player (window.PongMusic.createMusic)
 * an OfflineAudioContext behind a clock this script moves, drives it through
 * one pass of the eight-bar loop at four game states -- the serve, a long rally
 * mid-match, a very long rally late in the match, match point -- renders the
 * whole thing through the real master limiter, and reads the output: loudness
 * (RMS, dBFS), loudest sample, and how many samples reached the ceiling (0.89).
 * Then, per stage, the step in level between each pair of neighbouring eras
 * (the jump heard at an era change).
 *
 * Writes render-<label>.json beside itself.
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
const PORT = Number(arg('port', 9486));
const LABEL = arg('label', 'now');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const page = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?title=off&music=off';
const ERAS = 11;

// Four moments of a real match (matchPoints 11): the intensity each gives is read back from the player.
const STAGES = [
  { stage: 'serve', rally: 0, left: 0, right: 0 },
  { stage: 'build', rally: 8, left: 3, right: 3 },
  { stage: 'climax', rally: 12, left: 5, right: 4 },
  { stage: 'match point', rally: 12, left: 5, right: 5 }
];

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  }
}

/** The in-page render of one era at one stage. */
function renderExpr(era, st) {
  return `(async () => {
    const M = window.PongMusic;
    const SR = 22050, SECONDS = 16;
    const off = new OfflineAudioContext(2, SR * SECONDS, SR);
    let now = 0;
    const proxy = new Proxy(off, { get(t, p) {
      if (p === 'currentTime') return now;
      if (p === 'state') return 'running';
      const v = t[p]; return typeof v === 'function' ? v.bind(t) : v; } });
    const music = M.createMusic({ AudioContext: function () { return proxy; } });
    music.unlock();
    const game = { phase: 'playing', era: ${era}, rally: ${st.rally}, score: { left: ${st.left}, right: ${st.right} },
                   rules: { matchPoints: 11 }, events: [], time: 0 };
    const loop = 8 * 16 * (60 / 132 / 4) / (1 + Math.min(0.18, ${st.rally} * 0.012));
    for (now = 0; now < loop; now += 0.05) { game.time += 0.05; music.update(game); }
    const buf = await off.startRendering();
    let sum = 0, peak = 0, atCeiling = 0, n = 0;
    const upTo = Math.min(buf.length, Math.floor(SR * (loop + 0.3)));
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < upTo; i++) {
        const a = Math.abs(d[i]); sum += d[i] * d[i]; n += 1;
        if (a > peak) peak = a; if (a >= 0.889) atCeiling += 1;
      }
    }
    return { intensity: music.intensityNow, notes: music.scheduled, loopSeconds: +loop.toFixed(2),
             rmsDb: +(10 * Math.log10(sum / n + 1e-20)).toFixed(1), peak: +peak.toFixed(4), atCeiling, errors: music.errors };
  })()`;
}

const flags = ['--headless=new', '--mute-audio', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required',
  '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', 'about:blank'];
const chrome = await launchChrome(CHROME, flags, { name: 'item1275' }).catch(refusePortTaken);
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
    if (await s.eval(`!!(window.PongMusic && window.PongMusic.ARRANGEMENTS[${ERAS - 1}])`).catch(() => false)) break;
    await sleep(100);
  }
  for (let era = 0; era < ERAS; era++) {
    for (const st of STAGES) {
      const r = await s.eval(renderExpr(era, st));
      rows.push({ era, stage: st.stage, ...r });
      console.log(`era ${String(era).padStart(2)} ${st.stage.padEnd(11)} intensity ${String(r.intensity).padEnd(5)} ` +
        `${String(r.notes).padStart(4)} notes  ${String(r.rmsDb).padStart(6)} dBFS RMS  peak ${r.peak}  at ceiling ${r.atCeiling}  errors ${r.errors}`);
    }
  }
} finally {
  try { ws && ws.close(); } catch { /* gone */ }
  await chrome.close();
}

// The step heard at each era change: this era's level minus the one below it, at the same stage.
const steps = [];
console.log('\nstep at each era change (dB, era N minus era N-1)');
console.log('change   ' + STAGES.map((s) => s.stage.padStart(12)).join(''));
for (let era = 1; era < ERAS; era++) {
  const line = STAGES.map((st) => {
    const a = rows.find((r) => r.era === era && r.stage === st.stage).rmsDb;
    const b = rows.find((r) => r.era === era - 1 && r.stage === st.stage).rmsDb;
    const d = +(a - b).toFixed(1);
    steps.push({ from: era - 1, to: era, stage: st.stage, stepDb: d });
    return (d > 0 ? '+' : '') + d.toFixed(1);
  });
  console.log(`${String(era - 1).padStart(2)} -> ${String(era).padEnd(3)} ` + line.map((x) => x.padStart(12)).join(''));
}
const worst = steps.reduce((w, s) => (Math.abs(s.stepDb) > Math.abs(w.stepDb) ? s : w), steps[0]);
const over = steps.filter((s) => Math.abs(s.stepDb) > 4);
console.log(`largest step ${worst.stepDb} dB (era ${worst.from} -> ${worst.to}, ${worst.stage}); ${over.length} of ${steps.length} steps over 4 dB`);

const out = path.join(HERE, 'render-' + LABEL + '.json');
writeFileSync(out, JSON.stringify({ taken: new Date().toISOString(), label: LABEL, ceiling: 0.89, rows, steps,
  largestStepDb: worst.stepDb, stepsOver4Db: over.length }, null, 1) + '\n');
console.log('wrote ' + out);
