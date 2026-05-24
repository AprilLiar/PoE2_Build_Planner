import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';
import { RootStackParamList } from '../navigation/RootStackNavigator';
import { useBuildStore } from '../store/useBuildStore';
import { useTreeStore } from '../store/useTreeStore';
import { Build } from '../types/build';
import * as fileService from '../services/fileService';

// UUID v4 generator that doesn't rely on crypto.randomUUID() (not always available in Hermes).
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// The 8 PoE2 playable classes — hardcoded here for the create-build form only.
// The skill tree screen loads class data from tree.json via useTreeStore.
const POE2_CLASSES = ['Ranger', 'Huntress', 'Warrior', 'Mercenary', 'Druid', 'Witch', 'Sorceress', 'Monk'];

// Ascendancies per class — verified against tree.json patch 0.4 (21 total).
const ASCENDANCIES: Record<string, string[]> = {
  Ranger:    ['Deadeye', 'Pathfinder'],
  Huntress:  ['Amazon', 'Ritualist'],
  Warrior:   ['Titan', 'Warbringer', 'Smith of Kitava'],
  Mercenary: ['Tactician', 'Witchhunter', 'Gemling Legionnaire'],
  Druid:     ['Oracle', 'Shaman'],
  Witch:     ['Infernalist', 'Blood Mage', 'Lich', 'Abyssal Lich'],
  Sorceress: ['Stormweaver', 'Chronomancer', 'Disciple of Varashta'],
  Monk:      ['Invoker', 'Acolyte of Chayula'],
};

type NavProp = NativeStackNavigationProp<RootStackParamList, 'BuildList'>;

interface BuildEntry {
  build: Build;
  path: string;
}

// ─── Build card ───────────────────────────────────────────────────────────────

interface BuildCardProps {
  entry: BuildEntry;
  onPress: () => void;
  onLongPress: () => void;
}

function BuildCard({ entry, onPress, onLongPress }: BuildCardProps) {
  const { build } = entry;
  const updated = new Date(build.updated_at);
  // Format as "May 23, 2026" — simple and readable.
  const dateStr = updated.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      <View style={styles.cardLeft}>
        <Text style={styles.cardName} numberOfLines={1}>{build.name}</Text>
        <Text style={styles.cardSub}>{build.character.class} · Level {build.character.level}</Text>
      </View>
      <Text style={styles.cardDate}>{dateStr}</Text>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function BuildListScreen() {
  const navigation = useNavigation<NavProp>();
  const insets = useSafeAreaInsets();
  const setBuild = useBuildStore((s) => s.setBuild);
  const setSelectedClass = useTreeStore((s) => s.setSelectedClass);
  const setSelectedAscendancy = useTreeStore((s) => s.setSelectedAscendancy);

  const [builds, setBuilds] = useState<BuildEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // ── Load builds from filesystem whenever this screen gains focus ──────────
  const loadBuilds = useCallback(async () => {
    setLoading(true);
    try {
      const results = await fileService.listBuilds();
      setBuilds(results);
    } catch {
      // File system errors are non-fatal — show empty list.
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-run loadBuilds every time the screen comes into focus (e.g. user returns
  // from drawer after saving, or after creating/deleting a build).
  // useFocusEffect requires a sync callback — call the async function inside it.
  useFocusEffect(
    useCallback(() => {
      loadBuilds();
    }, [loadBuilds])
  );

  // ── Open a build ──────────────────────────────────────────────────────────
  const openBuild = useCallback((entry: BuildEntry) => {
    setBuild(entry.build, entry.path);
    // Pre-select the build's class and ascendancy in the skill tree store
    // so the tree opens at the correct starting position.
    setSelectedClass(entry.build.character.class);
    setSelectedAscendancy(entry.build.character.ascendancy);
    navigation.navigate('BuildDrawer');
  }, [setBuild, setSelectedClass, setSelectedAscendancy, navigation]);

  // ── Long-press context menu ───────────────────────────────────────────────
  const showActions = useCallback((entry: BuildEntry) => {
    Alert.alert(entry.build.name, undefined, [
      {
        text: 'Rename',
        onPress: () => promptRename(entry),
      },
      {
        text: 'Duplicate',
        onPress: async () => {
          try {
            await fileService.duplicateBuild(entry.build);
            await loadBuilds();
          } catch {
            Alert.alert('Error', 'Could not duplicate build.');
          }
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDelete(entry),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [loadBuilds]);

  const promptRename = useCallback((entry: BuildEntry) => {
    // Alert.prompt is iOS-only. On Android a custom modal would be needed.
    Alert.prompt(
      'Rename Build',
      'Enter a new name:',
      async (newName) => {
        if (!newName?.trim()) return;
        try {
          await fileService.renameBuild(entry.path, newName.trim());
          await loadBuilds();
        } catch {
          Alert.alert('Error', 'Could not rename build.');
        }
      },
      'plain-text',
      entry.build.name,
    );
  }, [loadBuilds]);

  const confirmDelete = useCallback((entry: BuildEntry) => {
    Alert.alert(
      'Delete Build',
      `Delete "${entry.build.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fileService.deleteBuild(entry.path);
              await loadBuilds();
            } catch {
              Alert.alert('Error', 'Could not delete build.');
            }
          },
        },
      ],
    );
  }, [loadBuilds]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Builds</Text>
      </View>

      {/* Build list / empty state */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.gold} size="large" />
        </View>
      ) : builds.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No Builds Yet</Text>
          <Text style={styles.emptyHint}>Tap the button below to create your first build.</Text>
        </View>
      ) : (
        <FlatList
          data={builds}
          keyExtractor={(item) => item.path}
          renderItem={({ item }) => (
            <BuildCard
              entry={item}
              onPress={() => openBuild(item)}
              onLongPress={() => showActions(item)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Import placeholder (disabled) */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.importBtn} disabled>
          <Text style={styles.importBtnLabel}>Import</Text>
        </TouchableOpacity>
      </View>

      {/* FAB — New Build */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 80 }]}
        onPress={() => setShowCreate(true)}
        activeOpacity={0.85}
      >
        <Text style={styles.fabLabel}>+ New Build</Text>
      </TouchableOpacity>

      {/* Create Build modal */}
      <CreateBuildModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={async (name, cls, level, ascendancy) => {
          try {
            const now = new Date().toISOString();
            const id = generateId();
            const build: Build = {
              schema_version: 1,
              id,
              name,
              game_version: '0.4.0',
              created_at: now,
              updated_at: now,
              character: { class: cls, ascendancy, level },
              skill_tree: { allocated_nodes: [], tree_version: '0.4' },
              items: [],
              gems: [],
              notes: '',
            };
            const path = await fileService.saveBuild(build);
            setBuild(build, path);
            // Wire the chosen class/ascendancy into the tree store so the tree
            // opens at the right starting node without the user having to re-select.
            setSelectedClass(cls);
            setSelectedAscendancy(ascendancy);
            setShowCreate(false);
            navigation.navigate('BuildDrawer');
          } catch (e) {
            Alert.alert('Error', 'Could not save build. Check available storage.');
          }
        }}
      />
    </View>
  );
}

// ─── Create Build modal ───────────────────────────────────────────────────────

interface CreateBuildModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, cls: string, level: number, ascendancy: string | null) => Promise<void>;
}

function CreateBuildModal({ visible, onClose, onCreate }: CreateBuildModalProps) {
  const [name, setName] = useState('');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedAscendancy, setSelectedAscendancy] = useState<string | null>(null);
  const [levelText, setLevelText] = useState('1');
  const [saving, setSaving] = useState(false);

  const canConfirm = name.trim().length > 0 && selectedClass !== null && !saving;

  const resetForm = () => {
    setName('');
    setSelectedClass(null);
    setSelectedAscendancy(null);
    setLevelText('1');
    setSaving(false);
  };

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    // Clear ascendancy whenever the class changes so stale choices don't carry over.
    setSelectedAscendancy(null);
  };

  const handleConfirm = async () => {
    setSaving(true);
    const level = Math.min(100, Math.max(1, parseInt(levelText, 10) || 1));
    try {
      await onCreate(name.trim(), selectedClass!, level, selectedAscendancy);
      // Parent closes the modal on success; reset form after it's hidden.
      resetForm();
    } catch {
      // onCreate should handle its own errors — just unblock the button.
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (saving) return; // don't dismiss mid-save
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      {/* Outer backdrop dismisses modal on tap */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={modalStyles.backdrop}>
          {/* Inner card absorbs taps so they don't reach the backdrop */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={modalStyles.card}>
                <Text style={modalStyles.title}>New Build</Text>

                {/* Build name */}
                <Text style={modalStyles.label}>Build Name</Text>
                <TextInput
                  style={modalStyles.input}
                  placeholder="e.g. Infernalist Minions"
                  placeholderTextColor={COLORS.textMuted}
                  value={name}
                  onChangeText={setName}
                  maxLength={60}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                {/* Class picker */}
                <Text style={modalStyles.label}>Class</Text>
                <View style={modalStyles.classGrid}>
                  {POE2_CLASSES.map((cls) => {
                    const active = cls === selectedClass;
                    return (
                      <TouchableOpacity
                        key={cls}
                        style={[modalStyles.classChip, active && modalStyles.classChipActive]}
                        onPress={() => handleSelectClass(cls)}
                        activeOpacity={0.75}
                      >
                        <Text style={[modalStyles.classChipLabel, active && modalStyles.classChipLabelActive]}>
                          {cls}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Ascendancy picker — appears once a class is chosen */}
                {selectedClass && ASCENDANCIES[selectedClass] && (
                  <>
                    <Text style={modalStyles.label}>
                      Ascendancy <Text style={modalStyles.labelOptional}>(optional)</Text>
                    </Text>
                    <View style={modalStyles.classGrid}>
                      {ASCENDANCIES[selectedClass].map((asc) => {
                        const active = asc === selectedAscendancy;
                        return (
                          <TouchableOpacity
                            key={asc}
                            style={[modalStyles.classChip, active && modalStyles.classChipActive]}
                            // Tap again to deselect (ascendancy is optional)
                            onPress={() => setSelectedAscendancy(active ? null : asc)}
                            activeOpacity={0.75}
                          >
                            <Text style={[modalStyles.classChipLabel, active && modalStyles.classChipLabelActive]}>
                              {asc}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Level */}
                <Text style={modalStyles.label}>Level</Text>
                <TextInput
                  style={[modalStyles.input, modalStyles.inputSmall]}
                  placeholder="1"
                  placeholderTextColor={COLORS.textMuted}
                  value={levelText}
                  onChangeText={(t) => setLevelText(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                {/* Actions */}
                <View style={modalStyles.actions}>
                  <TouchableOpacity style={modalStyles.cancelBtn} onPress={handleClose} activeOpacity={0.75}>
                    <Text style={modalStyles.cancelLabel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[modalStyles.confirmBtn, !canConfirm && modalStyles.confirmBtnDisabled]}
                    onPress={handleConfirm}
                    disabled={!canConfirm}
                    activeOpacity={0.75}
                  >
                    <Text style={modalStyles.confirmLabel}>{saving ? 'Saving…' : 'Create'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: COLORS.gold,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '600',
  },
  emptyHint: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: {
    padding: 12,
    gap: 10,
  },

  // Build card
  card: {
    backgroundColor: COLORS.bgPanel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardName: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
  cardSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  cardDate: {
    color: COLORS.textMuted,
    fontSize: 12,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  importBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    opacity: 0.35,
  },
  importBtnLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '500',
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: COLORS.gold,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 22,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  fabLabel: {
    color: COLORS.bgDeep,
    fontSize: 15,
    fontWeight: '700',
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: COLORS.bgPanel,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 14,
  },
  labelOptional: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '400',
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputSmall: {
    width: 80,
  },
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  classChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgDeep,
  },
  classChipActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(201,168,76,0.15)',
  },
  classChipLabel: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  classChipLabelActive: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 22,
  },
  cancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  confirmBtn: {
    paddingVertical: 11,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: COLORS.gold,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmLabel: {
    color: COLORS.bgDeep,
    fontSize: 14,
    fontWeight: '700',
  },
});
