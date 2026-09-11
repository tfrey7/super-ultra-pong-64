/*
 * Super Ultra Pong 64: Remastered -- the display: every era at its machine's
 * own resolution.
 *
 * The renderer draws in field units (800 x 600). This file decides how many
 * real pixels those units get. Each frame is drawn into ONE offscreen canvas at
 * the native size of the machine on screen -- 256 x 240 for the NES, 320 x 240
 * for the PlayStation, the 720 lines of 720p for the Xbox 360 -- and then put on
 * the page with a single drawImage, scaled up to fill it. The 2D machines are
 * scaled with hard pixel edges (imageSmoothingEnabled false), the 3D ones with
 * the soft scaling a television gave them (true), so the pixels come out the
 * size that machine's pixels were.
 *
 * The table. One row per rung of the ladder:
 *   w, h      the native picture, in real pixels
 *   smooth    false: hard pixel edges; true: soft, the way a TV scaled it
 *   aspect    the shape the picture was shown at (4:3 for every machine here --
 *             a console's pixels were never square, the TV stretched them to
 *             fill the tube), so the field always fills the page's canvas.
 *             A row with another aspect is letterboxed or pillarboxed in it.
 *   overlay   the kind of screen it was seen on (see "overlays" below)
 *   strength  how strongly that overlay shows, 0..1
 *
 * During an era change the ring (src/erachange.js) composes the two eras in
 * whichever resolution is showing, and the display switches to the arriving
 * era's settings the frame the ring passes the centre of the field -- the
 * same instant the name card comes up.
 *
 * Overlays. A kind is a function (ctx, rect, row, info) that draws over the
 * scaled-up picture on the PAGE canvas, inside rect {x, y, w, h} in page
 * pixels; info is { era, time, native } where native is the offscreen canvas.
 * This file ships only 'none'. src/display-crt.js and src/display-tv.js each
 * register their own kinds with PongDisplay.registerOverlay(kind, fn) and set
 * the rows that use them -- they never need to edit this file or index.html.
 *
 * ?display=off turns the whole layer off: the frame is drawn straight onto the
 * page's canvas in field units, as before this file existed. The playtest reads
 * the native frame (pre-overlay) through PongDisplay.canvas(), and draws its
 * comparison frames through PongDisplay.prepare() at the same size.
 *
 * Canvas 2D, a plain script, no per-pixel work.
 */
(function (root) {
  'use strict';

  var ROWS = [
    // 1972 arcade: tall blocks, four field units wide and five tall.
    { era: 0,  w: 200,  h: 120, smooth: false, overlay: 'none', strength: 0 },
    // 1977 Atari 2600: the 160-wide playfield and its 192 lines, wide pixels.
    { era: 1,  w: 160,  h: 192, smooth: false, overlay: 'none', strength: 0 },
    { era: 2,  w: 256,  h: 240, smooth: false, overlay: 'none', strength: 0 },   // NES
    { era: 3,  w: 320,  h: 224, smooth: false, overlay: 'none', strength: 0 },   // Genesis
    { era: 4,  w: 256,  h: 224, smooth: false, overlay: 'none', strength: 0 },   // Super Nintendo
    { era: 5,  w: 320,  h: 240, smooth: true,  overlay: 'none', strength: 0 },   // PlayStation
    { era: 6,  w: 320,  h: 240, smooth: true,  overlay: 'none', strength: 0 },   // N64
    { era: 7,  w: 640,  h: 480, smooth: true,  overlay: 'none', strength: 0 },   // Dreamcast, VGA
    { era: 8,  w: 512,  h: 448, smooth: true,  overlay: 'none', strength: 0 },   // PS2
    { era: 9,  w: 640,  h: 480, smooth: true,  overlay: 'none', strength: 0 },   // Xbox
    // Xbox 360: 720p. The field is 4:3, so it gets the 960 x 720 middle of a
    // 1280 x 720 frame -- the HDTV's side bars fall outside the page's canvas.
    { era: 10, w: 960,  h: 720, smooth: true,  overlay: 'none', strength: 0 }
  ];
  ROWS.forEach(function (r) { r.aspect = 4 / 3; });

  /** The row for an era: its own, or the nearest one below it. */
  function row(era) {
    var e = Math.floor(era) || 0;
    if (e >= ROWS.length) e = ROWS.length - 1;
    if (e < 0) e = 0;
    return ROWS[e];
  }

  // ---------------------------------------------------------------- overlays
  var OVERLAYS = {
    none: function () {}
  };

  function registerOverlay(kind, fn) {
    if (typeof kind !== 'string' || !kind || typeof fn !== 'function') {
      throw new Error('registerOverlay needs a kind name and a draw function');
    }
    OVERLAYS[kind] = fn;
    return fn;
  }

  // ------------------------------------------------------------- which era
  /**
   * The era whose display settings are showing for this state: its own, or,
   * while an era change's ring is still short of the centre, the era it is
   * leaving. Switches the instant the ring passes the centre.
   */
  function shownEra(state) {
    var R = root.PongRender;
    var m = R && typeof R.eraChangeMoment === 'function' ? R.eraChangeMoment(state) : null;
    if (m && !m.cardUp) return m.from;
    return state.era;
  }

  /** Where a picture of the given aspect sits inside a cw x ch canvas. */
  function fitRect(cw, ch, aspect) {
    var a = aspect > 0 ? aspect : cw / ch;
    var w = cw, h = cw / a;
    if (h > ch) { h = ch; w = ch * a; }
    w = Math.round(w); h = Math.round(h);
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2), w: w, h: h };
  }

  /**
   * Set ctx up to draw a fieldW x fieldH field into a canvas of the era's
   * native size: the scale and the smoothing. The playtest uses it to draw
   * its comparison frames exactly the way the page draws its own.
   */
  function prepare(ctx, era, fieldW, fieldH) {
    var r = row(era);
    ctx.setTransform(r.w / (fieldW || 800), 0, 0, r.h / (fieldH || 600), 0, 0);
    ctx.imageSmoothingEnabled = !!r.smooth;
    return r;
  }

  // ------------------------------------------------------ the offscreen frame
  var off = null;     // the one native canvas, made once and reused

  function canvas() { return off; }

  /**
   * The context to draw this frame into: the native canvas, sized for the
   * era (resized only when the era's size changes), cleared, scaled so the
   * caller keeps drawing in field units. Null when there is no document.
   */
  function begin(era, fieldW, fieldH) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var r = row(era);
    if (!off) off = document.createElement('canvas');
    if (off.width !== r.w) off.width = r.w;
    if (off.height !== r.h) off.height = r.h;
    var ctx = off.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, r.w, r.h);
    prepare(ctx, era, fieldW, fieldH);
    return ctx;
  }

  /**
   * Put the native frame on the page: ONE drawImage, scaled up to fill the
   * page's canvas (letterboxed or pillarboxed when the row's aspect differs),
   * then the row's overlay over it. Returns the rectangle it drew into.
   */
  function present(pageCtx, era, time) {
    var r = row(era);
    var page = pageCtx.canvas;
    var rect = fitRect(page.width, page.height, r.aspect);
    pageCtx.save();
    pageCtx.setTransform(1, 0, 0, 1, 0, 0);
    if (rect.w !== page.width || rect.h !== page.height) {
      pageCtx.fillStyle = '#000000';
      pageCtx.fillRect(0, 0, page.width, page.height);
    }
    pageCtx.imageSmoothingEnabled = !!r.smooth;
    if (r.smooth) pageCtx.imageSmoothingQuality = 'high';
    if (off) pageCtx.drawImage(off, 0, 0, off.width, off.height, rect.x, rect.y, rect.w, rect.h);
    var overlay = OVERLAYS[r.overlay] || OVERLAYS.none;
    overlay(pageCtx, rect, r, { era: era, time: time || 0, native: off });
    pageCtx.restore();
    return rect;
  }

  /** ?display=off draws straight onto the page, the way it was before. */
  function enabledFor(search) {
    return !/[?&]display=off(&|$)/.test(String(search || ''));
  }

  var api = root.PongDisplay = {
    ROWS: ROWS,
    OVERLAYS: OVERLAYS,
    row: row,
    registerOverlay: registerOverlay,
    shownEra: shownEra,
    fitRect: fitRect,
    prepare: prepare,
    begin: begin,
    present: present,
    canvas: canvas,
    enabledFor: enabledFor,
    enabled: enabledFor(root.location && root.location.search)
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
