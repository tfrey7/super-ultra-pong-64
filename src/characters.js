/*
 * Super Ultra Pong 64: Remastered -- the players who hold the paddles (item 1223).
 *
 * Tim: "it shouldn't look like a _pong_ game from that era, it should look like
 * a AAA game from that era, that just happens to be pong" -- and, asked how far,
 * "Characters hold the paddles". From era 1 up a figure stands behind each
 * paddle with its hand on it: the player on the left, the computer on the
 * right, mirrored. Era 0 is the 1972 machine and shows nothing but bars and a dot.
 *
 * The rig only READS. The paddle rectangle is still the whole hit zone (item
 * 1208's contact, spin and smash), the computer is still src/opponents.js, and
 * hit-stop and shake are still src/feel.js. What a figure does is decided by
 * what the rules already report and nothing else:
 *
 *   idle   the paddle is still
 *   up     the paddle is moving up        (paddle.vy below -MOVE)
 *   down   the paddle is moving down      (paddle.vy above  MOVE)
 *   swing  a 'paddle' event on that side  (held SWING_S seconds from the contact)
 *   miss   a 'score' event for the OTHER side -- that side lost the point
 *   win    a 'score' event for that side
 *
 * miss and win are held REACT_S seconds. state.events is emptied every step, so
 * the moment a beat began is kept here, per game, keyed on the game's score
 * object -- which the era change's and the display's shallow copies of the
 * state share -- and an event is taken once, by its time, however many times a
 * frame is drawn.
 *
 * Every era has a config block in ERAS below; anything it leaves out is taken
 * from DEFAULTS. An era card that brings art fills in its own block:
 *
 *   sheet    a pixellab name (assets/pixellab/<sheet>.png, through
 *            src/sprites.js), one row per beat in BEATS order, one frame per
 *            column, each frame `frame.w` x `frame.h` pixels; null draws the
 *            placeholder silhouette
 *   sheets   { left, right } (item 1245): two pixellab names, when the two
 *            players are different characters -- the left sheet for the
 *            player, the right for the computer, which is mirrored as always.
 *            A side it leaves out falls back to `sheet`, so a block with only
 *            `sheet` puts the one character on both sides. Both sheets share
 *            the block's frame, frames, hand, anchor and scale.
 *   frame    { w, h } one frame, in sheet pixels
 *   frames   how many frames each beat has; a beat left out (or 0) falls back
 *            to idle, so a sheet with only an idle row still works
 *   hand     the sheet pixel, in a frame facing right, that holds the paddle
 *   anchor   { dx, dy } where that pixel goes, from the middle of the paddle's
 *            OUTER edge, in field units (dx away from the ball, mirrored for
 *            the right-hand player); on the 3D eras also dz, the height off the
 *            table the hand is at
 *   scale    field units per sheet pixel -- on the 3D eras, table units, so
 *            the figure then shrinks and grows with the table's depth
 *   fps      how fast idle/up/down/win cycle their frames
 *   skin, body   the placeholder's colours; its shirt wears the paddle's ink
 *
 * A sheet is cut into its frames once, when it has loaded: each frame is a
 * source rectangle, and a figure is ONE drawImage call a frame. The
 * placeholder is the same shape of sheet, drawn once per era and ink onto an
 * offscreen canvas. Nothing here loops over pixels.
 *
 * It hooks itself in by wrapping PongRender.draw, so everything that draws a
 * frame -- the loop, the era change's ring, the display's offscreen renders,
 * the feel layer -- draws the players too, and each 3D era's display treatment
 * (the CRT, the TV) still lands on top of them. Dimmed frames (the attract
 * rally behind the title) are left alone. ?characters=off takes the rig out.
 *
 * A plain script with a UMD tail: window.PongCharacters in the page,
 * require('../src/characters.js') under node --test.
 */
(function (root) {
  'use strict';

  var BEATS = ['idle', 'up', 'down', 'swing', 'miss', 'win'];
  var MOVE = 60;        // units a second of paddle speed that reads as moving
  var SWING_S = 0.3;    // the swing plays out over this long from the contact
  var REACT_S = 1.2;    // a miss or a win is held this long

  // The placeholder's grid: a figure 12 cells wide and 28 tall, facing right,
  // its hand on the right-hand edge half way down.
  var GRID = { w: 12, h: 28, handX: 12, handY: 14 };

  var DEFAULTS = {
    sheet: null,
    frame: { w: GRID.w, h: GRID.h },
    frames: { idle: 2, up: 2, down: 2, swing: 3, miss: 1, win: 2 },
    hand: { x: GRID.handX, y: GRID.handY },
    anchor: { dx: 0, dy: 0, dz: 18 },
    scale: 2.5,
    fps: 6,
    res: 1,             // placeholder sheet pixels per grid cell
    round: false,       // placeholder head drawn round (the 3D eras)
    skin: '#e0b090',
    body: '#303040'
  };

  // One block per rung. Era 0 has none: the 1972 machine stays bars and a dot.
  var ERAS = {
    1:  { skin: '#d4a060', body: '#2c3c9c', scale: 2.5 },                    // Atari 2600
    2:  { sheets: { left: 'era2-sheet-left', right: 'era2-sheet-right' }, frame: { w: 10, h: 44 }, hand: { x: 10, y: 22 }, scale: 3.125, fps: 7.5, skin: '#fca044', body: '#0000bc' }, // NES (item 1225: assets/pixellab/era2-players-sheet.mjs)
    // Genesis (item 1226): the barbarian and the knight, pixflux sheets re-cut
    // offline to 20 x 25 frames (assets/pixellab/era3-players-cut.mjs), so the
    // scale is 3.2, not the bible's 2.6 for 12 x 52: 80 units tall, one paddle.
    3:  { sheets: { left: 'era3-p1', right: 'era3-p2' }, frame: { w: 20, h: 25 },
          hand: { x: 20, y: 13 }, scale: 3.2, fps: 10,
          skin: '#eeaa88', body: '#222266', res: 1 },
    4:  { skin: '#f8c8a0', body: '#384878', scale: 2.5, res: 2 },            // Super Nintendo
    5:  { skin: '#d8a888', body: '#303848', scale: 3.2, res: 2, round: true }, // PlayStation
    6:  { skin: '#e8b890', body: '#283080', scale: 3.2, res: 3, round: true }, // Nintendo 64
    // Dreamcast (item 1231): two Jet Set Radio-manner skaters, cut from pixflux by
    // assets/pixellab/era7-skater-cut.py; each figure about 68 px tall, so 1.3 table
    // units a pixel stands it about 90 tall, the hand on the paddle box's top (dz 24).
    // A STAND-IN: Tim ruled flat sprites out of the 3D eras (23:47 EDT 2026-09-10);
    // this era's polygon-model card (item 1248's renderer) swaps these sheets out.
    7:  { skin: '#f0c0a0', body: '#1a2a50', scale: 1.3, res: 3, round: true,
          sheets: { left: 'era7-skater-left-sheet', right: 'era7-skater-right-sheet' },
          frame: { w: 44, h: 84 }, hand: { x: 44, y: 66 }, anchor: { dx: 0, dy: 0, dz: 24 }, fps: 10 },
    // PlayStation 2 (item 1232): two operatives, re-cut from pixflux by
    // assets/pixellab/era8-sheets.mjs; 80-pixel figures in a 40 x 84 frame,
    // drawn 90 table units tall, the hand on the paddle box's top (dz 24).
    // fps 3, not the bible's 8: the rig has one rate for idle, move and win,
    // and at 8 a two-frame breath reads as a flicker.
    8:  { skin: '#dcae8c', body: '#20242c', res: 4, round: true,
          sheets: { left: 'era8-sheet-left', right: 'era8-sheet-right' },
          frame: { w: 40, h: 84 }, hand: { x: 32, y: 47 }, scale: 1.125,
          anchor: { dx: 0, dy: 0, dz: 24 }, fps: 3 },
    9:  { skin: '#d6a684', body: '#1c2a1c', scale: 3.2, res: 4, round: true }, // Xbox
    10: { skin: '#e2b294', body: '#2a2e36', scale: 3.2, res: 4, round: true }  // Xbox 360
  };

  var FIRST_3D = 5;

  /** The pixellab name one side of an era block wears: its own of `sheets`, else `sheet`. */
  function sheetOf(own, side) {
    var per = own.sheets && own.sheets[side === 'right' ? 'right' : 'left'];
    return per || own.sheet || null;
  }

  /**
   * An era's whole config for one side ('left', the default, or 'right'), its
   * own block over DEFAULTS, or null (era 0). The sides differ only in `sheet`.
   */
  function configFor(era, side) {
    var own = ERAS[era];
    if (!own) return null;
    var c = Object.assign({}, DEFAULTS, own);
    delete c.sheets;
    c.side = side === 'right' ? 'right' : 'left';
    c.sheet = sheetOf(own, c.side);
    c.frames = Object.assign({}, DEFAULTS.frames, own.frames || {});
    c.anchor = Object.assign({}, DEFAULTS.anchor, own.anchor || {});
    if (!c.sheet) {
      // The placeholder is drawn at res sheet pixels a grid cell.
      c.frame = { w: GRID.w * c.res, h: GRID.h * c.res };
      c.hand = { x: GRID.handX * c.res, y: GRID.handY * c.res };
      c.scale = c.scale / c.res;
    }
    c.era = era;
    c.is3d = era >= FIRST_3D;
    return c;
  }

  // ---------------------------------------------------------- the beats
  /** A fresh memory: nothing seen, both players idle. */
  function freshMemory() {
    return { seen: -Infinity, time: 0, left: { held: null, since: 0 }, right: { held: null, since: 0 } };
  }

  /**
   * The machine's one transition: fold a step's events into the memory.
   * Pure -- answers a new memory and leaves the old one alone. An event is
   * taken only if it is newer than anything already seen, so drawing the same
   * frame twice (the ring, a recorder, the display) cannot start a beat twice.
   */
  function observe(mem, events, time) {
    var next = {
      seen: mem.seen,
      time: time,
      left: { held: mem.left.held, since: mem.left.since },
      right: { held: mem.right.held, since: mem.right.since }
    };
    // The clock went backwards: a new game in the same object. Start clean.
    if (time < mem.time) next = Object.assign(freshMemory(), { time: time });
    var newest = next.seen;
    for (var i = 0; events && i < events.length; i++) {
      var ev = events[i];
      if (!ev || !(ev.time > next.seen)) continue;
      if (ev.time > newest) newest = ev.time;
      if (ev.type === 'paddle' && (ev.side === 'left' || ev.side === 'right')) {
        next[ev.side] = { held: 'swing', since: ev.time };
      } else if (ev.type === 'score' && (ev.side === 'left' || ev.side === 'right')) {
        var loser = ev.side === 'left' ? 'right' : 'left';
        next[ev.side] = { held: 'win', since: ev.time };
        next[loser] = { held: 'miss', since: ev.time };
      }
    }
    next.seen = newest;
    return next;
  }

  /** Whether an era's config has frames for a beat. */
  function hasBeat(cfg, beat) {
    return !cfg || !cfg.frames ? beat === 'idle' : (cfg.frames[beat] || 0) > 0;
  }

  /**
   * What one player is doing at `time`, and which of its frames shows:
   * { beat, frame }. side is that player's memory, vy its paddle's speed.
   */
  function beatOf(side, time, vy, cfg) {
    var held = side && side.held;
    var age = held ? time - side.since : 0;
    var beat = 'idle';
    if (held === 'swing' && age >= 0 && age < SWING_S) beat = 'swing';
    else if ((held === 'miss' || held === 'win') && age >= 0 && age < REACT_S) beat = held;
    else if (vy < -MOVE) beat = 'up';
    else if (vy > MOVE) beat = 'down';
    if (!hasBeat(cfg, beat)) { beat = 'idle'; held = null; }
    var n = Math.max(1, (cfg && cfg.frames && cfg.frames[beat]) || 1);
    var fps = (cfg && cfg.fps) || DEFAULTS.fps;
    var frame;
    if (beat === 'swing') frame = Math.min(n - 1, Math.floor(age / SWING_S * n));
    else if (beat === 'miss' || beat === 'win') frame = Math.floor(age * fps) % n;
    else frame = Math.floor(Math.max(0, time) * fps) % n;
    return { beat: beat, frame: frame };
  }

  // One memory per game, found by the game's score object: the copies the era
  // change and the display make of a state share it, the attract rally has its own.
  var memories = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** The memory for this state, brought up to date with its events. Reads only. */
  function memoryOf(state) {
    var key = state && state.score;
    var mem = (memories && key && memories.get(key)) || freshMemory();
    mem = observe(mem, state.events, state.time || 0);
    if (memories && key && typeof key === 'object') memories.set(key, mem);
    return mem;
  }

  // ----------------------------------------------------------- anchoring
  /** The 3D camera an era draws its table with this frame, or null. */
  function cameraFor(state, look, T) {
    if (!T || !look || !look.camera) return null;
    if (typeof look.cameraAt === 'function') {
      try { return look.cameraAt(T, state, look.camera); } catch (e) { /* fall through */ }
    }
    return T.camera(look.camera);
  }

  /**
   * Where a player's hand goes and how big the player is:
   * { x, y, scale, mirror }. x, y are in the frame's drawing units; scale is
   * drawing units per sheet pixel; mirror is -1 for the right-hand player.
   * On the 3D eras cam is the era's camera, and the point is projected from
   * the table, so the figure is scaled by the table's depth there.
   */
  function anchorOf(state, sideName, cfg, cam, T) {
    var p = state[sideName];
    var mirror = sideName === 'right' ? -1 : 1;
    var outerX = mirror > 0 ? p.x : p.x + p.w;
    var fx = outerX - mirror * cfg.anchor.dx;
    var fy = p.y + p.h / 2 + cfg.anchor.dy;
    if (cfg.is3d && cam && T) {
      var s = T.project(cam, fx, fy, cfg.anchor.dz || 0);
      return { x: s.x, y: s.y, scale: cfg.scale * s.scale, mirror: mirror, depth: s.depth };
    }
    return { x: fx, y: fy, scale: cfg.scale, mirror: mirror, depth: 0 };
  }

  /** The destination rectangle a frame lands in, before any mirroring. */
  function frameBox(a, cfg) {
    return {
      x: -cfg.hand.x * a.scale,
      y: -cfg.hand.y * a.scale,
      w: cfg.frame.w * a.scale,
      h: cfg.frame.h * a.scale
    };
  }

  // -------------------------------------------------------- placeholder
  /**
   * One pose of the placeholder, in grid cells, onto c at (ox, oy), `res`
   * pixels a cell. Facing right; the hand at the right-hand edge half way down
   * except in a miss (the arm drops) and a win (both arms up).
   */
  function drawPose(c, beat, i, pal, res, round, ox, oy) {
    function r(x, y, w, h) { c.fillRect(ox + x * res, oy + y * res, w * res, h * res); }
    var bx = 0, by = 0, stride = 0;
    if (beat === 'idle') by = i % 2;
    else if (beat === 'up') { by = 2; stride = i % 2 ? 1 : -1; }
    else if (beat === 'down') { by = -1; stride = i % 2 ? 1 : -1; }
    else if (beat === 'swing') bx = i === 0 ? -1 : (i === 1 ? 1 : 0);
    else if (beat === 'miss') { by = 3; bx = -1; }
    else if (beat === 'win') by = 0;

    // legs, down to the ground whatever the body does
    c.fillStyle = pal.body;
    var legTop = 14 + by;
    r(4 + bx + (stride < 0 ? -1 : 0), legTop, 2, GRID.h - legTop);
    r(6 + bx + (stride > 0 ? 1 : 0), legTop, 2, GRID.h - legTop);
    // torso, in the paddle's ink
    c.fillStyle = pal.shirt;
    r(4 + bx, 5 + by, 4, 9);
    // head
    c.fillStyle = pal.skin;
    var hy = 1 + by + (beat === 'miss' ? 1 : 0);
    if (round && typeof c.arc === 'function' && typeof c.beginPath === 'function') {
      c.beginPath();
      c.arc(ox + (6 + bx) * res, oy + (hy + 2) * res, 2 * res, 0, Math.PI * 2);
      c.fill();
    } else {
      r(4 + bx, hy, 4, 4);
    }
    // arms
    c.fillStyle = pal.shirt;
    if (beat === 'win') {
      var lift = i % 2;
      r(2 + bx, lift, 2, 7 - lift);
      r(8 + bx, lift, 2, 7 - lift);
      c.fillStyle = pal.skin;
      r(2 + bx, lift, 2, 1);
      r(8 + bx, lift, 2, 1);
    } else if (beat === 'miss') {
      r(8 + bx, 6 + by, 2, 8);
      c.fillStyle = pal.skin;
      r(8 + bx, 14 + by, 2, 1);
    } else {
      var shoulder = 6 + by;
      r(8 + bx, shoulder, 2, Math.max(1, GRID.handY - 1 - shoulder));
      r(8 + bx, GRID.handY - 1, GRID.handX - 1 - (8 + bx), 2);
      c.fillStyle = pal.skin;
      r(GRID.handX - 1, GRID.handY - 1, 1, 2);
    }
  }

  function paletteOf(cfg, ink) {
    return { skin: cfg.skin, body: cfg.body, shirt: ink || '#c0c0c0' };
  }

  function hasDocument() {
    return typeof document !== 'undefined' && document && typeof document.createElement === 'function';
  }

  var placeholders = {};   // era + ink -> an offscreen sheet

  /** The placeholder sheet for an era in an ink: drawn once, then only copied. */
  function placeholderSheet(cfg, ink) {
    // The frame size is in the key: one side of an era may wear a sheet's frame
    // while the other, with no sheet, wears the placeholder's own.
    var key = cfg.era + '|' + ink + '|' + cfg.frame.w + 'x' + cfg.frame.h;
    if (placeholders[key] !== undefined) return placeholders[key];
    var sheet = null;
    if (hasDocument()) {
      var cols = 0;
      for (var b = 0; b < BEATS.length; b++) cols = Math.max(cols, cfg.frames[BEATS[b]] || 0);
      var canvas = document.createElement('canvas');
      canvas.width = cfg.frame.w * cols;
      canvas.height = cfg.frame.h * BEATS.length;
      var c = canvas.getContext && canvas.getContext('2d');
      if (c) {
        var pal = paletteOf(cfg, ink);
        for (var row = 0; row < BEATS.length; row++) {
          for (var i = 0; i < (cfg.frames[BEATS[row]] || 0); i++) {
            drawPose(c, BEATS[row], i, pal, cfg.res, cfg.round, i * cfg.frame.w, row * cfg.frame.h);
          }
        }
        sheet = canvas;
      }
    }
    placeholders[key] = sheet;
    return sheet;
  }

  // ------------------------------------------------------------- sheets
  /**
   * A loaded pixellab sheet, cut into its frames: { image, rects } where
   * rects[beat][i] is that frame's source rectangle. Null until it has loaded
   * (the placeholder draws meanwhile), and null for good if it failed.
   */
  var cut = {};
  function sheetFrames(cfg, sprites) {
    var S = sprites || root.PongSprites;
    if (!cfg.sheet || !S) return null;
    if (cut[cfg.sheet]) return cut[cfg.sheet];
    // Headless there is no Image to load into, and the loader throws: that is
    // "not loaded", and the placeholder draws (item 1225, the first real sheet).
    var image;
    try { image = S.load(cfg.sheet); } catch (e) { return null; }
    if (!S.ready(cfg.sheet)) return null;
    var rects = {};
    for (var row = 0; row < BEATS.length; row++) {
      var list = rects[BEATS[row]] = [];
      for (var i = 0; i < (cfg.frames[BEATS[row]] || 0); i++) {
        list.push({ x: i * cfg.frame.w, y: row * cfg.frame.h, w: cfg.frame.w, h: cfg.frame.h });
      }
    }
    cut[cfg.sheet] = { image: image, rects: rects };
    return cut[cfg.sheet];
  }

  // -------------------------------------------------------------- drawing
  var enabled = !(root.location && /[?&]characters=off\b/.test(String(root.location.search || '')));

  /** One player, onto ctx, in its era's config. */
  function drawPlayer(ctx, state, sideName, cfg, mem, R, cam, T) {
    var p = state[sideName];
    if (!p) return;
    var pose = beatOf(mem[sideName], state.time || 0, p.vy || 0, cfg);
    var a = anchorOf(state, sideName, cfg, cam, T);
    var box = frameBox(a, cfg);
    ctx.save();
    ctx.translate(a.x, a.y);
    if (a.mirror < 0) ctx.scale(-1, 1);
    var smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    var sheet = sheetFrames(cfg);
    if (sheet && sheet.rects[pose.beat] && sheet.rects[pose.beat][pose.frame]) {
      var s = sheet.rects[pose.beat][pose.frame];
      ctx.drawImage(sheet.image, s.x, s.y, s.w, s.h, box.x, box.y, box.w, box.h);
    } else {
      var ink = R && typeof R.paddleInk === 'function' ? R.paddleInk(state, sideName) : null;
      var ph = placeholderSheet(cfg, ink);
      var row = BEATS.indexOf(pose.beat);
      if (ph) {
        ctx.drawImage(ph, pose.frame * cfg.frame.w, row * cfg.frame.h, cfg.frame.w, cfg.frame.h,
                      box.x, box.y, box.w, box.h);
      } else {
        // No document (node --test): the same pose, straight onto ctx.
        ctx.translate(box.x, box.y);
        ctx.scale(a.scale, a.scale);
        drawPose(ctx, pose.beat, pose.frame, paletteOf(cfg, ink), cfg.res, cfg.round, 0, 0);
      }
    }
    ctx.imageSmoothingEnabled = smooth;
    ctx.restore();
  }

  /**
   * Both players over a frame already drawn. Reads the state, writes nothing
   * of it. Era 0, dimmed frames and a state with no paddles draw nothing.
   * Answers whether it drew.
   */
  function drawPlayers(ctx, state, opts, R) {
    if (!enabled || !ctx || !state || !state.left || !state.right) return false;
    if (opts && opts.ink) return false;
    var era = Math.floor(state.era) || 0;
    var cfg = configFor(era);
    if (!cfg) return false;
    R = R || root.PongRender;
    var mem = memoryOf(state);
    var T = null, cam = null;
    if (cfg.is3d) {
      T = R && R.table3d;
      cam = cameraFor(state, R && R.eraLook ? R.eraLook(state.era) : null, T);
    }
    // The far player (smaller y) first, so the near one overlaps it.
    var order = state.left.y <= state.right.y ? ['left', 'right'] : ['right', 'left'];
    // Each side in its own config: they differ only in the sheet it wears.
    var sides = { left: cfg, right: configFor(era, 'right') };
    for (var i = 0; i < order.length; i++) drawPlayer(ctx, state, order[i], sides[order[i]], mem, R, cam, T);
    return true;
  }

  // Wrap the renderer's draw once, so every frame anything draws has the players.
  function install(R) {
    if (!R || R.__characters) return false;
    var inner = R.draw;
    R.draw = function (ctx, state, opts) {
      var out = inner.apply(this, arguments);
      try { drawPlayers(ctx, state, opts, R); } catch (e) { /* a figure never stops the game */ }
      return out;
    };
    R.__characters = true;
    return true;
  }

  var api = {
    BEATS: BEATS,
    MOVE: MOVE,
    SWING_S: SWING_S,
    REACT_S: REACT_S,
    GRID: GRID,
    DEFAULTS: DEFAULTS,
    ERAS: ERAS,
    configFor: configFor,
    freshMemory: freshMemory,
    observe: observe,
    beatOf: beatOf,
    memoryOf: memoryOf,
    anchorOf: anchorOf,
    frameBox: frameBox,
    cameraFor: cameraFor,
    drawPose: drawPose,
    drawPlayers: drawPlayers,
    install: install,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; }
  };

  if (root.PongRender) install(root.PongRender);
  root.PongCharacters = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
