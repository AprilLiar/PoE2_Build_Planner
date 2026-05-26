import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Image,
} from 'react-native';
import {
  GemCatalogEntry,
  gemColorHex,
  gemColorLabel,
} from '../store/useGemStore';
import { GEM_ICON_MAP } from '../assets/gemIconMap.generated';
import { COLORS } from '../constants/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** If true, only support gems are shown; otherwise only active skill gems */
  supportOnly: boolean;
  gems: GemCatalogEntry[];
  onSelectGem: (gem: GemCatalogEntry) => void;
}

const MAX_RESULTS = 40;

export default function GemSearchModal({
  visible,
  onClose,
  supportOnly,
  gems,
  onSelectGem,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo<GemCatalogEntry[]>(() => {
    const q = query.trim().toLowerCase();
    return gems
      .filter((g) => g.is_support === supportOnly && (q === '' || g.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_RESULTS);
  }, [gems, supportOnly, query]);

  const handleSelect = useCallback(
    (gem: GemCatalogEntry) => {
      onSelectGem(gem);
      onClose();
      setQuery('');
    },
    [onSelectGem, onClose]
  );

  const handleClose = useCallback(() => {
    onClose();
    setQuery('');
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: GemCatalogEntry }) => {
      const hex = gemColorHex(item.color);
      const label = gemColorLabel(item.color);
      const iconSource = item.icon ? GEM_ICON_MAP[item.icon] : undefined;
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => handleSelect(item)}
          activeOpacity={0.7}
        >
          {/* Gem icon or colour dot */}
          {iconSource ? (
            <Image source={iconSource} style={styles.gemIcon} />
          ) : (
            <View style={[styles.colorDot, { backgroundColor: hex }]} />
          )}
          <Text style={styles.gemName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.badge, { borderColor: hex }]}>
            <Text style={[styles.badgeText, { color: hex }]}>{label}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleSelect]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>
                {supportOnly ? 'Select Support Gem' : 'Select Skill Gem'}
              </Text>

              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search gems…"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />

              {filtered.length === 0 ? (
                <Text style={styles.hint}>
                  {query.trim() ? 'No gems found' : 'Loading gems…'}
                </Text>
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(g) => g.id}
                  renderItem={renderItem}
                  style={styles.list}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-start',
    paddingTop: 70,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: COLORS.bgPanel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    maxHeight: '80%',
  },
  title: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
    marginBottom: 10,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  gemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 10,
    backgroundColor: COLORS.bgDeep,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  gemName: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    marginRight: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
