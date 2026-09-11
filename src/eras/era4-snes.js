/*
 * Era 4 -- 1991 Super Nintendo, the top of the ladder.
 *
 * The richest machine the session reaches, and it should look it: a dusk sky
 * that runs from night blue to a warm horizon, a mountain line, stars, and
 * below the horizon a Mode 7 floor -- a checkerboard laid out in perspective,
 * rows narrowing and columns converging on the centre, sliding slowly toward
 * you the way F-Zero's track did. The paddles and the ball are shaded sprites
 * floating over that floor, each with a soft shadow beneath it, and the score
 * sits on a translucent panel across the sky.
 *
 * It is a look and nothing more. The sprites are drawn over the same field
 * rectangles the rules collide with -- the floor is scenery behind them, not a
 * projection of the court -- so the mouse, the bounces and every rule play
 * exactly as they do in every other era. It reads the state and never writes
 * it. The floor's centre stripe falls on the court's own centre line because
 * the vanishing point sits on it.
 *
 * Paddle colours are era 1's (`like: 1`): the colours a session earned on its
 * first point carry all the way up the ladder, now shaded.
 *
 * The attract rally behind the title (opts.ink) keeps the stock dimmed frame,
 * so the title stays legible whatever era a state is in.
 *
 * Arrival flourish: THE FIELD TILTS INTO MODE 7 AND BACK. While the ring that
 * brings this era in is growing, the whole field -- exactly the frame the ring
 * engine has just composited, Genesis outside the ring and Super Nintendo
 * inside it, ring edge and all -- tips back into perspective, recedes toward a
 * dusk horizon and turns once around like an F-Zero floor, then sweeps back in
 * from the horizon and settles flat, and the name card spins and zooms in over
 * it. The ring stays the truth of which era draws where: the flourish only
 * moves the picture the engine drew. (`flourish` below; the header of
 * src/erachange.js is the hook's contract.)
 *
 * How it is drawn, cheaply and sharply: the composite is copied once into an
 * offscreen canvas, and the tilted floor is built from horizontal strips of
 * the screen. Each strip is clipped, given the one affine transform that lays
 * the flat picture into it at that depth (turned about the field's centre,
 * scaled by distance), and the copy is drawn through it -- about seventy
 * drawImage calls, no per-pixel work. tiltPose and tiltStrips are pure and
 * tested.
 *
 * The name card: the engine draws its card flat, after the flourish, so while
 * this card is still rotating in the flourish holds the engine's copy back
 * (this look's `card` is swapped for an invisible one) and draws its own --
 * a copy of the engine's real card, cropped once per change -- spinning and
 * zooming into the same rectangle. The frame it lands, the look's `card` is
 * cleared and the engine's identical card takes over. Behind the title (a
 * dimmed rally, no card) the field still tilts but no card is drawn.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // ------------------------------------------------------------------ the sky
  var HORIZON = 150;                 // field y where the sky meets the floor
  var SKY_STOPS = [
    [0.00, '#0b0f3c'],
    [0.45, '#2d2a8a'],
    [0.80, '#a4488e'],
    [1.00, '#f59a5c']
  ];
  // Two mountain ranges, as heights above the horizon at evenly spaced x.
  var FAR_RANGE = [22, 38, 30, 52, 41, 28, 47, 60, 36, 26, 44, 55, 33, 40, 24, 35, 20];
  var NEAR_RANGE = [10, 18, 26, 14, 8, 22, 30, 16, 12, 24, 18, 9, 20, 28, 15, 11, 16];

  // A fixed field of stars, the same every frame (a tiny LCG, not Math.random).
  var STARS = (function () {
    var s = 1991, out = [];
    function next() { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }
    for (var i = 0; i < 42; i++) {
      out.push({ x: Math.floor(next() * 800), y: 6 + Math.floor(next() * (HORIZON - 70)), phase: next() * 6.28 });
    }
    return out;
  })();

  // -------------------------------------------------------- the Mode 7 floor
  // A camera CAM_H units above an endless checkerboard, looking at the horizon.
  // A floor point (x, z) lands at screen x = centre + x * FOCAL / z and
  // y = HORIZON + CAM_H * FOCAL / z, so rows crowd toward the horizon and the
  // columns fan out from the vanishing point on the centre line.
  var CAM_H = 60;
  var FOCAL = 800;
  var K = CAM_H * FOCAL;
  var TILE = 10;                     // one floor tile, in floor units
  var FAR = 470;                     // past this depth the fog takes over
  var SCROLL = 14;                   // floor units per second toward the viewer
  var FLOOR_DARK = '#1b1650';
  var FLOOR_LIGHT = '#2e2a86';
  var STRIPE_INK = 'rgba(170, 230, 255, 0.75)';
  var STRIPE_HALF = 0.6;             // half the centre stripe's width, floor units
  var FOG_DEPTH = 160;               // field units below the horizon the haze reaches

  // ------------------------------------------------------------- the sprites
  var SHADOW_DX = 12;                // the light is high and to the upper left
  var SHADOW_DY = 18;
  var TRAIL = 0.014;                 // seconds between the ball's afterimages

  // ------------------------------------------------------------ generated art
  // The sky, the paddle and the ball are pixel art made with tools/pixellab.mjs
  // (item 1180; prompts, seeds and bills in assets/pixellab/manifest.json),
  // fitted to the Super Nintendo OFFLINE by assets/pixellab/era4-snes-embed.mjs
  // -- 15-bit colour, one-bit sprite transparency -- which also writes the three
  // strings below. The game never loops over pixels: each is one drawImage.
  // Embedded as data: URIs, like era 2's (item 1178): a page opened from
  // file:// counts a file image as another origin and it taints the canvas, so
  // every getImageData read of the frame throws; a data: image leaves it
  // readable. The sky is 256x48 -- the console's 256-pixel line, scaled 3.125x
  // across the 800-wide field, exactly down to the horizon -- the paddle a
  // neutral grey 16x64 capsule dyed each side's ink once, and the ball a 32x32
  // orb drawn at exactly half size. The Mode 7 floor stays hand-drawn: it
  // scrolls in perspective every frame. Headless (no Image), or before an image
  // has decoded, the hand-drawn sky, paddles and ball below are drawn instead.
  // BEGIN pixellab embeds (written by assets/pixellab/era4-snes-embed.mjs)
  var ART = {
    sky: 'data:image/png;base64,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',
    paddle: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAA6CAYAAACJSMgQAAABc0lEQVR42qWWIZaDMBCGkZVIrlCJ3CsgkVhkJDIWiYzEruQItZUr9wp7jOz7w04akv+1s7TvzWshX//MTAZmqir51HXtm6aJVrGPLHxtm4eN4+jry8UX0M/97o2ZggFqr1ff9/1DWf5ljClA2DAMHi4l4A4JcADBgIbBrxzC1rIeFXGRKgokaxFc3RaVYQjCuU8OwiSH67pfx4AFtHbxAosty1oqMpAqwp8cmmdXKjKQKs5k6xi1euuD4ux0igyEO6qtYzCvouZbk6hpHtm2ah+tgKniNM26PFqtj+8l/C3Fpwl/VeG8ejIQalRRfdZ44k6ftfoppPVIo2ZFoc6j+giZf+ojVL/N7L+DOfWmUCuerkdAtB5zRXU9BkWWHlaPT/uM6m2GhbQh8aJY9xb3fbsFw2/ce4B/jTGdAKRny70I4gZU9uZuigngoIgGLmDas8NswcC8uUcwHT7a9iOMBsU8kc88+Iavi7W+67oSYgNSDv0CEov0DR2dRKAAAAAASUVORK5CYII=',
    ball: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABQklEQVR42u1WuxHDIAz1GGk9Qkpaj5AVUnoVSpWZxyN4jZSU5DAWBiwwP7vIWXfvyJ0henoSQl13222ZJt8PGcM1Tj+MxllktNNBY+ylFECA62+4rwUBMfZSYSGgHCC+r221fyMRtbZQQh0W87D8qZiYSwId2QqsENNTr3OhEibqJXIIOOYJKFRC55JZ0fhRgtxZRAks0CICO7mPjFIih4Bz1Y6iDpIAkkASCcc5VjgimYB/YyD9arrRQ75zMhWQnoaNAHcVKCVgFGCVKbieAC/Lf+g25NeAl4KsW1BbhKQKUB49sLxuSPeBxFRQjQhyO6FFwLTTIyLEnuJWbJ5h5+3nmYD6Z1kR0M9wRIlg5KDP1swDrhJWZFjZ5ECyAs+1moz03BcfybZ9rO1MaFRA4NznY/2Oyp0yIQtL2svG8tv+2n7zKxX0rBb/TwAAAABJRU5ErkJggg==',
    balloon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABIAAAAaCAYAAAC6nQw6AAABkUlEQVR42p2VrbKDMBCF+xh9BWQkFhkZia2svBJbWYnERiKRtZWVSF4Bidw7Z2HDAmFKycwZNsvulyV/XC6R5kxK1hjCM6bLt2aThAHeGvo0BbWFpb7zrM+fpXddUONSkrg4xBgOgiS5r9xsl7PtnWFtYCgXI0J9V88QDYLNsPH9+57R65YtYehw0DTq0NyCBLTxTfEBhGrWo4ek9rkPQmUaxtVUjobXfTkf5dLHUFU1+/C+UqDBO5aMNNR5UEja83kFwjKPS12zpK+Xf+ub4xiEOUKne84lw4Y0SHzruAUIywj1bcnC0ookaeGb4iRvAeI9NAXInhr3ld/6VFyTq2OjjwUEWyRJ2qfjNhtStj0HuLnfNg9WAE0+fm8jxwQHUUAhcErSVYZqcNaShHZPP+ZLg9afCxvzsguJwlbzAR9D9q6QGAzLjIqQCMGG72sl65YbQ5m5BpBLk98hciuI5No9/EnrGxMNxwAQtFMgSUYT+9DFv/cnER3+g8RAdZHRI0/DhXYaBAjUecvP06Bffo7/8C0tEvHd0f0AAAAASUVORK5CYII=',
    pylon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAcCAYAAABcSP4GAAAAiklEQVR42mNggAInJ6f/yJgBGVhaOv3f6mUIxmuhGCSGoeD5Oc3/984pgtnYFTw/B8ZgBYaWqArWophgiWkCSAfcfkNLVBPgipAwAzoACUZFRf338vLCocDQEqEA3fiBUDAkHDk8FYDyAXpcwOMDxGiproanQxgGi4EUwRIsSAAZw8RRUjUKhloBAO7x/PEyKA0yAAAAAElFTkSuQmCC'
  };
  // END pixellab embeds
  var BALL_SPRITE = 16;              // on-screen size of the ball sprite, field units
  var art = {};                      // key -> its Image, made once
  var tints = {};                    // ink -> the paddle sprite dyed that ink, made once

  /** A piece's decoded image, or null (headless, not decoded yet, or none). */
  function artImage(key) {
    if (!ART[key] || typeof root.Image !== 'function') return null;
    var img = art[key];
    if (!img) {
      img = art[key] = new root.Image();
      img.src = ART[key];
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  /** One drawImage, smoothing off, so the art stays as blocky as it was made. */
  function blit(ctx, img, x, y, w, h) {
    var smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, w, h);
    ctx.imageSmoothingEnabled = smooth;
  }
  // Start decoding as the page loads, so the art is ready by the first frame.
  artImage('sky');
  artImage('paddle');
  artImage('ball');
  artImage('balloon');
  artImage('pylon');

  // ----------------------------------------- the test ground's set dressing
  // Item 1227 (docs/ART.md, era 4): the F-Zero track under a Pilotwings sky.
  // Two hot-air balloons drift across the sky -- the far one smaller and
  // slower, so the sky, the balloons and the sliding floor are three layers
  // moving at three rates -- and four marker pylons stand on the floor's far
  // edge, blinking. The balloon is one pixellab picture; the second balloon is
  // the same picture turned to another hue, both lit for dusk once, in code.
  var BALLOONS = [
    { x: 170, y: 66, h: 38, speed: 3, swap: false },
    { x: 600, y: 96, h: 26, speed: 2, swap: true }      // low over the mountains, clear of the score
  ];
  var WRAP = 880;                    // drift off the right, back in on the left
  var PYLONS = [120, 300, 500, 680]; // field x, on the floor's far edge
  var PYLON_H = 34;
  var LAMP = '#f8a000';
  var dusk = {};                     // 'plain' | 'swap' -> the balloon lit for dusk, made once
  var lastPointAt = -Infinity;       // the newest point seen scored, by state.time

  /** Whether this is the match's last point (item 1211); false when the rules cannot say. */
  function matchPoint(state) {
    var Pg = root.Pong;
    try { return !!(Pg && typeof Pg.isMatchPoint === 'function' && Pg.isMatchPoint(state)); } catch (e) { return false; }
  }

  /** When the latest point went in: a score event seen, or this era's own arrival (every point is an era change). */
  function pointAt(state) {
    var t = state.time || 0;
    if (lastPointAt > t) lastPointAt = -Infinity;       // a new game on the same page
    var ev = state.events || [];
    for (var i = 0; i < ev.length; i++) {
      if (ev[i] && ev[i].type === 'score' && ev[i].time > lastPointAt) lastPointAt = ev[i].time;
    }
    return Math.max(lastPointAt, typeof state.eraChangedAt === 'number' ? state.eraChangedAt : -Infinity);
  }

  /** The balloon picture, lit for dusk (and for `swap` turned to a cool hue), on a canvas of its own. */
  function duskBalloon(swap) {
    var key = swap ? 'swap' : 'plain';
    var img = artImage('balloon');
    if (!img) return null;
    if (dusk[key]) return dusk[key];
    var doc = root.document;
    if (!doc || typeof doc.createElement !== 'function') return null;
    var c = doc.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    var x = c.getContext('2d');
    if (swap) x.filter = 'hue-rotate(160deg)';
    x.drawImage(img, 0, 0);
    x.filter = 'none';
    // The dusk light over it, so the backdrop stays darker than the ball (ART.md shared rule 1).
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(24, 18, 72, 0.5)';
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    dusk[key] = c;
    return c;
  }

  function drawBalloons(ctx, state, mp) {
    var t = state.time || 0;
    for (var i = 0; i < BALLOONS.length; i++) {
      var b = BALLOONS[i];
      var img = duskBalloon(b.swap);
      var h = b.h, w = img ? h * img.width / img.height : h * 0.7;
      var x = ((b.x + t * b.speed) % WRAP + WRAP) % WRAP - 40;
      var y = b.y + Math.sin(t * 0.7 + i * 2) * 2;
      if (mp) {
        // Match point: streamers flying from the basket.
        ctx.fillStyle = LAMP;
        for (var s = 0; s < 3; s++) {
          ctx.fillRect(x + w * (0.25 + 0.25 * s) + Math.sin(t * 6 + s) * 2, y + h, 2, 10 + 4 * Math.sin(t * 5 + s * 1.7));
        }
      }
      if (img) {
        blit(ctx, img, Math.round(x), Math.round(y), w, h);
      } else {
        ctx.fillStyle = b.swap ? '#3a5a7a' : '#7a4a3a';
        circlePath(ctx, x + w / 2, y + h * 0.38, w * 0.48);
        ctx.fill();
        ctx.fillStyle = '#3a2a1a';
        ctx.fillRect(x + w * 0.38, y + h * 0.85, w * 0.24, h * 0.15);
      }
    }
  }

  /** The four pylons, blinking in turn -- all lit together for half a second after a point. */
  function drawPylons(ctx, state) {
    var t = state.time || 0;
    var img = artImage('pylon');
    var since = t - pointAt(state);
    var allLit = since >= 0 && since < 0.5;
    var w = img ? PYLON_H * img.naturalWidth / img.naturalHeight : 8;
    for (var i = 0; i < PYLONS.length; i++) {
      var x = PYLONS[i] - w / 2, y = HORIZON + 6 - PYLON_H;
      if (img) blit(ctx, img, x, y, w, PYLON_H);
      else {
        ctx.fillStyle = '#2a2a3a';
        ctx.fillRect(x + w * 0.35, y + 4, w * 0.3, PYLON_H - 4);
      }
      var on = allLit || (Math.floor(t / 0.5) + i) % 2 === 0;
      ctx.fillStyle = on ? LAMP : '#3a2400';
      ctx.fillRect(x + 1, y, w - 2, 5);
      if (on) {
        ctx.globalAlpha = 0.3;
        circlePath(ctx, x + w / 2, y + 2.5, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  /**
   * The paddle sprite dyed one ink, on a canvas of its own: the ink laid over
   * the grey image with an overlay blend -- the mid-greys take the ink, the
   * chrome highlights stay bright and the shadow side stays dark, where a
   * multiply would halve the whole paddle -- cut back to the image's own shape. Two drawImage
   * calls and a fillRect, once per ink; null until the image and a canvas exist.
   */
  function tintedPaddle(ink) {
    if (tints[ink]) return tints[ink];
    var img = artImage('paddle');
    var doc = root.document;
    if (!img || !doc || typeof doc.createElement !== 'function') return null;
    var w = img.naturalWidth, h = img.naturalHeight;
    var c = doc.createElement('canvas');
    c.width = w;
    c.height = h;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'overlay';
    x.fillStyle = ink;
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-over';
    tints[ink] = c;
    return c;
  }

  // -------------------------------------------------------------- the panel

  /** Blend a #rrggbb toward white (t > 0) or black (t < 0). */
  function shade(hex, t) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    var n = parseInt(hex.slice(1), 16);
    var end = t > 0 ? 255 : 0;
    var a = Math.abs(t);
    var ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (c) {
      return Math.round(c + (end - c) * a);
    });
    return '#' + ((1 << 24) | (ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).slice(1);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function circlePath(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }

  function rangePath(ctx, heights, width, shift) {
    var step = width / (heights.length - 1);
    ctx.beginPath();
    ctx.moveTo(0, HORIZON);
    for (var i = 0; i < heights.length; i++) {
      ctx.lineTo(i * step + shift, HORIZON - heights[i]);
    }
    ctx.lineTo(width, HORIZON);
    ctx.closePath();
  }

  function drawSky(ctx, state) {
    var img = artImage('sky');
    if (img) {
      blit(ctx, img, 0, 0, state.width, HORIZON);
      // The high stars twinkle over the picture, as they do over the hand-drawn sky.
      var tt = state.time || 0;
      ctx.fillStyle = '#ffffff';
      for (var q = 0; q < STARS.length; q++) {
        if (STARS[q].y > 70) continue;
        ctx.globalAlpha = 0.2 + 0.25 * Math.sin(tt * 1.7 + STARS[q].phase);
        ctx.fillRect(STARS[q].x, STARS[q].y, 2, 2);
      }
      ctx.globalAlpha = 1;
      drawBalloons(ctx, state, matchPoint(state));
      return;
    }
    var sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
    for (var i = 0; i < SKY_STOPS.length; i++) sky.addColorStop(SKY_STOPS[i][0], SKY_STOPS[i][1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, state.width, HORIZON);

    var t = state.time || 0;
    ctx.fillStyle = '#ffffff';
    for (var s = 0; s < STARS.length; s++) {
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 1.7 + STARS[s].phase);
      ctx.fillRect(STARS[s].x, STARS[s].y, 2, 2);
    }
    ctx.globalAlpha = 1;

    rangePath(ctx, FAR_RANGE, state.width, 0);
    ctx.fillStyle = '#3a2470';
    ctx.fill();
    rangePath(ctx, NEAR_RANGE, state.width, 0);
    ctx.fillStyle = '#241650';
    ctx.fill();
    drawBalloons(ctx, state, matchPoint(state));
  }

  /** One trapezoid of floor between depths z0 (near) and z1 (far). */
  function floorQuad(ctx, cx, x0, x1, z0, z1) {
    var y0 = HORIZON + K / z0;
    var y1 = HORIZON + K / z1;
    ctx.moveTo(cx + x0 * FOCAL / z0, y0);
    ctx.lineTo(cx + x1 * FOCAL / z0, y0);
    ctx.lineTo(cx + x1 * FOCAL / z1, y1);
    ctx.lineTo(cx + x0 * FOCAL / z1, y1);
    ctx.closePath();
  }

  function drawFloor(ctx, state) {
    var W = state.width;
    var H = state.height;
    var cx = W / 2;
    ctx.fillStyle = FLOOR_DARK;
    ctx.fillRect(0, HORIZON, W, H - HORIZON);

    // The whole board slides toward the viewer; two tiles on it looks the same.
    // At match point the track runs at twice its rate (item 1227).
    var offset = ((state.time || 0) * SCROLL * (matchPoint(state) ? 2 : 1)) % (2 * TILE);
    var zNear = K / (H - HORIZON + 4);
    var kFirst = Math.floor((zNear + offset) / TILE);
    var kLast = Math.ceil((FAR + offset) / TILE);
    var k, z0, z1;

    // Every light tile in one path, filled once.
    ctx.beginPath();
    for (k = kFirst; k < kLast; k++) {
      z0 = Math.max(k * TILE - offset, zNear);
      z1 = Math.min((k + 1) * TILE - offset, FAR);
      if (z1 <= z0) continue;
      var reach = Math.ceil((cx * z1 / FOCAL) / TILE);
      for (var j = -reach; j < reach; j++) {
        if ((((j + k) % 2) + 2) % 2 === 0) continue;
        floorQuad(ctx, cx, j * TILE, (j + 1) * TILE, z0, z1);
      }
    }
    ctx.fillStyle = FLOOR_LIGHT;
    ctx.fill();

    // The centre stripe, dashed along the floor, on the court's centre line.
    ctx.beginPath();
    for (k = kFirst; k < kLast; k++) {
      z0 = Math.max(k * TILE - offset, zNear);
      z1 = Math.min(k * TILE - offset + TILE * 0.55, FAR);
      if (z1 <= z0) continue;
      floorQuad(ctx, cx, -STRIPE_HALF, STRIPE_HALF, z0, z1);
    }
    ctx.fillStyle = STRIPE_INK;
    ctx.fill();

    // Haze where the floor meets the sky, and the bright horizon itself.
    var fog = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + FOG_DEPTH);
    fog.addColorStop(0, 'rgba(245, 154, 92, 0.95)');
    fog.addColorStop(0.35, 'rgba(164, 72, 142, 0.5)');
    fog.addColorStop(1, 'rgba(27, 22, 80, 0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, HORIZON, W, FOG_DEPTH);
    ctx.fillStyle = 'rgba(255, 220, 170, 0.9)';
    ctx.fillRect(0, HORIZON - 1, W, 2);
  }

  /** A soft elliptical shadow on the floor, darkest in the middle. */
  function drawShadow(ctx, cx, cy, rx, ry, strength) {
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0, 0, 0, ' + strength + ')');
    g.addColorStop(0.6, 'rgba(0, 0, 0, ' + (strength / 2) + ')');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    circlePath(ctx, 0, 0, 1);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  /** A paddle as a shaded capsule with chrome caps, over its exact rectangle. */
  function drawPaddle(ctx, p, ink) {
    var dyed = tintedPaddle(ink);
    if (dyed) {
      blit(ctx, dyed, p.x, p.y, p.w, p.h);
      return;
    }
    var body = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
    body.addColorStop(0, shade(ink, -0.55));
    body.addColorStop(0.3, shade(ink, 0.45));
    body.addColorStop(0.55, ink);
    body.addColorStop(1, shade(ink, -0.4));
    roundRectPath(ctx, p.x, p.y, p.w, p.h, p.w / 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = shade(ink, -0.65);
    ctx.stroke();

    var cap = Math.round(p.h * 0.14);
    var chrome = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
    chrome.addColorStop(0, '#5a6078');
    chrome.addColorStop(0.35, '#f4f6ff');
    chrome.addColorStop(1, '#6c7290');
    ctx.fillStyle = chrome;
    roundRectPath(ctx, p.x + 1, p.y + 1, p.w - 2, cap, (p.w - 2) / 2);
    ctx.fill();
    roundRectPath(ctx, p.x + 1, p.y + p.h - cap - 1, p.w - 2, cap, (p.w - 2) / 2);
    ctx.fill();

    // A glint down the lit side.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fillRect(p.x + p.w * 0.28, p.y + cap + 6, 2, Math.max(0, p.h - 2 * cap - 12));
  }

  /** The ball as a lit orb, with fading afterimages along its flight. */
  function drawBall(ctx, b) {
    var cx = b.x + b.size / 2;
    var cy = b.y + b.size / 2;
    var r = b.size * 0.62;

    if (b.vx || b.vy) {
      ctx.fillStyle = '#ffc060';
      for (var i = 3; i >= 1; i--) {
        ctx.globalAlpha = 0.09 * (4 - i);
        circlePath(ctx, cx - b.vx * TRAIL * i, cy - b.vy * TRAIL * i, r * (1 - 0.12 * i));
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // The colour-math halo (item 1227): 1.6 times the orb, added light, under the core (R1).
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#f8f8d0';
    circlePath(ctx, cx, cy, BALL_SPRITE / 2 * 1.6);
    ctx.fill();
    ctx.restore();

    var img = artImage('ball');
    if (img) {
      var half = BALL_SPRITE / 2;
      blit(ctx, img, Math.round(cx - half), Math.round(cy - half), BALL_SPRITE, BALL_SPRITE);
      return;
    }

    var orb = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    orb.addColorStop(0, '#ffffff');
    orb.addColorStop(0.3, '#fff0a0');
    orb.addColorStop(0.75, '#f08a20');
    orb.addColorStop(1, '#8a3208');
    circlePath(ctx, cx, cy, r);
    ctx.fillStyle = orb;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(60, 20, 0, 0.8)';
    ctx.stroke();
  }

  // The scoreboard as F-Zero's (item 1227): two see-through boxes, 40 x 16
  // Super Nintendo pixels each, a helmet icon beside each, and under each a
  // power bar 32 x 3 that fills 4 of its pixels a paddle hit and flashes full.
  var BOX = { w: 125, h: 43, top: 20, offset: 110, cell: 6, gap: 5, fill: 'rgba(11, 15, 60, 0.5)' };
  var BAR = { w: 100, h: 8, below: 7, perHit: 4 / 32 };
  var HELMET = { left: '#f83800', right: '#3868f8', r: 11 };

  /** A round racing helmet, 8 x 8 Super Nintendo pixels, its visor toward the court. */
  function drawHelmet(ctx, cx, cy, suit, facing) {
    ctx.fillStyle = '#101020';
    circlePath(ctx, cx, cy, HELMET.r + 1.5);
    ctx.fill();
    ctx.fillStyle = suit;
    circlePath(ctx, cx, cy, HELMET.r);
    ctx.fill();
    ctx.fillStyle = '#101828';
    ctx.fillRect(facing > 0 ? cx - 1 : cx - HELMET.r + 1, cy - 3, HELMET.r, 7);
    ctx.fillStyle = '#f8f8d0';
    ctx.fillRect(cx - facing * 5 - 1.5, cy - 7, 3, 3);
  }

  /** Both score boxes, each number in its paddle's ink, with helmets and power bars. */
  function drawPanel(ctx, state, P) {
    var mid = state.width / 2, t = state.time || 0;
    var mp = matchPoint(state);
    var power = Math.min(1, (state.rally || 0) * BAR.perHit);
    var sides = [['left', -1], ['right', 1]];
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i][0], dir = sides[i][1];
      var cx = mid + dir * BOX.offset, x = cx - BOX.w / 2;
      ctx.fillStyle = BOX.fill;
      ctx.fillRect(x, BOX.top, BOX.w, BOX.h);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#f8f8d0';
      ctx.strokeRect(x + 1, BOX.top + 1, BOX.w - 2, BOX.h - 2);

      var text = String(state.score[side]);
      var ty = BOX.top + (BOX.h - 5 * BOX.cell) / 2;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      P.drawText(ctx, text, cx + 2, ty + 2, BOX.cell, BOX.gap);
      ctx.fillStyle = P.paddleInk(state, side);
      P.drawText(ctx, text, cx, ty, BOX.cell, BOX.gap);

      drawHelmet(ctx, cx + dir * (BOX.w / 2 + 18), BOX.top + BOX.h / 2, HELMET[side], -dir);

      var bx = cx - BAR.w / 2, by = BOX.top + BOX.h + BAR.below;
      ctx.fillStyle = BOX.fill;
      ctx.fillRect(bx - 2, by - 2, BAR.w + 4, BAR.h + 4);
      var full = mp || power >= 1;
      ctx.globalAlpha = mp ? 0.55 + 0.45 * Math.abs(Math.sin(t * 6)) : 1;   // match point: both bars pulse
      ctx.fillStyle = full && Math.floor(t * 8) % 2 === 0 ? '#f8f8d0' : LAMP;
      ctx.fillRect(bx, by, BAR.w * (full ? 1 : power), BAR.h);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------- the arrival: Mode 7 and back
  var M7 = {
    focal: 1000,          // the camera's focal length, field units
    phiMax: 1.12,         // how far back the field tips at the most, radians (about 64 degrees)
    recede: 3.1,          // how far it recedes: 1 is where it lies, 3.1 about a third the size
    lift: 80,             // how far the floor's centre sinks down the screen while tipped
    strips: 72,           // horizontal slices of the screen the tilted field is drawn in
    settle: 0.88,         // raw ring progress by which the field lies flat again
    cardFrom: 0.62,       // the card spins in over this stretch of raw progress...
    cardTo: 0.9           // ...and lands, flat and full size, here
  };
  var CARD_GEOMETRY = { height: 170, pad: 36, cell: 7, gap: 5 };   // src/erachange.js's CARD
  var INVISIBLE = 'rgba(0,0,0,0)';
  var HELD_CARD = { box: INVISIBLE, border: null, inner: null, year: INVISIBLE,
                    name: INVISIBLE, label: INVISIBLE, dots: null };

  // The look the engine actually reads -- this file's entry merged over era
  // 1's (`like: 1`) and cached by the renderer -- so a held-back card is held
  // where the card style is looked up. A rebuilt cache starts from the
  // registered look, which never holds a card, so the card can only reappear.
  function liveLook() { return R.eraLook(4); }

  function smooth(a, b, x) {
    if (x <= a) return 0;
    if (x >= b) return 1;
    var t = (x - a) / (b - a);
    return t * t * (3 - 2 * t);
  }

  /**
   * Where the tilt has got to at raw progress u (0..1) of the ring. Pure.
   *   phi    how far back the field is tipped (radians)
   *   k      how far it has receded (1 = where it lies)
   *   theta  how far it has turned, 0 to one whole turn (spin < 0 turns the other way)
   *   lift   how far its centre has sunk down the screen
   *   flat   true when it lies exactly where it started (nothing to draw)
   */
  function tiltPose(u, spin) {
    var tip = smooth(0, 0.3, u) * (1 - smooth(0.6, M7.settle, u));
    var away = smooth(0.08, 0.42, u) * (1 - smooth(0.48, 0.86, u));
    var turn = smooth(0.1, 0.86, u);
    return {
      phi: M7.phiMax * tip,
      k: 1 + (M7.recede - 1) * away,
      theta: (spin < 0 ? -1 : 1) * 2 * Math.PI * turn,
      lift: M7.lift * tip,
      flat: tip === 0 && away === 0 && (turn === 0 || turn === 1)
    };
  }

  /**
   * The tilted field as n horizontal strips of the screen, each with the affine
   * transform [a, b, c, d, e, f] that lays the flat W x H picture into it. Pure.
   *
   * The field is a floor plane tipped back by phi about its centre line and
   * pushed k focal lengths away: a floor point at depth d (up the field is far)
   * lands at screen y = cy - F d cos(phi) / (F k + d sin(phi)). Each strip finds
   * the depth it shows by inverting that, and within it the floor is scaled by
   * F / z across and by dY/dd down, after turning it by theta about the centre.
   */
  function tiltStrips(pose, W, H, n) {
    var F = M7.focal;
    var cx = W / 2, cy = H / 2 + pose.lift;
    var sin = Math.sin(pose.phi), cos = Math.cos(pose.phi);
    var ct = Math.cos(pose.theta), st = Math.sin(pose.theta);
    // How far the turned field reaches up and down its own depth from the centre.
    var reach = Math.abs(st) * W / 2 + Math.abs(ct) * H / 2;
    var near = sin > 1e-6 ? Math.min(reach, (F * pose.k - 0.25 * F) / sin) : reach;
    var depthY = function (d) { return cy - F * d * cos / (F * pose.k + d * sin); };
    var top = Math.max(0, depthY(reach));
    var bottom = Math.min(H, depthY(-near));
    var out = [];
    if (!(bottom > top) || !(n > 0)) return out;
    var h = (bottom - top) / n;
    for (var i = 0; i < n; i++) {
      var y0 = top + i * h;
      var ym = y0 + h / 2;
      var v = cy - ym;
      var den = F * cos - v * sin;
      if (!(den > 1e-6)) continue;
      var d = v * F * pose.k / den;
      var z = F * pose.k + d * sin;
      var s = F / z;
      var dy = -F * F * pose.k * cos / (z * z);
      var a = s * ct, c = s * st, b = dy * st, e = -dy * ct;
      out.push({
        y0: y0, y1: y0 + h, depth: d, scale: s,
        m: [a, b, c, e, cx - a * W / 2 - c * H / 2, (ym - dy * d) - b * W / 2 - e * H / 2]
      });
    }
    return out;
  }

  /** Where the engine draws this era's name card, from its text. Pure. */
  function cardRect(W, H, text, api) {
    var P = api || R;
    var glyphs = Object.assign({}, P.DIGITS, P.LETTERS);
    var textW = 0;
    for (var i = 0; i < text.length; i++) {
      var rows = glyphs[text[i]];
      var cols = rows ? rows[0].length : (text[i] === '·' ? 1 : 2);
      textW += (i ? CARD_GEOMETRY.gap : 0) + cols * CARD_GEOMETRY.cell;
    }
    var w = Math.min(W - 40, textW + CARD_GEOMETRY.pad * 2);
    return { x: W / 2 - w / 2, y: H / 2 - CARD_GEOMETRY.height / 2, w: w, h: CARD_GEOMETRY.height };
  }

  /** The card's spin and zoom at raw progress u: angle 0, scale 1, alpha 1 once landed. Pure. */
  function cardPose(u, spin) {
    var e = (u - M7.cardFrom) / (M7.cardTo - M7.cardFrom);
    if (e <= 0) return { shown: false, landed: false, angle: 0, scale: 0, alpha: 0 };
    if (e >= 1) return { shown: true, landed: true, angle: 0, scale: 1, alpha: 1 };
    var x = e - 1;
    var back = 1 + 2.70158 * x * x * x + 1.70158 * x * x;     // ease out with a little overshoot
    var out = 1 - Math.pow(1 - e, 3);
    return {
      shown: true, landed: false,
      angle: (spin < 0 ? 1 : -1) * 1.5 * Math.PI * (1 - out),
      scale: 0.12 + 0.88 * back,
      alpha: Math.min(1, e * 4)
    };
  }

  // The page's canvases, made once; null under node --test.
  var snap = null, cardFull = null, cardImg = null;
  var cardFor = null, cardAt = null;

  function canvasOf(c, w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    c = c || document.createElement('canvas');
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    return c;
  }

  function drawBackdrop(ctx, W, H, horizon, state) {
    var y = Math.max(24, Math.min(H - 24, horizon));
    var sky = ctx.createLinearGradient(0, 0, 0, y);
    for (var i = 0; i < SKY_STOPS.length; i++) sky.addColorStop(SKY_STOPS[i][0], SKY_STOPS[i][1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, y);
    ctx.fillStyle = '#0d0a2e';
    ctx.fillRect(0, y, W, H - y);
    var t = state.time || 0;
    ctx.fillStyle = '#ffffff';
    for (var s = 0; s < STARS.length; s++) {
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(t * 1.7 + STARS[s].phase);
      ctx.fillRect(STARS[s].x, STARS[s].y * (y - 12) / HORIZON, 2, 2);
    }
    ctx.globalAlpha = 1;
    var glow = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    glow.addColorStop(0, 'rgba(245, 154, 92, 0)');
    glow.addColorStop(0.5, 'rgba(255, 220, 170, 0.85)');
    glow.addColorStop(1, 'rgba(245, 154, 92, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, y - 30, W, 60);
  }

  /** The engine's own card, cropped once per change into a canvas of its own. */
  function croppedCard(state, W, H, era, duration) {
    if (cardFor === state.eraChangedAt && cardImg) return cardImg;
    if (typeof R.drawEraFrame !== 'function') return null;
    var rect = cardRect(W, H, R.eraCardText(era));
    cardFull = canvasOf(cardFull, W, H);
    cardImg = canvasOf(cardImg, Math.ceil(rect.w), rect.h);
    if (!cardFull || !cardImg) return null;
    var fx = cardFull.getContext('2d');
    fx.setTransform(1, 0, 0, 1, 0, 0);
    fx.clearRect(0, 0, W, H);
    // The same moment just after the ring: the plain frame with the engine's card on it.
    var held = liveLook().card;
    liveLook().card = null;
    R.drawEraFrame(fx, Object.assign({}, state, { time: (state.eraChangedAt || 0) + duration + 0.001 }), {});
    liveLook().card = held;
    var cx = cardImg.getContext('2d');
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, cardImg.width, cardImg.height);
    cx.drawImage(cardFull, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    cardFor = state.eraChangedAt;
    cardAt = rect;
    return cardImg;
  }

  /**
   * The arrival flourish (see the header). Drawn over the ring's edge every
   * frame of the ring that brings era 4 in; under node --test there is no
   * canvas to copy, so it leaves the plain ring and the engine's card alone.
   */
  function flourish(ctx, p, origin, fromEra, toEra, info) {
    var W = info.width, H = info.height, state = info.state;
    var canvas = ctx.canvas;
    if (!canvas || typeof ctx.drawImage !== 'function') return;
    snap = canvasOf(snap, canvas.width, canvas.height);
    if (!snap) return;
    var u = info.duration > 0 ? Math.max(0, Math.min(1, info.t / info.duration)) : 1;
    var spin = origin.x < W / 2 ? 1 : -1;

    var pose = tiltPose(u, spin);
    if (!pose.flat) {
      var sx = snap.getContext('2d');
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.clearRect(0, 0, snap.width, snap.height);
      sx.drawImage(canvas, 0, 0);
      var strips = tiltStrips(pose, W, H, M7.strips);
      drawBackdrop(ctx, W, H, strips.length ? strips[0].y0 : H / 2, state);
      for (var i = 0; i < strips.length; i++) {
        var sp = strips[i];
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, sp.y0 - 0.5, W, sp.y1 - sp.y0 + 1);
        ctx.clip();
        // Far strips sink into the dusk; the near ones stay full strength.
        ctx.globalAlpha = Math.max(0.55, Math.min(1, 1.3 - 0.3 * (1 / sp.scale)));
        ctx.transform(sp.m[0], sp.m[1], sp.m[2], sp.m[3], sp.m[4], sp.m[5]);
        ctx.drawImage(snap, 0, 0, snap.width, snap.height, 0, 0, W, H);
        ctx.restore();
      }
    }

    if (info.dim) return;          // the rally behind the title has no card
    var cp = cardPose(u, spin);
    liveLook().card = cp.landed ? null : HELD_CARD;
    if (!cp.shown) return;
    var img = croppedCard(state, W, H, toEra, info.duration);
    if (!img) { liveLook().card = null; return; }
    ctx.save();
    ctx.globalAlpha = cp.alpha;
    ctx.translate(W / 2, H / 2);
    ctx.rotate(cp.angle);
    ctx.scale(cp.scale, cp.scale);
    ctx.drawImage(img, 0, 0, cardAt.w, cardAt.h, cardAt.x - W / 2, cardAt.y - H / 2, cardAt.w, cardAt.h);
    ctx.restore();
  }

  function draw(ctx, state, opts, api) {
    var P = api || R;
    // Past the ring (or a frame that skipped over its end), the engine's card is never held back.
    if (liveLook().card === HELD_CARD && !(state.time - (state.eraChangedAt || 0) < ((R.ERA_CHANGE && R.ERA_CHANGE.wipe) || 1.5))) {
      liveLook().card = null;
    }
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);

    ctx.save();
    ctx.globalAlpha = 1;
    drawSky(ctx, state);
    drawFloor(ctx, state);
    drawPylons(ctx, state);

    var ballShown = state.serveDelay <= 0;
    var l = state.left, rt = state.right, b = state.ball;
    drawShadow(ctx, l.x + l.w / 2 + SHADOW_DX, l.y + l.h / 2 + SHADOW_DY, l.w * 1.1, l.h * 0.58, 0.55);
    drawShadow(ctx, rt.x + rt.w / 2 + SHADOW_DX, rt.y + rt.h / 2 + SHADOW_DY, rt.w * 1.1, rt.h * 0.58, 0.55);
    if (ballShown) {
      drawShadow(ctx, b.x + b.size / 2 + SHADOW_DX * 0.8, b.y + b.size / 2 + SHADOW_DY * 0.8,
                 b.size * 0.95, b.size * 0.55, 0.5);
    }

    drawPaddle(ctx, l, P.paddleInk(state, 'left'));
    drawPaddle(ctx, rt, P.paddleInk(state, 'right'));
    if (ballShown) drawBall(ctx, b);

    drawPanel(ctx, state, P);
    ctx.restore();
  }

  var LOOK = {
    era: 4,
    name: '1991 Super Nintendo',
    like: 1,              // paddle colours: the ones the session earned in era 1
    horizon: HORIZON,
    draw: draw,
    flourish: flourish,
    // The arrival's pure parts, for the tests.
    arrival: {
      M7: M7, tiltPose: tiltPose, tiltStrips: tiltStrips,
      cardRect: cardRect, cardPose: cardPose, heldCard: HELD_CARD
    }
  };
  R.registerEra(LOOK);
})(typeof globalThis !== 'undefined' ? globalThis : this);
