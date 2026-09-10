'use strict';
/*
 * Era looks, recorded as draw calls.
 *
 * The renderer only ever calls ctx.fillStyle = ... and ctx.fillRect(...), so a
 * frame is exactly the list of [fillStyle, x, y, w, h] it produces. This file
 * draws a fixed set of scenes with a recording canvas, so a test can prove
 * a look did not change by one pixel, headless, with no browser.
 *
 *   node tools/eralooks.js --from "<a checkout>"
 *
 * loads THAT checkout's src/game.js, src/render.js and whatever era files its
 * index.html lists, draws the scenes, and writes tools/eralooks-today.json.
 * The committed JSON was recorded from master at 21e9bc4 -- the renderer as it
 * was before the era ladder -- and test/game.test.js checks that eras 0 and 1
 * still draw every one of those calls identically.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/**
 * Load a checkout's rules and renderer the way its page does: game.js,
 * render.js, then every src/eras/ script index.html names, in page order.
 */
function loadRenderer(dir) {
  const Pong = require(path.join(dir, 'src', 'game.js'));
  require(path.join(dir, 'src', 'render.js'));
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const eraScripts = [];
  const re = /<script\s+src="(src\/eras\/[^"]+\.js)"/g;
  let m;
  while ((m = re.exec(html))) {
    eraScripts.push(m[1]);
    require(path.join(dir, m[1]));
  }
  return { Pong, R: globalThis.PongRender, eraScripts, html };
}

/** A canvas context that remembers every rectangle and the ink it was in. */
function recorder() {
  const calls = [];
  const ctx = {
    fillStyle: '#000000',
    fillRect(x, y, w, h) { calls.push([this.fillStyle, x, y, w, h]); }
  };
  return { ctx, calls };
}

function frame(paint) {
  const rec = recorder();
  paint(rec.ctx);
  return rec.calls;
}

/**
 * The scenes. Every one is built from a pinned rng so it is the same frame on
 * every run. Moving a state to era 1 goes through advanceEra where the rules
 * have it, and through the old flipToColour where they do not (master before
 * the ladder), which is the same palette pick either way.
 */
function scenes(Pong, R) {
  const toEra1 = (g) => (Pong.advanceEra ? Pong.advanceEra(g) : Pong.flipToColour(g));
  const midRally = (rng) => {
    const g = Pong.createGame({ rng: () => rng, phase: 'playing' });
    g.score.left = 3;
    g.score.right = 11;
    g.serveDelay = 0;
    g.ball.x = 412.5;
    g.ball.y = 97.25;
    g.left.y = 40;
    g.right.y = 390;
    return g;
  };
  const out = {};

  const e0 = midRally(0.5);
  out['era 0, mid-rally'] = frame((ctx) => R.draw(ctx, e0));

  const serving = Pong.createGame({ rng: () => 0.5, phase: 'playing' });
  out['era 0, serve pause (ball hidden)'] = frame((ctx) => R.draw(ctx, serving));

  const title = Pong.createGame({ rng: () => 0.5 });
  title.time = 0.1;
  out['era 0, title over the dim attract rally'] = frame((ctx) => {
    R.draw(ctx, e0, { ink: '#3a3a3a' });
    R.drawTitle(ctx, title);
  });

  for (const rng of [0.5, 0.1, 0.93]) {
    const g = midRally(rng);
    toEra1(g);
    out[`era 1, mid-rally, rng ${rng}`] = frame((ctx) => R.draw(ctx, g));
  }

  const dim = midRally(0.3);
  toEra1(dim);
  out['era 1, dimmed stays monochrome'] = frame((ctx) => R.draw(ctx, dim, { ink: '#3a3a3a' }));

  return out;
}

if (require.main === module) {
  const i = process.argv.indexOf('--from');
  const from = path.resolve(i > 0 ? process.argv[i + 1] : path.join(__dirname, '..'));
  const { Pong, R, eraScripts } = loadRenderer(from);
  const renderSrc = fs.readFileSync(path.join(from, 'src', 'render.js'));
  const out = {
    what: 'draw calls [fillStyle, x, y, w, h] per scene, from tools/eralooks.js',
    renderSha256: crypto.createHash('sha256').update(renderSrc).digest('hex'),
    eraScripts,
    scenes: scenes(Pong, R)
  };
  const dest = path.join(__dirname, 'eralooks-today.json');
  // One draw call per line, so the file diffs as frames rather than as a
  // wall of single numbers.
  const sceneText = Object.entries(out.scenes).map(([name, calls]) =>
    `  ${JSON.stringify(name)}: [\n` +
    calls.map((c) => `   ${JSON.stringify(c)}`).join(',\n') + '\n  ]').join(',\n');
  const head = JSON.stringify({ what: out.what, renderSha256: out.renderSha256, eraScripts: out.eraScripts }, null, 1)
    .replace(/\n}$/, '');
  fs.writeFileSync(dest, `${head},\n "scenes": {\n${sceneText}\n }\n}\n`);
  const counts = Object.entries(out.scenes).map(([k, v]) => `${k}: ${v.length}`);
  console.log(`wrote ${dest}\n  ${counts.join('\n  ')}`);
}

module.exports = { loadRenderer, recorder, scenes };
