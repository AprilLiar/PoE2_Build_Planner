import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useSharedValue,
  useDerivedValue,
  withSpring,
  withRepeat,
  withTiming,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  ImageShader,
  Path as SkiaPath,
  Rect,
  Skia,
  useImage,
} from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { useTreeStore, TreeNode, isAnchorNode } from '../store/useTreeStore';
import { queryVisibleNodes } from '../utils/treeLayout';
import { COLORS } from '../constants/colors';

// ─── Sprite sheet lookups (skills.json / skills-disabled.json) ────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SKILLS_ACTIVE_FRAMES: Record<string, { frame: { x: number; y: number; w: number; h: number } }> =
  require('../../assets/poe2/official-tree/skills.json').frames;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SKILLS_INACTIVE_FRAMES: Record<string, { frame: { x: number; y: number; w: number; h: number } }> =
  require('../../assets/poe2/official-tree/skills-disabled.json').frames;

const SPRITE_SHEET_W = 1029;
const SPRITE_SHEET_H = 1459;
const SPRITE_SIZE    = 34;   // all icon frames are 34×34 in the sheet
const ICON_SCALE     = 2;    // render at 2× world pixels (68 wu) for clarity

// Frame sprite sheet (official-tree/frame.webp) — JSON scale:0.5 → display = sprite px × 2
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FRAME_FRAMES: Record<string, { frame: { x: number; y: number; w: number; h: number } }> =
  require('../../assets/poe2/official-tree/frame.json').frames;
const FRAME_SHEET_W = 583;
const FRAME_SHEET_H = 542;
const FRAME_SCALE   = 2;

// Line + orbit ring sprite sheet (official-tree/line.webp / line.json)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LINE_FRAMES: Record<string, { frame: { x: number; y: number; w: number; h: number } }> =
  require('../../assets/poe2/official-tree/line.json').frames;
const LINE_SHEET_W = 717;
const LINE_SHEET_H = 2215;

function getOrbitLineFrame(orbit: number, active: boolean) {
  const key = `line:Orbit${orbit}${active ? 'Active' : 'Normal'}`;
  return LINE_FRAMES[key]?.frame ?? null;
}

// Cached frame lookup — avoids repeated prefix concatenation in hot useMemo
const activeCoordCache   = new Map<string, { x: number; y: number }>();
const inactiveCoordCache = new Map<string, { x: number; y: number }>();

function getIconCoord(iconPath: string, allocated: boolean): { x: number; y: number } | null {
  const cache = allocated ? activeCoordCache : inactiveCoordCache;
  if (cache.has(iconPath)) return cache.get(iconPath)!;
  const prefix = allocated ? 'normalActive:' : 'normalInactive:';
  const entry  = (allocated ? SKILLS_ACTIVE_FRAMES : SKILLS_INACTIVE_FRAMES)[prefix + iconPath];
  if (!entry) { cache.set(iconPath, null as any); return null; }
  const coord = { x: entry.frame.x, y: entry.frame.y };
  cache.set(iconPath, coord);
  return coord;
}

const MINIMAP_SIZE = 130;
const MINIMAP_INNER = MINIMAP_SIZE - 20;
const VIEWPORT_PADDING = 0.25;
const TOOLTIP_WIDTH = 220;

interface Props {
  // Long-press detail sheet has been replaced by the inline tap tooltip
}

type Viewport = { minX: number; minY: number; maxX: number; maxY: number };

type NodeCategory = 'keystone' | 'notable' | 'mastery' | 'ascNormal' | 'jewel' | 'normal';

const CATEGORY_STYLE: Record<NodeCategory, { color: string; r: number; outerR: number }> = {
  keystone:  { color: COLORS.nodeKeystone, r: 30, outerR: 50 }, // large hex — needs extra clearance
  notable:   { color: COLORS.nodeNotable,  r: 22, outerR: 34 },
  mastery:   { color: COLORS.nodeMastery,  r: 18, outerR: 26 },
  ascNormal: { color: COLORS.nodeNormal,   r: 18, outerR: 26 },
  jewel:     { color: COLORS.nodeJewel,    r: 16, outerR: 26 }, // diamond corner-to-corner r
  normal:    { color: COLORS.nodeNormal,   r: 15, outerR: 22 },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_STYLE) as NodeCategory[];

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  keystone:  'Keystone',
  notable:   'Notable',
  mastery:   'Mastery',
  ascNormal: 'Ascendancy',
  jewel:     'Jewel Socket',
  normal:    'Passive',
};

function getCategory(node: TreeNode): NodeCategory {
  if (node.isKeystone) return 'keystone';
  if (node.isNotable) return 'notable';
  if (node.isMastery) return 'mastery';
  if (node.isJewelSocket) return 'jewel';
  if (node.ascendancyName) return 'ascNormal';
  return 'normal';
}

// ─── Shape helpers ────────────────────────────────────────────────────────────

/** Pointy-top regular hexagon — matches the PoE2 keystone frame silhouette. */
function addHexagon(path: SkPath, cx: number, cy: number, r: number): void {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2; // start vertex at 12 o'clock
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.close();
}

/** Axis-aligned diamond (square rotated 45°) — matches the PoE2 jewel socket shape. */
function addDiamond(path: SkPath, cx: number, cy: number, r: number): void {
  path.moveTo(cx,     cy - r);
  path.lineTo(cx + r, cy    );
  path.lineTo(cx,     cy + r);
  path.lineTo(cx - r, cy    );
  path.close();
}

function clamp(value: number, lo: number, hi: number): number {
  'worklet';
  return Math.max(lo, Math.min(hi, value));
}

function makeCategoryPaths(): Record<NodeCategory, SkPath> {
  return {
    keystone:  Skia.Path.Make(),
    notable:   Skia.Path.Make(),
    mastery:   Skia.Path.Make(),
    ascNormal: Skia.Path.Make(),
    jewel:     Skia.Path.Make(),
    normal:    Skia.Path.Make(),
  };
}

// ─── Inline tooltip component ────────────────────────────────────────────────

interface TooltipState {
  node: TreeNode;
  screenX: number;
  screenY: number;
}

interface NodeTooltipProps extends TooltipState {
  screenWidth: number;
  screenHeight: number;
}

function NodeTooltip({ node, screenX, screenY, screenWidth, screenHeight }: NodeTooltipProps) {
  const cat = getCategory(node);
  const color = CATEGORY_STYLE[cat].color;
  const typeLabel = CATEGORY_LABELS[cat];
  const stats = node.stats ?? [];

  // Centre the card horizontally over the tap, clamped within screen edges
  let left = screenX - TOOLTIP_WIDTH / 2;
  left = Math.max(8, Math.min(screenWidth - TOOLTIP_WIDTH - 8, left));

  // Place above the tap in the lower half of the screen, below in the upper half
  const positionStyle =
    screenY > screenHeight * 0.55
      ? { bottom: screenHeight - screenY + 18 }
      : { top: screenY + 18 };

  return (
    <View
      style={[tooltipStyles.card, { left, borderColor: color, ...positionStyle }]}
      pointerEvents="none"
    >
      <Text style={[tooltipStyles.name, { color }]} numberOfLines={1}>
        {node.name}
      </Text>
      <Text style={tooltipStyles.type}>{typeLabel}</Text>
      {stats.length > 0 && <View style={tooltipStyles.divider} />}
      {stats.map((s, i) => (
        <Text key={i} style={tooltipStyles.stat}>{s}</Text>
      ))}
    </View>
  );
}

const tooltipStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: TOOLTIP_WIDTH,
    maxHeight: 320,
    backgroundColor: 'rgba(11, 15, 26, 0.97)',
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    overflow: 'hidden',
    // borderColor supplied inline (category colour)
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
  },
  type: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  stat: {
    color: COLORS.text,
    fontSize: 12,
    lineHeight: 17,
  },
});

const frameCoordCache = new Map<string, { x: number; y: number; w: number; h: number } | null>();

function getFrameCoord(cat: NodeCategory, allocated: boolean) {
  let key: string;
  if (cat === 'keystone')       key = allocated ? 'frame:KeystoneFrameAllocated'        : 'frame:KeystoneFrameUnallocated';
  else if (cat === 'notable')   key = allocated ? 'frame:NotableFrameAllocated'          : 'frame:NotableFrameUnallocated';
  else if (cat === 'jewel')     key = allocated ? 'frame:JewelFrameAllocated'            : 'frame:JewelFrameUnallocated';
  else if (cat === 'ascNormal') key = allocated ? 'frame:AscendancyFrameNormalAllocated' : 'frame:AscendancyFrameNormalUnallocated';
  else                          key = allocated ? 'frame:PSSkillFrameActive'             : 'frame:PSSkillFrame';
  if (frameCoordCache.has(key)) return frameCoordCache.get(key)!;
  const entry = FRAME_FRAMES[key];
  if (!entry) { frameCoordCache.set(key, null); return null; }
  const { x, y, w, h } = entry.frame;
  frameCoordCache.set(key, { x, y, w, h });
  return frameCoordCache.get(key)!;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GraphicalSkillTree(_props: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const {
    nodes,
    nodePositions,
    treeBounds,
    classStartNodes,
    adjacency,
    allocatedNodes,
    selectedClass,
    selectedAscendancy,
    classes,
    toggleNode,
    spatialGrid,
    treeConstants,
    groupData,
    flyToNodeId,
    setFlyToNodeId,
    searchFilters,
    searchConnectives,
    liveSearchQuery,
  } = useTreeStore();

  // ── Texture images (all static requires — Metro resolves at bundle time) ──
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgTileImg      = useImage(require('../../assets/poe2/official-tree/background.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lineImage      = useImage(require('../../assets/poe2/official-tree/line.webp'));
  const frameImage     = useImage(require('../../assets/poe2/official-tree/frame.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgWarriorImg   = useImage(require('../../assets/poe2/official-tree/background-warrior.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgRangerImg    = useImage(require('../../assets/poe2/official-tree/background-ranger.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgHuntressImg  = useImage(require('../../assets/poe2/official-tree/background-huntress.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgMercenaryImg = useImage(require('../../assets/poe2/official-tree/background-mercenary.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgDruidImg     = useImage(require('../../assets/poe2/official-tree/background-druid.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgWitchImg     = useImage(require('../../assets/poe2/official-tree/background-witch.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgSorceressImg = useImage(require('../../assets/poe2/official-tree/background-sorceress.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bgMonkImg      = useImage(require('../../assets/poe2/official-tree/background-monk.webp'));

  // -------------------------------------------------------------------------
  // Fit scale: maps world coords → screen pixels at "view whole tree" zoom
  // -------------------------------------------------------------------------
  const fitScale = useMemo(() => {
    if (!treeBounds.width || !treeBounds.height) return 0.012;
    return Math.min(screenWidth / treeBounds.width, screenHeight / treeBounds.height) * 0.9;
  }, [treeBounds, screenWidth, screenHeight]);

  const fitTX = useMemo(
    () => screenWidth / 2 - (treeBounds.width / 2) * fitScale,
    [screenWidth, treeBounds.width, fitScale]
  );
  const fitTY = useMemo(
    () => screenHeight / 2 - (treeBounds.height / 2) * fitScale,
    [screenHeight, treeBounds.height, fitScale]
  );

  // Camera shared values — live on the UI thread for smooth animation
  const scale    = useSharedValue(fitScale);
  const panX     = useSharedValue(fitTX);
  const panY     = useSharedValue(fitTY);
  const savedScale = useSharedValue(fitScale);
  const savedPanX  = useSharedValue(fitTX);
  const savedPanY  = useSharedValue(fitTY);

  const screenWidthSV  = useSharedValue(screenWidth);
  const screenHeightSV = useSharedValue(screenHeight);
  useEffect(() => {
    screenWidthSV.value  = screenWidth;
    screenHeightSV.value = screenHeight;
  }, [screenWidth, screenHeight, screenWidthSV, screenHeightSV]);

  // Start zoomed in (10× fit) so nodes are immediately visible on first render
  useEffect(() => {
    if (!treeBounds.width || !treeBounds.height) {
      scale.value = fitScale; panX.value = fitTX; panY.value = fitTY;
      savedScale.value = fitScale; savedPanX.value = fitTX; savedPanY.value = fitTY;
      return;
    }
    const startScale = fitScale * 10;
    const startTX = screenWidth  / 2 - (treeBounds.width  / 2) * startScale;
    const startTY = screenHeight / 2 - (treeBounds.height / 2) * startScale;
    scale.value    = startScale; panX.value    = startTX; panY.value    = startTY;
    savedScale.value = startScale; savedPanX.value = startTX; savedPanY.value = startTY;
  }, [fitScale, fitTX, fitTY, treeBounds.width, treeBounds.height,
      screenWidth, screenHeight, scale, panX, panY, savedScale, savedPanX, savedPanY]);

  // -------------------------------------------------------------------------
  // Viewport culling — updated on gesture end (JS thread)
  // -------------------------------------------------------------------------
  const [viewport, setViewport] = useState<Viewport | null>(null);

  const computeViewport = useCallback(
    (sc: number, tx: number, ty: number): Viewport => {
      const worldMinX = (0 - tx) / sc;
      const worldMinY = (0 - ty) / sc;
      const worldMaxX = (screenWidth  - tx) / sc;
      const worldMaxY = (screenHeight - ty) / sc;
      const padW = (worldMaxX - worldMinX) * VIEWPORT_PADDING;
      const padH = (worldMaxY - worldMinY) * VIEWPORT_PADDING;
      return {
        minX: worldMinX - padW, minY: worldMinY - padH,
        maxX: worldMaxX + padW, maxY: worldMaxY + padH,
      };
    },
    [screenWidth, screenHeight]
  );

  useEffect(() => {
    if (!fitScale || !treeBounds.width || !treeBounds.height) return;
    const startScale = fitScale * 10;
    const startTX = screenWidth  / 2 - (treeBounds.width  / 2) * startScale;
    const startTY = screenHeight / 2 - (treeBounds.height / 2) * startScale;
    setViewport(computeViewport(startScale, startTX, startTY));
  }, [fitScale, treeBounds.width, treeBounds.height, screenWidth, screenHeight, computeViewport]);

  const updateViewportJS = useCallback(() => {
    setViewport(computeViewport(scale.value, panX.value, panY.value));
  }, [computeViewport, scale, panX, panY]);

  // Sprite sheet images for node icons
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const skillsActiveImage  = useImage(require('../../assets/poe2/official-tree/skills.webp'));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const skillsInactiveImage = useImage(require('../../assets/poe2/official-tree/skills-disabled.webp'));

  // -------------------------------------------------------------------------
  // Ascendancy repositioning — selected ascendancy cluster is translated to
  // the centre of the main tree so it appears inline rather than at the edge.
  // -------------------------------------------------------------------------

  const mainTreeCenter = useMemo(() => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const node of Object.values(nodes)) {
      if (node.ascendancyName) continue;
      const p = nodePositions[node.skill];
      if (!p) continue;
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return isFinite(x0)
      ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
      : { x: treeBounds.width / 2, y: treeBounds.height / 2 };
  }, [nodes, nodePositions, treeBounds]);

  const ascendancyOffset = useMemo(() => {
    if (!selectedAscendancy) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const node of Object.values(nodes)) {
      if (node.ascendancyName !== selectedAscendancy) continue;
      const p = nodePositions[node.skill];
      if (!p) continue;
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    if (!isFinite(x0)) return null;
    return { dx: mainTreeCenter.x - (x0 + x1) / 2, dy: mainTreeCenter.y - (y0 + y1) / 2 };
  }, [selectedAscendancy, nodes, nodePositions, mainTreeCenter]);

  const displayPositions = useMemo(() => {
    if (!ascendancyOffset || !selectedAscendancy) return nodePositions;
    const { dx, dy } = ascendancyOffset;
    const out: Record<number, { x: number; y: number }> = { ...nodePositions };
    for (const node of Object.values(nodes)) {
      if (node.ascendancyName !== selectedAscendancy) continue;
      const p = nodePositions[node.skill];
      if (p) out[node.skill] = { x: p.x + dx, y: p.y + dy };
    }
    return out;
  }, [ascendancyOffset, selectedAscendancy, nodes, nodePositions]);

  // Map class name → its loaded background image (for the ascendancy artwork layer)
  const classBgImages = useMemo(() => ({
    Warrior:   bgWarriorImg,
    Ranger:    bgRangerImg,
    Huntress:  bgHuntressImg,
    Mercenary: bgMercenaryImg,
    Druid:     bgDruidImg,
    Witch:     bgWitchImg,
    Sorceress: bgSorceressImg,
    Monk:      bgMonkImg,
  } as Record<string, ReturnType<typeof useImage>>), [
    bgWarriorImg, bgRangerImg, bgHuntressImg, bgMercenaryImg,
    bgDruidImg, bgWitchImg, bgSorceressImg, bgMonkImg,
  ]);

  // Which sprite within the 2×2 class atlas to show for the selected ascendancy.
  // Each atlas is 3000×3000px (scale:0.5 → display 6000×6000wu); each sprite 1500×1500px → 3000wu.
  const ascBgSprite = useMemo(() => {
    if (!selectedAscendancy || !selectedClass) return null;
    const cls = classes.find(c => c.name === selectedClass);
    if (!cls) return null;
    const ascIdx = cls.ascendancies.findIndex(a => a.name === selectedAscendancy);
    if (ascIdx < 0) return null;
    const SPRITE_PX = 1500;
    const dstSize = SPRITE_PX * FRAME_SCALE; // 3000wu — centred at mainTreeCenter
    return {
      sx: (ascIdx % 2) * SPRITE_PX,
      sy: Math.floor(ascIdx / 2) * SPRITE_PX,
      sheetPx: 3000, // full atlas side (px)
      dstSize,
    };
  }, [selectedAscendancy, selectedClass, classes]);

  // -------------------------------------------------------------------------
  // Fly-to: search result → spring camera to that node (uses display positions
  // so searching for an ascendancy node flies to its repositioned location)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (flyToNodeId == null) return;
    const pos = displayPositions[flyToNodeId];
    if (!pos) { setFlyToNodeId(null); return; }
    const targetScale = fitScale * 20;
    const targetTX = screenWidth  / 2 - pos.x * targetScale;
    const targetTY = screenHeight / 2 - pos.y * targetScale;
    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value  = withSpring(targetTX,   { damping: 20, stiffness: 120 });
    panY.value  = withSpring(targetTY,   { damping: 20, stiffness: 120 });
    setViewport(computeViewport(targetScale, targetTX, targetTY));
    setFlyToNodeId(null);
  }, [flyToNodeId, setFlyToNodeId, displayPositions, fitScale,
      screenWidth, screenHeight, scale, panX, panY, computeViewport]);

  // -------------------------------------------------------------------------
  // Class fly-to — spring to the class start node in the main tree
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedClass) return;
    const startId = classStartNodes[selectedClass];
    if (startId == null) return;
    const pos = nodePositions[startId]; // class start is always a main-tree node
    if (!pos) return;
    const targetScale = fitScale * 10;
    const targetTX = screenWidth  / 2 - pos.x * targetScale;
    const targetTY = screenHeight / 2 - pos.y * targetScale;
    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value  = withSpring(targetTX,   { damping: 20, stiffness: 120 });
    panY.value  = withSpring(targetTY,   { damping: 20, stiffness: 120 });
  }, [selectedClass, classStartNodes, nodePositions, fitScale,
      screenWidth, screenHeight, scale, panX, panY]);

  // -------------------------------------------------------------------------
  // Ascendancy fly-to — spring to the tree centre (where the repositioned
  // ascendancy cluster now lives) whenever the selected ascendancy changes
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!selectedAscendancy || !ascendancyOffset) return;
    const targetScale = fitScale * 15;
    const targetTX = screenWidth  / 2 - mainTreeCenter.x * targetScale;
    const targetTY = screenHeight / 2 - mainTreeCenter.y * targetScale;
    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value  = withSpring(targetTX,   { damping: 20, stiffness: 120 });
    panY.value  = withSpring(targetTY,   { damping: 20, stiffness: 120 });
    setViewport(computeViewport(targetScale, targetTX, targetTY));
  }, [selectedAscendancy, ascendancyOffset, mainTreeCenter, fitScale,
      screenWidth, screenHeight, scale, panX, panY, computeViewport]);

  // -------------------------------------------------------------------------
  // Animated Group transform — UI thread, no JS bridge during gestures
  // -------------------------------------------------------------------------
  const transform = useDerivedValue(() => [
    { translateX: panX.value },
    { translateY: panY.value },
    { scale: scale.value },
  ]);

  // -------------------------------------------------------------------------
  // Non-scaling stroke widths — divide by scale so edges stay 1–3 screen px
  // regardless of zoom level (Skia equivalent of SVG vectorEffect=non-scaling-stroke)
  // -------------------------------------------------------------------------
  const edgeStrokeUnalloc    = useDerivedValue(() => 1.5  / scale.value);
  const edgeStrokeAlloc      = useDerivedValue(() => 2.5  / scale.value);
  const highlightStroke      = useDerivedValue(() => 3.0  / scale.value);
  const edgeGlowStroke       = useDerivedValue(() => 10.0 / scale.value);
  // -------------------------------------------------------------------------
  // Minimap viewport rect — world-coordinate positions animated on UI thread
  // -------------------------------------------------------------------------
  const minimapViewX = useDerivedValue(() => (0 - panX.value) / scale.value);
  const minimapViewY = useDerivedValue(() => (0 - panY.value) / scale.value);
  const minimapViewW = useDerivedValue(() => screenWidthSV.value  / scale.value);
  const minimapViewH = useDerivedValue(() => screenHeightSV.value / scale.value);

  // -------------------------------------------------------------------------
  // Tooltip state — shows node name, type and stats on tap
  // -------------------------------------------------------------------------
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTooltip = useCallback(() => setTooltip(null), []);

  // -------------------------------------------------------------------------
  // Gesture handlers
  // -------------------------------------------------------------------------
  const panGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1) // single-finger only — prevents pan while pinching
    .minDistance(5)
    .onStart(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
      runOnJS(clearTooltip)(); // dismiss tooltip when user starts panning
    })
    .onUpdate((e) => {
      panX.value = savedPanX.value + e.translationX;
      panY.value = savedPanY.value + e.translationY;
    })
    .onEnd(() => { runOnJS(updateViewportJS)(); });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      savedPanX.value  = panX.value;
      savedPanY.value  = panY.value;
      runOnJS(clearTooltip)(); // dismiss tooltip when user starts zooming
    })
    .onUpdate((e) => {
      const newScale = clamp(savedScale.value * e.scale, fitScale * 0.5, fitScale * 500);
      const ratio = newScale / savedScale.value;
      panX.value = e.focalX - (e.focalX - savedPanX.value) * ratio;
      panY.value = e.focalY - (e.focalY - savedPanY.value) * ratio;
      scale.value = newScale;
    })
    .onEnd(() => { runOnJS(updateViewportJS)(); });

  // Hit test: screen coords → nearest world-space node
  const hitTest = useCallback(
    (screenX: number, screenY: number, threshPx: number): number | null => {
      const sc = scale.value;
      const tx = panX.value;
      const ty = panY.value;
      const wx = (screenX - tx) / sc;
      const wy = (screenY - ty) / sc;
      const threshWorld = threshPx / sc;
      const threshSq    = threshWorld * threshWorld;
      let bestId: number | null = null;
      let bestDist = threshSq;
      for (const [idStr, pos] of Object.entries(displayPositions)) {
        const n = nodes[Number(idStr)];
        if (!n || isAnchorNode(n)) continue;
        const dx = pos.x - wx;
        const dy = pos.y - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) { bestDist = d2; bestId = Number(idStr); }
      }
      return bestId;
    },
    [displayPositions, scale, panX, panY]
  );

  const handleTap = useCallback(
    (screenX: number, screenY: number) => {
      const id = hitTest(screenX, screenY, 36);
      if (id !== null) {
        // Allocate / deallocate the node
        toggleNode(id);
        // Show tooltip with node details
        const node = nodes[id];
        if (node) {
          if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
          setTooltip({ node, screenX, screenY });
          // Auto-dismiss after 2.5 s
          tooltipTimerRef.current = setTimeout(() => setTooltip(null), 2500);
        }
      } else {
        // Tap on empty space → dismiss any open tooltip
        setTooltip(null);
      }
    },
    [hitTest, toggleNode, nodes]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);

  const tapGesture = Gesture.Tap().onEnd((e) => {
    runOnJS(handleTap)(e.x, e.y);
  });

  const gesture = Gesture.Simultaneous(panGesture, pinchGesture, tapGesture);

  // -------------------------------------------------------------------------
  // Ascendancy highlight sets
  // -------------------------------------------------------------------------
  const classAscendancyNames = useMemo(() => {
    if (!selectedClass) return new Set<string>();
    const cls = classes.find((c) => c.name === selectedClass);
    return new Set(cls?.ascendancies.map((a) => a.name) ?? []);
  }, [classes, selectedClass]);

  const highlightedAscendancies = useMemo(() => {
    if (selectedAscendancy) return new Set([selectedAscendancy]);
    if (selectedClass) return classAscendancyNames;
    return new Set<string>();
  }, [selectedAscendancy, selectedClass, classAscendancyNames]);

  const visuallyAllocated = useMemo(() => {
    if (!selectedClass) return allocatedNodes;
    const startId = classStartNodes[selectedClass];
    if (startId == null) return allocatedNodes;
    const expanded = new Set(allocatedNodes);
    expanded.add(startId);
    return expanded;
  }, [allocatedNodes, selectedClass, classStartNodes]);

  const visibleNodeIds = useMemo(() => {
    let ids: Set<number> | null = null;
    if (spatialGrid && viewport) {
      const found = queryVisibleNodes(
        spatialGrid, viewport.minX, viewport.minY, viewport.maxX, viewport.maxY
      );
      if (found.size > 0) ids = new Set(found);
    }
    // Selected ascendancy nodes are at display positions (not their spatial-grid slots),
    // so always include them regardless of viewport.
    if (selectedAscendancy) {
      for (const node of Object.values(nodes)) {
        if (node.ascendancyName !== selectedAscendancy) continue;
        if (!ids) ids = new Set();
        ids.add(node.skill);
      }
    }
    return ids;
  }, [spatialGrid, viewport, selectedAscendancy, nodes]);

  // -------------------------------------------------------------------------
  // Group visibility — filter groups to those overlapping the current viewport
  // -------------------------------------------------------------------------
  const visibleGroups = useMemo(() => {
    if (!viewport) return groupData;
    return groupData.filter((g) => {
      const r = g.maxOrbitRadius + 200;
      return (
        g.x + r > viewport.minX && g.x - r < viewport.maxX &&
        g.y + r > viewport.minY && g.y - r < viewport.maxY
      );
    });
  }, [groupData, viewport]);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — edges
  // -------------------------------------------------------------------------
  const { unallocEdgePath, allocEdgePath } = useMemo(() => {
    const unalloc = Skia.Path.Make();
    const alloc   = Skia.Path.Make();
    const { orbitRadii, skillsPerOrbit } = treeConstants;

    for (const node of Object.values(nodes)) {
      if (isAnchorNode(node)) continue;
      const fromPos = displayPositions[node.skill];
      if (!fromPos) continue;

      for (const connId of adjacency[node.skill] ?? []) {
        // adjacency is undirected — skip duplicates by only drawing edge when fromId < toId
        if (node.skill >= connId) continue;

        const toNode = nodes[connId];
        // Skip edges to/from anchor nodes
        if (!toNode || isAnchorNode(toNode)) continue;

        // Skip cross-ascendancy edges — these connect class start nodes to ascendancy
        // sub-tree starts (and vice versa) spanning ~15 000+ world units across the tree.
        const fromAsc = node.ascendancyName ?? null;
        const toAsc   = toNode?.ascendancyName ?? null;
        if (fromAsc !== toAsc) continue;

        const toPos = displayPositions[connId];
        if (!toPos) continue;

        if (visibleNodeIds &&
            !visibleNodeIds.has(node.skill) &&
            !visibleNodeIds.has(connId)) continue;

        const path = (visuallyAllocated.has(node.skill) && visuallyAllocated.has(connId))
          ? alloc : unalloc;

        // Same-group, same-orbit connections are arcs along the orbit ring.
        // For ascendancy nodes the group centre must be recovered from the display position
        // (which already incorporates the ascendancy offset), so the arc stays correct.
        if (
          toNode !== undefined &&
          node.group !== undefined &&
          node.group === toNode.group &&
          node.orbit !== undefined &&
          node.orbit === toNode.orbit &&
          node.orbit > 0
        ) {
          const r = orbitRadii[node.orbit] ?? 0;
          const n = skillsPerOrbit[node.orbit] ?? 1;
          const idxA = node.orbitIndex  ?? 0;
          const idxB = toNode.orbitIndex ?? 0;

          const angleA  = n <= 1 ? 0 : (2 * Math.PI * idxA) / n;
          const centerX = fromPos.x - Math.sin(angleA) * r;
          const centerY = fromPos.y + Math.cos(angleA) * r;

          const startDeg = (idxA / n) * 360 - 90;
          const endDeg   = (idxB / n) * 360 - 90;

          let sweep = endDeg - startDeg;
          if (sweep >  180) sweep -= 360;
          if (sweep < -180) sweep += 360;

          path.addArc(
            { x: centerX - r, y: centerY - r, width: 2 * r, height: 2 * r },
            startDeg,
            sweep
          );
        } else {
          path.moveTo(fromPos.x, fromPos.y);
          path.lineTo(toPos.x,   toPos.y);
        }
      }
    }
    return { unallocEdgePath: unalloc, allocEdgePath: alloc };
  }, [nodes, adjacency, displayPositions, visuallyAllocated, visibleNodeIds, treeConstants]);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — nodes
  // -------------------------------------------------------------------------
  const ascendancyHighlightPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const node of Object.values(nodes)) {
      if (isAnchorNode(node) || !node.ascendancyName) continue;
      if (!highlightedAscendancies.has(node.ascendancyName)) continue;
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      path.addCircle(pos.x, pos.y, CATEGORY_STYLE[getCategory(node)].r + 10);
    }
    return path;
  }, [nodes, displayPositions, highlightedAscendancies, visibleNodeIds]);

  // -------------------------------------------------------------------------
  // NODE ICONS — sprite sheet, always rendered
  // -------------------------------------------------------------------------
  interface IconDraw {
    wx: number; wy: number;
    sx: number; sy: number;
    allocated: boolean;
    dstSize: number;
  }

  const iconDraws = useMemo((): IconDraw[] => {
    const result: IconDraw[] = [];
    for (const node of Object.values(nodes)) {
      if (!node.icon || isAnchorNode(node)) continue;
      const cat = getCategory(node);
      if (cat === 'keystone') continue; // no matching sprite in the sheet
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      const alloc = visuallyAllocated.has(node.skill);
      const coord = getIconCoord(node.icon, alloc);
      if (!coord) continue;
      // Notables get a larger icon to better fill their bigger frame
      const dstSize = cat === 'notable' ? SPRITE_SIZE * ICON_SCALE * 1.35 : SPRITE_SIZE * ICON_SCALE;
      result.push({
        wx: pos.x - dstSize / 2,
        wy: pos.y - dstSize / 2,
        sx: coord.x,
        sy: coord.y,
        allocated: alloc,
        dstSize,
      });
    }
    return result;
  }, [nodes, displayPositions, visuallyAllocated, visibleNodeIds]);

  // -------------------------------------------------------------------------
  // NODE FRAMES — GGG official frame sprite sheet (frame.webp / frame.json)
  // -------------------------------------------------------------------------
  interface FrameDraw {
    wx: number; wy: number;
    sx: number; sy: number;
    sw: number; sh: number;
  }

  const frameDraws = useMemo((): FrameDraw[] => {
    const result: FrameDraw[] = [];
    for (const node of Object.values(nodes)) {
      if (isAnchorNode(node)) continue;
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      const cat   = getCategory(node);
      const alloc = visuallyAllocated.has(node.skill);
      const fc    = getFrameCoord(cat, alloc);
      if (!fc) continue;
      const dstW = fc.w * FRAME_SCALE;
      const dstH = fc.h * FRAME_SCALE;
      result.push({ wx: pos.x - dstW / 2, wy: pos.y - dstH / 2, sx: fc.x, sy: fc.y, sw: fc.w, sh: fc.h });
    }
    return result;
  }, [nodes, displayPositions, visibleNodeIds, visuallyAllocated]);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — keystone soft glow (large transparent circle behind
  // each allocated keystone to give it a halo / aura effect)
  // -------------------------------------------------------------------------
  const keystoneGlowPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const node of Object.values(nodes)) {
      if (!node.isKeystone) continue;
      if (!visuallyAllocated.has(node.skill)) continue;
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      if (visibleNodeIds && !visibleNodeIds.has(node.skill)) continue;
      path.addCircle(pos.x, pos.y, CATEGORY_STYLE.keystone.outerR * 2.2);
    }
    return path;
  }, [nodes, displayPositions, visuallyAllocated, visibleNodeIds]);

  // -------------------------------------------------------------------------
  // SEARCH HIGHLIGHT — compute matching node IDs from persistent filters
  // and the live query while the modal is open
  // -------------------------------------------------------------------------

  // Helper: returns the Set of node IDs whose name contains the given query string
  const matchNodes = useCallback((q: string): Set<number> => {
    const lower = q.trim().toLowerCase();
    if (!lower) return new Set();
    const ids = new Set<number>();
    for (const node of Object.values(nodes)) {
      if (node.name.toLowerCase().includes(lower)) ids.add(node.skill);
    }
    return ids;
  }, [nodes]);

  const searchHighlightIds = useMemo((): Set<number> => {
    // While the search modal is open, show only the live-query preview
    if (liveSearchQuery.trim()) return matchNodes(liveSearchQuery);

    // No persistent filters → nothing to highlight
    if (searchFilters.length === 0) return new Set();

    // Compute per-filter match sets
    const matchSets = searchFilters.map((f) => matchNodes(f.query));

    // Combine left-to-right with connectives
    let result = matchSets[0];
    for (let i = 0; i < searchConnectives.length; i++) {
      const right = matchSets[i + 1];
      if (searchConnectives[i] === 'AND') {
        const intersection = new Set<number>();
        for (const id of result) { if (right.has(id)) intersection.add(id); }
        result = intersection;
      } else {
        result = new Set([...result, ...right]);
      }
    }
    return result;
  }, [liveSearchQuery, searchFilters, searchConnectives, matchNodes]);

  // Pulsing gold glow — bloom fill (soft corona) + sharp ring stroke
  const searchGlowPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const id of searchHighlightIds) {
      const node = nodes[id];
      if (!node || isAnchorNode(node)) continue;
      const pos = displayPositions[id];
      if (!pos) continue;
      // Large bloom — 3.5× outerR radiates well beyond the node frame
      path.addCircle(pos.x, pos.y, CATEGORY_STYLE[getCategory(node)].outerR * 3.5);
    }
    return path;
  }, [searchHighlightIds, displayPositions, nodes]);

  const searchRingPath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const id of searchHighlightIds) {
      const node = nodes[id];
      if (!node || isAnchorNode(node)) continue;
      const pos = displayPositions[id];
      if (!pos) continue;
      const cat = getCategory(node);
      const outerR = CATEGORY_STYLE[cat].outerR;
      if (cat === 'keystone') {
        addHexagon(path, pos.x, pos.y, outerR * 1.6);
      } else if (cat === 'jewel') {
        addDiamond(path, pos.x, pos.y, outerR * 1.6);
      } else {
        path.addCircle(pos.x, pos.y, outerR * 1.6);
      }
    }
    return path;
  }, [searchHighlightIds, displayPositions, nodes]);

  // Pulse animation: 0 → 1 → 0, looping at ~700 ms per half-cycle
  const pulseAnim = useSharedValue(0);
  const hasHighlights = searchHighlightIds.size > 0;
  useEffect(() => {
    if (hasHighlights) {
      pulseAnim.value = withRepeat(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseAnim);
      pulseAnim.value = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHighlights]);

  // Opacity derived values for the two glow layers
  const searchBloomOpacity  = useDerivedValue(() => 0.08 + pulseAnim.value * 0.22);
  const searchRingOpacity   = useDerivedValue(() => 0.5  + pulseAnim.value * 0.5);
  // Non-scaling ring stroke so it stays ~5 screen px regardless of zoom
  const searchRingStroke    = useDerivedValue(() => 5.0  / scale.value);

  // -------------------------------------------------------------------------
  // SKIA PATH BUILDING — minimap (once after tree loads)
  // -------------------------------------------------------------------------
  const minimapPaths = useMemo(() => {
    const paths = makeCategoryPaths();
    for (const node of Object.values(nodes)) {
      if (isAnchorNode(node)) continue;
      const pos = displayPositions[node.skill];
      if (!pos) continue;
      const cat = getCategory(node);
      const r = cat === 'keystone' ? 1400 : cat === 'notable' ? 1000 : 700;
      paths[cat].addCircle(pos.x, pos.y, r);
    }
    return paths;
  }, [nodes, displayPositions]);

  const showMinimap = treeBounds.width > 0 && treeBounds.height > 0;
  const minimapBottom = 54 + insets.bottom;
  const mmScaleX = showMinimap ? MINIMAP_INNER / treeBounds.width  : 1;
  const mmScaleY = showMinimap ? MINIMAP_INNER / treeBounds.height : 1;

  // Shared values so the minimap gesture worklet can read the current scale factors
  const mmScaleXSV = useSharedValue(mmScaleX);
  const mmScaleYSV = useSharedValue(mmScaleY);
  useEffect(() => {
    mmScaleXSV.value = mmScaleX;
    mmScaleYSV.value = mmScaleY;
  }, [mmScaleX, mmScaleY, mmScaleXSV, mmScaleYSV]);

  // Minimap padding: the inner canvas sits centred inside the outer View with this offset
  const MINIMAP_PAD = (MINIMAP_SIZE - MINIMAP_INNER) / 2; // = 10

  const minimapGesture = Gesture.Pan()
    .onBegin((e) => {
      // Convert minimap touch → world coordinate → re-centre camera
      const worldX = (e.x - MINIMAP_PAD) / mmScaleXSV.value;
      const worldY = (e.y - MINIMAP_PAD) / mmScaleYSV.value;
      panX.value = screenWidthSV.value  / 2 - worldX * scale.value;
      panY.value = screenHeightSV.value / 2 - worldY * scale.value;
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    })
    .onUpdate((e) => {
      const worldX = (e.x - MINIMAP_PAD) / mmScaleXSV.value;
      const worldY = (e.y - MINIMAP_PAD) / mmScaleYSV.value;
      panX.value = screenWidthSV.value  / 2 - worldX * scale.value;
      panY.value = screenHeightSV.value / 2 - worldY * scale.value;
    })
    .onEnd(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
      runOnJS(updateViewportJS)();
    });

  return (
    <View style={styles.container}>
      {/* Main canvas */}
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <Canvas style={StyleSheet.absoluteFill}>
            {/* Layer 0: Dark base — shows while background tile loads */}
            <Rect x={0} y={0} width={screenWidth} height={screenHeight} color={COLORS.bgDeep} />

            <Group transform={transform as any}>
              {/* Layer 0.5: World-space tiling background texture */}
              {bgTileImg && treeBounds.width > 0 && (
                <Rect x={-2000} y={-2000} width={treeBounds.width + 4000} height={treeBounds.height + 4000}>
                  <ImageShader image={bgTileImg} tx="repeat" ty="repeat" fit="none" />
                </Rect>
              )}

              {/* Layer 0.7: Ascendancy circular artwork — centred at main tree centre */}
              {ascBgSprite && selectedClass && (() => {
                const img = classBgImages[selectedClass];
                if (!img) return null;
                const { sx, sy, sheetPx, dstSize } = ascBgSprite;
                const s = FRAME_SCALE; // 2 — sheet px → world units
                const cx = mainTreeCenter.x;
                const cy = mainTreeCenter.y;
                const imgX = cx - dstSize / 2 - sx * s;
                const imgY = cy - dstSize / 2 - sy * s;
                return (
                  <Group clip={Skia.XYWHRect(cx - dstSize / 2, cy - dstSize / 2, dstSize, dstSize)}>
                    <SkiaImage
                      image={img}
                      x={imgX}
                      y={imgY}
                      width={sheetPx * s}
                      height={sheetPx * s}
                      opacity={0.7}
                    />
                  </Group>
                );
              })()}

              {/* Layer 2: Orbit ring textures from official line sprite sheet */}
              {lineImage && visibleGroups.map(g => {
                if (g.isAscendancy) return null;
                return (
                  <Group key={`orbits-${g.id}`}>
                    {g.orbits.filter(o => o > 0).map(orbit => {
                      const radius = treeConstants.orbitRadii[orbit] ?? 0;
                      if (radius <= 0) return null;
                      const frame = getOrbitLineFrame(orbit, false);
                      if (!frame) return null;
                      // Scale the sheet so this sprite's width exactly spans the ring diameter
                      const dst = radius * 2;
                      const s = dst / frame.w;
                      const imgX = g.x - radius - frame.x * s;
                      const imgY = g.y - radius - frame.y * s;
                      return (
                        <Group key={orbit} clip={Skia.XYWHRect(g.x - radius, g.y - radius, dst, dst)}>
                          <SkiaImage
                            image={lineImage}
                            x={imgX}
                            y={imgY}
                            width={LINE_SHEET_W * s}
                            height={LINE_SHEET_H * s}
                            opacity={0.55}
                          />
                        </Group>
                      );
                    })}
                  </Group>
                );
              })}

              {/* Layer 3: Unallocated edges */}
              <SkiaPath
                path={unallocEdgePath}
                color={COLORS.border}
                style="stroke"
                strokeWidth={edgeStrokeUnalloc as any}
                opacity={0.75}
              />
              {/* Layer 4: Allocated edge glow — wide transparent pass */}
              <SkiaPath
                path={allocEdgePath}
                color={COLORS.gold}
                style="stroke"
                strokeWidth={edgeGlowStroke as any}
                opacity={0.15}
              />
              {/* Layer 5: Allocated edges — solid gold */}
              <SkiaPath
                path={allocEdgePath}
                color={COLORS.gold}
                style="stroke"
                strokeWidth={edgeStrokeAlloc as any}
                opacity={0.9}
              />

              {/* Layer 6: Ascendancy highlight rings */}
              <SkiaPath
                path={ascendancyHighlightPath}
                color={COLORS.teal}
                style="stroke"
                strokeWidth={highlightStroke as any}
                opacity={0.8}
              />

              {/* Layer 6.5: Keystone aura — soft glow behind allocated keystones */}
              <SkiaPath
                path={keystoneGlowPath}
                color={COLORS.nodeKeystone}
                style="fill"
                opacity={0.07}
              />

              {/* Layer 6.7: Search highlight — bloom fill (soft pulsing corona) */}
              <SkiaPath
                path={searchGlowPath}
                color={COLORS.gold}
                style="fill"
                opacity={searchBloomOpacity as any}
              />
              {/* Layer 6.8: Search highlight — ring stroke (sharp pulsing ring) */}
              <SkiaPath
                path={searchRingPath}
                color={COLORS.gold}
                style="stroke"
                strokeWidth={searchRingStroke as any}
                opacity={searchRingOpacity as any}
              />

              {/* Layer 7: Node icons — rendered under the frame ring */}
              {iconDraws.map((ic, idx) => {
                const img = ic.allocated ? skillsActiveImage : skillsInactiveImage;
                if (!img) return null;
                const s = ic.dstSize / SPRITE_SIZE; // world units per sprite pixel
                const imgX = ic.wx - ic.sx * s;
                const imgY = ic.wy - ic.sy * s;
                return (
                  <Group key={idx} clip={Skia.XYWHRect(ic.wx, ic.wy, ic.dstSize, ic.dstSize)}>
                    <SkiaImage
                      image={img}
                      x={imgX}
                      y={imgY}
                      width={SPRITE_SHEET_W * s}
                      height={SPRITE_SHEET_H * s}
                    />
                  </Group>
                );
              })}

              {/* Layer 8: Node frames — GGG official sprite sheet, drawn on top of icon */}
              {frameImage && frameDraws.map((fd, idx) => {
                const dstW = fd.sw * FRAME_SCALE;
                const dstH = fd.sh * FRAME_SCALE;
                const imgX = fd.wx - fd.sx * FRAME_SCALE;
                const imgY = fd.wy - fd.sy * FRAME_SCALE;
                return (
                  <Group key={idx} clip={Skia.XYWHRect(fd.wx, fd.wy, dstW, dstH)}>
                    <SkiaImage
                      image={frameImage}
                      x={imgX}
                      y={imgY}
                      width={FRAME_SHEET_W * FRAME_SCALE}
                      height={FRAME_SHEET_H * FRAME_SCALE}
                    />
                  </Group>
                );
              })}

            </Group>
          </Canvas>
        </View>
      </GestureDetector>

      {/* Minimap — touch/drag to pan the main camera (MOBA-style) */}
      {showMinimap && (
        <GestureDetector gesture={minimapGesture}>
          <View style={[styles.minimap, { bottom: minimapBottom }]}>
            <Canvas style={{ width: MINIMAP_INNER, height: MINIMAP_INNER }}>
              <Group transform={[{ scaleX: mmScaleX }, { scaleY: mmScaleY }]}>
                {CATEGORY_KEYS.map(cat => (
                  <SkiaPath
                    key={cat}
                    path={minimapPaths[cat]}
                    color={CATEGORY_STYLE[cat].color}
                    opacity={0.65}
                  />
                ))}
                <Rect
                  x={minimapViewX as any}
                  y={minimapViewY as any}
                  width={minimapViewW as any}
                  height={minimapViewH as any}
                  color="rgba(201,168,76,0.06)"
                />
                <Rect
                  x={minimapViewX as any}
                  y={minimapViewY as any}
                  width={minimapViewW as any}
                  height={minimapViewH as any}
                  color={COLORS.gold}
                  style="stroke"
                  strokeWidth={500}
                  opacity={0.85}
                />
              </Group>
            </Canvas>
          </View>
        </GestureDetector>
      )}

      {/* Node tooltip — pointerEvents="none" so gestures pass through */}
      {tooltip && (
        <NodeTooltip
          node={tooltip.node}
          screenX={tooltip.screenX}
          screenY={tooltip.screenY}
          screenWidth={screenWidth}
          screenHeight={screenHeight}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  minimap: {
    position: 'absolute',
    right: 12,
    width: MINIMAP_SIZE,
    height: MINIMAP_SIZE,
    backgroundColor: 'rgba(10, 14, 26, 0.88)',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
