import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { TreeNode, nodeTypeLabel, nodeTypeBadgeColor } from '../store/useTreeStore';
import { COLORS } from '../constants/colors';

interface NodeDetailSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  node: TreeNode | null;
  isAllocated: boolean;
  onToggle: () => void;
}

const SNAP_POINTS = ['50%', '85%'];

// Stable backdrop component — defined outside to avoid recreating on every render
function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />;
}

export default function NodeDetailSheet({
  sheetRef,
  node,
  isAllocated,
  onToggle,
}: NodeDetailSheetProps) {
  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      backdropComponent={Backdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handle}
      enablePanDownToClose
    >
      <BottomSheetView style={styles.header}>
        {node && (
          <>
            <View style={styles.titleRow}>
              <Text style={styles.nodeName}>{node.name}</Text>
              <Text style={[styles.badge, { color: nodeTypeBadgeColor(node) }]}>
                {nodeTypeLabel(node)}
              </Text>
            </View>
            {node.ascendancyName ? (
              <Text style={styles.ascendancy}>{node.ascendancyName}</Text>
            ) : null}
          </>
        )}
      </BottomSheetView>

      <BottomSheetScrollView contentContainerStyle={styles.statsContainer}>
        {node?.stats?.length ? (
          node.stats.map((stat, i) => (
            <Text key={i} style={styles.stat}>
              {stat}
            </Text>
          ))
        ) : (
          <Text style={styles.noStats}>No stats listed.</Text>
        )}
      </BottomSheetScrollView>

      <BottomSheetView style={styles.footer}>
        <TouchableOpacity
          style={[styles.toggleBtn, isAllocated && styles.toggleBtnActive]}
          onPress={onToggle}
          activeOpacity={0.75}
        >
          <Text style={[styles.toggleBtnText, isAllocated && styles.toggleBtnTextActive]}>
            {isAllocated ? 'Deallocate' : 'Allocate'}
          </Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: COLORS.bgPanel,
  },
  handle: {
    backgroundColor: COLORS.border,
    width: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nodeName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
  },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ascendancy: {
    color: COLORS.teal,
    fontSize: 12,
    marginTop: 4,
  },
  statsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  stat: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  noStats: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  toggleBtn: {
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: COLORS.bgDeallocate,
  },
  toggleBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: COLORS.textDanger,
  },
});
