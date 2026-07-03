import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../theme/ThemeContext.jsx';
import { Button } from './ui.jsx';

// Промис-подтверждение (замена confirm из web-версии).
export default function ConfirmModal({ state, onResolve }) {
  const t = useTheme();
  if (!state) return null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => onResolve(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.box, { backgroundColor: t.surfaceStrong, borderColor: t.lineStrong }]}>
          <Text style={[styles.message, { color: t.text }]}>{state.message}</Text>
          <View style={styles.row}>
            <Button title={state.cancelLabel} variant="secondary" onPress={() => onResolve(false)} style={styles.btn} />
            <Button
              title={state.confirmLabel}
              variant={state.danger ? 'danger' : 'primary'}
              onPress={() => onResolve(true)}
              style={styles.btn}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  message: {
    fontSize: 15,
    marginBottom: 16,
    lineHeight: 21,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
  },
});
