import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle, Button, Input, Label, EmptyState, Segmented } from '../../components/common/ui.jsx';
import { ProgressChart } from '../../components/common/Charts.jsx';
import { progressPeriods, filterDatesByProgressPeriod } from '../../utils/progress.js';
import { getLocalDateString } from '../../utils/date.js';
import { evaluateMath } from '../../utils/math.js';
import { BODY_MEASURE_FIELDS, EMPTY_BODY_MEASURES } from '../../constants/body.js';

// Экран прогресса: графики веса/жира по дневным метрикам + замеры тела.
// TODO(photos): фото прогресса (камера/галерея) будут добавлены через expo-image-picker.
export default function ProgressScreen() {
  const t = useTheme();
  const { dailyMetrics, bodyEntries, addBodyEntry, deleteBodyEntry } = useAppData();
  const [period, setPeriod] = useState('all');
  const [showEditor, setShowEditor] = useState(false);
  const [draft, setDraft] = useState({ date: getLocalDateString(new Date()), measures: { ...EMPTY_BODY_MEASURES } });

  // Серии для графиков из дневных метрик (вес, жир, БЖМ, масса жира).
  const chartData = useMemo(() => {
    const allDates = Object.keys(dailyMetrics).sort();
    const dates = filterDatesByProgressPeriod(allDates, period);
    const series = (key) => dates.map((d) => (dailyMetrics[d]?.[key] !== undefined && dailyMetrics[d][key] !== '' ? Number(dailyMetrics[d][key]) : null));
    return {
      dates,
      weight: series('weight'),
      fatPercent: series('fatPercent'),
      leanMass: series('leanMass'),
      fatMass: series('fatMass'),
    };
  }, [dailyMetrics, period]);

  const hasChartData = (arr) => arr.filter((v) => v !== null && !Number.isNaN(v)).length >= 2;

  const submitBodyEntry = async () => {
    const ok = await addBodyEntry(draft);
    if (ok) {
      setDraft({ date: getLocalDateString(new Date()), measures: { ...EMPTY_BODY_MEASURES } });
      setShowEditor(false);
    }
  };

  const setMeasure = (key) => (value) => {
    const normalized = value === '' ? '' : Math.max(0, Math.round(evaluateMath(value) * 10) / 10);
    setDraft((prev) => ({ ...prev, measures: { ...prev.measures, [key]: value === '' ? '' : normalized } }));
  };

  const sortedEntries = [...bodyEntries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ScreenContainer>
      <Card>
        <SectionTitle>Период</SectionTitle>
        <Segmented
          options={progressPeriods.map((p) => ({ key: p.key, label: p.label }))}
          value={period}
          onChange={setPeriod}
        />
      </Card>

      {!hasChartData(chartData.weight) && !hasChartData(chartData.fatPercent) ? (
        <Card>
          <EmptyState text="Записей прогресса пока нет. Заполняйте вес и % жира в дневнике — графики появятся здесь." />
        </Card>
      ) : (
        <>
          {hasChartData(chartData.weight) && (
            <ProgressChart title="Вес, кг" data={chartData.weight} dates={chartData.dates} color={t.accent} showAverage />
          )}
          {hasChartData(chartData.fatPercent) && (
            <ProgressChart title="Жир, %" data={chartData.fatPercent} dates={chartData.dates} color={t.cFatText} showAverage />
          )}
          {hasChartData(chartData.leanMass) && (
            <ProgressChart title="БЖМ, кг" data={chartData.leanMass} dates={chartData.dates} color={t.cCarb} showAverage />
          )}
          {hasChartData(chartData.fatMass) && (
            <ProgressChart title="Масса жира, кг" data={chartData.fatMass} dates={chartData.dates} color={t.danger} showAverage />
          )}
        </>
      )}

      <Card>
        <View style={styles.rowBetween}>
          <SectionTitle style={{ marginBottom: 0 }}>Замеры тела</SectionTitle>
          <Button
            title={showEditor ? 'Скрыть' : '+ Добавить'}
            small
            variant={showEditor ? 'secondary' : 'primary'}
            onPress={() => setShowEditor((v) => !v)}
          />
        </View>

        {showEditor && (
          <View style={{ marginTop: 12 }}>
            <Label>Дата (ГГГГ-ММ-ДД)</Label>
            <Input
              value={draft.date}
              onChangeText={(v) => setDraft((prev) => ({ ...prev, date: v }))}
              placeholder="2026-07-03"
              style={{ marginBottom: 10 }}
            />
            <View style={styles.grid}>
              {BODY_MEASURE_FIELDS.map((field) => (
                <View key={field.key} style={styles.gridItem}>
                  <Label>{field.label}</Label>
                  <Input
                    keyboardType="numeric"
                    value={String(draft.measures[field.key] ?? '')}
                    onChangeText={setMeasure(field.key)}
                    placeholder={field.unit}
                  />
                </View>
              ))}
            </View>
            <Button title="Сохранить замеры" onPress={submitBodyEntry} style={{ marginTop: 12 }} />
          </View>
        )}

        {sortedEntries.length === 0 && !showEditor ? (
          <EmptyState text="Замеров пока нет" />
        ) : (
          sortedEntries.map((entry) => (
            <View key={entry.id} style={[styles.entryRow, { borderColor: t.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 13, fontWeight: '700', marginBottom: 2 }}>{entry.date}</Text>
                <Text style={{ color: t.textMuted, fontSize: 11 }}>
                  {BODY_MEASURE_FIELDS
                    .filter((f) => entry.measures?.[f.key])
                    .map((f) => `${f.label}: ${entry.measures[f.key]} ${f.unit}`)
                    .join(' · ') || 'Только фото'}
                </Text>
              </View>
              <Pressable onPress={() => deleteBodyEntry(entry.id)} hitSlop={8} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={t.danger} />
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '47%',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
});
