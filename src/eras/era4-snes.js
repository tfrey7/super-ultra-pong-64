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
 * Arrival flourish: none yet, so the plain ring brings this era in. An era
 * brings its own by adding `flourish: function (ctx, p, origin, fromEra, toEra,
 * info)` to its look -- called every frame of the ring that brings THIS era in,
 * drawn over the ring's edge; the header of src/erachange.js is the contract.
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

  // -------------------------------------------------------------- the panel
  var PANEL = { w: 372, top: 22, h: 106, r: 14 };
  var SCORE = { cell: 14, gap: 12, top: 40, offset: 110 };   // render.js's score layout

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
    var offset = ((state.time || 0) * SCROLL) % (2 * TILE);
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

  /** The score on a glassy panel across the sky, each number in its paddle's ink. */
  function drawPanel(ctx, state, P) {
    var mid = state.width / 2;
    var x = mid - PANEL.w / 2;
    roundRectPath(ctx, x, PANEL.top, PANEL.w, PANEL.h, PANEL.r);
    ctx.fillStyle = 'rgba(14, 16, 52, 0.52)';
    ctx.fill();

    var gloss = ctx.createLinearGradient(0, PANEL.top, 0, PANEL.top + PANEL.h / 2);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    roundRectPath(ctx, x + 3, PANEL.top + 3, PANEL.w - 6, PANEL.h / 2 - 3, PANEL.r - 3);
    ctx.fillStyle = gloss;
    ctx.fill();

    roundRectPath(ctx, x, PANEL.top, PANEL.w, PANEL.h, PANEL.r);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(210, 220, 255, 0.7)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(210, 220, 255, 0.5)';
    ctx.fillRect(mid - 1, PANEL.top + 18, 2, PANEL.h - 36);

    var sides = [['left', -1], ['right', 1]];
    for (var i = 0; i < sides.length; i++) {
      var side = sides[i][0];
      var at = mid + sides[i][1] * SCORE.offset;
      var text = String(state.score[side]);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      P.drawText(ctx, text, at + 3, SCORE.top + 3, SCORE.cell, SCORE.gap);
      ctx.fillStyle = P.paddleInk(state, side);
      P.drawText(ctx, text, at, SCORE.top, SCORE.cell, SCORE.gap);
    }
  }

  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);

    ctx.save();
    ctx.globalAlpha = 1;
    drawSky(ctx, state);
    drawFloor(ctx, state);

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

  R.registerEra({
    era: 4,
    name: '1991 Super Nintendo',
    like: 1,              // paddle colours: the ones the session earned in era 1
    horizon: HORIZON,
    draw: draw
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
