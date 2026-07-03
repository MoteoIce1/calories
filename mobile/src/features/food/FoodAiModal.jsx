import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import AppModal from '../../components/common/AppModal.jsx';
import { Button, Input, Label } from '../../components/common/ui.jsx';
import { parseFoodText, formatParsedFoodAmount, AI_UNAVAILABLE_MESSAGE, MAX_FOOD_TEXT_LENGTH } from '../../services/foodAi.js';
import { findBestFoodMatch, createEstimatedFood, getFoodNameWords, normalizeFoodName } from '../../utils/food.js';
import { evaluateMath } from '../../utils/math.js';

// ИИ-распознавание еды. Бизнес-логика повторяет web-версию:
// найден в базе → «Продукт найден в базе»; не найден → примерное КБЖУ на 100 г →
// предложение добавить в базу → вопрос «Сколько грамм вы съели?» → запись в дневник.
export default function FoodAiModal({ visible, currentDate, onClose }) {
  const t = useTheme();
  const { foods, saveAiGeneratedFood, addFoodLog, notify } = useAppData();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState(null);

  const foodNameKey = (name) => getFoodNameWords(name || '').sort().join(' ');
  const findExactFood = (name, sourceFoods = foods) => {
    const key = foodNameKey(name);
    return key ? sourceFoods.find((f) => foodNameKey(f.name) === key) || null : null;
  };
  const findFoodForAi = (name, sourceFoods = foods) => {
    const best = findBestFoodMatch(sourceFoods, name, { confidentScore: 900, suggestionsLimit: 3 });
    return {
      match: best.match || findExactFood(name, sourceFoods),
      suggestions: best.suggestions || [],
      score: best.score,
    };
  };

  const makeCard = (item, index, sourceFoods) => {
    const found = findFoodForAi(item.name, sourceFoods);
    const initialGrams = item.amount_g === null ? '' : String(item.amount_g);
    if (found.match) {
      return { ...item, name: found.match.name, grams: initialGrams, food: found.match, status: 'found', statusText: 'Продукт найден в базе', added: false };
    }
    if (found.suggestions.length && found.score >= 500) {
      return { ...item, grams: initialGrams, food: null, status: 'suggestions', statusText: 'Похоже, это один из продуктов', suggestions: found.suggestions, added: false };
    }
    const estimated = createEstimatedFood(item.name, `ai-${Date.now()}-${index}`);
    if (estimated) {
      return { ...item, name: estimated.name, grams: initialGrams, food: estimated, status: 'estimated', statusText: 'Продукта нет в базе. Я рассчитал примерное КБЖУ на 100 г.', createdFood: estimated, added: false };
    }
    return { ...item, grams: initialGrams, food: null, status: 'manual', statusText: 'Уточните продукт или блюдо, чтобы я рассчитал КБЖУ точнее.', added: false };
  };

  const run = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true); setError(''); setItems(null);
    try {
      const result = await parseFoodText(trimmed);
      const list = result.items.map((item, index) => makeCard(item, index, [...foods]));
      if (!list.length) setError('Уточните продукт или блюдо, например: курица с рисом, омлет, пицца Маргарита.');
      setItems(list);
    } catch (e) {
      setError(e.message || AI_UNAVAILABLE_MESSAGE);
    }
    setBusy(false);
  };

  const updateItem = (index, patch) => setItems((arr) => (arr || []).map((x, j) => (j === index ? { ...x, ...patch } : x)));
  const removeItem = (index) => setItems((arr) => (arr || []).filter((_, j) => j !== index));

  const selectSuggestion = (index, food) => {
    updateItem(index, { name: food.name, food, status: 'found', statusText: 'Продукт найден в базе', suggestions: [] });
  };

  const addToBase = (index) => {
    const item = items?.[index];
    if (!item?.createdFood) return;
    const existing = findFoodForAi(item.createdFood.name).match;
    if (existing) {
      updateItem(index, { name: existing.name, food: existing, createdFood: null, status: 'found', statusText: 'Продукт найден в базе. Сколько грамм вы съели?' });
      return;
    }
    const now = new Date().toISOString();
    const foodToSave = {
      ...item.createdFood,
      normalizedName: normalizeFoodName(item.createdFood.name),
      updatedAt: now,
      createdAt: item.createdFood.createdAt || now,
    };
    saveAiGeneratedFood(foodToSave);
    updateItem(index, { name: foodToSave.name, food: foodToSave, createdFood: foodToSave, status: 'created', statusText: 'Продукт добавлен в базу. Сколько грамм вы съели?' });
  };

  const addToDiary = (index) => {
    const item = items?.[index];
    if (!item?.food || !item.grams) return;
    const grams = evaluateMath(item.grams);
    if (!addFoodLog(currentDate, item.food, grams)) {
      notify('Укажите корректный вес порции.');
      return;
    }
    updateItem(index, { added: true });
    notify(`${item.food.name}: ${grams} г добавлено в дневник.`);
  };

  const close = () => {
    setText(''); setItems(null); setError('');
    onClose();
  };

  return (
    <AppModal visible={visible} title="ИИ-распознавание еды" onClose={close}>
      <Label>Опишите, что вы съели</Label>
      <Input
        placeholder="Например: курица с рисом 250 г и салат"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={MAX_FOOD_TEXT_LENGTH}
        style={{ minHeight: 64, textAlignVertical: 'top', marginBottom: 10 }}
      />
      <Button title={busy ? 'Распознаю…' : 'Распознать'} onPress={run} disabled={busy} />
      {busy && <ActivityIndicator style={{ marginTop: 12 }} color={t.accent} />}
      {error ? <Text style={{ color: t.danger, fontSize: 13, marginTop: 10 }}>{error}</Text> : null}

      {(items || []).map((item, index) => (
        <View key={`${item.name}-${index}`} style={[styles.itemCard, { backgroundColor: t.surfaceStrong, borderColor: t.line }]}>
          <View style={styles.itemHeader}>
            <Text style={{ color: t.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{item.name}</Text>
            <Pressable onPress={() => removeItem(index)} hitSlop={8}>
              <Text style={{ color: t.textMuted, fontSize: 18 }}>×</Text>
            </Pressable>
          </View>
          <Text style={{ color: t.textMuted, fontSize: 11, marginBottom: 6 }}>{formatParsedFoodAmount(item)}</Text>
          <Text style={{ color: item.status === 'found' || item.status === 'created' ? t.accent : t.text2, fontSize: 12, marginBottom: 8 }}>
            {item.statusText}
          </Text>

          {item.status === 'suggestions' && (item.suggestions || []).map((s) => (
            <Pressable key={s.id} onPress={() => selectSuggestion(index, s)} style={[styles.suggestion, { borderColor: t.line }]}>
              <Text style={{ color: t.accent, fontSize: 13 }}>{s.name} · {s.calories} ккал/100 г</Text>
            </Pressable>
          ))}

          {item.food && (
            <Text style={{ color: t.textMuted, fontSize: 11, marginBottom: 8 }}>
              На 100 г: {item.food.calories} ккал · Б{item.food.protein} Ж{item.food.fats} У{item.food.carbs}
            </Text>
          )}

          {item.status === 'estimated' && (
            <Button title="Добавить продукт в базу" small variant="secondary" onPress={() => addToBase(index)} style={{ marginBottom: 8 }} />
          )}

          {(item.status === 'found' || item.status === 'created') && !item.added && (
            <View style={styles.gramsRow}>
              <Input
                style={{ flex: 1 }}
                keyboardType="numeric"
                placeholder="Сколько грамм вы съели?"
                value={item.grams}
                onChangeText={(v) => updateItem(index, { grams: v })}
              />
              <Button title="В дневник" small onPress={() => addToDiary(index)} style={{ marginLeft: 8 }} />
            </View>
          )}
          {item.added && <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>Добавлено в дневник ✓</Text>}
        </View>
      ))}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  suggestion: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gramsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
