## PoE2 Skill Tree Visual Assets

Source: `PathOfBuildingCommunity/PathOfBuilding-PoE2` repo, branch `dev`, path `src/TreeData/0_4` (patch 0.4).

`.dds.zst` files were decompressed with zstd then BC7-decoded via `texture2ddecoder` → PNG. PNG files copied verbatim and renamed to `lowercase-with-dashes` for React Native imports.

### Folder layout

| Folder | Count | Description |
|---|---|---|
| `orbits/` | 90 | Orbit ring + connection-line textures. 3 themes × 3 states × 10 size indices |
| `group-bgs/` | 7 | Decorative circular backgrounds drawn under groups of nodes (notable clusters, keystones) |
| `ascendancy-bgs/` | 2 | Large round backgrounds for the ascendancy section (class artwork) |
| `background/` | 1 | Dark noise texture for the overall tree page background |

### Orbit naming

`{theme}-orbit-{state}-{size}.png`

- **theme**: `character` (base tree) · `ascendancy` (ascendancy rings) · `planned` (preview state)
- **state**: `normal` (unallocated, dark) · `intermediate` (allocated, gold thin) · `intermediate-active` (allocated active, gold thick glow)
- **size**: `0` = straight horizontal connection-line strip (1435×29); `1`–`9` = orbit rings from largest (1333×1333) to smallest (91×90)

### Group-bg naming

`group-background_{W}_{H}.png` — width/height in pixels matches PoE2's authored sizes (104, 152, 160, 208, 220, 360, 468). Pick by group radius.

### Ascendancy-bg

`ascendancy-background_1500_1500.png` (2.4 MB) — high quality for in-app use.
`ascendancy-background_4000_4000.png` (3.9 MB) — extreme zoom; consider dropping if bundle size becomes a concern.

### Not yet wired up

These assets are present but `GraphicalSkillTree.tsx` still renders pure Skia shapes. Integration is a follow-up sprint — needs `@shopify/react-native-skia`'s `useImage` + `Image` component for textured rings, edges, and group backgrounds.
