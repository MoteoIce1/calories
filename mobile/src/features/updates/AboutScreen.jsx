import React from 'react';
import { Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle, Button } from '../../components/common/ui.jsx';
import UpdateBanner from './UpdateBanner.jsx';
import { useUpdateCheck } from '../../hooks/useUpdateCheck.js';

// О приложении: версия сборки, канал обновлений, ручная проверка обновлений.
export default function AboutScreen() {
  const t = useTheme();
  const { updateAvailable, applying, applyUpdate, check } = useUpdateCheck();
  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const updateId = Updates.updateId ? Updates.updateId.slice(0, 8) : 'встроенная сборка';

  return (
    <ScreenContainer>
      <UpdateBanner visible={updateAvailable} applying={applying} onApply={applyUpdate} />
      <Card>
        <SectionTitle>Трекер Диеты</SectionTitle>
        <Row label="Версия приложения" value={appVersion} />
        <Row label="OTA-обновление" value={updateId} />
        <Row label="Канал" value={Updates.channel || '—'} />
        <Button title="Проверить обновления" variant="secondary" onPress={check} style={{ marginTop: 12 }} />
      </Card>
      <Card>
        <Text style={{ color: t.textMuted, fontSize: 12, lineHeight: 18 }}>
          Дневник питания, КБЖУ, шаги, вода, прогресс тела, споры с друзьями и ИИ-распознавание еды.
          Данные синхронизируются с вашим аккаунтом — web-версия и приложение используют одну базу.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

function Row({ label, value }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ color: t.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
