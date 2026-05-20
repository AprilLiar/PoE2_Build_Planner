import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import SkillTreeScreen from '../screens/SkillTreeScreen';
import ItemsScreen from '../screens/ItemsScreen';
import GemsScreen from '../screens/GemsScreen';

// Drawer screen names — kept as string constants to avoid typos
export type DrawerParamList = {
  'Skill Tree': undefined;
  Items: undefined;
  Gems: undefined;
};

const Drawer = createDrawerNavigator<DrawerParamList>();

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator
      initialRouteName="Skill Tree"
      screenOptions={{
        // --- Drawer panel ---
        drawerStyle: {
          backgroundColor: '#0A0E1A',
          width: 240,
        },
        // Active screen label colour in the drawer
        drawerActiveTintColor: '#C9A84C',
        // Inactive screen label colour
        drawerInactiveTintColor: '#94A3B8',
        // Background highlight behind the active item
        drawerActiveBackgroundColor: '#1E3A5F',

        // --- Screen header ---
        headerStyle: {
          backgroundColor: '#111827',
        },
        headerTintColor: '#E2E8F0',
        headerTitleStyle: {
          fontSize: 18,
          fontWeight: '600',
        },

        // Screen background
        sceneStyle: {
          backgroundColor: '#0A0E1A',
        },
      }}
    >
      <Drawer.Screen name="Skill Tree" component={SkillTreeScreen} />
      <Drawer.Screen name="Items" component={ItemsScreen} />
      <Drawer.Screen name="Gems" component={GemsScreen} />
    </Drawer.Navigator>
  );
}
