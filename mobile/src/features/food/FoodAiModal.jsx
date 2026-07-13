import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import AppModal from '../../components/common/AppModal.jsx';
import { Button, Input, Label } from '../../components/common/ui.jsx';
import {
  AI_ESTIMATE_ERROR_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  estimateFoodNutrition,
  formatParsedFoodAmount,
  MAX_FOOD_TEXT_LENGTH,
  parseFoodText,
} from '../../services/foodAi.js';
import { classifyFoodSearch } from '../../utils/foodMatch.js';
import { findEstimatedNutrition, normalizeFoodName } from '../../utils/food.js';
import { calculateFoodPortion, validatePortionGrams } from '../../utils/foodNutrition.js';
import {
  applyAiEstimate,
  applyExactFoodSelected,
  applyProductSaved,
  applySearchResult,
  canShowAiPreview,
  canShowGramsInput,
  createOperationId,
  createRecognitionItem,
  FLOW_STEP,
  getActiveFood,
  makeNutritionDraft,
  parseNutritionDraft,
} from '../../utils/foodRecognitionFlow.js';
import { evaluateMath } from '../../utils/math.js';

function NutritionBlock({ food, t }) {
  return (
    <View style={[styles.nutritionBox, { borderColor: t.line, backgroundColor: t.surface }]}>
      <Text style={{ color: t.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 6 }}>КБЖУ на 100 г</Text>
      <Text style={{ color: t.text2, fontSize: 12 }}>
        {Math.round(food.calories || 0)} ккал · Б {food.protein} · Ж {food.fats} · У {food.carbs}
      </Text>
    </View>
  );
}

export default function FoodAiModal({ visible, currentDate, onClose }) {
  const t = useTheme();
  const { foods, saveAiGeneratedFood, addFoodLog, notify } = useAppData();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState(null);

  const updateItem = (index, patch) => {
    setItems((arr) => (arr || []).map((item, idx) => (
      idx === index ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item
    )));
  };

  const removeItem = (index) => setItems((arr) => (arr || []).filter((_, idx) => idx !== index));

  const findExistingFood = (name) => {
    const result = classifyFoodSearch(foods, name);
    return result.type === 'exact' ? result.match : null;
  };

  const estimateForItem = async (item) => {
    updateItem(item.index, { flowStep: FLOW_STEP.AI_ESTIMATING, statusText: 'Рассчитываем КБЖУ…', error: '' });
    try {
      const estimate = await estimateFoodNutrition(item.query, { findStaticEstimate: findEstimatedNutrition });
      updateItem(item.index, (current) => applyAiEstimate(current, estimate));
    } catch (estimateError) {
      updateItem(item.index, {
        flowStep: FLOW_STEP.ERROR,
        error: estimateError.message || AI_ESTIMATE_ERROR_MESSAGE,
      });
    }
  };

  const run = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setBusy(true);
    setError('');
    setItems(null);

    try {
      const result = await parseFoodText(trimmed);
      const initialItems = result.items.map((item, index) => createRecognitionItem(item, index));
      setItems(initialItems);

      await Promise.all(initialItems.map(async (item) => {
        const search = classifyFoodSearch(foods, item.query);
        const afterSearch = applySearchResult(item, search);
        updateItem(item.index, afterSearch);
        if (afterSearch.flowStep === FLOW_STEP.AI_ESTIMATING) {
          await estimateForItem(afterSearch);
        }
      }));
    } catch (runError) {
      setError(runError.message || AI_UNAVAILABLE_MESSAGE);
    }

    setBusy(false);
  };

  const useExistingFood = (index, food) => {
    updateItem(index, (item) => ({
      ...applyExactFoodSelected(item, food),
      flowStep: FLOW_STEP.ENTERING_GRAMS,
    }));
  };

  const saveDraftToBase = async (index) => {
    const item = items?.[index];
    if (!item?.draftFood || item.savingProduct) return;

    const operationId = item.operationId || createOperationId();
    updateItem(index, { savingProduct: true, operationId, nutritionError: '', error: '' });

    const existing = findExistingFood(item.draftFood.name);
    if (existing) {
      updateItem(index, {
        ...applyProductSaved(item, existing),
        operationId,
        savingProduct: false,
        flowStep: FLOW_STEP.ENTERING_GRAMS,
        statusText: 'Продукт найден в базе',
      });
      return;
    }

    const foodToSave = {
      ...item.draftFood,
      normalizedName: normalizeFoodName(item.draftFood.name),
      updatedAt: new Date().toISOString(),
      createdAt: item.draftFood.createdAt || new Date().toISOString(),
    };

    try {
      await Promise.resolve(saveAiGeneratedFood(foodToSave));
      updateItem(index, {
        ...applyProductSaved(item, foodToSave),
        operationId,
        flowStep: FLOW_STEP.ENTERING_GRAMS,
      });
    } catch (saveError) {
      updateItem(index, {
        savingProduct: false,
        error: 'Не удалось добавить продукт в базу. Данные не потеряны — попробуйте снова.',
      });
    }
  };

  const saveNutritionDraft = (index) => {
    const item = items?.[index];
    const values = parseNutritionDraft(item?.nutritionDraft);
    if (!item || !values) {
      updateItem(index, { nutritionError: 'Введите корректные КБЖУ на 100 г' });
      return;
    }

    const updatedDraft = {
      ...item.draftFood,
      calories: values.calories,
      protein: values.protein,
      fats: values.fats,
      carbs: values.carbs,
      caloriesPer100g: values.calories,
      proteinPer100g: values.protein,
      fatPer100g: values.fats,
      carbsPer100g: values.carbs,
      updatedAt: new Date().toISOString(),
    };

    updateItem(index, {
      draftFood: updatedDraft,
      nutritionDraft: makeNutritionDraft(updatedDraft),
      flowStep: FLOW_STEP.AI_RESULT,
      isEditingNutrition: false,
      nutritionError: '',
    });
  };

  const previewPortion = (index) => {
    const item = items?.[index];
    if (!item?.food) return;

    const gramsValue = evaluateMath(String(item.grams || ''));
    const validation = validatePortionGrams(gramsValue);
    if (!validation.valid) {
      updateItem(index, { portionError: validation.error, portionWarning: '', showPortionPreview: false });
      return;
    }

    updateItem(index, {
      portionError: '',
      portionWarning: validation.warning || '',
      showPortionPreview: true,
      flowStep: FLOW_STEP.PORTION_PREVIEW,
      previewPortion: calculateFoodPortion(item.food, validation.grams),
      previewGrams: validation.grams,
    });
  };

  const addToDiary = async (index) => {
    const item = items?.[index];
    if (!item?.food || item.savingDiary || item.added) return;

    const gramsValue = item.previewGrams ?? evaluateMath(String(item.grams || ''));
    const validation = validatePortionGrams(gramsValue);
    if (!validation.valid) {
      updateItem(index, { portionError: validation.error, showPortionPreview: false });
      return;
    }

    const operationId = item.diaryOperationId || createOperationId();
    updateItem(index, { savingDiary: true, diaryOperationId: operationId, portionError: '' });

    try {
      const saved = addFoodLog(currentDate, item.food, validation.grams);
      if (!saved) {
        updateItem(index, {
          savingDiary: false,
          error: 'Не удалось добавить порцию в дневник. Повторите попытку.',
        });
        return;
      }

      updateItem(index, {
        added: true,
        savingDiary: false,
        flowStep: FLOW_STEP.SUCCESS,
        addedMessage: `${item.food.name}, ${validation.grams} г добавлено в дневник`,
      });
      notify(`${item.food.name}: ${validation.grams} г добавлено в дневник.`);
    } catch (diaryError) {
      updateItem(index, {
        savingDiary: false,
        error: 'Не удалось добавить порцию в дневник. Повторите попытку.',
      });
    }
  };

  const close = () => {
    setText('');
    setItems(null);
    setError('');
    onClose();
  };

  return (
    <AppModal visible={visible} title="ИИ-распознавание еды" onClose={close}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Label>Опишите, что вы съели</Label>
        <Input
          placeholder="Например: Пицца Маргарита или курица с рисом 250 г"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_FOOD_TEXT_LENGTH}
          style={{ minHeight: 64, textAlignVertical: 'top', marginBottom: 10 }}
        />
        <Button title={busy ? 'Распознаю…' : 'Распознать'} onPress={run} disabled={busy || !text.trim()} />
        {busy ? <ActivityIndicator style={{ marginTop: 12 }} color={t.accent} /> : null}
        {error ? <Text style={{ color: t.danger, fontSize: 13, marginTop: 10 }}>{error}</Text> : null}

        {(items || []).map((item, index) => {
          const activeFood = getActiveFood(item);
          const showGrams = canShowGramsInput(item);
          const showAiCard = canShowAiPreview(item);

          return (
            <View key={`${item.query}-${index}`} style={[styles.itemCard, { backgroundColor: t.surfaceStrong, borderColor: t.line }]}>
              <View style={styles.itemHeader}>
                <Text style={{ color: t.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{item.query}</Text>
                <Pressable onPress={() => removeItem(index)} hitSlop={8}>
                  <Text style={{ color: t.textMuted, fontSize: 18 }}>×</Text>
                </Pressable>
              </View>
              <Text style={{ color: t.textMuted, fontSize: 11, marginBottom: 6 }}>{formatParsedFoodAmount(item)}</Text>
              {item.statusText ? <Text style={{ color: t.text2, fontSize: 12, marginBottom: 8 }}>{item.statusText}</Text> : null}
              {item.warning ? <Text style={{ color: t.warning, fontSize: 11, marginBottom: 8 }}>{item.warning}</Text> : null}
              {item.error ? <Text style={{ color: t.danger, fontSize: 11, marginBottom: 8 }}>{item.error}</Text> : null}

              {item.flowStep === FLOW_STEP.EXACT_MATCH && item.food && (
                <View style={{ gap: 8 }}>
                  <NutritionBlock food={item.food} t={t} />
                  <Button title="Использовать" onPress={() => useExistingFood(index, item.food)} />
                  <Button title="Рассчитать другой вариант" variant="secondary" onPress={() => estimateForItem(item)} />
                </View>
              )}

              {item.flowStep === FLOW_STEP.SIMILAR_MATCH && (
                <View style={{ gap: 8 }}>
                  {item.conflictingFood ? (
                    <View style={[styles.nutritionBox, { borderColor: t.line }]}>
                      <Text style={{ color: t.text, fontSize: 12 }}>{item.conflictingFood.name}</Text>
                    </View>
                  ) : null}
                  {(item.suggestions || []).map((suggestion) => (
                    <Button
                      key={suggestion.id}
                      title={`Использовать: ${suggestion.name}`}
                      variant="secondary"
                      onPress={() => useExistingFood(index, suggestion)}
                    />
                  ))}
                  <Button title="Рассчитать именно мой продукт" onPress={() => estimateForItem(item)} />
                  <Button title="Отмена" variant="secondary" onPress={() => removeItem(index)} />
                </View>
              )}

              {showAiCard && activeFood && (
                <View style={{ gap: 8 }}>
                  <NutritionBlock food={activeFood} t={t} />
                  <Text style={{ color: t.textMuted, fontSize: 11 }}>
                    Проверьте значения. После подтверждения продукт будет добавлен в базу.
                  </Text>
                  {item.isEditingNutrition && (
                    <View style={{ gap: 8 }}>
                      {['calories', 'protein', 'fats', 'carbs'].map((field) => (
                        <Input
                          key={field}
                          keyboardType="numeric"
                          placeholder={field === 'calories' ? 'Ккал' : field === 'protein' ? 'Белки' : field === 'fats' ? 'Жиры' : 'Углеводы'}
                          value={item.nutritionDraft?.[field] ?? ''}
                          onChangeText={(value) => updateItem(index, {
                            nutritionDraft: { ...(item.nutritionDraft || makeNutritionDraft(activeFood)), [field]: value },
                            nutritionError: '',
                          })}
                        />
                      ))}
                    </View>
                  )}
                  {item.nutritionError ? <Text style={{ color: t.warning, fontSize: 11 }}>{item.nutritionError}</Text> : null}
                  {item.isEditingNutrition ? (
                    <Button title="Сохранить КБЖУ" onPress={() => saveNutritionDraft(index)} />
                  ) : (
                    <Button title={item.savingProduct ? 'Сохраняем…' : 'Добавить в базу'} disabled={item.savingProduct} onPress={() => saveDraftToBase(index)} />
                  )}
                  {!item.isEditingNutrition && (
                    <Button
                      title="Изменить КБЖУ"
                      variant="secondary"
                      onPress={() => updateItem(index, {
                        isEditingNutrition: true,
                        flowStep: FLOW_STEP.EDITING,
                        nutritionDraft: makeNutritionDraft(activeFood),
                      })}
                    />
                  )}
                  <Button title="Отмена" variant="secondary" onPress={() => removeItem(index)} />
                </View>
              )}

              {item.flowStep === FLOW_STEP.ERROR && (
                <View style={{ gap: 8 }}>
                  <Button title="Повторить" onPress={() => estimateForItem(item)} />
                  <Button title="Отмена" variant="secondary" onPress={() => removeItem(index)} />
                </View>
              )}

              {showGrams && item.food && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <NutritionBlock food={item.food} t={t} />
                  <Input
                    keyboardType="numeric"
                    placeholder="Сколько грамм вы съели?"
                    value={item.grams}
                    onChangeText={(value) => updateItem(index, {
                      grams: value,
                      portionError: '',
                      portionWarning: '',
                      showPortionPreview: false,
                      previewPortion: null,
                    })}
                  />
                  {item.portionError ? <Text style={{ color: t.warning, fontSize: 11 }}>{item.portionError}</Text> : null}
                  {item.portionWarning ? <Text style={{ color: t.warning, fontSize: 11 }}>{item.portionWarning}</Text> : null}
                  {!item.showPortionPreview && !item.added && (
                    <Button title="Рассчитать порцию" onPress={() => previewPortion(index)} />
                  )}
                  {item.showPortionPreview && item.previewPortion && (
                    <View style={{ gap: 8 }}>
                      <Text style={{ color: t.text2, fontSize: 12 }}>
                        Добавить в дневник? {item.food.name}, {item.previewGrams} г: {item.previewPortion.calories} ккал · Б {item.previewPortion.protein} · Ж {item.previewPortion.fats} · У {item.previewPortion.carbs}
                      </Text>
                      <Button title={item.savingDiary ? 'Добавляем…' : 'Добавить в дневник'} disabled={item.savingDiary} onPress={() => addToDiary(index)} />
                      <Button title="Изменить вес" variant="secondary" onPress={() => updateItem(index, { showPortionPreview: false, previewPortion: null, flowStep: FLOW_STEP.ENTERING_GRAMS })} />
                    </View>
                  )}
                  {item.added ? <Text style={{ color: t.accent, fontSize: 12, fontWeight: '700' }}>{item.addedMessage || 'Добавлено в дневник ✓'}</Text> : null}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
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
  nutritionBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
  },
});
