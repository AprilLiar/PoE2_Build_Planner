import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import {
  DrawerContentScrollView,
  DrawerItemList,
  DrawerItem,
  DrawerContentComponentProps,
} from '@react-navigation/drawer';
import type { DrawerNavigationOptions } from '@react-navigation/drawer';
import SkillTreeScreen from '../screens/SkillTreeScreen';
import ItemsScreen from '../screens/ItemsScreen';
import GemsScreen from '../screens/GemsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useBuildStore } from '../store/useBuildStore';
import { COLORS } from '../constants/colors';

export type DrawerParamList = {
  'Skill Tree': undefined;
  Items: undefined;
  Gems: undefined;
  Settings: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

const SCREEN_OPTIONS: DrawerNavigationOptions = {
  headerShown: false,
  swipeEnabled: false,
  drawerStyle: {
    backgroundColor: COLORS.bgDeep,
    width: 240,
  },
  drawerActiveTintColor: COLORS.gold,
  drawerInactiveTintColor: COLORS.textMuted,
  drawerActiveBackgroundColor: COLORS.border,
  sceneStyle: {
    backgroundColor: COLORS.bgDeep,
  },
};

// ─── Custom drawer content ────────────────────────────────────────────────────

function BuildDrawerContent(props: DrawerContentComponentProps) {
  const currentBuild = useBuildStore((s) => s.currentBuild);

  // Navigate back to the root BuildListScreen by reaching the parent stack navigator.
  const goToBuildList = () => {
    props.navigation.getParent()?.navigate('BuildList');
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={drawerStyles.scrollContent}>
      {/* Build identity header */}
      {currentBuild && (
        <View style={drawerStyles.buildHeader}>
          <Text style={drawerStyles.buildName} numberOfLines={1}>{currentBuild.name}</Text>
          <Text style={drawerStyles.buildSub}>
            {currentBuild.character.class} · Level {currentBuild.character.level}
          </Text>
        </View>
      )}

      {/* Standard drawer screen items */}
      <DrawerItemList {...props} />

      {/* Spacer to push the back link to the bottom */}
      <View style={drawerStyles.spacer} />

      {/* Back to build list */}
      <View style={drawerStyles.separator} />
      <DrawerItem
        label="← Build List"
        onPress={goToBuildList}
        labelStyle={drawerStyles.backLabel}
        style={drawerStyles.backItem}
      />
    </DrawerContentScrollView>
  );
}

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator
      initialRouteName="Skill Tree"
      screenOptions={SCREEN_OPTIONS}
      drawerContent={(props) => <BuildDrawerContent {...props} />}
    >
      <Drawer.Screen name="Skill Tree" component={SkillTreeScreen} />
      <Drawer.Screen name="Items" component={ItemsScreen} />
      <Drawer.Screen name="Gems" component={GemsScreen} />
      <Drawer.Screen name="Settings" component={SettingsScreen} />
    </Drawer.Navigator>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const drawerStyles = StyleSheet.create({
  scrollContent: {
    flex: 1,
  },
  buildHeader: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 6,
  },
  buildName: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buildSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  spacer: {
    flex: 1,
    minHeight: 16,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  backLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  backItem: {
    marginBottom: 8,
  },
});
