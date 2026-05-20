// Root application component — will be fully wired in Phase 5
// For now, renders a placeholder so the bare workflow entry point works
import React from 'react';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0E1A', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#E2E8F0', fontSize: 18 }}>PoE Build Planner — setting up...</Text>
    </View>
  );
}
