import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { IconCheck, IconSparkles } from '../../components/Icons.jsx';
import {
  AI_ESTIMATE_ERROR_MESSAGE,
  estimateFoodNutrition,
  MAX_FOOD_NAME_LENGTH,
} from '../../services/foodAi.js';
import { classifyFoodSearch } from '../../utils/foodMatch.js';
import { findEstimatedNutrition, normalizeFoodName } from '../../utils/food.js';
import { validateNutritionPer100g } from '../../utils/foodNutrition.js';
import {
  applyAiEstimate,
  applyProductSaved,
  applySearchResult,
  createOperationId,
  createRecognitionItem,
  FLOW_STEP,
  makeNutritionDraft,
  parseNutritionDraft,
} from '../../utils/foodRecognitionFlow.js';

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

export default function FoodAddProductModal({
  open,
  initialName = '',
  foods,
  onClose,
  onSaveFood,
  onOpenProduct,
  onAddToDiary,
}) {
  const [name, setName] = useState('');
  const [flow, setFlow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialName || '');
      setFlow(null);
      setBusy(false);
      setError('');
    }
  }, [open, initialName]);

  const resetAndClose = () => {
    setName('');
    setFlow(null);
    setError('');
    onClose();
  };

  const findExistingFood = (query) => {
    const result = classifyFoodSearch(foods, query);
    return result.type === 'exact' ? result.match : null;
  };

  const checkDatabase = (trimmed) => {
    const item = createRecognitionItem({
      name: trimmed,
      amount: null,
      unit: 'unknown',
      amount_g: null,
      confidence: 1,
    }, 0);
    const search = classifyFoodSearch(foods, trimmed);

    if (search.type === 'none') {
      return {
        search,
        item: {
          ...item,
          query: trimmed,
          flowStep: FLOW_STEP.NOT_IN_BASE,
          statusText: 'Продукта нет в базе. Выберите способ добавления КБЖУ.',
          error: '',
        },
      };
    }

    return { search, item: applySearchResult(item, search) };
  };

  const beginAiPath = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_FOOD_NAME_LENGTH) {
      setError(`Название не должно быть длиннее ${MAX_FOOD_NAME_LENGTH} символов.`);
      return;
    }

    setError('');
    setBusy(true);

    try {
      const { search, item } = checkDatabase(trimmed);
      setFlow(item);
      if (search.type === 'none') runAiEstimate(1, trimmed);
    } catch {
      setError('Не удалось проверить базу продуктов. Повторите попытку.');
    }

    setBusy(false);
  };

  const beginManualPath = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_FOOD_NAME_LENGTH) {
      setError(`Название не должно быть длиннее ${MAX_FOOD_NAME_LENGTH} символов.`);
      return;
    }

    setError('');
    setBusy(true);

    try {
      const { search, item } = checkDatabase(trimmed);
      if (search.type === 'exact') {
        setFlow(item);
      } else {
        startManualEntry(trimmed);
      }
    } catch {
      setError('Не удалось проверить базу продуктов. Повторите попытку.');
    }

    setBusy(false);
  };

  const runAiEstimate = async (retryLeft = 1, queryOverride) => {
    const query = String(queryOverride ?? flow?.query ?? name).trim();
    if (!query) return;

    setFlow((current) => ({
      ...(current || createRecognitionItem({ name: query, amount: null, unit: 'unknown', amount_g: null, confidence: 1 }, 0)),
      flowStep: FLOW_STEP.AI_ESTIMATING,
      statusText: 'Рассчитываем КБЖУ…',
      error: '',
    }));
    setBusy(true);
    setError('');

    try {
      const estimate = await estimateFoodNutrition(query, { findStaticEstimate: findEstimatedNutrition });
      setFlow((current) => applyAiEstimate(current, estimate));
    } catch (estimateError) {
      if (retryLeft > 0) {
        setBusy(false);
        return runAiEstimate(retryLeft - 1);
      }
      setFlow((current) => ({
        ...current,
        flowStep: FLOW_STEP.ERROR,
        error: estimateError.message || AI_ESTIMATE_ERROR_MESSAGE,
      }));
    }

    setBusy(false);
  };

  const saveToBase = async () => {
    if (!flow?.draftFood || flow.savingProduct) return;

    const operationId = flow.operationId || createOperationId();
    setFlow((current) => ({ ...current, savingProduct: true, operationId, error: '' }));

    const existing = findExistingFood(flow.draftFood.name);
    if (existing) {
      setFlow((current) => ({
        ...current,
        ...applyProductSaved(current, existing),
        savingProduct: false,
        flowStep: FLOW_STEP.EXACT_MATCH,
        food: existing,
        draftFood: null,
        statusText: 'Такой продукт уже есть в базе',
      }));
      return;
    }

    const foodToSave = {
      ...flow.draftFood,
      id: flow.draftFood.id || Date.now().toString(),
      normalizedName: normalizeFoodName(flow.draftFood.name),
      updatedAt: new Date().toISOString(),
      createdAt: flow.draftFood.createdAt || new Date().toISOString(),
    };

    try {
      await Promise.resolve(onSaveFood(foodToSave));
      setFlow((current) => ({
        ...applyProductSaved(current, foodToSave),
        operationId,
        flowStep: FLOW_STEP.SUCCESS,
        statusText: 'Продукт добавлен в базу',
        addedMessage: 'Продукт добавлен в базу',
      }));
    } catch {
      setFlow((current) => ({
        ...current,
        savingProduct: false,
        error: 'Не удалось добавить продукт в базу. Введённые данные сохранены на экране — попробуйте ещё раз.',
      }));
    }
  };

  const saveNutritionDraft = () => {
    const values = parseNutritionDraft(flow?.nutritionDraft);
    if (!values) {
      setFlow((current) => ({ ...current, nutritionError: 'Введите корректные КБЖУ на 100 г' }));
      return;
    }

    const draftName = String(flow?.nutritionDraft?.name ?? flow?.draftFood?.name ?? name).trim();
    if (!draftName) {
      setFlow((current) => ({ ...current, nutritionError: 'Введите название продукта' }));
      return;
    }

    const updatedDraft = {
      ...flow.draftFood,
      name: draftName,
      calories: values.calories,
      protein: values.protein,
      fats: values.fats,
      carbs: values.carbs,
      caloriesPer100g: values.calories,
      proteinPer100g: values.protein,
      fatPer100g: values.fats,
      carbsPer100g: values.carbs,
      source: flow.draftFood?.source || 'manual',
      isAiGenerated: flow.draftFood?.isAiGenerated ?? false,
      updatedAt: new Date().toISOString(),
    };

    const validation = validateNutritionPer100g(updatedDraft);
    if (!validation.valid) {
      setFlow((current) => ({ ...current, nutritionError: 'Проверьте значения КБЖУ на 100 г' }));
      return;
    }

    setFlow((current) => ({
      ...current,
      draftFood: updatedDraft,
      nutritionDraft: { ...makeNutritionDraft(updatedDraft), name: draftName },
      flowStep: FLOW_STEP.AI_RESULT,
      isEditingNutrition: false,
      nutritionError: '',
    }));
  };

  const startManualEntry = (queryName) => {
    const draftName = String(queryName ?? flow?.query ?? name).trim();
    setFlow({
      ...createRecognitionItem({ name: draftName, amount: null, unit: 'unknown', amount_g: null, confidence: 1 }, 0),
      flowStep: FLOW_STEP.EDITING,
      isEditingNutrition: true,
      draftFood: {
        id: `manual-${Date.now()}`,
        name: draftName,
        source: 'manual',
        isAiGenerated: false,
        confidence: 1,
      },
      nutritionDraft: { name: draftName, calories: '', protein: '', fats: '', carbs: '' },
      statusText: 'Введите КБЖУ вручную',
      error: '',
    });
  };

  if (!open) return null;

  const activeFood = flow?.food || flow?.draftFood || null;
  const showNameInput = !flow || flow.flowStep === FLOW_STEP.ERROR;
  const showExact = flow?.flowStep === FLOW_STEP.EXACT_MATCH && flow?.food;
  const showSimilar = flow?.flowStep === FLOW_STEP.SIMILAR_MATCH;
  const showNotInBase = flow?.flowStep === FLOW_STEP.NOT_IN_BASE;
  const showEstimating = flow?.flowStep === FLOW_STEP.AI_ESTIMATING;
  const showAiCard = [FLOW_STEP.AI_RESULT, FLOW_STEP.EDITING].includes(flow?.flowStep) && flow?.draftFood;
  const showSuccess = flow?.flowStep === FLOW_STEP.SUCCESS && flow?.food;
  const showError = flow?.flowStep === FLOW_STEP.ERROR;

  return (
    <AnimatePresence>
      <motion.div
        key="food-add"
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
          <h3 className="text-lg font-bold mb-1 text-center">Добавить продукт</h3>
          <p className="text-zinc-500 text-xs mb-4 text-center leading-relaxed">
            Сначала проверим базу. Затем можно рассчитать КБЖУ через ИИ или вписать значения вручную.
          </p>

          {showNameInput && (
            <div className="space-y-3">
              <input
                type="text"
                maxLength={MAX_FOOD_NAME_LENGTH}
                placeholder="Например: Яйцо жареное, Пицца Маргарита"
                className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 text-sm outline-none border border-zinc-700/30 focus:border-emerald-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
              {name.trim() && (
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={beginAiPath}
                    disabled={busy}
                    className="btn-active w-full bg-indigo-600 text-white rounded-xl p-3 font-bold transition-all disabled:opacity-35 flex items-center justify-center gap-2"
                  >
                    <IconSparkles className="w-5 h-5" />
                    {busy ? 'Проверяем базу…' : 'Рассчитать с помощью ИИ'}
                  </button>
                  <button
                    type="button"
                    onClick={beginManualPath}
                    disabled={busy}
                    className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-xl p-3 font-bold transition-all disabled:opacity-35"
                  >
                    Вписать КБЖУ вручную
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-xs mt-3 leading-relaxed" role="alert">{error}</p>}
          {flow?.error && <p className="text-red-400 text-xs mt-3 leading-relaxed" role="alert">{flow.error}</p>}
          {flow?.statusText && !showSuccess && (
            <p className="text-[10px] leading-relaxed text-zinc-400 mt-3">{flow.statusText}</p>
          )}
          {flow?.warning && <p className="text-[10px] text-amber-300 leading-relaxed mt-2">{flow.warning}</p>}
          {showEstimating && <p className="text-indigo-300 text-xs mt-3 text-center" role="status">Рассчитываем КБЖУ…</p>}

          {showExact && activeFood && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-bold text-zinc-100">Такой продукт уже есть в базе</p>
              <NutritionGrid food={activeFood} />
              <div className="grid grid-cols-1 gap-2">
                <button type="button" onClick={() => { onOpenProduct?.(activeFood); resetAndClose(); }} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Открыть продукт</button>
                <button type="button" onClick={resetAndClose} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
              </div>
            </div>
          )}

          {showSimilar && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold text-zinc-100">В базе найден похожий продукт</p>
              {flow.conflictingFood && (
                <div className="rounded-lg border border-zinc-700/30 p-2">
                  <NutritionGrid food={flow.conflictingFood} />
                </div>
              )}
              {(flow.suggestions || []).filter((s) => s.id !== flow.conflictingFood?.id).map((suggestion) => (
                <button key={suggestion.id} type="button" onClick={() => { onOpenProduct?.(suggestion); resetAndClose(); }} className="btn-active w-full text-left bg-zinc-900 rounded-lg p-2 border border-zinc-700/30 text-xs font-bold text-zinc-200">
                  Использовать существующий: {suggestion.name}
                </button>
              ))}
              <button type="button" onClick={() => runAiEstimate()} disabled={busy} className="btn-active w-full bg-indigo-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all disabled:opacity-50">
                <span className="inline-flex items-center justify-center gap-1"><IconSparkles className="w-4 h-4" /> Рассчитать с помощью ИИ</span>
              </button>
              <button type="button" onClick={() => startManualEntry(flow.query)} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Вписать КБЖУ вручную</button>
              <button type="button" onClick={resetAndClose} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
            </div>
          )}

          {showNotInBase && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold text-zinc-100">{flow.query}</p>
              <button type="button" onClick={() => runAiEstimate()} disabled={busy} className="btn-active w-full bg-indigo-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all disabled:opacity-50">
                <span className="inline-flex items-center justify-center gap-1"><IconSparkles className="w-4 h-4" /> Рассчитать с помощью ИИ</span>
              </button>
              <button type="button" onClick={() => startManualEntry(flow.query)} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Вписать КБЖУ вручную</button>
              <button type="button" onClick={resetAndClose} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
            </div>
          )}

          {showAiCard && activeFood && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold text-zinc-100">{activeFood.name}</p>
              {!flow.isEditingNutrition && <NutritionGrid food={activeFood} />}
              <p className="text-[10px] text-zinc-400 leading-relaxed">Проверьте значения. Продукт будет добавлен в базу только после подтверждения.</p>
              {flow.isEditingNutrition && (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Название"
                    className="w-full bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border border-zinc-700/30 focus:border-emerald-500"
                    value={flow.nutritionDraft?.name ?? ''}
                    onChange={(e) => setFlow((current) => ({
                      ...current,
                      nutritionDraft: { ...(current.nutritionDraft || {}), name: e.target.value },
                      nutritionError: '',
                    }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {['calories', 'protein', 'fats', 'carbs'].map((field) => (
                      <input
                        key={field}
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        placeholder={field === 'calories' ? 'Ккал' : field === 'protein' ? 'Белки' : field === 'fats' ? 'Жиры' : 'Углеводы'}
                        className="bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border border-zinc-700/30 focus:border-emerald-500"
                        value={flow.nutritionDraft?.[field] ?? ''}
                        onChange={(e) => setFlow((current) => ({
                          ...current,
                          nutritionDraft: { ...(current.nutritionDraft || makeNutritionDraft(activeFood)), [field]: e.target.value },
                          nutritionError: '',
                        }))}
                      />
                    ))}
                  </div>
                </div>
              )}
              {flow.nutritionError && <p className="text-[10px] text-amber-300" role="alert">{flow.nutritionError}</p>}
              <div className="grid grid-cols-1 gap-2">
                {flow.isEditingNutrition ? (
                  <button type="button" onClick={saveNutritionDraft} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Сохранить КБЖУ</button>
                ) : (
                  <button type="button" onClick={saveToBase} disabled={flow.savingProduct} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all disabled:opacity-50">
                    {flow.savingProduct ? 'Сохраняем…' : 'Добавить в базу'}
                  </button>
                )}
                {!flow.isEditingNutrition && (
                  <button type="button" onClick={() => setFlow((current) => ({ ...current, isEditingNutrition: true, flowStep: FLOW_STEP.EDITING, nutritionDraft: { name: activeFood.name, ...makeNutritionDraft(activeFood) } }))} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Изменить КБЖУ</button>
                )}
                <button type="button" onClick={resetAndClose} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
              </div>
            </div>
          )}

          {showError && (
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button type="button" onClick={() => runAiEstimate()} disabled={busy} className="btn-active w-full bg-indigo-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Повторить</button>
              <button type="button" onClick={startManualEntry} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Добавить вручную</button>
              <button type="button" onClick={resetAndClose} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
            </div>
          )}

          {showSuccess && flow.food && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-emerald-300 flex items-center gap-1">
                <IconCheck className="w-4 h-4" /> {flow.addedMessage || 'Продукт добавлен в базу'}
              </p>
              <NutritionGrid food={flow.food} />
              {onAddToDiary && (
                <button type="button" onClick={() => { onAddToDiary(flow.food); resetAndClose(); }} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Добавить в дневник</button>
              )}
              <button type="button" onClick={() => { onOpenProduct?.(flow.food); resetAndClose(); }} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Открыть продукт</button>
              <button type="button" onClick={resetAndClose} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Закрыть</button>
            </div>
          )}

          {!showSuccess && (
            <button type="button" onClick={resetAndClose} className="btn-active w-full mt-3 border border-zinc-800 text-zinc-500 rounded-xl p-3 font-bold transition-all">Закрыть</button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
