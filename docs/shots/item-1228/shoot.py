"""Item 1228's proof frames of era 5, off the real page in headless Chrome.

    py -3.10 docs/shots/item-1228/shoot.py

Three frames beside this script, each from index.html?era=5 with a score seeded
into the running game (window.__pong) and the loop frozen a moment later, so
the frame holds the moment it was taken at:

  point.png        3-2, a point the player just conceded: the red damage chunk
                   draining the P1 bar and POINT in the middle of the HUD
  final-round.png  5-5 with an eleven-point match: FINAL ROUND held, both
                   searchlights locked on the table's centre line
  rally.png        a rally in play at 1-1, the players at the paddles

Uses the fleet console's scripts/shot.py (one throwaway Chrome profile a shot).
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
SHOT = 'G:/Claude Stuff/fleet-console/scripts/shot.py'
URL = 'file:///' + ROOT.replace(os.sep, '/') + '/index.html?era=5'

FREEZE = "window.requestAnimationFrame = function () { return 0; };"

SEEDS = {
    'point.png': (
        "setTimeout(function () { var g = window.__pong; g.score.left = 3; g.score.right = 2;"
        " g.missAt = { x: 0, y: 300 };"
        " setTimeout(function () { " + FREEZE + " }, 120); }, 1500);"
    ),
    'final-round.png': (
        "setTimeout(function () { var g = window.__pong; g.rules.matchPoints = 11;"
        " g.score.left = 5; g.score.right = 5; g.missAt = { x: 800, y: 300 };"
        " setTimeout(function () { " + FREEZE + " }, 1200); }, 1000);"
    ),
    'rally.png': (
        "setTimeout(function () { var g = window.__pong; g.score.left = 1; g.score.right = 1;"
        " setTimeout(function () { " + FREEZE + " }, 1600); }, 800);"
    ),
}

def main():
    for name, seed in SEEDS.items():
        out = os.path.join(HERE, name)
        r = subprocess.run([sys.executable, SHOT, URL, out, '--seed-js', seed, '--wait', '3200'],
                           capture_output=True, text=True)
        print(name, 'exit', r.returncode, (r.stdout.strip().splitlines() or [''])[-1], r.stderr.strip()[-300:])

if __name__ == '__main__':
    main()
