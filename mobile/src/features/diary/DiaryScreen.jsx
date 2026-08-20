import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle, Button, Input, Label, EmptyState, ProgressBar } from '../../components/common/ui.jsx';
import { MacroBar } from '../../components/common/Charts.jsx';
import MealComposer from './MealComposer.jsx';
import ExtraActivityModal from '../activity/ExtraActivityModal.jsx';
import UpdateBanner from '../updates/UpdateBanner.jsx';
import { useUpdateCheck } from '../../hooks/useUpdateCheck.js';
import { getLocalDateString, displayDate } from '../../utils/date.js';
import { evaluateMath } from '../../utils/math.js';
import { calculateStepCalorieAdjustment, calculateStepsCalories } from '../../utils/kbju.js';
import { normalizeExtraActivities, sumExtraActivityCalories, calculateDailyAvailableCalories, getExtraActivityType } from '../../utils/activity.js';
import { getUsualSteps, WATER_QUICK, DAILY_BODY_METRICS, DEFAULT_SETTINGS } from '../../constants/app.js';

const shiftDate = (dateString, diff) => {
  const d = new Date(dateString);
  d.setDate(d.getDate() + diff);
  return getLocalDateString(d);
};

export default function DiaryScreen() {
  const t = useTheme();
  const {
    foods, settings, getEffectiveGoals,
    dailyLogs, dailySteps, dailyMetrics, dailyWorkouts, dailyWater, dailyExtraActivities,
    updateSteps, updateMetrics, addFoodLog, updateLogWeight, deleteLog, repeatLog, copyPreviousDay,
    toggleWorkout, addWater, resetWater, removeExtraActivity, confirmDialog,
  } = useAppData();

  const [currentDate, setCurrentDate] = useState(getLocalDateString(new Date()));
  const [stepsInput, setStepsInput] = useState(null); // null = показываем сохранённое значение
  const [customWater, setCustomWater] = useState('');
  const [editingLogId, setEditingLogId] = useState(null);
  const [editGrams, setEditGrams] = useState('');
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);

  const todayStr = getLocalDateString(new Date());
  const blocks = settings.blocks || DEFAULT_SETTINGS.blocks;

  // ── Расчёты дня (портированы из web App.jsx без изменений формул) ──
  const activeGoals = getEffectiveGoals(currentDate);
  const baseStepsGoal = getUsualSteps(activeGoals.baseSteps);
  const todaySteps = dailySteps[currentDate] !== undefined ? dailySteps[currentDate] : baseStepsGoal;
  const stepCaloriesDelta = calculateStepCalorieAdjustment(todaySteps, baseStepsGoal);
  const todayStepCalories = calculateStepsCalories(todaySteps);
  const baseTargetCalories = Number(activeGoals.calories) || 0;
  const targetCalories = baseTargetCalories + stepCaloriesDelta;
  const todayExtraActivities = normalizeExtraActivities(dailyExtraActivities[currentDate] || []);
  const extraActivityCalories = sumExtraActivityCalories(todayExtraActivities);
  const dailyAvailableCalories = calculateDailyAvailableCalories(targetCalories, todayExtraActivities);
  const dailyCarbGoal = Math.max(0, (Number(activeGoals.carbs) || 0) + Math.round(stepCaloriesDelta / 4));

  const currentDayLogs = dailyLogs[currentDate] || [];
  const totalCals = currentDayLogs.reduce((sum, log) => sum + (log.totalCalories || 0), 0);
  const totalPro = currentDayLogs.reduce((sum, log) => sum + (log.totalProtein || 0), 0);
  const totalFats = currentDayLogs.reduce((sum, log) => sum + (log.totalFats || 0), 0);
  const totalCarbs = currentDayLogs.reduce((sum, log) => sum + (log.totalCarbs || 0), 0);

  const isOver = totalCals > dailyAvailableCalories;
  const displayCals = isOver ? totalCals - dailyAvailableCalories : dailyAvailableCalories - totalCals;
  const calsLabel = isOver ? 'перебор' : 'осталось';
  const progressCals = Math.min(100, (totalCals / (dailyAvailableCalories || 1)) * 100);

  const todayWater = Number(dailyWater[currentDate]) || 0;
  const waterGoal = Number(activeGoals.waterGoal) || 2500;
  const dayMetrics = dailyMetrics[currentDate] || {};

  const foodById = useMemo(() => {
    const map = new Map();
    foods.forEach((f) => map.set(f.id, f));
    return map;
  }, [foods]);

  const changeDate = (diff) => {
    setCurrentDate((d) => shiftDate(d, diff));
    setStepsInput(null);
    setEditingLogId(null);
  };

  const submitLogEdit = (logId) => {
    const grams = Math.max(0, Math.round(evaluateMath(editGrams) * 10) / 10);
    setEditingLogId(null);
    if (grams > 0) updateLogWeight(currentDate, logId, grams);
  };

  const confirmDeleteLog = async (log) => {
    const food = foodById.get(log.foodId);
    if (await confirmDialog({ message: `Удалить «${food?.name || 'запись'}» из дневника?`, confirmLabel: 'Удалить', danger: true })) {
      deleteLog(currentDate, log.id);
    }
  };

  const openActivityModal = (activity = null) => {
    setEditingActivity(activity);
    setShowActivityModal(true);
  };

  const { updateAvailable, applying, applyUpdate } = useUpdateCheck();

  return (
    <ScreenContainer>
      <UpdateBanner visible={updateAvailable} applying={applying} onApply={applyUpdate} />
      {/* ── Дата ── */}
      <View style={styles.dateRow}>
        <Pressable onPress={() => changeDate(-1)} hitSlop={10} style={styles.dateArrow} accessibilityLabel="Предыдущий день">
          <Ionicons name="chevron-back" size={28} color={t.accent} />
        </Pressable>
        <Text style={[styles.dateText, { color: t.text }]}>{displayDate(currentDate)}</Text>
        <Pressable
          onPress={() => changeDate(1)}
          hitSlop={10}
          style={[styles.dateArrow, currentDate >= todayStr && { opacity: 0.3 }]}
          disabled={currentDate >= todayStr}
        >
          <Ionicons name="chevron-forward" size={28} color={t.accent} />
        </Pressable>
      </View>

      {/* ── Показатели тела ── */}
      {blocks.bodyMetrics !== false && (
        <Card>
          <SectionTitle>Показатели тела</SectionTitle>
          <View style={[styles.row, { gap: 8 }]}>
            {DAILY_BODY_METRICS.map((metric) => (
              <View key={metric.key} style={{ flex: 1 }}>
                <Label>{metric.label}</Label>
                <MetricInput
                  value={dayMetrics[metric.key]}
                  onCommit={(val) => updateMetrics(currentDate, metric.key, val)}
                />
              </View>
            ))}
          </View>
        </Card>
      )}

      {/* ── Калории ── */}
      {blocks.calories !== false && (
        <Card>
          <SectionTitle>Калории</SectionTitle>
          <View style={styles.calsRow}>
            <View>
              <Text style={[styles.calsBig, { color: isOver ? t.danger : t.accent }]}>{Math.round(displayCals)}</Text>
              <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{calsLabel}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: t.text2, fontSize: 13 }}>Съедено: <Text style={{ fontWeight: '800' }}>{Math.round(totalCals)}</Text></Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>Лимит: {Math.round(dailyAvailableCalories)}</Text>
              {extraActivityCalories > 0 && (
                <Text style={{ color: t.accent, fontSize: 11 }}>+{extraActivityCalories} за активность</Text>
              )}
            </View>
          </View>
          <ProgressBar progress={progressCals} color={isOver ? t.danger : t.accent} />
        </Card>
      )}

      {/* ── КБЖУ ── */}
      {(blocks.protein !== false || blocks.fats !== false || blocks.carbs !== false) && (
        <Card>
          <SectionTitle>КБЖУ</SectionTitle>
          {blocks.protein !== false && <MacroBar label="Белок" current={totalPro} goal={activeGoals.protein} color={t.accent} />}
          {blocks.fats !== false && <MacroBar label="Жиры" current={totalFats} goal={activeGoals.fats} color={t.cFatText} />}
          {blocks.carbs !== false && <MacroBar label="Углеводы" current={totalCarbs} goal={dailyCarbGoal} color={t.cCarb} />}
        </Card>
      )}

      {/* ── Шаги ── */}
      {blocks.steps !== false && (
        <Card>
          <SectionTitle>Шаги</SectionTitle>
          <View style={styles.row}>
            <Input
              style={{ flex: 1 }}
              keyboardType="number-pad"
              value={stepsInput !== null ? stepsInput : String(dailySteps[currentDate] ?? baseStepsGoal)}
              placeholder={`База: ${baseStepsGoal}`}
              onChangeText={setStepsInput}
              onBlur={() => {
                if (stepsInput !== null) {
                  const trimmed = String(stepsInput).trim();
                  const num = parseInt(trimmed, 10);
                  // Пустое поле: ничего не пишем, возвращаем ранее сохранённое значение.
                  if (trimmed !== '' && !Number.isNaN(num)) {
                    updateSteps(currentDate, Math.max(0, num));
                  }
                }
                setStepsInput(null);
              }}
            />
            <View style={{ marginLeft: 12, alignItems: 'flex-end' }}>
              <Text style={{ color: t.text2, fontSize: 13, fontWeight: '700' }}>{todayStepCalories} ккал</Text>
              <Text style={{ color: stepCaloriesDelta >= 0 ? t.accent : t.danger, fontSize: 11 }}>
                {stepCaloriesDelta >= 0 ? '+' : ''}{stepCaloriesDelta} к лимиту
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* ── Дополнительная активность ── */}
      <Card>
        <View style={styles.rowBetween}>
          <SectionTitle style={{ marginBottom: 0 }}>Доп. активность</SectionTitle>
          <Button title="+ Добавить" small onPress={() => openActivityModal(null)} />
        </View>
        {todayExtraActivities.length === 0 ? (
          <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 10 }}>
            Футбол, бег, сноуборд — добавьте активность, и калории прибавятся к дневному лимиту.
          </Text>
        ) : (
          todayExtraActivities.map((activity) => (
            <View key={activity.id} style={[styles.activityRow, { borderColor: t.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>
                  {activity.name || getExtraActivityType(activity.type).label}
                </Text>
                <Text style={{ color: t.accent, fontSize: 12 }}>+{activity.calories} ккал</Text>
              </View>
              <Pressable onPress={() => openActivityModal(activity)} hitSlop={8} style={{ padding: 6 }}>
                <Ionicons name="pencil-outline" size={18} color={t.textMuted} />
              </Pressable>
              <Pressable onPress={() => removeExtraActivity(currentDate, activity.id)} hitSlop={8} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={18} color={t.danger} />
              </Pressable>
            </View>
          ))
        )}
      </Card>

      {/* ── Тренировка ── */}
      {blocks.workout !== false && (
        <Card>
          <View style={styles.rowBetween}>
            <SectionTitle style={{ marginBottom: 0 }}>Силовая тренировка</SectionTitle>
            <Switch
              value={!!dailyWorkouts[currentDate]}
              onValueChange={() => toggleWorkout(currentDate)}
              trackColor={{ true: t.accent, false: t.track }}
              thumbColor="#fff"
            />
          </View>
        </Card>
      )}

      {/* ── Вода ── */}
      {blocks.water !== false && (
        <Card>
          <SectionTitle>Вода</SectionTitle>
          <View style={styles.rowBetween}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>
              {todayWater} <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '400' }}>/ {waterGoal} мл</Text>
            </Text>
            <Pressable onPress={() => resetWater(currentDate)} hitSlop={8}>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>Сбросить</Text>
            </Pressable>
          </View>
          <ProgressBar progress={(todayWater / (waterGoal || 1)) * 100} color={t.cCarb} height={6} />
          <View style={[styles.row, { marginTop: 10, gap: 8 }]}>
            {WATER_QUICK.map((amount) => (
              <Button key={amount} title={`+${amount}`} small variant="secondary" onPress={() => addWater(currentDate, amount)} />
            ))}
            <Input
              style={{ flex: 1 }}
              keyboardType="number-pad"
              placeholder="мл"
              value={customWater}
              onChangeText={setCustomWater}
              onSubmitEditing={() => {
                const v = Math.round(parseFloat(customWater));
                if (v > 0) addWater(currentDate, v);
                setCustomWater('');
              }}
            />
          </View>
        </Card>
      )}

      {/* ── Добавление еды ── */}
      <MealComposer currentDate={currentDate} addFoodLog={addFoodLog} />

      {/* ── Съедено сегодня ── */}
      <Card>
        <View style={styles.rowBetween}>
          <SectionTitle style={{ marginBottom: 0 }}>Съедено</SectionTitle>
          <Button title="Копия вчера" small variant="secondary" onPress={() => copyPreviousDay(currentDate)} />
        </View>
        {currentDayLogs.length === 0 ? (
          <EmptyState text="Записей пока нет. Добавьте первый приём пищи." />
        ) : (
          currentDayLogs.map((log) => {
            const food = foodById.get(log.foodId);
            const isEditing = editingLogId === log.id;
            return (
              <View key={log.id} style={[styles.logRow, { borderColor: t.line }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{food?.name || 'Продукт удалён'}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 11 }}>
                    {log.grams} г · {log.totalCalories} ккал · Б{log.totalProtein} Ж{log.totalFats} У{log.totalCarbs}
                  </Text>
                </View>
                {isEditing ? (
                  <View style={[styles.row, { gap: 6 }]}>
                    <Input
                      style={{ width: 74 }}
                      keyboardType="numeric"
                      autoFocus
                      value={editGrams}
                      onChangeText={setEditGrams}
                      onSubmitEditing={() => submitLogEdit(log.id)}
                    />
                    <Pressable onPress={() => submitLogEdit(log.id)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="checkmark" size={20} color={t.accent} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={[styles.row, { gap: 2 }]}>
                    <Pressable
                      onPress={() => { setEditingLogId(log.id); setEditGrams(String(log.grams)); }}
                      hitSlop={8}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="pencil-outline" size={18} color={t.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => repeatLog(currentDate, log.id)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="reload-outline" size={18} color={t.accent} />
                    </Pressable>
                    <Pressable onPress={() => confirmDeleteLog(log)} hitSlop={8} style={{ padding: 6 }}>
                      <Ionicons name="trash-outline" size={18} color={t.danger} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </Card>

      <ExtraActivityModal
        visible={showActivityModal}
        currentDate={currentDate}
        editingActivity={editingActivity}
        onClose={() => { setShowActivityModal(false); setEditingActivity(null); }}
      />
    </ScreenContainer>
  );
}

// Ввод метрики тела: локальный драфт, коммит по blur (как select-on-focus в web).
function MetricInput({ value, onCommit }) {
  const [draft, setDraft] = useState(null);
  return (
    <Input
      keyboardType="numeric"
      value={draft !== null ? draft : String(value ?? '')}
      onChangeText={setDraft}
      onBlur={() => {
        if (draft !== null) onCommit(draft);
        setDraft(null);
      }}
      placeholder="—"
    />
  );
}

const styles = StyleSheet.create({
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  dateArrow: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontSize: 17,
    fontWeight: '800',
  },
  calsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  calsBig: {
    fontSize: 34,
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
