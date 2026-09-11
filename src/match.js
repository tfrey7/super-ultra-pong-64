/*
 * Super Ultra Pong 64: Remastered -- the match and its finale (item 1211).
 *
 * A match is eleven points, one per era (Pong.RULES.matchPoints): the tenth
 * lands on the Xbox 360 and the eleventh, scored there, ends it -- the rules
 * put the game in phase 'over' with `winner` and `overAt`. This file is what
 * the player sees around that:
 *
 *   MATCH POINT  ten points in, the next point is the last: while its serve
 *                holds, MATCH POINT is lettered under the arriving machine's
 *                plate, in that plate's colours. (The feel layer's slow motion,
 *                src/feel.js, plays on the point itself.)
 *   ANNOUNCE     the match is over, on the 360: an achievement pops for a win,
 *                a message from the computer's gamertag jeers a loss.
 *   REWIND       the eras run backwards, the 360 to the arcade, one rung every
 *                half second: the era change's ring (src/erachange.js) played
 *                in reverse -- the newer machine inside a ring that SHRINKS into
 *                the middle of the field, the older one left outside -- with no
 *                arrival flourishes. Each rung really is the game's era for its
 *                half second, so the soundtrack (src/music.js) cross-fades down
 *                the ladder with it.
 *   THANKS       the 1972 screen: THANKS FOR PLAYING, the final score and the
 *                eras visited. Then Pong.backToTitle(game): INSERT COIN again.
 *
 * The loop calls three things: step(game) after the rules each frame,
 * drawField(ctx, game, drawField) in place of the frame while the match is
 * over, and drawOver(ctx, game, scale) on top of the finished picture.
 *
 * Plain script: window.PongMatch in the page, module.exports under node --test.
 * Clip paths, fills and text only -- no per-pixel work.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PongMatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function rules() {
    if (root.Pong) return root.Pong;
    if (typeof require === 'function') return require('./game.js');
    return null;
  }

  // ------------------------------------------------------------ the timeline
  var ANNOUNCE_S = 3.2;   // the winner, on the 360, before the tape rewinds
  var STEP_S = 0.5;       // one rung of the rewind
  var THANKS_S = 6;       // the 1972 screen, then back to INSERT COIN

  /**
   * Where the finale is, t seconds after the match ended, from the rung it
   * ended on (`top`, the 360 in a real match):
   *   { stage: 'announce' | 'rewind' | 'thanks' | 'done', era, from, to, raw }
   * era is the rung the game is on this instant; in the rewind `from` is the
   * rung shrinking away inside the ring, `to` the one it leaves behind, and
   * raw runs 0 to 1 across the half second.
   */
  function timeline(t, top) {
    top = Math.max(0, Math.floor(top || 0));
    var rewind = top * STEP_S;
    if (!(t >= 0)) t = 0;
    if (t < ANNOUNCE_S) return { stage: 'announce', era: top, from: top, to: top, raw: 0 };
    var u = t - ANNOUNCE_S;
    if (u < rewind) {
      var k = Math.floor(u / STEP_S);
      var from = top - k;
      return { stage: 'rewind', era: from - 1, from: from, to: from - 1, raw: (u - k * STEP_S) / STEP_S };
    }
    if (u < rewind + THANKS_S) return { stage: 'thanks', era: 0, from: 0, to: 0, raw: (u - rewind) / THANKS_S };
    return { stage: 'done', era: 0, from: 0, to: 0, raw: 1 };
  }

  /** How long the whole finale lasts from a given top rung, in seconds. */
  function length(top) { return ANNOUNCE_S + Math.max(0, top) * STEP_S + THANKS_S; }

  // ------------------------------------------------------------ memory
  // What the finale must remember about the match it is ending: the rung it
  // ended on (the game's era is walked down underneath it) and the eras seen.
  var memories = typeof WeakMap === 'function' ? new WeakMap() : null;
  var fallback = null;

  function memo(game) {
    var m = memories ? memories.get(game) : fallback;
    if (!m || m.overAt !== game.overAt) {
      m = { overAt: game.overAt, top: game.era || 0, first: game.startEra || 0 };
      if (memories) memories.set(game, m); else fallback = m;
    }
    return m;
  }

  /** Where the finale of this finished game has got to, or null while one is not on. */
  function finale(game) {
    if (!game || game.phase !== 'over') return null;
    var m = memo(game);
    var f = timeline(game.time - game.overAt, m.top);
    f.top = m.top;
    f.visited = m.top - m.first + 1;
    f.t = game.time - game.overAt;
    return f;
  }

  /**
   * After the rules each frame: walk the game's era down the rewind (so the
   * music and the display follow it), and at the end go back to the cabinet.
   */
  function step(game) {
    var f = finale(game);
    if (!f) return null;
    if (f.stage === 'done') {
      rules().backToTitle(game);
      return f;
    }
    if (game.era !== f.era) game.era = f.era;
    return f;
  }

  // ------------------------------------------------------------ drawing
  function R() { return root.PongRender; }

  /** The shrinking ring: `from` inside, `to` outside, closing on the centre. */
  function rewindRing(game, f) {
    var E = R().ERA_CHANGE;
    var origin = { x: game.width / 2, y: game.height / 2 };
    var eased = E.easeWipe(1 - f.raw);
    return { from: f.to, era: f.from, origin: origin,
             radius: E.ringRadius(eased, origin, game.width, game.height) };
  }

  /**
   * The frame while the match is over, in place of the ordinary one. Returns
   * false (drawing nothing) when no finale is on, so the loop draws as usual.
   */
  function drawField(ctx, game, plain) {
    var f = finale(game);
    if (!f) return false;
    var P = R();
    if (f.stage === 'rewind' && P && P.ERA_CHANGE && typeof P.ERA_CHANGE.composite === 'function') {
      P.ERA_CHANGE.composite(ctx, game, null, rewindRing(game, f), P.eraCardStyle(f.from));
    } else {
      plain(ctx, game);
    }
    return true;
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function ease(u) { u = clamp01(u); return 1 - Math.pow(1 - u, 3); }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - r);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.lineTo(x + r, y + h);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  var FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  var GREEN = '#7cc242';          // the 360's own green

  /** MATCH POINT under the arriving machine's plate, in its colours. */
  function drawMatchPoint(ctx, game) {
    var P = R();
    var st = P.eraCardStyle ? P.eraCardStyle(game.era) : {};
    var m = P.eraChangeMoment ? P.eraChangeMoment(game) : null;
    if (m && !m.cardUp) return;                    // the ring is still coming in
    var cell = 8, gap = 6, text = 'MATCH POINT';
    var w = text.length * (3 * cell + gap) - gap;   // the block font: 3 cells a glyph
    var x = game.width / 2 - w / 2 - 18, y = game.height / 2 + 70;
    var lit = Math.floor(game.time / 0.18) % 2 === 0 || game.serveDelay < 0.6;
    ctx.fillStyle = st.box || '#000000';
    ctx.fillRect(x, y, w + 36, 5 * cell + 24);
    ctx.strokeStyle = st.border || st.edge || '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w + 36, 5 * cell + 24);
    ctx.fillStyle = lit ? (st.edge || '#ffffff') : (st.name || '#ffffff');
    P.drawText(ctx, text, game.width / 2, y + 12, cell, gap);
  }

  /** The 360's toast: the ring icon, a title line and a detail line, sliding up. */
  function toast(ctx, game, t, icon, title, detail) {
    var W = 520, H = 92, x = game.width / 2 - W / 2;
    var inOut = Math.min(ease(t / 0.35), ease((ANNOUNCE_S - t) / 0.3));
    var y = game.height - 40 - H * inOut;
    ctx.save();
    ctx.globalAlpha = clamp01(inOut * 1.4);
    var g = ctx.createLinearGradient(0, y, 0, y + H);
    g.addColorStop(0, '#3d3d3d');
    g.addColorStop(1, '#141414');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, W, H, H / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // The icon: the guide button's ring, in green (a trophy) or grey (a message).
    var cx = x + H / 2, cy = y + H / 2;
    ctx.fillStyle = icon;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 25px ' + FONT;
    ctx.fillText(title, x + H + 6, y + 40);
    ctx.fillStyle = '#d0d0d0';
    ctx.font = '21px ' + FONT;
    ctx.fillText(detail, x + H + 6, y + 70);
    ctx.restore();
  }

  function drawAnnounce(ctx, game, f) {
    var won = game.winner === 'left';
    var s = game.score.left + ' - ' + game.score.right;
    ctx.save();
    // The headline, big and clean over the held 360 picture.
    var a = ease(f.t / 0.5);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 150, game.width, 150);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = won ? GREEN : '#ff4040';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 64px ' + FONT;
    ctx.fillText(won ? 'YOU WIN' : 'YOU LOSE', game.width / 2, 238);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '600 30px ' + FONT;
    ctx.fillText(s, game.width / 2, 282);
    ctx.restore();
    if (f.t > 0.6) {
      var t = f.t - 0.6;
      if (won) toast(ctx, game, t, GREEN, 'Achievement Unlocked', '100G – Eleven Eras, One Match');
      else toast(ctx, game, t, '#5a5a5a', 'xX CPU 2005 Xx', '"gg no re. 1972 called, it wants its paddle back"');
    }
  }

  /** The tape going back: a VCR's REWIND in the corner, and the year falling. */
  function drawRewind(ctx, game, f) {
    var P = R();
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    if (Math.floor(f.t / 0.25) % 2 === 0) {
      // Two left-pointing triangles, then the word.
      for (var i = 0; i < 2; i++) {
        var x0 = 34 + i * 22;
        ctx.beginPath();
        ctx.moveTo(x0, 44);
        ctx.lineTo(x0 + 22, 30);
        ctx.lineTo(x0 + 22, 58);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (P.drawText) {
      P.drawText(ctx, 'REWIND', 190, 32, 5, 4);
      var e = null, eras = (rules().ERAS || []);
      for (var k = 0; k < eras.length; k++) if (eras[k].era === f.to) e = eras[k];
      if (e) P.drawText(ctx, String(e.year), game.width - 110, 32, 5, 4);
    }
    ctx.restore();
  }

  /** The 1972 screen's last word, in its own block lettering. */
  function drawThanks(ctx, game, f) {
    var P = R();
    if (!P.drawText) return;
    var mid = game.width / 2;
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(40, 120, game.width - 80, 380);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    P.drawText(ctx, 'THANKS FOR', mid, 150, 10, 8);
    P.drawText(ctx, 'PLAYING', mid, 214, 10, 8);
    P.drawText(ctx, 'FINAL SCORE', mid, 310, 5, 4);
    P.drawText(ctx, game.score.left + '  ' + game.score.right, mid, 346, 9, 8);
    var eras = rules().ERAS || [];
    var lo = eras[Math.max(0, f.top - f.visited + 1)], hi = eras[f.top];
    P.drawText(ctx, f.visited + (f.visited === 1 ? ' ERA VISITED' : ' ERAS VISITED'), mid, 424, 4, 3);
    if (lo && hi) P.drawText(ctx, lo === hi ? String(hi.year) : lo.year + ' TO ' + hi.year, mid, 452, 4, 3);
    ctx.restore();
  }

  /** Does anything of the match need drawing over the picture this frame? */
  function overlays(game) {
    if (!game) return false;
    if (game.phase === 'over') return true;
    var P = rules();
    return !!(P.isMatchPoint && P.isMatchPoint(game) && game.serveDelay > 0);
  }

  /**
   * Over the finished picture, in field units: MATCH POINT, the announcement,
   * the rewind's VCR lettering, the thanks. scale (optional) maps field units
   * onto a page canvas bigger than the field.
   */
  function drawOver(ctx, game, scale) {
    if (!overlays(game) || !R()) return false;
    ctx.save();
    if (scale > 0) ctx.setTransform(scale, 0, 0, scale, 0, 0);
    var f = finale(game);
    if (!f) drawMatchPoint(ctx, game);
    else if (f.stage === 'announce') drawAnnounce(ctx, game, f);
    else if (f.stage === 'rewind') drawRewind(ctx, game, f);
    else if (f.stage === 'thanks') drawThanks(ctx, game, f);
    ctx.restore();
    return true;
  }

  return {
    ANNOUNCE_S: ANNOUNCE_S,
    STEP_S: STEP_S,
    THANKS_S: THANKS_S,
    timeline: timeline,
    length: length,
    finale: finale,
    step: step,
    rewindRing: rewindRing,
    drawField: drawField,
    overlays: overlays,
    drawOver: drawOver
  };
});
