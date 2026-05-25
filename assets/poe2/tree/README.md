## PoE2 Skill Tree Visual Assets

Source: `PathOfBuildingCommunity/PathOfBuilding-PoE2` repo, branch `dev`, path `src/TreeData/0_4` (patch 0.4 — current).

`.dds.zst` files were decompressed with zstd then decoded via Python `texture2ddecoder` (BC7, BC1) or raw RGBA buffer copy → PNG via Pillow. PNG orbit files copied verbatim and renamed to `lowercase-with-dashes`.

Some `.dds.zst` files are **DX10 texture arrays** (multiple slices in one file) — these are saved as **vertical column atlas PNGs** suffixed `-atlas.png`, with each slice stacked from top (slice 0) down. To use a single slice in code, crop the source rect `(0, slice_index * h, w, h)`.

### Folder layout

| Folder | Count | Slices | Description |
|---|---|---|---|
| `orbits/` | 90 | 1 each | Orbit ring + connection-line textures. 3 themes × 3 states × 10 sizes (size 0 = line strip, 1–9 = rings) |
| `group-bgs/` | 7 | 1 each | Decorative circular backgrounds for node clusters. Sizes 104–468 px |
| `ascendancy-bgs/` | 2 | 1 each | Large circular class artwork (1500 px + 4000 px high-res) |
| `background/` | 1 | 1 | 1024×1024 dark noise canvas bg, tile via `ImageShader` |
| `node-frames/` | 4 | mixed | PoE2 passive node frame textures, allocated state |
| `node-frames-disabled/` | 4 | mixed | Same frames, desaturated for unallocated state |
| `jewel-sockets/` | 1 | 16 | Jewel socket frame variants (blue sapphire-style ring) |
| `mastery/` | 1 | 10 | Mastery activation glow — 10 evenly-spaced keyframes at half-res (388×384). Source was 60 frames × 776×768 = 21 MB; reduced to ~1.2 MB. Use linear interpolation between keyframes for smooth animation |
| `legion/` | 4 | mixed | Timeless Jewel / Legion expansion frames (future scope) |
| `misc/` | 1 | 6 | Monster category icons (used by Legion jewel mods) |
| `oils/` | 10 | 1 each | Anoint oil sprites (`oil-0.png` through `oil-9.png`). For amulet anoint feature (future scope) |

### Detailed slice counts for atlases

| File | Width × Height | Slices | Per-slice size |
|---|---|---|---|
| `node-frames/skills_64_64-atlas.png` | 64 × 10560 | 165 | 64×64 |
| `node-frames/skills_128_128-atlas.png` | 128 × 42112 | 329 | 128×128 |
| `node-frames/skills_172_172.png` | 172 × 172 | 1 | — |
| `node-frames/skills_176_176.png` | 176 × 176 | 1 | — |
| `node-frames-disabled/skills-disabled_64_64-atlas.png` | 64 × 10560 | 165 | 64×64 |
| `node-frames-disabled/skills-disabled_128_128-atlas.png` | 128 × 42112 | 329 | 128×128 |
| `node-frames-disabled/skills-disabled_172_172.png` | 172 × 172 | 1 | — |
| `node-frames-disabled/skills-disabled_176_176.png` | 176 × 176 | 1 | — |
| `jewel-sockets/jewel-sockets_152_156-atlas.png` | 152 × 2496 | 16 | 152×156 |
| `mastery/mastery-active-effect-10frames-388-atlas.png` | 388 × 3840 | 10 | 388×384 |
| `legion/legion_64_64-atlas.png` | 64 × 320 | 5 | 64×64 |
| `legion/legion_128_128-atlas.png` | 128 × 4992 | 39 | 128×128 |
| `legion/legion_564_564-atlas.png` | 564 × 6768 | 12 | 564×564 |
| `legion/legion_1024_1024.png` | 1024 × 1024 | 1 | — |
| `misc/monster-categories_36_36-atlas.png` | 36 × 216 | 6 | 36×36 |

### Skipped on purpose

- `src/TreeData/0_1/`, `0_2/`, `0_3/` — Historical patch snapshots PoB keeps so it can render builds saved against older PoE2 patches. Different group-bg sizes (e.g. 0_1 has 124×124, 140×140, 280×276) reflect resizes GGG made between patches. Our app targets the current patch only, so these add no value.
- `src/TreeData/legion/` — 3 files (`skills-additional-3.jpg`, `skills-additional-disabled-3.jpg`, `tree-legion.lua`). The `.jpg` extension is PoE1's sprite-atlas format — appears to be PoE1 cruft accidentally checked into the PoE2 repo.
- `src/TreeData/0_4/tree.json` / `tree.lua` — we already have our own `assets/data/tree.json` from `grindinggear/skilltree-export`.

### Not yet wired up

These assets are present but `GraphicalSkillTree.tsx` still renders pure Skia shapes. Integration is a follow-up sprint — needs `@shopify/react-native-skia`'s `useImage` + `Image` for textured rings, edges, group backgrounds, node frames, and (eventually) the mastery activation animation.
