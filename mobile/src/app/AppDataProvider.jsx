import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs,
  writeBatch,
  query,
  where,
  limit,
  doc,
  arrayUnion,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import {
  auth,
  db,
  functions,
  profileRef,
  dayRef,
  daysCol,
  bodyCol,
  bodyDocRef,
  OWNER_EMAIL,
  sharedFoodsRef,
  publicProfilesCol,
  publicProfileRef,
  connectionsCol,
  connectionRef,
  challengesCol,
  challengeRef,
} from '../services/firebase.js';
import { getItem, setItem, removeItem } from '../services/storage.js';
import { STORAGE_KEYS } from '../constants/storageKeys.js';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, DEFAULT_USUAL_STEPS, getUsualSteps, logDev } from '../constants/app.js';
import { BODY_MEASURE_FIELDS, EMPTY_BODY_MEASURES } from '../constants/body.js';
import { getLocalDateString } from '../utils/date.js';
import { calculateFoodPortion, normalizeFoodName } from '../utils/food.js';
import { computeKbju, normalizeActivityKey, calculateStepCalorieAdjustment } from '../utils/kbju.js';
import { normalizeExtraActivities, sumExtraActivityCalories, getExtraActivityType, validateExtraActivityCalories } from '../utils/activity.js';
import { normalizeWeightHistory } from '../utils/progress.js';
import {
  challengeType,
  challengeHistKey,
  computeChallengeStanding,
  shouldFinalizeChallenge,
  computeChallengeSafetyWarning,
} from '../utils/challenges.js';

const AppDataContext = createContext(null);

export const DEFAULT_GOALS = {
  calories: 1800,
  protein: 150,
  fats: 60,
  carbs: 150,
  baseSteps: DEFAULT_USUAL_STEPS,
  maintenance: 2300,
  targetFat: 12,
  waterGoal: 2500,
  deficit: 500,
};

export function AppDataProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [dailyGoals, setDailyGoals] = useState({});
  const [profileData, setProfileData] = useState(DEFAULT_PROFILE);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [sharedFoods, setSharedFoods] = useState([]);
  const [personalFoods, setPersonalFoods] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);

  const [dailyLogs, setDailyLogs] = useState({});
  const [dailySteps, setDailySteps] = useState({});
  const [dailyMetrics, setDailyMetrics] = useState({});
  const [dailyWorkouts, setDailyWorkouts] = useState({});
  const [dailyWater, setDailyWater] = useState({});
  const [dailyExtraActivities, setDailyExtraActivities] = useState({});
  const [bodyEntries, setBodyEntries] = useState([]);

  const [connections, setConnections] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [friendProfiles, setFriendProfiles] = useState({});

  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const isOwner = userEmail === OWNER_EMAIL;

  // ── Уведомления и подтверждения (замена alert/confirm) ──
  const notify = (message, type) => {
    if (!message) return;
    const kind = type || (/ошиб|не удал|не найд|нельзя|пуст|некоррект|должен|должна|заполн/i.test(String(message)) ? 'error' : 'success');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message: String(message), kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  };
  const confirmDialog = (opts) => {
    const o = typeof opts === 'string' ? { message: opts } : (opts || {});
    return new Promise((resolve) => setConfirmState({
      message: o.message,
      confirmLabel: o.confirmLabel || 'Да',
      cancelLabel: o.cancelLabel || 'Отмена',
      danger: !!o.danger,
      resolve,
    }));
  };
  const resolveConfirm = (result) => {
    if (confirmState) confirmState.resolve(result);
    setConfirmState(null);
  };

  // ── Авторизация ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user ? user.uid : null);
      setUserEmail(user ? (user.email || '') : '');
      setAuthReady(true);
      if (!user) setIsLoading(false);
    });
    return unsub;
  }, []);

  const doSignIn = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
  const doRegister = (email, password) => createUserWithEmailAndPassword(auth, email.trim(), password);
  const doPasswordReset = (email) => sendPasswordResetEmail(auth, email.trim());
  const doSignOut = () => fbSignOut(auth).catch(() => {});

  const deleteAccountNow = async () => {
    if (!(await confirmDialog({ message: 'Удалить аккаунт? Все данные (дневник, замеры, фото, друзья, споры) удалятся безвозвратно.', confirmLabel: 'Удалить', danger: true }))) return;
    if (!(await confirmDialog({ message: 'Точно удалить? Это необратимо.', confirmLabel: 'Удалить навсегда', danger: true }))) return;
    try {
      await httpsCallable(functions, 'deleteAccount')({});
      await doSignOut();
      notify('Аккаунт удалён.');
    } catch (e) {
      notify('Не удалось удалить аккаунт: ' + (e.message || e));
    }
  };

  // ── Профиль: цели, настройки, личные продукты ──
  useEffect(() => {
    if (!uid) return undefined;
    setIsLoading(true);
    const unsubscribe = onSnapshot(profileRef(uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.goals) {
          const loaded = { ...DEFAULT_GOALS, ...data.goals };
          if (data.goals.deficit === undefined) loaded.deficit = Math.round((Number(loaded.maintenance) || 0) - (Number(loaded.calories) || 0));
          setGoals(loaded);
        }
        setDailyGoals(data.dailyGoals || {});
        if (data.profileData) setProfileData({ ...DEFAULT_PROFILE, ...data.profileData });
        if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings, blocks: { ...DEFAULT_SETTINGS.blocks, ...(data.settings.blocks || {}) } });
        setPersonalFoods(Array.isArray(data.foods) ? data.foods : []);
        if (Array.isArray(data.favoriteIds)) setFavoriteIds(data.favoriteIds);
        else setFavoriteIds((data.foods || []).filter((f) => f.isFavorite).map((f) => f.id));
      } else {
        setPersonalFoods([]);
      }
      setIsLoading(false);
    }, (error) => { logDev('Firebase error', error); setIsLoading(false); });
    return unsubscribe;
  }, [uid]);

  // ── Дни ──
  useEffect(() => {
    if (!uid) return undefined;
    const unsubscribe = onSnapshot(daysCol(uid), (snap) => {
      const logs = {}, steps = {}, metrics = {}, workouts = {}, water = {}, extraActivities = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.logs && data.logs.length) logs[d.id] = data.logs;
        if (data.steps !== undefined && data.steps !== '' && data.steps !== null) steps[d.id] = data.steps;
        if (data.metrics && Object.keys(data.metrics).length) metrics[d.id] = data.metrics;
        if (data.workout) workouts[d.id] = true;
        if (data.water !== undefined && data.water !== '' && data.water !== null) water[d.id] = data.water;
        if (Array.isArray(data.extraActivities) && data.extraActivities.length) extraActivities[d.id] = normalizeExtraActivities(data.extraActivities);
      });
      setDailyLogs(logs); setDailySteps(steps); setDailyMetrics(metrics);
      setDailyWorkouts(workouts); setDailyWater(water); setDailyExtraActivities(extraActivities);
    }, (e) => logDev('days listener error', e));
    return unsubscribe;
  }, [uid]);

  // ── Замеры тела ──
  useEffect(() => {
    if (!uid) return undefined;
    const unsubscribe = onSnapshot(bodyCol(uid), (snap) => {
      const entries = [];
      snap.forEach((d) => entries.push({ id: d.id, ...d.data() }));
      entries.sort((a, b) => a.date.localeCompare(b.date));
      setBodyEntries(entries);
    }, (e) => logDev('body listener error', e));
    return unsubscribe;
  }, [uid]);

  // ── Общая база продуктов ──
  useEffect(() => {
    if (!uid) return undefined;
    const unsub = onSnapshot(sharedFoodsRef, (snap) => {
      setSharedFoods(snap.exists() && Array.isArray(snap.data().list) ? snap.data().list : []);
    }, (e) => logDev('shared foods error', e));
    return unsub;
  }, [uid]);

  // Итоговый список: общая база + личные поверх; избранное — из favoriteIds.
  const foods = useMemo(() => {
    const personalIds = new Set(personalFoods.map((f) => f.id));
    const favSet = new Set(favoriteIds);
    const baseList = sharedFoods.filter((f) => !personalIds.has(f.id)).map((f) => ({ ...f, _shared: true, isFavorite: favSet.has(f.id) }));
    const personalList = personalFoods.map((f) => ({ ...f, _shared: false, isFavorite: favSet.has(f.id) }));
    return [...baseList, ...personalList];
  }, [sharedFoods, personalFoods, favoriteIds]);

  // ── Запись данных ──
  const writeDay = (date, partial) => {
    if (uid) setDoc(dayRef(uid, date), partial, { merge: true }).catch((e) => logDev('writeDay error', e));
  };
  const saveProfilePatch = (patch) => {
    if (uid) setDoc(profileRef(uid), patch, { merge: true }).catch((e) => logDev('profile write error', e));
  };

  const getEffectiveGoals = (date) => dailyGoals[date] || goals;

  const updateSteps = (date, val) => {
    const num = parseInt(val, 10);
    if (Number.isNaN(num)) return;
    const value = Math.max(0, num);
    setDailySteps((prev) => ({ ...prev, [date]: value }));
    writeDay(date, { steps: value });
  };

  const updateMetrics = (date, field, val) => {
    const num = parseFloat(val);
    const updatedDay = { ...(dailyMetrics[date] || {}), [field]: Number.isNaN(num) ? '' : num };
    setDailyMetrics((prev) => ({ ...prev, [date]: updatedDay }));
    writeDay(date, { metrics: updatedDay });
  };

  const addFoodLog = (date, food, grams) => {
    if (!food || !Number.isFinite(grams) || grams <= 0) return false;
    const portion = calculateFoodPortion(food, grams);
    if (!portion) return false;
    const newLog = {
      id: Date.now().toString(),
      foodId: food.id,
      grams,
      totalCalories: portion.calories,
      totalProtein: portion.protein,
      totalFats: portion.fats,
      totalCarbs: portion.carbs,
    };
    const nextLogs = [...(dailyLogs[date] || []), newLog];
    setDailyLogs((prev) => ({ ...prev, [date]: nextLogs }));
    writeDay(date, { logs: nextLogs });
    return true;
  };

  const updateLogWeight = (date, logId, finalGrams) => {
    const dayLogs = (dailyLogs[date] || []).map((log) => {
      if (log.id !== logId) return log;
      const food = foods.find((f) => f.id === log.foodId);
      return {
        ...log,
        grams: finalGrams,
        totalCalories: Math.round((finalGrams / 100) * (food?.calories || 0)),
        totalProtein: Math.round((finalGrams / 100) * (food?.protein || 0)),
        totalFats: Math.round((finalGrams / 100) * (food?.fats || 0)),
        totalCarbs: Math.round((finalGrams / 100) * (food?.carbs || 0)),
      };
    });
    setDailyLogs((prev) => ({ ...prev, [date]: dayLogs }));
    writeDay(date, { logs: dayLogs });
  };

  const deleteLog = (date, id) => {
    const nextLogs = (dailyLogs[date] || []).filter((l) => l.id !== id);
    setDailyLogs((prev) => ({ ...prev, [date]: nextLogs }));
    writeDay(date, { logs: nextLogs });
  };

  // Повтор записи: тот же продукт и вес уходят в конец списка за день.
  const repeatLog = (date, id) => {
    const dayLogs = dailyLogs[date] || [];
    const source = dayLogs.find((l) => l.id === id);
    if (!source) return;
    // id — это и метка времени записи, поэтому при быстрых нажатиях сдвигаем его.
    const usedIds = new Set(dayLogs.map((l) => l.id));
    let nextId = Date.now();
    while (usedIds.has(nextId.toString())) nextId += 1;
    const nextLogs = [...dayLogs, { ...source, id: nextId.toString() }];
    setDailyLogs((prev) => ({ ...prev, [date]: nextLogs }));
    writeDay(date, { logs: nextLogs });
  };

  const copyPreviousDay = async (date) => {
    const d = new Date(date); d.setDate(d.getDate() - 1);
    const prev = getLocalDateString(d);
    const prevLogs = dailyLogs[prev] || [];
    if (prevLogs.length === 0) { notify('За предыдущий день записей нет.'); return; }
    if (!(await confirmDialog(`Скопировать ${prevLogs.length} записей из дня ${prev}?`))) return;
    const copied = prevLogs.map((l, idx) => ({ ...l, id: (Date.now() + idx).toString() }));
    const nextLogs = [...(dailyLogs[date] || []), ...copied];
    setDailyLogs((prevState) => ({ ...prevState, [date]: nextLogs }));
    writeDay(date, { logs: nextLogs });
  };

  // ── База продуктов ──
  const saveSharedFoods = (list) => {
    setSharedFoods(list);
    setDoc(sharedFoodsRef, { list }, { merge: true }).catch((err) => notify('Не удалось сохранить общую базу: ' + err.message));
  };
  const savePersonalFoods = (list) => { setPersonalFoods(list); saveProfilePatch({ foods: list }); };
  const saveFavoriteIds = (ids) => { setFavoriteIds(ids); saveProfilePatch({ favoriteIds: ids }); };

  const addFood = (newFood) => {
    const now = new Date().toISOString();
    const foodItem = {
      id: Date.now().toString(),
      name: newFood.name,
      normalizedName: normalizeFoodName(newFood.name),
      aliases: [],
      calories: parseFloat(newFood.cals || 0),
      protein: parseFloat(newFood.pro || 0),
      fats: parseFloat(newFood.fat || 0),
      carbs: parseFloat(newFood.carb || 0),
      caloriesPer100g: parseFloat(newFood.cals || 0),
      proteinPer100g: parseFloat(newFood.pro || 0),
      fatPer100g: parseFloat(newFood.fat || 0),
      carbsPer100g: parseFloat(newFood.carb || 0),
      source: 'manual',
      isAiGenerated: false,
      confidence: 1,
      createdAt: now,
      updatedAt: now,
    };
    if (isOwner) saveSharedFoods([foodItem, ...sharedFoods]);
    else savePersonalFoods([foodItem, ...personalFoods]);
  };

  const saveAiGeneratedFood = (food) => {
    if (!food) return;
    if (isOwner) saveSharedFoods([food, ...sharedFoods]);
    else savePersonalFoods([food, ...personalFoods]);
  };

  const updateFoodBase = (id, editValue) => {
    const target = foods.find((f) => f.id === id);
    if (!target) return;
    const patch = {
      name: editValue.name,
      calories: parseFloat(editValue.calories || 0),
      protein: parseFloat(editValue.protein || 0),
      fats: parseFloat(editValue.fats || 0),
      carbs: parseFloat(editValue.carbs || 0),
    };
    if (target._shared) {
      if (isOwner) saveSharedFoods(sharedFoods.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    } else {
      savePersonalFoods(personalFoods.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    }
    // Пересчитываем записи дневника, где встречается продукт (как в web-версии).
    const updatedLogs = { ...dailyLogs };
    const affected = [];
    Object.keys(updatedLogs).forEach((date) => {
      let changed = false;
      updatedLogs[date] = updatedLogs[date].map((log) => {
        if (log.foodId !== id) return log;
        changed = true;
        const grams = log.grams;
        return {
          ...log,
          totalCalories: Math.round((grams / 100) * (patch.calories || 0)),
          totalProtein: Math.round((grams / 100) * (patch.protein || 0)),
          totalFats: Math.round((grams / 100) * (patch.fats || 0)),
          totalCarbs: Math.round((grams / 100) * (patch.carbs || 0)),
        };
      });
      if (changed) affected.push(date);
    });
    setDailyLogs(updatedLogs);
    if (uid && affected.length) {
      for (let i = 0; i < affected.length; i += 400) {
        const batch = writeBatch(db);
        affected.slice(i, i + 400).forEach((date) => batch.set(dayRef(uid, date), { logs: updatedLogs[date] }, { merge: true }));
        batch.commit().catch((e) => logDev('food logs batch error', e));
      }
    }
  };

  const deleteFood = (id) => {
    const target = foods.find((f) => f.id === id);
    if (!target) return;
    if (target._shared) { if (isOwner) saveSharedFoods(sharedFoods.filter((x) => x.id !== id)); }
    else savePersonalFoods(personalFoods.filter((x) => x.id !== id));
    if (favoriteIds.includes(id)) saveFavoriteIds(favoriteIds.filter((x) => x !== id));
  };

  const toggleFavorite = (id) => {
    saveFavoriteIds(favoriteIds.includes(id) ? favoriteIds.filter((x) => x !== id) : [...favoriteIds, id]);
  };

  const moveFavorite = (id, direction) => {
    const index = favoriteIds.indexOf(id);
    const nextIndex = index + direction;
    if (index === -1 || nextIndex < 0 || nextIndex >= favoriteIds.length) return;
    const ids = [...favoriteIds];
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    saveFavoriteIds(ids);
  };

  // ── Тренировка, вода, доп. активность ──
  const toggleWorkout = (date) => {
    const next = !dailyWorkouts[date];
    setDailyWorkouts((prev) => ({ ...prev, [date]: next }));
    writeDay(date, { workout: next });
  };

  const addWater = (date, amount) => {
    const next = Math.max(0, (Number(dailyWater[date]) || 0) + amount);
    setDailyWater((prev) => ({ ...prev, [date]: next }));
    writeDay(date, { water: next });
  };
  const resetWater = (date) => {
    setDailyWater((prev) => ({ ...prev, [date]: 0 }));
    writeDay(date, { water: 0 });
  };

  const saveExtraActivitiesForDate = (date, activities) => {
    const normalized = normalizeExtraActivities(activities);
    setDailyExtraActivities((prev) => {
      const updated = { ...prev };
      if (normalized.length) updated[date] = normalized;
      else delete updated[date];
      return updated;
    });
    writeDay(date, { extraActivities: normalized });
  };

  const saveExtraActivity = (date, draft, editingId) => {
    const validation = validateExtraActivityCalories(draft.calories);
    if (!validation.ok) return validation.error;
    const type = getExtraActivityType(draft.type);
    const existing = dailyExtraActivities[date] || [];
    const now = new Date().toISOString();
    const nextActivity = {
      id: editingId || `extra-${Date.now()}`,
      type: type.key,
      name: type.label,
      calories: validation.value,
      createdAt: existing.find((a) => a.id === editingId)?.createdAt || now,
      updatedAt: now,
    };
    const next = editingId
      ? existing.map((a) => (a.id === editingId ? nextActivity : a))
      : [...existing, nextActivity];
    saveExtraActivitiesForDate(date, next);
    return '';
  };

  const removeExtraActivity = (date, activityId) => {
    const existing = dailyExtraActivities[date] || [];
    saveExtraActivitiesForDate(date, existing.filter((a) => a.id !== activityId));
  };

  // ── Профиль и настройки ──
  const saveProfileData = (next) => { setProfileData(next); saveProfilePatch({ profileData: next }); };
  const saveSettings = (next) => { setSettings(next); saveProfilePatch({ settings: next }); };
  const setTheme = (theme) => saveSettings({ ...settings, theme });
  const setFontScale = (scale) => saveSettings({ ...settings, fontScale: scale });
  const toggleBlock = (key) => saveSettings({ ...settings, blocks: { ...settings.blocks, [key]: !settings.blocks[key] } });

  const saveGoals = (nextGoals, { resetDailyGoals = false } = {}) => {
    const nextUsualSteps = getUsualSteps(nextGoals.baseSteps);
    const nextDeficit = Number.isFinite(Number(nextGoals.deficit)) ? Number(nextGoals.deficit) : 0;
    const profileChanged = getUsualSteps(profileData.usualSteps) !== nextUsualSteps
      || Number(profileData.deficit) !== Number(nextDeficit);
    const nextProfile = profileChanged
      ? { ...profileData, usualSteps: nextUsualSteps, deficit: nextDeficit }
      : profileData;
    const nextDailyGoals = resetDailyGoals ? {} : dailyGoals;
    saveProfilePatch({ goals: nextGoals, dailyGoals: nextDailyGoals, ...(profileChanged ? { profileData: nextProfile } : {}) });
    setGoals(nextGoals);
    setDailyGoals(nextDailyGoals);
    if (profileChanged) setProfileData(nextProfile);
  };

  // Вес для расчёта КБЖУ берём из последних показателей дневника, если есть.
  const measuredWeight = useMemo(() => {
    const ds = Object.keys(dailyMetrics).filter((d) => dailyMetrics[d]?.weight).sort();
    return ds.length ? Number(dailyMetrics[ds[ds.length - 1]].weight) : null;
  }, [dailyMetrics]);
  const effectiveProfile = { ...profileData, weight: measuredWeight != null ? measuredWeight : profileData.weight };
  const kbjuPreview = computeKbju(effectiveProfile);
  const selectedActivityKey = normalizeActivityKey(profileData.activity);

  // Авто-режим: при изменении профиля пересчитываем цели (как в web-версии).
  useEffect(() => {
    if (!uid || profileData.mode !== 'auto' || !kbjuPreview) return;
    const baseSteps = getUsualSteps(profileData.usualSteps ?? goals.baseSteps);
    const nextGoals = {
      ...goals,
      calories: kbjuPreview.calories,
      protein: kbjuPreview.protein,
      fats: kbjuPreview.fats,
      carbs: kbjuPreview.carbs,
      maintenance: kbjuPreview.maintenance,
      baseSteps,
      deficit: Number(profileData.deficit) || 0,
    };
    const goalsChanged = ['calories', 'protein', 'fats', 'carbs', 'maintenance', 'baseSteps', 'deficit']
      .some((key) => Number(goals[key]) !== Number(nextGoals[key]));
    const activityChanged = profileData.activity !== selectedActivityKey;
    if (!goalsChanged && !activityChanged) return;
    setGoals(nextGoals);
    saveProfilePatch({ goals: nextGoals, profileData: { ...profileData, activity: selectedActivityKey } });
  }, [
    uid, profileData.mode, profileData.sex, profileData.age, profileData.height, profileData.weight,
    profileData.activity, profileData.deficit, profileData.usualSteps, measuredWeight, selectedActivityKey,
    kbjuPreview?.calories, kbjuPreview?.protein, kbjuPreview?.fats, kbjuPreview?.carbs, kbjuPreview?.maintenance,
    goals.calories, goals.protein, goals.fats, goals.carbs, goals.maintenance, goals.baseSteps, goals.deficit,
  ]);

  // ── Замеры тела ──
  const persistBodyEntry = (entry) => {
    setBodyEntries((prev) => [...prev.filter((e) => e.id !== entry.id), entry].sort((a, b) => a.date.localeCompare(b.date)));
    if (uid) setDoc(bodyDocRef(uid, entry.id), entry).catch((err) => notify('Не удалось сохранить запись замеров: ' + err.message));
  };
  const addBodyEntry = async (draft) => {
    if (!draft.date) return false;
    const measures = {};
    BODY_MEASURE_FIELDS.forEach((field) => {
      const value = Number(draft.measures[field.key]);
      if (!Number.isNaN(value) && value > 0) measures[field.key] = value;
    });
    if (!Object.keys(measures).length) {
      notify('Добавь хотя бы одну мерку.');
      return false;
    }
    persistBodyEntry({
      id: `body-${draft.date}-${Date.now()}`,
      date: draft.date,
      measures,
      photos: draft.photos || [],
    });
    await removeItem(STORAGE_KEYS.bodyReminderDismissed);
    return true;
  };
  const deleteBodyEntry = async (id) => {
    if (!(await confirmDialog({ message: 'Удалить замеры за эту дату?', confirmLabel: 'Удалить', danger: true }))) return;
    setBodyEntries((prev) => prev.filter((e) => e.id !== id));
    if (uid) deleteDoc(bodyDocRef(uid, id)).catch((err) => notify('Не удалось удалить запись: ' + err.message));
  };

  // ── Соревновательная часть ──
  const myFriendCode = uid ? uid.slice(0, 6).toUpperCase() : '';
  const myDisplayName = (profileData.displayName || '').trim() || (userEmail ? userEmail.split('@')[0] : 'Аноним');

  // Сводные показатели для споров (портировано из web без изменений формул).
  const myStatsNow = useMemo(() => {
    const t = getLocalDateString(new Date());
    let stepSum = 0, stepCnt = 0, defSum = 0, defCnt = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(t); d.setDate(d.getDate() - i);
      const date = getLocalDateString(d);
      const g = getEffectiveGoals(date);
      const bS = getUsualSteps(g.baseSteps), bM = g.maintenance || 2300;
      if (dailySteps[date] !== undefined) { stepSum += Number(dailySteps[date]) || 0; stepCnt++; }
      const logs = dailyLogs[date] || [];
      if (logs.length) {
        const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
        const steps = dailySteps[date] !== undefined ? dailySteps[date] : bS;
        defSum += (bM + calculateStepCalorieAdjustment(steps, bS) + sumExtraActivityCalories(dailyExtraActivities[date] || [])) - cals;
        defCnt++;
      }
    }
    let streak = 0;
    for (let i = 0; i < 400; i++) {
      const d = new Date(t); d.setDate(d.getDate() - i);
      const date = getLocalDateString(d);
      const logs = dailyLogs[date] || [];
      if (!logs.length) break;
      const g = getEffectiveGoals(date);
      const bS2 = getUsualSteps(g.baseSteps), bM2 = g.maintenance || 2300;
      const steps2 = dailySteps[date] !== undefined ? dailySteps[date] : bS2;
      const burned2 = bM2 + calculateStepCalorieAdjustment(steps2, bS2) + sumExtraActivityCalories(dailyExtraActivities[date] || []);
      const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
      const targetDeficit = Number(g.deficit) || 0;
      if ((burned2 - cals) >= targetDeficit) streak++; else break;
    }
    const fatDates = Object.keys(dailyMetrics).filter((d) => dailyMetrics[d]?.fatPercent).sort();
    const mkHist = (entries) => entries.filter((e) => e.v != null && !Number.isNaN(e.v)).sort((a, b) => a.d.localeCompare(b.d)).slice(-14);
    const weightHistory = mkHist(Object.keys(dailyMetrics).filter((d) => dailyMetrics[d]?.weight).map((d) => ({ d, v: Number(dailyMetrics[d].weight) })));
    const fatHistory = mkHist(Object.keys(dailyMetrics).filter((d) => dailyMetrics[d]?.fatPercent).map((d) => ({ d, v: Number(dailyMetrics[d].fatPercent) })));
    const stepsHistory = mkHist(Object.keys(dailySteps).filter((d) => dailySteps[d] != null && dailySteps[d] !== '').map((d) => ({ d, v: Number(dailySteps[d]) })));
    const waistHistory = mkHist((bodyEntries || []).filter((e) => e?.measures?.waist).map((e) => ({ d: e.date, v: Number(e.measures.waist) })));
    return {
      weight: measuredWeight != null ? measuredWeight : (Number(profileData.weight) || null),
      fatPercent: fatDates.length ? Number(dailyMetrics[fatDates[fatDates.length - 1]].fatPercent) : null,
      waist: waistHistory.length ? waistHistory[waistHistory.length - 1].v : null,
      avg7Steps: stepCnt ? Math.round(stepSum / stepCnt) : 0,
      avg7Deficit: defCnt ? Math.round(defSum / defCnt) : 0,
      goalStreak: streak,
      weightHistory, fatHistory, stepsHistory, waistHistory,
    };
  }, [dailySteps, dailyLogs, dailyExtraActivities, dailyMetrics, bodyEntries, measuredWeight, profileData.weight, dailyGoals, goals]);

  const acceptedFriends = connections.filter((c) => c.status === 'accepted');
  const incomingRequests = connections.filter((c) => c.status === 'pending' && c.requestedBy !== uid);
  const outgoingRequests = connections.filter((c) => c.status === 'pending' && c.requestedBy === uid);
  const friendName = (fid) => (friendProfiles[fid]?.displayName) || 'Друг';
  const otherUid = (c) => (c.members || []).find((m) => m !== uid);

  const friendMetricNow = (fid, metric) => {
    if (fid === uid) return myStatsNow[metric];
    if (metric === 'weight') {
      const conn = acceptedFriends.find((c) => otherUid(c) === fid);
      const p = conn?.progress?.[fid];
      if (p && typeof p.weight === 'number') return p.weight;
      const hist = normalizeWeightHistory(p?.weightHistory || []);
      if (hist.length) return hist[hist.length - 1].v;
    }
    return undefined;
  };

  // Слушаем связи и споры, где я участник.
  useEffect(() => {
    if (!uid) { setConnections([]); setChallenges([]); return undefined; }
    const u1 = onSnapshot(query(connectionsCol, where('members', 'array-contains', uid)),
      (s) => { const a = []; s.forEach((d) => a.push({ id: d.id, ...d.data() })); setConnections(a); },
      (e) => logDev('connections error', e));
    const u2 = onSnapshot(query(challengesCol, where('members', 'array-contains', uid)),
      (s) => { const a = []; s.forEach((d) => a.push({ id: d.id, ...d.data() })); setChallenges(a); },
      (e) => logDev('challenges error', e));
    return () => { u1(); u2(); };
  }, [uid]);

  // Публикуем свой вес в связи (для сравнения прогресса).
  const myWeightProgressHistory = useMemo(() => normalizeWeightHistory(
    Object.keys(dailyMetrics).map((d) => ({ d, v: dailyMetrics[d]?.weight }))
  ), [dailyMetrics]);
  const myWeightProgressSignature = JSON.stringify(myWeightProgressHistory);

  useEffect(() => {
    if (!uid) return;
    const latestWeight = myWeightProgressHistory.length
      ? myWeightProgressHistory[myWeightProgressHistory.length - 1].v
      : null;
    connections
      .filter((c) => c.status === 'accepted' && (c.members || []).includes(uid))
      .forEach((c) => {
        const current = c.progress?.[uid] || {};
        const currentHistorySignature = JSON.stringify(normalizeWeightHistory(current.weightHistory || []));
        const currentWeight = typeof current.weight === 'number' ? current.weight : null;
        if (currentHistorySignature === myWeightProgressSignature && currentWeight === latestWeight) return;
        setDoc(connectionRef(c.id), {
          progress: {
            [uid]: { weight: latestWeight, weightHistory: myWeightProgressHistory, updatedAt: Date.now() },
          },
        }, { merge: true }).catch((e) => logDev('connection progress update error', e));
      });
  }, [uid, connections, myWeightProgressSignature]);

  // Публичные профили друзей/соперников — realtime.
  useEffect(() => {
    if (!uid) return undefined;
    const others = new Set();
    connections.forEach((c) => (c.members || []).forEach((m) => { if (m !== uid) others.add(m); }));
    challenges.forEach((c) => (c.members || []).forEach((m) => { if (m !== uid) others.add(m); }));
    const ids = [...others];
    if (!ids.length) return undefined;
    const unsubs = ids.map((id) => onSnapshot(publicProfileRef(id),
      (d) => { if (d.exists()) setFriendProfiles((prev) => ({ ...prev, [id]: { id, ...d.data() } })); },
      () => {}));
    return () => unsubs.forEach((u) => u());
  }, [uid, connections, challenges]);

  // Публикуем ТОЛЬКО имя и код друга.
  useEffect(() => {
    if (!uid) return;
    setDoc(publicProfileRef(uid), { uid, friendCode: myFriendCode, displayName: myDisplayName, updatedAt: Date.now() }).catch(() => {});
  }, [uid, myDisplayName]);

  // Пишем свой показатель в активные споры (только метрику спора).
  useEffect(() => {
    if (!uid || !challenges.length) return;
    challenges.forEach((c) => {
      if (!(c.members || []).includes(uid)) return;
      if (c.status === 'finished' || c.status === 'cancelled') return;
      const tp = challengeType(c.type);
      const histKey = challengeHistKey(tp.metric);
      const value = typeof myStatsNow[tp.metric] === 'number' ? myStatsNow[tp.metric] : null;
      const history = histKey ? (myStatsNow[histKey] || []) : [];
      const cur = c.live && c.live[uid];
      if (cur && cur.value === value && JSON.stringify(cur.history || []) === JSON.stringify(history)) return;
      setDoc(challengeRef(c.id), { live: { [uid]: { value, history, updatedAt: Date.now() } } }, { merge: true }).catch(() => {});
    });
  }, [uid, challenges, dailyLogs, dailySteps, dailyMetrics, dailyExtraActivities, measuredWeight, bodyEntries]);

  // Финализация споров: срок вышел или цель достигнута.
  useEffect(() => {
    if (!uid || !challenges.length) return;
    const today = getLocalDateString(new Date());
    challenges.forEach((c) => {
      if (!(c.members || []).includes(uid)) return;
      if (shouldFinalizeChallenge({ challenge: c, uid, myStatsNow, today })) {
        setDoc(challengeRef(c.id), { status: 'finished', finishedAt: Date.now() }, { merge: true }).catch(() => {});
      }
    });
  }, [uid, challenges, myStatsNow]);

  // ── Действия с друзьями и спорами ──
  const sendFriendRequest = async (codeInput) => {
    const code = String(codeInput || '').trim().toUpperCase();
    if (!uid || !code) return false;
    if (code === myFriendCode) { notify('Это ваш собственный код.'); return false; }
    try {
      const snap = await getDocs(query(publicProfilesCol, where('friendCode', '==', code), limit(1)));
      if (snap.empty) { notify('Пользователь с таким кодом не найден. Проверьте код (он появляется после того, как друг откроет приложение).'); return false; }
      const them = snap.docs[0].data();
      const theirUid = them.uid || snap.docs[0].id;
      if (theirUid === uid) { notify('Это ваш собственный код.'); return false; }
      const connId = [uid, theirUid].sort().join('__');
      await setDoc(connectionRef(connId), { members: [uid, theirUid].sort(), status: 'pending', requestedBy: uid, createdAt: Date.now() }, { merge: true });
      setFriendProfiles((prev) => ({ ...prev, [theirUid]: { id: theirUid, ...them } }));
      notify('Заявка отправлена ' + (them.displayName || 'другу') + '.');
      return true;
    } catch (e) { notify('Не удалось отправить заявку: ' + e.message); return false; }
  };
  const acceptConnection = (c) => setDoc(connectionRef(c.id), { status: 'accepted' }, { merge: true }).catch((e) => notify('Ошибка: ' + e.message));
  const removeConnection = async (c) => {
    if (await confirmDialog({ message: 'Удалить друга?', confirmLabel: 'Удалить', danger: true })) {
      deleteDoc(connectionRef(c.id)).catch((e) => notify('Ошибка: ' + e.message));
    }
  };

  const myChallengeSnapshot = (metric) => {
    const hk = challengeHistKey(metric);
    return {
      value: typeof myStatsNow[metric] === 'number' ? myStatsNow[metric] : null,
      history: hk ? (myStatsNow[hk] || []) : [],
      updatedAt: Date.now(),
    };
  };

  const createChallenge = async (draft) => {
    const { friendUid, type, myTarget, friendTarget, deadline } = draft;
    if (!uid || !friendUid || myTarget === '' || !deadline) { notify('Заполните соперника, вашу цель и срок.'); return false; }
    if (deadline <= getLocalDateString(new Date())) { notify('Срок спора должен быть в будущем — выберите дату от завтра.'); return false; }
    const members = [uid, friendUid].sort();
    const targets = { [uid]: Number(myTarget) };
    if (friendTarget !== '') targets[friendUid] = Number(friendTarget);
    const tp0 = challengeType(type);
    const start = { [uid]: { [tp0.metric]: typeof myStatsNow[tp0.metric] === 'number' ? myStatsNow[tp0.metric] : null } };
    const live = { [uid]: myChallengeSnapshot(tp0.metric) };
    try {
      await setDoc(doc(challengesCol), { members, createdBy: uid, type, targets, deadline, status: 'pending', acceptedBy: [uid], start, live, createdAt: Date.now() });
      notify('Вызов отправлен ' + friendName(friendUid) + '!');
      return true;
    } catch (e) { notify('Не удалось создать спор: ' + e.message); return false; }
  };

  const acceptChallenge = async (c, myTarget) => {
    if (myTarget === '') { notify('Укажите свою цель.'); return false; }
    const tp = challengeType(c.type);
    const startVal = typeof myStatsNow[tp.metric] === 'number' ? myStatsNow[tp.metric] : null;
    try {
      await setDoc(challengeRef(c.id), {
        status: 'active',
        acceptedBy: arrayUnion(uid),
        targets: { [uid]: Number(myTarget) },
        start: { [uid]: { [tp.metric]: startVal } },
        live: { [uid]: myChallengeSnapshot(tp.metric) },
      }, { merge: true });
      return true;
    } catch (e) { notify('Ошибка: ' + e.message); return false; }
  };

  const removeChallenge = async (c) => {
    if (c.status === 'finished' || c.status === 'cancelled') {
      if (await confirmDialog({ message: 'Удалить спор из истории?', confirmLabel: 'Удалить', danger: true })) {
        deleteDoc(challengeRef(c.id)).catch((e) => notify('Ошибка: ' + e.message));
      }
      return;
    }
    if (await confirmDialog({ message: 'Отменить спор? Соперник увидит, что спор отменён.', confirmLabel: 'Отменить спор', danger: true })) {
      setDoc(challengeRef(c.id), { status: 'cancelled', cancelledBy: uid, finishedAt: Date.now() }, { merge: true }).catch((e) => notify('Ошибка: ' + e.message));
    }
  };

  const challengeStanding = (c) => computeChallengeStanding({ challenge: c, uid, myStatsNow, friendName, today: getLocalDateString(new Date()) });
  const challengeSafetyWarningFor = (draft) => computeChallengeSafetyWarning({
    type: draft.type,
    myTarget: draft.myTarget,
    friendTarget: draft.friendTarget,
    myCurrent: myStatsNow[challengeType(draft.type).metric],
    friendCurrent: friendMetricNow(draft.friendUid, challengeType(draft.type).metric),
    deadline: draft.deadline,
    today: getLocalDateString(new Date()),
  });

  const value = {
    // auth
    uid, userEmail, authReady, isLoading, isOwner,
    doSignIn, doRegister, doPasswordReset, doSignOut, deleteAccountNow,
    // данные
    goals, dailyGoals, profileData, settings, foods, sharedFoods, personalFoods, favoriteIds,
    dailyLogs, dailySteps, dailyMetrics, dailyWorkouts, dailyWater, dailyExtraActivities, bodyEntries,
    connections, challenges, friendProfiles,
    // derived
    getEffectiveGoals, measuredWeight, effectiveProfile, kbjuPreview, selectedActivityKey, myStatsNow,
    acceptedFriends, incomingRequests, outgoingRequests, friendName, otherUid, friendMetricNow,
    myFriendCode, myDisplayName, myWeightProgressHistory,
    // действия
    writeDay, updateSteps, updateMetrics, addFoodLog, updateLogWeight, deleteLog, repeatLog, copyPreviousDay,
    addFood, saveAiGeneratedFood, updateFoodBase, deleteFood, toggleFavorite, moveFavorite,
    toggleWorkout, addWater, resetWater, saveExtraActivity, removeExtraActivity,
    saveProfileData, saveSettings, setTheme, setFontScale, toggleBlock, saveGoals,
    persistBodyEntry, addBodyEntry, deleteBodyEntry,
    sendFriendRequest, acceptConnection, removeConnection,
    createChallenge, acceptChallenge, removeChallenge, challengeStanding, challengeSafetyWarningFor,
    // UI
    toasts, notify, confirmState, confirmDialog, resolveConfirm,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
