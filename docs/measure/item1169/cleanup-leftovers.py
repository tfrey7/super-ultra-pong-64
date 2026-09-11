"""Item 1169, last step: delete the Chrome profile folders earlier capture runs left in G:/claude-tmp.

    py -3.10 docs/measure/item1169/cleanup-leftovers.py [--dry-run]

Only the brief's two patterns, `item-11*-chrome-*` and `item-1138-flipshot-*`, and only folders
that no running chrome.exe has open -- another worker may be measuring right now. "Open" is read
from every running chrome.exe's command line (its --user-data-dir); a folder written to in the last
ten minutes is also left alone, in case a script is about to start Chrome on it. Writes
cleanup-leftovers.json beside this file: what was there, what was kept and why, what went.
"""
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys
import time

ROOT = 'G:/claude-tmp'
PATTERNS = ['item-11*-chrome-*', 'item-1138-flipshot-*']
RECENT_S = 600
DRY = '--dry-run' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))


def chrome_profiles():
    """Every --user-data-dir a running chrome.exe was started with, normalised."""
    ps = ("Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | "
          "ForEach-Object { $_.CommandLine }")
    out = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True).stdout
    held = set()
    for line in out.splitlines():
        for m in re.finditer(r'--user-data-dir=(?:"([^"]+)"|(\S+))', line):
            held.add(os.path.normcase(os.path.normpath(m.group(1) or m.group(2))))
    return held


def size_mb(path):
    total = 0
    for dirpath, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except OSError:
                pass
    return round(total / 1e6, 1)


def newest_write(path):
    newest = os.path.getmtime(path)
    for dirpath, dirs, files in os.walk(path):
        for n in dirs + files:
            try:
                newest = max(newest, os.path.getmtime(os.path.join(dirpath, n)))
            except OSError:
                pass
    return newest


held = chrome_profiles()
now = time.time()
rows = []
for name in sorted(os.listdir(ROOT)):
    full = os.path.join(ROOT, name)
    if not os.path.isdir(full) or not any(fnmatch.fnmatch(name, p) for p in PATTERNS):
        continue
    row = {'name': name, 'mb': size_mb(full)}
    age = now - newest_write(full)
    row['minutesSinceWrite'] = round(age / 60, 1)
    if os.path.normcase(os.path.normpath(full)) in held:
        row['kept'] = 'a running chrome.exe has it open'
    elif age < RECENT_S:
        row['kept'] = 'written to in the last ten minutes'
    elif DRY:
        row['kept'] = 'dry run'
    else:
        shutil.rmtree(full, ignore_errors=True)
        if os.path.exists(full):
            row['kept'] = 'delete refused (still locked)'
        else:
            row['removed'] = True
    rows.append(row)

removed = [r for r in rows if r.get('removed')]
kept = [r for r in rows if 'kept' in r]
result = {
    'when': time.strftime('%Y-%m-%dT%H:%M:%S'), 'root': ROOT, 'patterns': PATTERNS,
    'chromeProfilesOpen': sorted(held), 'removed': removed, 'kept': kept,
    'removedMb': round(sum(r['mb'] for r in removed), 1),
}
if not DRY:
    with open(os.path.join(HERE, 'cleanup-leftovers.json'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(json.dumps(result, indent=1) + '\n')
print(f"{len(rows)} matching folders; removed {len(removed)} ({result['removedMb']} MB); kept {len(kept)}")
for r in removed:
    print(f"  removed {r['name']}  {r['mb']} MB, last written {r['minutesSinceWrite']} min ago")
for r in kept:
    print(f"  kept    {r['name']}  {r['mb']} MB -- {r['kept']}")
print('chrome.exe profiles open right now:', ', '.join(sorted(held)) or 'none')
