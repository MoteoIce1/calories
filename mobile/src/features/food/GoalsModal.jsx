import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import AppModal from '../../components/common/AppModal.jsx';
import { Button, Input, Label } from '../../components/common/ui.jsx';
import { getUsualSteps } from '../../constants/app.js';

const goalNum = (v) => (v === '' || v === null || v === undefined || Number.isNaN(parseFloat(v)) ? null : parseFloat(v));

// Настройка целей. Связка «норма − дефицит = цель калорий» — как в web-версии.
export default function GoalsModal({ visible, onClose }) {
  const t = useTheme();
  const { goals, saveGoals, confirmDialog } = useAppData();
  const [draft, setDraft] = useState(goals);

  useEffect(() => {
    if (visible) setDraft({ ...goals });
  }, [visible, goals]);

  const setField = (field) => (val) => setDraft((d) => ({ ...d, [field]: val }));

  const editedVal = (val, parsed) => (val === '' ? '' : (parsed === null ? val : parsed));
  const handleCalories = (val) => {
    const m = goalNum(draft.maintenance) || 0;
    const c = goalNum(val);
    setDraft((d) => ({ ...d, calories: editedVal(val, c), ...(c === null ? {} : { deficit: Math.round(m - c) }) }));
  };
  const handleDeficit = (val) => {
    const m = goalNum(draft.maintenance) || 0;
    const dv = goalNum(val);
    setDraft((d) => ({ ...d, deficit: editedVal(val, dv), ...(dv === null ? {} : { calories: Math.max(0, Math.round(m - dv)) }) }));
  };
  const handleMaintenance = (val) => {
    const m = goalNum(val);
    const dv = goalNum(draft.deficit) || 0;
    setDraft((d) => ({ ...d, maintenance: editedVal(val, m), ...(m === null ? {} : { calories: Math.max(0, Math.round(m - dv)) }) }));
  };

  const apply = async (mode) => {
    if (!(await confirmDialog('Вы уверены, что хотите применить новые настройки?'))) return;
    const next = { ...draft, baseSteps: getUsualSteps(draft.baseSteps) };
    // 'all' — новые цели действуют на все дни; 'today' — прошлые дни сохраняют старые цели.
    saveGoals(next, { resetDailyGoals: mode === 'all' });
    onClose();
  };

  return (
    <AppModal visible={visible} title="Цели и лимиты" onClose={onClose}>
      <View style={styles.grid}>
        <Field label="Норма (расход)" value={draft.maintenance} onChange={handleMaintenance} />
        <Field label="Дефицит" value={draft.deficit} onChange={handleDeficit} />
        <Field label="Цель калорий" value={draft.calories} onChange={handleCalories} />
        <Field label="Белок, г" value={draft.protein} onChange={setField('protein')} />
        <Field label="Жиры, г" value={draft.fats} onChange={setField('fats')} />
        <Field label="Углеводы, г" value={draft.carbs} onChange={setField('carbs')} />
        <Field label="База шагов" value={draft.baseSteps} onChange={setField('baseSteps')} />
        <Field label="Вода, мл" value={draft.waterGoal} onChange={setField('waterGoal')} />
        <Field label="Цель % жира" value={draft.targetFat} onChange={setField('targetFat')} />
      </View>
      <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 4, marginBottom: 12 }}>
        Цель калорий = норма − дефицит. Изменение одного поля пересчитывает связанные.
      </Text>
      <Button title="Применить с сегодняшнего дня" onPress={() => apply('today')} style={{ marginBottom: 8 }} />
      <Button title="Применить ко всем дням" variant="secondary" onPress={() => apply('all')} />
    </AppModal>
  );
}

function Field({ label, value, onChange }) {
  return (
    <View style={styles.gridItem}>
      <Label>{label}</Label>
      <Input keyboardType="numeric" value={String(value ?? '')} onChangeText={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '30.5%',
  },
});
