import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import type { DrawerNavigationOptions } from '@react-navigation/drawer';
import SkillTreeScreen from '../screens/SkillTreeScreen';
import ItemsScreen from '../screens/ItemsScreen';
import GemsScreen from '../screens/GemsScreen';
import { COLORS } from '../constants/colors';

export type DrawerParamList = {
  'Skill Tree': undefined;
  Items: undefined;
  Gems: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

const SCREEN_OPTIONS: DrawerNavigationOptions = {
  drawerStyle: {
    backgroundColor: COLORS.bgDeep,
    width: 240,
  },
  drawerActiveTintColor: COLORS.gold,
  drawerInactiveTintColor: COLORS.textMuted,
  drawerActiveBackgroundColor: COLORS.border,
  headerStyle: {
    backgroundColor: COLORS.bgPanel,
  },
  headerTintColor: COLORS.text,
  headerTitleStyle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sceneStyle: {
    backgroundColor: COLORS.bgDeep,
  },
};

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator initialRouteName="Skill Tree" screenOptions={SCREEN_OPTIONS}>
      <Drawer.Screen name="Skill Tree" component={SkillTreeScreen} />
      <Drawer.Screen name="Items" component={ItemsScreen} />
      <Drawer.Screen name="Gems" component={GemsScreen} />
    </Drawer.Navigator>
  );
}
