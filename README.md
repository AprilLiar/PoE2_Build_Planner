# PoE2 Build Planner

A React Native mobile app (Expo SDK 54, bare workflow) for creating and managing Path of Exile 2 character builds. Runs on Android (primary) and iOS via Expo Go / EAS.

---

## Quick Start (Windows + Expo Go on iPhone)

```powershell
npm install
npx expo start
# Scan the QR code with the Expo Go app on your iPhone
```

> **Do not use `npx expo run:android`** unless you have a physical Android device connected via USB with USB debugging enabled. Android testing currently uses EAS builds only.

---

## Key Commands

| What | Command |
|---|---|
| Start dev server | `npx expo start` |
| Type-check (no build) | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Android EAS build | `eas build --platform android --profile production` |
| iOS EAS build | `eas build --platform ios --profile production` |
| Regenerate native folders | `npx expo prebuild` (wipes `/android` and `/ios`) |

---

## Important Files

| File | Purpose |
|---|---|
| [`POE_BUILD_PLANNER_KNOWLEDGE_BASE.md`](./POE_BUILD_PLANNER_KNOWLEDGE_BASE.md) | **Full project spec** — architecture, screen specs, sprint history, known issues. Read before any code change. |
| [`AGENTS.md`](./AGENTS.md) | Agent instructions — mandatory reading rules and Expo version warning |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code entry point — references both docs above |
| [`src/store/useTreeStore.ts`](./src/store/useTreeStore.ts) | Zustand store: passive tree data, allocation state, class/ascendancy selection |
| [`src/screens/SkillTreeScreen.tsx`](./src/screens/SkillTreeScreen.tsx) | Main screen — node list, search, cog picker, point counter |
| [`src/components/NodeDetailSheet.tsx`](./src/components/NodeDetailSheet.tsx) | Bottom sheet shown on long-press of a node |
| [`src/components/ClassPickerModal.tsx`](./src/components/ClassPickerModal.tsx) | Modal for selecting class + ascendancy (opened via ⚙ header button) |
| [`src/navigation/DrawerNavigator.tsx`](./src/navigation/DrawerNavigator.tsx) | Drawer with Skill Tree / Items / Gems screens |
| [`src/constants/colors.ts`](./src/constants/colors.ts) | Single source of truth for all theme colours |
| [`assets/data/tree.json`](./assets/data/tree.json) | GGG official passive tree (~6.5 MB, 4,701 nodes, patch 0.4) |
| [`scripts/convert_tree.js`](./scripts/convert_tree.js) | Offline script: converts `tree.lua` → `tree.json` (run manually after GGG patches) |

---

## Expo Go Compatibility

The app currently runs in **Expo Go** (SDK 54). Three packages are installed but **must not be imported** until the project switches to an EAS dev build:

- `react-native-mmkv` — persistent storage
- `react-native-google-mobile-ads` — AdMob
- `expo-in-app-purchases` — IAP

When those features are needed, build a development client via `eas build --profile development` and install it on device.

---

## Project Structure

```
src/
  screens/          SkillTreeScreen, ItemsScreen (placeholder), GemsScreen (placeholder)
  components/       NodeDetailSheet, ClassPickerModal
  store/            useTreeStore (Zustand)
  navigation/       DrawerNavigator
  constants/        colors.ts
assets/
  data/             tree.json (GGG passive tree)
  fonts/            (Cinzel + Inter — future sprint)
  textures/         (leather background — future sprint)
scripts/
  convert_tree.js   offline data conversion
```

---

## Current Sprint State

See **Section 17** of [`POE_BUILD_PLANNER_KNOWLEDGE_BASE.md`](./POE_BUILD_PLANNER_KNOWLEDGE_BASE.md) for the full sprint history and backlog.

**Completed so far:**
- ✅ Sprint 0 — Foundation (deps, bare workflow, prebuild)
- ✅ Sprint 1 — Drawer navigation + basic node list
- ✅ Sprint 2 — Interactive skill tree (search, allocation, node detail sheet)
- ✅ Sprint 2 Refactor — Performance + code quality
- ✅ Sprint 3 — Class & ascendancy picker (⚙ cog button, modal, list filtering)

**Next up:** `useBuildStore` + MMKV persistence → BuildListScreen → Items screen

---

## For the Agent

Before every code change:
1. Read [`POE_BUILD_PLANNER_KNOWLEDGE_BASE.md`](./POE_BUILD_PLANNER_KNOWLEDGE_BASE.md) in full — especially Section 17
2. Check [`AGENTS.md`](./AGENTS.md) for mandatory rules
3. Run `npx tsc --noEmit` before committing
4. Update Section 17 of the KB at the end of every session
