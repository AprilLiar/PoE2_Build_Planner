# PoE Build Planner — Knowledge Base

> **Single source of truth** for architecture, decisions, and implementation state. Read fully before writing any code.

> **AGENT RULE:** Write code only. All product, design, and UX decisions belong to the developer. When any ambiguity exists that this doc doesn't resolve — **stop and ask, never invent**.

---

## 1. Project Overview

| Field | Value |
|---|---|
| App | PoE Build Planner — PoE2 character build manager |
| Platforms | Android (primary), iOS (secondary) |
| Framework | React Native, Expo SDK 54, **bare workflow** |
| Language | TypeScript strict |
| Navigation | Drawer (hamburger top-left) |
| Monetisation | AdMob interstitial gate + Banner TBD + "Remove Ads" IAP |
| Theme | Dark blue, leather texture, gold accents |

---

## 2. Environment (confirmed)

| Field | Value |
|---|---|
| OS | Windows — all commands must be PowerShell/CMD |
| Node.js | v24 |
| Expo SDK | 54 — bare workflow (`/android` folder exists) |
| Dev device | iPhone with Expo Go (`npx expo start` → scan QR) |
| Android testing | EAS builds only (no physical Android device) |
| iOS production | EAS cloud (`eas build --platform ios`) |
| Tests | None — skip all test infrastructure |
| Comments | Beginner dev — comment non-obvious logic inline |

**Expo Go compatibility:** Works while these 3 packages are **never imported** in any JS/TS file:
- `react-native-mmkv` — native only
- `react-native-google-mobile-ads` — native only
- `expo-in-app-purchases` — native only

All three installed but unused until EAS dev build. Safe in Expo Go: all `expo-*`, `@react-navigation/*`, `react-native-reanimated`, `react-native-gesture-handler`, `@gorhom/bottom-sheet`, `react-native-draggable-flatlist`, `react-native-toast-message`, `zustand`, `@shopify/react-native-skia` v2.2.12.

---

## 3. Data Sources

**tree.json** — `assets/data/tree.json`, ~6.5 MB, from `github.com/grindinggear/skilltree-export`
- 4,701 nodes, 8 classes, 21 ascendancy names, patch 0.4
- Top-level: `nodes` (Record<string, TreeNode>), `groups`, `classes`, `min_x/y/max_x/y`, `classesStart`
- Load via `require()` directly (NOT `Asset.loadAsync` — that was old pattern)

**Actual node fields (verified — differs from poewiki docs):**
| Field | Type | Notes |
|---|---|---|
| `skill` | number | unique node ID |
| `name` | string | display name (NOT `dn`) |
| `stats` | string[]? | stat lines (NOT `sd`) |
| `isKeystone` / `isNotable` / `isJewelSocket` | boolean? | node type flags |
| `isMastery` | boolean? | always undefined in patch 0.4 |
| `ascendancyName` | string? | e.g. `"Titan"` (not the class name) |
| `group` / `orbit` / `orbitIndex` | number? | position data |
| `out` / `in` | string[]? | connected node IDs |
| `icon` | string? | asset path |

**gems.json** — `assets/data/gems.json`, curated manually from `poe2db.tw`
- Schema per gem: `{ id: string, name: string, is_support: boolean, tags: string[] }`

**PoE2 API** — no PoE2-specific endpoints yet (May 2026) except tree. OAuth import is future scope.

---

## 4. Tech Stack

| Concern | Package |
|---|---|
| Navigation | `@react-navigation/native` v7, `/drawer` v7, `/native-stack` v7 |
| State | `zustand` v5 |
| Async/server state | `@tanstack/react-query` v5 (installed, future use) |
| Storage | `react-native-mmkv` |
| Canvas | `@shopify/react-native-skia` v2.2.12 |
| Gestures | `react-native-gesture-handler`, `react-native-reanimated` v4 |
| Bottom sheet | `@gorhom/bottom-sheet` v5 |
| File system | `expo-file-system`, `expo-document-picker`, `expo-sharing` |
| Styling | `nativewind` v4 + `tailwindcss` (installed; all styles still use `StyleSheet.create` for now) |
| Ads | `react-native-google-mobile-ads` (AdMob, final stage only) |
| IAP | `expo-in-app-purchases` (final stage only) |
| Fonts | `expo-font` — Cinzel-Regular (headers), Inter-Regular + Inter-Medium (body) |
| Notifications | `react-native-toast-message` |
| Gem reordering | `react-native-draggable-flatlist` |
| iOS ATT | `expo-tracking-transparency` (final stage only) |
| App version | `expo-constants` → `Constants.expoConfig?.version` |

**npm install note:** Use `--legacy-peer-deps` — `eslint-plugin-react-native@4.1.0` has a peer conflict with `eslint@9`.

**Known technical issues:**
- `expo-sharing` — no `app.plugin.js`, do NOT add to `plugins[]` in `app.json`
- `expo-in-app-purchases` — no `app.plugin.js`, do NOT add to `plugins[]`
- `userInterfaceStyle` in `app.json` requires `expo-system-ui` (not installed) — removed; use `backgroundColor` instead
- `react-native-worklets` must stay in `package.json` — Reanimated v4 requires it as peer dep; removing causes `expo start` failure
- iOS prebuild fails on Windows — use `eas build --platform ios` only
- `expo-sharing` no plugin — do not add to `app.json plugins`

---

## 5. Zustand Stores

### `useTreeStore` — `src/store/useTreeStore.ts` (**IMPLEMENTED**)
```typescript
// State
nodes: Record<number, TreeNode>       // 4,701 nodes by skill ID
classes: TreeClass[]                   // 8 classes from tree.json
allocatedNodes: Set<number>            // in-memory; MMKV persistence deferred
nodePositions: Record<number, {x,y}>   // computed world coords
treeBounds: {minX,minY,maxX,maxY,width,height}
adjacency: Record<number, number[]>    // neighbour node IDs
classStartNodes: Record<string, number> // class name → start node ID
selectedClass: string | null
selectedAscendancy: string | null
isLoaded: boolean
isLoading: boolean
error: string | null

// Actions
loadTree(): Promise<void>              // requires() tree.json; guarded against concurrent calls
toggleNode(id: number): void           // adjacency + BFS enforcement when class selected
clearAll(): void
setSelectedClass(name: string|null): void
setSelectedAscendancy(name: string|null): void
```

Exported helpers: `nodeTypePriority(node)`, `nodeTypeLabel(node)`, `nodeTypeBadgeColor(node)`, `nodeRadius(node)`

### `useBuildStore` — `src/store/useBuildStore.ts` (NOT YET BUILT)
```typescript
currentBuild: Build | null
isDirty: boolean
setBuild / updateSkillTree / updateItems / updateGems / markDirty / markClean
```

### `useAppStore` — `src/store/useAppStore.ts` (NOT YET BUILT)
```typescript
adUnlockExpiry: number     // Unix ms; 0 = not unlocked
adsRemoved: boolean
isAdUnlocked(): boolean    // adsRemoved || Date.now() < adUnlockExpiry
setAdUnlockExpiry(ts) / setAdsRemoved(v)
```
Hydrated from MMKV on app start.

### `useGemStore` — `src/store/useGemStore.ts` (NOT YET BUILT)
```typescript
gems: Gem[]
isLoaded: boolean
loadGems(): Promise<void>
```

---

## 6. Build JSON Schema — `src/types/build.ts`

```typescript
interface Build {
  schema_version: number;   // current: 1
  name: string;
  game_version: string;     // e.g. "0.4.0"
  created_at: string;       // ISO 8601
  updated_at: string;
  character: { class: string; ascendancy: string | null; level: number };
  skill_tree: { allocated_nodes: number[]; tree_version: string };
  items: Item[];
  gems: GemLink[];
  notes: string;            // no edit UI in v1; preserved on import/export
}

interface Item {
  slot: ItemSlot;
  name: string;
  base_type: string;
  rarity: 'Normal' | 'Magic' | 'Rare' | 'Unique';
  raw_text: string;
  mods: string[];
}

type ItemSlot = 'Helm'|'Chest'|'Gloves'|'Boots'|'Weapon1'|'Weapon2'|'Offhand1'|'Offhand2'
              | 'Ring1'|'Ring2'|'Amulet'|'Belt'|'Flask1'-'Flask5'|'Charm1'-'Charm3';

interface GemLink { id: string; label: string; gems: SocketedGem[] }
interface SocketedGem { id: string; name: string; level: number; quality: number; is_support: boolean }
```

Schema migration: `src/utils/buildMigration.ts` — check `schema_version` on load, upgrade before use.

---

## 7. MMKV Keys

| Key | Type | Purpose |
|---|---|---|
| `ad_unlock_expiry` | number | Unix ms — 4-hour unlock expiry |
| `ads_removed` | boolean | IAP purchased |
| `ad_consent_given` | boolean | UMP consent completed |
| `last_build_path` | string | Auto-reopen last build on launch |

---

## 8. Navigation Structure

```
RootStackNavigator
├── BuildListScreen        ← entry point; auto-reopens last build if MMKV key exists
└── BuildDrawerNavigator
    ├── SkillTreeScreen
    ├── ItemsScreen
    ├── GemsScreen
    └── SettingsScreen
```

Drawer header shows current build name, class, and level (rendered once in `DrawerNavigator.tsx`).

---

## 9. Screen Specifications

### SkillTreeScreen — IMPLEMENTED (Sprint 5.5)
- Full-screen Skia canvas (`src/components/GraphicalSkillTree.tsx`)
- Pan + pinch-to-zoom via Reanimated shared values; UI-thread only, zero JS bridge
- All 4,701 nodes as circles (type-coloured, filled=allocated); all ~5,630 edges
- Adjacency-enforced allocation: blocked unless neighbour is class start or already allocated
- BFS de-allocation check: blocked if removing node disconnects any allocated node from class start
- No class selected → free toggle
- Camera fly-to class start on class selection (`withSpring`)
- Long-press → `NodeDetailSheet` bottom sheet (`src/components/NodeDetailSheet.tsx`)
- Overlays: ⚙ class picker (top), passive point counter (bottom)
- `ClassPickerModal.tsx` — class + ascendancy selection; backdrop dismiss pattern

### BuildListScreen — NOT YET BUILT
- Entry point; auto-reopens last build via `last_build_path` MMKV
- First launch: onboarding screen (ask developer what to display before implementing)
- Empty state: "Create New Build" + "Import Build" buttons
- Populated: cards sorted by most recently modified; tap = open, long-press = Rename/Duplicate/Delete
- Create modal: name + class picker + level (all required)

### ItemsScreen — NOT YET BUILT
- Slot grid grouped: Armour (Helm/Chest/Gloves/Boots), Weapons, Jewellery, Flasks×5, Charms×3
- Tap empty slot → modal with multi-line paste input → parse → preview → confirm
- Parser (`src/utils/itemParser.ts`): `--------` delimited; line 1=Rarity, line 2=name, line 3=base type, rest=mods
- Tap filled slot → read-only bottom sheet; "Edit" + "Clear Slot" actions
- Rarity colours: Normal `#C8C8C8`, Magic `#8888FF`, Rare `#FFFF77`, Unique `#AF6025`

### GemsScreen — IMPLEMENTED (Sprint 7)
- 1 active gem circle (large) + 5 support slots (smaller) per group; up to 12 groups
- Tap circle → `GemSearchModal` (filtered by active/support); long-press → `GemDetailSheet` (description + Remove)
- Level stepper (−/Lv N/+) per group header, clamps 1–40; only visible when active gem is set
- Sticky requirements bar at top: max(active, support) per stat for Lvl/STR/DEX/INT across all groups
- 845-gem catalog in `assets/data/gems.json` (288 active + 557 support; compiled from PoB Lua files)
- `useGemStore` (`src/store/useGemStore.ts`): `GemCatalogEntry` with `color:1|2|3`, `description`, `levelRequirements`
- Group state in local `useState` — migrate to `useBuildStore` in a future sprint

### SettingsScreen — NOT YET BUILT
- Ads: "Remove Ads" IAP button + "Restore Purchases"
- Privacy: "Reset Ad Consent" (clears MMKV, shows UMP on next ad)
- About: app version, GGG disclaimer ("not affiliated with Grinding Gear Games"), PoE2 link

---

## 10. Save Behaviour

- Every change → `useBuildStore.markDirty()`
- Auto-save: 3-second debounce → `fileService.saveBuild()` → `markClean()` (silent)
- Manual save: Save button in header → immediate save + toast "Build saved"
- Back/leave while `isDirty`: modal "Unsaved Changes" → Save and Leave / Leave Without Saving / Cancel

---

## 11. Ad Gate — Import/Export

- Both buttons always visible and tappable
- On tap: check `isAdUnlocked()` → if true, proceed; if false, show non-skippable interstitial
- On ad close: set 4-hour unlock in MMKV + store, then proceed
- Ad fail: toast "Ad unavailable. Please try again later." — do not unlock
- While loading: full-screen spinner (`LoadingOverlay`) to prevent double-taps
- AdMob setup: **final stage only** — use `TestIds.INTERSTITIAL` / `TestIds.ADAPTIVE_BANNER` throughout development
- IAP `remove_ads` (non-consumable): set `ads_removed=true` in MMKV + store → skip all ad logic forever

---

## 12. UI / Colors

```typescript
// src/constants/colors.ts — IMPLEMENTED; import from here
'poe-bg-deep':    '#0A0E1A'   // screen base
'poe-bg-panel':   '#111827'   // card/modal/drawer bg
'poe-border':     '#1E3A5F'   // borders
'poe-blue':       '#1D4ED8'   // primary buttons
'poe-blue-light': '#3B82F6'   // selected state
'poe-gold':       '#C9A84C'   // highlights, keystones
'poe-text':       '#E2E8F0'   // body text
'poe-text-muted': '#94A3B8'   // secondary text
'poe-danger':     '#DC2626'   // destructive
'poe-success':    '#16A34A'   // success
teal:             '#0D9488'   // ascendancy highlight
```

Typography: Cinzel-Regular 20–24sp (headers), Inter-Medium 15–16sp (buttons), Inter-Regular 14–15sp (body), 12–13sp (muted). Min tap target 44×44pt.

Background: `assets/textures/leather_bg.png` — `ImageBackground resizeMode="repeat"` + `rgba(10,14,26,0.75)` overlay. Wrap every screen in `src/components/ScreenLayout.tsx`.

---

## 13. Graphical Skill Tree — Key Technical Details

**Node position formula (GGG/PoB convention):**
```ts
const angle = n <= 1 ? 0 : (2 * Math.PI * orbitIndex) / n;
x = group.x + Math.sin(angle) * radius;
y = group.y - Math.cos(angle) * radius;
// normalise: subtract minX/minY so all coords ≥ 0
```
- World size ~32,470×33,738; `fitScale ≈ 0.011`
- Pinch zoom range: `fitScale × 0.5` to `fitScale × 500`
- Hit test: 30px tap / 40px long-press threshold, divided by `scale.value` for world coords
- Edges: rendered only where `node.skill < conn.id` (deduplication)
- `visuallyAllocated` set includes class start node for rendering only (doesn't affect BFS/counter)

**Class start node IDs:**
| Class(es) | Node ID | `classesStart` key |
|---|---|---|
| Ranger, Huntress | 50459 | RANGER |
| Warrior | 47175 | MARAUDER |
| Mercenary | 50986 | DUELIST |
| Witch, Sorceress | 54447 | WITCH |
| Druid | 61525 | TEMPLAR |
| Monk | 44683 | SIX |

**Skia rendering (Sprint 5):**
- `@shopify/react-native-skia` v2.2.12 bundled in Expo Go SDK 54 — no native rebuild
- `Group transform={useDerivedValue(...)}` — Skia reads `_isReanimatedSharedValue` flag → redraws on UI thread
- `Skia.Path.Make()` + `addCircle` for nodes; `moveTo/lineTo` for edges
- Nodes: `style="fill"`, 40% opacity unallocated, 100% allocated

**PoE2 tree textures — `assets/poe2/tree/`** (from PoB's `dev/src/TreeData/0_4`, patch 0.4):
- `orbits/` — 90 orbit ring + connection-line textures, 3 themes × 3 states × 10 sizes. `character-orbit-{state}-{0..9}.png` where size `0` is a horizontal connection-line strip (1435×29) and `1..9` are orbit rings from largest (1333×1333) to smallest (91×90)
- `group-bgs/` — 7 decorative circular backgrounds for notable/keystone clusters: `group-background_{W}_{H}.png` for sizes 104, 152, 160, 208, 220, 360, 468 px
- `ascendancy-bgs/` — `ascendancy-background_1500_1500.png` (and 4000×4000 high-res variant) — circular class artwork
- `background/tree-background.png` — 1024×1024 dark noise canvas bg, tile via `ImageShader tx="repeat" ty="repeat"`
- Node-icon library: `assets/poe2/node-icons/Art/2DArt/SkillIcons/passives/{Ascendancy}/...webp` — 540 individual webp icons, addressable by `node.icon` field

**Skia v2.2.12 API:**
- `useImage(require('...'))` → `SkImage | null`
- `<ImageShader image={img} tx="repeat" ty="repeat" fit="none" />` as child of `<Rect>`
- `<Image image={img} x={} y={} width={} height={} opacity={} />`

---

## 14. Key Patterns

**FlatList:** Always `extraData={externalState}` + `renderItem={useCallback(...)}` + stable `ItemSeparatorComponent` defined outside component.

**Header button:**
```ts
useLayoutEffect(() => {
  navigation.setOptions({ headerRight: () => <Button onPress={...} /> });
}, [navigation]);
```

**Modal backdrop dismiss:**
```tsx
<Modal visible transparent animationType="fade" onRequestClose={onClose}>
  <TouchableWithoutFeedback onPress={onClose}>
    <View style={backdrop}>
      <TouchableWithoutFeedback>{/* content — absorbs inner taps */}</TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>
```

**Bottom sheet (v5):** Use `BottomSheetModal` (not `BottomSheet`); needs `BottomSheetModalProvider` in `App.tsx`; `useRef<BottomSheetModal>(null)`; snap points `['50%', '85%']`.

**`ascendancyName` reminder:** Node field is the ascendancy name (e.g. `"Titan"`), not the class (`"Warrior"`). Build a `Set` from selected class's ascendancy names via `classes` array.

---

## 15. Folder Structure

```
src/
├── navigation/
│   ├── RootStackNavigator.tsx
│   └── DrawerNavigator.tsx
├── screens/
│   ├── BuildListScreen/
│   ├── SkillTreeScreen/
│   ├── ItemsScreen/
│   ├── GemsScreen/
│   └── SettingsScreen/
├── components/
│   ├── GraphicalSkillTree.tsx   ← IMPLEMENTED (Skia canvas)
│   ├── NodeDetailSheet.tsx      ← IMPLEMENTED
│   ├── ClassPickerModal.tsx     ← IMPLEMENTED
│   ├── ScreenLayout.tsx
│   ├── AdBanner.tsx             ← built, placement TBD
│   ├── ErrorScreen.tsx
│   ├── PoeButton.tsx
│   └── LoadingOverlay.tsx
├── store/
│   ├── useTreeStore.ts          ← IMPLEMENTED
│   ├── useBuildStore.ts         ← NOT BUILT
│   ├── useAppStore.ts           ← NOT BUILT
│   └── useGemStore.ts           ← NOT BUILT
├── services/
│   ├── fileService.ts           ← NOT BUILT (saveBuild, exportBuild, importBuild, listBuilds, deleteBuild)
│   ├── adService.ts             ← NOT BUILT (requireAdUnlock)
│   └── iapService.ts            ← NOT BUILT
├── types/build.ts
├── constants/colors.ts          ← IMPLEMENTED
└── utils/
    ├── treeLayout.ts            ← IMPLEMENTED (position calc, canAllocate, canDeallocate)
    ├── buildMigration.ts
    ├── itemParser.ts
    └── debounce.ts

assets/
├── data/tree.json               ← DONE (GGG patch 0.4, 4,701 nodes)
├── data/gems.json               ← DONE (444 gems: 226 active + 218 support; fields: id, name, is_support, icon, tags)
├── poe2/
│   ├── classes/                 ← DONE — 8 class illustrations (warrior/ranger/etc.baseillustration.webp)
│   ├── node-icons/              ← DONE — 540 passive node icons preserving art path (Art/2DArt/SkillIcons/passives/…)
│   └── skill-gems/              ← DONE — 225 active gem icons (flat) + 223 support gem icons (/support/ subfolder)
├── fonts/ (Cinzel-Regular, Inter-Regular, Inter-Medium) ← NOT ADDED
├── textures/leather_bg.png      ← NOT ADDED
└── (GGG skill tree images — frame-*.png, background-*.png, group-background-*.png, skills-*.jpg etc.)
```

---

## 16. Error Handling

- **Critical** (full-screen `ErrorScreen.tsx` + Retry): tree.json/gems.json fail to load; corrupt build file
- **Non-critical** (toast): ad failure, export failure, item parse failure
- Item parse fail: inline error in modal — do not close modal

---

## 17. Implementation State (updated each session)

### PoE2 Classes (from tree.json patch 0.4)
8 classes: Ranger, Huntress, Warrior, Mercenary, Druid, Witch, Sorceress, Monk
Load from `tree.json classes` array — do NOT hardcode in a separate file.
Ascendancies (21 total, verified against tree.json patch 0.4):
- Ranger: Deadeye, Pathfinder
- Huntress: Amazon, Ritualist
- Warrior: Titan, Warbringer, Smith of Kitava
- Mercenary: Tactician, Witchhunter, Gemling Legionnaire
- Druid: Oracle, Shaman
- Witch: Infernalist, Blood Mage, Lich, Abyssal Lich
- Sorceress: Stormweaver, Chronomancer, Disciple of Varashta
- Monk: Invoker, Acolyte of Chayula

### Sprint 6.5 — Search overhaul + anchor nodes + web compat + asset library (complete)
**Shipped:**
- Node search replaced with pulsing golden glow on matching tree nodes
- Persistent filter chips (SearchFilterOverlay) with AND/OR connectives between them; each chip removable via X
- Filter button (≡) replaces search icon; gold/active when filters applied — matches Σ stats button style
- Anchor nodes (no stats, no special type) now invisible and BFS-transparent — real nodes linked through them
- `fileService.ts` rewritten with platform branch: localStorage on web, expo-file-system on native
- PoE2 asset library downloaded from poe2db.tw CDN (requires `Referer: https://poe2db.tw/` header)

**Assets added:**
- `assets/data/gems.json` — 444 gems (226 active skill gems + 218 support gems); schema: `{id, name, is_support, icon, tags}`
- `assets/poe2/classes/*.webp` — 8 class illustrations
- `assets/poe2/node-icons/` — 540 passive node icons (preserving art path structure from tree.json `icon` field)
- `assets/poe2/skill-gems/*.webp` — 225 active skill gem icons (named by gem name)
- `assets/poe2/skill-gems/support/*.webp` — 223 support gem icons (named by CDN filename)

**CDN URL patterns (all require `Referer: https://poe2db.tw/`):**
- Class art: `https://cdn.poe2db.tw/image/art/2dart/baseclassillustrations/{class}baseillustration.webp`
- Passive icons: `https://cdn.poe2db.tw/image/{icon_path_from_tree_json}.webp` (replace .dds extension)
- Active skill gems: `https://cdn.poe2db.tw/image/Art/2DArt/SkillIcons/{filename}.webp`
- Support gems: `https://cdn.poe2db.tw/image/art/2dart/skillicons/support/{filename}.webp`

**Node icon usage:** `node.icon` in tree.json gives the relative art path. To use locally:
`require('../../assets/poe2/node-icons/' + node.icon.replace('.dds', '.webp'))`
(Dynamic requires don't work in Metro — pre-build a static map at load time or use a URI-based approach.)

### Sprint 6 — BuildListScreen (complete)
**Shipped:** Full build list flow — create, list, open, rename, duplicate, delete. File persistence via `expo-file-system` (Expo Go safe). No MMKV.

**Files created:**
- `src/types/build.ts` — Build, Item, ItemSlot, GemLink, SocketedGem interfaces
- `src/store/useBuildStore.ts` — Zustand v5: currentBuild, currentBuildPath, isDirty, setBuild, updateSkillTree/Items/Gems, markDirty/Clean, clearBuild
- `src/services/fileService.ts` — listBuilds, saveBuild, deleteBuild, renameBuild, duplicateBuild (all using expo-file-system, builds stored in `documentDirectory/builds/{uuid}.json`)
- `src/navigation/RootStackNavigator.tsx` — Stack: BuildList → BuildDrawer
- `src/screens/BuildListScreen.tsx` — FlatList of build cards, FAB, CreateBuildModal (name + class chips + level), long-press → Rename/Duplicate/Delete
- `src/screens/SettingsScreen.tsx` — placeholder

**Files modified:**
- `src/App.tsx` — root changed from DrawerNavigator to RootStackNavigator
- `src/navigation/DrawerNavigator.tsx` — custom drawer content with build header + "← Build List" link; added Settings screen
- `src/navigation/navigationRef.ts` — re-typed to RootStackParamList
- `src/components/FloatingMenuButton.tsx` — hidden on BuildListScreen; navigation changed to `DrawerActions.jumpTo(screen)`

**Key decisions:**
- `Alert.prompt` used for rename (iOS only; Android would need a custom TextInput modal)
- Auto-reopen last build deferred (needs MMKV)
- Onboarding deferred (design decision needed from developer)

#### Sprint 5 — Graphical Tree Phase 2 (complete)
**Shipped:** Viewport culling with spatial index, minimap overlay, and search → pan-to-node.

**Files created/modified:**
| File | Change | Purpose |
|---|---|---|
| `src/utils/treeLayout.ts` | Modified | Added `SpatialGrid` type, `buildSpatialGrid(positions, cellSize=500)`, `queryVisibleNodes(grid, minX, minY, maxX, maxY)` |
| `src/store/useTreeStore.ts` | Modified | Added `spatialGrid: SpatialGrid | null` (built in `loadTree()`); added `flyToNodeId: number | null` + `setFlyToNodeId` action for search-triggered camera animation |
| `src/components/GraphicalSkillTree.tsx` | Modified | Viewport state tracked on gesture end + initial load (25% padding); `visibleNodeIds` filters edges + nodes via spatial grid; minimap panel with `AnimatedRect` viewport indicator (UI-thread); `useEffect` watches `flyToNodeId` and spring-animates camera |
| `src/components/NodeSearchModal.tsx` | Created | Modal with text input + FlatList of results (keystones first, capped at 30); tap → `setFlyToNodeId` + close |
| `src/screens/SkillTreeScreen.tsx` | Modified | Added 🔍 button (right side of top overlay); selection chip moved into `topMiddle` flex container; renders `NodeSearchModal` |

**Key technical decisions:**
- **Spatial grid**: 500 world-unit cells over the ~33,000×33,000 world → 66×66 = 4,356 cells, avg ~1.1 nodes/cell. Viewport query is O(cells_in_viewport). At ×10 zoom, ~96% of nodes are skipped.
- **Viewport update frequency**: Only on gesture end (`onEnd` callbacks) + initial load. 25% world-unit padding pre-renders nodes just off-screen to hide pop-in during short pans.
- **Fly-to**: Pre-sets culling viewport to the target camera position before spring starts, so the target node is in the render set immediately.
- **Minimap**: `AnimatedRect` created via `Animated.createAnimatedComponent(Rect)` from react-native-svg. `useAnimatedProps` worklet reads `panX/Y/scale` shared values → world-coordinate rect `{x, y, width, height}`; SVG `viewBox` set to tree bounds so coordinates are in world units, SVG handles the pixel scaling. `strokeWidth={500}` world units ≈ 1.5–2 px at minimap scale.
- **Minimap dots**: Static memoized circles (no allocation state) — keystones r=180wu, notables r=130wu, normal r=80wu — re-render only when `nodes`/`nodePositions` change (i.e., never after load).
- **Search modal**: Follows the established `TouchableWithoutFeedback` backdrop-dismiss pattern from `ClassPickerModal`.
- **Top overlay layout restructure**: `[⚙] [topMiddle flex:1] [🔍]` — selection chip sits inside `topMiddle` so it doesn't push the search button off-screen.

#### Sprint 6 — Gems Screen (complete)
**Shipped:** Full gems screen with PoBstyle layout: active gem (large circle) + 5 support slots (smaller circles) per group, up to 12 groups, per-group level stepper, sticky requirements bar, gem search modal, gem detail bottom sheet.

**Files created/modified:**
| File | Change | Purpose |
|---|---|---|
| `assets/data/gems.json` | Created | 845 gem entries (288 active + 557 support) compiled from 6 PoB Lua files; 397 KB |
| `src/store/useGemStore.ts` | Created | `GemCatalogEntry` interface, Zustand store, `getLevelReq`, `getAttrRequirement`, `gemColorHex`, `gemColorBg`, `gemColorLabel`, `gemAbbrev` helpers |
| `src/components/GemSearchModal.tsx` | Created | Modal with text input; filters by `is_support`, name query; max 40 results; color dot + STR/DEX/INT badge per row |
| `src/components/GemDetailSheet.tsx` | Created | `BottomSheetModal` snap `['55%', '85%']`; colored left bar, gem name, type/attr badge, level req, description, "Remove Gem" button |
| `src/screens/GemsScreen.tsx` | Rewritten | Full layout: `GemCircle` sub-component, `ReqBar`, `GemGroup` state, active/support search flow, detail sheet, group add/remove |

**Gems data facts (from PoB Lua files, patch May 2026):**
- 845 total entries: 288 active gems (98 STR, 134 INT, 56 DEX) + 557 support gems (210 STR, 185 INT, 162 DEX)
- All active gems: `levelReq: 0` at L1, `levelReq: 90` at L20 — uniform 0→90 curve
- All support gems: single `{gemLevel: 1, levelReq: 0}` entry (PoB stores support level reqs separately)
- 9 support gems lack the `Support` ID prefix but are correctly tagged `is_support: true`
- `gems.json` schema: `{ "gems": GemCatalogEntry[] }` — loaded via `require()` in `loadGems()`

**Key design decisions:**
- Tap gem circle → opens `GemSearchModal` (fills that slot)
- Long-press gem circle → opens `GemDetailSheet` (view + remove)
- Level stepper (`−` / `Lv N` / `+`) in group header row; only visible when active gem is set; clamps 1–40
- Requirements bar: accumulates `max(levelReq)` for level, sums attr requirements across all groups; shows `max(active, support)` per stat
- Attribute requirements derived at runtime: `Math.floor(levelReq * 0.6)` for the gem's matching color
- Group state lives locally in `GemsScreen` with `useState` — to migrate to `useBuildStore` in a future sprint
- Empty circles show "+" with muted styling; filled circles show 4-char abbrev in gem's color

### Sprint Backlog
- ✅ Sprint 1: Drawer nav + node FlatList
- ✅ Sprint 2: Zustand store, search, allocate/deallocate, NodeDetailSheet, point counter
- ✅ Sprint 2R: Code quality (colors.ts, FlatList extraData, stable callbacks)
- ✅ Sprint 3: ClassPickerModal, selectedClass/Ascendancy in store
- ✅ Sprint 4: Graphical SVG tree → Skia canvas, treeLayout.ts, adjacency/BFS
- ✅ Sprint 5: Skia GPU rendering (replaced SVG)
- ✅ Sprint 5.5: GGG texture integration (tiled bg, group rings, node frames)
- ✅ Sprint 6: `useBuildStore` + `fileService` + `BuildListScreen` (create, list, open, rename, duplicate, delete)
- ✅ **Sprint 6.5:** Search overhaul (pulsing glow, persistent filter chips), anchor node hiding, web compat, PoE2 asset library
- ⬜ **Next:** Node icons in tree (show icon inside node at high zoom), or ItemsScreen
- ⬜ Fix Abyssal Lich ascendancy (no nodes visible in tree — reported but not yet investigated)
- ⬜ ItemsScreen (slot grid + paste parser)
- ✅ GemsScreen — IMPLEMENTED (Sprint 7): PoB-style circles, search modal, level stepper, requirements bar, 845-gem catalog
- ⬜ SettingsScreen (needs redesign: add "← Build List" nav, remove placeholder, add relevant settings)
- ⬜ Fonts (Cinzel + Inter)
- ⬜ Leather texture background
- ⬜ Ad gate (AdMob interstitial)
- ⬜ IAP ("Remove Ads")
- ⬜ Onboarding

---

*Last updated: 2026-05-24*
