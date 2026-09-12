"""
Item 1293's readings, taken from the two frames beside this script.

    py -3.10 docs/shots/item-1293/era7-readings.py

It answers, for each of era7-before.png and era7-after.png:

  * the brightest pixel in the picture, and whether it is white -- readability
    rule R1 in docs/ERAS.md says the ball is the only pure white and the
    brightest thing on the table, and the ball is what the era draws last;
  * how many distinct colours the field band holds, which is the reading that
    separates the two looks: flat poster fills (a cel world) against smooth
    lit shading (1999's own launch showcases, the look Tim ruled for);
  * the mean brightness of that band, because "bright" is the other half of
    the ruling.

Pure standard library: PNG is zlib plus five filter types, which is less code
than a dependency would cost. Non-interlaced 8-bit RGB or RGBA only, which is
what headless Chrome writes.
"""
import json
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
# The field band: the table, under the sky and the score, above the near lip.
BAND = (0.10, 0.45, 0.90, 0.95)          # x0, y0, x1, y1 as fractions of the picture


def read_png(path):
    """(width, height, channels, bytes) for a non-interlaced 8-bit PNG."""
    with open(path, 'rb') as fh:
        raw = fh.read()
    assert raw[:8] == b'\x89PNG\r\n\x1a\n', '%s is not a PNG' % path
    at, idat, hdr = 8, [], None
    while at < len(raw):
        length, kind = struct.unpack('>I4s', raw[at:at + 8])
        body = raw[at + 8:at + 8 + length]
        if kind == b'IHDR':
            hdr = struct.unpack('>IIBBBBB', body)
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break
        at += 12 + length
    w, h, depth, colour, comp, filt, interlace = hdr
    assert depth == 8 and interlace == 0, 'only plain 8-bit PNGs (%s)' % path
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[colour]
    data = zlib.decompress(b''.join(idat))
    stride = w * channels
    out = bytearray(h * stride)
    prev = bytearray(stride)
    at = 0
    for y in range(h):
        ftype = data[at]
        line = bytearray(data[at + 1:at + 1 + stride])
        at += 1 + stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if ftype == 1:
                line[i] = (line[i] + a) & 0xFF
            elif ftype == 2:
                line[i] = (line[i] + b) & 0xFF
            elif ftype == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif ftype == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, channels, bytes(out)


def measure(path):
    w, h, ch, px = read_png(path)
    best, best_at, white = -1, None, 0
    x0, y0, x1, y1 = int(BAND[0] * w), int(BAND[1] * h), int(BAND[2] * w), int(BAND[3] * h)
    band, total = set(), 0
    for y in range(h):
        row = y * w * ch
        in_y = y0 <= y < y1
        for x in range(w):
            i = row + x * ch
            r, g, b = px[i], px[i + 1], px[i + 2]
            lum = r + g + b
            if lum > best:
                best, best_at = lum, (x, y, r, g, b)
            if r == 255 and g == 255 and b == 255:
                white += 1
            if in_y and x0 <= x < x1:
                band.add((r, g, b))
                total += lum
    cells = max(1, (x1 - x0) * (y1 - y0))
    return {
        'file': os.path.basename(path), 'width': w, 'height': h,
        'brightest': {'x': best_at[0], 'y': best_at[1], 'rgb': list(best_at[2:])},
        'brightestIsWhite': best_at[2:] == (255, 255, 255),
        'whitePixels': white,
        'fieldColours': len(band),
        'fieldMeanBrightness': round(total / cells / 3, 1),
    }


def main():
    out = [measure(os.path.join(HERE, n)) for n in ('era7-before.png', 'era7-after.png')
           if os.path.exists(os.path.join(HERE, n))]
    with open(os.path.join(HERE, 'era7-readings.json'), 'w') as fh:
        json.dump(out, fh, indent=2)
    for r in out:
        print('%-18s brightest %s at (%d, %d) white=%s  field colours %5d  mean brightness %5.1f'
              % (r['file'], r['brightest']['rgb'], r['brightest']['x'], r['brightest']['y'],
                 r['brightestIsWhite'], r['fieldColours'], r['fieldMeanBrightness']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
