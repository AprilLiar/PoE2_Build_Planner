import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Sprint 1 placeholder — full gems UI comes in a later sprint
export default function GemsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Gems — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#94A3B8',
    fontSize: 16,
  },
});
