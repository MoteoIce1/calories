import React from 'react';
import { Text, Linking, Pressable } from 'react-native';

import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle } from '../../components/common/ui.jsx';
import { OWNER_EMAIL } from '../../services/firebase.js';

// Поддержка: контакт для вопросов и предложений.
export default function SupportScreen() {
  const t = useTheme();
  return (
    <ScreenContainer>
      <Card>
        <SectionTitle>Связаться с нами</SectionTitle>
        <Text style={{ color: t.text2, fontSize: 14, lineHeight: 20, marginBottom: 12 }}>
          Вопросы, идеи или что-то не работает? Напишите нам на почту — отвечаем быстро.
        </Text>
        <Pressable onPress={() => Linking.openURL(`mailto:${OWNER_EMAIL}`)}>
          <Text style={{ color: t.accent, fontSize: 15, fontWeight: '700' }}>{OWNER_EMAIL}</Text>
        </Pressable>
      </Card>
    </ScreenContainer>
  );
}
