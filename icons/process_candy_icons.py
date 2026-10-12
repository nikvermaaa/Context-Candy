#!/usr/bin/env python3
"""
icons/process_candy_icons.py
Generate Context Candy icons with transparent background (like the Ghostery toolbar icon).
Extracts the candy wrapper and emblem, removes the solid brown background completely,
and generates antialiased transparent PNG icons for the browser toolbar.
"""
import zlib
import struct
import os
from collections import deque

def read_png(path):
    with open(path, "rb") as f:
        data = f.read()

    idx = 8
    idat_chunks = []
    w, h = 0, 0
    color_type = 6
    while idx < len(data):
        length, = struct.unpack(">I", data[idx:idx+4])
        chunk_type = data[idx+4:idx+8]
        chunk_data = data[idx+8:idx+8+length]
        idx += 8 + length + 4
        if chunk_type == b"IHDR":
            w, h, depth, color_type, comp, filt, interlace = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"IDAT":
            idat_chunks.append(chunk_data)

    raw = zlib.decompress(b"".join(idat_chunks))
    bpp = 4 if color_type == 6 else 3
    stride = w * bpp + 1

    def paeth(a, b, c):
        p = a + b - c
        pa = abs(p - a)
        pb = abs(p - b)
        pc = abs(p - c)
        if pa <= pb and pa <= pc: return a
        elif pb <= pc: return b
        else: return c

    pixels = []
    prior = [0] * (w * bpp)
    for y in range(h):
        row_data = raw[y*stride : (y+1)*stride]
        filter_type = row_data[0]
        curr = bytearray(w * bpp)
        for x in range(w * bpp):
            val = row_data[1 + x]
            left = curr[x - bpp] if x >= bpp else 0
            up = prior[x]
            up_left = prior[x - bpp] if x >= bpp else 0
            if filter_type == 0:
                res = val
            elif filter_type == 1:
                res = (val + left) & 0xff
            elif filter_type == 2:
                res = (val + up) & 0xff
            elif filter_type == 3:
                res = (val + (left + up) // 2) & 0xff
            elif filter_type == 4:
                res = (val + paeth(left, up, up_left)) & 0xff
            curr[x] = res
        prior = curr
        pixels.append(curr)

    return w, h, pixels

def write_png(width, height, pixel_grid, out_path):
    raw_rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            r, g, b, a = pixel_grid[y][x]
            row.extend([r, g, b, a])
        raw_rows.append(bytes(row))
    raw_data = b"".join(raw_rows)

    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    png_header = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr = chunk(b"IHDR", ihdr_data)
    idat = chunk(b"IDAT", zlib.compress(raw_data, 9))
    iend = chunk(b"IEND", b"")
    with open(out_path, "wb") as f:
        f.write(png_header + ihdr + idat + iend)

def generate_transparent_icons():
    icons_dir = os.path.dirname(os.path.abspath(__file__))
    ref_path = os.path.join(icons_dir, "context_candy_reference.png")
    w, h, pix = read_png(ref_path)

    bg_r, bg_g, bg_b = 94.0, 58.0, 58.0

    def is_bg_color(r, g, b):
        if g > 90 or b > 85 or r > 135:
            return False
        dist = ((r - bg_r)**2 + (g - bg_g)**2 + (b - bg_b)**2)**0.5
        return dist < 42

    is_bg = [[False]*w for _ in range(h)]
    queue = deque()

    for x in range(w):
        queue.append((x, 0))
        queue.append((x, h-1))
        is_bg[0][x] = True
        is_bg[h-1][x] = True

    for y in range(h):
        queue.append((0, y))
        queue.append((w-1, y))
        is_bg[y][0] = True
        is_bg[y][w-1] = True

    while queue:
        cx, cy = queue.popleft()
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not is_bg[ny][nx]:
                r, g, b = pix[ny][nx*4], pix[ny][nx*4+1], pix[ny][nx*4+2]
                if is_bg_color(r, g, b):
                    is_bg[ny][nx] = True
                    queue.append((nx, ny))

    non_bg_x = [x for y in range(h) for x in range(w) if not is_bg[y][x]]
    non_bg_y = [y for y in range(h) for x in range(w) if not is_bg[y][x]]
    min_x, max_x = min(non_bg_x), max(non_bg_x)
    min_y, max_y = min(non_bg_y), max(non_bg_y)
    candy_w = max_x - min_x + 1
    candy_h = max_y - min_y + 1

    alpha_map = [[0.0]*w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if is_bg[y][x]:
                alpha_map[y][x] = 0.0
            else:
                r, g, b = pix[y][x*4], pix[y][x*4+1], pix[y][x*4+2]
                dist = ((r - bg_r)**2 + (g - bg_g)**2 + (b - bg_b)**2)**0.5
                if dist < 50:
                    alpha_map[y][x] = max(0.0, min(1.0, (dist - 20) / 30.0))
                else:
                    alpha_map[y][x] = 1.0

    # Build 512x512 master grid scaled to maximize visibility in toolbar buttons
    master_size = 512
    fit_w_ratio = 0.95
    fit_h_ratio = 0.80
    dest_w = int(master_size * fit_w_ratio)
    dest_h = int(master_size * fit_h_ratio)
    dest_x0 = (master_size - dest_w) // 2
    dest_y0 = (master_size - dest_h) // 2

    master_grid = [[(0, 0, 0, 0) for _ in range(master_size)] for _ in range(master_size)]
    for dy in range(dest_h):
        sy_f = min_y + (dy * candy_h) / float(dest_h)
        sy0 = int(sy_f)
        sy1 = min(h - 1, sy0 + 1)
        fy = sy_f - sy0

        for dx in range(dest_w):
            sx_f = min_x + (dx * candy_w) / float(dest_w)
            sx0 = int(sx_f)
            sx1 = min(w - 1, sx0 + 1)
            fx = sx_f - sx0

            a00 = alpha_map[sy0][sx0]
            a10 = alpha_map[sy0][sx1]
            a01 = alpha_map[sy1][sx0]
            a11 = alpha_map[sy1][sx1]
            a_val = (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy

            if a_val > 0.01:
                def get_rgb(y, x):
                    return pix[y][x*4], pix[y][x*4+1], pix[y][x*4+2]

                r00, g00, b00 = get_rgb(sy0, sx0)
                r10, g10, b10 = get_rgb(sy0, sx1)
                r01, g01, b01 = get_rgb(sy1, sx0)
                r11, g11, b11 = get_rgb(sy1, sx1)

                r = (r00 * (1 - fx) + r10 * fx) * (1 - fy) + (r01 * (1 - fx) + r11 * fx) * fy
                g = (g00 * (1 - fx) + g10 * fx) * (1 - fy) + (g01 * (1 - fx) + g11 * fx) * fy
                b = (b00 * (1 - fx) + b10 * fx) * (1 - fy) + (b01 * (1 - fx) + b11 * fx) * fy

                # Enhance contrast: deepen dark text, boost foil vibrance for dark toolbar themes
                if r < 85 and g < 85 and b < 85:
                    r = max(0, int(r * 0.55))
                    g = max(0, int(g * 0.55))
                    b = max(0, int(b * 0.55))
                else:
                    r = min(255, int(r * 1.08 + 12))
                    g = min(255, int(g * 1.08 + 12))
                    b = min(255, int(b * 1.05 + 6))

                master_grid[dest_y0 + dy][dest_x0 + dx] = (int(r), int(g), int(b), int(a_val * 255))

    def downsample_alpha(grid, in_size, out_size):
        scale = in_size / float(out_size)
        out_grid = []
        for dy in range(out_size):
            row = []
            sy0 = int(dy * scale)
            sy1 = max(sy0 + 1, int((dy + 1) * scale))
            sy1 = min(sy1, in_size)
            for dx in range(out_size):
                sx0 = int(dx * scale)
                sx1 = max(sx0 + 1, int((dx + 1) * scale))
                sx1 = min(sx1, in_size)
                r_acc, g_acc, b_acc, a_acc = 0, 0, 0, 0
                for y in range(sy0, sy1):
                    for x in range(sx0, sx1):
                        p = grid[y][x]
                        pa = p[3]
                        r_acc += p[0] * pa
                        g_acc += p[1] * pa
                        b_acc += p[2] * pa
                        a_acc += pa
                count = (sy1 - sy0) * (sx1 - sx0)
                avg_a = a_acc // count
                if a_acc > 0:
                    row.append((
                        min(255, r_acc // a_acc),
                        min(255, g_acc // a_acc),
                        min(255, b_acc // a_acc),
                        min(255, avg_a)
                    ))
                else:
                    row.append((0, 0, 0, 0))
            out_grid.append(row)
        return out_grid

    # Generate icons across all standard dimensions
    for size in [256, 128, 48, 32, 16]:
        icon_grid = downsample_alpha(master_grid, master_size, size)

        candy_file = os.path.join(icons_dir, f"candy{size}.png")
        write_png(size, size, icon_grid, candy_file)

        icon_file = os.path.join(icons_dir, f"icon{size}.png")
        write_png(size, size, icon_grid, icon_file)

        if size == 256:
            write_png(256, 256, icon_grid, os.path.join(icons_dir, "candy_logo_256.png"))
            write_png(256, 256, icon_grid, os.path.join(icons_dir, "showcase_icon.png"))

        print(f"Generated transparent icon: {candy_file} and {icon_file} ({size}x{size})")

if __name__ == "__main__":
    generate_transparent_icons()
