# PoE2 Build Planner — Agent Knowledge Base

> **READ THIS FIRST on every session, before any code changes.**
> This file is the single source of truth for project architecture, conventions, and gotchas.
> Update it whenever you add a new screen, component, store slice, or data shape.

---

## Expo Version

This project uses **Expo SDK 54** (`expo: ~54.0.0`) and **React Native 0.81.5**.

Before writing any code that touches Expo APIs, read the exact versioned docs:
https://docs.expo.dev/versions/v54.0.0/

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | Expo SDK 54 / React Native 0.81.5 |
| Navigation | React Navigation v7 — Drawer (`@react-navigation/drawer`) |
| State | Zustand v5 (`zustand`) |
| Bottom sheets | `@gorhom/bottom-sheet` v5 |
| File I/O | `expo-asset` + `expo-file-system` |
| Styling | `StyleSheet` (inline) — no Tailwind/NativeWind in screens yet |
| TypeScript | `~5.9.2` — strict mode, `noEmit` check must pass |

---

## Project Structure

```
src/
  screens/
    SkillTreeScreen.tsx   — passive tree list view (main screen)
    ItemsScreen.tsx       — placeholder
    GemsScreen.tsx        — placeholder
  components/
    NodeDetailSheet.tsx   — bottom sheet showing full node stats
    ClassPickerModal.tsx  — modal for selecting class & ascendancy
  store/
    useTreeStore.ts       — Zustand store: nodes, classes, allocation, class/asc selection
  navigation/
    DrawerNavigator.tsx   — Drawer with Skill Tree / Items / Gems
  constants/
    colors.ts             — COLORS object (single source of truth for theme)
assets/
  data/
    tree.json             — 1.5 MB bundled passive tree data (4,701 nodes)
scripts/
  convert_tree.js         — converts tree.lua → tree.json (run offline, not at runtime)
```

---

## Data Shape (`tree.json`)

```ts
{
  nodes: Record<string, TreeNode>,   // keys are numeric node IDs as strings
  classes: TreeClass[]
}
```

### `TreeNode`
```ts
{
  skill: number;           // numeric ID (also the dict key, converted to number on load)
  name: string;
  stats?: string[];
  icon?: string;
  ascendancyName?: string; // present only on ascendancy nodes (e.g. "Titan", "Warbringer")
  isKeystone?: boolean;
  isNotable?: boolean;
  isMastery?: boolean;
  isJewelSocket?: boolean;
  connections?: { id: number; orbit: number }[];
  group?: number;
  orbit?: number;
  orbitIndex?: number;
}
```

### `TreeClass`
```ts
{
  name: string;                                      // e.g. "Warrior"
  ascendancies: { name: string; displayName: string }[];  // e.g. [{ name: "Titan", displayName: "Titan" }]
}
```

Node counts (approximate): 33 Keystones, 1,122 Notables, 3,534 Normal, 12 Jewel, 392 ascendancy nodes.
Classes: Ranger, Huntress, Warrior (3 asc), Mercenary (3 asc), Druid, Witch (4 asc), Sorceress (3 asc), Monk.

---

## Zustand Store (`useTreeStore`)

Located at `src/store/useTreeStore.ts`. All persistent UI state lives here.

| Field | Type | Purpose |
|---|---|---|
| `nodes` | `Record<number, TreeNode>` | All parsed passive nodes |
| `classes` | `TreeClass[]` | Class + ascendancy list |
| `allocatedNodes` | `Set<number>` | Node IDs the user has allocated |
| `selectedClass` | `string \| null` | Active class filter |
| `selectedAscendancy` | `string \| null` | Active ascendancy filter (subset of class) |
| `isLoaded` | `boolean` | Tree JSON loaded successfully |
| `isLoading` | `boolean` | Load in progress |
| `error` | `string \| null` | Load error message |

Actions: `loadTree()`, `toggleNode(id)`, `clearAll()`, `setSelectedClass(name)`, `setSelectedAscendancy(name)`.

Helper exports: `nodeTypePriority`, `nodeTypeLabel`, `nodeTypeBadgeColor`.

---

## SkillTreeScreen Behaviour

- Loads `tree.json` once on mount via `Asset.loadAsync` + `FileSystem.readAsStringAsync`.
- Renders a `FlatList` of all passive nodes, sorted: Keystones → Notables → Normal → Masteries.
- **Tap** a node → toggles allocation (gold highlight + left border).
- **Long-press** a node → opens `NodeDetailSheet` bottom sheet.
- **Cog button** (top-right header) → opens `ClassPickerModal`.
- When class selected: other classes' ascendancy nodes are hidden from the list.
- When ascendancy selected: list narrows to universal nodes + that ascendancy's nodes only.
- Ascendancy nodes matching the selection get a teal left border (`COLORS.teal`).
- Active selection shown in a dismissible indicator strip below the search bar.
- Max passive points = 123.

---

## Navigation

Single `DrawerNavigator` wraps all three screens. Header options (e.g. `headerRight`) are set
per-screen with `navigation.setOptions(...)` inside `useLayoutEffect` in the screen component.

---

## Color Theme (`src/constants/colors.ts`)

All colors come from `COLORS`. Never hardcode hex values in component files.
Key tokens: `bgDeep`, `bgPanel`, `bgInput`, `gold`, `teal`, `text`, `textMuted`, `border`, `danger`.

---

## Conventions

- **No comments** unless the WHY is non-obvious.
- **No new files** unless the feature genuinely needs a new component or screen.
- **TypeScript must pass** (`npx tsc --noEmit`) before committing.
- **Store for persistence** — any state that should survive screen switches goes in Zustand.
- **Local state** for ephemeral UI only (modal visibility, search text).
- Prefer `useCallback` + `useMemo` for anything passed to `FlatList` render props.
- Bottom sheets use `@gorhom/bottom-sheet` `BottomSheetModal` with `sheetRef.current?.present()`.
- Modals use React Native `Modal` with `TouchableWithoutFeedback` backdrop-dismiss pattern.

---

## Known Gotchas

- `tree.json` keys are strings; they are converted to numbers on load (`Number(key)`).
- Nodes with empty `name` are filtered out during load.
- `ascendancyName` on a node is the **ascendancy name** (e.g. `"Titan"`), not the class name (`"Warrior"`).
  Use `classAscendancyNames` (a `Set` built from the selected class's ascendancies) to match.
- `Asset.loadAsync` requires a `require(...)` call — dynamic paths do not work.
- The `@gorhom/bottom-sheet` `BottomSheetModal` must be a descendant of `BottomSheetModalProvider`
  (set up in the root `App.tsx` / entry point).
