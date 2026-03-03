#!/usr/bin/env python3
"""
bin2ota.py — Convert Arduino .bin firmware to .ota format
for the Arduino UNO R4 WiFi (Renesas RA4M1).

The .ota format wraps LZSS-compressed firmware with a 12-byte header
containing the compressed length, CRC32, and board magic number.
The ESP32-S3 co-processor uses this to flash the RA4M1.

Usage:
    python tools/bin2ota.py  <input.bin>  <output.ota>

Example:
    python tools/bin2ota.py  build/gate_controller.bin  build/gate_controller.ota
"""

import struct
import sys
import zlib

# ── Board-specific magic number ───────────────────────────────────────
# Must match ARDUINO_RA4M1_OTA_MAGIC in the ESP32-S3 bridge firmware.
MAGIC = 0x23411002

# ── LZSS parameters (match Arduino's LZSSDecoder in Arduino_ESP32_OTA)
EI = 11                     # position bit width
EJ = 4                      # length bit width
N = 1 << EI                 # ring buffer size  = 2048
F = (1 << EJ) + 1           # max match length  = 17
THRESHOLD = 2               # min match length


# ── Bit writer (MSB-first packing) ───────────────────────────────────
class BitWriter:
    """Accumulates individual bits and packs them MSB-first into bytes."""

    def __init__(self):
        self._buf = 0
        self._count = 0
        self._out = bytearray()

    def write(self, value: int, width: int):
        """Write *width* bits of *value*, MSB first."""
        for i in range(width - 1, -1, -1):
            self._buf = (self._buf << 1) | ((value >> i) & 1)
            self._count += 1
            if self._count == 8:
                self._out.append(self._buf)
                self._buf = 0
                self._count = 0

    def flush(self) -> bytes:
        """Pad any remaining bits with zeros and return the byte string."""
        if self._count > 0:
            self._out.append(self._buf << (8 - self._count))
            self._buf = 0
            self._count = 0
        return bytes(self._out)


# ── LZSS encoder ─────────────────────────────────────────────────────
def lzss_encode(data: bytes) -> bytes:
    """
    LZSS-compress *data* using Arduino's parameters.

    Encoding format (pure bitstream, MSB-first):
      flag=1  → literal : 8-bit byte value
      flag=0  → match   : EI-bit ring position + EJ-bit (length − THRESHOLD)
    """
    ring = bytearray(N)          # ring buffer, zero-initialised
    r = N - F                    # initial write cursor

    # Index: byte_value → set of ring-buffer positions holding that value.
    idx = [set() for _ in range(256)]
    for i in range(N):
        idx[0].add(i)            # ring starts as all-zeros

    writer = BitWriter()
    pos = 0
    total = len(data)

    while pos < total:
        # Progress feedback
        if pos % 8192 == 0:
            print(f"\r  Compressing … {pos * 100 // total:3d}%", end="", flush=True)

        remaining = min(F, total - pos)
        first = data[pos]

        best_len = 0
        best_pos = 0

        # Only examine ring positions whose first byte already matches
        for s in idx[first]:
            k = 1
            while k < remaining and ring[(s + k) % N] == data[pos + k]:
                k += 1
            if k > best_len:
                best_len = k
                best_pos = s
                if k >= F:
                    break              # can't improve further

        if best_len >= THRESHOLD:
            # ── Match ─────────────────────────────────────
            writer.write(0, 1)                          # flag
            writer.write(best_pos, EI)                  # position
            writer.write(best_len - THRESHOLD, EJ)      # length

            for k in range(best_len):
                old = ring[r]
                new = data[pos + k]
                ring[r] = new
                idx[old].discard(r)
                idx[new].add(r)
                r = (r + 1) % N
            pos += best_len
        else:
            # ── Literal ───────────────────────────────────
            writer.write(1, 1)                          # flag
            writer.write(first, 8)                      # byte

            old = ring[r]
            ring[r] = first
            idx[old].discard(r)
            idx[first].add(r)
            r = (r + 1) % N
            pos += 1

    print("\r  Compressing … 100%")
    return writer.flush()


# ── Main conversion ──────────────────────────────────────────────────
def bin2ota(bin_path: str, ota_path: str):
    with open(bin_path, "rb") as f:
        firmware = f.read()

    size_kb = len(firmware) / 1024
    print(f"  Input : {bin_path}  ({len(firmware)} bytes / {size_kb:.1f} KB)")

    # 1. LZSS compress
    compressed = lzss_encode(firmware)

    # 2. CRC-32 of the compressed payload
    crc = zlib.crc32(compressed) & 0xFFFFFFFF

    # 3. Build 12-byte header  (all little-endian uint32)
    header = struct.pack("<III", len(compressed), crc, MAGIC)

    # 4. Write file
    with open(ota_path, "wb") as f:
        f.write(header)
        f.write(compressed)

    out_size = len(header) + len(compressed)
    ratio = out_size * 100 / len(firmware) if firmware else 0
    print(f"  Output: {ota_path}  ({out_size} bytes / {ratio:.1f}% of original)")
    print("  Done.")


# ── CLI entry point ──────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: python {sys.argv[0]} <input.bin> <output.ota>")
        print()
        print("Convert a compiled Arduino .bin firmware file to the .ota format")
        print("required by the UNO R4 WiFi's OTA update mechanism.")
        print()
        print("To get the .bin file:")
        print("  Arduino IDE → Sketch → Export Compiled Binary")
        sys.exit(1)

    bin2ota(sys.argv[1], sys.argv[2])
