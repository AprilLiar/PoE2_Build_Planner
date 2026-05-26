import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Item, ItemSlot } from '../types/build';
import { parseItem, ParseResult } from '../utils/itemParser';
import { COLORS } from '../constants/colors';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ITEM_ICON_MAP: Record<string, string> = require('../../assets/data/item-icons.json');

const RARITY_COLOR: Record<string, string> = {
  Normal: '#C8C8C8',
  Magic: '#8888FF',
  Rare: '#FFFF77',
  Unique: '#AF6025',
};

const SLOT_LABELS: Record<ItemSlot, string> = {
  Helm: 'Helm', Chest: 'Chest', Gloves: 'Gloves', Boots: 'Boots',
  Weapon1: 'Weapon (Main)', Weapon2: 'Weapon (Alt)',
  Offhand1: 'Offhand (Main)', Offhand2: 'Offhand (Alt)',
  Ring1: 'Ring (Left)', Ring2: 'Ring (Right)',
  Amulet: 'Amulet', Belt: 'Belt',
  Flask1: 'Flask 1', Flask2: 'Flask 2', Flask3: 'Flask 3',
  Flask4: 'Flask 4', Flask5: 'Flask 5',
  Charm1: 'Charm 1', Charm2: 'Charm 2', Charm3: 'Charm 3',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  slot: ItemSlot;
  initialRawText?: string;
  onConfirm: (item: Item) => void;
}

export default function ItemPasteModal({ visible, onClose, slot, initialRawText = '', onConfirm }: Props) {
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Reinitialise when the modal opens (handles both fresh open and edit-flow re-open)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (visible) {
      setRawText(initialRawText ?? '');
      setPreview(null);
      setParseError(null);
    }
  }, [visible]);

  const handleClose = useCallback(() => {
    setRawText('');
    setPreview(null);
    setParseError(null);
    onClose();
  }, [onClose]);

  const handleParse = useCallback(() => {
    const outcome = parseItem(rawText);
    if (outcome.ok) {
      setPreview(outcome.result);
      setParseError(null);
    } else {
      setPreview(null);
      setParseError(outcome.error);
    }
  }, [rawText]);

  const handleConfirm = useCallback(() => {
    if (!preview) return;
    const icon = ITEM_ICON_MAP[preview.name] ?? ITEM_ICON_MAP[preview.base_type];
    const item: Item = {
      slot,
      name: preview.name,
      base_type: preview.base_type,
      rarity: preview.rarity,
      raw_text: rawText,
      mods: preview.mods,
      ...(icon ? { icon } : {}),
    };
    onConfirm(item);
    setRawText('');
    setPreview(null);
    setParseError(null);
  }, [preview, rawText, slot, onConfirm]);

  const rarityColor = preview ? RARITY_COLOR[preview.rarity] : COLORS.text;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>Add item to {SLOT_LABELS[slot]}</Text>

              <TextInput
                style={styles.input}
                value={rawText}
                onChangeText={(t) => { setRawText(t); setPreview(null); setParseError(null); }}
                placeholder={'Paste item text here (Ctrl+C in-game)…'}
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={8}
                autoCorrect={false}
                autoCapitalize="none"
                textAlignVertical="top"
              />

              {parseError !== null && (
                <Text style={styles.errorText}>{parseError}</Text>
              )}

              <TouchableOpacity
                style={[styles.parseBtn, !rawText.trim() && styles.btnDisabled]}
                onPress={handleParse}
                disabled={!rawText.trim()}
                activeOpacity={0.75}
              >
                <Text style={styles.parseBtnText}>Parse Item</Text>
              </TouchableOpacity>

              {preview && (
                <ScrollView style={styles.preview} nestedScrollEnabled>
                  <View style={[styles.rarityBar, { backgroundColor: rarityColor }]} />
                  <Text style={[styles.previewName, { color: rarityColor }]} numberOfLines={2}>
                    {preview.name}
                  </Text>
                  {preview.base_type !== preview.name && (
                    <Text style={styles.previewBase}>{preview.base_type}</Text>
                  )}
                  <View style={styles.divider} />
                  {preview.mods.map((mod, i) => (
                    <Text key={i} style={styles.modLine}>{mod}</Text>
                  ))}
                  {preview.mods.length === 0 && (
                    <Text style={styles.noMods}>No modifiers found</Text>
                  )}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[styles.confirmBtn, !preview && styles.btnDisabled]}
                onPress={handleConfirm}
                disabled={!preview}
                activeOpacity={0.75}
              >
                <Text style={styles.confirmBtnText}>Add to Slot</Text>
              </TouchableOpacity>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: COLORS.bgPanel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    maxHeight: '90%',
  },
  title: {
    color: COLORS.gold,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    minHeight: 130,
    marginBottom: 8,
  },
  errorText: {
    color: COLORS.textDanger,
    fontSize: 13,
    marginBottom: 8,
  },
  parseBtn: {
    backgroundColor: COLORS.bgInput,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  parseBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  preview: {
    maxHeight: 220,
    backgroundColor: COLORS.bgDeep,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    marginBottom: 12,
  },
  rarityBar: {
    height: 2,
    borderRadius: 1,
    marginBottom: 8,
  },
  previewName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  previewBase: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginBottom: 6,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  modLine: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
  },
  noMods: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  confirmBtn: {
    backgroundColor: COLORS.teal,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
