"""Vygeneruje ikony appky (jednoduchá činka na tmavém pozadí) bez dalších knihoven.

Použití: python3 tools/make-icons.py
"""
import os
import struct
import zlib

BG = (0x16, 0x18, 0x1C)
ACCENT = (0xFF, 0x6A, 0x2B)
SS = 4  # vyhlazení: vzorků na osu

# Tvary v souřadnicích 0..1: (x0, y0, x1, y1, poloměr zaoblení)
SHAPES = [
    (0.20, 0.47, 0.80, 0.53, 0.01),  # tyč
    (0.24, 0.30, 0.31, 0.70, 0.025),  # vnitřní kotouč vlevo
    (0.69, 0.30, 0.76, 0.70, 0.025),  # vnitřní kotouč vpravo
    (0.16, 0.36, 0.23, 0.64, 0.025),  # vnější kotouč vlevo
    (0.77, 0.36, 0.84, 0.64, 0.025),  # vnější kotouč vpravo
]


def inside(x, y, s):
    x0, y0, x1, y1, r = s
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def render(size, scale=1.0):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = ((px + (sx + 0.5) / SS) / size - 0.5) / scale + 0.5
                    y = ((py + (sy + 0.5) / SS) / size - 0.5) / scale + 0.5
                    if any(inside(x, y, s) for s in SHAPES):
                        hits += 1
            t = hits / (SS * SS)
            row += bytes(round(BG[i] + (ACCENT[i] - BG[i]) * t) for i in range(3))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def main():
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    # maskable ikona má činku menší, aby ji Android neořízl
    for name, size, scale in [
        ("icon-512.png", 512, 1.0),
        ("icon-192.png", 192, 1.0),
        ("apple-touch-icon.png", 180, 1.0),
        ("icon-maskable-512.png", 512, 0.8),
    ]:
        with open(os.path.join(out, name), "wb") as f:
            f.write(render(size, scale))
        print("ok", name)


if __name__ == "__main__":
    main()
