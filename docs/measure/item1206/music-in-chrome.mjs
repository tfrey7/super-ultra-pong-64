/*
 * Item 1206: the soundtrack, measured in real headless Chrome off disk.
 *
 *   node docs/measure/item1206/music-in-chrome.mjs [--port 9341]
 *
 * For every era it opens index.html?era=N, clicks once (the game's first-click
 * unlock), lets it play 1.5 s and reads window.__pongMusic: whether an audio
 * context opened, its state, and how many notes were booked on the audio clock.
 * Then: the title screen opens no audio, an era change cross-fades, a long
 * rally raises the tempo, M mutes, and ?music=off stays silent while the
 * sound effects still unlock. Chrome runs --mute-audio, so nothing is heard.
 * Writes music-in-chrome.json beside itself and shoots the per-era table page
 * (music-table.html) to music-table.png.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const i = process.argv.indexOf('--port');
const PORT = i !== -1 ? Number(process.argv[i + 1]) : 9341;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileUrl = (rel) => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
  async click(x, y) {
    const at = { x, y, button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at });
  }
  async key(k, code, vk) {
    for (const type of ['keyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', { type, key: k, code, text: type === 'keyDown' ? k : undefined,
        windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    }
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

const read = `(() => { const m = window.__pongMusic, s = window.__pongSound; return {
  available: m.available, audio: m.audioState(), era: m.era, scheduled: m.scheduled,
  crossfades: m.crossfades, ducks: m.ducks, muted: m.muted, off: m.off, errors: m.errors,
  tempo: Math.round(m.tempo() * 10) / 10, rally: window.__pong.rally, gameEra: window.__pong.era,
  sfx: s ? s.audioState() : 'none' }; })()`;

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -- ${JSON.stringify(detail)}`);
}

async function main() {
  const chrome = launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--window-size=1000,760', '--remote-debugging-port=' + PORT, '--no-first-run',
    '--no-default-browser-check', 'about:blank'], { name: 'item1206' });
  const errors = [];
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

    for (let era = 0; era <= 5; era++) {
      await s.open(fileUrl('index.html') + '?era=' + era);
      const before = await s.eval(read);
      await s.click(500, 380);
      await sleep(1500);
      const r = await s.eval(read);
      const want = era <= 4 ? r.scheduled > 0 : r.scheduled === 0;
      check(`era ${era}: ${era <= 4 ? 'its loop books notes' : 'an empty slot books nothing'}`,
        before.audio === 'none' && r.available && r.audio === 'running' && r.era === era && want && r.errors === 0,
        { titleAudio: before.audio, ...r });
    }

    // Cross-fade at an era change, the rally's tempo, M mutes.
    await s.open(fileUrl('index.html') + '?era=1');
    await s.click(500, 380);
    await sleep(2600);
    const t0 = await s.eval(read);
    // The position the song had reached, read and the era changed in ONE
    // evaluation, so no step can pass between the two.
    const sw = await s.eval(`(() => { const m = window.__pongMusic; const p = m.position();
      window.__pong.era = 2; m.update(window.__pong); return { before: p, at: m.lastSwitch }; })()`);
    await sleep(400);
    const t1 = await s.eval(read);
    const beforeStep = sw.before.bar * 16 + sw.before.step, atStep = sw.at.bar * 16 + sw.at.step;
    check('an era change cross-fades at the same bar and beat (the tune never restarts)',
      t1.crossfades === 1 && t1.era === 2 && t1.scheduled > t0.scheduled && beforeStep > 0 && atStep === beforeStep,
      { positionBefore: sw.before, positionAtChange: sw.at, after: t1 });
    // The whole climb in one session, arcade to Super Nintendo.
    const climb = await s.eval(`(async () => { const m = window.__pongMusic; const out = [];
      for (const e of [0, 1, 2, 3, 4]) { window.__pong.era = e; await new Promise(r => setTimeout(r, 700));
        out.push({ era: m.era, scheduled: m.scheduled, at: m.lastSwitch }); } return { out, errors: m.errors, crossfades: m.crossfades }; })()`);
    check('one session climbs arcade to Super Nintendo, every change keeping its place',
      climb.errors === 0 && climb.out.every((r, k) => r.era === k) && climb.out.every((r, k) => k === 0 || r.scheduled > climb.out[k - 1].scheduled),
      climb);
    await s.eval('window.__pong.rally = 15; true');
    await sleep(200);
    const t2 = await s.eval(read);
    check('a 15-hit rally raises the tempo', t2.tempo > t1.tempo, { tempoAtRally0: t1.tempo, tempoAtRally15: t2.tempo });
    await s.key('m', 'KeyM', 77);
    await sleep(100);
    const t3 = await s.eval(read);
    await s.key('m', 'KeyM', 77);
    await sleep(100);
    const t4 = await s.eval(read);
    check('M mutes the music, and M again brings it back', t3.muted === true && t4.muted === false, { afterFirstM: t3.muted, afterSecondM: t4.muted });

    // Ducking under a paddle hit, in a real rally.
    await s.open(fileUrl('index.html') + '?era=2');
    await s.click(500, 380);
    await sleep(6000);
    const d = await s.eval(read);
    check('the music ducks under paddle hits in real play', d.ducks > 0, { ducks: d.ducks, scheduled: d.scheduled });

    // ?music=off: silent, while the sound effects still unlock.
    await s.open(fileUrl('index.html') + '?era=2&music=off');
    await s.click(500, 380);
    await sleep(800);
    const q = await s.eval(read);
    check('?music=off opens no music audio; the effects still unlock', q.off && q.audio === 'none' && q.scheduled === 0 && q.sfx === 'running', q);

    check('no page errors', errors.length === 0, errors);

    // The per-era table, drawn from the live SONGS data.
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1500, deviceScaleFactor: 1, mobile: false });
    await s.send('Page.navigate', { url: fileUrl('docs/measure/item1206/music-table.html') });
    await sleep(1200);
    const h = await s.eval('document.documentElement.scrollHeight');
    await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(HERE, 'music-table.png'), Buffer.from(shot.data, 'base64'));
    ws.close();
  } finally {
    await chrome.close();
  }
  writeFileSync(path.join(HERE, 'music-in-chrome.json'), JSON.stringify({ when: new Date().toISOString(), results }, null, 2) + '\n');
  const bad = results.filter((r) => !r.ok).length;
  console.log(`${results.length - bad}/${results.length} passed`);
  process.exitCode = bad ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 2; });
