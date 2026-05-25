import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Animated,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTreeStore, TreeNode } from '../store/useTreeStore';
import { COLORS } from '../constants/colors';

const PANEL_WIDTH = 300;
const ANIM_DURATION = 220;

// ─── Stat aggregation ─────────────────────────────────────────────────────────

// Extracts all numbers from a stat string and replaces them with {V} placeholders.
// "+10 to maximum Life"  →  template: "+{V} to maximum Life",  nums: [10]
// "Adds 5 to 10 Fire Damage"  →  template: "Adds {V} to {V} Fire Damage",  nums: [5, 10]
function parseStatLine(stat: string): { template: string; nums: number[] } {
  const nums = [...stat.matchAll(/\d+(?:\.\d+)?/g)].map(m => parseFloat(m[0]));
  const template = stat.replace(/\d+(?:\.\d+)?/g, '{V}');
  return { template, nums };
}

// Collects stats from all allocated nodes, groups identical templates together,
// sums the numeric values at each position, and returns sorted display strings.
function aggregateStats(
  allocatedNodeIds: Set<number>,
  nodes: Record<number, TreeNode>,
): string[] {
  // Gather raw stat strings from every allocated node.
  const allStats: string[] = [];
  for (const id of allocatedNodeIds) {
    const node = nodes[id];
    if (node?.stats) {
      for (const s of node.stats) {
        const trimmed = s.trim();
        if (trimmed) allStats.push(trimmed);
      }
    }
  }
  if (allStats.length === 0) return [];

  // Map from template → array of accumulated values at each numeric position.
  // e.g. "+{V} to maximum Life" → [[10, 15, 8]]  (three nodes each gave some life)
  const groups = new Map<string, number[][]>();

  for (const stat of allStats) {
    const { template, nums } = parseStatLine(stat);
    if (!groups.has(template)) {
      // First occurrence: seed each position's list.
      groups.set(template, nums.map(n => [n]));
    } else {
      const existing = groups.get(template)!;
      nums.forEach((n, i) => {
        if (i < existing.length) existing[i].push(n);
        else existing.push([n]);
      });
    }
  }

  // Build final display strings with summed values.
  const result: string[] = [];
  for (const [template, valueLists] of groups) {
    if (valueLists.length === 0) {
      // No numeric values — stat is descriptive (e.g. "Cannot be Chilled").
      // The Map key deduplicates it automatically.
      result.push(template);
    } else {
      const totals = valueLists.map(list => list.reduce((a, b) => a + b, 0));
      let display = template;
      for (const total of totals) {
        // Show decimals only when the sum isn't a whole number.
        const formatted = total % 1 === 0 ? String(total) : total.toFixed(1);
        display = display.replace('{V}', formatted);
      }
      result.push(display);
    }
  }

  return result.sort((a, b) => a.localeCompare(b));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface StatsPanelProps {
  visible: boolean;
  onClose: () => void;
}

export default function StatsPanel({ visible, onClose }: StatsPanelProps) {
  const allocatedNodes = useTreeStore(s => s.allocatedNodes);
  const nodes = useTreeStore(s => s.nodes);
  const insets = useSafeAreaInsets();

  // Slide-from-right animation: PANEL_WIDTH = fully offscreen, 0 = fully visible.
  const translateX = useRef(new Animated.Value(PANEL_WIDTH)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : PANEL_WIDTH,
      duration: ANIM_DURATION,
      useNativeDriver: true,
    }).start();
  }, [visible, translateX]);

  // Re-aggregate whenever the allocated set or node data changes.
  const stats = useMemo(
    () => aggregateStats(allocatedNodes, nodes),
    [allocatedNodes, nodes],
  );

  return (
    <>
      {/* Dim backdrop — only rendered and interactive when the panel is open */}
      {visible && (
        <Pressable style={styles.backdrop} onPress={onClose} />
      )}

      {/* Sliding panel — always in the tree but translated offscreen when closed */}
      <Animated.View
        style={[
          styles.panel,
          {
            transform: [{ translateX }],
            // Shift content below the status bar / notch.
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
        // Prevent the offscreen panel from intercepting touches on the tree.
        pointerEvents={visible ? 'auto' : 'none'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Passive Stats</Text>
          <TouchableOpacity onPress={onClose} hitSlop={14}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Point summary */}
        <View style={styles.pointRow}>
          <Text style={styles.pointLabel}>Allocated passives</Text>
          <Text style={styles.pointValue}>{allocatedNodes.size}</Text>
        </View>

        <View style={styles.divider} />

        {/* Stat list */}
        {stats.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No passives allocated yet.</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {stats.map((stat, i) => (
              <Text key={i} style={styles.stat}>{stat}</Text>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 150,
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    backgroundColor: COLORS.bgPanel,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    zIndex: 200,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  title: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  closeIcon: {
    color: COLORS.textMuted,
    fontSize: 17,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 12,
  },
  pointRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pointLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pointValue: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 9,
  },
  stat: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
