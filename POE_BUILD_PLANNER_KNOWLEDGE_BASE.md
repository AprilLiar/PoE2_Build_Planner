# PoE Build Planner — React Native Project Knowledge Base

> **Purpose:** This document is a self-contained reference for a Claude Code agent to understand, scaffold, and modify the "PoE Build Planner" React Native mobile app. It is the single source of truth for all architectural, behavioural, and implementation decisions. Read this file in full before writing any code or making any architectural decision. Do not assume anything not stated here.

> **AGENT RULE — NON-NEGOTIABLE:** The agent's role is to write code. All project decisions, design decisions, UX decisions, and feature decisions belong to the developer. When any ambiguity, gap, or choice arises that is not explicitly resolved in this document, the agent must **stop and ask the developer** before proceeding. The agent must never unilaterally invent a solution, pick a design direction, or make a product decision and proceed silently. This applies to everything: screen layouts, user flows, error messages, naming, behaviour edge cases, and any situation where more than one reasonable approach exists. When in doubt — ask, do not assume.

---

## 1. Project Overview

| Field | Value |
|---|---|
| App Name | PoE Build Planner |
| Game | Path of Exile 2 (PoE2) |
| Platforms | Android (primary), iOS (secondary) |
| Framework | React Native via Expo (Bare Workflow) |
| Language | TypeScript — `strict: true` enforced |
| Primary Feature | Create, manage, import, and export character builds as JSON files |
| Screens | Skill Tree, Items, Gems, Settings (drawer navigation) |
| Navigation pattern | Hamburger (drawer) menu, top-left corner, every screen |
| Monetisation | Google AdMob interstitial (Import/Export gate) + Banner (TBD) + one-time "Remove Ads" IAP |
| Visual theme | Dark blue, tiling leather texture background, gold accents, modern readable buttons |
| UI language | English only |

---

## 2. Developer Environment

| Field | Value |
|---|---|
| OS | Windows |
| iOS builds | EAS cloud builds only — no local Mac available |
| Android builds | Local via `npx expo run:android` on physical Android device |
| Testing device | Physical Android device (USB debugging) |
| Automated tests | None — skip all test infrastructure for the first version |
| Experience level | Beginner — all code produced by the agent must include inline comments explaining non-obvious logic. Avoid unexplained patterns. |

**Agent instruction:** Because the developer is a beginner on Windows, all setup commands must target Windows (PowerShell or CMD). Never provide Unix-only commands without a Windows equivalent. When a step requires a Mac (e.g. local iOS build), explicitly say so and redirect to EAS.

**Setup video reference:** The developer is following this video to set up the environment and start the project: https://www.youtube.com/watch?v=XFmYkJJxsr8 — titled "Build Your First App with Claude Code (No Experience Needed)". It covers Claude Code + React Native + Expo, which aligns with this project's stack.

**CRITICAL — Managed vs Bare Workflow:** The video likely demonstrates the Expo **managed workflow** (using Expo Go, no `prebuild`). This project requires the Expo **bare workflow** because of native modules (AdMob, MMKV, IAP, file system). The agent must never:
- Suggest using Expo Go for testing (it will not work with this project's native modules)
- Skip `npx expo prebuild`
- Omit native plugin configuration from `app.json`
- Follow any managed-workflow shortcut shown in the video

If the video's setup steps conflict with bare workflow requirements, the bare workflow takes precedence. Always instruct the developer to run `npx expo run:android` on their physical device, not Expo Go.

---

## 3. Data Sources & External APIs

### 3.1 Official GGG Passive Skill Tree JSON

- **Source:** `https://github.com/grindinggear/skilltree-export`
- Officially published by Grinding Gear Games (GGG)
- **Bundled as a static asset** at `assets/data/tree.json` — Option A for first release
- The file is large (~10 MB+); it must be loaded asynchronously on app start, parsed once, and stored in Zustand — never require/import it synchronously at the module level
- **Key node fields:** `id` (number), `dn` (display name string), `ks` (keystone bool), `not` (notable bool), `m` (mastery bool), `sd` (stat descriptions string array), `icon` (asset path string)
- **Key group fields:** `x` (float), `y` (float), `n` (node ID array)
- Full schema documented at: `https://www.poewiki.net/wiki/Passive_Skill_Tree_JSON`

### 3.2 Official PoE2 API

- **Reference:** `https://www.pathofexile.com/developer/docs/reference`
- GGG has stated no PoE2-specific endpoints are available yet (as of May 2026) except the tree
- OAuth 2.0 with PKCE is used by PathOfBuilding for live character import — **deferred to future scope**
- Future endpoints of interest:
  - `POST /character-window/get-characters`
  - `POST /character-window/get-items`
  - `GET /character-window/get-passive-skills?character=X&accountName=Y`

### 3.3 PathOfBuilding PoE2 (Reference Only)

- **Repo:** `https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2`
- Written in Lua — do not port; use for data structure and game logic reference only
- **DeepWiki docs:** `https://deepwiki.com/PathOfBuildingCommunity/PathOfBuilding-PoE2`
- Key source files to reference: `PassiveTree.lua`, `ImportTab.lua`, `PoEAPI.lua`
- PoB build format is base64-encoded XML — our app uses plain JSON instead (simpler)

### 3.4 Gem Data Source

- Gem list sourced from `https://poe2db.tw` (community-scraped)
- A curated static JSON file of all gems must be created and bundled at `assets/data/gems.json`
- Schema per gem: `{ id: string, name: string, is_support: boolean, tags: string[] }`
- This file must be maintained manually when new gems are added by GGG patches

### 3.5 Community References

- `https://poe2db.tw` — item, gem, tree data
- `https://www.poewiki.net/wiki/Passive_Skill_Tree_JSON` — tree JSON schema documentation

---

## 4. Tech Stack — Definitive Choices

### 4.1 Base Framework

| Tool | Choice | Notes |
|---|---|---|
| Framework | **Expo Bare Workflow** | Required for AdMob, filesystem, IAP native modules |
| JS Engine | **Hermes** | Default in Expo; faster startup, lower memory |
| Architecture | **New Architecture** (Fabric + TurboModules) | Enabled by default in Expo SDK 52+ |

**Init commands (Windows PowerShell):**
```powershell
npx create-expo-app PoEBuildPlanner --template blank-typescript
cd PoEBuildPlanner
npx expo prebuild
# This generates the /android and /ios folders required for native modules
# iOS folder is generated but only used by EAS cloud builds — do not attempt local iOS builds on Windows
```

### 4.2 Navigation

| Tool | Package |
|---|---|
| Core | `@react-navigation/native` v7 |
| Drawer (hamburger) | `@react-navigation/drawer` v7 |
| Stack (in-screen) | `@react-navigation/native-stack` v7 |

**Install:**
```powershell
npx expo install @react-navigation/native @react-navigation/drawer @react-navigation/native-stack react-native-screens react-native-safe-area-context react-native-gesture-handler react-native-reanimated
```

**Drawer screen list:**
```
DrawerNavigator
├── SkillTreeScreen
├── ItemsScreen
├── GemsScreen
└── SettingsScreen
```

- Hamburger icon: top-left corner of every screen header
- Tapping it calls `navigation.openDrawer()`
- Active screen is highlighted in the drawer with `poe-blue-light`
- Drawer background uses the leather texture + dark overlay (same as screens)

### 4.3 State Management

| Concern | Tool |
|---|---|
| Global app + build state | **Zustand** v5 |
| Future API/async server state | **TanStack React Query** v5 (installed but not used until API work begins) |
| Local component state | `useState` / `useReducer` |

```powershell
npm install zustand @tanstack/react-query
```

**Zustand store slices:**

`useBuildStore` — owns the currently open build:
- `currentBuild: Build | null`
- `isDirty: boolean` — true when unsaved changes exist
- `setBuild(build: Build): void`
- `updateSkillTree(nodes: number[]): void`
- `updateItems(items: Item[]): void`
- `updateGems(gems: GemLink[]): void`
- `markDirty(): void`
- `markClean(): void`

`useAppStore` — owns UI and session state:
- `adUnlockExpiry: number` — Unix ms timestamp; 0 means not unlocked
- `adsRemoved: boolean` — true if user has purchased "Remove Ads" IAP
- `isAdUnlocked(): boolean` — computed: `adsRemoved || Date.now() < adUnlockExpiry`
- `setAdUnlockExpiry(ts: number): void`
- `setAdsRemoved(value: boolean): void`

`useTreeStore` — owns parsed tree data:
- `nodes: Record<number, TreeNode>` — flat map of all nodes by ID
- `isLoaded: boolean`
- `loadTree(): Promise<void>` — reads and parses `assets/data/tree.json`

`useGemStore` — owns parsed gem list:
- `gems: Gem[]`
- `isLoaded: boolean`
- `loadGems(): Promise<void>` — reads and parses `assets/data/gems.json`

### 4.4 Persistent Storage (MMKV)

```powershell
npm install react-native-mmkv
```

All MMKV keys:

| Key | Type | Purpose |
|---|---|---|
| `ad_unlock_expiry` | `number` | Unix ms timestamp of 4-hour unlock expiry |
| `ads_removed` | `boolean` | Whether user purchased "Remove Ads" IAP |
| `ad_consent_given` | `boolean` | Whether UMP consent flow was completed |
| `last_build_path` | `string` | File path of the last opened build; used on launch to auto-reopen the last build |

On app start, `useAppStore` must be hydrated from MMKV before any screen renders.

### 4.5 File System

| Tool | Package |
|---|---|
| Read/write files | `expo-file-system` |
| User picks a file | `expo-document-picker` |
| Share/export file | `expo-sharing` |

```powershell
npx expo install expo-file-system expo-document-picker expo-sharing
```

**app.json plugin:**
```json
["expo-file-system", { "supportsOpeningDocumentsInPlace": true, "enableFileSharing": true }]
```

All build files are stored in:
```
FileSystem.documentDirectory + 'builds/'
```

### 4.6 Styling

| Tool | Package |
|---|---|
| Utility classes | **NativeWind v4** (Tailwind for React Native) |
| Animations | **React Native Reanimated v3** (already installed via navigation) |

```powershell
npm install nativewind
npm install --save-dev tailwindcss
npx tailwindcss init
```

### 4.7 Ads

```powershell
npm install react-native-google-mobile-ads
```

**Status: AdMob is configured at the final development stage only.** Test IDs are used for all development and testing. Do not configure real ad unit IDs until the app is feature-complete and ready for store submission.

**app.json plugin (fill real IDs at final stage):**
```json
["react-native-google-mobile-ads", {
  "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY",
  "iosAppId":     "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"
}]
```

**Formats used:**
- `InterstitialAd` — Import/Export gate (see Section 6)
- `BannerAd` — placement TBD (see Section 7.6)

### 4.8 In-App Purchase — "Remove Ads"

```powershell
npx expo install expo-in-app-purchases
```

- One-time non-consumable purchase: product ID `remove_ads`
- Must be registered in Google Play Console and App Store Connect before first release
- On successful purchase: set `ads_removed = true` in MMKV and `useAppStore`
- On app start: restore purchases — call `getProductsAsync` and check owned products
- When `adsRemoved === true`: skip all ad logic silently; never show ads of any kind

**app.json plugin:**
```json
["expo-in-app-purchases"]
```

### 4.9 Fonts

```powershell
npx expo install expo-font
```

- **Display / Headers:** `Cinzel-Regular.ttf` — gothic aesthetic matching PoE2
- **Body / UI:** `Inter-Regular.ttf` + `Inter-Medium.ttf` — clean, readable
- Load both font families in `App.tsx` using `useFonts` hook before rendering any screen
- Minimum body font size: 14sp. Minimum tap target: 44×44pt (Apple HIG / Android guidelines)

### 4.10 iOS Tracking Transparency (ATT)

```powershell
npx expo install expo-tracking-transparency
```

Required on iOS 14.5+ before AdMob can use IDFA. Request permission before initialising AdMob on iOS.

### 4.11 Toast / Snackbar Notifications

```powershell
npm install react-native-toast-message
```

Used for non-critical user feedback: save confirmations, import success, copy to clipboard, etc. Do not use for critical errors — those use the full error screen (see Section 9).

### 4.12 Bottom Sheet

```powershell
npm install @gorhom/bottom-sheet
```

Used for: node detail view (Skill Tree screen) and item detail view (Items screen). `@gorhom/bottom-sheet` requires `react-native-reanimated` and `react-native-gesture-handler` — both already installed.

**Usage pattern:**
- Import `BottomSheet` and `BottomSheetView` from `@gorhom/bottom-sheet`
- Wrap the app root with `GestureHandlerRootView` (already required by react-native-gesture-handler)
- Each screen that uses a bottom sheet manages its own `BottomSheetRef` via `useRef`
- Snap points: `['50%', '90%']` as a sensible default — agent must ask developer before finalising snap points per sheet

### 4.13 Class Picker

No external library. The PoE2 class selector in the "Create Build" modal is implemented as a **custom styled modal list** using React Native core only (`Modal`, `FlatList`, `Pressable`).

- Dark panel background matching `poe-bg-panel`
- Selected class highlighted with `poe-gold` border
- `poe-text` colour for all items
- Extensible: search filtering, ascendancy sub-selection, or class icons can be added later without changing the underlying approach
- Consistent appearance on both Android and iOS — no native OS rendering differences

**PoE2 classes (complete list as of May 2026):**
```typescript
// src/constants/classes.ts
export const POE2_CLASSES = [
  'Warrior',
  'Ranger',
  'Sorceress',
  'Monk',
  'Mercenary',
  'Witch',
  'Druid',    // confirm availability in current patch before hardcoding
] as const;

export type Poe2Class = typeof POE2_CLASSES[number];
```

**Agent instruction:** Verify the class list against current PoE2 patch notes before hardcoding. Ask the developer if any class appears missing or incorrect.

### 4.14 expo-constants

```powershell
npx expo install expo-constants
```

Used in the Settings screen to read the app version: `Constants.expoConfig?.version`.

---

## 5. Build JSON Schema

All build data is a single JSON file on the device filesystem.

```typescript
// src/types/build.ts

export interface Build {
  schema_version: number;      // Increment when schema changes. Current: 1
  name: string;                // User-defined build name
  game_version: string;        // PoE2 patch string, e.g. "0.2.0"
  created_at: string;          // ISO 8601
  updated_at: string;          // ISO 8601 — update on every save

  character: {
    class: string;             // e.g. "Witch", "Ranger", "Warrior"
    ascendancy: string | null; // e.g. "Infernalist", null if not chosen
    level: number;             // 1–100
  };

  skill_tree: {
    allocated_nodes: number[]; // Node IDs from GGG tree JSON
    tree_version: string;      // Version string from GGG tree export
  };

  items: Item[];

  gems: GemLink[];

  notes: string;               // Freeform markdown-compatible text
}

export interface Item {
  slot: ItemSlot;
  name: string;
  base_type: string;
  rarity: 'Normal' | 'Magic' | 'Rare' | 'Unique';
  raw_text: string;            // Full raw PoE item text block (used for parsing and display)
  mods: string[];              // Parsed mod lines
}

// All supported equipment slots
export type ItemSlot =
  | 'Helm' | 'Chest' | 'Gloves' | 'Boots'
  | 'Weapon1' | 'Weapon2' | 'Offhand1' | 'Offhand2'
  | 'Ring1' | 'Ring2' | 'Amulet' | 'Belt'
  | 'Flask1' | 'Flask2' | 'Flask3' | 'Flask4' | 'Flask5'
  | 'Charm1' | 'Charm2' | 'Charm3';

export interface GemLink {
  id: string;            // UUID — generated client-side (use crypto.randomUUID())
  label: string;         // User-defined label, e.g. "Main Skill", "Aura"
  gems: SocketedGem[];
}

export interface SocketedGem {
  id: string;            // UUID
  name: string;          // Must match a name in assets/data/gems.json
  level: number;         // 1–20
  quality: number;       // 0–20
  is_support: boolean;   // Mirrors the gem list definition
}
```

**Schema version history:**
- `1` — initial version

**Schema migration:** `src/utils/buildMigration.ts` must handle upgrading older `schema_version` values. When loading a build file, check `schema_version` first and run migrations before using the data.

---

## 6. Ad Gate — Import/Export Interstitial

### 6.1 Behaviour Rules

- Import and Export buttons are always visible and always tappable
- On tap, check `useAppStore.isAdUnlocked()`:
  - If `true` (unlocked or ads removed): proceed with the action immediately
  - If `false`: load and show a non-skippable interstitial ad; on close, set 4-hour unlock, then proceed with the action
- A single ad watch unlocks **both** Import and Export for 4 hours
- The unlock timestamp persists across app restarts via MMKV
- If the ad fails to load (no network, AdMob error): show a toast — "Ad unavailable. Please try again later." Do not unlock. Do not crash.
- While the ad is loading after the button tap: show a full-screen loading indicator to prevent double-taps

### 6.2 Implementation

```typescript
// src/services/adService.ts
import { MMKV } from 'react-native-mmkv';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { useAppStore } from '../store/useAppStore';

const storage = new MMKV();
const UNLOCK_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

// Use test ID during development; replace with real unit ID at final stage
const AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : 'ca-app-pub-XXXX/INTERSTITIAL_UNIT_ID';

// Persist unlock expiry to MMKV and sync to store
function activateUnlock(): void {
  const expiry = Date.now() + UNLOCK_DURATION_MS;
  storage.set('ad_unlock_expiry', expiry);
  useAppStore.getState().setAdUnlockExpiry(expiry);
}

/**
 * Call this when the user taps Import or Export.
 * onUnlocked fires when the action is cleared to proceed.
 * onLoading fires when we start loading the ad (use to show a loading indicator).
 * onLoadingDone fires when loading ends (success or failure).
 */
export function requireAdUnlock(params: {
  onUnlocked: () => void;
  onLoading: () => void;
  onLoadingDone: () => void;
}): void {
  const { onUnlocked, onLoading, onLoadingDone } = params;

  // Check if already unlocked (includes ads removed via IAP)
  if (useAppStore.getState().isAdUnlocked()) {
    onUnlocked();
    return;
  }

  onLoading();

  const interstitial = InterstitialAd.createForAdRequest(AD_UNIT_ID, {
    requestNonPersonalizedAdsOnly: !storage.getBoolean('ad_consent_given'),
  });

  interstitial.addAdEventListener(AdEventType.LOADED, () => {
    onLoadingDone();
    interstitial.show();
  });

  interstitial.addAdEventListener(AdEventType.CLOSED, () => {
    activateUnlock();
    onUnlocked();
  });

  interstitial.addAdEventListener(AdEventType.ERROR, (error) => {
    console.error('Interstitial ad failed to load:', error);
    onLoadingDone();
    // Show toast: "Ad unavailable. Please try again later."
  });

  interstitial.load();
}
```

**Usage in screen components:**
```typescript
const [adLoading, setAdLoading] = useState(false);

const handleImport = () => {
  requireAdUnlock({
    onLoading: () => setAdLoading(true),
    onLoadingDone: () => setAdLoading(false),
    onUnlocked: async () => {
      const build = await importBuild();
      if (build) useBuildStore.getState().setBuild(build);
    },
  });
};
```

---

## 7. Screen Specifications

### 7.1 Skill Tree Screen

**Prototype behaviour (first release):**
- Searchable, scrollable `FlatList` of all nodes from `tree.json`
- Nodes pre-sorted: Keystone → Notable → Normal → Mastery
- All nodes are shown regardless of class; nodes relevant to the build's chosen class are **visually highlighted** (e.g. a distinct border or background tint) — the exact highlight style is a design decision to be made by the developer during implementation; ask before implementing
- Each list row displays: node name (`dn`), type badge, and the first 1–2 stat lines (`sd`) inline; remaining stats shown in a detail sheet (see below)
- Any node can be freely toggled on/off — no connectivity rules enforced in list view
- Allocated nodes visually highlighted: gold border, `poe-gold` text
- Tapping a node opens a **bottom sheet detail view** showing: node name, type, all stat lines, and a toggle button to allocate/deallocate
- Search bar filters by node name (case-insensitive substring match)
- Passive point counter displayed in the screen header: `X / 123 points used`
  - Maximum points: 123 (PoE2 level 100 passive points — verify against current game data before hardcoding)
  - Counter updates live as nodes are toggled
- Changes auto-save to `useBuildStore` and trigger the dirty flag

**Long-term goal (future milestone — not first release):**
- Full interactive graphical tree rendered with `react-native-svg`
- Pan (finger drag) and pinch-to-zoom via `react-native-gesture-handler`
- Viewport culling: only render nodes visible in the current viewport rectangle
- Node visual types: Normal (small circle), Notable (medium, gold outline), Keystone (large, gold filled), Mastery (star)
- Connections: `Line` elements between adjacent node coordinates from the JSON
- Allocated nodes: filled; unallocated: outline only
- Class start nodes marked distinctly
- Connectivity rules enforced: a node can only be allocated if adjacent to an already-allocated node or a class start node
- `react-native-svg` is already installed from the initial setup (listed in dependencies) — no additional install needed at this stage

### 7.2 Items Screen

**Layout:** A visual equipment panel showing all item slots grouped:
- Armour group: Helm, Chest, Gloves, Boots
- Weapons group: Weapon1, Offhand1, Weapon2, Offhand2
- Jewellery group: Ring1, Ring2, Amulet, Belt
- Flasks group: Flask1–Flask5
- Charms group: Charm1–Charm3

Each slot renders as a tappable card. If empty: shows slot name + "Tap to add item". If filled: shows item name, rarity colour, and first 2 mod lines.

**Adding an item:**
- User taps an empty slot card
- A modal opens with a multi-line text input
- User pastes the raw PoE item text (copied from the game's Ctrl+C item copy)
- The app parses the raw text to extract: item name, base type, rarity, and mod lines
- The parsed item is shown as a preview before confirming
- On confirm, the item is stored in `useBuildStore` and the dirty flag is set

**PoE item text parser (`src/utils/itemParser.ts`):**
Raw PoE item text is `--------` delimited. The parser must handle:
- Line 1: rarity (`Rarity: Normal/Magic/Rare/Unique`)
- Line 2: item name
- Line 3: base type (may be absent for Normal items)
- Subsequent sections separated by `--------` contain mods, requirements, sockets, flavour text
- Mod lines in the implicit/explicit section are stored in `mods[]`
- `raw_text` stores the original unmodified paste for reference

**Tapping a filled slot:** Opens a **read-only item detail view** (bottom sheet or modal) showing: item name in rarity colour, base type, rarity badge, and all parsed mod lines. Raw pasted text is NOT shown to the user — only parsed data.
- The detail view has two action buttons: "Edit" (opens the paste modal to replace the item) and "Clear Slot" (removes the item with a confirmation dialog)

### 7.3 Gems Screen

**Layout:** A list of gem groups (GemLinks). Each group has:
- A user-defined label (e.g. "Main Skill", "Aura 1")
- A list of socketed gems within that group
- An "Add Gem" button at the bottom of each group
- No limit enforced on number of support gems per group

**Adding a gem:**
- Tapping "Add Gem" opens a search modal
- The modal has a text input that filters `assets/data/gems.json` by name (case-insensitive substring)
- Results list shows gem name and whether it is Active or Support
- User taps a gem to select it
- After selection, the user sets level (1–20) and quality (0–20) via number inputs
- The gem is added to the group and the dirty flag is set

**Editing a gem:**
- Tapping an existing gem in a group opens an **edit sheet** with options to: change level, change quality, swap the gem (reopens the search modal with the current gem pre-filled), or remove the gem
- This is the primary edit flow — do not require remove-and-re-add

**Gem ordering within a group:**
- Active skill gems always appear first, support gems below them
- Within each category, gems appear in the order they were added — no further sorting

**Gem groups:**
- User can add a new group with a "New Skill Group" button
- User can delete a group (with a confirmation prompt)
- Groups can be reordered via drag handles (use `react-native-draggable-flatlist`)

```powershell
npm install react-native-draggable-flatlist
```

### 7.4 Drawer Header — Build Identity

All build screens share a **drawer header** (rendered at the top of the drawer, above the screen list) that displays the currently open build's: name, character class, and level. This gives the user constant context about which build they are editing without needing to return to the build list.

- The header is part of `DrawerNavigator.tsx` — rendered once, not per-screen
- Tapping the header has no action in the first version
- If no build is open (which should not happen inside the drawer), show a placeholder

### 7.5 Notes Field

The `notes` field exists in the Build JSON schema and must be saved/loaded correctly. However, **there is no notes editing UI in the first version**. The field is preserved on import/export but the user cannot view or edit it from within the app. A notes screen may be added in a future release.

### 7.6 Settings Screen

Accessible from the drawer. Contains the following sections:

**Build Management (if relevant here):** — or place this on a dedicated build list screen if that is cleaner.

**Ads:**
- "Remove Ads" button — triggers IAP purchase flow; disabled and shows "Ads Removed ✓" if already purchased
- "Restore Purchases" button — restores previous IAP purchases (required by Apple)

**Privacy:**
- "Reset Ad Consent" button — clears `ad_consent_given` from MMKV and shows the UMP consent form again on next ad interaction

**About:**
- App version (read from `expo-constants`)
- "This app is not affiliated with Grinding Gear Games." disclaimer — required for store compliance
- Link to PoE2 official site

### 7.8 Build List / Home Screen

**First launch (no builds saved):**
- Show a welcome/onboarding screen explaining the app briefly before the build list
- The onboarding screen content and design is a decision to be made by the developer — the agent must ask the developer what to display before implementing it
- After the onboarding screen, proceed to the build list

**Subsequent launches:**
- If a build was open when the app was last closed, reopen it automatically, loading it into `useBuildStore` and navigating directly into the drawer
- The `last_build_path` MMKV key stores the file path of the last opened build; on launch, check if this key exists and the file is still present before auto-opening
- If the file no longer exists (deleted externally), fall back to the build list with no error

**Empty state (no builds saved after onboarding):**
- Display a centred empty state: a prominent "Create New Build" button and an "Import Build" button

**Populated state:**
- A scrollable list of build cards sorted by **most recently modified first**
- Each card shows: build name, character class, level, last modified date
- Tapping a card loads the build into `useBuildStore` and navigates into the drawer, defaulting to the Skill Tree screen
- Long-press on a card: context menu with options — Rename, Duplicate, Delete
- Delete shows a **confirmation dialog** before removing the file (no undo toast)

**Creating a new build:**
- Tapping "Create New Build" opens a modal
- The modal collects three fields before the build is created: build name (text input), class (picker/dropdown from the PoE2 class list), and level (number input, 1–100)
- All three fields are required — the confirm button is disabled until all are filled
- On confirm: create the build JSON, save it, and navigate into the drawer

**Navigation structure:**
```
RootStackNavigator
├── BuildListScreen          ← always the entry point; auto-reopens last build if available
└── BuildDrawerNavigator     ← entered when a build is opened or created
    ├── SkillTreeScreen
    ├── ItemsScreen
    ├── GemsScreen
    └── SettingsScreen
```

### 7.7 Ad Banner Placement

**Status: TBD.** The `AdBanner` component is built and ready to drop in. Placement is decided after design review. Do not hardcode it into any screen layout yet — keep it as a standalone importable component.

---

## 8. Save / Dirty State Behaviour

### 8.1 Auto-Save

- Every change to the build (node toggle, item add, gem change) calls `useBuildStore.markDirty()`
- An auto-save debounce runs: 3 seconds after the last change, the build is written to its file via `fileService.saveBuild()`
- After a successful auto-save, call `useBuildStore.markClean()`
- The save is silent — no toast on auto-save unless it fails

### 8.2 Manual Save

- A Save button is accessible in each build screen's header
- Tapping it saves immediately, cancels any pending auto-save debounce, and shows a toast: "Build saved"

### 8.3 Unsaved-Changes Warning

- When the user attempts to navigate back to the Build List while `isDirty === true`, show a modal dialog:
  - Title: "Unsaved Changes"
  - Message: "You have unsaved changes. Save before leaving?"
  - Buttons: "Save and Leave", "Leave Without Saving", "Cancel"
- This applies to back navigation, drawer item taps that would leave the build context, and hardware back button on Android

---

## 9. Error Handling

### 9.1 Critical Errors

A full-screen error component (`src/components/ErrorScreen.tsx`) is shown when:
- `tree.json` fails to load or parse
- `gems.json` fails to load or parse
- A build file is corrupt or fails schema validation on load

The error screen shows:
- A brief human-readable description of the error
- A "Retry" button that re-attempts the failed operation
- For corrupt build files: additionally offer "Delete Build" to remove the broken file

### 9.2 Non-Critical Errors

Use `react-native-toast-message` for recoverable errors:
- Ad load failure
- Export failure (e.g. file write error)
- Item parse failure (malformed paste)

### 9.3 Item Parse Failure

If the pasted item text cannot be parsed:
- Show an inline error message in the modal: "Could not parse item text. Please paste the raw item text copied with Ctrl+C in-game."
- Do not close the modal; let the user correct the input

---

## 10. UI/UX Specification

### 10.1 Color Palette

```javascript
// tailwind.config.js — extend these colours
colors: {
  'poe-bg-deep':    '#0A0E1A',  // deepest background / screen base
  'poe-bg-panel':   '#111827',  // card, modal, drawer panel background
  'poe-border':     '#1E3A5F',  // borders, dividers
  'poe-blue':       '#1D4ED8',  // primary action buttons
  'poe-blue-light': '#3B82F6',  // hover / active / selected state
  'poe-gold':       '#C9A84C',  // keystone nodes, highlights, section headers
  'poe-text':       '#E2E8F0',  // primary body text
  'poe-text-muted': '#94A3B8',  // secondary / placeholder text
  'poe-danger':     '#DC2626',  // destructive actions, error states
  'poe-success':    '#16A34A',  // save confirmation, success states
}
```

### 10.2 Background Texture

- Asset: `assets/textures/leather_bg.png` — tiling leather texture
- Applied via `ImageBackground` with `resizeMode="repeat"` at the root of every screen
- A `View` overlay with `backgroundColor: 'rgba(10, 14, 26, 0.75)'` is placed on top for legibility
- The drawer background uses the same treatment

```tsx
// src/components/ScreenLayout.tsx — wrap every screen's content in this
<ImageBackground source={leatherBg} resizeMode="repeat" style={{ flex: 1, backgroundColor: '#0A0E1A' }}>
  <View style={{ flex: 1, backgroundColor: 'rgba(10, 14, 26, 0.75)' }}>
    {children}
  </View>
</ImageBackground>
```

### 10.3 Typography

| Use | Font | Size |
|---|---|---|
| Screen titles, section headers | Cinzel-Regular | 20–24sp |
| Button labels | Inter-Medium | 15–16sp |
| Body text, list items | Inter-Regular | 14–15sp |
| Muted / caption text | Inter-Regular | 12–13sp |

### 10.4 Buttons

- Primary action (e.g. Save, Confirm): `poe-blue` background, white `Inter-Medium` text, `borderRadius: 8`, `paddingVertical: 12`, `paddingHorizontal: 20`
- Destructive (e.g. Delete): `poe-danger` background
- Press feedback: scale to 0.96 via Reanimated `withSpring`
- Minimum tap target: 44×44pt — enforce with `minHeight: 44, minWidth: 44`

### 10.5 Item Rarity Colours

Match in-game rarity colours for item names:
- Normal: `#C8C8C8`
- Magic: `#8888FF`
- Rare: `#FFFF77`
- Unique: `#AF6025`

### 10.6 App Icon & Splash Screen

A placeholder icon and splash screen are used for the first release.
- Icon: generate a simple dark blue shield with "PoE" text using an online tool or script
- Splash: `#0A0E1A` background with the app name in Cinzel font centred
- Configured in `app.json` under `"icon"` and `"splash"`
- Replace with final assets before first store submission

### 10.7 Ad Banner Component (TBD Placement)

```tsx
// src/components/AdBanner.tsx
import React from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useAppStore } from '../store/useAppStore';

interface AdBannerProps {
  unitId?: string;
  size?: BannerAdSize;
}

const AdBanner: React.FC<AdBannerProps> = ({
  unitId = __DEV__ ? TestIds.ADAPTIVE_BANNER : 'ca-app-pub-XXXX/YYYY',
  size = BannerAdSize.ANCHORED_ADAPTIVE_BANNER,
}) => {
  const adsRemoved = useAppStore((s) => s.adsRemoved);
  // If ads removed via IAP, render nothing
  if (adsRemoved) return null;
  return (
    <View style={{ width: '100%', alignItems: 'center' }}>
      <BannerAd unitId={unitId} size={size} />
    </View>
  );
};

export default AdBanner;
```

---

## 11. Project Folder Structure

```
PoEBuildPlanner/
├── app.json                        # Expo config — plugins, AdMob IDs (fill at final stage), permissions
├── tsconfig.json                   # strict: true
├── tailwind.config.js
├── eas.json                        # EAS build profiles
├── assets/
│   ├── fonts/
│   │   ├── Cinzel-Regular.ttf
│   │   ├── Inter-Regular.ttf
│   │   └── Inter-Medium.ttf
│   ├── textures/
│   │   └── leather_bg.png
│   └── data/
│       ├── tree.json               # GGG passive skill tree — from grindinggear/skilltree-export
│       └── gems.json               # Curated gem list — maintained manually
├── src/
│   ├── navigation/
│   │   ├── RootStackNavigator.tsx  # Root: BuildListScreen → BuildDrawerNavigator
│   │   └── DrawerNavigator.tsx     # Drawer: SkillTree, Items, Gems, Settings
│   ├── screens/
│   │   ├── BuildListScreen/
│   │   │   ├── index.tsx
│   │   │   └── BuildListScreen.tsx
│   │   ├── SkillTreeScreen/
│   │   │   ├── index.tsx
│   │   │   └── SkillTreeScreen.tsx
│   │   ├── ItemsScreen/
│   │   │   ├── index.tsx
│   │   │   └── ItemsScreen.tsx
│   │   ├── GemsScreen/
│   │   │   ├── index.tsx
│   │   │   └── GemsScreen.tsx
│   │   └── SettingsScreen/
│   │       ├── index.tsx
│   │       └── SettingsScreen.tsx
│   ├── components/
│   │   ├── ScreenLayout.tsx        # ImageBackground + overlay wrapper
│   │   ├── AdBanner.tsx            # Banner ad — placement TBD
│   │   ├── ErrorScreen.tsx         # Full-screen critical error with Retry
│   │   ├── PoeButton.tsx           # Styled primary/danger button
│   │   ├── HamburgerIcon.tsx       # Drawer toggle icon
│   │   └── LoadingOverlay.tsx      # Full-screen spinner for ad loading state
│   ├── store/
│   │   ├── useBuildStore.ts
│   │   ├── useAppStore.ts
│   │   ├── useTreeStore.ts
│   │   └── useGemStore.ts
│   ├── services/
│   │   ├── fileService.ts          # saveBuild, exportBuild, importBuild, listBuilds, deleteBuild
│   │   ├── adService.ts            # requireAdUnlock, AdMob init, UMP consent
│   │   └── iapService.ts           # purchaseRemoveAds, restorePurchases
│   ├── types/
│   │   └── build.ts                # All TypeScript interfaces (Section 5)
│   ├── constants/
│   │   ├── colors.ts               # Color palette constants mirroring tailwind config
│   │   ├── slots.ts                # ItemSlot enum and display names
│   │   ├── classes.ts              # POE2_CLASSES list and Poe2Class type
│   │   └── screenNames.ts          # Drawer screen name enum
│   └── utils/
│       ├── buildMigration.ts       # Upgrade schema_version on load
│       ├── itemParser.ts           # Parse raw PoE item text into Item interface
│       └── debounce.ts             # Generic debounce utility for auto-save
├── android/                        # Generated by npx expo prebuild — do not hand-edit
└── ios/                            # Generated by npx expo prebuild — used by EAS only on Windows
```

---

## 12. Build Pipeline & Publishing

### 12.1 Local Development (Windows, Android)

```powershell
# Connect Android device via USB with USB debugging enabled
npx expo run:android
# Hot reload is available; Expo Go is NOT used — this is a bare workflow with native modules
```

### 12.2 EAS Cloud Builds

```powershell
npm install -g eas-cli
eas login
eas build --platform android --profile production
eas build --platform ios --profile production   # iOS only via EAS on Windows
```

**eas.json:**
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "production": {
      "distribution": "store"
    }
  }
}
```

### 12.3 Store Checklist Before Release

**Google Play:**
- [ ] AdMob real IDs configured in `app.json`
- [ ] "Remove Ads" product ID `remove_ads` created in Play Console
- [ ] Play Console → Policy & programs → App content → declare ads present
- [ ] Data safety form → declare file storage access and purpose
- [ ] W-8BEN submitted in Google payments settings

**Apple App Store:**
- [ ] AdMob real IDs configured
- [ ] `remove_ads` product created in App Store Connect
- [ ] ATT prompt (`expo-tracking-transparency`) enabled
- [ ] W-8BEN submitted in App Store Connect → Agreements, Tax, and Banking
- [ ] Privacy manifest updated (required for iOS 17+)

---

## 13. Publishing — Polish Citizen Guidance

### 13.1 Recommended Phased Approach

| Phase | Action |
|---|---|
| App complete | Publish Android first — $25 one-time vs $99/year for iOS |
| Revenue confirmed | Register **jednoosobowa działalność gospodarcza** before income becomes regular |
| iOS release | Add Apple Developer account ($99/year) |

### 13.2 Tax & Payments

- Submit **W-8BEN** (non-US person) in both Google AdMob payments and Apple App Store Connect before any revenue is earned. Poland has a US tax treaty; withholding drops to 0% on royalties when this form is correctly filed. Failure means 30% automatic US withholding on all earnings.
- Polish bank IBAN accepted by both Google and Apple for payouts
- Declare AdMob and IAP income in Poland under PIT; consult a Polish accountant (księgowy) before revenue is significant
- Tax options: `podatek liniowy` (19% flat on profit) or `ryczałt ewidencjonowany` (often 8.5% on revenue up to threshold for this income type)

---

## 14. Known Constraints & Decisions

| Constraint | Decision |
|---|---|
| Developer is a beginner | All agent-generated code must include inline comments on non-obvious logic |
| Windows-only dev machine | All commands must be Windows/PowerShell compatible; no Mac-only steps |
| No Mac for iOS | iOS built exclusively via EAS cloud builds |
| No automated tests | Skip all test infrastructure; no Jest, no RNTL setup |
| GGG PoE2 API limited (May 2026) | Bundle static `tree.json`; OAuth import is future scope |
| Expo Go not usable | Always run via `npx expo run:android` or EAS builds — native modules require it |
| PoB is Lua/XML | Reference only; do not port code; use our own JSON schema |
| Skill tree prototype | FlatList with free toggle; graphical tree is a separate future milestone |
| No connectivity rules in prototype | Nodes toggled freely; rules enforced only in future graphical tree |
| Auto-save + manual save | 3-second debounce auto-save; manual Save button in header |
| Unsaved-change guard | Modal on back/leave when `isDirty === true` |
| Item input | Paste raw PoE text only; app parses it |
| Item slots supported | Armour, Weapons, Jewellery, Flasks (×5), Charms (×3) |
| Gem input | Searchable dropdown from `gems.json`; no link limit enforced |
| Ad gate | Mandatory non-skippable interstitial on Import/Export; 4-hour unlock; stored in MMKV |
| IAP | One-time `remove_ads` purchase; removes all ads permanently |
| Banner ad placement | TBD — `AdBanner` component ready but not placed in any screen |
| AdMob setup timing | Final development stage only; test IDs throughout all development |
| Crash reporting | None in first release |
| Language | English only |
| App icon | Placeholder for first release; replaced before first store submission |
| Settings screen | Included in drawer — IAP, consent reset, About/disclaimer |
| Bottom sheet | @gorhom/bottom-sheet — used for node detail and item detail views |
| Class picker | Custom styled modal list using React Native core only — no external library; consistent cross-platform appearance; extensible |
| PoE2 class list | Defined in `src/constants/classes.ts`; agent must verify against current patch before hardcoding |

---

## 15. Dependencies Summary

```json
{
  "dependencies": {
    "expo": "latest",
    "react": "latest",
    "react-native": "latest",
    "@react-navigation/native": "^7.x",
    "@react-navigation/drawer": "^7.x",
    "@react-navigation/native-stack": "^7.x",
    "react-native-screens": "latest",
    "react-native-safe-area-context": "latest",
    "react-native-gesture-handler": "latest",
    "react-native-reanimated": "^3.x",
    "react-native-svg": "latest",
    "react-native-draggable-flatlist": "latest",
    "react-native-toast-message": "latest",
    "react-native-google-mobile-ads": "latest",
    "react-native-mmkv": "latest",
    "zustand": "^5.x",
    "@tanstack/react-query": "^5.x",
    "expo-file-system": "latest",
    "expo-document-picker": "latest",
    "expo-sharing": "latest",
    "expo-font": "latest",
    "expo-tracking-transparency": "latest",
    "expo-in-app-purchases": "latest",
    "expo-constants": "latest",
    "nativewind": "^4.x",
    "@gorhom/bottom-sheet": "^5.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tailwindcss": "^3.x",
    "@typescript-eslint/eslint-plugin": "latest",
    "@typescript-eslint/parser": "latest",
    "eslint": "latest",
    "eslint-plugin-react-native": "latest",
    "prettier": "latest",
    "husky": "latest",
    "lint-staged": "latest"
  }
}
```

---

## 16. Future Scope (Not In First Release)

- Full graphical passive skill tree with pan/zoom (SVG — see Section 7.1)
- Connectivity rules enforcement in the graphical tree
- OAuth 2.0 PKCE login to import live character data from GGG API
- Build sharing via URL / QR code
- Damage/stat calculator (reference PoB Lua for formulas)
- Atlas passive tree screen
- Cloud sync (requires backend)
- Crash reporting via Sentry
- Polish language localisation

---

*Last updated: May 2026. Verify all package versions against their respective npm and Expo documentation before installing — the React Native ecosystem updates frequently.*
