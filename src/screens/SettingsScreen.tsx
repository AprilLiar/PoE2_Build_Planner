import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/colors';

const APP_VERSION = Constants.expoConfig?.version ?? '—';

// ─── Reusable row building blocks ─────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

// A static row showing a label on the left and a value on the right.
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// A disabled row for features not yet shipped. Shows a "Soon" badge.
function LockedRow({ label, description }: { label: string; description?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.lockedLeft}>
        <Text style={styles.lockedLabel}>{label}</Text>
        {description && <Text style={styles.lockedDesc}>{description}</Text>}
      </View>
      <View style={styles.soonBadge}>
        <Text style={styles.soonText}>Soon</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
      ]}
      showsVerticalScrollIndicator={false}
    >

      {/* ── App identity header ─────────────────────────────────────────── */}
      <View style={styles.appHeader}>
        {/* Icon glyph — Σ represents the passive point summation theme */}
        <View style={styles.iconCircle}>
          <Text style={styles.iconGlyph}>Σ</Text>
        </View>
        <Text style={styles.appName}>PoE2 Build Planner</Text>
        <Text style={styles.appTagline}>Passive tree &amp; gear manager</Text>
        <Text style={styles.appVersion}>Version {APP_VERSION}</Text>
      </View>

      {/* ── About ───────────────────────────────────────────────────────── */}
      <SectionLabel text="ABOUT" />
      <View style={styles.card}>
        <InfoRow label="Game" value="Path of Exile 2" />
        <RowDivider />
        <InfoRow label="Game Data Patch" value="0.4.0" />
        <RowDivider />
        <InfoRow label="Passive Tree Nodes" value="4,701" />
        <RowDivider />
        <InfoRow label="Playable Classes" value="8" />
        <RowDivider />
        <InfoRow label="Ascendancies" value="21" />
      </View>

      {/* ── Coming soon ─────────────────────────────────────────────────── */}
      <SectionLabel text="COMING SOON" />
      <View style={styles.card}>
        <LockedRow
          label="Remove Ads"
          description="One-time purchase to remove all ads"
        />
        <RowDivider />
        <LockedRow
          label="Export & Import Builds"
          description="Share builds as files or links"
        />
        <RowDivider />
        <LockedRow
          label="Cloud Backup"
          description="Sync builds across devices"
        />
      </View>

      {/* ── Legal ───────────────────────────────────────────────────────── */}
      <SectionLabel text="LEGAL" />
      <View style={styles.card}>
        <Text style={styles.disclaimer}>
          This app is not affiliated with or endorsed by Grinding Gear Games.
          Path of Exile 2, all game data, asset names, and related content are
          the property of Grinding Gear Games Ltd.
        </Text>
        <RowDivider />
        <Text style={styles.disclaimer}>
          Passive tree data is sourced from the official GGG skill tree export
          (patch 0.4.0). This app is provided as a free community tool.
        </Text>
      </View>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bgDeep,
  },
  content: {
    paddingHorizontal: 16,
  },

  // ── App header
  appHeader: {
    alignItems: 'center',
    paddingVertical: 28,
    marginBottom: 8,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.bgPanel,
    borderWidth: 2,
    borderColor: COLORS.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconGlyph: {
    color: COLORS.gold,
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 40,
  },
  appName: {
    color: COLORS.gold,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  appTagline: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginBottom: 6,
  },
  appVersion: {
    color: COLORS.textMuted,
    fontSize: 12,
    letterSpacing: 0.3,
  },

  // ── Section label
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 6,
    marginLeft: 4,
  },

  // ── Card container (wraps a group of rows)
  card: {
    backgroundColor: COLORS.bgPanel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },

  // ── Info row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 50,
  },
  rowLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '400',
    flex: 1,
    marginRight: 12,
  },
  rowValue: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'right',
  },

  // ── Row separator
  rowDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
  },

  // ── Locked / coming-soon row
  lockedLeft: {
    flex: 1,
    marginRight: 12,
  },
  lockedLabel: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '400',
  },
  lockedDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
    opacity: 0.6,
  },
  soonBadge: {
    backgroundColor: 'rgba(201,168,76,0.15)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.gold,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  soonText: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Disclaimer text block
  disclaimer: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
