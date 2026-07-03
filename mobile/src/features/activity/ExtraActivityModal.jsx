import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import AppModal from '../../components/common/AppModal.jsx';
import { Button, Input, Label } from '../../components/common/ui.jsx';
import { EXTRA_ACTIVITY_TYPES, getExtraActivityType, validateExtraActivityCalories } from '../../utils/activity.js';

// Модалка дополнительной активности: тип + калории. Логика валидации — из web.
export default function ExtraActivityModal({ visible, currentDate, editingActivity, onClose }) {
  const t = useTheme();
  const { saveExtraActivity } = useAppData();
  const [draft, setDraft] = useState({ type: 'football', calories: '400' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    if (editingActivity) {
      setDraft({ type: editingActivity.type, calories: String(editingActivity.calories) });
    } else {
      setDraft({ type: 'football', calories: '400' });
    }
    setError('');
  }, [visible, editingActivity]);

  const selectType = (typeKey) => {
    const type = getExtraActivityType(typeKey);
    setDraft({ type: type.key, calories: type.defaultCalories === '' ? '' : String(type.defaultCalories) });
    setError('');
  };

  const save = () => {
    const err = saveExtraActivity(currentDate, draft, editingActivity?.id || null);
    if (err) { setError(err); return; }
    onClose();
  };

  const validation = validateExtraActivityCalories(draft.calories);
  const selected = getExtraActivityType(draft.type);

  return (
    <AppModal visible={visible} title={editingActivity ? 'Изменить активность' : 'Дополнительная активность'} onClose={onClose}>
      <Label>Тип активности</Label>
      <View style={styles.typesWrap}>
        {EXTRA_ACTIVITY_TYPES.map((type) => {
          const active = type.key === draft.type;
          return (
            <Pressable
              key={type.key}
              onPress={() => selectType(type.key)}
              style={[styles.typeChip, { backgroundColor: active ? t.accent : t.surfaceStrong, borderColor: active ? t.accent : t.line }]}
            >
              <Text style={{ color: active ? t.accentInk : t.text2, fontSize: 12, fontWeight: '600' }}>{type.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: t.textMuted, fontSize: 11, marginBottom: 12 }}>{selected.hint}</Text>
      <Label>Потрачено калорий</Label>
      <Input
        keyboardType="number-pad"
        value={draft.calories}
        onChangeText={(v) => { setDraft((d) => ({ ...d, calories: v })); setError(''); }}
        placeholder="Например: 400"
        style={{ marginBottom: 8 }}
      />
      {error ? <Text style={{ color: t.danger, fontSize: 12, marginBottom: 8 }}>{error}</Text> : null}
      {!error && validation.warning ? <Text style={{ color: t.cFatText, fontSize: 12, marginBottom: 8 }}>{validation.warning}</Text> : null}
      <Button title={editingActivity ? 'Сохранить' : 'Добавить'} onPress={save} style={{ marginTop: 6 }} />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  typesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
});
