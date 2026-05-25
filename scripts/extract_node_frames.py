"""
extract_node_frames.py
======================
Re-extracts PoE2 passive skill node frame images from the Path of Building
Community PoE2 repo DDS texture arrays.

Background
----------
Node frames (PSSkillFrame, NotableFrameAllocated, KeystoneFrameAllocated, etc.)
are co-packed into the same DDS texture arrays as the group background circles.
Our Sprint 6.5 extraction only saved slice 0 (the circular background) from each
file. This script re-extracts the specific frame slices we need.

Source slice mapping (confirmed from PoB tree.lua ddsCoords table):
  group-background_104_104_BC7.dds.zst:
    PSSkillFrameActive=4, PSSkillFrameHighlighted=5, PSSkillFrame=6

  group-background_152_156_BC7.dds.zst:
    NotableFrameAllocated=10, NotableFrameCanAllocate=11, NotableFrameUnallocated=12
    JewelFrameAllocated=13,   JewelFrameCanAllocate=14,   JewelFrameUnallocated=15

  group-background_220_224_BC7.dds.zst:
    KeystoneFrameAllocated=1, KeystoneFrameCanAllocate=2, KeystoneFrameUnallocated=3

Prerequisites
-------------
    pip install Pillow zstandard texture2ddecoder

PoB repo required (clone it first):
    git clone https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2
    cd PathOfBuilding-PoE2 && git checkout dev

Usage
-----
    python scripts/extract_node_frames.py --pob-path "C:/path/to/PathOfBuilding-PoE2"

Output
------
Assets are written to assets/poe2/tree/node-frames-extracted/ with names like:
    normal-allocated.png          (PSSkillFrameActive)
    normal-hover.png              (PSSkillFrameHighlighted)
    normal-unallocated.png        (PSSkillFrame)
    notable-allocated.png
    notable-hover.png
    notable-unallocated.png
    jewel-allocated.png
    jewel-hover.png
    jewel-unallocated.png
    keystone-allocated.png
    keystone-hover.png
    keystone-unallocated.png
"""

import argparse
import os
import struct
import sys
from pathlib import Path

try:
    import zstandard as zstd
    from PIL import Image
    import texture2ddecoder as t2d
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Run: pip install Pillow zstandard texture2ddecoder")
    sys.exit(1)

# Slice extraction table: (dds_filename, slice_index, output_name, slice_w, slice_h)
EXTRACTIONS = [
    # Normal passive frames — co-packed in 104×104 file
    ("group-background_104_104_BC7.dds.zst", 4, "normal-allocated",   104, 104),
    ("group-background_104_104_BC7.dds.zst", 5, "normal-hover",       104, 104),
    ("group-background_104_104_BC7.dds.zst", 6, "normal-unallocated", 104, 104),
    # Notable frames — co-packed in 152×156 file
    ("group-background_152_156_BC7.dds.zst", 10, "notable-allocated",   152, 156),
    ("group-background_152_156_BC7.dds.zst", 11, "notable-hover",       152, 156),
    ("group-background_152_156_BC7.dds.zst", 12, "notable-unallocated", 152, 156),
    # Jewel socket frames — also in 152×156 file
    ("group-background_152_156_BC7.dds.zst", 13, "jewel-allocated",     152, 156),
    ("group-background_152_156_BC7.dds.zst", 14, "jewel-hover",         152, 156),
    ("group-background_152_156_BC7.dds.zst", 15, "jewel-unallocated",   152, 156),
    # Keystone frames — co-packed in 220×224 file
    ("group-background_220_224_BC7.dds.zst", 1, "keystone-allocated",   220, 224),
    ("group-background_220_224_BC7.dds.zst", 2, "keystone-hover",       220, 224),
    ("group-background_220_224_BC7.dds.zst", 3, "keystone-unallocated", 220, 224),
]

DDS_HEADER_SIZE = 128  # DDS base header (magic + DDSURFACEDESC2)
DDS10_HEADER_SIZE = 20  # DX10 extended header


def decompress_zst(zst_path: Path) -> bytes:
    with open(zst_path, "rb") as f:
        ctx = zstd.ZstdDecompressor()
        return ctx.decompress(f.read(), max_length=200 * 1024 * 1024)


def parse_dds_header(data: bytes):
    """Return (width, height, format_code, array_size, bytes_per_block, block_w)."""
    magic = data[:4]
    if magic != b"DDS ":
        raise ValueError("Not a DDS file")

    # DDSURFACEDESC2 is 124 bytes starting at offset 4
    height = struct.unpack_from("<I", data, 12)[0]
    width  = struct.unpack_from("<I", data, 16)[0]

    # pixelformat fourCC at offset 84
    fourcc = data[84:88]
    if fourcc == b"DX10":
        dxgi_format = struct.unpack_from("<I", data, 128)[0]
        array_size  = struct.unpack_from("<I", data, 140)[0]
        pixel_start = DDS_HEADER_SIZE + DDS10_HEADER_SIZE
    else:
        dxgi_format = 0
        array_size  = 1
        pixel_start = DDS_HEADER_SIZE

    return width, height, dxgi_format, array_size, pixel_start


def decode_bc7_slice(data: bytes, width: int, height: int) -> Image.Image:
    """Decode a single BC7-compressed slice → RGBA PIL Image."""
    raw_rgba = t2d.decode_bc7(data, width, height)
    return Image.frombytes("RGBA", (width, height), raw_rgba)


def decode_bc1_slice(data: bytes, width: int, height: int) -> Image.Image:
    raw_rgba = t2d.decode_bc1(data, width, height)
    return Image.frombytes("RGBA", (width, height), raw_rgba)


def bytes_per_slice(width: int, height: int, dxgi_format: int) -> int:
    # BC7 (DXGI 98) and BC1 (DXGI 71): 4×4 blocks, 16 bytes/block for BC7, 8 for BC1
    block_size = 16 if dxgi_format == 98 else 8
    blocks_w = (width + 3) // 4
    blocks_h = (height + 3) // 4
    return blocks_w * blocks_h * block_size


def extract_slice(raw_dds: bytes, slice_index: int, width: int, height: int) -> Image.Image:
    w, h, dxgi_format, array_size, pixel_start = parse_dds_header(raw_dds)
    stride = bytes_per_slice(w, h, dxgi_format)
    offset = pixel_start + slice_index * stride
    slice_data = raw_dds[offset: offset + stride]
    if dxgi_format == 98:
        return decode_bc7_slice(slice_data, w, h)
    elif dxgi_format == 71:
        return decode_bc1_slice(slice_data, w, h)
    else:
        raise ValueError(f"Unsupported DXGI format {dxgi_format} — add handler if needed")


def main():
    parser = argparse.ArgumentParser(description="Extract PoE2 node frame PNGs from PoB DDS files")
    parser.add_argument("--pob-path", required=True, help="Path to PathOfBuilding-PoE2 repo root")
    args = parser.parse_args()

    pob_root = Path(args.pob_path)
    dds_dir  = pob_root / "src" / "TreeData" / "0_4"
    out_dir  = Path(__file__).parent.parent / "assets" / "poe2" / "tree" / "node-frames-extracted"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Cache decompressed DDS bytes so each file is only decompressed once
    cache: dict[str, bytes] = {}

    for dds_name, slice_idx, out_name, expected_w, expected_h in EXTRACTIONS:
        zst_path = dds_dir / dds_name
        if not zst_path.exists():
            print(f"  MISSING  {zst_path}")
            continue

        if dds_name not in cache:
            print(f"  Decompressing {dds_name} …")
            cache[dds_name] = decompress_zst(zst_path)

        raw = cache[dds_name]
        print(f"  Extracting slice {slice_idx:3d} → {out_name}.png")
        try:
            img = extract_slice(raw, slice_idx, expected_w, expected_h)
            out_path = out_dir / f"{out_name}.png"
            img.save(out_path, "PNG")
            print(f"             saved {out_path.name} ({img.width}×{img.height})")
        except Exception as exc:
            print(f"  ERROR: {exc}")

    print(f"\nDone. Files written to: {out_dir}")
    print("\nNext step: move/copy these PNGs into assets/poe2/tree/node-frames/")
    print("Then update GraphicalSkillTree.tsx to load them via useImage() and")
    print("render them as <SkiaImage> overlaid on each node circle.")


if __name__ == "__main__":
    main()
