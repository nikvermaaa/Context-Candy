#!/usr/bin/env python3
"""
Generate valid PNG icons (16x16, 48x48, 128x128) using pure Python stdlib (zlib, struct).
"""
import zlib
import struct
import os

def make_png(width, height, get_pixel):
    raw_rows = []
    for y in range(height):
        row = bytearray([0]) # filter type 0 (None)
        for x in range(width):
            r, g, b, a = get_pixel(x, y, width, height)
            row.extend([r, g, b, a])
        raw_rows.append(bytes(row))
    raw_data = b''.join(raw_rows)

    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)

    png_header = b'\x89PNG\r\n\x1a\n'
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = chunk(b'IHDR', ihdr_data)
    idat = chunk(b'IDAT', zlib.compress(raw_data, 9))
    iend = chunk(b'IEND', b'')
    return png_header + ihdr + idat + iend

def get_icon_pixel(x, y, w, h):
    # Normalized coords from center
    cx, cy = w / 2.0, h / 2.0
    dx = (x - cx) / (w / 2.0)
    dy = (y - cy) / (h / 2.0)
    dist = (dx**2 + dy**2)**0.5

    # Rounded rectangle background
    rx = abs(dx)
    ry = abs(dy)
    in_box = rx < 0.88 and ry < 0.88

    if in_box:
        # Indigo to deep slate gradient
        factor = (x + y) / (w + h)
        r = int(79 + (15 - 79) * factor)
        g = int(70 + (23 - 70) * factor)
        b = int(229 + (42 - 229) * factor)

        # Center capsule glyph highlight
        if abs(dx) < 0.45 and abs(dy) < 0.45:
            r = min(255, r + 70)
            g = min(255, g + 100)
            b = min(255, b + 40)
        return (r, g, b, 255)
    else:
        # Corner anti-aliasing / transparency
        if (rx - 0.7)**2 + (ry - 0.7)**2 < 0.05:
            return (79, 70, 229, 180)
        return (0, 0, 0, 0)

def main():
    icons_dir = os.path.dirname(os.path.abspath(__file__))
    for size in [16, 48, 128]:
        png_bytes = make_png(size, size, get_icon_pixel)
        out_path = os.path.join(icons_dir, f'icon{size}.png')
        with open(out_path, 'wb') as f:
            f.write(png_bytes)
        print(f"Generated {out_path} ({len(png_bytes)} bytes)")

if __name__ == '__main__':
    main()
