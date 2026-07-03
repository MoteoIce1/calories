import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Неблокирующие уведомления (замена alert из web-версии).
export default function Toasts({ toasts }) {
  const insets = useSafeAreaInsets();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      {toasts.map((toast) => (
        <View
          key={toast.id}
          style={[styles.toast, toast.kind === 'error' ? styles.error : styles.success]}
        >
          <Text style={styles.text}>{toast.message}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    gap: 8,
  },
  toast: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  success: {
    backgroundColor: 'rgba(16, 90, 50, 0.95)',
    borderColor: 'rgba(52, 211, 153, 0.4)',
  },
  error: {
    backgroundColor: 'rgba(120, 30, 30, 0.95)',
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
