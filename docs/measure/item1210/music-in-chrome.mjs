/*
 * Item 1210: the six 3D arrangements, measured in real headless Chrome off disk.
 *
 *   node docs/measure/item1210/music-in-chrome.mjs [--port 9343]
 *
 * 1. The live page: for eras 5 to 10 it opens index.html?era=N, clicks once (the
 *    game's first-click unlock), lets it play 1.5 s and reads window.__pongMusic:
 *    the audio context runs, the era's arrangement is the one playing and notes
 *    are booked on the audio clock, with no errors.
 * 2. One session climbs all eleven rungs, arcade to Xbox 360, every change a
 *    cross-fade that keeps its place; a long rally raises the tempo at the top.
 * 3. Rendered sound: each era's arrangement is played for 4 s into Chrome's real
 *    Web Audio through an OfflineAudioContext (the same player, handed that
 *    context), and the samples are measured: level (RMS, peak), stereo width
 *    (side / mid RMS) and brightness (RMS of the sample-to-sample difference over
 *    RMS). Nothing is heard: Chrome runs --mute-audio and the offline render
 *    never reaches a speaker.
 * Writes music-in-chrome.json beside itself and shoots music-table.html to
 * music-table.png.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, refusePortTaken } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const i = process.argv.indexOf('--port');
const PORT = i !== -1 ? Number(process.argv[i + 1]) : 9343;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (rel) => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception || {}));
    return r.result.value;
  }
  async click(x, y) {
    const at = { x, y, button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at });
  }
  async open(url) {
    await this.send('Page.navigate', { url });
    for (let n = 0; n < 100; n++) {
      if (await this.eval('!!(window.__pong && window.__pongMusic)').catch(() => false)) break;
      await sleep(100);
    }
    await sleep(300);
  }
}

const read = `(() => { const m = window.__pongMusic; return {
  available: m.available, audio: m.audioState(), era: m.era, scheduled: m.scheduled,
  crossfades: m.crossfades, errors: m.errors, tempo: Math.round(m.tempo() * 10) / 10,
  gameEra: window.__pong.era }; })()`;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -- ${JSON.stringify(detail)}`);
}

async function main() {
  const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
    '--no-default-browser-check', 'about:blank'], { name: 'item1210' }).catch(refusePortTaken);
  const errors = [];
  const rendered = [];
  try {
    let wsUrl;
    for (let n = 0; n < 60 && !wsUrl; n++) {
      try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        wsUrl = (list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || {}).webSocketDebuggerUrl;
      } catch { /* coming up */ }
      if (!wsUrl) await sleep(250);
    }
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const s = new Session(ws);
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    });

    // 1. The live page, one 3D era at a time.
    for (let era = 5; era <= 10; era++) {
      await s.open(fileUrl('index.html') + '?era=' + era);
      const before = await s.eval(read);
      await s.click(500, 380);
      await sleep(1500);
      const r = await s.eval(read);
      check(`era ${era}: its arrangement books notes after the first click`,
        before.audio === 'none' && r.available && r.audio === 'running' && r.era === era && r.scheduled > 0 && r.errors === 0,
        { titleAudio: before.audio, ...r });
    }

    // 2. The whole climb in one session, then a long rally at the top.
    await s.open(fileUrl('index.html') + '?era=0');
    await s.click(500, 380);
    await sleep(600);
    const climb = await s.eval(`(async () => { const m = window.__pongMusic; const out = [];
      for (let e = 0; e <= 10; e++) { window.__pong.serveDelay = 30; window.__pong.era = e;
        const p = m.position(); await new Promise(r => setTimeout(r, 600));
        out.push({ era: m.era, scheduled: m.scheduled, at: m.lastSwitch }); }
      return { out, errors: m.errors, crossfades: m.crossfades }; })()`);
    check('one session climbs arcade to Xbox 360, every change a cross-fade that keeps the song going',
      climb.errors === 0 && climb.crossfades === 10 && climb.out.every((r, k) => r.era === k) &&
        climb.out.every((r, k) => k === 0 || r.scheduled > climb.out[k - 1].scheduled),
      { crossfades: climb.crossfades, errors: climb.errors, eras: climb.out.map((r) => r.era),
        changesAt: climb.out.slice(1).map((r) => r.at && (r.at.from + '->' + r.at.to + ' @ bar ' + (r.at.bar + 1) + ' step ' + (r.at.step + 1))) });
    const t1 = await s.eval(read);
    await s.eval('window.__pong.rally = 15; true');
    await sleep(250);
    const t2 = await s.eval(read);
    check('at the Xbox 360 a 15-hit rally raises the tempo', t2.tempo > t1.tempo && t2.era === 10,
      { tempoAtRally0: t1.tempo, tempoAtRally15: t2.tempo });

    // 3. Rendered sound: every era through Chrome's real Web Audio, offline.
    for (let era = 0; era <= 10; era++) {
      const m = await s.eval(`(async () => {
        const SR = 44100, SECS = 4, LEN = SR * SECS;
        let started = false, made = null;
        class Off extends OfflineAudioContext {
          constructor() { super(2, LEN, SR); made = this; }
          resume() { return started ? super.resume() : Promise.resolve(); }
        }
        const music = PongMusic.createMusic({ AudioContext: Off });
        music.unlock();
        const game = { phase: 'playing', era: ${era}, time: 0, events: [], rally: 0 };
        music.update(game);
        const Q = 128 / SR;
        for (let k = 1; k < SECS / 0.05; k++) {
          const at = Math.round(k * 0.05 / Q) * Q;
          made.suspend(at).then(() => { game.time = at; music.update(game); made.resume(); });
        }
        started = true;
        const buf = await made.startRendering();
        const L = buf.getChannelData(0), R = buf.getChannelData(1);
        let ss = 0, sd = 0, peak = 0, mid = 0, side = 0, nan = 0, n = 0;
        for (let i = Math.floor(SR * 0.5); i < LEN; i++) {
          const l = L[i], r = R[i];
          if (!Number.isFinite(l) || !Number.isFinite(r)) { nan++; continue; }
          const mono = (l + r) / 2;
          ss += mono * mono; n++;
          if (i > 0) { const d = mono - (L[i - 1] + R[i - 1]) / 2; sd += d * d; }
          mid += ((l + r) / 2) ** 2; side += ((l - r) / 2) ** 2;
          peak = Math.max(peak, Math.abs(l), Math.abs(r));
        }
        const rms = Math.sqrt(ss / n);
        return { era: ${era}, name: PongMusic.ARRANGEMENTS[${era}].name, notes: music.scheduled, errors: music.errors, nan,
          rmsDb: Math.round(20 * Math.log10(rms) * 10) / 10, peak: Math.round(peak * 1000) / 1000,
          width: Math.round(Math.sqrt(side / mid) * 1000) / 1000,
          brightness: Math.round(Math.sqrt(sd / n) / rms * 1000) / 1000 };
      })()`);
      rendered.push(m);
      console.log('render', JSON.stringify(m));
    }
    const by = (e) => rendered[e];
    check('every era renders real, finite sound with no player errors and no clipping',
      rendered.every((r) => r.errors === 0 && r.nan === 0 && r.notes > 0 && r.rmsDb > -60 && r.peak < 1),
      rendered.map((r) => r.era + ' ' + r.name + ': ' + r.rmsDb + ' dB, peak ' + r.peak));
    check('the eras before the PlayStation are mono; the PlayStation 2 and the Xbox are wide',
      [0, 1, 2, 3, 4].every((e) => by(e).width < 0.01) && by(8).width > 0.1 && by(9).width > 0.1,
      rendered.map((r) => r.era + ': ' + r.width));
    check('the Dreamcast is brighter than the muffled Nintendo 64 and the dark PlayStation 2',
      by(7).brightness > by(6).brightness && by(7).brightness > by(8).brightness,
      { n64: by(6).brightness, dreamcast: by(7).brightness, ps2: by(8).brightness });

    check('no page errors', errors.length === 0, errors);

    // The per-era table, drawn from the live table.
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1500, deviceScaleFactor: 1, mobile: false });
    await s.send('Page.navigate', { url: fileUrl('docs/measure/item1210/music-table.html') });
    await sleep(1500);
    const h = await s.eval('document.documentElement.scrollHeight');
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(HERE, 'music-table.png'), Buffer.from(shot.data, 'base64'));
    ws.close();
  } finally {
    await chrome.close();
  }
  writeFileSync(path.join(HERE, 'music-in-chrome.json'),
    JSON.stringify({ when: new Date().toISOString(), results, rendered }, null, 2) + '\n');
  const bad = results.filter((r) => !r.ok).length;
  console.log(`${results.length - bad}/${results.length} passed`);
  process.exitCode = bad ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; });
