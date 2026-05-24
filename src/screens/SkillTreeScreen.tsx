import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTreeStore } from '../store/useTreeStore';
import { useBuildStore } from '../store/useBuildStore';
import ClassPickerModal from '../components/ClassPickerModal';
import GraphicalSkillTree from '../components/GraphicalSkillTree';
import NodeSearchModal from '../components/NodeSearchModal';
import StatsPanel from '../components/StatsPanel';
import * as fileService from '../services/fileService';
import { COLORS } from '../constants/colors';

const MAX_POINTS = 123;

export default function SkillTreeScreen() {
  const {
    classes,
    allocatedNodes,
    isLoaded,
    error,
    loadTree,
    selectedClass,
    selectedAscendancy,
    setSelectedClass,
    setSelectedAscendancy,
    setAllocatedNodes,
  } = useTreeStore();

  const currentBuild = useBuildStore((s) => s.currentBuild);
  const currentBuildPath = useBuildStore((s) => s.currentBuildPath);
  const isDirty = useBuildStore((s) => s.isDirty);
  const updateSkillTree = useBuildStore((s) => s.updateSkillTree);
  const markClean = useBuildStore((s) => s.markClean);

  const insets = useSafeAreaInsets();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [statsPanelVisible, setStatsPanelVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // loadTree is idempotent — safe to call on every mount
  React.useEffect(() => {
    loadTree();
  }, [loadTree]);

  // When a build opens (or after the tree finishes loading for the first time),
  // initialise the tree's allocated nodes from the build file.
  // skipSyncRef prevents the resulting allocatedNodes change from bouncing back
  // into updateSkillTree as if the user had toggled a node.
  const skipSyncRef = useRef(false);
  const buildId = currentBuild?.id ?? null;
  useEffect(() => {
    if (!isLoaded || !currentBuild) return;
    skipSyncRef.current = true;
    setAllocatedNodes(new Set(currentBuild.skill_tree.allocated_nodes));
  // buildId intentionally used instead of currentBuild to avoid re-running on every save
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, buildId]);

  // Whenever the user toggles a node, push the change into the build store.
  // Deliberately omits currentBuild/isLoaded from deps — we only want this to
  // fire when allocatedNodes itself changes, not on every unrelated render.
  // updateSkillTree reads fresh Zustand state internally so the stale closure is safe.
  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    if (!currentBuild || !isLoaded) return;
    updateSkillTree([...allocatedNodes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocatedNodes]);

  // Auto-save: 3-second debounce after any change.
  // Timer resets on each change so the save only fires after the user stops.
  useEffect(() => {
    if (!isDirty || !currentBuild || !currentBuildPath) return;
    const timer = setTimeout(async () => {
      try {
        await fileService.saveBuild(currentBuild, currentBuildPath);
        markClean();
      } catch {
        // Silent — manual save still available
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isDirty, currentBuild, currentBuildPath, markClean]);

  // Manual save — immediate write + toast confirmation.
  const handleSave = useCallback(async () => {
    if (!currentBuild || !currentBuildPath || saving) return;
    setSaving(true);
    try {
      await fileService.saveBuild(currentBuild, currentBuildPath);
      markClean();
      Toast.show({ type: 'success', text1: 'Build saved', visibilityTime: 2000 });
    } catch {
      Toast.show({ type: 'error', text1: 'Save failed — check storage', visibilityTime: 3000 });
    } finally {
      setSaving(false);
    }
  }, [currentBuild, currentBuildPath, markClean, saving]);

  // Only clears the ascendancy — class is always required
  const clearAscendancy = useCallback(() => {
    setSelectedAscendancy(null);
  }, [setSelectedAscendancy]);

  const pointsUsed = allocatedNodes.size;
  const pointsColor =
    pointsUsed > MAX_POINTS ? COLORS.danger : pointsUsed >= 100 ? COLORS.gold : COLORS.success;

  // Chip shows "Class · Ascendancy" or just "Class"; ✕ clears only the ascendancy
  const selectionLabel = selectedAscendancy
    ? `${selectedClass}  ·  ${selectedAscendancy}`
    : selectedClass;

  // While tree is loading show a spinner over the dark background
  if (!isLoaded && !error) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading passive tree…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load tree.json</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Full-screen graphical skill tree canvas */}
      <GraphicalSkillTree />

      {/* Top overlay: class chip (centre, tappable) + search icon (right) */}
      <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        {/* Tapping the chip opens the class/ascendancy picker */}
        <View style={styles.topMiddle} pointerEvents="box-none">
          {selectionLabel && (
            <TouchableOpacity
              style={styles.selectionChip}
              onPress={() => setPickerVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.selectionText} numberOfLines={1}>{selectionLabel}</Text>
              {selectedAscendancy && (
                <TouchableOpacity onPress={clearAscendancy} hitSlop={8} style={styles.selectionClearBtn}>
                  <Text style={styles.selectionClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Save button — visible only when there are unsaved changes */}
        {isDirty && currentBuild && (
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            disabled={saving}
            hitSlop={8}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        )}

        {/* Stats panel toggle */}
        <TouchableOpacity
          onPress={() => setStatsPanelVisible(v => !v)}
          style={[styles.statsBtn, statsPanelVisible && styles.statsBtnActive]}
          hitSlop={8}
        >
          <Text style={[styles.statsBtnText, statsPanelVisible && styles.statsBtnTextActive]}>Σ</Text>
        </TouchableOpacity>

        {/* Search button — always right-aligned */}
        <TouchableOpacity
          onPress={() => setSearchVisible(true)}
          style={styles.searchBtn}
          hitSlop={8}
        >
          <Text style={styles.searchIcon}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom overlay: passive point counter */}
      <View style={[styles.counterOverlay, { paddingBottom: insets.bottom + 10 }]} pointerEvents="none">
        <Text style={styles.counterLabel}>Passive Points</Text>
        <Text style={[styles.counterValue, { color: pointsColor }]}>
          {pointsUsed} / {MAX_POINTS}
        </Text>
      </View>

      {/* Class / ascendancy picker modal */}
      <ClassPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        classes={classes}
        selectedClass={selectedClass}
        selectedAscendancy={selectedAscendancy}
        onSelectClass={setSelectedClass}
        onSelectAscendancy={setSelectedAscendancy}
      />

      {/* Node search modal — tap a result to fly the camera to that node */}
      <NodeSearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
      />

      {/* Stats summary panel — slides in from the right */}
      <StatsPanel
        visible={statsPanelVisible}
        onClose={() => setStatsPanelVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 15,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDetail: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },

  // --- Top overlay ---
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  topMiddle: {
    flex: 1,
    marginRight: 8,
  },
  saveBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginRight: 8,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: COLORS.bgDeep,
    fontSize: 13,
    fontWeight: '700',
  },
  statsBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  statsBtnActive: {
    backgroundColor: COLORS.bgInput,
    borderColor: COLORS.gold,
  },
  statsBtnText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
  },
  statsBtnTextActive: {
    color: COLORS.gold,
  },
  searchBtn: {
    padding: 4,
  },
  searchIcon: {
    fontSize: 20,
  },
  selectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgInput,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectionText: {
    color: COLORS.teal,
    fontSize: 13,
    fontWeight: '600',
  },
  selectionClearBtn: {
    padding: 4,
  },
  selectionClearText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },

  // --- Bottom counter overlay ---
  counterOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(10, 14, 26, 0.85)',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  counterLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  counterValue: {
    fontSize: 14,
    fontWeight: '700',
  },
});
