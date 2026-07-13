import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { IconCheck, IconSparkles } from '../../components/Icons.jsx';
import {
  AI_ESTIMATE_ERROR_MESSAGE,
  AI_UNAVAILABLE_MESSAGE,
  formatParsedFoodAmount,
  MAX_FOOD_TEXT_LENGTH,
  parseFoodText,
  estimateFoodNutrition,
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

function NutritionGrid({ food }) {
  return (
    <div className="bg-zinc-900/70 rounded-xl p-3 border border-zinc-700/30">
      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2">КБЖУ на 100 г</p>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div><p className="text-sm font-black text-emerald-400">{Math.round(food.calories || 0)}</p><p className="text-[9px] text-zinc-500">ккал</p></div>
        <div><p className="text-sm font-black text-indigo-400">{Number(food.protein || 0)}</p><p className="text-[9px] text-zinc-500">белки</p></div>
        <div><p className="text-sm font-black text-amber-400">{Number(food.fats || 0)}</p><p className="text-[9px] text-zinc-500">жиры</p></div>
        <div><p className="text-sm font-black text-blue-400">{Number(food.carbs || 0)}</p><p className="text-[9px] text-zinc-500">углев.</p></div>
      </div>
    </div>
  );
}

export default function FoodRecognitionModal({
  open,
  onClose,
  foods,
  onSaveFood,
  onAddToDiary,
  onManualEntry,
}) {
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

  const runRecognition = async () => {
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
    } catch (recognitionError) {
      setError(recognitionError.message || AI_UNAVAILABLE_MESSAGE);
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
      await Promise.resolve(onSaveFood(foodToSave));
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
    const food = item?.food;
    if (!food) return;

    const gramsValue = evaluateMath(String(item.grams || ''));
    const validation = validatePortionGrams(gramsValue);
    if (!validation.valid) {
      updateItem(index, { portionError: validation.error, portionWarning: '', showPortionPreview: false });
      return;
    }

    const portion = calculateFoodPortion(food, validation.grams);
    updateItem(index, {
      portionError: '',
      portionWarning: validation.warning || '',
      showPortionPreview: true,
      flowStep: FLOW_STEP.PORTION_PREVIEW,
      previewPortion: portion,
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
      const saved = await Promise.resolve(onAddToDiary(item.food, validation.grams));
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
        portionError: '',
      });
    } catch (diaryError) {
      updateItem(index, {
        savingDiary: false,
        error: 'Не удалось добавить порцию в дневник. Повторите попытку.',
      });
    }
  };

  const closeModal = () => {
    setText('');
    setItems(null);
    setError('');
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="food-recognition"
        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="bg-[#18181b] p-6 rounded-3xl border border-zinc-800 w-full max-w-sm max-h-[88vh] overflow-y-auto"
          initial={{ opacity: 0, scale: 0.9, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        >
          <h3 className="text-lg font-bold mb-1 text-center flex items-center justify-center gap-2">
            <IconSparkles className="w-5 h-5 text-indigo-400" /> Распознать продукты
          </h3>
          <p className="text-zinc-500 text-xs mb-4 text-center leading-relaxed">
            Введите продукт или блюдо. Сначала проверим базу, затем при необходимости рассчитаем КБЖУ на 100 г и спросим вес порции.
          </p>

          <textarea
            rows={5}
            maxLength={MAX_FOOD_TEXT_LENGTH}
            placeholder={'Например:\nПицца Маргарита\nили\nтворог 5% 250 г, банан 100 г'}
            className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 text-sm outline-none border border-zinc-700/30 focus:border-emerald-500 resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-zinc-500">
            <span>Продукт сохраняется только после подтверждения.</span>
            <span aria-live="polite">{text.length}/{MAX_FOOD_TEXT_LENGTH}</span>
          </div>

          <button
            type="button"
            onClick={runRecognition}
            disabled={busy || !text.trim() || text.length > MAX_FOOD_TEXT_LENGTH}
            className="btn-active w-full mt-3 bg-indigo-600 text-white rounded-xl p-3 font-bold transition-all disabled:opacity-35 flex items-center justify-center gap-2"
          >
            {busy ? 'Распознаём…' : <><IconSparkles className="w-5 h-5" /> Распознать</>}
          </button>

          {busy && <p className="text-indigo-300 text-xs mt-3 text-center" role="status" aria-live="polite">Распознаём продукты…</p>}
          {error && <p className="text-red-400 text-xs mt-3 leading-relaxed" role="alert">{error}</p>}

          {items && items.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Результаты</p>
              {items.map((item, index) => {
                const activeFood = getActiveFood(item);
                const showGrams = canShowGramsInput(item);
                const showAiCard = canShowAiPreview(item);
                const portion = item.previewPortion
                  || (showGrams && item.food && validatePortionGrams(evaluateMath(String(item.grams || ''))).valid
                    ? calculateFoodPortion(item.food, validatePortionGrams(evaluateMath(String(item.grams || ''))).grams)
                    : null);

                return (
                  <div key={`${item.query}-${index}`} className="rounded-xl p-3 border bg-[#27272a] border-zinc-700/30 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-zinc-100 truncate">{item.query}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">Распознано: {formatParsedFoodAmount(item)}</p>
                      </div>
                      <button type="button" onClick={() => removeItem(index)} className="text-zinc-500 text-xs shrink-0">×</button>
                    </div>

                    {item.statusText && (
                      <p className="text-[10px] leading-relaxed text-zinc-400">{item.statusText}</p>
                    )}
                    {item.warning && <p className="text-[10px] text-amber-300 leading-relaxed">{item.warning}</p>}
                    {item.error && <p className="text-[10px] text-red-400 leading-relaxed" role="alert">{item.error}</p>}

                    {item.flowStep === FLOW_STEP.EXACT_MATCH && item.food && (
                      <div className="space-y-2">
                        <NutritionGrid food={item.food} />
                        <div className="grid grid-cols-1 gap-2">
                          <button type="button" onClick={() => useExistingFood(index, item.food)} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Использовать</button>
                          <button type="button" onClick={() => estimateForItem(item)} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Рассчитать другой вариант</button>
                        </div>
                      </div>
                    )}

                    {item.flowStep === FLOW_STEP.SIMILAR_MATCH && (
                      <div className="space-y-2">
                        {item.conflictingFood && (
                          <div className="rounded-lg border border-zinc-700/30 p-2">
                            <p className="text-xs text-zinc-300">{item.conflictingFood.name}</p>
                            <p className="text-[10px] text-zinc-500 mt-1">На 100 г: {item.conflictingFood.calories} ккал</p>
                          </div>
                        )}
                        {(item.suggestions || []).map((suggestion) => (
                          <button key={suggestion.id} type="button" onClick={() => useExistingFood(index, suggestion)} className="btn-active w-full text-left bg-zinc-900 rounded-lg p-2 border border-zinc-700/30 text-xs font-bold text-zinc-200">
                            Использовать: {suggestion.name}
                          </button>
                        ))}
                        <button type="button" onClick={() => estimateForItem(item)} className="btn-active w-full bg-indigo-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Рассчитать именно мой продукт</button>
                        <button type="button" onClick={() => removeItem(index)} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
                      </div>
                    )}

                    {showAiCard && activeFood && (
                      <div className="space-y-2">
                        <NutritionGrid food={activeFood} />
                        <p className="text-[10px] text-zinc-400 leading-relaxed">Проверьте значения. После подтверждения продукт будет добавлен в базу.</p>
                        {item.isEditingNutrition && (
                          <div className="grid grid-cols-2 gap-2">
                            {['calories', 'protein', 'fats', 'carbs'].map((field) => (
                              <input
                                key={field}
                                type="number"
                                step="0.1"
                                inputMode="decimal"
                                placeholder={field === 'calories' ? 'Ккал' : field === 'protein' ? 'Белки' : field === 'fats' ? 'Жиры' : 'Углеводы'}
                                className="bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border border-zinc-700/30 focus:border-emerald-500"
                                value={item.nutritionDraft?.[field] ?? ''}
                                onChange={(e) => updateItem(index, {
                                  nutritionDraft: { ...(item.nutritionDraft || makeNutritionDraft(activeFood)), [field]: e.target.value },
                                  nutritionError: '',
                                })}
                              />
                            ))}
                          </div>
                        )}
                        {item.nutritionError && <p className="text-[10px] text-amber-300" role="alert">{item.nutritionError}</p>}
                        <div className="grid grid-cols-1 gap-2">
                          {item.isEditingNutrition ? (
                            <button type="button" onClick={() => saveNutritionDraft(index)} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Сохранить КБЖУ</button>
                          ) : (
                            <button type="button" onClick={() => saveDraftToBase(index)} disabled={item.savingProduct} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all disabled:opacity-50">
                              {item.savingProduct ? 'Сохраняем…' : 'Добавить в базу'}
                            </button>
                          )}
                          {!item.isEditingNutrition && (
                            <button type="button" onClick={() => updateItem(index, { isEditingNutrition: true, flowStep: FLOW_STEP.EDITING, nutritionDraft: makeNutritionDraft(activeFood) })} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Изменить КБЖУ</button>
                          )}
                          <button type="button" onClick={() => removeItem(index)} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
                        </div>
                      </div>
                    )}

                    {item.flowStep === FLOW_STEP.ERROR && (
                      <div className="grid grid-cols-1 gap-2">
                        <button type="button" onClick={() => estimateForItem(item)} className="btn-active w-full bg-indigo-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Повторить</button>
                        <button type="button" onClick={() => onManualEntry?.({ name: item.query, grams: item.grams })} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Добавить вручную</button>
                        <button type="button" onClick={() => removeItem(index)} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
                      </div>
                    )}

                    {showGrams && item.food && (
                      <div className="space-y-2">
                        <NutritionGrid food={item.food} />
                        <label className="block text-[10px] text-zinc-500 font-bold">
                          Сколько грамм вы съели?
                          <div className="mt-1 flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              inputMode="decimal"
                              placeholder="Например, 150"
                              className={`flex-1 min-w-0 bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border ${item.portionError ? 'border-amber-400' : 'border-zinc-700/30'} focus:border-emerald-500`}
                              value={item.grams}
                              onChange={(e) => updateItem(index, {
                                grams: e.target.value,
                                portionError: '',
                                portionWarning: '',
                                showPortionPreview: false,
                                previewPortion: null,
                              })}
                            />
                            <span className="shrink-0 text-xs font-bold text-zinc-500">г</span>
                          </div>
                        </label>
                        {item.portionError && <p className="text-[10px] text-amber-300" role="alert">{item.portionError}</p>}
                        {item.portionWarning && <p className="text-[10px] text-amber-300">{item.portionWarning}</p>}

                        {!item.showPortionPreview && !item.added && (
                          <button type="button" onClick={() => previewPortion(index)} className="btn-active w-full bg-indigo-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Рассчитать порцию</button>
                        )}

                        {item.showPortionPreview && portion && (
                          <div className="space-y-2">
                            <p className="text-[10px] text-zinc-400 leading-relaxed">
                              Добавить в дневник? {item.food.name}, {item.previewGrams} г:
                              {' '}<span className="font-bold text-zinc-200">{portion.calories} ккал</span>
                              {' '}· Б {portion.protein} · Ж {portion.fats} · У {portion.carbs}
                            </p>
                            <div className="grid grid-cols-1 gap-2">
                              <button type="button" onClick={() => addToDiary(index)} disabled={item.savingDiary} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all disabled:opacity-50">
                                {item.savingDiary ? 'Добавляем…' : 'Добавить в дневник'}
                              </button>
                              <button type="button" onClick={() => updateItem(index, { showPortionPreview: false, previewPortion: null, flowStep: FLOW_STEP.ENTERING_GRAMS })} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Изменить вес</button>
                              <button type="button" onClick={() => removeItem(index)} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
                            </div>
                          </div>
                        )}

                        {item.added && (
                          <p className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                            <IconCheck className="w-4 h-4" /> {item.addedMessage || 'Добавлено в дневник'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button type="button" onClick={closeModal} className="btn-active w-full mt-3 border border-zinc-800 text-zinc-500 rounded-xl p-3 font-bold transition-all">Закрыть</button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
