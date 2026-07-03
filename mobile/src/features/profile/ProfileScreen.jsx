import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle, Button, Input, Label } from '../../components/common/ui.jsx';
import { ACTIVITY_LEVELS } from '../../utils/kbju.js';
import { getUsualSteps } from '../../constants/app.js';
import { getLocalDateString } from '../../utils/date.js';

// Профиль: данные для расчёта КБЖУ, уровень активности, дефицит, режим авто/ручной.
export default function ProfileScreen() {
  const t = useTheme();
  const {
    profileData, saveProfileData, kbjuPreview, effectiveProfile, selectedActivityKey,
    goals, saveGoals, notify, deleteAccountNow, myFriendCode,
  } = useAppData();

  const change = (field, value) => saveProfileData({ ...profileData, [field]: value });

  const applyAutoKbju = () => {
    if (!kbjuPreview) { notify('Заполните пол, возраст, рост и вес — по ним считается КБЖУ.'); return; }
    const baseSteps = getUsualSteps(effectiveProfile.usualSteps);
    saveGoals({
      ...goals,
      calories: kbjuPreview.calories,
      protein: kbjuPreview.protein,
      fats: kbjuPreview.fats,
      carbs: kbjuPreview.carbs,
      maintenance: kbjuPreview.maintenance,
      baseSteps,
      deficit: Number(effectiveProfile.deficit) || 0,
    });
    saveProfileData({ ...profileData, activity: selectedActivityKey, weight: effectiveProfile.weight, lastKbjuAt: getLocalDateString(new Date()) });
    notify('Цели пересчитаны и применены.');
  };

  return (
    <ScreenContainer>
      <Card>
        <SectionTitle>Имя и код друга</SectionTitle>
        <Label>Отображаемое имя</Label>
        <Input
          value={String(profileData.displayName ?? '')}
          onChangeText={(v) => change('displayName', v)}
          placeholder="Как вас видят друзья"
          style={{ marginBottom: 10 }}
        />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>
          Ваш код друга: <Text style={{ color: t.accent, fontWeight: '800' }}>{myFriendCode}</Text>
        </Text>
      </Card>

      <Card>
        <SectionTitle>Данные для расчёта</SectionTitle>
        <Label>Пол</Label>
        <View style={[styles.row, { marginBottom: 10 }]}>
          {[{ key: 'male', label: 'Мужской' }, { key: 'female', label: 'Женский' }].map((opt) => {
            const active = profileData.sex === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => change('sex', opt.key)}
                style={[styles.sexChip, { backgroundColor: active ? t.accent : t.surfaceStrong, borderColor: active ? t.accent : t.line }]}
              >
                <Text style={{ color: active ? t.accentInk : t.text2, fontWeight: '700', fontSize: 13 }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.grid}>
          <NumField label="Возраст" value={profileData.age} onChange={(v) => change('age', v)} />
          <NumField label="Рост, см" value={profileData.height} onChange={(v) => change('height', v)} />
          <NumField label="Вес, кг" value={profileData.weight} onChange={(v) => change('weight', v)} />
          <NumField label="Шаги обычно" value={profileData.usualSteps} onChange={(v) => change('usualSteps', v === '' ? '' : getUsualSteps(v))} />
          <NumField label="Дефицит" value={profileData.deficit} onChange={(v) => change('deficit', v)} />
        </View>
      </Card>

      <Card>
        <SectionTitle>Уровень активности</SectionTitle>
        {ACTIVITY_LEVELS.map((level) => {
          const active = selectedActivityKey === level.key;
          return (
            <Pressable
              key={level.key}
              onPress={() => change('activity', level.key)}
              style={[styles.activityRow, { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accentSoft : 'transparent' }]}
            >
              <Text style={{ color: active ? t.accent : t.text, fontWeight: '700', fontSize: 14 }}>
                {level.label} <Text style={{ color: t.textMuted, fontWeight: '400', fontSize: 12 }}>+{level.activityCalories} ккал</Text>
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 2 }}>{level.hint}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <SectionTitle>Расчёт КБЖУ</SectionTitle>
        {kbjuPreview ? (
          <>
            <Text style={{ color: t.text2, fontSize: 13, marginBottom: 4 }}>
              BMR: {kbjuPreview.bmr} · Шаги: +{kbjuPreview.stepsCalories} · Активность: +{kbjuPreview.activityCalories}
            </Text>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>
              Норма: {kbjuPreview.maintenance} → Цель: {kbjuPreview.calories} ккал
              {'\n'}Б {kbjuPreview.protein} · Ж {kbjuPreview.fats} · У {kbjuPreview.carbs}
            </Text>
          </>
        ) : (
          <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: 10 }}>
            Заполните пол, возраст, рост и вес — по ним считается КБЖУ.
          </Text>
        )}
        <Button title="Рассчитать и применить цели" onPress={applyAutoKbju} style={{ marginBottom: 8 }} />
        <View style={styles.rowBetween}>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>Режим пересчёта</Text>
          <View style={styles.row}>
            {[{ key: 'manual', label: 'Ручной' }, { key: 'auto', label: 'Авто' }].map((opt) => {
              const active = profileData.mode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => change('mode', opt.key)}
                  style={[styles.modeChip, { backgroundColor: active ? t.accent : t.surfaceStrong, borderColor: active ? t.accent : t.line }]}
                >
                  <Text style={{ color: active ? t.accentInk : t.text2, fontSize: 12, fontWeight: '700' }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Text style={{ color: t.textFaint, fontSize: 11, marginTop: 6 }}>
          В авто-режиме цели пересчитываются сами при изменении веса в дневнике.
        </Text>
      </Card>

      <Card>
        <SectionTitle style={{ color: t.danger }}>Опасная зона</SectionTitle>
        <Button title="Удалить аккаунт и все данные" variant="danger" onPress={deleteAccountNow} />
      </Card>
    </ScreenContainer>
  );
}

function NumField({ label, value, onChange }) {
  return (
    <View style={styles.gridItem}>
      <Label>{label}</Label>
      <Input keyboardType="numeric" value={String(value ?? '')} onChangeText={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sexChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '30.5%',
  },
  activityRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  modeChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
