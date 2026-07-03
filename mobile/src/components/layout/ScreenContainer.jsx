import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';

import { useTheme } from '../../theme/ThemeContext.jsx';
import RainOverlay from './RainOverlay.jsx';

// Общий контейнер экрана: фон темы + скролл + отступы.
// scroll={false} — для экранов на FlatList (нельзя вкладывать его в ScrollView).
export default function ScreenContainer({ children, scroll = true }) {
  const t = useTheme();
  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content]}>{children}</View>
  );
  return (
    <View style={[styles.flex, { backgroundColor: t.bgDeep }]}>
      {t.rain ? <RainOverlay /> : null}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
});
