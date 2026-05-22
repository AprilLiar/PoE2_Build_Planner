import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { G, Circle, Line } from 'react-native-svg';
import { useTreeStore, TreeNode, nodeTypeBadgeColor, nodeRadius } from '../store/useTreeStore';
import { COLORS } from '../constants/colors';

/*
 * We use AnimatedG (react-native-svg's G element wrapped by Reanimated) with an
 * SVG transform string so the scale is around the SVG origin (0, 0).
 * This keeps the focal-point zoom formula dead-simple:
 *   panX_new = focalX - (focalX - savedPanX) * ratio
 *
 * Node positions are stored as raw world coordinates (e.g. x ∈ [0, ~32470]).
 * The AnimatedG maps them to screen via: screen = world * scale + (panX, panY).
 * Initial scale = fitScale so the whole tree fits on screen.
 */
const AnimatedG = Animated.createAnimatedComponent(G);

interface Props {
  onNodeLongPress: (node: TreeNode) => void;
}

function clamp(value: number, lo: number, hi: number): number {
  'worklet';
  return Math.max(lo, Math.min(hi, value));
}

export default function GraphicalSkillTree({ onNodeLongPress }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const {
    nodes,
    nodePositions,
    treeBounds,
    classStartNodes,
    allocatedNodes,
    selectedClass,
    selectedAscendancy,
    classes,
    toggleNode,
  } = useTreeStore();

  // -----------------------------------------------------------------------
  // Fit scale: maps world coords to screen at "view whole tree" zoom
  // -----------------------------------------------------------------------
  const fitScale = useMemo(() => {
    if (!treeBounds.width || !treeBounds.height) return 0.012;
    return Math.min(screenWidth / treeBounds.width, screenHeight / treeBounds.height) * 0.9;
  }, [treeBounds, screenWidth, screenHeight]);

  // Initial translation to centre the tree on screen when scale = fitScale
  const fitTX = useMemo(
    () => screenWidth / 2 - (treeBounds.width / 2) * fitScale,
    [screenWidth, treeBounds.width, fitScale]
  );
  const fitTY = useMemo(
    () => screenHeight / 2 - (treeBounds.height / 2) * fitScale,
    [screenHeight, treeBounds.height, fitScale]
  );

  // -----------------------------------------------------------------------
  // Camera: shared values (scale is absolute SVG scale, not a multiplier)
  // -----------------------------------------------------------------------
  const scale = useSharedValue(fitScale);
  const panX = useSharedValue(fitTX);
  const panY = useSharedValue(fitTY);

  const savedScale = useSharedValue(fitScale);
  const savedPanX = useSharedValue(fitTX);
  const savedPanY = useSharedValue(fitTY);

  // Re-centre when tree finishes loading (treeBounds / fitScale become available)
  useEffect(() => {
    scale.value = fitScale;
    panX.value = fitTX;
    panY.value = fitTY;
    savedScale.value = fitScale;
    savedPanX.value = fitTX;
    savedPanY.value = fitTY;
  }, [fitScale, fitTX, fitTY, scale, panX, panY, savedScale, savedPanX, savedPanY]);

  // -----------------------------------------------------------------------
  // Camera: fly to class start when selectedClass changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!selectedClass) return;
    const startId = classStartNodes[selectedClass];
    if (startId == null) return;
    const pos = nodePositions[startId];
    if (!pos) return;

    // Show the class start area at a zoom level where clusters are readable
    const targetScale = fitScale * 10;
    const targetTX = screenWidth / 2 - pos.x * targetScale;
    const targetTY = screenHeight / 2 - pos.y * targetScale;

    scale.value = withSpring(targetScale, { damping: 20, stiffness: 120 });
    panX.value = withSpring(targetTX, { damping: 20, stiffness: 120 });
    panY.value = withSpring(targetTY, { damping: 20, stiffness: 120 });
  }, [
    selectedClass,
    classStartNodes,
    nodePositions,
    fitScale,
    screenWidth,
    screenHeight,
    scale,
    panX,
    panY,
  ]);

  // -----------------------------------------------------------------------
  // AnimatedG props — drives the SVG group transform on the UI thread.
  //
  // SVG transform "translate(tx, ty) scale(s)" applied right-to-left:
  //   1. scale(s)    — multiply world coords by s
  //   2. translate   — shift into screen position
  // Result: screenX = worldX * s + tx  (scale is around SVG origin, not view center)
  // -----------------------------------------------------------------------
  const animatedGProps = useAnimatedProps(() => ({
    transform: `translate(${panX.value}, ${panY.value}) scale(${scale.value})` as any,
  }));

  // -----------------------------------------------------------------------
  // Gesture handlers
  // -----------------------------------------------------------------------
  const panGesture = Gesture.Pan()
    .minDistance(5)
    .onStart(() => {
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    })
    .onUpdate((e) => {
      panX.value = savedPanX.value + e.translationX;
      panY.value = savedPanY.value + e.translationY;
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      savedPanX.value = panX.value;
      savedPanY.value = panY.value;
    })
    .onUpdate((e) => {
      // Clamp: allow zoom-out to 50% of fit, zoom-in to 500x fit
      const newScale = clamp(savedScale.value * e.scale, fitScale * 0.5, fitScale * 500);
      const ratio = newScale / savedScale.value;
      // Zoom toward the midpoint of the two fingers — formula correct because
      // scale is around SVG origin (not the Animated.View center).
      panX.value = e.focalX - (e.focalX - savedPanX.value) * ratio;
      panY.value = e.focalY - (e.focalY - savedPanY.value) * ratio;
      scale.value = newScale;
    });

  // -----------------------------------------------------------------------
  // Hit testing (runs on JS thread via runOnJS)
  // Convert screen → world: worldX = (screenX - panX) / scale
  // -----------------------------------------------------------------------
  const hitTest = useCallback(
    (screenX: number, screenY: number, threshPx: number): number | null => {
      const sc = scale.value;
      const tx = panX.value;
      const ty = panY.value;
      const wx = (screenX - tx) / sc;
      const wy = (screenY - ty) / sc;
      const threshWorld = threshPx / sc; // convert screen px to world units
      const threshSq = threshWorld * threshWorld;

      let bestId: number | null = null;
      let bestDist = threshSq;
      for (const [idStr, pos] of Object.entries(nodePositions)) {
        const dx = pos.x - wx;
        const dy = pos.y - wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          bestId = Number(idStr);
        }
      }
      return bestId;
    },
    [nodePositions, scale, panX, panY]
  );

  const handleTap = useCallback(
    (screenX: number, screenY: number) => {
      const id = hitTest(screenX, screenY, 30);
      if (id !== null) toggleNode(id); // adjacency rules enforced inside store
    },
    [hitTest, toggleNode]
  );

  const handleLongPress = useCallback(
    (screenX: number, screenY: number) => {
      const id = hitTest(screenX, screenY, 40);
      if (id !== null) {
        const node = nodes[id];
        if (node) onNodeLongPress(node);
      }
    },
    [hitTest, nodes, onNodeLongPress]
  );

  const tapGesture = Gesture.Tap().onEnd((e) => {
    runOnJS(handleTap)(e.x, e.y);
  });

  const longPressGesture = Gesture.LongPress()
    .minDuration(500)
    .onStart((e) => {
      runOnJS(handleLongPress)(e.x, e.y);
    });

  const gesture = Gesture.Simultaneous(
    panGesture,
    pinchGesture,
    Gesture.Exclusive(longPressGesture, tapGesture)
  );

  // -----------------------------------------------------------------------
  // Ascendancy highlight sets (class picker → teal rings on relevant nodes)
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // SVG element arrays — memoized to avoid unnecessary re-creation
  // All positions are in raw world coordinates; the AnimatedG transform
  // maps them to screen space at render time.
  // -----------------------------------------------------------------------

  const edgeElements = useMemo(() => {
    const entries = Object.entries(nodePositions);
    if (!entries.length) return null;
    const lines: React.ReactElement[] = [];

    for (const [, node] of Object.entries(nodes)) {
      const fromPos = nodePositions[node.skill];
      if (!fromPos) continue;
      for (const conn of node.connections ?? []) {
        // Deduplicate: only render each edge once (lower ID → higher ID)
        if (node.skill >= conn.id) continue;
        const toPos = nodePositions[conn.id];
        if (!toPos) continue;
        const bothAllocated = allocatedNodes.has(node.skill) && allocatedNodes.has(conn.id);
        lines.push(
          <Line
            key={`e-${node.skill}-${conn.id}`}
            x1={fromPos.x}
            y1={fromPos.y}
            x2={toPos.x}
            y2={toPos.y}
            stroke={bothAllocated ? COLORS.gold : COLORS.border}
            strokeWidth={bothAllocated ? 6 : 4}
            strokeOpacity={bothAllocated ? 0.9 : 0.45}
          />
        );
      }
    }
    return lines;
  }, [nodes, nodePositions, allocatedNodes]);

  const nodeElements = useMemo(() => {
    if (!Object.keys(nodePositions).length) return null;
    const circles: React.ReactElement[] = [];

    for (const [, node] of Object.entries(nodes)) {
      const pos = nodePositions[node.skill];
      if (!pos) continue;

      const allocated = allocatedNodes.has(node.skill);
      const color = nodeTypeBadgeColor(node);
      const r = nodeRadius(node);
      const isHighlighted =
        !!node.ascendancyName && highlightedAscendancies.has(node.ascendancyName);

      // Teal outer ring for ascendancy nodes of the selected class
      if (isHighlighted) {
        circles.push(
          <Circle
            key={`hl-${node.skill}`}
            cx={pos.x}
            cy={pos.y}
            r={r + 10}
            fill="transparent"
            stroke={COLORS.teal}
            strokeWidth={4}
            strokeOpacity={0.8}
          />
        );
      }

      circles.push(
        <Circle
          key={`n-${node.skill}`}
          cx={pos.x}
          cy={pos.y}
          r={r}
          fill={allocated ? color : 'transparent'}
          stroke={color}
          strokeWidth={allocated ? 0 : 3}
          strokeOpacity={allocated ? 1 : 0.55}
        />
      );
    }
    return circles;
  }, [nodes, nodePositions, allocatedNodes, highlightedAscendancies]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          {/*
           * The Svg viewport clips any content that maps outside screenWidth × screenHeight.
           * At the initial fitScale, all nodes map into this viewport.
           * When zoomed in, nodes near the viewport edges are naturally clipped.
           */}
          <Svg width={screenWidth} height={screenHeight}>
            <AnimatedG animatedProps={animatedGProps}>
              {edgeElements}
              {nodeElements}
            </AnimatedG>
          </Svg>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
});
