/*
 * Super Ultra Pong 64: Remastered -- the TV and HDTV overlays for eras 5 to 10.
 *
 * Each 3D machine is seen on the screen of its day (docs/ERAS.md, chapters 5
 * to 10), drawn OVER the picture src/display.js has already scaled up onto the
 * page:
 *
 *   tv-composite   a 1990s CRT over a composite cable -- the PlayStation (5) and
 *                  Nintendo 64 (6): soft scanlines, colour bleeding sideways, the
 *                  picture a touch blurry; the PlayStation's row adds its 4 x 4
 *                  ordered dither, visible in the flat shading.
 *   tv-component   a late CRT over component -- the PlayStation 2 (8): cleaner,
 *                  thinner scanlines and a faint bloom.
 *   tv-vga         a sharp VGA or component picture -- the Dreamcast (7) and the
 *                  Xbox (9): only a faint line structure and a little edge glow.
 *   hdtv-720p      a 720p flat panel -- the Xbox 360 (10): no scanlines, a hint of
 *                  LCD softness and a slight smear on fast movement.
 *
 * How it stays cheap: every blend is done on a copy of the NATIVE picture --
 * the frame drawn again offset, shrunk, or last frame's copy, at low alpha, and
 * pre-drawn canvases (made once) -- and the page gets only two draws a frame:
 * the finished copy and the scanline strip. No pixel is ever read or written
 * one at a time.
 *
 * How it keeps the ball the brightest, sharpest thing on screen (ERAS.md R1,
 * R2): every redraw of the frame uses a mode that can only brighten
 * ('lighten', 'screen') or that keeps the picture's own brightness ('color',
 * 'soft-light'), so no bleed, bloom or smear ever dims or blurs the ball's
 * white core; the only darkening is the scanlines' gaps, between its lines.
 * The dither is mid-grey based in 'soft-light', which leaves pure white and
 * pure black exactly as they were -- it shows only in the flat mid-tones.
 *
 * The era files are never touched: every era's own look (fog, cel shading,
 * sparks, bloom) is in the native picture underneath.
 */
(function (root) {
  'use strict';

  var D = root.PongDisplay;
  if (!D) return;

  /**
   * The strength of each part of a kind, at row strength 1. A row's strength
   * scales them all. Tuned by eye against docs/ERAS.md.
   *   scan       how dark the gap between two scanlines is (0 none .. 1 black)
   *   scanShape  the profile of one line, top to bottom, in 0..1 darkness steps
   *   bleed      the frame again one native pixel left and right, 'lighten'
   *   chroma     the frame again two native pixels right, 'color' (hue only)
   *   glow       a shrunken copy of the frame, scaled back up, 'screen'
   *   glowScale  how small that copy is (a fraction of the native picture)
   *   soft       a half-size copy, 'lighten' (LCD softness)
   *   smear      the previous frame, 'lighten' (motion smear)
   *   dither     the 4 x 4 ordered dither, 'soft-light'
   */
  var KINDS = {
    'tv-composite': { scan: 0.34, scanShape: [0, 0, 0.35, 1], bleed: 0.4, chroma: 0.45,
                      glow: 0.07, glowScale: 0.25, soft: 0, smear: 0, dither: 0.55 },
    'tv-component': { scan: 0.24, scanShape: [0, 0, 0, 0.2, 1], bleed: 0.14, chroma: 0,
                      glow: 0.24, glowScale: 0.2, soft: 0, smear: 0, dither: 0 },
    'tv-vga':       { scan: 0.1, scanShape: [0, 0, 0, 1], bleed: 0, chroma: 0,
                      glow: 0.16, glowScale: 0.35, soft: 0, smear: 0, dither: 0 },
    'hdtv-720p':    { scan: 0, scanShape: [0], bleed: 0, chroma: 0,
                      glow: 0, glowScale: 0.5, soft: 0.22, smear: 0.4, dither: 0 }
  };

  /** Which kind each era's row uses, and how strongly. */
  var ASSIGN = {
    5:  { overlay: 'tv-composite', strength: 1, dither: true },   // PlayStation
    6:  { overlay: 'tv-composite', strength: 0.9, dither: false }, // Nintendo 64
    7:  { overlay: 'tv-vga', strength: 1 },                        // Dreamcast, VGA box
    8:  { overlay: 'tv-component', strength: 1 },                  // PlayStation 2
    9:  { overlay: 'tv-vga', strength: 0.85 },                     // Xbox, component
    10: { overlay: 'hdtv-720p', strength: 1 }                      // Xbox 360, 720p panel
  };

  // --------------------------------------------------------- made-once canvases
  var cache = {};

  function hasDocument() {
    return typeof document !== 'undefined' && document && typeof document.createElement === 'function';
  }

  function canvasOf(name, w, h) {
    var c = cache[name];
    if (!c) { c = cache[name] = document.createElement('canvas'); c.made = 0; }
    var fresh = c.width !== w || c.height !== h;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return { c: c, x: c.getContext('2d'), fresh: fresh };
  }

  /**
   * The scanline strip: ONE pixel wide, len rows per native line, drawn once
   * for each (lines, shape, darkness) and kept and stretched over the whole picture with
   * smoothing on, which is what turns its few rows into a soft line profile.
   */
  function scanStrip(lines, shape, dark) {
    var len = shape.length;
    var key = lines + ':' + shape.join(',') + ':' + dark.toFixed(3);
    var s = canvasOf('scan:' + key, 1, lines * len);
    if (s.c.made) return s.c;
    s.c.made++;
    var x = s.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, 1, lines * len);
    for (var i = 0; i < len; i++) {
      if (!(shape[i] > 0)) continue;
      x.fillStyle = 'rgba(0,0,0,' + (shape[i] * dark).toFixed(3) + ')';
      for (var l = 0; l < lines; l++) x.fillRect(0, l * len + i, 1, 1);
    }
    return s.c;
  }

  // The 4 x 4 Bayer matrix the PlayStation's GPU dithered with.
  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /**
   * The dither screen: the native picture's size, every native pixel one grey
   * around mid-grey from the Bayer cell it sits on. Made from a 4 x 4 tile
   * filled as a pattern -- one fill, once per size.
   */
  function ditherScreen(w, h) {
    var d = canvasOf('dither', w, h);
    if (!d.fresh && d.c.made) return d.c;
    d.c.made++;
    var t = canvasOf('ditherTile', 4, 4);
    for (var i = 0; i < 16; i++) {
      var v = Math.round(128 + (BAYER4[i] - 7.5) * 9);
      t.x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      t.x.fillRect(i % 4, Math.floor(i / 4), 1, 1);
    }
    d.x.setTransform(1, 0, 0, 1, 0, 0);
    d.x.clearRect(0, 0, w, h);
    d.x.fillStyle = d.x.createPattern(t.c, 'repeat');
    d.x.fillRect(0, 0, w, h);
    return d.c;
  }

  // ------------------------------------------------------------------ drawing
  // Every blend happens on a copy of the NATIVE picture (320 x 240 for the
  // PlayStation), never on the page: blending the page's million-odd pixels
  // seven times a frame held the 3D eras to 10-20 frames a second in the
  // playtest's Chrome. The finished copy is then put on the page with one
  // drawImage over the plain picture, and the scanlines with one more.

  /** Draw src over the whole of a w x h canvas, in a mode, at an alpha, offset dx. */
  function blend(x, src, w, h, mode, alpha, dx) {
    if (!(alpha > 0) || !src) return;
    x.globalCompositeOperation = mode;
    x.globalAlpha = Math.min(1, alpha);
    x.drawImage(src, 0, 0, src.width, src.height, dx || 0, 0, w, h);
  }

  /** A shrunken copy of the native frame, for glow and softness. */
  function shrunk(name, native, scale) {
    var w = Math.max(8, Math.round(native.width * scale));
    var h = Math.max(6, Math.round(native.height * scale));
    var s = canvasOf(name, w, h);
    s.x.setTransform(1, 0, 0, 1, 0, 0);
    s.x.globalCompositeOperation = 'copy';
    s.x.globalAlpha = 1;
    s.x.imageSmoothingEnabled = true;
    s.x.drawImage(native, 0, 0, native.width, native.height, 0, 0, w, h);
    s.x.globalCompositeOperation = 'source-over';
    return s.c;
  }

  /** The previous frame, kept at half size for the 720p panel's smear. */
  var smearState = { era: -1, time: -1, have: false };

  function drawKind(k, ctx, rect, row, info) {
    var native = info && info.native;
    var s = row.strength == null ? 1 : row.strength;
    if (!native || !(s > 0) || !hasDocument()) return;
    var W = native.width, H = native.height;

    // The copy the blends land on -- the playtest reads the native picture
    // itself, which stays exactly as the era drew it.
    var post = canvasOf('post', W, H), x = post.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.imageSmoothingEnabled = true;
    blend(x, native, W, H, 'copy', 1, 0);

    // Colour bleed and a touch of blur: the frame one native pixel to either
    // side, only ever brightening, so bright edges spread and nothing dims.
    if (k.bleed) {
      blend(x, native, W, H, 'lighten', k.bleed * s * 0.5, -1);
      blend(x, native, W, H, 'lighten', k.bleed * s * 0.5, 1);
    }
    // Composite's chroma rides a narrower band than its brightness: the hue
    // lags two native pixels, the brightness stays where it was.
    if (k.chroma) blend(x, native, W, H, 'color', k.chroma * s, 2);

    // LCD softness: a half-size copy, brightening only.
    if (k.soft) blend(x, shrunk('soft', native, 0.5), W, H, 'lighten', k.soft * s, 0);

    // Motion smear: last frame's picture, brightening only, so the ball leaves
    // a faint trail on fast movement and a still picture looks unchanged.
    if (k.smear) {
      var prev = cache.prev;
      if (smearState.have && smearState.era === info.era && info.time >= smearState.time &&
          info.time - smearState.time < 0.1 && prev) {
        blend(x, prev, W, H, 'lighten', k.smear * s, 0);
      }
      var p = canvasOf('prev', Math.round(W / 2), Math.round(H / 2));
      p.x.setTransform(1, 0, 0, 1, 0, 0);
      p.x.globalCompositeOperation = 'copy';
      p.x.globalAlpha = 1;
      p.x.imageSmoothingEnabled = true;
      p.x.drawImage(native, 0, 0, W, H, 0, 0, p.c.width, p.c.height);
      p.x.globalCompositeOperation = 'source-over';
      smearState.era = info.era; smearState.time = info.time; smearState.have = true;
    }

    // Bloom / edge glow: a small copy scaled back up is a wide soft blur;
    // 'screen' only adds light, and never past white.
    if (k.glow) blend(x, shrunk('glow', native, k.glowScale), W, H, 'screen', k.glow * s, 0);

    // The PlayStation's ordered dither, one native pixel per cell.
    if (k.dither && row.dither) blend(x, ditherScreen(W, H), W, H, 'soft-light', k.dither * s, 0);

    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';

    // Onto the page: the finished copy over the plain picture, scaled the way
    // the row scales, then the scanlines, one strip per native line.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = !!row.smooth;
    ctx.drawImage(post.c, 0, 0, W, H, rect.x, rect.y, rect.w, rect.h);
    if (k.scan) {
      ctx.imageSmoothingEnabled = true;
      var strip = scanStrip(H, k.scanShape, Math.min(1, k.scan * s));
      ctx.drawImage(strip, 0, 0, strip.width, strip.height, rect.x, rect.y, rect.w, rect.h);
    }
  }

  Object.keys(KINDS).forEach(function (name) {
    D.registerOverlay(name, function (ctx, rect, row, info) { drawKind(KINDS[name], ctx, rect, row, info); });
  });

  Object.keys(ASSIGN).forEach(function (era) {
    var a = ASSIGN[era], r = D.ROWS[+era];
    if (!r) return;
    r.overlay = a.overlay;
    r.strength = a.strength;
    r.dither = !!a.dither;
  });

  var api = root.PongDisplayTV = { KINDS: KINDS, ASSIGN: ASSIGN, BAYER4: BAYER4, cache: cache };
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
