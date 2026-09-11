/*
 * Era 9 -- 2001 Xbox (docs/ERAS.md chapter 10): hard, shiny, metal and green.
 *
 * The first console with programmable pixel shaders, and it showed them off.
 * Everything here is drawn to shout that:
 *
 *   1. bump-mapped diamond plate: a 64 x 64 plate tile built once (each
 *      lozenge embossed dark, light, face) laid over the table in 12 depth
 *      strips, each strip lit in a hard band by how near it is to the moving
 *      light, then a specular pool under the light with a highlight-only tile
 *      clipped to it, so the emboss lights up where the light is;
 *   2. hard dynamic shadows: the light is the ball -- it rides 160 up over the
 *      ball, a little ahead of it -- and casts each paddle's box and the ball
 *      onto the table as flat black shapes at 0.45, lighter than the ball's
 *      true contact shadow (R5);
 *   3. green on black: green rail tops with glow lines, paddles edged in green
 *      glow (the era's only shadowBlur), a faint green horizon;
 *   4. gamertags floating over both paddles;
 *   5. a Halo-style segmented shield bar as the score, which flashes alarm red
 *      when its side concedes and then recharges;
 *   6. sub-heavy FM metal hits (the voice below).
 *
 * It reads the state and never writes it (rule 1.4): the shield bar's memory
 * of when a point landed lives in this file, keyed off state.time. No per-pixel
 * loops: paths, gradients, clips and two tiles built once from paths.
 */
(function (root) {
  'use strict';
  var R = root.PongRender;

  // The bible's measured camera (section 12): nothing moves it.
  var CAMERA = { tilt: 27, height: 1000, fov: 35, screenY: 303 };

  var C = {
    black: '#050605', gunmetal: '#2a2f2b', steel: '#5b635d', steelLight: '#aeb8b0',
    plate: '#3a413c', embossDark: '#141814', embossLight: '#8a948c', specular: '#e8ffe0',
    green: '#7cd320', greenDark: '#1d4d0f', glow: '#b6ff3a', shield: '#9dff3a',
    alarm: '#ff3b2f', tagPlate: '#1a1f1b', tagText: '#d7f5c0', ball: '#ffffff'
  };

  var PADDLE_Z = 24;                     // R6: 28 or less
  var STRIPS = 12;
  // The bible puts the light 520 up. Measured in the first screenshot, that
  // casts a paddle's top only ~15 units past its footprint and the ball ~4:
  // invisible. At 160 a paddle's shadow reaches ~57 units and the ball's ~15,
  // so the hard shadows read at a glance, still at 0.45 over true footprints (R5).
  // The light is the ball (item 1194): it rides 160 up over the ball's centre,
  // led a little ahead along the ball's travel (0.1 s of its velocity, at most
  // 44 units), and the lead eases round over about 0.08 s when the ball turns.
  var LIGHT = { z: 160, leadS: 0.1, leadMax: 44, ease: 0.08 };
  var SHADOW_ALPHA = 0.45;               // R5: lighter than the 0.55 contact shadow
  // The ball's cast shadow is drawn this many times the ball's radius: at true
  // size a light this close lays it almost exactly under the ball and its
  // contact shadow, where item 1149's still could not show it.
  var BALL_SHADOW = 1.9;
  var POOL = { radius: 160, alpha: 0.35, tileAlpha: 0.6 };
  var TAGS = { left: 'PONG SLAYER', right: 'CPU 2001' };
  var TAG = { w: 104, h: 22, z: 60, cell: 2, gap: 2, alpha: 0.85 };
  var SHIELD = { segments: 10, w: 16, h: 12, gap: 3, skew: -0.3, top: 30, margin: 44,
                 cell: 5, digitGap: 4, alarm: 0.3, recharge: 0.5 };

  // ------------------------------------------------------------ pure pieces
  /** How far ahead of the ball the light is led: 0.1 s of its velocity, at most 44 units. */
  function leadFor(ball) {
    var vx = (ball.vx || 0) * LIGHT.leadS, vy = (ball.vy || 0) * LIGHT.leadS;
    var len = Math.sqrt(vx * vx + vy * vy);
    if (len > LIGHT.leadMax) { vx *= LIGHT.leadMax / len; vy *= LIGHT.leadMax / len; }
    return { x: vx, y: vy };
  }

  /** The light for a ball, with no easing: over its centre plus the lead, 160 up. */
  function lightFor(ball, lead) {
    lead = lead || leadFor(ball);
    return { x: ball.x + ball.size / 2 + lead.x, y: ball.y + ball.size / 2 + lead.y, z: LIGHT.z };
  }

  // The lead's own memory, so it swings round rather than jumping when the ball
  // turns. Keyed off state.time; a jump back or a gap over half a second snaps
  // it (a new game, a test, a replayed frame). The ball is followed exactly.
  var leadMemo = { time: -Infinity, x: 0, y: 0 };

  /** The light the frame is lit by: over the ball, the lead eased toward where it is heading. */
  function lightOf(state) {
    var want = leadFor(state.ball), dt = state.time - leadMemo.time;
    if (!(dt >= 0 && dt <= 0.5)) {
      leadMemo.x = want.x; leadMemo.y = want.y;
    } else if (dt > 0) {
      var k = 1 - Math.exp(-dt / LIGHT.ease);
      leadMemo.x += (want.x - leadMemo.x) * k;
      leadMemo.y += (want.y - leadMemo.y) * k;
    }
    leadMemo.time = state.time;
    return lightFor(state.ball, { x: leadMemo.x, y: leadMemo.y });
  }

  /** Where the point (x, y, z) falls on the table under light L: L + (P - L) * Lz / (Lz - Pz). */
  function castPoint(L, x, y, z) {
    var k = L.z / (L.z - (z || 0));
    return [L.x + (x - L.x) * k, L.y + (y - L.y) * k, 0];
  }

  /** Convex hull of [x, y, ...] points, counter-clockwise (monotone chain). */
  function hull(points) {
    var p = points.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (p.length < 3) return p;
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lower = [], upper = [], i;
    for (i = 0; i < p.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p[i]) <= 0) lower.pop();
      lower.push(p[i]);
    }
    for (i = p.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
      upper.push(p[i]);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  /** A paddle box's hard shadow on the table: the hull of its footprint and its cast top corners. */
  function paddleShadow(L, rect) {
    var x0 = rect.x, x1 = rect.x + rect.w, y0 = rect.y, y1 = rect.y + rect.h;
    return hull([
      [x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0],
      castPoint(L, x0, y0, PADDLE_Z), castPoint(L, x1, y0, PADDLE_Z),
      castPoint(L, x1, y1, PADDLE_Z), castPoint(L, x0, y1, PADDLE_Z)
    ]).map(function (q) { return [q[0], q[1], 0]; });
  }

  // ----------------------------------------------------- the shield's memory
  // When each side last conceded, in state.time. Reset whenever time runs
  // backwards or a score drops (a new game, a test, a replayed frame).
  var memory = { time: -Infinity, left: null, right: null, hitAt: { left: -Infinity, right: -Infinity } };

  function remember(state) {
    var s = state.score;
    if (memory.left === null || state.time < memory.time || s.left < memory.left || s.right < memory.right) {
      memory.hitAt.left = memory.hitAt.right = -Infinity;
    } else {
      if (s.right > memory.right) memory.hitAt.left = state.time;   // the left side conceded
      if (s.left > memory.left) memory.hitAt.right = state.time;
    }
    memory.time = state.time;
    memory.left = s.left;
    memory.right = s.right;
  }

  /** What one side's bar shows now: { mode: 'steady'|'alarm'|'recharge', filled, shown, front, blink }. */
  function shieldView(state, side) {
    var filled = state.score[side] % SHIELD.segments;
    var age = state.time - memory.hitAt[side];
    if (age >= 0 && age < SHIELD.alarm) {
      return { mode: 'alarm', filled: filled, shown: 0, front: -1, blink: Math.floor(age * 20) % 2 === 0 };
    }
    if (age >= SHIELD.alarm && age < SHIELD.alarm + SHIELD.recharge) {
      var front = Math.floor((age - SHIELD.alarm) / SHIELD.recharge * SHIELD.segments);
      return { mode: 'recharge', filled: filled, shown: Math.min(filled, front), front: front, blink: false };
    }
    return { mode: 'steady', filled: filled, shown: filled, front: -1, blink: false };
  }

  // ------------------------------------------------------------ the arrival
  // The change into era 9 (docs/ERAS.md chapter 10, *Arrival flourish*), drawn
  // over the engine's ring, which stays the truth of which era draws where:
  //   1. ignition: a green orb swells at the spot the ball went out;
  //   2. the edge: the ring itself is a glowing green energy sphere, its rim a
  //      hard metal band with a sheen turning on it, tendrils of light reaching
  //      from the orb to the rim;
  //   3. arrival: a green pulse as it settles.
  // Behind the sphere the table answers, read off the same engine moment: the
  // light sits in the orb while the sphere spreads, so the metal sheen and the
  // hard shadows radiate out from it, then it snaps out to the ball in the last
  // beat; the gamertags fade in over the paddles. The boot thrum is the voice's
  // `boot` list below, played by the player -- the flourish never sounds a note.
  var ARRIVAL = { orb: 90, ignite: 0.38, reach: 56, shell: 48, band: 8, tendrils: 10,
                  edgeFrom: 0.25, edgeOut: 0.72, snap: 0.8, pulse: 0.12, glow: 0.5,
                  tagFrom: 0.45, tagTo: 0.8 };

  function clamp01(v) { return v > 0 ? (v < 1 ? v : 1) : 0; }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + (+a).toFixed(3) + ')';
  }

  /** The change into THIS era on screen now, or null: the engine's own moment (src/erachange.js). */
  function arrivalOf(state) {
    var m = typeof R.eraChangeMoment === 'function' ? R.eraChangeMoment(state) : null;
    return m && m.wiping && m.era === 9 ? m : null;
  }

  /** The light: in the orb while the sphere spreads, snapping out to the ball over the last beat. */
  function arrivalLight(state, m) {
    var L = lightOf(state);
    if (!m) return L;
    var k = clamp01((m.p - ARRIVAL.snap) / (1 - ARRIVAL.snap));
    k = 1 - Math.pow(1 - k, 3);                        // a snap, not a drift
    return { x: m.origin.x + (L.x - m.origin.x) * k, y: m.origin.y + (L.y - m.origin.y) * k, z: L.z };
  }

  /** How much of the gamertags shows: none as the sphere sets off, all of them by the last beat. */
  function tagFade(m) {
    return m ? clamp01((m.p - ARRIVAL.tagFrom) / (ARRIVAL.tagTo - ARRIVAL.tagFrom)) : 1;
  }

  /**
   * The orb's radius t seconds after the point: it swells to 90 over the
   * ignition, keyed off the time because the ring is under a unit wide at
   * first, throbs with the thrum, and never reaches more than 56 past the ring.
   */
  function orbRadius(t, radius) {
    var k = 1 - Math.pow(1 - clamp01(t / ARRIVAL.ignite), 3);
    var r = ARRIVAL.orb * k + 4 * k * Math.sin(2 * Math.PI * 6 * t);
    return Math.max(0, Math.min(r, radius + ARRIVAL.reach));
  }

  /** One tendril: 10 points on a curve from the orb out to the ring's edge, bent by a sway. */
  function tendril(ox, oy, from, to, a, t, i) {
    var sway = 0.35 * Math.sin(t * 7 + i * 1.7), mid = (from + to) / 2;
    var x0 = ox + Math.cos(a) * from, y0 = oy + Math.sin(a) * from;
    var cx = ox + Math.cos(a + sway) * mid, cy = oy + Math.sin(a + sway) * mid;
    var x1 = ox + Math.cos(a) * to, y1 = oy + Math.sin(a) * to;
    var out = [];
    for (var k = 0; k < 10; k++) {
      var u = k / 9, v = 1 - u;
      out.push([v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1]);
    }
    return out;
  }

  var TAPER = [6, 3, 1];                               // each tendril thins from the orb out

  /** The flourish hook (the header of src/erachange.js is the contract): the green sphere arrives. */
  function greenSphere(ctx, p, origin, fromEra, toEra, info) {
    // Only the arrival of THIS era, and never behind the title.
    if (toEra !== 9 || !info || info.dim) return;
    var A = ARRIVAL, R0 = info.radius || 0, t = info.t || 0, TAU = Math.PI * 2;
    var ox = origin.x, oy = origin.y;
    var settle = clamp01((p - A.snap) / (1 - A.snap));
    var orb = orbRadius(t, R0);

    ctx.globalCompositeOperation = 'lighter';
    // 2. The sphere: a faint green body brightening into a glowing shell at the ring.
    if (R0 > 2) {
      var outer = R0 + 10, inner = Math.max(0, R0 - A.shell);
      var body = ctx.createRadialGradient(ox, oy, 0, ox, oy, outer);
      body.addColorStop(0, rgba(C.green, 0));
      body.addColorStop(inner / outer, rgba(C.green, 0.1 * (1 - settle)));
      body.addColorStop(R0 / outer, rgba(C.glow, A.glow * (1 - 0.6 * settle)));
      body.addColorStop(1, rgba(C.glow, 0));
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(ox, oy, outer, 0, TAU);
      ctx.fill();
    }

    // 2. Tendrils of light from the orb to the rim, while the edge crosses the field.
    var edge = clamp01((p - A.edgeFrom) / 0.08) * (1 - clamp01((p - A.edgeOut) / 0.13));
    if (edge > 0 && R0 > orb + 8) {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = C.green;
      ctx.strokeStyle = rgba(C.green, 0.9 * edge);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (var i = 0; i < A.tendrils; i++) {
        var pts = tendril(ox, oy, orb * 0.8, R0, i * TAU / A.tendrils + t * 0.6, t, i);
        for (var b = 0; b < TAPER.length; b++) {
          ctx.lineWidth = TAPER[b];
          ctx.beginPath();
          ctx.moveTo(pts[b * 3][0], pts[b * 3][1]);
          for (var j = b * 3 + 1; j <= b * 3 + 3; j++) ctx.lineTo(pts[j][0], pts[j][1]);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 1. The orb at the miss, fading as the frame settles.
    if (orb > 0.5) {
      var fade = 1 - settle;
      var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb);
      g.addColorStop(0, rgba('#e8ffb0', 0.5 * fade));
      g.addColorStop(0.35, rgba(C.green, 0.45 * fade));
      g.addColorStop(0.75, rgba(C.greenDark, 0.4 * fade));
      g.addColorStop(1, rgba(C.greenDark, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox, oy, orb, 0, TAU);
      ctx.fill();
    }

    // 2. The rim: a hard metal band with a sheen turning on it, a green-glow line inside.
    if (R0 > 4) {
      ctx.globalCompositeOperation = 'source-over';
      var dx = Math.cos(t * 2) * R0, dy = Math.sin(t * 2) * R0;
      var steel = ctx.createLinearGradient(ox - dx, oy - dy, ox + dx, oy + dy);
      steel.addColorStop(0, C.steel);
      steel.addColorStop(0.5, C.steelLight);
      steel.addColorStop(1, C.steel);
      ctx.strokeStyle = steel;
      ctx.lineWidth = A.band;
      ctx.beginPath();
      ctx.arc(ox, oy, R0, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = C.glow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ox, oy, Math.max(0, R0 - A.band / 2 - 2), 0, TAU);
      ctx.stroke();
      // The sphere's own highlight, high on its left.
      ctx.strokeStyle = rgba(C.specular, 0.35);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ox, oy, R0 * 0.9, Math.PI * 1.1, Math.PI * 1.4);
      ctx.stroke();
    }

    // 3. Arrival: a green full-frame pulse, well under the 0.35 a wash may reach.
    if (settle > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba(C.green, A.pulse * Math.abs(Math.sin(p * 6 * Math.PI)));
      ctx.fillRect(0, 0, info.width || 800, info.height || 600);
    }
  }

  // ------------------------------------------------------------------ tiles
  // Built once, from paths, onto the table's own offscreen canvases. Null
  // under node --test, where the table falls back to flat gunmetal strips.
  var tiles = null;

  function lozenge(c, x, y, dir) {
    var len = 11, wid = 3.2, ux = Math.SQRT1_2, uy = dir * Math.SQRT1_2;
    c.beginPath();
    c.moveTo(x + ux * len, y + uy * len);
    c.lineTo(x - uy * wid, y + ux * wid);
    c.lineTo(x - ux * len, y - uy * len);
    c.lineTo(x + uy * wid, y - ux * wid);
    c.closePath();
  }

  /** The 8 lozenges of the tile, alternating direction, with their wrap-round copies. */
  function eachLozenge(fn) {
    for (var r = 0; r < 4; r++) {
      for (var col = 0; col < 2; col++) {
        var x = 16 + 32 * col + (r % 2) * 16, y = 8 + 16 * r, dir = (r + col) % 2 ? 1 : -1;
        for (var dx = -64; dx <= 64; dx += 64) {
          for (var dy = -64; dy <= 64; dy += 64) fn(x + dx, y + dy, dir);
        }
      }
    }
  }

  function tilesFor(T, ctx) {
    if (tiles) return tiles;
    var plate = T.offscreen('xbox-plate', 64, 64);
    var hi = T.offscreen('xbox-plate-hi', 64, 64);
    if (!plate || !hi || typeof ctx.createPattern !== 'function') return null;
    var c = plate.ctx;
    c.fillStyle = C.gunmetal;
    c.fillRect(0, 0, 64, 64);
    eachLozenge(function (x, y, dir) {
      c.fillStyle = C.embossDark; lozenge(c, x + 1, y + 1, dir); c.fill();
      c.fillStyle = C.embossLight; lozenge(c, x - 1, y - 1, dir); c.fill();
      c.fillStyle = C.plate; lozenge(c, x, y, dir); c.fill();
    });
    // The highlight-only tile: just the lit rims, the face cut back out.
    var h = hi.ctx;
    h.clearRect(0, 0, 64, 64);
    eachLozenge(function (x, y, dir) {
      h.globalCompositeOperation = 'source-over';
      h.fillStyle = C.embossLight; lozenge(h, x - 1, y - 1, dir); h.fill();
      h.globalCompositeOperation = 'destination-out';
      h.fillStyle = '#000000'; lozenge(h, x, y, dir); h.fill();
    });
    h.globalCompositeOperation = 'source-over';
    tiles = {
      plate: ctx.createPattern(plate.canvas, 'repeat'),
      hi: ctx.createPattern(hi.canvas, 'repeat')
    };
    return tiles;
  }

  // ---------------------------------------------------------------- drawing
  var cached = { spec: null, cam: null };
  function cameraFor(T, spec) {
    if (cached.spec !== spec) {
      cached.spec = spec;
      cached.cam = T.camera(spec);
    }
    return cached.cam;
  }

  function trace(ctx, pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i].x, pts[i].y);
      else ctx.moveTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
  }

  /**
   * Run paint once per depth strip, clipped to the strip, with the context
   * transformed so field units address a pattern at that strip's scale.
   */
  function eachStrip(ctx, cam, T, paint) {
    for (var i = 0; i < STRIPS; i++) {
      var y0 = 600 * i / STRIPS, y1 = 600 * (i + 1) / STRIPS, ym = (y0 + y1) / 2;
      var top = T.project(cam, 400, y0, 0), bottom = T.project(cam, 400, y1, 0), mid = T.project(cam, 400, ym, 0);
      var kx = mid.scale, ky = (bottom.y - top.y) / (y1 - y0);
      ctx.save();
      // A hair of overlap so no seam of void shows between strips.
      T.path(ctx, cam, [[0, Math.max(0, y0 - 0.6), 0], [800, Math.max(0, y0 - 0.6), 0], [800, y1, 0], [0, y1, 0]]);
      ctx.clip();
      ctx.transform(kx, 0, 0, ky, mid.x - 400 * kx, mid.y - ym * ky);
      paint(i, y0, y1, ym);
      ctx.restore();
    }
  }

  /** The metal: plate tile per strip, then a hard lighting band by distance to the light's y. */
  function drawMetal(ctx, cam, T, L, tile) {
    eachStrip(ctx, cam, T, function (i, y0, y1, ym) {
      ctx.fillStyle = tile ? tile.plate : C.gunmetal;
      ctx.fillRect(-400, y0 - 4, 1600, y1 - y0 + 8);
      var d = Math.abs(ym - L.y) / 600;
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(0.62, 0.06 + 0.9 * d).toFixed(3) + ')';
      ctx.fillRect(-400, y0 - 4, 1600, y1 - y0 + 8);
    });
  }

  // The pixellab tiles (item 1187), laid over the era's own fills through the
  // shared table: the generated tread plate pressed into the bump-mapped
  // metal under the light, steel tread on the paddles' steel, rivets on the
  // rails. Overlay keeps the moving light's falloff underneath in charge.
  var TEXTURE = {
    court: { name: 'court-metal', alpha: 0.5, blend: 'overlay', period: 64, strip: 2, fade: 0.3, smooth: true },
    trim: { name: 'trim', alpha: 0.3, blend: 'overlay', period: 26, smooth: true },
    paddle: { name: 'court-metal', alpha: 0.4, blend: 'overlay', period: 16, smooth: true },
    ball: { name: 'ball', alpha: 0.25, blend: 'soft-light', period: 12, smooth: true }
  };

  function tableStyle(ctx, cam, T, L, tile) {
    return {
      texture: TEXTURE.court,
      trim: TEXTURE.trim,
      surface: function () { drawMetal(ctx, cam, T, L, tile); },
      line: C.steel,
      rail: function (c, cm, pts) {
        trace(c, pts);
        var g = c.createLinearGradient(0, pts[2].y, 0, pts[0].y);
        g.addColorStop(0, C.steelLight);
        g.addColorStop(1, C.gunmetal);
        c.fillStyle = g;
        c.fill();
      },
      railTop: function (c, cm, pts) {
        trace(c, pts);
        c.fillStyle = C.green;
        c.fill();
        glowLine(c, pts[3], pts[2]);
      },
      nearLip: function (c, cm, pts) {
        trace(c, pts);
        c.fillStyle = C.green;
        c.fill();
        glowLine(c, pts[0], pts[1]);
      }
    };
  }

  function glowLine(ctx, a, b) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = C.glow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawBackdrop(ctx, cam, T, state) {
    ctx.fillStyle = C.black;
    ctx.fillRect(0, 0, state.width, state.height);
    var farY = T.project(cam, 400, -18, 22).y;
    var g = ctx.createLinearGradient(0, 0, 0, farY);
    g.addColorStop(0, T.rgba(C.black, 0));
    g.addColorStop(1, T.rgba(C.greenDark, 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.width, farY);
    ctx.fillStyle = T.rgba(C.green, 0.4);
    ctx.fillRect(0, Math.round(farY - 14), state.width, 1);
  }

  /** Step 3: the specular pool under the light, and the lit emboss inside it. */
  function drawSpecular(ctx, cam, T, L, tile) {
    var pl = T.project(cam, L.x, L.y, 0);
    var ratio = (T.project(cam, L.x, L.y + 1, 0).y - pl.y) / pl.scale;
    var pr = POOL.radius * pl.scale;
    ctx.save();
    T.path(ctx, cam, [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0]]);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(pl.x, pl.y);
    ctx.scale(1, ratio);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
    g.addColorStop(0, T.rgba(C.specular, POOL.alpha));
    g.addColorStop(0.45, T.rgba(C.specular, POOL.alpha * 0.45));
    g.addColorStop(1, T.rgba(C.specular, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (tile) {
      ctx.beginPath();
      ctx.ellipse(pl.x, pl.y, pr, pr * ratio, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = POOL.tileAlpha;
      eachStrip(ctx, cam, T, function (i, y0, y1) {
        ctx.fillStyle = tile.hi;
        ctx.fillRect(-400, y0 - 4, 1600, y1 - y0 + 8);
      });
    }
    ctx.restore();
  }

  /** Step 3: the moving light's hard shadows: both paddles, then the ball's. */
  function drawCastShadows(ctx, cam, T, L, state) {
    ctx.save();
    // Shadows fall on the metal only: a paddle near a side wall would otherwise
    // cast out over the void beside the table.
    T.path(ctx, cam, [[0, 0, 0], [800, 0, 0], [800, 600, 0], [0, 600, 0]]);
    ctx.clip();
    var sides = ['left', 'right'];
    for (var i = 0; i < sides.length; i++) {
      T.quad(ctx, cam, paddleShadow(L, state[sides[i]]), { fill: '#000000', alpha: SHADOW_ALPHA });
    }
    if (state.serveDelay <= 0) {
      var b = state.ball, r = b.size * 0.6;
      var at = castPoint(L, b.x + b.size / 2, b.y + b.size / 2, r);
      var p = T.project(cam, at[0], at[1], 0);
      ctx.translate(p.x, p.y);
      ctx.scale(1, Math.max(0.05, cam.cos));
      ctx.globalAlpha = SHADOW_ALPHA;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, BALL_SHADOW * r * p.scale), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function screenSpan(pts) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < pts.length; i++) { lo = Math.min(lo, pts[i].y); hi = Math.max(hi, pts[i].y); }
    return { top: lo, bottom: hi > lo ? hi : lo + 1 };
  }

  /** Step 4: a steel box with the earned ink on its near face, a specular stripe and a green glow edge. */
  function drawPaddle(ctx, cam, T, L, rect, ink) {
    var out = T.box(ctx, cam, rect, 0, PADDLE_Z, {
      shade: 'gradient',
      texture: TEXTURE.paddle,
      fill: function (face, pts) {
        if (face === 'near') return ink;                    // R4: full saturation
        var span = screenSpan(pts);
        var g = ctx.createLinearGradient(0, span.top, 0, span.bottom);
        g.addColorStop(0, face === 'top' ? C.steelLight : C.steel);
        g.addColorStop(1, face === 'top' ? C.steel : C.gunmetal);
        return g;
      }
    });
    // The stripe slides along the paddle after the light's y.
    var fy = Math.max(rect.y + 3, Math.min(rect.y + rect.h - 3, L.y));
    var a = T.project(cam, rect.x + 1, fy, PADDLE_Z), b = T.project(cam, rect.x + rect.w - 1, fy, PADDLE_Z);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = C.specular;
    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    // The outer edge: the silhouette's hull, stroked in green glow.
    var pts = out.top.concat(out.near, out.side || []);
    var edge = hull(pts.map(function (q) { return [q.x, q.y]; }));
    ctx.save();
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 8;
    ctx.shadowColor = C.green;
    trace(ctx, edge.map(function (q) { return { x: q[0], y: q[1] }; }));
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /** Step 5: a nameplate floating over a paddle, world-space, under the ball. */
  function drawGamertag(ctx, cam, T, P, state, side, fade) {
    if (fade === undefined) fade = 1;
    if (!(fade > 0)) return;                          // not yet faded in on the arrival
    var rect = state[side];
    var p = T.project(cam, rect.x + rect.w / 2, rect.y + rect.h / 2, TAG.z);
    var x = Math.round(Math.max(4, Math.min(state.width - TAG.w - 4, p.x - TAG.w / 2))) + 0.5;
    var y = Math.round(p.y - TAG.h / 2) + 0.5;
    ctx.save();
    roundRect(ctx, x, y, TAG.w, TAG.h, 5);
    ctx.globalAlpha = TAG.alpha * fade;
    ctx.fillStyle = C.tagPlate;
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = C.tagText;
    P.drawText(ctx, TAGS[side], x + TAG.w / 2, y + (TAG.h - 5 * TAG.cell) / 2, TAG.cell, TAG.gap);
    ctx.restore();
  }

  /** Step 8: one Halo-style shield bar and its total, in the HUD band (R8). */
  function drawShield(ctx, T, P, state, side) {
    var view = shieldView(state, side);
    var S = SHIELD;
    var total = S.segments * (S.w + S.gap) - S.gap;
    var x0 = side === 'left' ? S.margin : state.width - S.margin - total;
    ctx.save();
    ctx.translate(0, S.top + S.h / 2);
    ctx.transform(1, 0, S.skew, 1, 0, 0);
    for (var i = 0; i < S.segments; i++) {
      var sx = x0 + i * (S.w + S.gap), sy = -S.h / 2;
      if (view.mode === 'alarm') {
        ctx.fillStyle = view.blink ? C.alarm : T.rgba(C.alarm, 0.3);
        ctx.fillRect(sx, sy, S.w, S.h);
      } else if (i < view.shown) {
        ctx.fillStyle = C.shield;
        ctx.fillRect(sx, sy, S.w, S.h);
        ctx.fillStyle = T.shade(C.shield, 0.45);
        ctx.fillRect(sx, sy, S.w, S.h / 2);
      } else {
        ctx.fillStyle = T.rgba(C.greenDark, 0.7);
        ctx.fillRect(sx, sy, S.w, S.h);
        if (i === view.front) {
          ctx.fillStyle = T.rgba(C.glow, 0.8);
          ctx.fillRect(sx, sy, S.w, S.h);
        }
      }
      ctx.strokeStyle = view.mode === 'alarm' ? C.alarm : C.green;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, S.w - 1, S.h - 1);
    }
    ctx.restore();
    // A thin glowing bracket under the bar.
    ctx.fillStyle = T.rgba(view.mode === 'alarm' ? C.alarm : C.green, 0.6);
    ctx.fillRect(x0 - 8, S.top + S.h + 5, total + 10, 1);
    var numX = side === 'left' ? x0 + total + 34 : x0 - 40;
    ctx.fillStyle = view.mode === 'alarm' ? C.alarm : C.shield;
    P.drawText(ctx, String(state.score[side]), numX, S.top + S.h / 2 - 2.5 * S.cell, S.cell, S.digitGap);
  }

  function draw(ctx, state, opts, api) {
    var P = api || R;
    if (opts && opts.ink) return P.drawBase(ctx, state, opts);   // rule 1.6
    var T = P.table3d;
    if (!T) return P.drawBase(ctx, state, opts);
    var cam = cameraFor(T, P.eraLook(state.era).camera || CAMERA);
    var arrival = arrivalOf(state);                    // null except while the green sphere spreads
    var L = arrivalLight(state, arrival);
    var tile = tilesFor(T, ctx);
    remember(state);

    ctx.save();
    ctx.globalAlpha = 1;

    // 1. backdrop, 2. the metal table
    drawBackdrop(ctx, cam, T, state);
    T.table(ctx, cam, tableStyle(ctx, cam, T, L, tile));

    // 3. on the table: the specular pool, then the hard shadows over it
    drawSpecular(ctx, cam, T, L, tile);
    drawCastShadows(ctx, cam, T, L, state);

    // 4. paddles, the far one (smaller rect.y + rect.h) first
    var sides = ['left', 'right'];
    if (state.right.y + state.right.h < state.left.y + state.left.h) sides.reverse();
    for (var i = 0; i < sides.length; i++) {
      drawPaddle(ctx, cam, T, L, state[sides[i]], P.paddleInk(state, sides[i]));
    }

    // 5. behind the ball: its green halo, and the gamertags
    var live = state.serveDelay <= 0;
    if (live) {
      var bs = T.ballScreen(cam, state);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var halo = ctx.createRadialGradient(bs.x, bs.y, 0, bs.x, bs.y, bs.r * 2.6);
      halo.addColorStop(0, T.rgba(C.glow, 0.3));
      halo.addColorStop(1, T.rgba(C.glow, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(bs.x, bs.y, bs.r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    var tags = tagFade(arrival);
    for (var s = 0; s < sides.length; s++) drawGamertag(ctx, cam, T, P, state, sides[s], tags);

    // 7. the ball, last of everything on the table; hidden in the serve pause
    if (live) T.ball(ctx, cam, state.ball, { fill: C.ball, texture: TEXTURE.ball });

    // 8. the HUD band: the shield bars
    drawShield(ctx, T, P, state, 'left');
    drawShield(ctx, T, P, state, 'right');
    ctx.restore();
  }

  R.registerEra({
    era: 9,
    name: '2001 Xbox',
    like: 1,              // paddle colours: the ones the session earned on its first point
    camera: CAMERA,
    card: { flash: '#b6ff3a', wipe: ['#050605', '#7cd320', '#050605'], box: '#050605', border: '#7cd320',
            inner: null, year: '#9dff3a', name: '#d7f5c0', label: '#5b635d', dots: null },
    voice: {
      paddle: [ { wave: 'sine', freq: 180, dur: 0.25, gain: 0.25, fm: { ratio: 1.41, index: 3 } },
                { wave: 'sine', freq: 45, slideTo: 35, dur: 0.20, gain: 0.45 },
                { wave: 'noise', dur: 0.03, gain: 0.15, filter: { type: 'bandpass', freq: 3500, q: 3 } } ],
      wall:   [ { wave: 'sine', freq: 620, dur: 0.12, gain: 0.12, fm: { ratio: 2.76, index: 1.8 } },
                { wave: 'sine', freq: 60, dur: 0.08, gain: 0.25 } ],
      score:  [ { wave: 'sawtooth', freq: 220, slideTo: 110, dur: 0.35, gain: 0.08, filter: { type: 'lowpass', freq: 1200 } },
                { wave: 'square', freq: 880, at: 0.00, dur: 0.06, gain: 0.05 },
                { wave: 'square', freq: 880, at: 0.12, dur: 0.06, gain: 0.05 },
                { wave: 'square', freq: 880, at: 0.24, dur: 0.06, gain: 0.05 },
                { wave: 'sine', freq: 40, dur: 0.6, gain: 0.50 },
                { wave: 'sine', freq: 300, slideTo: 1200, at: 0.5, dur: 0.5, gain: 0.06 } ],
      boot:   [ // the sphere thrum: a pulsing sub, a rising whoosh, a power-up chime
                { wave: 'sine', freq: 45, dur: 2.4, gain: 0.50, lfo: { freq: 6, depth: 0.6 } },
                { wave: 'sawtooth', freq: 90, attack: 0.8, dur: 2.4, gain: 0.08, unison: { voices: 3, spread: 8 }, filter: { type: 'lowpass', freq: 150, to: 900 } },
                { wave: 'noise', attack: 1.2, dur: 1.6, gain: 0.08, filter: { type: 'bandpass', freq: 400, q: 1.5, to: 3000 } },
                { wave: 'sine', freq: 1320, at: 1.8, dur: 0.6, gain: 0.06 },
                { wave: 'sine', freq: 1980, at: 1.8, dur: 0.6, gain: 0.06 } ],
      effects: { shape: 0.3, reverb: { seconds: 1.4, decay: 2, mix: 0.3 } }
    },
    // The pure pieces, for the era's own test.
    xbox: { lightFor: lightFor, lightOf: lightOf, LIGHT: LIGHT, BALL_SHADOW: BALL_SHADOW,
            castPoint: castPoint, paddleShadow: paddleShadow, shieldView: shieldView,
            SHADOW_ALPHA: SHADOW_ALPHA, TAGS: TAGS, PADDLE_Z: PADDLE_Z,
            ARRIVAL: ARRIVAL, orbRadius: orbRadius, arrivalLight: arrivalLight, tagFade: tagFade },
    // The arrival: the green sphere (docs/ERAS.md chapter 10), over the engine's ring.
    flourish: greenSphere,
    draw: draw
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
