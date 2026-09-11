// Item 1266: one rally frame of each 3D era (5 to 10), taken through the real 3D
// layer on the playtest's own headless Chrome (software WebGL), cropped to the
// field. Each era opens at index.html?era=N, plays for a moment, then has the
// ball put mid-rally and the paddles either side of it, and is photographed a
// few frames later. Era 7's clock is set 30 s on first, so its blimp (73 s lap,
// 12 units a second from off the left edge) is in the sky for the frame.
//
//   node docs/measure/item-1266/rally.mjs [--port 9487] [--prefix rally]
//
// Writes docs/shots/item-1266/<prefix>-era<N>-<name>.png and prints, per era,
// whether the frame drew through WebGL. Chrome comes from tools/chrome.mjs, so
// its profile is deleted on exit and a taken port is refused.
import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, refusePortTaken, pickOwnPage } from '../../../tools/chrome.mjs';
import { CdpConnection } from '../../../tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'shots', 'item-1266');
const arg = (n, f) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : f; };
const PORT = Number(arg('port', 9487));
const PREFIX = arg('prefix', 'rally');
const NAMES = { 5: 'playstation', 6: 'n64', 7: 'dreamcast', 8: 'ps2', 9: 'xbox', 10: 'xbox360' };
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Session extends CdpConnection {
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text);
    return r.result.value;
  }
}

const page = (era) => 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') + '?era=' + era;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const first = page(5);
  const chrome = await launchChrome(CHROME, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', '--window-size=1000,760',
    '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', first],
  { name: 'item1266' }).catch(refusePortTaken);
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      try {
        const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
        target = pickOwnPage(list, first).own;
      } catch { /* coming up */ }
      if (!target) await sleep(250);
    }
    if (!target) throw new Error('no page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    const s = new Session(ws);
    await s.send('Page.enable');
    await s.send('Runtime.enable');
    for (let era = 5; era <= 10; era++) {
      await s.send('Page.navigate', { url: page(era) });
      await sleep(2500);
      // mid-rally: the ball two thirds of the way to the computer, heading there;
      // each paddle a little off the ball's line, as in a real exchange
      const info = await s.eval(`(() => {
        const g = window.__pong;
        if (${era === 7 ? 'true' : 'false'}) g.time += 30;
        g.serveDelay = 0;
        g.ball.x = 520; g.ball.y = 250; g.ball.vx = 260; g.ball.vy = 60;
        g.left.y = 200; g.right.y = 190;
        const F = window.PongField3D;
        return { era: g.era, gl: !!(F && F.available()), frames: F ? F.stats().frames : 0 };
      })()`);
      await sleep(60);
      const geo = await s.eval(`(() => { const b = document.getElementById('field').getBoundingClientRect();
        return { x: b.left, y: b.top, width: b.width, height: b.height }; })()`);
      const r = await s.send('Page.captureScreenshot', { format: 'png', clip: { ...geo, scale: 1 } });
      const file = path.join(OUT, `${PREFIX}-era${era}-${NAMES[era]}.png`);
      writeFileSync(file, Buffer.from(r.data, 'base64'));
      console.log(`era ${era}: on era ${info.era}, WebGL ${info.gl} (${info.frames} GL frames so far) -> ${path.relative(ROOT, file)}`);
    }
    // The table's own geometry from low at the side: the play cameras look down
    // on the top, which hides the legs. One render of the layer's scene from a
    // camera at knee height off the near-left corner, read back off its canvas.
    const side = await s.eval(`(() => {
      const I = window.PongField3D.internals();
      const cam = I.camera.clone();
      cam.fov = 34; cam.aspect = 4 / 3; cam.near = 10; cam.far = 20000;
      cam.position.set(-900, 60, 1150); cam.lookAt(0, -40, 0);
      cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      I.renderer.setSize(800, 600, false);
      I.renderer.setClearColor(0x6a7a8a, 1);
      I.renderer.render(I.scene, cam);
      const url = I.renderer.domElement.toDataURL('image/png');
      I.renderer.setClearColor(0x000000, 0);
      return url;
    })()`);
    const sideFile = path.join(OUT, `${PREFIX}-table-side.png`);
    writeFileSync(sideFile, Buffer.from(side.split(',')[1], 'base64'));
    console.log(`table from the side -> ${path.relative(ROOT, sideFile)}`);
    ws.close();
  } finally {
    await chrome.close();
  }
}

main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
