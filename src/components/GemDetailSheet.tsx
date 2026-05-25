import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { GemCatalogEntry, gemColorHex, gemColorLabel } from '../store/useGemStore';
import { COLORS } from '../constants/colors';

interface Props {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  gem: GemCatalogEntry | null;
  gemLevel?: number; // only relevant for active skill gems
  onRemove?: () => void;
}

const SNAP_POINTS = ['55%', '85%'];

const Backdrop = (props: any) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
);

export default function GemDetailSheet({ sheetRef, gem, gemLevel = 1, onRemove }: Props) {
  if (!gem) return null;

  const colorHex = gemColorHex(gem.color);
  // PoE2 uniform curve: 0 at L1 → 90 at L20
  const levelReq = Math.round((Math.min(gemLevel, 20) - 1) * 90 / 19);
  const attrLabel = gemColorLabel(gem.color);

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
        {/* Header: gem name + type badge */}
        <View style={styles.header}>
          {/* Colour indicator */}
          <View style={[styles.colorBar, { backgroundColor: colorHex }]} />
          <View style={styles.headerText}>
            <Text style={styles.gemName}>{gem.name}</Text>
            <View style={styles.headerRow}>
              <View style={[styles.badge, { borderColor: colorHex }]}>
                <Text style={[styles.badgeText, { color: colorHex }]}>
                  {gem.is_support ? `Support · ${attrLabel}` : `Active · ${attrLabel}`}
                </Text>
              </View>
              {!gem.is_support && (
                <Text style={styles.levelInfo}>
                  {'  '}Gem Lv {gemLevel} — Req Lv {levelReq}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Tags / Description */}
        {gem.tags.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Tags</Text>
            <View style={styles.tagRow}>
              {gem.tags.map((tag) => (
                <View key={tag} style={[styles.tagChip, { borderColor: colorHex }]}>
                  <Text style={[styles.tagText, { color: colorHex }]}>
                    {tag.charAt(0).toUpperCase() + tag.slice(1)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.descriptionMuted}>No description available.</Text>
          </>
        )}

        {/* Remove button */}
        {onRemove && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => {
                onRemove();
                sheetRef.current?.dismiss();
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.removeBtnText}>Remove Gem</Text>
            </TouchableOpacity>
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: COLORS.bgPanel,
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
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 16,
    marginBottom: 12,
  },
  colorBar: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginRight: 12,
    marginTop: 2,
  },
  headerText: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  gemName: {
    color: COLORS.gold,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  levelInfo: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  descriptionMuted: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontStyle: 'italic',
  },
  removeBtn: {
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  removeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
