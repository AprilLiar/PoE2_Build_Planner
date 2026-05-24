import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import { useTreeStore } from '../store/useTreeStore';
import { COLORS } from '../constants/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function NodeSearchModal({ visible, onClose }: Props) {
  const { setLiveSearchQuery, addSearchFilter } = useTreeStore();
  const [query, setQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const handleQueryChange = useCallback(
    (text: string) => {
      setQuery(text);
      setLiveSearchQuery(text);
    },
    [setLiveSearchQuery]
  );

  // Reset input and clear live preview each time the modal opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setLiveSearchQuery('');
    }
  }, [visible, setLiveSearchQuery]);

  const commit = useCallback(() => {
    // Commit non-empty query as a persistent filter chip
    const q = query.trim();
    if (q) addSearchFilter(q);
    setLiveSearchQuery('');
    onClose();
  }, [query, addSearchFilter, setLiveSearchQuery, onClose]);

  const handleClose = useCallback(() => {
    commit();
  }, [commit]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      {/* Semi-transparent backdrop — tree glow is visible behind */}
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={query}
                onChangeText={handleQueryChange}
                placeholder="Search nodes…"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleClose}
                clearButtonMode="while-editing"
              />
              <Text style={styles.hint}>
                {query.trim().length === 0
                  ? 'Highlighted nodes appear on the tree'
                  : 'Dismiss to save as a filter'}
              </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: 'rgba(11, 15, 26, 0.95)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.gold,
    padding: 12,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  hint: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
