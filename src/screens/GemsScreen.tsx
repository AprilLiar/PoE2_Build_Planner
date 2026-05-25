import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { GEM_ICON_MAP } from '../assets/gemIconMap.generated';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import {
  GemCatalogEntry,
  useGemStore,
  getLevelReq,
  getAttrRequirement,
  gemColorHex,
  gemColorBg,
  gemAbbrev,
} from '../store/useGemStore';
import GemSearchModal from '../components/GemSearchModal';
import GemDetailSheet from '../components/GemDetailSheet';
import { COLORS } from '../constants/colors';

/*
 * Gem screen layout (mimics Path of Building's skill panel):
 *
 * ┌─────────────────────────────────────────────┐
 * │  REQUIREMENTS  Lvl: 65  STR: 45  DEX: 0  INT: 38  │
 * ├─────────────────────────────────────────────┤
 * │  [Active gem name]   - Lv 15 +             │
 * │  [●active]  [○sup] [○sup] [○sup] [○sup] [○sup]  │
 * ├─────────────────────────────────────────────┤
 * │  ...                                        │
 * └─────────────────────────────────────────────┘
 *   [+ New Skill Group]
 *
 * "●" = active gem circle (larger)
 * "○" = support gem slot (smaller)
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

interface ActiveGemSlot {
  gemId: string;
  gemLevel: number;
}

type SupportGemSlot = { gemId: string } | null;

interface GemGroup {
  id: string;
  activeGem: ActiveGemSlot | null;
  supportGems: [SupportGemSlot, SupportGemSlot, SupportGemSlot, SupportGemSlot, SupportGemSlot];
}

type SlotTarget =
  | { kind: 'active'; groupId: string }
  | { kind: 'support'; groupId: string; index: number };

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const MAX_GROUPS = 12;
const ACTIVE_SIZE = 60;
const SUPPORT_SIZE = 44;
const GEM_BORDER = 2;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function makeEmptyGroup(id: string): GemGroup {
  return { id, activeGem: null, supportGems: [null, null, null, null, null] };
}

let _nextId = 1;
function newId() { return String(_nextId++); }

// --------------------------------------------------------------------------
// GemCircle sub-component
// --------------------------------------------------------------------------

interface GemCircleProps {
  gem: GemCatalogEntry | undefined;
  size: number;
  onPress: () => void;
  onLongPress: () => void;
}

function GemCircle({ gem, size, onPress, onLongPress }: GemCircleProps) {
  const borderColor = gem ? gemColorHex(gem.color) : COLORS.border;
  const bgColor = gem ? gemColorBg(gem.color) : COLORS.bgDeep;
  const textColor = gem ? gemColorHex(gem.color) : COLORS.textMuted;
  const fontSize = size <= 44 ? 9 : 11;
  const innerSize = size - GEM_BORDER * 2 - 4;

  const iconSource = gem?.icon ? GEM_ICON_MAP[gem.icon] : undefined;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={[
        styles.gemCircleOuter,
        { width: size, height: size, borderRadius: size / 2, borderColor },
      ]}
    >
      <View
        style={[
          styles.gemCircleInner,
          {
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            backgroundColor: bgColor,
          },
        ]}
      >
        {iconSource ? (
          <Image
            source={iconSource}
            style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2 }}
            resizeMode="cover"
          />
        ) : (
          <Text style={[styles.gemAbbrev, { color: textColor, fontSize }]} numberOfLines={1}>
            {gem ? gemAbbrev(gem.name) : '+'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// --------------------------------------------------------------------------
// RequirementsBar
// --------------------------------------------------------------------------

interface Requirements { level: number; str: number; dex: number; int: number }

interface ReqBarProps { active: Requirements; support: Requirements }

function ReqBar({ active, support }: ReqBarProps) {
  // Show the max of active vs support for each stat
  const level = Math.max(active.level, support.level);
  const str   = Math.max(active.str,   support.str);
  const dex   = Math.max(active.dex,   support.dex);
  const int   = Math.max(active.int,   support.int);

  return (
    <View style={styles.reqBar}>
      <Text style={styles.reqLabel}>REQUIREMENTS</Text>
      <View style={styles.reqStats}>
        <ReqStat label="Lvl" value={level} color={COLORS.gold} />
        <ReqStat label="STR" value={str}   color="#DC2626" />
        <ReqStat label="DEX" value={dex}   color="#16A34A" />
        <ReqStat label="INT" value={int}   color="#2563EB" />
      </View>
    </View>
  );
}

function ReqStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.reqStat}>
      <Text style={[styles.reqStatLabel, { color }]}>{label}</Text>
      <Text style={styles.reqStatValue}>{value}</Text>
    </View>
  );
}

// --------------------------------------------------------------------------
// Main Screen
// --------------------------------------------------------------------------

export default function GemsScreen() {
  const { gems, isLoaded, isLoading, error, loadGems } = useGemStore();

  const [groups, setGroups] = useState<GemGroup[]>([makeEmptyGroup(newId())]);
  const [searchTarget, setSearchTarget] = useState<SlotTarget | null>(null);
  const [detailGem, setDetailGem] = useState<GemCatalogEntry | null>(null);
  const [detailGemLevel, setDetailGemLevel] = useState(1);
  const [detailGroupId, setDetailGroupId] = useState<string | null>(null);
  const [detailSlot, setDetailSlot] = useState<'active' | number | null>(null);

  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => { loadGems(); }, [loadGems]);

  // Lookup gem by id from catalog
  const gemById = useCallback(
    (id: string) => gems.find((g) => g.id === id),
    [gems]
  );

  // ---- Group management ----

  const addGroup = useCallback(() => {
    setGroups((prev) =>
      prev.length < MAX_GROUPS ? [...prev, makeEmptyGroup(newId())] : prev
    );
  }, []);

  const removeGroup = useCallback((groupId: string) => {
    Alert.alert('Remove skill group?', 'All gems in this group will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () =>
        setGroups((prev) => prev.filter((g) => g.id !== groupId)) },
    ]);
  }, []);

  // ---- Gem level controls ----

  const adjustLevel = useCallback((groupId: string, delta: number) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId || !g.activeGem) return g;
        const newLevel = Math.max(1, Math.min(40, g.activeGem.gemLevel + delta));
        return { ...g, activeGem: { ...g.activeGem, gemLevel: newLevel } };
      })
    );
  }, []);

  // ---- Gem search & select ----

  const openSearch = useCallback((target: SlotTarget) => {
    setSearchTarget(target);
  }, []);

  const handleGemSelected = useCallback(
    (gem: GemCatalogEntry) => {
      if (!searchTarget) return;
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== searchTarget.groupId) return g;
          if (searchTarget.kind === 'active') {
            return { ...g, activeGem: { gemId: gem.id, gemLevel: 1 } };
          } else {
            const sup = [...g.supportGems] as GemGroup['supportGems'];
            sup[searchTarget.index] = { gemId: gem.id };
            return { ...g, supportGems: sup };
          }
        })
      );
      setSearchTarget(null);
    },
    [searchTarget]
  );

  // ---- Detail sheet ----

  const openDetail = useCallback(
    (group: GemGroup, slot: 'active' | number) => {
      let gem: GemCatalogEntry | undefined;
      let level = 1;
      if (slot === 'active' && group.activeGem) {
        gem = gemById(group.activeGem.gemId);
        level = group.activeGem.gemLevel;
      } else if (typeof slot === 'number' && group.supportGems[slot]) {
        gem = gemById(group.supportGems[slot]!.gemId);
      }
      if (!gem) return;
      setDetailGem(gem);
      setDetailGemLevel(level);
      setDetailGroupId(group.id);
      setDetailSlot(slot);
      sheetRef.current?.present();
    },
    [gemById]
  );

  const handleRemoveFromDetail = useCallback(() => {
    if (!detailGroupId || detailSlot === null) return;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== detailGroupId) return g;
        if (detailSlot === 'active') return { ...g, activeGem: null };
        const sup = [...g.supportGems] as GemGroup['supportGems'];
        sup[detailSlot as number] = null;
        return { ...g, supportGems: sup };
      })
    );
  }, [detailGroupId, detailSlot]);

  // ---- Requirements calculation ----

  const requirements = useMemo(() => {
    let activeLvl = 0, activeStr = 0, activeDex = 0, activeInt = 0;
    let supLvl = 0, supStr = 0, supDex = 0, supInt = 0;

    for (const group of groups) {
      if (group.activeGem) {
        const g = gemById(group.activeGem.gemId);
        if (g) {
          const lr = getLevelReq(g, group.activeGem.gemLevel);
          const ar = getAttrRequirement(g.color, lr);
          activeLvl = Math.max(activeLvl, lr);
          activeStr += ar.str;
          activeDex += ar.dex;
          activeInt += ar.int;
        }
      }
      for (const sup of group.supportGems) {
        if (sup) {
          const g = gemById(sup.gemId);
          if (g) {
            const lr = getLevelReq(g, 1);
            const ar = getAttrRequirement(g.color, lr);
            supLvl = Math.max(supLvl, lr);
            supStr += ar.str;
            supDex += ar.dex;
            supInt += ar.int;
          }
        }
      }
    }

    return {
      active: { level: activeLvl, str: activeStr, dex: activeDex, int: activeInt },
      support: { level: supLvl, str: supStr, dex: supDex, int: supInt },
    };
  }, [groups, gemById]);

  // ---- Loading / error states ----

  if (isLoading && !isLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.gold} />
        <Text style={styles.loadingText}>Loading gems…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Failed to load gems</Text>
        <Text style={styles.errorDetail}>{error}</Text>
        <TouchableOpacity onPress={loadGems} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---- Render ----

  return (
    <View style={styles.container}>
      {/* Sticky requirements bar */}
      <ReqBar active={requirements.active} support={requirements.support} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => {
          const activeGem = group.activeGem ? gemById(group.activeGem.gemId) : undefined;
          const level = group.activeGem?.gemLevel ?? 1;

          return (
            <View key={group.id} style={styles.groupCard}>
              {/* Group header row: active gem name + level stepper */}
              <View style={styles.groupHeader}>
                <View style={styles.groupNameRow}>
                  {activeGem && (
                    <View
                      style={[
                        styles.headerColorDot,
                        { backgroundColor: gemColorHex(activeGem.color) },
                      ]}
                    />
                  )}
                  <Text style={styles.groupName} numberOfLines={1}>
                    {activeGem ? activeGem.name : 'Empty Skill Group'}
                  </Text>
                </View>

                <View style={styles.headerRight}>
                  {/* Level stepper — only visible when an active gem is set */}
                  {activeGem && (
                    <View style={styles.levelStepper}>
                      <TouchableOpacity
                        onPress={() => adjustLevel(group.id, -1)}
                        style={styles.stepBtn}
                        hitSlop={8}
                      >
                        <Text style={styles.stepBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.levelValue}>Lv {level}</Text>
                      <TouchableOpacity
                        onPress={() => adjustLevel(group.id, 1)}
                        style={styles.stepBtn}
                        hitSlop={8}
                      >
                        <Text style={styles.stepBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Remove group button */}
                  <TouchableOpacity
                    onPress={() => removeGroup(group.id)}
                    hitSlop={8}
                    style={styles.removeGroupBtn}
                  >
                    <Text style={styles.removeGroupText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Gem circles row */}
              <View style={styles.gemRow}>
                {/* Active gem — larger circle */}
                <GemCircle
                  gem={activeGem}
                  size={ACTIVE_SIZE}
                  onPress={() => openSearch({ kind: 'active', groupId: group.id })}
                  onLongPress={() => openDetail(group, 'active')}
                />

                <View style={styles.gemRowSpacer} />

                {/* Five support gem slots */}
                {group.supportGems.map((slot, idx) => {
                  const supGem = slot ? gemById(slot.gemId) : undefined;
                  return (
                    <GemCircle
                      key={idx}
                      gem={supGem}
                      size={SUPPORT_SIZE}
                      onPress={() =>
                        openSearch({ kind: 'support', groupId: group.id, index: idx })
                      }
                      onLongPress={() => openDetail(group, idx)}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* Add group button */}
        {groups.length < MAX_GROUPS && (
          <TouchableOpacity onPress={addGroup} style={styles.addGroupBtn} activeOpacity={0.75}>
            <Text style={styles.addGroupText}>+ New Skill Group</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Gem search modal */}
      <GemSearchModal
        visible={searchTarget !== null}
        onClose={() => setSearchTarget(null)}
        supportOnly={searchTarget?.kind === 'support'}
        gems={gems}
        onSelectGem={handleGemSelected}
      />

      {/* Gem detail bottom sheet */}
      <GemDetailSheet
        sheetRef={sheetRef}
        gem={detailGem}
        gemLevel={detailGemLevel}
        onRemove={handleRemoveFromDetail}
      />
    </View>
  );
}

// --------------------------------------------------------------------------
// Styles
// --------------------------------------------------------------------------

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
    fontSize: 17,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDetail: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    color: COLORS.text,
    fontWeight: '600',
  },

  // --- Requirements bar ---
  reqBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: COLORS.bgPanel,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexWrap: 'wrap',
    gap: 8,
  },
  reqLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginRight: 6,
  },
  reqStats: {
    flexDirection: 'row',
    gap: 14,
  },
  reqStat: {
    alignItems: 'center',
  },
  reqStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  reqStatValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },

  // --- Scroll ---
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    gap: 10,
  },

  // --- Group card ---
  groupCard: {
    backgroundColor: COLORS.bgPanel,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  groupNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  headerColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  groupName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  levelStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgDeep,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stepBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepBtnText: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '700',
  },
  levelValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    minWidth: 38,
    textAlign: 'center',
  },
  removeGroupBtn: {
    padding: 4,
  },
  removeGroupText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },

  // --- Gem row ---
  gemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gemRowSpacer: {
    width: 10,
  },

  // --- Gem circle ---
  gemCircleOuter: {
    borderWidth: GEM_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
    // Gold outer glow approximated with a slightly larger shadow
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    marginRight: 6,
  },
  gemCircleInner: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201, 168, 76, 0.25)',
  },
  gemAbbrev: {
    fontWeight: '700',
    textAlign: 'center',
  },

  // --- Add group button ---
  addGroupBtn: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 2,
  },
  addGroupText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
