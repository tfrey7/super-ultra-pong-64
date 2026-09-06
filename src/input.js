/*
 * Super Ultra Pong 64: Remastered -- the hands.
 *
 * Listens to the mouse and the keyboard and turns them into one plain intent
 * object the rules can read:
 *
 *   { pointerY: number | null, up: boolean, down: boolean }
 *
 * It knows nothing about the rules and nothing about how the game is drawn --
 * only how to convert a screen position into a field position, since the canvas
 * is scaled to fit the window.
 *
 * Mouse and keys both work, and whichever the player touched LAST is the one in
 * charge; that is the only reason this module keeps any state at all.
 */
(function (root) {
  'use strict';

  var UP_KEYS = ['ArrowUp', 'KeyW'];
  var DOWN_KEYS = ['ArrowDown', 'KeyS'];

  function attach(canvas, fieldHeight) {
    var held = Object.create(null);
    var pointerY = null;
    var device = 'mouse';   // 'mouse' | 'keys' -- last one touched wins

    function toFieldY(clientY) {
      var box = canvas.getBoundingClientRect();
      if (!box.height) return null;
      return ((clientY - box.top) / box.height) * fieldHeight;
    }

    function onPointerMove(e) {
      var y = toFieldY(e.clientY);
      if (y === null) return;
      pointerY = y;
      device = 'mouse';
    }

    function isUp(code) { return UP_KEYS.indexOf(code) !== -1; }
    function isDown(code) { return DOWN_KEYS.indexOf(code) !== -1; }

    function onKeyDown(e) {
      if (!isUp(e.code) && !isDown(e.code)) return;
      held[e.code] = true;
      device = 'keys';
      e.preventDefault();     // stop the arrows scrolling the page
    }

    function onKeyUp(e) {
      if (!isUp(e.code) && !isDown(e.code)) return;
      held[e.code] = false;
      e.preventDefault();
    }

    window.addEventListener('mousemove', onPointerMove, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length) {
        var y = toFieldY(e.touches[0].clientY);
        if (y !== null) { pointerY = y; device = 'mouse'; }
      }
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // A window that loses focus must not leave a key stuck down.
    window.addEventListener('blur', function () { held = Object.create(null); });

    return {
      /** The current intent, ready to hand straight to Pong.step. */
      read: function () {
        var up = UP_KEYS.some(function (k) { return held[k]; });
        var down = DOWN_KEYS.some(function (k) { return held[k]; });
        return {
          pointerY: device === 'mouse' ? pointerY : null,
          up: up,
          down: down
        };
      }
    };
  }

  root.PongInput = { attach: attach };
})(typeof globalThis !== 'undefined' ? globalThis : this);
