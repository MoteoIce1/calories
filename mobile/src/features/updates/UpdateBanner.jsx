import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../theme/ThemeContext.jsx';
import { Button } from '../../components/common/ui.jsx';

// Баннер «Доступно обновление» — аналог UpdateCallout web-версии,
// но перезапуск идёт через expo-updates, а не service worker.
export default function UpdateBanner({ visible, applying, onApply }) {
  const t = useTheme();
  if (!visible) return null;
  return (
    <View style={[styles.banner, { backgroundColor: t.accentSoft, borderColor: t.accent }]}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }}>Доступно обновление</Text>
        <Text style={{ color: t.textMuted, fontSize: 11 }}>Новая версия уже загружена — перезапустите приложение.</Text>
      </View>
      <Button title={applying ? '…' : 'Обновить'} small onPress={onApply} disabled={applying} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
});
