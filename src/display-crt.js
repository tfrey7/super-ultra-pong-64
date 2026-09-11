/*
 * Super Ultra Pong 64: Remastered -- the CRT overlays for eras 0 to 4.
 *
 * Each 2D machine is shown on the screen of its day, drawn OVER the scaled-up
 * native picture on the page canvas (src/display.js calls the row's overlay
 * with the page context, the rectangle the picture fills and the native
 * canvas). Four kinds, one per kind of screen:
 *
 *   crt-mono       1972 arcade: a black-and-white monitor. Heavy, hard
 *                  scanlines and a strong phosphor glow bleeding off the white
 *                  shapes. No colour mask -- a mono tube has none.
 *   crt-rf         1977 Atari 2600 over an RF cable into a 1970s colour TV:
 *                  soft, fuzzy scanlines, wide colour bleed, a slow band of
 *                  brightness rolling down the tube and a little snow.
 *   crt-composite  NES and Genesis over composite into a 1980s TV: visible
 *                  scanlines, a phosphor triad grain, red and blue fringes on
 *                  sharp edges, rounded corners and a vignette.
 *   crt-svideo     Super Nintendo over S-video: fine scanlines, a mild glow,
 *                  no fringing, the same gentle tube shape.
 *
 * How it stays cheap -- nothing here touches a pixel one at a time:
 *   - the scanlines, the triad grain, the vignette and the rounded corners are
 *     pre-drawn ONCE into one "shade" canvas the size of the picture (rebuilt
 *     only when that size changes) and multiplied over the frame with ONE
 *     drawImage;
 *   - the glow is the native frame shrunk into a small canvas and drawn back up
 *     with smoothing on, added ('lighter') at low alpha, so the bright shapes
 *     bleed light;
 *   - the fringes are the native frame multiplied by red and by blue in two
 *     native-sized canvases and added one native pixel to the left and right;
 *   - both of those land on a native-sized COPY of the picture, and the page
 *     gets that copy with one plain drawImage (item 1240), so the only blend
 *     over the page's own pixels is the shade's one multiply;
 *   - the RF shimmer is one gradient band; its snow a pre-drawn noise tile.
 * The era files are never touched: this only draws over what they drew, and
 * the playtest's pixel checks read the native picture from before it.
 *
 * The ball stays the brightest, sharpest thing on screen: every layer here
 * treats the whole picture alike (the multiply darkens everything by the same
 * amount, the glow adds most where the picture is brightest), and the fringes
 * are faint and never replace the sharp picture underneath.
 *
 * Canvas 2D, a plain script, no dependencies.
 */
(function (root) {
  'use strict';

  var D = root.PongDisplay;
  if (!D) return;

  // The tuning, one entry per kind. Alphas are multiplied by the row's
  // strength, so a row can be turned down without touching the kind.
  //   scan      how dark the gap between two scanlines gets, 0..1
  //   soft      0: hard-edged dark gaps; 1: a smooth ripple (fuzzy RF)
  //   gap       how much of each line the dark gap takes, 0..1
  //   glow      alpha of the added glow; glowShrink how far it is shrunk first
  //   fringe    alpha of each coloured fringe; fringePx its offset in native px
  //   triad     how strongly the phosphor stripes tint, 0..1
  //   vignette  how dark the corners get, 0..1
  //   corner    the rounded corner's radius, as a fraction of the height
  //   roll      alpha of the rolling band (RF)
  //   snow      alpha of the snow (RF)
  //   tint      the phosphor's own colour, multiplied over everything
  var KINDS = {
    'crt-mono': {
      scan: 0.62, soft: 0.15, gap: 0.5, glow: 0.55, glowShrink: 4,
      fringe: 0, fringePx: 0, triad: 0, vignette: 0.35, corner: 0.06,
      roll: 0, snow: 0, tint: '#eef4ff'
    },
    'crt-rf': {
      scan: 0.38, soft: 1, gap: 0.6, glow: 0.4, glowShrink: 4,
      fringe: 0.28, fringePx: 1.5, triad: 0.12, vignette: 0.4, corner: 0.07,
      roll: 0.07, snow: 0.07, tint: null
    },
    'crt-composite': {
      scan: 0.4, soft: 0.45, gap: 0.45, glow: 0.3, glowShrink: 3,
      fringe: 0.26, fringePx: 1, triad: 0.22, vignette: 0.38, corner: 0.055,
      roll: 0, snow: 0, tint: null
    },
    'crt-svideo': {
      scan: 0.26, soft: 0.35, gap: 0.4, glow: 0.18, glowShrink: 3,
      fringe: 0, fringePx: 0, triad: 0.1, vignette: 0.26, corner: 0.045,
      roll: 0, snow: 0, tint: null
    }
  };

  // The rows: which kind of screen each 2D machine was seen on, how strongly,
  // and how many scanlines its picture had (the arcade's tall blocks were two
  // scanlines each; every other machine drew one line per native row). A row
  // may also set its own `glow`, in place of its kind's.
  //
  // The Genesis has no glow (item 1201). It draws the heaviest picture of the
  // five, and in the playtest's software-drawn Chrome the composite screen's
  // four page-sized blends tipped it past a frame: on the ladder walk 18.18 ms
  // with the screen on against 16.66 ms off, and its rings in and out at 23.5
  // and 25.9 ms against 16.67. Taking either the fringes or the glow out put it
  // back on 16.67 ms; the fringes are the Genesis-over-composite look, the glow
  // at 0.27 alpha barely shows, so the glow went (docs/measure/item1201).
  var USE = [
    { era: 0, overlay: 'crt-mono',      strength: 1,    lines: 240 },
    { era: 1, overlay: 'crt-rf',        strength: 1,    lines: 192 },
    { era: 2, overlay: 'crt-composite', strength: 1,    lines: 240 },
    { era: 3, overlay: 'crt-composite', strength: 0.9,  lines: 224, glow: 0 },
    { era: 4, overlay: 'crt-svideo',    strength: 1,    lines: 224 }
  ];

  function canvasOf(w, h, c) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    c = c || document.createElement('canvas');
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c;
  }

  function grey(v) {
    var n = Math.max(0, Math.min(255, Math.round(v * 255)));
    return 'rgb(' + n + ',' + n + ',' + n + ')';
  }

  // ------------------------------------------------------------ the shade
  // White where the picture shows through untouched, darker where the tube
  // darkens it, black outside the rounded corners. Multiplied over the frame.

  var shades = {};   // kind -> { key, canvas }

  function buildShade(k, w, h, lines) {
    var c = canvasOf(w, h);
    if (!c) return null;
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, w, h);

    // Scanlines: each line lit in its middle, dark in its gap.
    var lineH = h / lines;
    var dark = grey(1 - k.scan);
    var edge = Math.max(0.02, Math.min(0.49, k.gap / 2));
    for (var i = 0; i < lines; i++) {
      var y0 = i * lineH;
      var g = x.createLinearGradient(0, y0, 0, y0 + lineH);
      if (k.soft >= 0.99) {
        g.addColorStop(0, dark); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, dark);
      } else {
        var s = edge * (1 - k.soft);
        g.addColorStop(0, dark);
        g.addColorStop(Math.max(0.001, s), dark);
        g.addColorStop(Math.min(0.499, edge + (0.5 - edge) * k.soft), '#ffffff');
        g.addColorStop(Math.max(0.501, 1 - edge - (0.5 - edge) * k.soft), '#ffffff');
        g.addColorStop(Math.min(0.999, 1 - s), dark);
        g.addColorStop(1, dark);
      }
      x.fillStyle = g;
      x.fillRect(0, y0, w, lineH + 0.5);
    }

    x.globalCompositeOperation = 'multiply';

    // Phosphor triads: red, green and blue stripes about a line wide.
    if (k.triad > 0) {
      var col = Math.max(1, Math.round(lineH / 3));
      var tile = canvasOf(col * 3, 1);
      var tx = tile.getContext('2d');
      var o = Math.round(255 * (1 - k.triad));
      tx.fillStyle = 'rgb(255,' + o + ',' + o + ')'; tx.fillRect(0, 0, col, 1);
      tx.fillStyle = 'rgb(' + o + ',255,' + o + ')'; tx.fillRect(col, 0, col, 1);
      tx.fillStyle = 'rgb(' + o + ',' + o + ',255)'; tx.fillRect(col * 2, 0, col, 1);
      x.fillStyle = x.createPattern(tile, 'repeat');
      x.fillRect(0, 0, w, h);
    }

    // The phosphor's own colour (the arcade's slightly blue-white).
    if (k.tint) {
      x.fillStyle = k.tint;
      x.fillRect(0, 0, w, h);
    }

    // The vignette: the tube's corners are further from the gun.
    if (k.vignette > 0) {
      var r = Math.sqrt(w * w + h * h) / 2;
      var v = x.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
      v.addColorStop(0, '#ffffff');
      v.addColorStop(1, grey(1 - k.vignette));
      x.fillStyle = v;
      x.fillRect(0, 0, w, h);
    }

    // The curve: black outside a rounded rectangle.
    if (k.corner > 0) {
      var rad = Math.round(h * k.corner);
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = '#000000';
      x.beginPath();
      x.rect(0, 0, w, h);
      roundRect(x, 0, 0, w, h, rad);
      x.fill('evenodd');
    }
    return c;
  }

  function roundRect(x, l, t, w, h, r) {
    x.moveTo(l + r, t);
    x.lineTo(l + w - r, t);
    x.quadraticCurveTo(l + w, t, l + w, t + r);
    x.lineTo(l + w, t + h - r);
    x.quadraticCurveTo(l + w, t + h, l + w - r, t + h);
    x.lineTo(l + r, t + h);
    x.quadraticCurveTo(l, t + h, l, t + h - r);
    x.lineTo(l, t + r);
    x.quadraticCurveTo(l, t, l + r, t);
    x.closePath();
  }

  function shadeFor(kind, k, w, h, lines) {
    var key = w + 'x' + h + '/' + lines;
    var s = shades[kind];
    if (!s || s.key !== key) {
      s = shades[kind] = { key: key, canvas: buildShade(k, w, h, lines) };
    }
    return s.canvas;
  }

  // ------------------------------------------------------- per-frame layers

  var work = {};     // small canvases reused frame to frame

  /** The native frame multiplied by one colour, in a native-sized canvas. */
  function tinted(name, native, colour) {
    var c = canvasOf(native.width, native.height, work[name]);
    if (!c) return null;
    work[name] = c;
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.imageSmoothingEnabled = false;
    x.drawImage(native, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    return c;
  }

  /** The native frame shrunk, so drawing it back up with smoothing blurs it. */
  function shrunk(native, by) {
    var w = Math.max(1, Math.round(native.width / by));
    var h = Math.max(1, Math.round(native.height / by));
    var c = canvasOf(w, h, work.glow);
    if (!c) return null;
    work.glow = c;
    var x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.imageSmoothingEnabled = true;
    x.clearRect(0, 0, w, h);
    x.drawImage(native, 0, 0, native.width, native.height, 0, 0, w, h);
    return c;
  }

  var noise = null;
  function noiseTile() {
    if (noise) return noise;
    var c = canvasOf(96, 96);
    if (!c) return null;
    var x = c.getContext('2d');
    x.fillStyle = '#000000';
    x.fillRect(0, 0, 96, 96);
    // A fixed scatter of specks, drawn once; its offset moves every frame.
    var seed = 12345;
    for (var i = 0; i < 700; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var px = seed % 96;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      var py = seed % 96;
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      x.fillStyle = grey(0.4 + (seed % 60) / 100);
      x.fillRect(px, py, 2, 1);
    }
    noise = c;
    return c;
  }

  function drawKind(kind) {
    var k = KINDS[kind];
    return function (ctx, rect, row, info) {
      var native = info && info.native;
      if (!native || !rect || rect.w < 2 || rect.h < 2) return;
      var st = row.strength == null ? 1 : row.strength;
      if (st <= 0) return;
      var W = native.width, H = native.height;
      var glow = row.glow != null ? row.glow : k.glow;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();

      // Fringes and glow are blended on a copy of the NATIVE picture (256 x
      // 240 for the NES), never on the page (item 1240, after item 1200's TV
      // screens): three 'lighter' blends over the page's half a million
      // pixels tipped the Genesis and its rings past a frame in the
      // playtest's software-drawn Chrome. The finished copy goes onto the page
      // with one plain, hard-edged drawImage over the plain picture.
      var post = (k.fringe > 0 || glow > 0) ? canvasOf(W, H, work.post) : null;
      if (post) {
        work.post = post;
        var x = post.getContext('2d');
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'copy';
        x.imageSmoothingEnabled = false;
        x.drawImage(native, 0, 0, W, H, 0, 0, W, H);

        // Colour fringes: red a native pixel left, blue a native pixel right.
        if (k.fringe > 0) {
          var red = tinted('red', native, '#ff3010');
          var blue = tinted('blue', native, '#1040ff');
          if (red && blue) {
            x.globalCompositeOperation = 'lighter';
            x.globalAlpha = k.fringe * st;
            x.imageSmoothingEnabled = true;
            x.drawImage(red, 0, 0, W, H, -k.fringePx, 0, W, H);
            x.drawImage(blue, 0, 0, W, H, k.fringePx, 0, W, H);
          }
        }

        // Glow: the bright shapes bleed light into the dark around them.
        if (glow > 0) {
          var g = shrunk(native, k.glowShrink);
          if (g) {
            var grow = 1.5;                    // native px
            x.globalCompositeOperation = 'lighter';
            x.globalAlpha = glow * st;
            x.imageSmoothingEnabled = true;
            x.drawImage(g, 0, 0, g.width, g.height, -grow, -grow, W + grow * 2, H + grow * 2);
          }
        }
        x.globalAlpha = 1;
        x.globalCompositeOperation = 'source-over';

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = !!row.smooth;
        ctx.drawImage(post, 0, 0, W, H, rect.x, rect.y, rect.w, rect.h);
      }

      // RF: a slow band of brightness rolling down the tube, and snow.
      var t = (info && info.time) || 0;
      if (k.roll > 0) {
        var band = rect.h * 0.22;
        var y = rect.y - band + ((t * 0.09) % 1) * (rect.h + band * 2);
        var rg = ctx.createLinearGradient(0, y - band, 0, y + band);
        rg.addColorStop(0, 'rgba(255,255,255,0)');
        rg.addColorStop(0.5, 'rgba(255,255,255,1)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k.roll * st;
        ctx.fillStyle = rg;
        ctx.fillRect(rect.x, y - band, rect.w, band * 2);
      }
      if (k.snow > 0) {
        var tile = noiseTile();
        if (tile) {
          var p = ctx.createPattern(tile, 'repeat');
          var f = Math.floor(t * 30);
          var ox = (f * 37) % 96, oy = (f * 61) % 96;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = k.snow * st;
          ctx.translate(rect.x - ox, rect.y - oy);
          ctx.fillStyle = p;
          ctx.fillRect(ox, oy, rect.w, rect.h);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }

      // The tube itself: scanlines, grain, vignette and corners, one multiply.
      var shade = shadeFor(kind, k, rect.w, rect.h, row.lines || row.h);
      if (shade) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = Math.min(1, st);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(shade, rect.x, rect.y);
      }

      ctx.restore();
    };
  }

  Object.keys(KINDS).forEach(function (kind) { D.registerOverlay(kind, drawKind(kind)); });

  USE.forEach(function (u) {
    var r = D.row(u.era);
    r.overlay = u.overlay;
    r.strength = u.strength;
    r.lines = u.lines;
    if (u.glow != null) r.glow = u.glow;
  });

  D.CRT = { KINDS: KINDS, USE: USE, work: work };

  if (typeof module === 'object' && module.exports) module.exports = D.CRT;
})(typeof globalThis !== 'undefined' ? globalThis : this);
