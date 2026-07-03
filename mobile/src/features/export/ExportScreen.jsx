import React, { useState } from 'react';
import { Text } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle, Button, Input, Label } from '../../components/common/ui.jsx';
import { buildDietCsv } from '../../utils/export.js';
import { buildReportHtml } from './reportHtml.js';
import { getLocalDateString, getDefaultStartDate, getDefaultExportEndDate } from '../../utils/date.js';

// Экспорт отчёта: PDF через expo-print (window.print заменён), шеринг через expo-sharing.
export default function ExportScreen() {
  const t = useTheme();
  const data = useAppData();
  const { notify } = data;
  const [start, setStart] = useState(getDefaultStartDate());
  const [end, setEnd] = useState(getDefaultExportEndDate());
  const [busy, setBusy] = useState(false);

  const buildDates = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      notify('Проверьте даты: формат ГГГГ-ММ-ДД, начало не позже конца.');
      return null;
    }
    const dates = [];
    const d = new Date(start);
    while (getLocalDateString(d) <= end) {
      dates.push(getLocalDateString(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  };

  const exportPdf = async () => {
    const dates = buildDates();
    if (!dates) return;
    setBusy(true);
    try {
      const html = buildReportHtml({ dates, data });
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Отчёт по питанию' });
      } else {
        notify('PDF сохранён: ' + uri);
      }
    } catch (e) {
      notify('Не удалось создать PDF: ' + e.message);
    }
    setBusy(false);
  };

  const exportCsv = async () => {
    const dates = buildDates();
    if (!dates) return;
    setBusy(true);
    try {
      const csv = buildDietCsv({
        dates,
        getGoalsForDate: data.getEffectiveGoals,
        dailyLogs: data.dailyLogs,
        dailySteps: data.dailySteps,
        dailyMetrics: data.dailyMetrics,
        dailyWorkouts: data.dailyWorkouts,
        dailyWater: data.dailyWater,
        dailyExtraActivities: data.dailyExtraActivities,
      });
      const uri = `${FileSystem.cacheDirectory}diet_${start}_${end}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'CSV-выгрузка дневника' });
      } else {
        notify('CSV сохранён: ' + uri);
      }
    } catch (e) {
      notify('Не удалось создать CSV: ' + e.message);
    }
    setBusy(false);
  };

  return (
    <ScreenContainer>
      <Card>
        <SectionTitle>Период отчёта</SectionTitle>
        <Label>Начало (ГГГГ-ММ-ДД)</Label>
        <Input value={start} onChangeText={setStart} placeholder="2026-06-01" style={{ marginBottom: 10 }} />
        <Label>Конец (ГГГГ-ММ-ДД)</Label>
        <Input value={end} onChangeText={setEnd} placeholder="2026-07-01" style={{ marginBottom: 4 }} />
      </Card>
      <Card>
        <SectionTitle>Экспорт</SectionTitle>
        <Text style={{ color: t.textMuted, fontSize: 12, marginBottom: 12 }}>
          PDF — отчёт с целями, съеденным, КБЖУ и списком еды по дням. CSV — таблица для Excel/Numbers.
        </Text>
        <Button title={busy ? 'Готовлю…' : 'Скачать PDF-отчёт'} onPress={exportPdf} disabled={busy} style={{ marginBottom: 8 }} />
        <Button title="Выгрузить CSV" variant="secondary" onPress={exportCsv} disabled={busy} />
      </Card>
    </ScreenContainer>
  );
}
