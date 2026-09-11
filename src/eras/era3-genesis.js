/*
 * Era 3 -- 1989 Sega Genesis: sixteen bits.
 *
 * The same game in the look of a Genesis cartridge, a clear step up from the
 * NES before it:
 *
 *  - Every colour is on the Genesis palette: 3 bits a channel, 512 colours.
 *    The paddles keep the colours the rules picked (era 1's pick), snapped to
 *    that palette, and are shaded by moving whole palette steps lighter and
 *    darker -- the stepped gradient a 1989 sprite artist painted by hand.
 *  - Two parallax planes behind the field, the way the Genesis video chip's
 *    two scroll planes were used: a far plane (stars and a distant range)
 *    that barely drifts, and a near plane of hills three times faster.
 *    They scroll with game time, so they are part of the frame, not the play.
 *  - A shaded ball with a motion trail. The trail is placed back along the
 *    ball's own velocity, never remembered from earlier frames, so this file
 *    still only READS the state -- the rules do not know it exists and the
 *    game plays exactly as it did in the eras below.
 *  - A bolder block score with a drop shadow.
 *
 *  - Generated pixel art (item 1179): the far plane is a pixellab.ai night
 *    court and the ball a pixellab chrome sprite, both snapped offline to the
 *    512 colours (assets/pixellab/manifest.json says how); the paddles stay
 *    hand-drawn, after two generated ones read wrong (see drawShadedBar). They
 *    are drawn with drawImage only, once each has decoded; until then -- and
 *    always under node --test, which has no Image -- the hand-drawn pieces
 *    below stand in, so the look never has a hole.
 *
 * The hand-drawn look paints with fillStyle and fillRect only, like the stock
 * frame, so the recording canvas in tools/eralooks.js can check it headless.
 * A dimmed frame (the attract rally behind the title) is the stock frame, as
 * in every era.
 *
 * Arrival flourish: THE SHATTER. The old picture breaks like glass from the
 * spot where the ball went out. The field around that point is cut into a
 * fixed set of angular shards -- bands out from the origin, each band split
 * into irregular wedges -- seeded from the origin itself, so the same point
 * always shatters the same way. As the ring's edge reaches a shard it cracks
 * in place, a clipped copy of the old era's frame with a lit edge; once the
 * ring passes its middle it breaks loose, spins, and flies out away from the
 * origin, shrinking as it goes, over the new era with its parallax planes
 * already scrolling. A shard's flight is measured in ring radius and ends
 * exactly when the ring reaches the far corner, so every shard has gone by
 * the end of the wipe and nothing is left over play. Drawn only: polygon
 * clips of one offscreen copy of the old frame, moved with transforms -- no
 * per-pixel work -- and the ring stays the truth of which era is where.
 * The sound half is the Genesis `score` row in src/sound.js: a point's note is
 * the era it moved up TO, so that row plays exactly as this era arrives.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // ------------------------------------------------------------ the palette
  // The Genesis video chip: 3 bits per channel, so 8 levels of each.
  var LEVELS = [0x00, 0x24, 0x49, 0x6d, 0x92, 0xb6, 0xdb, 0xff];

  function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16); }

  /**
   * A '#rrggbb' colour moved to the nearest Genesis colour, then `steps`
   * palette levels lighter (+) or darker (-) on every channel.
   */
  function onPalette(hex, steps) {
    var s = steps || 0;
    var out = '#';
    for (var c = 0; c < 3; c++) {
      var v = parseInt(hex.slice(1 + 2 * c, 3 + 2 * c), 16);
      var i = Math.round(v * 7 / 255) + s;
      out += hex2(LEVELS[Math.max(0, Math.min(7, i))]);
    }
    return out;
  }

  var SHADOW = 'rgba(0,0,0,0.5)';

  // Dusk sky, in horizontal bands of palette colours -- a smooth gradient was
  // not something the chip could draw, a raster of bands was.
  var SKY = ['#000024', '#000024', '#240024', '#240049', '#242449',
             '#24246d', '#49246d', '#49496d', '#6d4992', '#6d6db6'];
  var DITHER = 3;        // scanlines of the next band laid over the end of this one

  // ------------------------------------------------------- the two planes
  var FAR_SPEED = 6;     // field units per second of game time: barely moving
  var NEAR_SPEED = 18;   // three times the far plane -- that gap IS the parallax
  var COLUMN = 8;        // silhouettes are drawn in 8-unit columns, a tile's width

  /** How far each plane has scrolled at a game time, in field units. */
  function planes(time) {
    var t = time || 0;
    return { far: t * FAR_SPEED, near: t * NEAR_SPEED };
  }

  // A fixed scatter of stars on the far plane, from a hash rather than
  // Math.random(), so every frame of every run agrees on where they are.
  var STARS = [];
  (function () {
    for (var j = 0; j < 56; j++) {
      var a = Math.sin(j * 12.9898) * 43758.5453;
      var b = Math.sin(j * 78.233) * 12345.6789;
      STARS.push({ x: (a - Math.floor(a)) * 800, y: 8 + (b - Math.floor(b)) * 320, lit: j % 3 === 0 });
    }
  })();

  function drawSky(ctx, state) {
    var band = state.height / SKY.length;
    var i, d;
    for (i = 0; i < SKY.length; i++) {
      ctx.fillStyle = SKY[i];
      ctx.fillRect(0, Math.floor(i * band), state.width, Math.ceil(band) + 1);
    }
    // Soften each hard edge the way a 16-bit artist did: the next band's
    // colour on every other scanline, just above where it takes over.
    for (i = 1; i < SKY.length; i++) {
      ctx.fillStyle = SKY[i];
      var edge = Math.floor(i * band);
      for (d = 1; d <= DITHER; d++) ctx.fillRect(0, edge - d * 4, state.width, 2);
    }
  }

  function drawStars(ctx, state, scroll) {
    var w = state.width;
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i];
      ctx.fillStyle = s.lit ? '#dbdbff' : '#6d6db6';
      ctx.fillRect(Math.floor((((s.x - scroll) % w) + w) % w), Math.floor(s.y), 2, 2);
    }
  }

  /**
   * One plane's skyline: stepped columns along the bottom of the field, whose
   * heights come from the column's place in the WORLD, so scrolling slides the
   * same hills along rather than growing new ones.
   */
  function drawRidge(ctx, state, scroll, base, rise, seed, body, edge) {
    var first = Math.floor(scroll / COLUMN);
    var shift = scroll - first * COLUMN;
    var cols = Math.ceil(state.width / COLUMN) + 1;
    for (var i = 0; i < cols; i++) {
      var k = first + i;
      var h = base + rise * (0.55 * Math.sin(k * 0.13 + seed) +
                             0.30 * Math.sin(k * 0.047 + seed * 2.1) +
                             0.15 * Math.sin(k * 0.61 + seed * 0.7));
      h = Math.round(h / 4) * 4;
      var x = i * COLUMN - shift;
      var top = state.height - h;
      ctx.fillStyle = body;
      ctx.fillRect(x, top, COLUMN, h);
      ctx.fillStyle = edge;
      ctx.fillRect(x, top, COLUMN, 4);
    }
  }

  // ------------------------------------------------------------- the play
  function drawCentreLine(ctx, state) {
    var dash = 20;
    var gap = 16;
    var w = 8;
    var x = (state.width - w) / 2;
    for (var y = 6; y < state.height; y += dash + gap) {
      var h = Math.min(dash, state.height - y);
      ctx.fillStyle = '#6d6db6';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#b6b6ff';
      ctx.fillRect(x, y, w / 2, h);
    }
  }

  /** What a paddle and its score wear: era 1's pick, snapped to the palette. */
  function paddleInk(state, side) {
    return onPalette(R.eraLook(1).paddleInk(state, side));
  }

  // Across the bar, left to right: lit edge to shadowed edge.
  var BAR_STEPS = [2, 1, 0, 0, -1, -2];

  function drawShadedBar(ctx, p, ink) {
    ctx.fillStyle = SHADOW;
    ctx.fillRect(p.x + 5, p.y + 5, p.w, p.h);
    var n = BAR_STEPS.length;
    for (var i = 0; i < n; i++) {
      var x0 = p.x + Math.round(i * p.w / n);
      var x1 = p.x + Math.round((i + 1) * p.w / n);
      ctx.fillStyle = onPalette(ink, BAR_STEPS[i]);
      ctx.fillRect(x0, p.y, x1 - x0, p.h);
    }
    ctx.fillStyle = onPalette(ink, 3);          // the top catches the light
    ctx.fillRect(p.x, p.y, p.w, 3);
    ctx.fillStyle = onPalette(ink, -3);         // the bottom falls away
    ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);
  }

  var TRAIL = 6;          // ghosts behind the ball
  var TRAIL_DT = 0.016;   // seconds of flight between one ghost and the next
  var TRAIL_INK = '146,182,255';

  /**
   * The ball: the motion trail and the drop shadow as ever, then the generated
   * chrome ball (24x24 art drawn at the 12-unit ball, an exact half, so it stays
   * crisp) when S has it decoded, or the hand-drawn one while it has not.
   */
  function drawBall(ctx, state, S) {
    var b = state.ball;
    var s = b.size;
    for (var i = TRAIL; i >= 1; i--) {
      var gs = Math.max(2, Math.round(s * (1 - i / (TRAIL + 2))));
      var cx = b.x + s / 2 - b.vx * TRAIL_DT * i;
      var cy = Math.max(0, Math.min(state.height, b.y + s / 2 - b.vy * TRAIL_DT * i));
      ctx.fillStyle = 'rgba(' + TRAIL_INK + ',' + (0.55 * (1 - i / (TRAIL + 1))).toFixed(2) + ')';
      ctx.fillRect(cx - gs / 2, cy - gs / 2, gs, gs);
    }
    var q = Math.max(1, Math.round(s / 4));
    ctx.fillStyle = SHADOW;
    if (S && S.ready(ART.ball)) {
      // A round ball casts a round shadow: three rects that never overlap (the
      // shadow is half clear), so the corners are stepped off.
      ctx.fillRect(b.x + 4 + q, b.y + 4, s - 2 * q, q);
      ctx.fillRect(b.x + 4, b.y + 4 + q, s, s - 2 * q);
      ctx.fillRect(b.x + 4 + q, b.y + 4 + s - q, s - 2 * q, q);
      S.draw(ctx, ART.ball, Math.round(b.x), Math.round(b.y), s, s);
      return;
    }
    if (S) S.load(ART.ball);
    ctx.fillRect(b.x + 4, b.y + 4, s, s);
    ctx.fillStyle = '#b6b6db';
    ctx.fillRect(b.x, b.y, s, s);
    ctx.fillStyle = '#6d6d92';                  // shade on the far side
    ctx.fillRect(b.x + s - q, b.y, q, s);
    ctx.fillRect(b.x, b.y + s - q, s, q);
    ctx.fillStyle = '#ffffff';                  // the glint
    ctx.fillRect(b.x + q, b.y + q, q, q);
  }

  // Bevelled block digits: a lit edge along the top of every stroke, and a
  // SOLID drop shadow in the ink's own deep shade -- a translucent black one
  // vanishes into the night sky. Item 1226 set them into the stone panel
  // (16 native lines, 43 field units), so they are 7-unit blocks now, 35 tall.
  var SCORE = { cell: 7, gap: 5, top: 3, offset: 110, shadow: 3, bevel: 2 };

  function drawScore(ctx, state, side, centreX) {
    var text = String(state.score[side]);
    var ink = paddleInk(state, side);
    var cell = SCORE.cell;
    var gap = SCORE.gap;
    var top = SCORE.top;
    ctx.fillStyle = onPalette(ink, -3);
    R.drawText(ctx, text, centreX + SCORE.shadow, top + SCORE.shadow, cell, gap);
    ctx.fillStyle = onPalette(ink, 3);
    R.drawText(ctx, text, centreX, top, cell, gap);
    ctx.fillStyle = ink;
    R.drawText(ctx, text, centreX, top + SCORE.bevel, cell, gap);
  }

  // ------------------------------------------------------- the pixel art
  // Two pieces generated with tools/pixellab.mjs and snapped offline to the
  // palette above by tools/palette-snap.mjs (assets/pixellab/manifest.json
  // holds the request and the snap for each). Every piece is drawImage calls
  // only -- nothing here reads or loops over pixels. Until an image has
  // decoded, and always under node --test (there is no Image in Node), the
  // hand-drawn piece is drawn in its place, so the look never has a hole.
  var ART = { court: 'genesis-court', ball: 'genesis-ball' };

  /** The sprite loader, when this page can decode images at all. */
  function art() {
    var S = root.PongSprites;
    return S && typeof root.Image === 'function' ? S : null;
  }

  /**
   * The far plane as the generated court: its 320x240 picture -- the
   * Genesis's own 320-wide screen -- scaled to the field and scrolled with the
   * far plane, every other copy flipped so the join is seamless. The near
   * plane's hills still pass in front of it. False while it has not decoded.
   */
  function drawCourt(ctx, state, S, scroll) {
    if (!S.ready(ART.court)) { S.load(ART.court); return false; }
    var w = state.width;
    var h = state.height;
    var span = 2 * w;
    var off = ((scroll % span) + span) % span;
    for (var k = 0; k < 3; k++) {
      var x = Math.floor(k * w - off);
      if (x >= w || x + w <= 0) continue;
      if (k % 2 === 0) {
        S.draw(ctx, ART.court, x, 0, w, h);
      } else {
        ctx.save();
        ctx.translate(x + w, 0);
        ctx.scale(-1, 1);
        S.draw(ctx, ART.court, 0, 0, w, h);
        ctx.restore();
      }
    }
    return true;
  }

  // The paddles stay hand-drawn (drawShadedBar). Two generated paddles were
  // tried at 16x96 and both read wrong at play size: seed 393692841 ("vertical
  // bat paddle ... chrome bar") came back a baseball bat, its bottom third a
  // dark thin handle, so the paddle looked shorter than it hits; seed
  // 1170815782 ("one plain vertical rectangular bar ... same width top to
  // bottom", negative "handle, grip, bat") came back a battery -- a dark cap
  // over the top quarter and a '+' near the foot. The brief allows one retry,
  // so the stepped palette gradient below is the Genesis paddle.

  // ------------------------------------------ the arena (item 1226, docs/ART.md)
  // A torch-lit stone arena at night. The near plane is an arena wall under a
  // Golden Axe stone panel; four torches with pennants ride the wall. Each
  // piece is a pixellab image (snapped to the 512 colours) drawn with
  // drawImage once decoded, and a fillRect stand-in until then -- and always
  // under node --test.
  var ARENA = {
    panelH: 43,                 // 16 native lines of 2.68 units
    wallH: 96,                  // the wall band under it (36 native lines)
    torchX: [100, 300, 500, 700],
    torch: { w: 20, h: 40, dy: 22, frameS: 0.1 },
    portrait: { size: 40, leftX: 20, rightX: 740, frame: '#b6b6db', hot: '#ffdb00' },
    pots: { n: 5, w: 10, h: 16, gap: 4, empty: '#242449', full: '#2449ff', lid: '#b6b6db' },
    flash: { ink: '#ff0000', s: 0.3, blinks: 3 },
    flareS: 0.2,
    flames: ['#ff9200', '#ffdb00', '#db2400']
  };
  ART.wall = 'era3-arena-wall';
  ART.torch = 'era3-torch';
  ART.portraits = 'era3-portraits';
  ART.panel = 'era3-panel';

  /** A decoded image by name, or null (and its load started). */
  function image(S, name) {
    if (!S) return null;
    if (S.ready(name)) return S.load(name);
    S.load(name);
    return null;
  }

  // The moment a point was scored, as this era saw it: kept per game on the
  // score object (the ring's and the display's copies share it), read off
  // state.events -- which the ring's first frame of this era still carries.
  var moments = typeof WeakMap === 'function' ? new WeakMap() : null;

  function momentOf(state) {
    var key = state.score;
    var m = (moments && key && moments.get(key)) || { at: -Infinity, loser: null, time: 0 };
    if ((state.time || 0) < m.time) m = { at: -Infinity, loser: null, time: 0 };
    var evs = state.events || [];
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (ev && ev.type === 'score' && ev.time > m.at && (ev.side === 'left' || ev.side === 'right')) {
        m = { at: ev.time, loser: ev.side === 'left' ? 'right' : 'left', time: m.time };
      }
    }
    m.time = state.time || 0;
    if (moments && key && typeof key === 'object') moments.set(key, m);
    return m;
  }

  function matchPoint(state) {
    var P = root.Pong;
    try { return !!(P && typeof P.isMatchPoint === 'function' && P.isMatchPoint(state)); } catch (e) { return false; }
  }

  /** The wall band: the generated stone tiled along the near plane's scroll, or blocks. */
  function drawWall(ctx, state, S, scroll) {
    var w = state.width;
    var top = ARENA.panelH;
    var h = ARENA.wallH;
    var off = ((scroll % w) + w) % w;
    var img = image(S, ART.wall);
    if (img) {
      var smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      // Only the top 36 rows: pixflux lettered nonsense into the bottom rows,
      // and 36 rows into the 96-unit band is one row a native line.
      ctx.drawImage(img, 0, 0, 320, 36, Math.floor(-off), top, w, h);
      ctx.drawImage(img, 0, 0, 320, 36, Math.floor(w - off), top, w, h);
      ctx.imageSmoothingEnabled = smooth;
      return;
    }
    ctx.fillStyle = '#242449';
    ctx.fillRect(0, top, w, h);
    var bw = 40, bh = 24;
    for (var row = 0; row * bh < h; row++) {
      var shift = (row % 2) * bw / 2;
      ctx.fillStyle = '#000024';                       // mortar course
      ctx.fillRect(0, top + row * bh, w, 2);
      for (var x = -((off + shift) % bw); x < w; x += bw) {
        ctx.fillRect(Math.floor(x), top + row * bh, 2, Math.min(bh, h - row * bh));
        ctx.fillStyle = '#49496d';                     // each block's lit top
        ctx.fillRect(Math.floor(x) + 2, top + row * bh + 2, bw - 4, 2);
        ctx.fillStyle = '#000024';
      }
    }
    ctx.fillStyle = '#000024';
    ctx.fillRect(0, top + h - 3, w, 3);
  }

  /** One torch and its pennant at x, flame frame f (0-2), pennant frame pf. */
  function drawTorch(ctx, S, x, f, pf, pennant, tall) {
    var T = ARENA.torch;
    var top = ARENA.panelH + T.dy - (tall ? 6 : 0);
    var h = T.h + (tall ? 6 : 0);
    // the pennant, hung from the bracket: a stepped triangle, 2 frames
    ctx.fillStyle = pennant;
    var px = x + T.w / 2 + 2;
    var py = ARENA.panelH + T.dy + 20;
    for (var k = 0; k < 4; k++) {
      var len = 16 - k * 4 + (pf ? (k % 2 ? 2 : -2) : 0);
      ctx.fillRect(px, py + k * 4, Math.max(2, len), 4);
    }
    var img = image(S, ART.torch);
    if (img) {
      var smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, f * 16, 0, 16, 32, Math.floor(x - T.w / 2), top, T.w, h);
      ctx.imageSmoothingEnabled = smooth;
      return;
    }
    ctx.fillStyle = '#492400';                         // the iron bracket
    ctx.fillRect(x - 3, ARENA.panelH + T.dy + 18, 6, 22);
    var fl = [10, 14, 12][f] + (tall ? 6 : 0);
    ctx.fillStyle = ARENA.flames[2];
    ctx.fillRect(x - 6, ARENA.panelH + T.dy + 18 - fl, 12, fl);
    ctx.fillStyle = ARENA.flames[0];
    ctx.fillRect(x - 4, ARENA.panelH + T.dy + 18 - fl + 3, 8, fl - 3);
    ctx.fillStyle = ARENA.flames[1];
    ctx.fillRect(x - 2, ARENA.panelH + T.dy + 18 - fl + 6, 4, fl - 7);
  }

  function drawTorches(ctx, state, S, scroll, m, hot) {
    var t = state.time || 0;
    var rate = hot ? 2 : 1;                              // match point: double speed
    var flare = t - m.at >= 0 && t - m.at < ARENA.flareS;
    var w = state.width;
    for (var i = 0; i < ARENA.torchX.length; i++) {
      var x = (((ARENA.torchX[i] - scroll) % w) + w) % w;
      var f = flare ? 1 : (Math.floor(t * rate / ARENA.torch.frameS) + i) % 3;
      var pf = Math.floor(t * rate * 4 + i) % 2;
      var pennant = onPalette(paddleInk(state, i < 2 ? 'left' : 'right'), -2);
      drawTorch(ctx, S, x, f, pf, pennant, flare);
    }
  }

  /** The stone panel across the top: the generated slab's clean right half, mirrored. */
  function drawPanel(ctx, state, S, hot) {
    var w = state.width;
    var h = ARENA.panelH;
    var img = image(S, ART.panel);
    if (img) {
      // The generation's left half carries a stray golden axe; the right half
      // is clean stone, so it is drawn twice, the left copy mirrored.
      var smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 164, 0, 156, 32, w / 2, 0, w / 2, h);
      ctx.save();
      ctx.translate(w / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 164, 0, 156, 32, 0, 0, w / 2, h);
      ctx.restore();
      ctx.imageSmoothingEnabled = smooth;
    } else {
      ctx.fillStyle = '#494949';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#929292';
      ctx.fillRect(0, 0, w, 3);
      ctx.fillStyle = '#242424';
      ctx.fillRect(0, h - 4, w, 4);
      ctx.fillStyle = '#6d6d6d';
      for (var x = 12; x < w; x += 64) ctx.fillRect(x, h / 2 - 2, 4, 4);   // rivets
    }
    // The frame: a 1-native-pixel edge, gold while match point holds.
    ctx.fillStyle = hot ? ARENA.portrait.hot : '#000024';
    ctx.fillRect(0, h - 2, w, 2);
    if (hot) { ctx.fillRect(0, 0, w, 2); ctx.fillRect(0, 0, 2, h); ctx.fillRect(w - 2, 0, 2, h); }
  }

  /** A player's portrait, its frame, and the magic pots under it. */
  function drawPortrait(ctx, state, S, side, m) {
    var P = ARENA.portrait;
    var x = side === 'left' ? P.leftX : P.rightX;
    var y = 2;
    var s = P.size - 4;
    ctx.fillStyle = P.frame;
    ctx.fillRect(x - 2, y - 1, s + 4, s + 3);
    var img = image(S, ART.portraits);
    if (img) {
      var smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, side === 'left' ? 0 : 32, 0, 32, 32, x, y, s, s);
      ctx.imageSmoothingEnabled = smooth;
    } else {
      ctx.fillStyle = '#000024';
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = side === 'left' ? '#b66d49' : '#6d6d92';          // face or visor
      ctx.fillRect(x + 8, y + 10, s - 16, s - 12);
      ctx.fillStyle = side === 'left' ? '#b6b6b6' : '#924924';          // helmet or crest
      ctx.fillRect(x + 6, y + 4, s - 12, 6);
    }
    // The conceding portrait flashes red three times over 0.3 s.
    var age = (state.time || 0) - m.at;
    if (m.loser === side && age >= 0 && age < ARENA.flash.s &&
        Math.floor(age / (ARENA.flash.s / (ARENA.flash.blinks * 2))) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,0,0,0.6)';
      ctx.fillRect(x, y, s, s);
    }
    // Golden Axe's magic pots: one filled per 2 hits of this rally.
    var pots = ARENA.pots;
    var full = Math.min(pots.n, Math.floor((state.rally || 0) / 2));
    var span = pots.n * pots.w + (pots.n - 1) * pots.gap;
    var px = side === 'left' ? x + P.size + 6 : x - 6 - span;
    for (var k = 0; k < pots.n; k++) {
      var kx = px + k * (pots.w + pots.gap);
      ctx.fillStyle = pots.lid;
      ctx.fillRect(kx + 2, 10, pots.w - 4, 3);
      ctx.fillStyle = k < full ? pots.full : pots.empty;
      ctx.fillRect(kx, 13, pots.w, pots.h);
    }
  }

  function draw(ctx, state, opts) {
    if (opts && opts.ink) return R.drawBase(ctx, state, opts);
    var p = planes(state.time);
    var S = art();
    var m = momentOf(state);
    var hot = matchPoint(state);

    if (!(S && drawCourt(ctx, state, S, p.far))) {
      drawSky(ctx, state);
      drawStars(ctx, state, p.far);
      drawRidge(ctx, state, p.far, 150, 70, 0.4, '#242449', '#49496d');
    }
    drawWall(ctx, state, S, p.near);
    drawTorches(ctx, state, S, p.near, m, hot);

    drawCentreLine(ctx, state);
    drawPanel(ctx, state, S, hot);
    drawPortrait(ctx, state, S, 'left', m);
    drawPortrait(ctx, state, S, 'right', m);
    drawScore(ctx, state, 'left', state.width / 2 - SCORE.offset);
    drawScore(ctx, state, 'right', state.width / 2 + SCORE.offset);

    drawShadedBar(ctx, state.left, paddleInk(state, 'left'));
    drawShadedBar(ctx, state.right, paddleInk(state, 'right'));

    // The ball blinks out while the serve waits, as in every era.
    if (state.serveDelay <= 0) drawBall(ctx, state, S);
  }

  // ------------------------------------------------ the arrival: the shatter
  var SHATTER = {
    firstBand: 46,      // how deep the innermost band of shards is, in field units
    growth: 1.24,       // each band out is this much deeper than the one inside it
    wedge: 92,          // about how long a shard's outer edge is
    minWedges: 5,
    maxWedges: 36,
    maxFlight: 300,     // ring radius a loose shard takes to fly off, at most
    minFlight: 80,      // ...and at least, however near the far corner it breaks
    throwDist: 640,     // how far a shard has been thrown when its flight ends
    edgeInk: '#b6dbff', // the lit edge of the glass (on the palette)
    shadow: 'rgba(0,0,36,0.55)'
  };

  /** A small seeded generator (mulberry32): the same seed, the same sequence. */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** The seed for a break: the origin, rounded to the field unit. */
  function shatterSeed(origin) {
    return ((Math.round(origin.x) * 73856093) ^ (Math.round(origin.y) * 19349663) ^ 0x5e6a) >>> 0;
  }

  var shardCache = { key: '', list: null };

  function edgePoints(pts, ox, oy, radius, a0, a1) {
    if (!(radius > 0)) { pts.push(ox, oy); return; }
    pts.push(ox + Math.cos(a0) * radius, oy + Math.sin(a0) * radius);
    if (Math.abs(a1 - a0) * radius > 50) {
      var am = (a0 + a1) / 2;
      pts.push(ox + Math.cos(am) * radius, oy + Math.sin(am) * radius);
    }
    pts.push(ox + Math.cos(a1) * radius, oy + Math.sin(a1) * radius);
  }

  /**
   * The shards for a break at origin on a width x height field: a fixed list,
   * the same for the same point every time. Bands out from the origin, each cut
   * into irregular wedges whose sides twist a little between their inner and
   * outer ends, so the pieces read as broken glass rather than a dartboard.
   * Shards wholly off the field are left out. Each shard is
   *   pts   [x0, y0, x1, y1, ...] its corners in field units
   *   cx,cy its centre     box  [x, y, w, h] on the field, for the copy
   *   near  where the ring first touches it     mid  where it breaks loose
   *   dirX, dirY  the way it is thrown           spin radians over its flight
   *   throwK      how hard it is thrown (about 1)
   */
  function shards(origin, width, height) {
    var key = Math.round(origin.x) + ',' + Math.round(origin.y) + ',' + width + ',' + height;
    if (shardCache.key === key) return shardCache.list;
    var rand = seeded(shatterSeed(origin));
    var ox = origin.x;
    var oy = origin.y;
    var fx = Math.max(ox, width - ox);
    var fy = Math.max(oy, height - oy);
    var reach = Math.sqrt(fx * fx + fy * fy) + 40;
    var TAU = Math.PI * 2;
    var list = [];
    var inner = 0;
    var depth = SHATTER.firstBand;
    while (inner < reach) {
      var outer = inner + depth * (0.8 + 0.4 * rand());
      var n = Math.max(SHATTER.minWedges,
        Math.min(SHATTER.maxWedges, Math.round(TAU * outer / SHATTER.wedge)));
      var step = TAU / n;
      var start = rand() * TAU;
      var cuts = [];
      var k;
      // Cut angles jittered by a quarter wedge and twisted by a fifth, so two
      // neighbouring cuts can never cross.
      for (k = 0; k < n; k++) {
        var a = start + (k + (rand() - 0.5) * 0.5) * step;
        cuts.push([a, a + (rand() - 0.5) * 0.4 * step]);
      }
      for (k = 0; k < n; k++) {
        var c0 = cuts[k];
        var c1 = cuts[(k + 1) % n];
        var wrap = k === n - 1 ? TAU : 0;
        var pts = [];
        edgePoints(pts, ox, oy, inner, c0[0], c1[0] + wrap);
        var outerPts = [];
        edgePoints(outerPts, ox, oy, outer, c0[1], c1[1] + wrap);
        for (var j = outerPts.length - 2; j >= 0; j -= 2) pts.push(outerPts[j], outerPts[j + 1]);

        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var sx = 0, sy = 0, count = pts.length / 2;
        for (j = 0; j < pts.length; j += 2) {
          sx += pts[j]; sy += pts[j + 1];
          if (pts[j] < minX) minX = pts[j];
          if (pts[j] > maxX) maxX = pts[j];
          if (pts[j + 1] < minY) minY = pts[j + 1];
          if (pts[j + 1] > maxY) maxY = pts[j + 1];
        }
        var bx = Math.max(0, Math.floor(minX));
        var by = Math.max(0, Math.floor(minY));
        var bw = Math.min(width, Math.ceil(maxX)) - bx;
        var bh = Math.min(height, Math.ceil(maxY)) - by;
        // Two draws of rand per shard happen whether it is kept or not, so a
        // shard's throw never depends on which of its neighbours were culled.
        var throwAngle = (rand() - 0.5) * 0.7;
        var spinDraw = rand();
        if (bw <= 0 || bh <= 0) continue;
        var cx = sx / count;
        var cy = sy / count;
        var d = Math.sqrt((cx - ox) * (cx - ox) + (cy - oy) * (cy - oy));
        var base = d > 0.001 ? Math.atan2(cy - oy, cx - ox) : spinDraw * TAU;
        list.push({
          pts: pts, cx: cx, cy: cy, box: [bx, by, bw, bh],
          // The chord between two corners dips inside the circle, so the ring
          // touches a shard a little before it reaches the corners.
          near: Math.max(0, inner * Math.cos(Math.min(Math.PI / 2, step)) - 2),
          mid: d,
          dirX: Math.cos(base + throwAngle), dirY: Math.sin(base + throwAngle),
          spin: (spinDraw < 0.5 ? -1 : 1) * (2 + spinDraw * 6),
          throwK: 0.75 + 0.5 * rand()
        });
      }
      inner = outer;
      depth *= SHATTER.growth;
    }
    shardCache = { key: key, list: list };
    return list;
  }

  /**
   * Where one shard is when the ring's edge is at `radius` and will end at
   * `reach`: null while the ring has not reached it (the old frame is still
   * whole there) and null once its flight is over; otherwise
   *   { phase: 'crack' | 'fly', q, x, y, angle, scale, alpha }
   * with x, y its offset from where it sat. A flight lasts at most maxFlight of
   * ring radius and never past `reach`, so at the end of the wipe every shard
   * has flown.
   */
  function shardPose(s, radius, reach) {
    if (!(radius > s.near) || !(radius < reach)) return null;
    // A shard breaks loose at its middle, but never later than minFlight
    // before the end, so one out by the far corner still flies rather than
    // sitting cracked until the last frame and blinking out.
    var loose = Math.min(s.mid, reach - SHATTER.minFlight);
    if (radius < loose) {
      return { phase: 'crack', q: 0, x: 0, y: 0, angle: 0, scale: 1, alpha: 1,
               glint: (radius - s.near) / Math.max(1, loose - s.near) };
    }
    var span = Math.min(SHATTER.maxFlight, reach - loose);
    if (!(span > 0)) return null;
    var q = (radius - loose) / span;
    if (q >= 1) return null;
    var travel = SHATTER.throwDist * s.throwK * (0.3 * q + 0.7 * q * q);
    return {
      phase: 'fly', q: q,
      x: s.dirX * travel, y: s.dirY * travel,
      angle: s.spin * q * (0.6 + 0.4 * q),
      scale: (1 - q * q) * (1 + 0.35 * q),
      alpha: q < 0.7 ? 1 : (1 - q) / 0.3,
      glint: 1 - q
    };
  }

  // One offscreen copy of the old era's frame, redrawn each frame of the ring
  // from the live state, so the paddles in the flying glass still move.
  var oldCanvas = null;

  function oldFrame(state, fromEra, dim, w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    if (!oldCanvas) oldCanvas = document.createElement('canvas');
    if (oldCanvas.width !== w) oldCanvas.width = w;
    if (oldCanvas.height !== h) oldCanvas.height = h;
    var o = oldCanvas.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, w, h);
    o.save();
    R.draw(o, Object.assign({}, state, { era: fromEra }), dim ? { ink: dim } : undefined);
    o.restore();
    return oldCanvas;
  }

  function tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  }

  function placeShard(ctx, s, pose, dx, dy) {
    ctx.translate(s.cx + pose.x + dx, s.cy + pose.y + dy);
    ctx.rotate(pose.angle);
    ctx.scale(pose.scale, pose.scale);
    ctx.translate(-s.cx, -s.cy);
  }

  function drawShard(ctx, s, pose, src, edge, dim) {
    if (pose.phase === 'fly' && !dim) {
      // Its shadow on the new era below, falling further as it rises.
      ctx.save();
      var lift = 6 + 22 * pose.q;
      placeShard(ctx, s, pose, lift, lift);
      ctx.globalAlpha = pose.alpha;
      tracePath(ctx, s.pts);
      ctx.fillStyle = SHATTER.shadow;
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    placeShard(ctx, s, pose, 0, 0);
    ctx.globalAlpha = pose.alpha;
    tracePath(ctx, s.pts);
    if (src) {
      ctx.save();
      ctx.clip();
      var b = s.box;
      ctx.drawImage(src, b[0], b[1], b[2], b[3], b[0], b[1], b[2], b[3]);
      ctx.restore();
    }
    ctx.globalAlpha = pose.alpha * (0.35 + 0.65 * pose.glint);
    ctx.lineWidth = 2 / Math.max(0.25, pose.scale);
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The flourish hook (src/erachange.js is the contract). Draws the impact
   * flash, the cracking shards on the ring's edge, then the loose ones flying
   * over the new era. Returns how many shards it drew.
   */
  function shatter(ctx, p, origin, fromEra, toEra, info) {
    var r = info.radius;
    if (!(r > 0) || !(p > 0) || p >= 1) return 0;
    var w = info.width;
    var h = info.height;
    var reach = r / p;              // the ring's radius is p x its full reach
    var dim = info.dim || null;
    var edge = dim || SHATTER.edgeInk;
    var list = shards(origin, w, h);
    var src = oldFrame(info.state, fromEra, dim, w, h);

    // The impact: a white flash at the point, gone by a fifth of the way.
    if (p < 0.2 && ctx.createRadialGradient) {
      var f = 1 - p / 0.2;
      var g = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, 60 + 260 * p);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * f).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(182,219,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    var flying = [];
    var drawn = 0;
    for (var i = 0; i < list.length; i++) {
      var pose = shardPose(list[i], r, reach);
      if (!pose) continue;
      if (pose.phase === 'fly') { flying.push(list[i], pose); continue; }
      drawShard(ctx, list[i], pose, src, edge, dim);
      drawn += 1;
    }
    for (var k = 0; k < flying.length; k += 2) {
      drawShard(ctx, flying[k], flying[k + 1], src, edge, dim);
      drawn += 1;
    }
    return drawn;
  }

  R.registerEra({
    era: 3,
    name: '1989 Sega Genesis',
    paddleInk: paddleInk,
    draw: draw,
    flourish: shatter,
    shatter: { shards: shards, pose: shardPose, seed: shatterSeed, SHATTER: SHATTER },
    planes: planes,
    onPalette: onPalette,
    LEVELS: LEVELS,
    SCORE: SCORE,
    ARENA: ARENA,
    ART: ART,
    momentOf: momentOf,
    TRAIL: TRAIL,
    TRAIL_INK: TRAIL_INK,
    SHADOW: SHADOW
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
