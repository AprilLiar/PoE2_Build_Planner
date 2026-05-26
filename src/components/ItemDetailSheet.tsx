import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from '@gorhom/bottom-sheet';
import { Item } from '../types/build';
import { COLORS } from '../constants/colors';
import { parseItem, ParsedSection, SectionType } from '../utils/itemParser';

const RARITY_COLOR: Record<string, string> = {
  Normal: '#C8C8C8',
  Magic: '#8888FF',
  Rare: '#FFFF77',
  Unique: '#AF6025',
};

// Rarity-specific header gradient colors (dark tint for the header bg)
const RARITY_HEADER_BG: Record<string, string> = {
  Normal: '#1A1A1A',
  Magic: '#1A1A2E',
  Rare: '#1E1C00',
  Unique: '#1E0E00',
};

const SNAP_POINTS = ['65%', '92%'];

const Backdrop = (props: any) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

interface Props {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  item: Item | null;
  onEdit: () => void;
  onClear: () => void;
}

// Renders a single -------- separated section with a preceding divider
function TooltipSection({ section, rarityHex, isFirst }: {
  section: ParsedSection;
  rarityHex: string;
  isFirst: boolean;
}) {
  return (
    <View>
      {!isFirst && (
        <View style={[styles.sectionDivider, { backgroundColor: rarityHex + '55' }]} />
      )}
      {section.lines.map((line, i) => (
        <Text
          key={i}
          style={[
            styles.sectionLine,
            section.type === 'properties' && styles.propLine,
            section.type === 'flag' && line === 'Corrupted' && styles.corruptedLine,
            section.type === 'flag' && line !== 'Corrupted' && styles.flagLine,
          ]}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

export default function ItemDetailSheet({ sheetRef, item, onEdit, onClear }: Props) {
  // Re-parse raw_text to get structured sections for tooltip rendering.
  // Parsing is synchronous and instant (item text is a few hundred bytes).
  const parsed = useMemo(() => {
    if (!item) return null;
    const outcome = parseItem(item.raw_text);
    return outcome.ok ? outcome.result : null;
  }, [item]);

  if (!item) return null;

  const rarityHex = RARITY_COLOR[item.rarity] ?? COLORS.text;
  const headerBg = RARITY_HEADER_BG[item.rarity] ?? RARITY_HEADER_BG.Normal;

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      backdropComponent={Backdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        {/* ── Tooltip header ── */}
        <View style={[styles.tooltipHeader, { backgroundColor: headerBg, borderBottomColor: rarityHex + '99' }]}>
          {/* Top rarity accent line */}
          <View style={[styles.rarityAccent, { backgroundColor: rarityHex }]} />

          <View style={styles.headerRow}>
            {!!item.icon && (
              <Image
                source={{ uri: item.icon }}
                style={styles.icon}
                resizeMode="contain"
              />
            )}
            <View style={styles.headerNames}>
              <Text style={[styles.itemName, { color: rarityHex }]}>
                {item.name}
              </Text>
              {item.base_type !== item.name && (
                <Text style={[styles.baseType, { color: rarityHex + 'CC' }]}>
                  {item.base_type}
                </Text>
              )}
            </View>
            {parsed?.item_level !== undefined && (
              <Text style={styles.itemLevel}>iLvl {parsed.item_level}</Text>
            )}
          </View>
        </View>

        {/* ── Tooltip body: sections ── */}
        <View style={styles.tooltipBody}>
          {parsed?.sections.length ? (
            parsed.sections.map((section, i) => (
              <TooltipSection
                key={i}
                section={section}
                rarityHex={rarityHex}
                isFirst={i === 0}
              />
            ))
          ) : (
            // Fallback to flat mods if parse failed or produced no sections
            item.mods.length > 0 ? (
              item.mods.map((mod, i) => (
                <Text key={i} style={styles.sectionLine}>{mod}</Text>
              ))
            ) : (
              <Text style={styles.noMods}>No modifiers</Text>
            )
          )}

          {/* Corruption tag shown separately at bottom if detected */}
          {parsed?.is_corrupted && !parsed.sections.some(s => s.type === 'flag') && (
            <View>
              <View style={[styles.sectionDivider, { backgroundColor: rarityHex + '55' }]} />
              <Text style={styles.corruptedLine}>Corrupted</Text>
            </View>
          )}
        </View>

        {/* ── Actions ── */}
        <View style={[styles.divider, { backgroundColor: COLORS.border }]} />
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => { sheetRef.current?.dismiss(); onEdit(); }}
            activeOpacity={0.75}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { onClear(); sheetRef.current?.dismiss(); }}
            activeOpacity={0.75}
          >
            <Text style={styles.clearBtnText}>Clear Slot</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  handle: {
    backgroundColor: COLORS.border,
    width: 40,
  },
  content: {
    paddingBottom: 32,
  },

  // ── Header ──
  tooltipHeader: {
    borderBottomWidth: 1,
    marginBottom: 0,
  },
  rarityAccent: {
    height: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 4,
    backgroundColor: '#111',
  },
  headerNames: {
    flex: 1,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  baseType: {
    fontSize: 13,
    marginTop: 1,
  },
  itemLevel: {
    color: '#6B7280',
    fontSize: 11,
    alignSelf: 'flex-start',
    marginTop: 2,
  },

  // ── Body sections ──
  tooltipBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sectionDivider: {
    height: 1,
    marginVertical: 8,
  },
  sectionLine: {
    color: '#E2E8F0',
    fontSize: 13.5,
    lineHeight: 21,
  },
  propLine: {
    color: '#8A8A8A',
    fontSize: 13,
    lineHeight: 20,
  },
  corruptedLine: {
    color: '#DC2626',
    fontSize: 13.5,
    lineHeight: 21,
  },
  flagLine: {
    color: COLORS.textMuted,
    fontSize: 13.5,
    lineHeight: 21,
  },
  noMods: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },

  // ── Actions ──
  divider: {
    height: 1,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  editBtn: {
    flex: 1,
    backgroundColor: COLORS.teal,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  clearBtn: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  clearBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
