import React, { useState, useEffect, useRef, useMemo } from 'react';
import firebase, { db, auth, functions, profileRef, dayRef, daysCol, bodyCol, bodyDocRef, OWNER_EMAIL, sharedFoodsRef, legacyRef, publicProfileRef, publicProfilesCol, connectionsCol, connectionRef, challengesCol, challengeRef } from './firebase.js';
import { motion, AnimatePresence } from 'framer-motion';
import { evaluateMath } from './utils/math.js';
import { calculateFoodPortion, createEstimatedFood, findBestFoodMatch, getFoodNameWords, normalizeFoodName, searchFoodsByName } from './utils/food.js';
import { AI_UNAVAILABLE_MESSAGE, formatParsedFoodAmount, MAX_FOOD_TEXT_LENGTH, parseFoodText } from './services/foodAi.js';
import { ACTIVITY_LEVELS, DEFAULT_ACTIVITY_KEY, calculateStepCalorieAdjustment, calculateStepsCalories, computeKbju, normalizeActivityKey } from './utils/kbju.js';
import { movingAverage } from './utils/stats.js';
import { getLocalDateString, getDefaultStartDate, getDefaultExportEndDate, displayDate } from './utils/date.js';
import { buildDietCsv } from './utils/export.js';
import { compareWeightLoss, filterDatesByProgressPeriod, getProgressPeriod, normalizeWeightHistory, progressPeriods, summarizeWeightProgress } from './utils/progress.js';
import { EXTRA_ACTIVITY_TYPES, calculateDailyAvailableCalories, getExtraActivityType, normalizeExtraActivities, sumExtraActivityCalories, validateExtraActivityCalories } from './utils/activity.js';
import { BODY_MEASURE_FIELDS, EMPTY_BODY_MEASURES, BODY_PHOTO_LABELS } from './constants.js';
import { CHALLENGE_TYPES, challengeType, challengeHistKey, challengeTargetFor, computeChallengeStanding, shouldFinalizeChallenge, challengeRecordVs, computeChallengeSafetyWarning } from './utils/challenges.js';
import { TOGGLEABLE_BLOCKS, DAILY_BODY_METRICS, DEFAULT_USUAL_STEPS, DEFAULT_PROFILE, DEFAULT_SETTINGS, WATER_QUICK, NON_SELECTABLE_INPUT_TYPES, APP_VERSION, VERSION_FILE_URL, logDev, getUsualSteps } from './constants/app.js';
import { THEMES, THEME_META_COLOR, normalizeThemeKey } from './constants/themes.js';
import { TAB_TITLES } from './constants/routes.js';
import AnimatedNumber from './components/AnimatedNumber.jsx';
import Toasts from './components/Toasts.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import { MacroBar, ProgressChart, MiniWeightChart } from './components/Charts.jsx';
import { IconStar, IconPlus, IconClose, IconMenu, IconSearch, IconBook, IconCalendar, IconChevronLeft, IconChevronRight, IconTrash, IconTarget, IconCheck, IconDownload, IconRefresh, IconBowl, IconSteps, IconDumbbell, IconTimer, IconSave, IconArrowLeft, IconPrinter, IconCamera, IconUser, IconDrop, IconMinus, IconCalc, IconSliders, IconUsers, IconTrophy, IconCopy, IconFlame, IconSparkles, IconInfo, IconHelpCircle, IconLogOut } from './components/Icons.jsx';

    function App() {
      const [isLoading, setIsLoading] = useState(true);
      const [showReportView, setShowReportView] = useState(false);
      const [isPrinting, setIsPrinting] = useState(false);
      
      const defaultGoals = { calories: 1800, protein: 150, fats: 60, carbs: 150, baseSteps: DEFAULT_USUAL_STEPS, maintenance: 2300, targetFat: 12, waterGoal: 2500, deficit: 500 };
      const [goals, setGoals] = useState(defaultGoals);
      const [draftGoals, setDraftGoals] = useState(defaultGoals);
      const [dailyGoals, setDailyGoals] = useState({});

      // Авторизация
      const [uid, setUid] = useState(null);
      const [userEmail, setUserEmail] = useState('');
      const [authReady, setAuthReady] = useState(false);
      const [authEmail, setAuthEmail] = useState('');
      const [authPass, setAuthPass] = useState('');
      const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
      const [authError, setAuthError] = useState('');
      const [authInfo, setAuthInfo] = useState('');
      const [authBusy, setAuthBusy] = useState(false);
      // Онбординг при регистрации: собираем данные для расчёта КБЖУ и привычное число шагов.
      const [showOnboarding, setShowOnboarding] = useState(false);
      const [onboardDraft, setOnboardDraft] = useState({
        sex: 'male',
        age: '',
        height: '',
        weight: '',
        activity: DEFAULT_ACTIVITY_KEY,
        deficit: 500,
        usualSteps: DEFAULT_USUAL_STEPS,
      });
      const [deleteBusy, setDeleteBusy] = useState(false);

      const [sharedFoods, setSharedFoods] = useState([]);   // общая база (shared/foods)
      const [personalFoods, setPersonalFoods] = useState([]); // личные добавки пользователя (profile.foods)
      const [favoriteIds, setFavoriteIds] = useState([]);    // избранное — у каждого своё (profile.favoriteIds)
      const isOwner = userEmail === OWNER_EMAIL;
      // Итоговый список: общая база + личные поверх (личные перекрывают по id); избранное вычисляется из favoriteIds.
      const foods = (() => {
        const base = sharedFoods;
        const personalIds = new Set(personalFoods.map(f => f.id));
        const favSet = new Set(favoriteIds);
        const baseList = base.filter(f => !personalIds.has(f.id)).map(f => ({ ...f, _shared: true, isFavorite: favSet.has(f.id) }));
        const personalList = personalFoods.map(f => ({ ...f, _shared: false, isFavorite: favSet.has(f.id) }));
        return [...baseList, ...personalList];
      })();
      const [bodyEntries, setBodyEntries] = useState([]);
      const [bodyDraft, setBodyDraft] = useState({ date: getLocalDateString(new Date()), measures: { ...EMPTY_BODY_MEASURES }, photos: [] });
      const [compareBodyIds, setCompareBodyIds] = useState(['', '']);
      const [comparePhotoIndexes, setComparePhotoIndexes] = useState([0, 0]);
      const [showBodyEditor, setShowBodyEditor] = useState(false);
      const [progressChartPeriod, setProgressChartPeriod] = useState('all');
      const [showBodyPhotoCompare, setShowBodyPhotoCompare] = useState(false);
      const [bodyPhotoZoom, setBodyPhotoZoom] = useState(false);
      const [singleBodyPhoto, setSingleBodyPhoto] = useState(null);
      const [singleBodyPhotoZoom, setSingleBodyPhotoZoom] = useState(false);
      const [dismissedBodyReminderDate, setDismissedBodyReminderDate] = useState(() => localStorage.getItem('body-reminder-dismissed') || '');
      const [kbjuRecalcDismissed, setKbjuRecalcDismissed] = useState(() => localStorage.getItem('kbju-recalc-dismissed') || '');
      const [dailyLogs, setDailyLogs] = useState({});
      const [dailySteps, setDailySteps] = useState({});
      const [dailyMetrics, setDailyMetrics] = useState({});
      const [dailyWorkouts, setDailyWorkouts] = useState({});
      const [dailyWater, setDailyWater] = useState({});
      const [dailyExtraActivities, setDailyExtraActivities] = useState({});
      const [profileData, setProfileData] = useState(DEFAULT_PROFILE);
      const [settings, setSettings] = useState(DEFAULT_SETTINGS);
      const [customWater, setCustomWater] = useState('');
      const [showExtraActivityModal, setShowExtraActivityModal] = useState(false);
      const [editingExtraActivityId, setEditingExtraActivityId] = useState(null);
      const [extraActivityDraft, setExtraActivityDraft] = useState({ type: 'football', calories: '400' });
      const [extraActivityError, setExtraActivityError] = useState('');

      // Соревновательная часть.
      const [connections, setConnections] = useState([]);
      const [challenges, setChallenges] = useState([]);
      const [friendProfiles, setFriendProfiles] = useState({});
      const [friendCodeInput, setFriendCodeInput] = useState('');
      const [showChallengeModal, setShowChallengeModal] = useState(false);
      const [challengeDraft, setChallengeDraft] = useState({ friendUid: '', type: 'weight', myTarget: '', friendTarget: '', deadline: '' });
      const [showAcceptModal, setShowAcceptModal] = useState(false);
      const [acceptDraft, setAcceptDraft] = useState({ challengeId: '', myTarget: '' });
      // Неблокирующие уведомления вместо alert(), и промис-подтверждение вместо confirm().
      const [toasts, setToasts] = useState([]);
      const [confirmState, setConfirmState] = useState(null);
      const notify = (message, type) => {
        if (!message) return;
        const kind = type || (/ошиб|не удал|не найд|нельзя|пуст|некоррект|должен|должна|заполн/i.test(String(message)) ? 'error' : 'success');
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setToasts(prev => [...prev.slice(-3), { id, message: String(message), kind }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200);
      };
      const confirmDialog = (opts) => {
        const o = typeof opts === 'string' ? { message: opts } : (opts || {});
        return new Promise(resolve => setConfirmState({
          message: o.message,
          confirmLabel: o.confirmLabel || 'Да',
          cancelLabel: o.cancelLabel || 'Отмена',
          danger: !!o.danger,
          resolve,
        }));
      };
      const resolveConfirm = (result) => { if (confirmState) confirmState.resolve(result); setConfirmState(null); };
      const [challengeProgressFriendUid, setChallengeProgressFriendUid] = useState('');
      const [challengeProgressPeriod, setChallengeProgressPeriod] = useState('14d');
      // ИИ разбирает текст на продукты только через VPS API; ключи остаются на сервере.
      const [showMealAiModal, setShowMealAiModal] = useState(false);
      const [mealAiText, setMealAiText] = useState('');
      const [mealAiBusy, setMealAiBusy] = useState(false);
      const [mealAiError, setMealAiError] = useState('');
      const [mealAiItems, setMealAiItems] = useState(null);
      const [isRefreshingDay, setIsRefreshingDay] = useState(false);
      
      const [currentDate, setCurrentDate] = useState(getLocalDateString(new Date()));
      const [activeTab, setActiveTab] = useState('diary');
      const [isDrawerOpen, setIsDrawerOpen] = useState(false);
      const [appUpdate, setAppUpdate] = useState(null);
      const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
      
      const [selectedFoodId, setSelectedFoodId] = useState('');
      const [gramsInput, setGramsInput] = useState('');
      const [foodSearch, setFoodSearch] = useState('');
      const [newFood, setNewFood] = useState({ name: '', cals: '', pro: '', fat: '', carb: '' });

      const [editingLogId, setEditingLogId] = useState(null);
      const [editingFoodId, setEditingFoodId] = useState(null);
      const [editValue, setEditValue] = useState({});
      const [modifier, setModifier] = useState({ type: null, value: '' });
      const [draggingFavoriteId, setDraggingFavoriteId] = useState(null);
      const [isReorderingFavorites, setIsReorderingFavorites] = useState(false);

      const [showExportModal, setShowExportModal] = useState(false);
      const [showGoalModal, setShowGoalModal] = useState(false);
      const [exportStart, setExportStart] = useState(getDefaultStartDate());
      const [exportEnd, setExportEnd] = useState(getDefaultExportEndDate());
      const [installPrompt, setInstallPrompt] = useState(null);

      const scrollContainerRef = useRef(null);
      const bodyEditorScrollRef = useRef(null);
      const mealFormRef = useRef(null);
      const foodSearchRef = useRef(null);
      const gramsInputRef = useRef(null);
      const mealListScrollRef = useRef(null);
      const favScrollRef = useRef(null);
      const initialGoalsRef = useRef(false);

      // Авторизация: следим за состоянием входа
      useEffect(() => {
        const unsub = auth.onAuthStateChanged((user) => {
          setUid(user ? user.uid : null);
          setUserEmail(user ? (user.email || '') : '');
          setAuthReady(true);
          if (!user) { setIsLoading(false); initialGoalsRef.current = false; }
        });
        return () => unsub();
      }, []);

      useEffect(() => {
        const handleBeforeInstallPrompt = (event) => {
          event.preventDefault();
          setInstallPrompt(event);
        };
        const handleAppInstalled = () => setInstallPrompt(null);
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);
        return () => {
          window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
          window.removeEventListener('appinstalled', handleAppInstalled);
        };
      }, []);

      // Централизованная проверка версии: при старте и при возврате во вкладку.
      useEffect(() => {
        let cancelled = false;
        const checkAppVersion = async () => {
          try {
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.getRegistration().then((registration) => registration?.update?.()).catch(() => {});
            }
            const response = await fetch(`${VERSION_FILE_URL}?t=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) return;
            const remote = await response.json();
            if (cancelled || !remote?.version) return;
            if (remote.version !== APP_VERSION) {
              setAppUpdate({
                version: remote.version,
                mandatory: !!remote.mandatory,
                message: remote.message || 'Доступно обновление',
              });
            } else {
              setAppUpdate(null);
            }
          } catch {
            // Проверка обновлений не должна ломать вход в приложение.
          }
        };

        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') checkAppVersion();
        };

        checkAppVersion();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', checkAppVersion);
        return () => {
          cancelled = true;
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('focus', checkAppVersion);
        };
      }, []);

      // Масштаб шрифта: Tailwind использует rem, поэтому меняем базовый размер корня.
      useEffect(() => {
        document.documentElement.style.fontSize = settings.fontScale === 'large' ? '18px' : '';
        return () => { document.documentElement.style.fontSize = ''; };
      }, [settings.fontScale]);

      // Тема оформления: переключаем data-theme и цвет статус-бара PWA.
      useEffect(() => {
        const theme = normalizeThemeKey(settings.theme);
        document.documentElement.dataset.theme = theme;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', THEME_META_COLOR[theme] || '#0a0a0b');
      }, [settings.theme]);

      const doAuth = async () => {
        setAuthError(''); setAuthInfo(''); setAuthBusy(true);
        try {
          if (authMode === 'register') {
            await auth.createUserWithEmailAndPassword(authEmail.trim(), authPass);
            // Новый пользователь указывает исходные данные и обычный уровень повседневной активности.
            setOnboardDraft({
              sex: 'male',
              age: '',
              height: '',
              weight: '',
              activity: DEFAULT_ACTIVITY_KEY,
              deficit: 500,
              usualSteps: DEFAULT_USUAL_STEPS,
            });
            setShowOnboarding(true);
          } else {
            await auth.signInWithEmailAndPassword(authEmail.trim(), authPass);
          }
          setAuthPass('');
        } catch (err) {
          const map = {
            'auth/invalid-email': 'Неверный формат e-mail.',
            'auth/missing-password': 'Введите пароль.',
            'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов).',
            'auth/email-already-in-use': 'Аккаунт уже существует — войдите.',
            'auth/invalid-credential': 'Неверный e-mail или пароль.',
            'auth/wrong-password': 'Неверный пароль.',
            'auth/user-not-found': 'Аккаунт не найден — зарегистрируйтесь.',
            'auth/configuration-not-found': 'Firebase Authentication не настроен для этого проекта. Включи Authentication → Sign-in method → Email/Password в Firebase Console.',
            'auth/operation-not-allowed': 'Вход по e-mail не включён в консоли Firebase (Authentication → Sign-in method).',
            'auth/network-request-failed': 'Нет сети.',
          };
          setAuthError(map[err.code] || err.message);
        }
        setAuthBusy(false);
      };

      // Сброс пароля: Firebase присылает на e-mail ссылку для установки нового пароля.
      const doPasswordReset = async () => {
        const email = authEmail.trim();
        setAuthError(''); setAuthInfo('');
        if (!email) { setAuthError('Введите e-mail — на него придёт письмо для сброса пароля.'); return; }
        setAuthBusy(true);
        try {
          await auth.sendPasswordResetEmail(email);
          setAuthInfo('Письмо для сброса пароля отправлено на ' + email + '. Перейдите по ссылке из письма (проверьте и «Спам»).');
        } catch (err) {
          const map = { 'auth/invalid-email': 'Неверный формат e-mail.', 'auth/user-not-found': 'Аккаунт с таким e-mail не найден.', 'auth/network-request-failed': 'Нет сети.' };
          setAuthError(map[err.code] || err.message);
        }
        setAuthBusy(false);
      };

      const profileDoc = uid ? profileRef(uid) : null;
      // Запись одного дня в подколлекцию days (merge — трогаем только нужное поле)
      const writeDay = (date, partial) => { if (uid) dayRef(uid, date).set(partial, { merge: true }); };

      // Запись большого набора данных (импорт/перенос): профиль + дни батчами
      const writeAllData = async (data) => {
        if (!uid) return;
        const profilePayload = {};
        if (data.goals) profilePayload.goals = data.goals;
        if (data.dailyGoals) profilePayload.dailyGoals = data.dailyGoals;
        if (data.foods) profilePayload.foods = data.foods;
        if (Object.keys(profilePayload).length) await profileRef(uid).set(profilePayload, { merge: true });
        // Замеры тела импортируем по одному документу в подколлекцию body (фото не влезают в лимит профиля).
        if (Array.isArray(data.bodyEntries) && data.bodyEntries.length) {
          for (let i = 0; i < data.bodyEntries.length; i += 400) {
            const batch = db.batch();
            data.bodyEntries.slice(i, i + 400).forEach((e) => { if (e && e.id) batch.set(bodyDocRef(uid, e.id), e); });
            await batch.commit();
          }
          await profileRef(uid).set({ bodyMigrated: true }, { merge: true });
        }
        const dates = new Set([
          ...Object.keys(data.dailyLogs || {}),
          ...Object.keys(data.dailySteps || {}),
          ...Object.keys(data.dailyMetrics || {}),
          ...Object.keys(data.dailyWorkouts || {}),
          ...Object.keys(data.dailyWater || {}),
          ...Object.keys(data.dailyExtraActivities || {}),
        ]);
        const all = Array.from(dates);
        for (let i = 0; i < all.length; i += 400) {
          const batch = db.batch();
          all.slice(i, i + 400).forEach(date => {
            const payload = {};
            const lg = (data.dailyLogs || {})[date];
            const st = (data.dailySteps || {})[date];
            const mt = (data.dailyMetrics || {})[date];
            const wk = (data.dailyWorkouts || {})[date];
            const wt = (data.dailyWater || {})[date];
            const ea = (data.dailyExtraActivities || {})[date];
            if (lg) payload.logs = lg;
            if (st !== undefined && st !== '') payload.steps = st;
            if (mt) payload.metrics = mt;
            payload.workout = !!wk;
            if (wt !== undefined && wt !== '') payload.water = wt;
            if (Array.isArray(ea)) payload.extraActivities = normalizeExtraActivities(ea);
            batch.set(dayRef(uid, date), payload, { merge: true });
          });
          await batch.commit();
        }
      };

      // Перенос данных из старой версии (единый документ users/main_profile)
      const importLegacy = async () => {
        if (!uid) return;
        if (!(await confirmDialog('Перенести данные из старой версии (main_profile) в твой аккаунт?'))) return;
        try {
          const snap = await legacyRef.get();
          if (!snap.exists) { notify('Старый документ main_profile не найден.'); return; }
          await writeAllData(snap.data());
          notify('Данные перенесены. Проверь дневник и отчёт.');
        } catch (err) {
          notify('Не удалось прочитать старые данные: ' + err.message + '\nЕсли правила Firestore уже закрыты — перенеси через JSON-бэкап.');
        }
      };

      // Профиль: цели, дневные цели, продукты
      useEffect(() => {
        if (!uid) return;
        setIsLoading(true);
        const unsubscribe = profileRef(uid).onSnapshot((docSnap) => {
          if (docSnap.exists) {
            const data = docSnap.data();
            if (data.goals) {
              const loaded = { ...defaultGoals, ...data.goals };
              // Дефицит мог не сохраняться в старых данных — выводим из нормы и цели.
              if (data.goals.deficit === undefined) loaded.deficit = Math.round((Number(loaded.maintenance) || 0) - (Number(loaded.calories) || 0));
              setGoals(loaded);
              if (!initialGoalsRef.current) {
                setDraftGoals(loaded);
                initialGoalsRef.current = true;
              }
            }
            setDailyGoals(data.dailyGoals || {});
            if (data.profileData) setProfileData({ ...DEFAULT_PROFILE, ...data.profileData });
            if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings, blocks: { ...DEFAULT_SETTINGS.blocks, ...(data.settings.blocks || {}) } });
            // Личные продукты (поверх общей базы) и избранное — у каждого своё.
            setPersonalFoods(Array.isArray(data.foods) ? data.foods : []);
            if (Array.isArray(data.favoriteIds)) setFavoriteIds(data.favoriteIds);
            else setFavoriteIds((data.foods || []).filter(f => f.isFavorite).map(f => f.id)); // миграция старого isFavorite
            // bodyEntries теперь живут в подколлекции body (см. отдельный слушатель и миграцию ниже).
          } else {
            setPersonalFoods([]);
          }
          setIsLoading(false);
        }, (error) => { logDev("Firebase error", error); setIsLoading(false); });
        return () => unsubscribe();
      }, [uid]);

      // Дни: собираем карты в память из подколлекции days
      useEffect(() => {
        if (!uid) return;
        const unsubscribe = daysCol(uid).onSnapshot((snap) => {
          const logs = {}, steps = {}, metrics = {}, workouts = {}, water = {}, extraActivities = {};
          snap.forEach((doc) => {
            const d = doc.data();
            if (d.logs && d.logs.length) logs[doc.id] = d.logs;
            if (d.steps !== undefined && d.steps !== '' && d.steps !== null) steps[doc.id] = d.steps;
            if (d.metrics && Object.keys(d.metrics).length) metrics[doc.id] = d.metrics;
            if (d.workout) workouts[doc.id] = true;
            if (d.water !== undefined && d.water !== '' && d.water !== null) water[doc.id] = d.water;
            if (Array.isArray(d.extraActivities) && d.extraActivities.length) extraActivities[doc.id] = normalizeExtraActivities(d.extraActivities);
          });
          setDailyLogs(logs); setDailySteps(steps); setDailyMetrics(metrics); setDailyWorkouts(workouts); setDailyWater(water); setDailyExtraActivities(extraActivities);
        }, (e) => logDev("days listener error", e));
        return () => unsubscribe();
      }, [uid]);

      // Замеры тела: каждая запись — отдельный документ подколлекции body.
      useEffect(() => {
        if (!uid) return;
        const unsubscribe = bodyCol(uid).onSnapshot((snap) => {
          const entries = [];
          snap.forEach((doc) => entries.push({ id: doc.id, ...doc.data() }));
          entries.sort((a, b) => a.date.localeCompare(b.date));
          setBodyEntries(entries);
        }, (e) => logDev("body listener error", e));
        return () => unsubscribe();
      }, [uid]);

      // Общая база продуктов: читают все авторизованные.
      useEffect(() => {
        if (!uid) return;
        const unsub = sharedFoodsRef.onSnapshot((snap) => {
          setSharedFoods(snap.exists && Array.isArray(snap.data().list) ? snap.data().list : []);
        }, (e) => logDev("shared foods error", e));
        return () => unsub();
      }, [uid]);

      // Владелец: один раз публикует свои продукты в общую базу (если её ещё нет) и переносит избранное в favoriteIds.
      useEffect(() => {
        if (!uid || !isOwner) return;
        let cancelled = false;
        (async () => {
          try {
            const sd = await sharedFoodsRef.get();
            if (cancelled || (sd.exists && (sd.data().list || []).length)) return;
            const prof = (await profileRef(uid).get()).data() || {};
            const own = prof.foods || [];
            if (cancelled || !own.length) return;
            const list = own.map(({ isFavorite, _shared, ...f }) => f);
            await sharedFoodsRef.set({ list });
            if (cancelled) return;
            const favIds = Array.isArray(prof.favoriteIds) ? prof.favoriteIds : own.filter(f => f.isFavorite).map(f => f.id);
            await profileRef(uid).set({ favoriteIds: favIds, foods: [] }, { merge: true });
          } catch (e) { logDev('publish shared foods error', e); }
        })();
        return () => { cancelled = true; };
      }, [uid, isOwner]);

      // Одноразовая миграция: старый массив profile.bodyEntries (или сиды) -> подколлекция body.
      // Идемпотентно (фиксированные id), флаг bodyMigrated защищает от повторного запуска на других устройствах.
      useEffect(() => {
        if (!uid) return;
        let cancelled = false;
        (async () => {
          try {
            const profSnap = await profileRef(uid).get();
            const pdata = profSnap.exists ? profSnap.data() : {};
            if (cancelled || pdata.bodyMigrated) return;
            const colSnap = await bodyCol(uid).get();
            if (cancelled) return;
            if (!colSnap.empty) { profileRef(uid).set({ bodyMigrated: true }, { merge: true }).catch(() => {}); return; }
            // Переносим ТОЛЬКО собственные старые замеры пользователя (если были в profile.bodyEntries).
            // Никаких начальных данных из кода — новые пользователи начинают с пустого.
            const legacy = Array.isArray(pdata.bodyEntries) ? pdata.bodyEntries : null;
            if (legacy && legacy.length) {
              const batch = db.batch();
              legacy.forEach((e) => batch.set(bodyDocRef(uid, e.id), e));
              await batch.commit();
              if (cancelled) return;
            }
            const upd = { bodyMigrated: true };
            if (legacy) upd.bodyEntries = firebase.firestore.FieldValue.delete();
            profileRef(uid).set(upd, { merge: true }).catch(() => {});
          } catch (e) { logDev('body migration error', e); }
        })();
        return () => { cancelled = true; };
      }, [uid]);

      // Разовая чистка: у НЕ-владельцев удаляем замеры, которые раньше ошибочно засевались из кода.
      // У них детерминированные id (без timestamp), реальные записи пользователя так не называются.
      useEffect(() => {
        if (!uid || isOwner) return;
        const flag = 'body-seed-cleaned-' + uid;
        if (localStorage.getItem(flag)) return;
        const SEEDED_IDS = ['body-2026-03-02', 'body-2026-04-15', 'body-2026-05-09', 'body-2026-05-26'];
        (async () => {
          try {
            await Promise.all(SEEDED_IDS.map((id) => bodyDocRef(uid, id).delete().catch(() => {})));
            localStorage.setItem(flag, '1');
          } catch (e) { /* no-op */ }
        })();
      }, [uid, isOwner]);

      useEffect(() => {
        if (!showReportView && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = 0;
        }
      }, [activeTab, showReportView]);

      useEffect(() => {
        if (bodyEditorScrollRef.current === null) return;
        const el = scrollContainerRef.current;
        const scrollTop = bodyEditorScrollRef.current;
        bodyEditorScrollRef.current = null;
        if (el) el.scrollTop = scrollTop;
      }, [showBodyEditor]);

      // При любом изменении поиска прокручиваем список продуктов в начало,
      // чтобы первый результат всегда был сразу справа от «Не выбрано».
      useEffect(() => {
        if (mealListScrollRef.current) mealListScrollRef.current.scrollLeft = 0;
      }, [foodSearch]);

      // Затухание краёв горизонтальных списков: включаем маску только с той стороны,
      // где есть прокручиваемое содержимое. Крайние элементы в покое остаются чёткими.
      useEffect(() => {
        const FADE = 22, EPS = 2;
        const right = `linear-gradient(to right, #000 calc(100% - ${FADE}px), transparent 100%)`;
        const left = `linear-gradient(to right, transparent 0, #000 ${FADE}px, #000 100%)`;
        const both = `linear-gradient(to right, transparent 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), transparent 100%)`;
        const update = (el) => {
          if (!el) return;
          const canL = el.scrollLeft > EPS;
          const canR = el.scrollLeft + el.clientWidth < el.scrollWidth - EPS;
          const mask = canL && canR ? both : canR ? right : canL ? left : 'none';
          el.style.webkitMaskImage = mask;
          el.style.maskImage = mask;
        };
        const els = [favScrollRef.current, mealListScrollRef.current].filter(Boolean);
        const cleanups = els.map((el) => {
          const fn = () => update(el);
          fn();
          el.addEventListener('scroll', fn, { passive: true });
          return () => el.removeEventListener('scroll', fn);
        });
        const onResize = () => els.forEach(update);
        window.addEventListener('resize', onResize);
        // Контент мог отрендериться чуть позже — пересчитаем на следующем кадре.
        const raf = requestAnimationFrame(() => els.forEach(update));
        return () => {
          cleanups.forEach((c) => c());
          window.removeEventListener('resize', onResize);
          cancelAnimationFrame(raf);
        };
      }, [activeTab, foodSearch, foods, selectedFoodId]);

      const startExport = () => {
        setShowExportModal(false);
        setShowReportView(true);
      };

      const handlePrintClick = () => {
        setIsPrinting(true); 
        
        const onAfterPrint = () => {
           setIsPrinting(false);
           window.removeEventListener('afterprint', onAfterPrint);
        };
        window.addEventListener('afterprint', onAfterPrint);

        setTimeout(() => {
          window.print();
          setTimeout(() => {
             setIsPrinting(false);
             window.removeEventListener('afterprint', onAfterPrint);
          }, 45000); 
        }, 300);
      };

      // Дефицит ↔ цель калорий ↔ норма связаны: цель = норма − дефицит.
      // Каждое поле — обычный редактируемый ввод (можно очищать), при числе пересчитывается связанное.
      const goalNum = (v) => (v === '' || v === null || v === undefined || isNaN(parseFloat(v))) ? null : parseFloat(v);
      // База шагов хранит обычный дневной уровень. Сами калории за шаги считаются отдельно.
      const applyBaseStepsToGoals = (currentGoals, baseSteps) => {
        const nextBaseSteps = getUsualSteps(baseSteps);
        return {
          ...currentGoals,
          baseSteps: nextBaseSteps,
        };
      };
      const handleDraftGoalChange = (field, val) => {
        if (field === 'baseSteps' && val !== '') {
          setDraftGoals(applyBaseStepsToGoals(draftGoals, val));
          return;
        }
        setDraftGoals({ ...draftGoals, [field]: val });
      };
      // edited-поле принимает число (или сырую строку для промежуточного «-»); связанное пересчитываем только при числе.
      const editedVal = (val, parsed) => val === '' ? '' : (parsed === null ? val : parsed);
      const handleCaloriesChange = (val) => {
        const m = goalNum(draftGoals.maintenance) || 0;
        const c = goalNum(val);
        setDraftGoals({ ...draftGoals, calories: editedVal(val, c), ...(c === null ? {} : { deficit: Math.round(m - c) }) });
      };
      const handleDeficitChange = (val) => {
        const m = goalNum(draftGoals.maintenance) || 0;
        const d = goalNum(val);
        setDraftGoals({ ...draftGoals, deficit: editedVal(val, d), ...(d === null ? {} : { calories: Math.max(0, Math.round(m - d)) }) });
      };
      const handleMaintenanceChange = (val) => {
        const m = goalNum(val);
        const d = goalNum(draftGoals.deficit) || 0;
        setDraftGoals({ ...draftGoals, maintenance: editedVal(val, m), ...(m === null ? {} : { calories: Math.max(0, Math.round(m - d)) }) });
      };

      const confirmGoalSave = async (mode) => {
        if (!(await confirmDialog('Вы уверены, что хотите применить новые настройки?'))) return;
        let updatedDailyGoals = { ...dailyGoals };
        if (mode === 'all') {
            updatedDailyGoals = {}; 
        } else if (mode === 'today') {
            const allDates = new Set([...Object.keys(dailyLogs), ...Object.keys(dailySteps)]);
            const todayStr = getLocalDateString(new Date());
            allDates.forEach(date => {
                if (date < todayStr && !updatedDailyGoals[date]) updatedDailyGoals[date] = { ...goals };
            });
        }
        // База шагов живёт в двух местах: goals.baseSteps и profileData.usualSteps.
        // Синхронизируем профиль при сохранении целей, иначе настройки показывают старое
        // значение, а авто-режим КБЖУ перезаписывает цели обратно из profileData.usualSteps.
        const nextUsualSteps = getUsualSteps(draftGoals.baseSteps);
        const profileChanged = getUsualSteps(profileData.usualSteps) !== nextUsualSteps;
        const nextProfile = profileChanged ? { ...profileData, usualSteps: nextUsualSteps } : profileData;
        if (profileDoc) profileDoc.set({ goals: draftGoals, dailyGoals: updatedDailyGoals, ...(profileChanged ? { profileData: nextProfile } : {}) }, { merge: true });
        setGoals(draftGoals); setDailyGoals(updatedDailyGoals);
        if (profileChanged) setProfileData(nextProfile);
        setShowGoalModal(false);
      };

      const getEffectiveGoals = (date) => dailyGoals[date] || goals;

      const handleUpdateSteps = (val) => {
        const num = parseInt(val);
        const value = isNaN(num) ? '' : num;
        setDailySteps({ ...dailySteps, [currentDate]: value });
        writeDay(currentDate, { steps: value });
      };

      const handleUpdateMetrics = (field, val) => {
        const num = parseFloat(val);
        const currentDayMetrics = dailyMetrics[currentDate] || {};
        const updatedDay = { ...currentDayMetrics, [field]: isNaN(num) ? '' : num };
        setDailyMetrics({ ...dailyMetrics, [currentDate]: updatedDay });
        writeDay(currentDate, { metrics: updatedDay });
      };

      const refreshCurrentDayVitals = async () => {
        if (!uid) return;
        setIsRefreshingDay(true);
        try {
          const snap = await dayRef(uid, currentDate).get({ source: 'server' });
          const data = snap.exists ? snap.data() : {};
          setDailySteps(prev => {
            const next = { ...prev };
            if (data.steps !== undefined && data.steps !== '' && data.steps !== null) next[currentDate] = data.steps;
            else delete next[currentDate];
            return next;
          });
          setDailyMetrics(prev => {
            const next = { ...prev };
            if (data.metrics && Object.keys(data.metrics).length) next[currentDate] = data.metrics;
            else delete next[currentDate];
            return next;
          });
        } catch (err) {
          notify('Не удалось обновить шаги и замеры: ' + err.message);
        }
        setIsRefreshingDay(false);
      };

      const resetMealForm = () => {
        setSelectedFoodId('');
        setGramsInput('');
        setFoodSearch('');
        foodSearchRef.current?.blur();
        gramsInputRef.current?.blur();
      };

      const selectFood = (foodId) => {
        setSelectedFoodId(foodId);
        // Нативно переводим фокус на вес (как в базе) — без спец. логики скролла/клавиатуры.
        setTimeout(() => gramsInputRef.current?.focus(), 0);
      };

      // Сброс выбора на «Не выбрано»: снимаем продукт, поиск и вес.
      const clearFoodSelection = () => {
        setSelectedFoodId('');
        setFoodSearch('');
        setGramsInput('');
      };

      const addFoodLog = (food, grams) => {
        if (!food || !Number.isFinite(grams) || grams <= 0) return false;
        const portion = calculateFoodPortion(food, grams);
        if (!portion) return false;

        const newLog = {
          id: Date.now().toString(), foodId: food.id, grams,
          totalCalories: portion.calories,
          totalProtein: portion.protein,
          totalFats: portion.fats,
          totalCarbs: portion.carbs
        };
        const updatedLogs = { ...dailyLogs, [currentDate]: [...(dailyLogs[currentDate] || []), newLog] };
        setDailyLogs(updatedLogs); 
        writeDay(currentDate, { logs: updatedLogs[currentDate] });
        return true;
      };

      const handleAddLog = (e) => {
        e.preventDefault();
        const food = foods.find(f => f.id === selectedFoodId);
        if (!food || !gramsInput) return;
        const grams = evaluateMath(gramsInput);
        if (!addFoodLog(food, grams)) return;
        resetMealForm();
      };

      const submitEdit = (logId) => {
        let base = parseFloat(editValue.grams) || 0;
        let mod = parseFloat(modifier.value) || 0;
        let finalGrams = base;
        
        if (modifier.type === '+') finalGrams += mod;
        if (modifier.type === '-') finalGrams -= mod;
        
        finalGrams = Math.max(0, Math.round(finalGrams * 10) / 10);
        
        if (finalGrams <= 0) {
            setEditingLogId(null);
            setModifier({type: null, value: ''});
            return;
        }

        updateLogWeight(logId, finalGrams);
      };

      const updateLogWeight = (logId, finalGrams) => {
        const logToUpdate = (dailyLogs[currentDate] || []).find(l => l.id === logId);
        if (logToUpdate && logToUpdate.grams === finalGrams) {
            setEditingLogId(null);
            setModifier({type: null, value: ''});
            return;
        }

        const dayLogs = dailyLogs[currentDate].map(log => {
          if (log.id === logId) {
            const food = foods.find(f => f.id === log.foodId);
            return {
              ...log, grams: finalGrams,
              totalCalories: Math.round((finalGrams / 100) * (food?.calories || 0)),
              totalProtein: Math.round((finalGrams / 100) * (food?.protein || 0)),
              totalFats: Math.round((finalGrams / 100) * (food?.fats || 0)),
              totalCarbs: Math.round((finalGrams / 100) * (food?.carbs || 0))
            };
          }
          return log;
        });
        const updatedLogs = { ...dailyLogs, [currentDate]: dayLogs };
        setDailyLogs(updatedLogs); 
        writeDay(currentDate, { logs: dayLogs }); 
        setEditingLogId(null);
        setModifier({type: null, value: ''});
      };

      const deleteLog = (id) => {
        const updatedLogs = { ...dailyLogs, [currentDate]: dailyLogs[currentDate].filter(l => l.id !== id) };
        setDailyLogs(updatedLogs); 
        writeDay(currentDate, { logs: updatedLogs[currentDate] });
      };

      // Запись общей базы (только владелец) и личных продуктов пользователя — с видимой ошибкой при сбое.
      const saveSharedFoods = (list) => { setSharedFoods(list); sharedFoodsRef.set({ list }, { merge: true }).catch(err => notify('Не удалось сохранить общую базу: ' + err.message)); };
      const savePersonalFoods = (list) => { setPersonalFoods(list); if (profileDoc) profileDoc.set({ foods: list }, { merge: true }).catch(() => {}); };
      const saveFavoriteIds = (ids) => { setFavoriteIds(ids); if (profileDoc) profileDoc.set({ favoriteIds: ids }, { merge: true }).catch(() => {}); };

      // Владелец публикует текущий список продуктов в общую базу shared/foods (видят все).
      const publishSharedBase = async () => {
        const list = foods.map(({ _shared, isFavorite, ...f }) => f);
        if (!list.length) { notify('Список продуктов пуст — публиковать нечего.'); return; }
        if (!(await confirmDialog('Опубликовать ' + list.length + ' продуктов в общую базу для всех пользователей?'))) return;
        try {
          await sharedFoodsRef.set({ list });
          // Продукты теперь в общей базе — очищаем личный список владельца, чтобы не дублировать.
          if (personalFoods.length && profileDoc) await profileDoc.set({ foods: [] }, { merge: true });
          notify('Готово! В общей базе теперь ' + list.length + ' продуктов. Они видны всем.');
        } catch (e) {
          notify('Не удалось опубликовать: ' + e.message + '\n\nПроверь правила Firestore для shared/foods (запись разрешена только владельцу).');
        }
      };

      const handleAddFood = (e) => {
        e.preventDefault();
        const now = new Date().toISOString();
        const foodItem = {
          id: Date.now().toString(), name: newFood.name,
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
        // Владелец добавляет в общую базу, остальные — в свои личные продукты (поверх базы).
        if (isOwner) saveSharedFoods([foodItem, ...sharedFoods]);
        else savePersonalFoods([foodItem, ...personalFoods]);
        setNewFood({ name: '', cals: '', pro: '', fat: '', carb: '' });
      };

      const updateFoodBase = (id) => {
        const target = foods.find(f => f.id === id);
        if (!target) { setEditingFoodId(null); return; }
        const patch = {
          name: editValue.name,
          calories: parseFloat(editValue.calories || 0),
          protein: parseFloat(editValue.protein || 0),
          fats: parseFloat(editValue.fats || 0),
          carbs: parseFloat(editValue.carbs || 0),
        };
        // Продукт из общей базы правит только владелец; личные — их владелец.
        if (target._shared) {
          if (isOwner) saveSharedFoods(sharedFoods.map(f => f.id === id ? { ...f, ...patch } : f));
        } else {
          savePersonalFoods(personalFoods.map(f => f.id === id ? { ...f, ...patch } : f));
        }

        const updatedLogs = { ...dailyLogs };
        const affected = [];
        Object.keys(updatedLogs).forEach(date => {
          let changed = false;
          updatedLogs[date] = updatedLogs[date].map(log => {
            if (log.foodId === id) {
              changed = true;
              const grams = log.grams;
              return {
                ...log,
                totalCalories: Math.round((grams / 100) * (editValue.calories || 0)),
                totalProtein: Math.round((grams / 100) * (editValue.protein || 0)),
                totalFats: Math.round((grams / 100) * (editValue.fats || 0)),
                totalCarbs: Math.round((grams / 100) * (editValue.carbs || 0))
              };
            }
            return log;
          });
          if (changed) affected.push(date);
        });

        setDailyLogs(updatedLogs);
        if (uid && affected.length) {
          for (let i = 0; i < affected.length; i += 400) {
            const batch = db.batch();
            affected.slice(i, i + 400).forEach(date => batch.set(dayRef(uid, date), { logs: updatedLogs[date] }, { merge: true }));
            batch.commit();
          }
        }
        setEditingFoodId(null);
      };

      // Сохранение/удаление одной записи замеров в подколлекции body (ошибки записи показываем — больше не молчим).
      const persistBodyEntry = (entry) => {
        setBodyEntries(prev => [...prev.filter(e => e.id !== entry.id), entry].sort((a, b) => a.date.localeCompare(b.date)));
        if (uid) bodyDocRef(uid, entry.id).set(entry).catch(err => notify('Не удалось сохранить запись замеров: ' + err.message));
      };
      const removeBodyEntryDoc = (id) => {
        setBodyEntries(prev => prev.filter(e => e.id !== id));
        if (uid) bodyDocRef(uid, id).delete().catch(err => notify('Не удалось удалить запись: ' + err.message));
      };

      const getBodyPhotoSrc = (photo) => typeof photo === 'string' ? photo : photo?.src;
      const getBodyPhotoLabel = (photo, idx) => typeof photo === 'string' ? (BODY_PHOTO_LABELS[idx] || `Фото ${idx + 1}`) : (photo?.label || BODY_PHOTO_LABELS[idx] || `Фото ${idx + 1}`);
      const countBodyPhotos = (photos) => (photos || []).filter(photo => getBodyPhotoSrc(photo)).length;
      const fillBodyPhotoSlots = (currentPhotos, newSources) => {
        const next = [...(currentPhotos || [])].slice(0, 3);
        newSources.forEach((src) => {
          const emptyIndex = [0, 1, 2].find(idx => !getBodyPhotoSrc(next[idx]));
          if (emptyIndex !== undefined) next[emptyIndex] = { src, label: BODY_PHOTO_LABELS[emptyIndex] };
        });
        return next;
      };
      const setBodyPhotoAtSlot = (photos, slotIndex, src) => {
        const next = [...(photos || [])];
        while (next.length < 3) next.push(null);
        next[slotIndex] = { src, label: BODY_PHOTO_LABELS[slotIndex] };
        return next.slice(0, 3);
      };

      const compressPhoto = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const maxSide = 900;
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          };
          img.onerror = reject;
          img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const handleBodyPhotoFiles = async (files) => {
        const selected = Array.from(files || []).slice(0, 3 - countBodyPhotos(bodyDraft.photos));
        if (!selected.length) return;
        try {
          const photos = await Promise.all(selected.map(compressPhoto));
          setBodyDraft(prev => ({ ...prev, photos: fillBodyPhotoSlots(prev.photos, photos) }));
        } catch (err) {
          notify('Не удалось добавить фото: ' + err.message);
        }
      };

      const handleBodyDraftPhotoSlot = async (slotIndex, files) => {
        const file = files?.[0];
        if (!file) return;
        try {
          const src = await compressPhoto(file);
          setBodyDraft(prev => ({ ...prev, photos: setBodyPhotoAtSlot(prev.photos, slotIndex, src) }));
        } catch (err) {
          notify('Не удалось добавить фото: ' + err.message);
        }
      };

      const handleBodyEntryPhotoSlot = async (entryId, slotIndex, files) => {
        const file = files?.[0];
        if (!file) return;
        try {
          const src = await compressPhoto(file);
          const entry = bodyEntries.find(item => item.id === entryId);
          if (!entry) return;
          persistBodyEntry({ ...entry, photos: setBodyPhotoAtSlot(entry.photos, slotIndex, src) });
        } catch (err) {
          notify('Не удалось добавить фото: ' + err.message);
        }
      };

      const toggleBodyEditor = () => {
        bodyEditorScrollRef.current = scrollContainerRef.current?.scrollTop ?? 0;
        setShowBodyEditor(prev => !prev);
      };

      const removeBodyEntryPhoto = (entryId, photoIndex) => {
        const entry = bodyEntries.find(item => item.id === entryId);
        if (!entry) return;
        persistBodyEntry({ ...entry, photos: (entry.photos || []).map((photo, idx) => idx === photoIndex ? null : photo) });
      };

      const handleBodyMeasureChange = (field, value) => {
        const normalized = value === '' ? '' : Math.max(0, Math.round(evaluateMath(value) * 10) / 10);
        setBodyDraft(prev => ({ ...prev, measures: { ...prev.measures, [field]: normalized } }));
      };

      const addBodyEntry = (e) => {
        e.preventDefault();
        if (!bodyDraft.date) return;
        const measures = {};
        BODY_MEASURE_FIELDS.forEach(field => {
          const value = Number(bodyDraft.measures[field.key]);
          if (!isNaN(value) && value > 0) measures[field.key] = value;
        });
        if (!Object.keys(measures).length && !countBodyPhotos(bodyDraft.photos)) {
          notify('Добавь хотя бы одну мерку или фото.');
          return;
        }
        const entry = {
          id: `body-${bodyDraft.date}-${Date.now()}`,
          date: bodyDraft.date,
          measures,
          photos: bodyDraft.photos || [],
        };
        persistBodyEntry(entry);
        setBodyDraft({ date: getLocalDateString(new Date()), measures: { ...EMPTY_BODY_MEASURES }, photos: [] });
        setDismissedBodyReminderDate('');
        localStorage.removeItem('body-reminder-dismissed');
      };

      const deleteBodyEntry = async (id) => {
        if (!(await confirmDialog({ message: 'Удалить замеры и фото за эту дату?', confirmLabel: 'Удалить', danger: true }))) return;
        removeBodyEntryDoc(id);
      };

      const dismissBodyReminder = () => {
        const today = getLocalDateString(new Date());
        setDismissedBodyReminderDate(today);
        localStorage.setItem('body-reminder-dismissed', today);
      };

      const deleteFood = (e, id) => {
        e.stopPropagation();
        const target = foods.find(f => f.id === id);
        if (!target) return;
        if (target._shared) { if (isOwner) saveSharedFoods(sharedFoods.filter(x => x.id !== id)); }
        else savePersonalFoods(personalFoods.filter(x => x.id !== id));
        if (favoriteIds.includes(id)) saveFavoriteIds(favoriteIds.filter(x => x !== id));
      };

      // Избранное — у каждого своё: храним упорядоченный список id (порядок = порядок показа).
      const toggleFavorite = (e, id) => {
        e.stopPropagation();
        saveFavoriteIds(favoriteIds.includes(id) ? favoriteIds.filter(x => x !== id) : [...favoriteIds, id]);
      };

      const moveFavorite = (e, id, direction) => {
        e.stopPropagation();
        const index = favoriteIds.indexOf(id);
        const nextIndex = index + direction;
        if (index === -1 || nextIndex < 0 || nextIndex >= favoriteIds.length) return;
        const ids = [...favoriteIds];
        [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
        saveFavoriteIds(ids);
      };

      const reorderFavorite = (dragId, targetId) => {
        if (!dragId || !targetId || dragId === targetId) return;
        const from = favoriteIds.indexOf(dragId);
        const to = favoriteIds.indexOf(targetId);
        if (from === -1 || to === -1) return;
        const ids = [...favoriteIds];
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        saveFavoriteIds(ids);
      };

      const finishFavoriteTouchDrag = (touch) => {
        const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-favorite-id]');
        reorderFavorite(draggingFavoriteId, target?.dataset.favoriteId);
        setDraggingFavoriteId(null);
      };

      const moveFavoritePointer = (clientX, clientY) => {
        if (!draggingFavoriteId) return;
        const target = document.elementFromPoint(clientX, clientY)?.closest('[data-favorite-id]');
        reorderFavorite(draggingFavoriteId, target?.dataset.favoriteId);
      };

      const applyAppUpdate = async () => {
        setIsApplyingUpdate(true);
        try {
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.update().catch(() => {})));
          }
          if ('caches' in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(
              cacheKeys
                .filter((key) => key.startsWith('tracker-'))
                .map((key) => caches.delete(key).catch(() => false))
            );
          }
        } finally {
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set('v', String(Date.now()));
          window.location.replace(nextUrl.toString());
        }
      };

      const closeDrawer = () => setIsDrawerOpen(false);
      const goToTabFromDrawer = (tab) => {
        setActiveTab(tab);
        setIsDrawerOpen(false);
      };
      const openExportFromDrawer = () => {
        setShowExportModal(true);
        setIsDrawerOpen(false);
      };
      const signOutFromDrawer = async () => {
        setIsDrawerOpen(false);
        if (await confirmDialog('Выйти из аккаунта?')) auth.signOut();
      };

      const installApp = async () => {
        if (!installPrompt) return;
        await installPrompt.prompt();
        await installPrompt.userChoice;
        setInstallPrompt(null);
      };

      const toggleWorkout = () => {
        const updated = { ...dailyWorkouts, [currentDate]: !dailyWorkouts[currentDate] };
        setDailyWorkouts(updated);
        writeDay(currentDate, { workout: !!updated[currentDate] });
      };

      const saveExtraActivitiesForDate = (date, activities) => {
        const normalized = normalizeExtraActivities(activities);
        const updated = { ...dailyExtraActivities };
        if (normalized.length) updated[date] = normalized;
        else delete updated[date];
        setDailyExtraActivities(updated);
        writeDay(date, { extraActivities: normalized });
      };
      const openExtraActivityModal = (activity = null) => {
        if (activity) {
          setEditingExtraActivityId(activity.id);
          setExtraActivityDraft({ type: activity.type, calories: String(activity.calories) });
        } else {
          setEditingExtraActivityId(null);
          setExtraActivityDraft({ type: 'football', calories: '400' });
        }
        setExtraActivityError('');
        setShowExtraActivityModal(true);
      };
      const closeExtraActivityModal = () => {
        setShowExtraActivityModal(false);
        setEditingExtraActivityId(null);
        setExtraActivityError('');
      };
      const setExtraActivityType = (typeKey) => {
        const type = getExtraActivityType(typeKey);
        setExtraActivityDraft({
          type: type.key,
          calories: type.defaultCalories === '' ? '' : String(type.defaultCalories),
        });
        setExtraActivityError('');
      };
      const saveExtraActivity = () => {
        const validation = validateExtraActivityCalories(extraActivityDraft.calories);
        if (!validation.ok) {
          setExtraActivityError(validation.error);
          return;
        }
        setExtraActivityError('');
        const type = getExtraActivityType(extraActivityDraft.type);
        const existing = dailyExtraActivities[currentDate] || [];
        const now = new Date().toISOString();
        const nextActivity = {
          id: editingExtraActivityId || `extra-${Date.now()}`,
          type: type.key,
          name: type.label,
          calories: validation.value,
          createdAt: existing.find((activity) => activity.id === editingExtraActivityId)?.createdAt || now,
          updatedAt: now,
        };
        const next = editingExtraActivityId
          ? existing.map((activity) => activity.id === editingExtraActivityId ? nextActivity : activity)
          : [...existing, nextActivity];
        saveExtraActivitiesForDate(currentDate, next);
        closeExtraActivityModal();
      };
      const removeExtraActivity = (activityId) => {
        const existing = dailyExtraActivities[currentDate] || [];
        saveExtraActivitiesForDate(currentDate, existing.filter((activity) => activity.id !== activityId));
      };

      // Вода: добавляем/убавляем мл к текущему дню (не уходим в минус).
      const addWater = (amount) => {
        const next = Math.max(0, (Number(dailyWater[currentDate]) || 0) + amount);
        setDailyWater({ ...dailyWater, [currentDate]: next });
        writeDay(currentDate, { water: next });
      };
      const resetWater = () => {
        setDailyWater({ ...dailyWater, [currentDate]: 0 });
        writeDay(currentDate, { water: 0 });
      };
      const addCustomWater = () => {
        const v = Math.round(parseFloat(customWater));
        if (!v || v <= 0) return;
        addWater(v);
        setCustomWater('');
      };

      // Профиль и настройки приложения сохраняются в документ профиля.
      const saveProfileData = (next) => {
        setProfileData(next);
        if (profileDoc) profileDoc.set({ profileData: next }, { merge: true }).catch(() => {});
      };
      const saveSettings = (next) => {
        setSettings(next);
        if (profileDoc) profileDoc.set({ settings: next }, { merge: true }).catch(() => {});
      };
      const handleEditableFieldFocus = (event) => {
        const field = event.target;
        const isTextInput = field instanceof HTMLInputElement
          && !NON_SELECTABLE_INPUT_TYPES.includes(field.type);
        const isTextArea = field instanceof HTMLTextAreaElement;
        if ((!isTextInput && !isTextArea) || field.disabled || field.readOnly) return;
        field.select();
      };
      const handleProfileChange = (field, value) => saveProfileData({ ...profileData, [field]: value });
      const handleUsualStepsChange = (value) => {
        const usualSteps = value === '' ? '' : getUsualSteps(value);
        const nextProfile = { ...profileData, usualSteps };
        const nextGoals = applyBaseStepsToGoals(goals, usualSteps);
        setProfileData(nextProfile);
        setGoals(nextGoals);
        setDraftGoals(nextGoals);
        if (profileDoc) {
          profileDoc.set({ profileData: nextProfile, goals: nextGoals }, { merge: true }).catch(() => {});
        }
      };
      const toggleBlock = (key) => saveSettings({ ...settings, blocks: { ...settings.blocks, [key]: !settings.blocks[key] } });
      const setFontScale = (scale) => saveSettings({ ...settings, fontScale: scale });
      const setTheme = (theme) => saveSettings({ ...settings, theme });

      // Автоматический расчёт КБЖУ по формуле и открытие модалки применения целей.
      const applyAutoKbju = () => {
        const res = computeKbju(effectiveProfile);
        if (!res) { notify('Заполните пол, возраст, рост и вес — по ним считается КБЖУ.'); return; }
        const baseSteps = getUsualSteps(effectiveProfile.usualSteps);
        const activity = normalizeActivityKey(effectiveProfile.activity);
        setDraftGoals({
          ...draftGoals,
          calories: res.calories,
          protein: res.protein,
          fats: res.fats,
          carbs: res.carbs,
          maintenance: res.maintenance,
          baseSteps,
          deficit: Number(effectiveProfile.deficit) || 0,
        });
        // Запоминаем вес из замеров и дату расчёта — чтобы раз в месяц напоминать о пересчёте.
        saveProfileData({ ...profileData, activity, weight: effectiveProfile.weight, lastKbjuAt: getLocalDateString(new Date()) });
        setActiveTab('directory');
        setShowGoalModal(true);
      };

      // Завершение онбординга: сохраняем профиль и считаем КБЖУ по модели BMR + шаги + активность.
      const finishOnboarding = () => {
        const o = onboardDraft;
        if (!o.age || !o.height || !o.weight) { notify('Заполните возраст, рост и вес — по ним считается КБЖУ.'); return; }
        const today = getLocalDateString(new Date());
        const usualSteps = getUsualSteps(o.usualSteps);
        const p = {
          ...profileData,
          sex: o.sex,
          age: o.age,
          height: o.height,
          weight: o.weight,
          activity: normalizeActivityKey(o.activity),
          usualSteps,
          deficit: o.deficit,
          mode: 'auto',
          onboardedAt: today,
          lastKbjuAt: today,
        };
        const kbju = computeKbju(p);
        const autoGoals = kbju
          ? {
              calories: kbju.calories,
              protein: kbju.protein,
              fats: kbju.fats,
              carbs: kbju.carbs,
              maintenance: kbju.maintenance,
              deficit: Number(o.deficit) || 0,
            }
          : {};
        const newGoals = { ...goals, baseSteps: usualSteps, ...autoGoals };
        setProfileData(p); setGoals(newGoals); setDraftGoals(newGoals);
        if (profileDoc) profileDoc.set({ profileData: p, goals: newGoals }, { merge: true }).catch(() => {});
        setShowOnboarding(false);
      };

      // Удаление аккаунта и всех данных (через Cloud Function), затем выход.
      const deleteAccountNow = async () => {
        if (!(await confirmDialog({ message: 'Удалить аккаунт? Все данные (дневник, замеры, фото, друзья, споры) удалятся безвозвратно.', confirmLabel: 'Удалить', danger: true }))) return;
        if (!(await confirmDialog({ message: 'Точно удалить? Это необратимо.', confirmLabel: 'Удалить навсегда', danger: true }))) return;
        setDeleteBusy(true);
        try {
          const callable = functions.httpsCallable('deleteAccount');
          await callable({});
          await auth.signOut().catch(() => {});
          notify('Аккаунт удалён.');
        } catch (e) {
          notify('Не удалось удалить аккаунт: ' + (e.message || e));
        }
        setDeleteBusy(false);
      };

      const copyPreviousDay = async () => {
        const d = new Date(currentDate); d.setDate(d.getDate() - 1);
        const prev = getLocalDateString(d);
        const prevLogs = dailyLogs[prev] || [];
        if (prevLogs.length === 0) { notify('За предыдущий день записей нет.'); return; }
        if (!(await confirmDialog(`Скопировать ${prevLogs.length} записей из дня ${prev}?`))) return;
        const copied = prevLogs.map((l, idx) => ({ ...l, id: (Date.now() + idx).toString() }));
        const updated = { ...dailyLogs, [currentDate]: [...(dailyLogs[currentDate] || []), ...copied] };
        setDailyLogs(updated);
        writeDay(currentDate, { logs: updated[currentDate] });
      };

      const triggerDownload = (content, filename, type) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };

      const downloadCSV = () => {
        const csv = buildDietCsv({
          dates: allExportDates,
          getGoalsForDate: getEffectiveGoals,
          dailyLogs,
          dailySteps,
          dailyMetrics,
          dailyWorkouts,
          dailyWater,
          dailyExtraActivities,
        });
        triggerDownload(csv, `diet_${exportStart}_${exportEnd}.csv`, 'text/csv;charset=utf-8;');
      };

      const downloadBackup = () => {
        const data = { goals, dailyGoals, foods, bodyEntries, dailyLogs, dailySteps, dailyMetrics, dailyWorkouts, dailyWater, dailyExtraActivities, _exportedAt: new Date().toISOString() };
        triggerDownload(JSON.stringify(data, null, 2), `backup_${getLocalDateString(new Date())}.json`, 'application/json');
      };

      const importBackup = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (!(await confirmDialog('Это перезапишет/дополнит данные аккаунта содержимым файла. Продолжить?'))) { e.target.value = ''; return; }
            await writeAllData(data);
            notify('Данные восстановлены из бэкапа.');
          } catch (err) {
            notify('Ошибка чтения файла: ' + err.message);
          }
          e.target.value = '';
        };
        reader.readAsText(file);
      };

      const activeGoals = getEffectiveGoals(currentDate);
      const modelMaintenance = activeGoals.maintenance || 2300;
      const baseStepsGoal = getUsualSteps(activeGoals.baseSteps);
      const todaySteps = dailySteps[currentDate] !== undefined
        ? dailySteps[currentDate]
        : baseStepsGoal;
      const stepCaloriesDelta = calculateStepCalorieAdjustment(todaySteps, baseStepsGoal);
      const todayStepCalories = calculateStepsCalories(todaySteps);
      const baseTargetCalories = Number(activeGoals.calories) || 0;
      const targetCalories = baseTargetCalories + stepCaloriesDelta;
      const todayExtraActivities = normalizeExtraActivities(dailyExtraActivities[currentDate] || []);
      const extraActivityCalories = sumExtraActivityCalories(todayExtraActivities);
      const dailyAvailableCalories = calculateDailyAvailableCalories(targetCalories, todayExtraActivities);
      const dailyCarbGoal = Math.max(
        0,
        (Number(activeGoals.carbs) || 0) + Math.round(stepCaloriesDelta / 4),
      );

      const currentDayLogs = dailyLogs[currentDate] || [];
      const totalCals = currentDayLogs.reduce((sum, log) => sum + (log.totalCalories || 0), 0);
      const totalPro = currentDayLogs.reduce((sum, log) => sum + (log.totalProtein || 0), 0);
      const totalFats = currentDayLogs.reduce((sum, log) => sum + (log.totalFats || 0), 0);
      const totalCarbs = currentDayLogs.reduce((sum, log) => sum + (log.totalCarbs || 0), 0);
      
      const isOver = totalCals > dailyAvailableCalories;
      const displayCals = isOver ? (totalCals - dailyAvailableCalories) : (dailyAvailableCalories - totalCals);
      const calsColorClass = isOver ? "text-red-500" : "text-emerald-400";
      const calsLabel = isOver ? "перебор" : "осталось";
      
      const progressCals = Math.min(100, (totalCals / (dailyAvailableCalories || 1)) * 100);

      const todayWater = Number(dailyWater[currentDate]) || 0;
      const waterGoal = Number(activeGoals.waterGoal) || 2500;
      const waterProgress = Math.min(100, (todayWater / (waterGoal || 1)) * 100);
      const blocks = settings.blocks || DEFAULT_SETTINGS.blocks;
      // Вес для расчёта КБЖУ берём из последних показателей в дневнике, если они есть.
      const measuredWeight = (() => {
        const ds = Object.keys(dailyMetrics).filter(d => dailyMetrics[d]?.weight).sort();
        return ds.length ? Number(dailyMetrics[ds[ds.length - 1]].weight) : null;
      })();
      const effectiveProfile = { ...profileData, weight: measuredWeight != null ? measuredWeight : profileData.weight };
      const selectedActivityKey = normalizeActivityKey(profileData.activity);
      const kbjuPreview = computeKbju(effectiveProfile);
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
        setDraftGoals(nextGoals);
        profileRef(uid).set({
          goals: nextGoals,
          profileData: { ...profileData, activity: selectedActivityKey },
        }, { merge: true }).catch(() => {});
      }, [
        uid,
        profileData.mode,
        profileData.sex,
        profileData.age,
        profileData.height,
        profileData.weight,
        profileData.activity,
        profileData.deficit,
        profileData.usualSteps,
        measuredWeight,
        selectedActivityKey,
        kbjuPreview?.calories,
        kbjuPreview?.protein,
        kbjuPreview?.fats,
        kbjuPreview?.carbs,
        kbjuPreview?.maintenance,
        goals.calories,
        goals.protein,
        goals.fats,
        goals.carbs,
        goals.maintenance,
        goals.baseSteps,
        goals.deficit,
      ]);
      // Раз в месяц предлагаем пересчитать КБЖУ, если из-за изменившегося веса цель сдвинулась ≥50 ккал.
      const kbjuToday = getLocalDateString(new Date());
      const daysSinceDate = (d) => d ? Math.floor((new Date(kbjuToday) - new Date(d)) / 86400000) : Infinity;
      const kbjuCalorieGap = (profileData.mode === 'auto' && kbjuPreview) ? Math.abs((kbjuPreview.calories || 0) - (Number(goals.calories) || 0)) : 0;
      const showKbjuRecalc = profileData.mode === 'auto' && !!kbjuPreview && measuredWeight != null
        && kbjuCalorieGap >= 50 && daysSinceDate(profileData.lastKbjuAt) >= 30 && daysSinceDate(kbjuRecalcDismissed) >= 30;
      const dismissKbjuRecalc = () => { localStorage.setItem('kbju-recalc-dismissed', kbjuToday); setKbjuRecalcDismissed(kbjuToday); };

      // ── Соревнования: код друга, мои показатели для витрины ──
      const myFriendCode = uid ? uid.slice(0, 6).toUpperCase() : '';
      const myDisplayName = (profileData.displayName || '').trim() || (userEmail ? userEmail.split('@')[0] : 'Аноним');
      // Сводные показатели для публичной витрины (по ним считаются споры).
      // Мемоизируем: внутри цикл до 400 дней (серия) + построение историй —
      // без useMemo это пересчитывалось на каждый рендер (в т.ч. на каждый ввод символа).
      const myStatsNow = useMemo(() => {
        const t = getLocalDateString(new Date());
        let stepSum = 0, stepCnt = 0, defSum = 0, defCnt = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(t); d.setDate(d.getDate() - i);
          const date = getLocalDateString(d);
          const g = getEffectiveGoals(date); const bS = getUsualSteps(g.baseSteps), bM = g.maintenance || 2300;
          if (dailySteps[date] !== undefined) { stepSum += Number(dailySteps[date]) || 0; stepCnt++; }
          const logs = dailyLogs[date] || [];
          if (logs.length) {
            const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
            const steps = dailySteps[date] !== undefined ? dailySteps[date] : bS;
            defSum += (bM + calculateStepCalorieAdjustment(steps, bS) + sumExtraActivityCalories(dailyExtraActivities[date] || [])) - cals; defCnt++;
          }
        }
        // Серия: день засчитывается, если дефицит по TDEE с отдельной строкой шагов достиг целевого.
        // То есть (BMR + активность + шаги) − съедено ≥ целевой дефицит.
        let streak = 0;
        for (let i = 0; i < 400; i++) {
          const d = new Date(t); d.setDate(d.getDate() - i);
          const date = getLocalDateString(d); const logs = dailyLogs[date] || [];
          if (!logs.length) break;
          const g = getEffectiveGoals(date);
          const bS2 = getUsualSteps(g.baseSteps), bM2 = g.maintenance || 2300;
          const steps2 = dailySteps[date] !== undefined ? dailySteps[date] : bS2;
          const burned2 = bM2 + calculateStepCalorieAdjustment(steps2, bS2) + sumExtraActivityCalories(dailyExtraActivities[date] || []);
          const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
          const targetDeficit = Number(g.deficit) || 0;
          if ((burned2 - cals) >= targetDeficit) streak++; else break;
        }
        const fatDates = Object.keys(dailyMetrics).filter(d => dailyMetrics[d]?.fatPercent).sort();
        // Тренды (последние 14 точек) по метрикам — чтобы соперник видел прогресс по той
        // метрике, на которую идёт спор: вес/жир/шаги/талия. Каждый пункт {d: дата, v: число}.
        const mkHist = (entries) => entries.filter(e => e.v != null && !isNaN(e.v)).sort((a, b) => a.d.localeCompare(b.d)).slice(-14);
        const weightHistory = mkHist(Object.keys(dailyMetrics).filter(d => dailyMetrics[d]?.weight).map(d => ({ d, v: Number(dailyMetrics[d].weight) })));
        const fatHistory = mkHist(Object.keys(dailyMetrics).filter(d => dailyMetrics[d]?.fatPercent).map(d => ({ d, v: Number(dailyMetrics[d].fatPercent) })));
        const stepsHistory = mkHist(Object.keys(dailySteps).filter(d => dailySteps[d] != null && dailySteps[d] !== '').map(d => ({ d, v: Number(dailySteps[d]) })));
        const waistHistory = mkHist((bodyEntries || []).filter(e => e?.measures?.waist).map(e => ({ d: e.date, v: Number(e.measures.waist) })));
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
      const acceptedFriends = connections.filter(c => c.status === 'accepted');
      const incomingRequests = connections.filter(c => c.status === 'pending' && c.requestedBy !== uid);
      const outgoingRequests = connections.filter(c => c.status === 'pending' && c.requestedBy === uid);
      const friendName = (fid) => (friendProfiles[fid]?.displayName) || 'Друг';
      const otherUid = (c) => (c.members || []).find(m => m !== uid);
      // Текущий показатель соперника, который мы вправе видеть до старта спора.
      // Публичный профиль хранит только имя/код, поэтому вес берём из прогресса связи
      // (его пишут обе стороны в connections.progress). Остальные метрики приватны —
      // до создания спора мы их не знаем и подсказку не показываем.
      const friendMetricNow = (fid, metric) => {
        if (fid === uid) return myStatsNow[metric];
        if (metric === 'weight') {
          const conn = acceptedFriends.find(c => otherUid(c) === fid);
          const p = conn?.progress?.[fid];
          if (p && typeof p.weight === 'number') return p.weight;
          const hist = normalizeWeightHistory(p?.weightHistory || []);
          if (hist.length) return hist[hist.length - 1].v;
        }
        return undefined;
      };
      const progressToday = getLocalDateString(new Date());
      const acceptedFriendUids = acceptedFriends.map(c => otherUid(c)).filter(Boolean);
      const selectedChallengeFriendConnection = acceptedFriends.find(c => otherUid(c) === challengeProgressFriendUid) || null;
      const selectedChallengeProgressPeriod = getProgressPeriod(challengeProgressPeriod);
      const myWeightProgressHistory = normalizeWeightHistory(
        Object.keys(dailyMetrics).map(d => ({ d, v: dailyMetrics[d]?.weight }))
      );
      const selectedFriendConnectionHistory = normalizeWeightHistory(
        selectedChallengeFriendConnection?.progress?.[challengeProgressFriendUid]?.weightHistory || []
      );
      const selectedFriendChallengeHistory = normalizeWeightHistory(
        challenges
          .filter(c => (c.members || []).includes(challengeProgressFriendUid) && challengeType(c.type).metric === 'weight')
          .flatMap(c => c.live?.[challengeProgressFriendUid]?.history || [])
      );
      const selectedFriendWeightHistory = normalizeWeightHistory([
        ...selectedFriendConnectionHistory,
        ...selectedFriendChallengeHistory,
      ]);
      const myWeightProgressSummary = summarizeWeightProgress({
        history: myWeightProgressHistory,
        periodKey: challengeProgressPeriod,
        today: progressToday,
        emptyMessage: 'У вас пока нет записей прогресса',
      });
      const friendWeightProgressSummary = summarizeWeightProgress({
        history: selectedFriendWeightHistory,
        periodKey: challengeProgressPeriod,
        today: progressToday,
        emptyMessage: 'Отчёт не ведётся',
      });
      const challengeProgressOutcome = compareWeightLoss(
        myWeightProgressSummary,
        friendWeightProgressSummary,
        selectedChallengeProgressPeriod.label,
      );
      const challengeProgressToneClass = ({
        me: 'bg-emerald-600/15 border-emerald-600/40 text-emerald-200',
        friend: 'bg-amber-500/15 border-amber-400/40 text-amber-100',
        tie: 'bg-sky-500/15 border-sky-400/30 text-sky-100',
        insufficient: 'bg-[#27272a] border-zinc-700/40 text-zinc-300',
      })[challengeProgressOutcome.status] || 'bg-[#27272a] border-zinc-700/40 text-zinc-300';
      const myWeightProgressSignature = JSON.stringify(myWeightProgressHistory);

      // Слушаем связи и споры, где я участник.
      useEffect(() => {
        if (!uid) { setConnections([]); setChallenges([]); return; }
        const u1 = connectionsCol.where('members', 'array-contains', uid).onSnapshot(
          (s) => { const a = []; s.forEach(d => a.push({ id: d.id, ...d.data() })); setConnections(a); },
          (e) => logDev('connections error', e));
        const u2 = challengesCol.where('members', 'array-contains', uid).onSnapshot(
          (s) => { const a = []; s.forEach(d => a.push({ id: d.id, ...d.data() })); setChallenges(a); },
          (e) => logDev('challenges error', e));
        return () => { u1(); u2(); };
      }, [uid]);

      useEffect(() => {
        if (!acceptedFriendUids.length) {
          if (challengeProgressFriendUid) setChallengeProgressFriendUid('');
          return;
        }
        if (!challengeProgressFriendUid || !acceptedFriendUids.includes(challengeProgressFriendUid)) {
          setChallengeProgressFriendUid(acceptedFriendUids[0]);
        }
      }, [challengeProgressFriendUid, acceptedFriendUids.join('|')]);

      useEffect(() => {
        if (!uid) return;
        const latestWeight = myWeightProgressHistory.length
          ? myWeightProgressHistory[myWeightProgressHistory.length - 1].v
          : null;
        connections
          .filter(c => c.status === 'accepted' && (c.members || []).includes(uid))
          .forEach(c => {
            const current = c.progress?.[uid] || {};
            const currentHistorySignature = JSON.stringify(normalizeWeightHistory(current.weightHistory || []));
            const currentWeight = typeof current.weight === 'number' ? current.weight : null;
            if (currentHistorySignature === myWeightProgressSignature && currentWeight === latestWeight) return;
            connectionRef(c.id).set({
              progress: {
                [uid]: {
                  weight: latestWeight,
                  weightHistory: myWeightProgressHistory,
                  updatedAt: Date.now(),
                },
              },
            }, { merge: true }).catch((e) => logDev('connection progress update error', e));
          });
      }, [uid, connections, myWeightProgressSignature]);

      // Подгружаем публичные профили друзей/соперников (для табло споров).
      useEffect(() => {
        if (!uid) return;
        const others = new Set();
        connections.forEach(c => (c.members || []).forEach(m => { if (m !== uid) others.add(m); }));
        challenges.forEach(c => (c.members || []).forEach(m => { if (m !== uid) others.add(m); }));
        const ids = [...others];
        if (!ids.length) return;
        // Realtime: показатели соперника (вес и т.д.) обновляются у нас вживую,
        // как только он их изменил — без перезагрузки приложения.
        const unsubs = ids.map(id => publicProfileRef(id).onSnapshot(
          d => { if (d.exists) setFriendProfiles(prev => ({ ...prev, [id]: { id, ...d.data() } })); },
          () => {}));
        return () => unsubs.forEach(u => u());
      }, [uid, connections, challenges]);

      // Публикуем ТОЛЬКО имя и код друга (для поиска по коду и подписи друзей).
      // Показатели здоровья (вес, жир, шаги, талия) сюда НЕ кладём — иначе их видит
      // любой авторизованный. Данные спора живут в самом документе спора (см. ниже).
      useEffect(() => {
        if (!uid) return;
        publicProfileRef(uid).set({ uid, friendCode: myFriendCode, displayName: myDisplayName, updatedAt: Date.now() }).catch(() => {});
      }, [uid, myDisplayName]);

      // В каждый спор, где я участник, пишу СВОЙ текущий показатель и тренд ТОЛЬКО по
      // метрике этого спора. Документ спора читают лишь его участники (правила Firestore),
      // поэтому соперник видит только ту метрику, по которой поспорили, и никто посторонний.
      // Завершённые/отменённые споры не трогаем — их live заморожен (это финальный результат).
      useEffect(() => {
        if (!uid || !challenges.length) return;
        challenges.forEach(c => {
          if (!(c.members || []).includes(uid)) return;
          if (c.status === 'finished' || c.status === 'cancelled') return;
          const tp = challengeType(c.type);
          const histKey = challengeHistKey(tp.metric);
          const value = typeof myStatsNow[tp.metric] === 'number' ? myStatsNow[tp.metric] : null;
          const history = histKey ? (myStatsNow[histKey] || []) : [];
          // Пишем ТОЛЬКО при реальном изменении — иначе запись→snapshot→запись зациклятся.
          const cur = c.live && c.live[uid];
          if (cur && cur.value === value && JSON.stringify(cur.history || []) === JSON.stringify(history)) return;
          challengeRef(c.id).set({ live: { [uid]: { value, history, updatedAt: Date.now() } } }, { merge: true }).catch(() => {});
        });
      }, [uid, challenges, dailyLogs, dailySteps, dailyMetrics, dailyExtraActivities, measuredWeight, bodyEntries]);

      // Финализация: активный спор, у которого вышел срок или кто-то уже достиг цели,
      // переводим в статус finished. Победитель считается из замороженных live-значений
      // (клиент меняет только status — сами показатели не переписываем). Любой участник
      // может закрыть спор — статус общий, конфликт записи безопасен (идемпотентно).
      useEffect(() => {
        if (!uid || !challenges.length) return;
        const today = getLocalDateString(new Date());
        challenges.forEach(c => {
          if (!(c.members || []).includes(uid)) return;
          if (shouldFinalizeChallenge({ challenge: c, uid, myStatsNow, today })) {
            challengeRef(c.id).set({ status: 'finished', finishedAt: Date.now() }, { merge: true }).catch(() => {});
          }
        });
      }, [uid, challenges, myStatsNow]);

      // ── Действия с друзьями и спорами ──
      const sendFriendRequest = async () => {
        const code = friendCodeInput.trim().toUpperCase();
        if (!uid || !code) return;
        if (code === myFriendCode) { notify('Это ваш собственный код.'); return; }
        try {
          const snap = await publicProfilesCol.where('friendCode', '==', code).limit(1).get();
          if (snap.empty) { notify('Пользователь с таким кодом не найден. Проверьте код (он появляется после того, как друг откроет приложение).'); return; }
          const them = snap.docs[0].data();
          const theirUid = them.uid || snap.docs[0].id;
          if (theirUid === uid) { notify('Это ваш собственный код.'); return; }
          const connId = [uid, theirUid].sort().join('__');
          await connectionRef(connId).set({ members: [uid, theirUid].sort(), status: 'pending', requestedBy: uid, createdAt: Date.now() }, { merge: true });
          setFriendProfiles(prev => ({ ...prev, [theirUid]: { id: theirUid, ...them } }));
          setFriendCodeInput('');
          notify('Заявка отправлена ' + (them.displayName || 'другу') + '.');
        } catch (e) { notify('Не удалось отправить заявку: ' + e.message); }
      };
      const acceptConnection = (c) => connectionRef(c.id).set({ status: 'accepted' }, { merge: true }).catch(e => notify('Ошибка: ' + e.message));
      const removeConnection = async (c) => { if (await confirmDialog({ message: 'Удалить друга?', confirmLabel: 'Удалить', danger: true })) connectionRef(c.id).delete().catch(e => notify('Ошибка: ' + e.message)); };

      const openChallengeWith = (friendUid) => {
        setChallengeDraft({ friendUid: friendUid || (acceptedFriends[0] ? otherUid(acceptedFriends[0]) : ''), type: 'weight', myTarget: '', friendTarget: '', deadline: getLocalDateString(new Date(Date.now() + 30 * 86400000)) });
        setShowChallengeModal(true);
      };
      // Снимок своей метрики (значение + история) для записи в спор.
      const myChallengeSnapshot = (metric) => {
        const hk = challengeHistKey(metric);
        return {
          value: typeof myStatsNow[metric] === 'number' ? myStatsNow[metric] : null,
          history: hk ? (myStatsNow[hk] || []) : [],
          updatedAt: Date.now(),
        };
      };
      const createChallenge = async () => {
        const { friendUid, type, myTarget, friendTarget, deadline } = challengeDraft;
        if (!uid || !friendUid || myTarget === '' || !deadline) { notify('Заполните соперника, вашу цель и срок.'); return; }
        // Срок строго в будущем — нельзя сегодня/вчера (жёсткая проверка, не только min инпута).
        if (deadline <= getLocalDateString(new Date())) { notify('Срок спора должен быть в будущем — выберите дату от завтра.'); return; }
        const members = [uid, friendUid].sort();
        // Своя цель — обязательна. Цель соперника — лишь предложение: он подтвердит/поменяет её при принятии.
        const targets = { [uid]: Number(myTarget) };
        if (friendTarget !== '') targets[friendUid] = Number(friendTarget);
        const tp0 = challengeType(type);
        // Старт-снимок — ТОЛЬКО метрика спора (не весь профиль, чтобы не светить остальное).
        const start = { [uid]: { [tp0.metric]: typeof myStatsNow[tp0.metric] === 'number' ? myStatsNow[tp0.metric] : null } };
        const live = { [uid]: myChallengeSnapshot(tp0.metric) };
        const ref = challengesCol.doc();
        try {
          await ref.set({ members, createdBy: uid, type, targets, deadline, status: 'pending', acceptedBy: [uid], start, live, createdAt: Date.now() });
          setShowChallengeModal(false);
          notify('Вызов отправлен ' + friendName(friendUid) + '!');
        } catch (e) { notify('Не удалось создать спор: ' + e.message); }
      };
      // Принятие вызова: соперник задаёт СВОЮ цель (по умолчанию — предложенную создателем).
      const openAcceptChallenge = (c) => {
        const proposed = challengeTargetFor(c, uid);
        setAcceptDraft({ challengeId: c.id, myTarget: proposed != null ? String(proposed) : '' });
        setShowAcceptModal(true);
      };
      const confirmAcceptChallenge = async () => {
        const c = challenges.find(x => x.id === acceptDraft.challengeId);
        if (!c) { setShowAcceptModal(false); return; }
        if (acceptDraft.myTarget === '') { notify('Укажите свою цель.'); return; }
        const tp = challengeType(c.type);
        const startVal = typeof myStatsNow[tp.metric] === 'number' ? myStatsNow[tp.metric] : null;
        try {
          await challengeRef(c.id).set({
            status: 'active',
            acceptedBy: firebase.firestore.FieldValue.arrayUnion(uid),
            targets: { [uid]: Number(acceptDraft.myTarget) },
            start: { [uid]: { [tp.metric]: startVal } },
            live: { [uid]: myChallengeSnapshot(tp.metric) },
          }, { merge: true });
          setShowAcceptModal(false);
        } catch (e) { notify('Ошибка: ' + e.message); }
      };
      // Мягкая отмена: активный/ожидающий спор переводим в cancelled (соперник видит статус),
      // а из истории завершённые/отменённые можно удалить окончательно.
      const removeChallenge = async (c) => {
        if (c.status === 'finished' || c.status === 'cancelled') {
          if (await confirmDialog({ message: 'Удалить спор из истории?', confirmLabel: 'Удалить', danger: true })) challengeRef(c.id).delete().catch(e => notify('Ошибка: ' + e.message));
          return;
        }
        if (await confirmDialog({ message: 'Отменить спор? Соперник увидит, что спор отменён.', confirmLabel: 'Отменить спор', danger: true })) {
          challengeRef(c.id).set({ status: 'cancelled', cancelledBy: uid, finishedAt: Date.now() }, { merge: true }).catch(e => notify('Ошибка: ' + e.message));
        }
      };

      // Табло спора и предупреждение о темпе — из чистого модуля utils/challenges.js.
      const challengeStanding = (c) => computeChallengeStanding({ challenge: c, uid, myStatsNow, friendName, today: getLocalDateString(new Date()) });
      const renderChallengeCard = (c) => {
        const st = challengeStanding(c);
        const isInvite = c.status === 'pending' && !(c.acceptedBy || []).includes(uid);
        const isWaiting = c.status === 'pending' && (c.acceptedBy || []).includes(uid);
        const won = st.finished && st.winnerUid === uid && !st.tie;
        const lost = st.finished && st.winnerUid && st.winnerUid !== uid && !st.tie;
        const statusLine = st.cancelled ? 'отменён' : st.finished ? 'завершён' : (st.daysLeft < 0 ? 'подводим итог…' : `осталось ${Math.max(0, st.daysLeft)} дн`);
        const winnerName = st.winnerUid ? (st.rows.find(r => r.uid === st.winnerUid)?.name || 'Соперник') : '';
        return (
          <div key={c.id} className={`card-enter rounded-3xl p-4 border ${st.finished ? 'bg-[#141416] border-zinc-800/60' : 'bg-[#18181b] border-zinc-800/50'} ${st.cancelled ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-zinc-100">{st.tp.label}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">У каждого своя цель · {statusLine}</p>
              </div>
              <button type="button" onClick={() => removeChallenge(c)} className="btn-active text-zinc-700 active:text-red-400 p-1 shrink-0"><IconTrash className="w-4 h-4" /></button>
            </div>
            {st.finished && (
              <div className={`mb-3 rounded-xl px-3 py-2.5 border flex items-center gap-2 ${won ? 'bg-emerald-600/15 border-emerald-600/40 text-emerald-200' : lost ? 'bg-zinc-800/60 border-zinc-700/40 text-zinc-300' : 'bg-sky-500/15 border-sky-400/30 text-sky-100'}`}>
                <IconTrophy className={`w-5 h-5 shrink-0 ${won ? 'text-amber-400' : lost ? 'text-zinc-400' : 'text-sky-300'}`} />
                <span className="text-xs font-black">{st.tie || !st.winnerUid ? 'Ничья — оба молодцы!' : won ? '🏆 Вы победили!' : `Победил ${winnerName}`}</span>
              </div>
            )}
            {st.cancelled && <p className="mb-3 text-[10px] text-zinc-500 text-center">Спор отменён{c.cancelledBy && c.cancelledBy !== uid ? ' соперником' : ''}.</p>}
            <div className="space-y-2">
              {st.rows.map(r => {
                const goodDelta = r.delta != null && r.delta !== 0 && (st.tp.dir === 'down' ? r.delta < 0 : r.delta > 0);
                const highlight = st.finished ? st.winnerUid === r.uid && !st.tie : st.leaderUid === r.uid;
                return (
                <div key={r.uid} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border ${highlight ? 'bg-emerald-600/15 border-emerald-600/40' : 'bg-[#27272a] border-zinc-700/30'}`}>
                  <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 min-w-0 truncate">{highlight && <IconFlame className="w-4 h-4 text-amber-400 shrink-0" />}{r.name}</span>
                  <span className="shrink-0 text-right">
                    <span className={`text-sm font-black ${r.reached ? 'text-emerald-400' : 'text-zinc-200'}`}>{typeof r.value === 'number' ? Math.round(r.value * 10) / 10 : '—'}{r.reached ? ' ✓' : ''}</span>
                    {typeof r.target === 'number' && <span className="text-[10px] text-zinc-500 font-bold"> {st.tp.dir === 'down' ? '→ ≤' : '→ ≥'}{r.target} {st.tp.unit}</span>}
                    {r.delta != null && r.delta !== 0 && <span className={`block text-[9px] font-bold ${goodDelta ? 'text-emerald-400' : 'text-red-400'}`}>{r.delta > 0 ? '▲ +' : '▼ −'}{Math.abs(r.delta)} {st.tp.unit} от старта</span>}
                    {typeof r.start === 'number' && (r.delta == null || r.delta === 0) && <span className="block text-[9px] text-zinc-500">старт {Math.round(r.start * 10) / 10} {st.tp.unit}</span>}
                  </span>
                </div>
                );
              })}
            </div>
            {['weight', 'fat', 'steps', 'waist'].includes(st.tp.key) && st.rows.some(r => (r.history || []).length >= 2) && (
              <div className="mt-3 space-y-2">
                <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Динамика · {st.tp.short.toLowerCase()}</p>
                {st.rows.map(r => {
                  const hist = r.history || [];
                  if (hist.length < 2) return null;
                  return <MiniWeightChart key={r.uid} title={`${r.name} · ${st.tp.short.toLowerCase()}`} data={hist.map(p => p.v)} dates={hist.map(p => { const a = (p.d || '').split('-'); return a.length === 3 ? `${a[2]}.${a[1]}` : p.d; })} color={(st.finished ? st.winnerUid === r.uid : st.leaderUid === r.uid) ? '#34d399' : '#a3e635'} unit={st.tp.unit} positiveIsGood={st.tp.dir === 'up'} />;
                })}
              </div>
            )}
            {isInvite && (
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => openAcceptChallenge(c)} className="btn-active flex-1 bg-emerald-600 text-white rounded-xl p-3 text-xs font-bold">Принять вызов</button>
                <button type="button" onClick={() => removeChallenge(c)} className="btn-active flex-1 bg-zinc-800 text-zinc-400 rounded-xl p-3 text-xs font-bold">Отказаться</button>
              </div>
            )}
            {isWaiting && <p className="text-[10px] text-zinc-500 mt-2 text-center">Ждём, пока соперник примет вызов…</p>}
          </div>
        );
      };
      const challengeSafetyWarning = computeChallengeSafetyWarning({
        type: challengeDraft.type,
        myTarget: challengeDraft.myTarget,
        friendTarget: challengeDraft.friendTarget,
        myCurrent: myStatsNow[challengeType(challengeDraft.type).metric],
        friendCurrent: friendMetricNow(challengeDraft.friendUid, challengeType(challengeDraft.type).metric),
        deadline: challengeDraft.deadline,
        today: getLocalDateString(new Date()),
      });

      // ── ИИ: разбор текста на продукты для дневника ──
      // Ключ названия — набор слов без учёта порядка/регистра: «масло сливочное» == «Сливочное масло».
      const foodNameKey = (name) => getFoodNameWords(name || '').sort().join(' ');
      const findExactFood = (name, sourceFoods = foods) => {
        const key = foodNameKey(name);
        return key ? sourceFoods.find(f => foodNameKey(f.name) === key) || null : null;
      };
      const findFoodForAi = (name, sourceFoods = foods) => {
        const best = findBestFoodMatch(sourceFoods, name, { confidentScore: 900, suggestionsLimit: 3 });
        return {
          match: best.match || findExactFood(name, sourceFoods),
          suggestions: best.suggestions || [],
          score: best.score,
        };
      };
      const makeNutritionDraft = (food) => ({
        calories: String(food?.calories ?? ''),
        protein: String(food?.protein ?? ''),
        fats: String(food?.fats ?? ''),
        carbs: String(food?.carbs ?? ''),
      });
      const parseNutritionDraft = (draft) => {
        const read = (key) => Number.parseFloat(String(draft?.[key] ?? '').replace(',', '.'));
        const values = {
          calories: read('calories'),
          protein: read('protein'),
          fats: read('fats'),
          carbs: read('carbs'),
        };
        const valid = Number.isFinite(values.calories) && values.calories > 0
          && Number.isFinite(values.protein) && values.protein >= 0
          && Number.isFinite(values.fats) && values.fats >= 0
          && Number.isFinite(values.carbs) && values.carbs >= 0;
        return valid ? values : null;
      };
      const saveAiGeneratedFood = (food) => {
        if (!food) return;
        if (isOwner) saveSharedFoods([food, ...sharedFoods]);
        else savePersonalFoods([food, ...personalFoods]);
      };
      const makeMealAiCard = (item, index, sourceFoods) => {
        const found = findFoodForAi(item.name, sourceFoods);
        const initialGrams = item.amount_g === null ? '' : String(item.amount_g);
        if (found.match) {
          return {
            ...item,
            name: found.match.name,
            grams: initialGrams,
            matchedFoodId: found.match.id,
            food: found.match,
            status: 'found',
            statusText: 'Продукт найден в базе',
            added: false,
          };
        }
        if (found.suggestions.length && found.score >= 500) {
          return {
            ...item,
            grams: initialGrams,
            matchedFoodId: null,
            food: null,
            status: 'suggestions',
            statusText: 'Похоже, это один из продуктов',
            suggestions: found.suggestions,
            added: false,
          };
        }
        const estimated = createEstimatedFood(item.name, `ai-${Date.now()}-${index}`);
        if (estimated) {
          return {
            ...item,
            name: estimated.name,
            grams: initialGrams,
            matchedFoodId: null,
            food: estimated,
            status: 'estimated',
            statusText: 'Продукта нет в базе. Я рассчитал примерное КБЖУ на 100 г.',
            createdFood: estimated,
            nutritionDraft: makeNutritionDraft(estimated),
            added: false,
          };
        }
        return {
          ...item,
          grams: initialGrams,
          matchedFoodId: null,
          food: null,
          status: 'manual',
          statusText: 'Уточните продукт или блюдо, чтобы я рассчитал КБЖУ точнее.',
          added: false,
        };
      };
      const runMealAi = async () => {
        const text = mealAiText.trim();
        if (!text) return;
        setMealAiBusy(true); setMealAiError(''); setMealAiItems(null);
        try {
          const result = await parseFoodText(text);
          const workingFoods = [...foods];
          const list = result.items.map((item, index) => makeMealAiCard(item, index, workingFoods));
          if (!list.length) setMealAiError('Уточните продукт или блюдо, например: курица с рисом, омлет, пицца Маргарита.');
          setMealAiItems(list);
        } catch (e) {
          setMealAiError(e.message || AI_UNAVAILABLE_MESSAGE);
        }
        setMealAiBusy(false);
      };
      const updateMealAiItem = (index, patch) => setMealAiItems(arr => (arr || []).map((x, j) => {
        if (j !== index) return x;
        return { ...x, ...(typeof patch === 'function' ? patch(x) : patch) };
      }));
      const selectMealAiSuggestion = (index, food) => {
        updateMealAiItem(index, {
          name: food.name,
          matchedFoodId: food.id,
          food,
          status: 'found',
          statusText: 'Продукт найден в базе',
          suggestions: [],
          needsChoice: false,
        });
      };
      const updateMealAiNutritionDraft = (index, field, value) => {
        updateMealAiItem(index, item => ({
          nutritionDraft: { ...(item.nutritionDraft || makeNutritionDraft(item.createdFood || item.food)), [field]: value },
          nutritionError: '',
        }));
      };
      const editMealAiEstimatedFood = (index) => {
        updateMealAiItem(index, item => ({
          isEditingNutrition: true,
          nutritionDraft: item.nutritionDraft || makeNutritionDraft(item.createdFood || item.food),
          nutritionError: '',
        }));
      };
      const saveMealAiNutritionDraft = (index) => {
        const item = mealAiItems?.[index];
        const values = parseNutritionDraft(item?.nutritionDraft);
        if (!item || !values) {
          updateMealAiItem(index, { nutritionError: 'Введите корректные КБЖУ на 100 г' });
          return;
        }
        const updatedFood = {
          ...(item.createdFood || item.food),
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
        updateMealAiItem(index, {
          food: updatedFood,
          createdFood: updatedFood,
          nutritionDraft: makeNutritionDraft(updatedFood),
          isEditingNutrition: false,
          nutritionError: '',
        });
      };
      const cancelMealAiItem = (index) => {
        setMealAiItems(arr => (arr || []).filter((_, j) => j !== index));
      };
      const addMealAiEstimatedFoodToBase = (index) => {
        const item = mealAiItems?.[index];
        if (!item?.createdFood) return;
        const existing = findFoodForAi(item.createdFood.name).match;
        if (existing) {
          updateMealAiItem(index, {
            name: existing.name,
            matchedFoodId: existing.id,
            food: existing,
            createdFood: null,
            status: 'found',
            statusText: 'Продукт найден в базе',
            addedToBase: true,
            isEditingNutrition: false,
            needsBaseConfirm: false,
          });
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
        updateMealAiItem(index, {
          name: foodToSave.name,
          matchedFoodId: foodToSave.id,
          food: foodToSave,
          createdFood: foodToSave,
          status: 'created',
          statusText: 'Продукт добавлен в базу. Сколько грамм вы съели?',
          addedToBase: true,
          isEditingNutrition: false,
          needsBaseConfirm: false,
        });
      };
      const moveMealAiItemToManualEntry = (item) => {
        setFoodSearch(item.name);
        setSelectedFoodId('');
        setGramsInput(item.grams || '');
        setShowMealAiModal(false);
        setMealAiText('');
        setMealAiItems(null);
        setMealAiError('');
        setTimeout(() => foodSearchRef.current?.focus(), 0);
      };
      const addMealAiItemToDiary = (index) => {
        const item = mealAiItems?.[index];
        if (!item || item.added) return;
        const food = item.matchedFoodId ? (foods.find(f => f.id === item.matchedFoodId) || item.food) : findFoodForAi(item.name).match;
        const grams = evaluateMath(String(item.grams || ''));
        if (item.status === 'suggestions') {
          updateMealAiItem(index, { needsChoice: true });
          return;
        }
        if (item.status === 'estimated' && !item.addedToBase) {
          updateMealAiItem(index, { needsBaseConfirm: true });
          return;
        }
        if (!food) {
          moveMealAiItemToManualEntry(item);
          return;
        }
        if (!Number.isFinite(grams) || grams <= 0) {
          updateMealAiItem(index, { needsWeight: true, portionError: 'Введите вес продукта в граммах' });
          return;
        }
        if (addFoodLog(food, grams)) updateMealAiItem(index, { added: true, needsWeight: false, portionError: '', addedMessage: `${food.name}, ${grams} г добавлено в дневник` });
      };

      // Избранное — в порядке favoriteIds (порядок задаёт сам пользователь).
      const favoriteFoods = favoriteIds.map(id => foods.find(f => f.id === id)).filter(Boolean);
      const favoriteFoodIds = new Set(favoriteFoods.map(food => food.id));
      const regularFoods = foods
        .filter(food => !favoriteFoodIds.has(food.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      const sortedFoods = [
        ...favoriteFoods,
        ...regularFoods,
      ];
      // Поиск работает в обеих строках, но продукт выводится только в одной из них.
      const favoriteMealFoods = foodSearch.trim() ? searchFoodsByName(favoriteFoods, foodSearch, 200) : favoriteFoods;
      const allMealFoods = foodSearch.trim() ? searchFoodsByName(regularFoods, foodSearch, 200) : regularFoods;
      const selectedFood = selectedFoodId ? foods.find(f => f.id === selectedFoodId) : null;
      const sortedBodyEntries = [...bodyEntries].sort((a, b) => b.date.localeCompare(a.date));
      const bodyEntryOptions = [...bodyEntries].sort((a, b) => a.date.localeCompare(b.date));
      const latestBodyEntry = bodyEntryOptions[bodyEntryOptions.length - 1];
      const latestBodyDate = latestBodyEntry?.date;
      const daysSinceBodyEntry = latestBodyDate ? Math.floor((new Date(getLocalDateString(new Date())) - new Date(latestBodyDate)) / 86400000) : 999;
      const showBodyReminder = daysSinceBodyEntry >= 14 && dismissedBodyReminderDate !== getLocalDateString(new Date());
      const compareBodyA = bodyEntries.find(entry => entry.id === compareBodyIds[0]) || bodyEntryOptions[0];
      const compareBodyB = bodyEntries.find(entry => entry.id === compareBodyIds[1]) || bodyEntryOptions[bodyEntryOptions.length - 1];
      const comparePhotoA = compareBodyA?.photos?.[comparePhotoIndexes[0]];
      const comparePhotoB = compareBodyB?.photos?.[comparePhotoIndexes[1]];
      const recentWeightDates = Object.keys(dailyMetrics)
        .filter(date => date <= currentDate && dailyMetrics[date]?.weight)
        .sort()
        .slice(-14);
      const recentWeightValues = recentWeightDates.map(date => dailyMetrics[date]?.weight);
      const recentWeightLabels = recentWeightDates.map(date => date.slice(5));
      const filterProgressDates = (dates) => filterDatesByProgressPeriod(dates, progressChartPeriod, progressToday);
      const metricChartDates = filterProgressDates(Object.keys(dailyMetrics)
        .filter(date => dailyMetrics[date] && Object.keys(dailyMetrics[date]).some(field => dailyMetrics[date][field]))
      );
      const metricChartLabels = metricChartDates.map(date => date.slice(5));
      const metricChartSeries = [
        { key: 'weight', title: 'Вес', unit: 'кг', color: '#a3e635' },
        { key: 'fatPercent', title: 'Жир', unit: '%', color: '#f87171' },
        { key: 'leanMass', title: 'БЖМ', unit: 'кг', color: '#38bdf8' },
        { key: 'fatMass', title: 'Масса жира', unit: 'кг', color: '#f59e0b' },
      ].map(series => ({ ...series, data: metricChartDates.map(date => dailyMetrics[date]?.[series.key]) }));

      const allDatesSet = new Set([
         ...Object.keys(dailyLogs).filter(d => d >= exportStart && d <= exportEnd),
         ...Object.keys(dailyMetrics).filter(d => d >= exportStart && d <= exportEnd),
         ...Object.keys(dailySteps).filter(d => d >= exportStart && d <= exportEnd),
         ...Object.keys(dailyWater).filter(d => d >= exportStart && d <= exportEnd),
         ...Object.keys(dailyExtraActivities).filter(d => d >= exportStart && d <= exportEnd)
      ]);
      const allExportDates = Array.from(allDatesSet).sort((a, b) => new Date(a) - new Date(b));

      const filteredDatesForPdf = Object.keys(dailyLogs)
        .filter(date => date >= exportStart && date <= exportEnd && dailyLogs[date].length > 0)
        .sort((a, b) => new Date(a) - new Date(b));

      let totalPeriodCals = 0;
      let totalPeriodBurned = 0;
      let totalPeriodSteps = 0;
      let totalPeriodExtraActivityCalories = 0;

      filteredDatesForPdf.forEach(date => {
          const dayActiveGoals = getEffectiveGoals(date);
          const bSteps = getUsualSteps(dayActiveGoals.baseSteps);
          const bMaint = dayActiveGoals.maintenance || 2300;
          const dayLogs = dailyLogs[date] || [];
          const dayCals = dayLogs.reduce((s, l) => s + (l.totalCalories || 0), 0);
          const daySteps = dailySteps[date] !== undefined
            ? dailySteps[date]
            : bSteps;
          const dayExtraActivityCalories = sumExtraActivityCalories(dailyExtraActivities[date] || []);
          const dayBurned = bMaint + calculateStepCalorieAdjustment(daySteps, bSteps) + dayExtraActivityCalories;

          totalPeriodCals += dayCals;
          totalPeriodBurned += dayBurned;
          totalPeriodSteps += daySteps;
          totalPeriodExtraActivityCalories += dayExtraActivityCalories;
      });

      const periodDeficit = totalPeriodBurned - totalPeriodCals;
      const avgDeficit = filteredDatesForPdf.length ? Math.round(periodDeficit / filteredDatesForPdf.length) : 0;
      const periodDefText = periodDeficit > 0 ? `Дефицит: +${periodDeficit} ккал 🔥` : `Профицит: ${Math.abs(periodDeficit)} ккал 📈`;

      const allDatesInRange = new Set([ ...filteredDatesForPdf, ...Object.keys(dailyMetrics).filter(d => d >= exportStart && d <= exportEnd), ...Object.keys(dailyExtraActivities).filter(d => d >= exportStart && d <= exportEnd) ]);
      const datesWithMetrics = Array.from(allDatesInRange).sort().filter(date => {
         const m = dailyMetrics[date]; return m && (m.weight || m.fatPercent || m.leanMass || m.fatMass);
      });

      const allWeight = datesWithMetrics.map(d => dailyMetrics[d]?.weight);
      const allFat = datesWithMetrics.map(d => dailyMetrics[d]?.fatPercent);
      const allLean = datesWithMetrics.map(d => dailyMetrics[d]?.leanMass);
      const allFatMass = datesWithMetrics.map(d => dailyMetrics[d]?.fatMass);
      const chartDates = datesWithMetrics.map(d => d.slice(5)); 
      const stepsChartDates = allExportDates;
      const allSteps = stepsChartDates.map(date => {
        const g = getEffectiveGoals(date);
        return dailySteps[date] !== undefined ? dailySteps[date] : getUsualSteps(g.baseSteps);
      });
      const stepChartLabels = stepsChartDates.map(d => d.slice(5));
      const bodyEntriesForPdf = bodyEntries
        .filter(entry => entry.measures && Object.keys(entry.measures).length)
        .sort((a, b) => a.date.localeCompare(b.date));
      const bodyMeasureDates = bodyEntriesForPdf.map(entry => entry.date.slice(5));
      const bodyMeasureColors = ['#8b5cf6', '#3b82f6', '#14b8a6', '#f59e0b', '#a855f7', '#ec4899', '#10b981'];
      const bodyMeasureSeries = BODY_MEASURE_FIELDS.map((field, idx) => ({
        ...field,
        color: bodyMeasureColors[idx % bodyMeasureColors.length],
        data: bodyEntriesForPdf.map(entry => entry.measures?.[field.key])
      })).filter(series => series.data.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).length >= 2);
      const bodyMeasureSummary = BODY_MEASURE_FIELDS.map((field) => {
        const values = bodyEntriesForPdf
          .map(entry => ({ date: entry.date, value: Number(entry.measures?.[field.key]) }))
          .filter(point => !isNaN(point.value) && point.value > 0);
        if (!values.length) return null;
        const first = values[0];
        const last = values[values.length - 1];
        return { ...field, first, last, delta: Math.round((last.value - first.value) * 10) / 10 };
      }).filter(Boolean);
      const progressBodyEntries = bodyEntriesForPdf.filter(entry => filterProgressDates(bodyEntriesForPdf.map(item => item.date)).includes(entry.date));
      const progressBodyMeasureDates = progressBodyEntries.map(entry => entry.date.slice(5));
      const progressBodyMeasureSeries = BODY_MEASURE_FIELDS.map((field, idx) => ({
        ...field,
        color: bodyMeasureColors[idx % bodyMeasureColors.length],
        data: progressBodyEntries.map(entry => entry.measures?.[field.key])
      })).filter(series => series.data.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).length >= 2);

      const getFirstValid = (arr) => arr.find(v => v !== null && v !== undefined && !isNaN(v) && v !== '');
      const getLastValid = (arr) => [...arr].reverse().find(v => v !== null && v !== undefined && !isNaN(v) && v !== '');

      const wStart = getFirstValid(allWeight), wEnd = getLastValid(allWeight);
      const fStart = getFirstValid(allFat), fEnd = getLastValid(allFat);
      const lStart = getFirstValid(allLean), lEnd = getLastValid(allLean);
      const fmStart = getFirstValid(allFatMass), fmEnd = getLastValid(allFatMass);

      const hasBodyData = wStart !== undefined || fStart !== undefined || lStart !== undefined || fmStart !== undefined;
      const hasUnsavedGoals = JSON.stringify(goals) !== JSON.stringify(draftGoals);

      // --- Аналитика динамики: скользящее среднее веса -> скорость и фактический TDEE ---
      const smoothedWeight = movingAverage(allWeight, 7);
      let wSmoothStartIdx = -1, wSmoothEndIdx = -1;
      smoothedWeight.forEach((v, i) => {
        if (v !== null) { if (wSmoothStartIdx === -1) wSmoothStartIdx = i; wSmoothEndIdx = i; }
      });
      let weeklyRate = null, tdeeReal = null, daysBetweenWeigh = 0, deltaSmoothW = null;
      if (wSmoothStartIdx !== -1 && wSmoothEndIdx > wSmoothStartIdx) {
        const dStart = datesWithMetrics[wSmoothStartIdx];
        const dEnd = datesWithMetrics[wSmoothEndIdx];
        daysBetweenWeigh = Math.round((new Date(dEnd) - new Date(dStart)) / 86400000);
        deltaSmoothW = Math.round((smoothedWeight[wSmoothEndIdx] - smoothedWeight[wSmoothStartIdx]) * 100) / 100;
        if (daysBetweenWeigh >= 1) {
          weeklyRate = Math.round((deltaSmoothW / daysBetweenWeigh) * 7 * 100) / 100;
          const avgIntake = filteredDatesForPdf.length ? totalPeriodCals / filteredDatesForPdf.length : 0;
          if (avgIntake > 0) tdeeReal = Math.round(avgIntake - (deltaSmoothW * 7700) / daysBetweenWeigh);
        }
      }
      // Модельный расход = средний дневной TDEE за период с логами, без бонусов за шаги.
      const modelTdee = filteredDatesForPdf.length ? Math.round(totalPeriodBurned / filteredDatesForPdf.length) : modelMaintenance;
      const tdeeDiff = tdeeReal !== null ? tdeeReal - modelTdee : 0;
      const workoutCount = allExportDates.filter(d => dailyWorkouts[d]).length;

      // --- Прогноз до целевого % жира (по сглаженному жиру) ---
      const targetFat = Number(goals.targetFat) || 12;
      const smoothedFat = movingAverage(allFat, 7);
      let fSi = -1, fEi = -1;
      smoothedFat.forEach((v, i) => { if (v !== null) { if (fSi === -1) fSi = i; fEi = i; } });
      let fatWeeklyRate = null, projectionDate = null, daysToGoal = null;
      const latestSmoothedFat = fEi !== -1 ? smoothedFat[fEi] : null;
      if (fSi !== -1 && fEi > fSi) {
        const days = Math.round((new Date(datesWithMetrics[fEi]) - new Date(datesWithMetrics[fSi])) / 86400000);
        const dF = smoothedFat[fEi] - smoothedFat[fSi];
        if (days >= 1) {
          fatWeeklyRate = Math.round((dF / days) * 7 * 100) / 100;
          if (fatWeeklyRate < 0 && latestSmoothedFat > targetFat) {
            daysToGoal = Math.round(((latestSmoothedFat - targetFat) / Math.abs(fatWeeklyRate)) * 7);
            const proj = new Date(); proj.setDate(proj.getDate() + daysToGoal);
            projectionDate = getLocalDateString(proj);
          }
        }
      }

      // --- Адхеренс и стрик ---
      const rangeDayCount = Math.max(1, Math.round((new Date(exportEnd) - new Date(exportStart)) / 86400000) + 1);
      const adherence = Math.round((filteredDatesForPdf.length / rangeDayCount) * 100);
      let streak = 0;
      {
        const d = new Date();
        if (!(dailyLogs[getLocalDateString(d)] || []).length) d.setDate(d.getDate() - 1);
        while ((dailyLogs[getLocalDateString(d)] || []).length) { streak++; d.setDate(d.getDate() - 1); }
      }

      // --- Недельная сводка (неделя с понедельника) ---
      const weekKey = (dateStr) => {
        const d = new Date(dateStr);
        const day = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - day);
        return getLocalDateString(d);
      };
      const weeksMap = {};
      allExportDates.forEach(date => {
        const wk = weekKey(date);
        if (!weeksMap[wk]) weeksMap[wk] = { cals: 0, deficit: 0, logged: 0, weights: [] };
        const g = getEffectiveGoals(date);
        const bSteps = getUsualSteps(g.baseSteps), bMaint = g.maintenance || 2300;
        const logs = dailyLogs[date] || [];
        if (logs.length) {
          const c = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
          const steps = dailySteps[date] !== undefined ? dailySteps[date] : bSteps;
          const burned = bMaint + calculateStepCalorieAdjustment(steps, bSteps) + sumExtraActivityCalories(dailyExtraActivities[date] || []);
          weeksMap[wk].cals += c; weeksMap[wk].deficit += (burned - c); weeksMap[wk].logged += 1;
        }
        const w = dailyMetrics[date]?.weight;
        if (w) weeksMap[wk].weights.push(w);
      });
      const weeklySummary = Object.keys(weeksMap).sort().map(wk => {
        const w = weeksMap[wk];
        const wAvg = w.weights.length ? Math.round((w.weights.reduce((a, b) => a + b, 0) / w.weights.length) * 10) / 10 : null;
        return { week: wk, avgCals: w.logged ? Math.round(w.cals / w.logged) : null, avgDef: w.logged ? Math.round(w.deficit / w.logged) : null, wAvg, logged: w.logged };
      });
      weeklySummary.forEach((wk, i) => {
        wk.dW = (i > 0 && wk.wAvg !== null && weeklySummary[i - 1].wAvg !== null) ? Math.round((wk.wAvg - weeklySummary[i - 1].wAvg) * 10) / 10 : null;
      });

      // --- Инсайты для PDF: лучшие дни, шаги, тренировки, недельный тренд ---
      const dayStats = filteredDatesForPdf.map(date => {
        const g = getEffectiveGoals(date);
        const bSteps = getUsualSteps(g.baseSteps);
        const bMaint = g.maintenance || 2300;
        const logs = dailyLogs[date] || [];
        const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
        const steps = dailySteps[date] !== undefined ? dailySteps[date] : bSteps;
        const extraActivityCaloriesForDay = sumExtraActivityCalories(dailyExtraActivities[date] || []);
        const burned = bMaint + calculateStepCalorieAdjustment(steps, bSteps) + extraActivityCaloriesForDay;
        return { date, cals, steps, burned, extraActivityCalories: extraActivityCaloriesForDay, deficit: burned - cals, workout: !!dailyWorkouts[date] };
      });
      const bestDeficitDays = [...dayStats].sort((a, b) => b.deficit - a.deficit).slice(0, 3);
      const worstBalanceDays = [...dayStats].sort((a, b) => a.deficit - b.deficit).slice(0, 3);
      const avgPeriodSteps = dayStats.length ? Math.round(dayStats.reduce((s, d) => s + d.steps, 0) / dayStats.length) : 0;
      const avgOf = (arr, field) => arr.length ? Math.round(arr.reduce((s, d) => s + d[field], 0) / arr.length) : null;
      const highStepDays = dayStats.filter(d => d.steps >= avgPeriodSteps);
      const lowStepDays = dayStats.filter(d => d.steps < avgPeriodSteps);
      const highStepAvgDeficit = avgOf(highStepDays, 'deficit');
      const lowStepAvgDeficit = avgOf(lowStepDays, 'deficit');
      const stepDeficitDelta = highStepAvgDeficit !== null && lowStepAvgDeficit !== null ? highStepAvgDeficit - lowStepAvgDeficit : null;
      const workoutDays = dayStats.filter(d => d.workout);
      const restDays = dayStats.filter(d => !d.workout);
      const workoutAvgDeficit = avgOf(workoutDays, 'deficit');
      const restAvgDeficit = avgOf(restDays, 'deficit');
      const workoutAvgCals = avgOf(workoutDays, 'cals');
      const restAvgCals = avgOf(restDays, 'cals');
      const workoutAvgSteps = avgOf(workoutDays, 'steps');
      const restAvgSteps = avgOf(restDays, 'steps');
      const latestWeek = weeklySummary.length ? weeklySummary[weeklySummary.length - 1] : null;
      const latestWeekTrend = latestWeek?.dW === null || latestWeek?.dW === undefined
        ? null
        : latestWeek.dW <= -0.2 ? 'вниз'
        : latestWeek.dW >= 0.2 ? 'вверх'
        : 'стоит';
      const projectionConfidence = (() => {
        if (!projectionDate) return null;
        if (datesWithMetrics.length >= 14 && daysBetweenWeigh >= 14 && fatWeeklyRate !== null && Math.abs(fatWeeklyRate) >= 0.15) return 'высокая';
        if (datesWithMetrics.length >= 7 && daysBetweenWeigh >= 7) return 'средняя';
        return 'низкая';
      })();
      const projectionConfidenceText = projectionConfidence === 'высокая'
        ? 'данных достаточно: 14+ дней и устойчивый тренд по жиру.'
        : projectionConfidence === 'средняя'
          ? 'данных уже хватает для ориентира, но тренд еще может шуметь.'
          : projectionConfidence === 'низкая'
            ? 'данных мало, воспринимай дату как грубую прикидку.'
            : '';

      // --- Белок на кг массы тела (по последнему известному весу) ---
      const latestWeight = (() => {
        const ds = Object.keys(dailyMetrics).filter(d => dailyMetrics[d]?.weight).sort();
        return ds.length ? dailyMetrics[ds[ds.length - 1]].weight : null;
      })();
      const proteinPerKg = latestWeight ? Math.round((totalPro / latestWeight) * 10) / 10 : null;
      const proteinGoalPerKg = latestWeight ? Math.round(((activeGoals.protein || 0) / latestWeight) * 10) / 10 : null;

      // --- Избранные продукты для быстрого добавления ---
      const activeTheme = normalizeThemeKey(settings.theme);
      const isNeonRainTheme = activeTheme === 'dark-neon-rain';
      const activeTabTitle = TAB_TITLES[activeTab] || 'Дневник';
      const drawerItems = [
        { key: 'profile', label: 'Профиль', icon: IconUser, onClick: () => goToTabFromDrawer('profile'), active: activeTab === 'profile' },
        { key: 'social', label: 'Друзья', icon: IconUsers, onClick: () => goToTabFromDrawer('social'), active: activeTab === 'social', badge: incomingRequests.length },
        { key: 'export', label: 'Экспорт в PDF', icon: IconDownload, onClick: openExportFromDrawer, active: false },
        { key: 'settings', label: 'Настройки', icon: IconSliders, onClick: () => goToTabFromDrawer('settings'), active: activeTab === 'settings' },
        { key: 'about', label: 'О приложении', icon: IconInfo, onClick: () => goToTabFromDrawer('about'), active: activeTab === 'about' },
        { key: 'support', label: 'Поддержка', icon: IconHelpCircle, onClick: () => goToTabFromDrawer('support'), active: activeTab === 'support' },
      ];
      const extraActivitySelectedType = getExtraActivityType(extraActivityDraft.type);
      const extraActivityDraftValidation = validateExtraActivityCalories(extraActivityDraft.calories);
      const extraActivityWarning = extraActivityDraftValidation.ok ? extraActivityDraftValidation.warning : '';
      const UpdateCallout = ({ blocking = false }) => (
        <div className={`${blocking ? 'min-h-[100dvh] w-full px-6 flex items-center justify-center' : 'card-enter mb-4'} bg-[#09090b]`}>
          <div className={`w-full ${blocking ? 'max-w-sm' : ''} bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4`}>
            <div className="w-12 h-12 rounded-2xl bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center"><IconSparkles className="w-6 h-6 text-emerald-400" /></div>
            <div>
              <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{appUpdate?.message || 'Доступно обновление'}</h2>
              <p className="text-sm text-zinc-400 leading-relaxed mt-2">
                {blocking ? 'Эта версия больше не поддерживается. Обновите приложение, чтобы продолжить.' : 'Можно обновить сейчас — приложение перезагрузится и подтянет свежую версию.'}
              </p>
              {appUpdate?.version && <p className="text-[11px] text-zinc-600 mt-2">Новая версия: {appUpdate.version}</p>}
            </div>
            <button type="button" onClick={applyAppUpdate} disabled={isApplyingUpdate} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60">
              <IconDownload className="w-5 h-5" /> {isApplyingUpdate ? 'Обновляем…' : 'Обновить приложение'}
            </button>
          </div>
        </div>
      );

      if (appUpdate?.mandatory) {
        return <UpdateCallout blocking />;
      }

      if (!authReady) {
        return (
          <div className="flex h-[100dvh] items-center justify-center bg-[#09090b] flex-col gap-4">
            <div className="loader"></div>
            <p className="text-zinc-500 font-bold text-sm tracking-widest uppercase">Подключение...</p>
          </div>
        );
      }

      if (!uid) {
        return (
          <div
            className="app-shell flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#09090b] text-zinc-100 items-center justify-center px-8 relative overflow-hidden"
            onFocusCapture={handleEditableFieldFocus}
          >
            <div className="w-full">
              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-700/40 flex items-center justify-center mb-4"><IconBowl className="w-8 h-8 text-amber-400" /></div>
                <h1 className="text-2xl font-bold">Трекер диеты</h1>
                <p className="text-zinc-500 text-sm mt-1">{authMode === 'register' ? 'Создание аккаунта' : 'Вход в аккаунт'}</p>
              </div>
              <div className="space-y-3 card-enter">
                <input type="email" autoCapitalize="none" autoCorrect="off" placeholder="E-mail" className="w-full bg-[#18181b] rounded-2xl p-4 outline-none text-zinc-200 border border-zinc-800 focus:border-emerald-500" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
                <input type="password" placeholder="Пароль (минимум 6 символов)" className="w-full bg-[#18181b] rounded-2xl p-4 outline-none text-zinc-200 border border-zinc-800 focus:border-emerald-500" value={authPass} onChange={(e) => setAuthPass(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doAuth(); }} />
                {authError && <p className="text-red-400 text-xs px-1">{authError}</p>}
                {authInfo && <p className="text-emerald-400 text-xs px-1 leading-relaxed">{authInfo}</p>}
                <button onClick={doAuth} disabled={authBusy} className="btn-active w-full bg-emerald-600 text-white rounded-2xl p-4 font-bold transition-all disabled:opacity-50">{authBusy ? '...' : (authMode === 'register' ? 'Зарегистрироваться' : 'Войти')}</button>
                {authMode === 'login' && <button onClick={doPasswordReset} disabled={authBusy} className="btn-active w-full text-zinc-500 text-xs p-1">Забыли пароль? Отправить письмо для сброса</button>}
                <button onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setAuthError(''); setAuthInfo(''); }} className="btn-active w-full text-zinc-400 text-sm p-2">{authMode === 'register' ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button>
                <p className="text-zinc-600 text-[10px] text-center px-2 mt-1">Расчёты КБЖУ и ИИ-оценки — ориентировочные и не являются медицинской рекомендацией.</p>
              </div>
            </div>
          </div>
        );
      }

      if (isLoading) {
        return (
          <div className="flex h-[100dvh] items-center justify-center bg-[#09090b] flex-col gap-4">
            <div className="loader"></div>
            <p className="text-zinc-500 font-bold text-sm tracking-widest uppercase">Загрузка...</p>
          </div>
        );
      }

      const ExportReport = () => (
          <div className="report-modern" style={{ fontFamily: 'sans-serif', maxWidth: '980px', margin: '0 auto', fontSize: '12px', background: 'white', color: 'black' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '15px', textAlign: 'center' }}>Отчет по питанию ({exportStart} — {exportEnd})</h1>
          
          {allExportDates.length > 0 && (
            <div style={{ backgroundColor: '#f4f4f5', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0' }}>Итоги за период:</h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                 <div style={{ minWidth: '200px' }}>
                    <p><strong>Суммарно съедено:</strong> {totalPeriodCals} ккал</p>
                    <p><strong>Суммарно потрачено:</strong> {totalPeriodBurned} ккал</p>
                    {totalPeriodExtraActivityCalories > 0 && <p><strong>Доп. активность:</strong> +{totalPeriodExtraActivityCalories} ккал</p>}
                    <p><strong>Пройдено шагов:</strong> {totalPeriodSteps}</p>
                    {avgPeriodSteps > 0 && <p><strong>Средние шаги:</strong> {avgPeriodSteps} / день</p>}
                 </div>
                 <div style={{ minWidth: '200px' }}>
                    <p><strong>Баланс ККАЛ:</strong> {periodDefText}</p>
                    <p style={{ color: '#555' }}><em>(В среднем {avgDeficit} ккал/день)</em></p>
                 </div>
              </div>
            </div>
          )}

          {allExportDates.length > 0 && (
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0', color: '#1e40af' }}>Дисциплина и прогноз:</h2>
              <p><strong>Дней с записями:</strong> {filteredDatesForPdf.length} из {rangeDayCount} ({adherence}%)</p>
              <p><strong>Текущий стрик:</strong> {streak} дн. подряд</p>
              {latestWeekTrend && <p><strong>Тренд веса за последнюю неделю:</strong> {latestWeekTrend} ({latestWeek.dW > 0 ? '+' : ''}{latestWeek.dW} кг к прошлой неделе)</p>}
              {projectionDate
                ? <p><strong>Прогноз до {targetFat}% жира:</strong> ~{projectionDate} (≈{Math.round(daysToGoal / 7)} нед.) <span style={{ color: '#555' }}>— при темпе {fatWeeklyRate} %/нед</span></p>
                : (latestSmoothedFat !== null && latestSmoothedFat <= targetFat
                    ? <p><strong>Цель по жиру достигнута:</strong> {latestSmoothedFat}% ≤ {targetFat}% 🎉</p>
                    : <p style={{ color: '#555' }}><em>Прогноз по жиру появится, когда жир пойдёт вниз по тренду (нужно 14+ дней замеров).</em></p>)}
              {projectionDate && <p style={{ color: '#555', fontSize: '11px' }}><em>Доверие к прогнозу: {projectionConfidence}. {projectionConfidenceText} Грубая линейная оценка — у тела темп нелинеен и к цели замедлится.</em></p>}
            </div>
          )}

          {dayStats.length > 0 && (
            <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fed7aa', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#9a3412' }}>Лучшие и сложные дни:</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '12px', margin: '0 0 5px 0', color: '#166534' }}>Лучший дефицит</h3>
                  {bestDeficitDays.map(d => (
                    <p key={d.date} style={{ margin: '3px 0' }}><strong>{d.date}:</strong> {d.deficit > 0 ? '+' : ''}{d.deficit} ккал, {d.steps} шагов{d.workout ? ' · тренировка' : ''}</p>
                  ))}
                </div>
                <div>
                  <h3 style={{ fontSize: '12px', margin: '0 0 5px 0', color: '#991b1b' }}>Самый слабый баланс</h3>
                  {worstBalanceDays.map(d => (
                    <p key={d.date} style={{ margin: '3px 0' }}><strong>{d.date}:</strong> {d.deficit > 0 ? '+' : ''}{d.deficit} ккал, {d.cals} ккал еды{d.workout ? ' · тренировка' : ''}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {dayStats.length > 1 && (
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#334155' }}>Что помогало:</h2>
              <p><strong>Шаги и баланс:</strong> дни выше среднего по шагам давали в среднем {highStepAvgDeficit !== null ? `${highStepAvgDeficit > 0 ? '+' : ''}${highStepAvgDeficit}` : '—'} ккал баланса, ниже среднего — {lowStepAvgDeficit !== null ? `${lowStepAvgDeficit > 0 ? '+' : ''}${lowStepAvgDeficit}` : '—'} ккал.</p>
              {stepDeficitDelta !== null && <p style={{ color: stepDeficitDelta > 0 ? '#166534' : '#991b1b' }}><em>Разница между более и менее активными днями: {stepDeficitDelta > 0 ? '+' : ''}{stepDeficitDelta} ккал/день. Шаги добавляются к расходу отдельной строкой.</em></p>}
              {(workoutDays.length > 0 || restDays.length > 0) && (
                <table style={{ borderCollapse: 'collapse', textAlign: 'center', width: '100%', fontSize: '12px', marginTop: '8px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#e2e8f0' }}>
                      <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Тип дня</th>
                      <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Дней</th>
                      <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. дефицит</th>
                      <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. ккал</th>
                      <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. шаги</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px' }}>С тренировкой</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{workoutDays.length}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{workoutAvgDeficit !== null ? `${workoutAvgDeficit > 0 ? '+' : ''}${workoutAvgDeficit}` : '—'}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{workoutAvgCals !== null ? workoutAvgCals : '—'}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{workoutAvgSteps !== null ? workoutAvgSteps : '—'}</td>
                    </tr>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px' }}>Без тренировки</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{restDays.length}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{restAvgDeficit !== null ? `${restAvgDeficit > 0 ? '+' : ''}${restAvgDeficit}` : '—'}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{restAvgCals !== null ? restAvgCals : '—'}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{restAvgSteps !== null ? restAvgSteps : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}

          {(tdeeReal !== null || weeklyRate !== null) && (
            <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 5px 0', color: '#065f46' }}>Аналитика динамики (по сглаженному весу):</h2>
              {weeklyRate !== null && <p><strong>Скорость изменения веса:</strong> {weeklyRate > 0 ? '+' : ''}{weeklyRate} кг/нед {weeklyRate < 0 ? '📉' : weeklyRate > 0 ? '📈' : ''}</p>}
              {tdeeReal !== null && <p><strong>Реальный расход по весам (TDEE):</strong> ~{tdeeReal} ккал/день <span style={{ color: '#555' }}>(уже включает ходьбу)</span></p>}
              {tdeeReal !== null && <p><strong>Модельный расход (TDEE):</strong> ~{modelTdee} ккал/день</p>}
              {tdeeReal !== null && (
                <p style={{ color: Math.abs(tdeeDiff) > 150 ? '#b45309' : '#555' }}><em>
                  Расхождение модели с реальностью: {tdeeDiff > 0 ? '+' : ''}{tdeeDiff} ккал/день. {
                    tdeeDiff > 150 ? `Вес уходит быстрее, чем считает модель — базу нормы можно поднять примерно на ${tdeeDiff} ккал (либо это остаточная вода в начале периода).`
                    : tdeeDiff < -150 ? 'Вес уходит медленнее модели — вероятна недооценка съеденного или завышенная норма.'
                    : 'Модель приложения близка к реальности.'
                  }
                </em></p>
              )}
              {daysBetweenWeigh < 14 && <p style={{ color: '#b45309', fontSize: '11px' }}><em>⚠️ Замеры веса всего за {daysBetweenWeigh} дн. Для надёжного TDEE нужно 14+ дней данных.</em></p>}
              {workoutCount > 0 && <p><strong>Силовых тренировок за период:</strong> {workoutCount}</p>}
            </div>
          )}

          {weeklySummary.length > 1 && (
            <div style={{ marginBottom: '15px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0 5px 0', color: '#005f73' }}>Недельная сводка:</h3>
              <table style={{ borderCollapse: 'collapse', textAlign: 'center', width: '100%', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e2e8f0' }}>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Неделя с</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Дней</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. ккал</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. дефицит</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Ср. вес</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Δ вес</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklySummary.map(wk => (
                    <tr key={wk.week}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px' }}>{wk.week.slice(5)}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{wk.logged}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{wk.avgCals !== null ? wk.avgCals : '—'}</td>
                      <td style={{ border: '1px solid #cbd5e1', color: wk.avgDef > 0 ? '#10b981' : '#ef4444' }}>{wk.avgDef !== null ? (wk.avgDef > 0 ? '+' : '') + wk.avgDef : '—'}</td>
                      <td style={{ border: '1px solid #cbd5e1' }}>{wk.wAvg !== null ? wk.wAvg : '—'}</td>
                      <td style={{ border: '1px solid #cbd5e1', fontWeight: 'bold', color: wk.dW === null ? '#555' : (wk.dW > 0 ? '#ef4444' : wk.dW < 0 ? '#10b981' : '#555') }}>{wk.dW === null ? '—' : (wk.dW > 0 ? '+' : '') + wk.dW}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasBodyData && (
            <div style={{ marginBottom: '15px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '10px 0 5px 0', color: '#005f73' }}>Изменения по телу:</h3>
              <table style={{ borderCollapse: 'collapse', textAlign: 'center', width: '100%' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e2e8f0' }}>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Показатель</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Начало</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Конец</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {wStart !== undefined && wEnd !== undefined && <tr><td style={{border:'1px solid #cbd5e1', padding:'5px'}}>Вес (кг)</td><td style={{border:'1px solid #cbd5e1'}}>{wStart}</td><td style={{border:'1px solid #cbd5e1'}}>{wEnd}</td><td style={{border:'1px solid #cbd5e1', fontWeight:'bold', color: wEnd - wStart > 0 ? '#ef4444' : '#10b981'}}>{(wEnd-wStart).toFixed(1)}</td></tr>}
                  {fStart !== undefined && fEnd !== undefined && <tr><td style={{border:'1px solid #cbd5e1', padding:'5px'}}>Жир (%)</td><td style={{border:'1px solid #cbd5e1'}}>{fStart}</td><td style={{border:'1px solid #cbd5e1'}}>{fEnd}</td><td style={{border:'1px solid #cbd5e1', fontWeight:'bold', color: fEnd - fStart > 0 ? '#ef4444' : '#10b981'}}>{(fEnd-fStart).toFixed(1)}</td></tr>}
                  {lStart !== undefined && lEnd !== undefined && <tr><td style={{border:'1px solid #cbd5e1', padding:'5px'}}>БЖМ (кг)</td><td style={{border:'1px solid #cbd5e1'}}>{lStart}</td><td style={{border:'1px solid #cbd5e1'}}>{lEnd}</td><td style={{border:'1px solid #cbd5e1', fontWeight:'bold', color: lEnd - lStart > 0 ? '#10b981' : '#ef4444'}}>{(lEnd-lStart).toFixed(1)}</td></tr>}
                  {fmStart !== undefined && fmEnd !== undefined && <tr><td style={{border:'1px solid #cbd5e1', padding:'5px'}}>Масса жира (кг)</td><td style={{border:'1px solid #cbd5e1'}}>{fmStart}</td><td style={{border:'1px solid #cbd5e1'}}>{fmEnd}</td><td style={{border:'1px solid #cbd5e1', fontWeight:'bold', color: fmEnd - fmStart > 0 ? '#ef4444' : '#10b981'}}>{(fmEnd-fmStart).toFixed(1)}</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {bodyMeasureSummary.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '10px 0 8px 0', color: '#005f73' }}>Замеры тела:</h3>
              <table style={{ borderCollapse: 'collapse', textAlign: 'center', width: '100%', fontSize: '12px', marginBottom: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e2e8f0' }}>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Показатель</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Начало</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Конец</th>
                    <th style={{ padding: '5px', border: '1px solid #cbd5e1' }}>Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {bodyMeasureSummary.map(item => {
                    const decreaseGood = !['bicepsRelaxed', 'bicepsFlexed'].includes(item.key);
                    const good = item.delta === 0 ? null : decreaseGood ? item.delta < 0 : item.delta > 0;
                    return (
                      <tr key={item.key}>
                        <td style={{ border: '1px solid #cbd5e1', padding: '5px', textAlign: 'left' }}>{item.label}</td>
                        <td style={{ border: '1px solid #cbd5e1' }}>{item.first.value} см <span style={{ color: '#64748b' }}>({item.first.date.slice(5)})</span></td>
                        <td style={{ border: '1px solid #cbd5e1' }}>{item.last.value} см <span style={{ color: '#64748b' }}>({item.last.date.slice(5)})</span></td>
                        <td style={{ border: '1px solid #cbd5e1', fontWeight: 'bold', color: good === null ? '#555' : good ? '#10b981' : '#ef4444' }}>{item.delta > 0 ? '+' : ''}{item.delta} см</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {bodyMeasureSeries.length > 0 && (
                <div className="grid grid-cols-1 print:grid-cols-2 sm:grid-cols-2 gap-4 w-full">
                  {bodyMeasureSeries.map(series => (
                    <ProgressChart key={series.key} title={`${series.label} (см)`} data={series.data} dates={bodyMeasureDates} color={series.color} showAverage={false} />
                  ))}
                </div>
              )}
            </div>
          )}

          {datesWithMetrics.length > 1 && (
            <div style={{ marginBottom: '20px' }}>
               <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 10px 0', color: '#005f73' }}>Графики прогресса:</h3>
               {/* Адаптивная сетка графиков: 1 колонка на мобильном, 2 при печати */}
               <div className="grid grid-cols-1 print:grid-cols-2 sm:grid-cols-2 gap-4 w-full">
                  <ProgressChart title="Вес (кг)" data={allWeight} dates={chartDates} color="#d8b46d" showAverage={true} />
                  <ProgressChart title="Жир (%)" data={allFat} dates={chartDates} color="#ef4444" />
                  <ProgressChart title="БЖМ (кг)" data={allLean} dates={chartDates} color="#83b3ae" />
                  <ProgressChart title="Масса жира (кг)" data={allFatMass} dates={chartDates} color="#f59e0b" />
               </div>
            </div>
          )}

          {allSteps.length > 1 && (
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', margin: '0 0 10px 0', color: '#005f73' }}>Шаги и тренд:</h3>
              <div className="grid grid-cols-1 gap-4 w-full">
                <ProgressChart title="Шаги за день" data={allSteps} dates={stepChartLabels} color="#10b981" showAverage={true} averageMode="period" />
              </div>
            </div>
          )}

          {allExportDates.map(date => {
              const dayActiveGoals = getEffectiveGoals(date);
              const dayLogs = dailyLogs[date] || [];
              if (dayLogs.length === 0 && !dailyMetrics[date] && dailySteps[date] === undefined && dailyWater[date] === undefined && !(dailyExtraActivities[date] || []).length) return null;

              const dayCals = dayLogs.reduce((s, l) => s + (l.totalCalories || 0), 0);
              const dayPro = dayLogs.reduce((s, l) => s + (l.totalProtein || 0), 0);
              const dayFat = dayLogs.reduce((s, l) => s + (l.totalFats || 0), 0);
              const dayCarb = dayLogs.reduce((s, l) => s + (l.totalCarbs || 0), 0);
              const dayBaseSteps = getUsualSteps(dayActiveGoals.baseSteps);
              const daySteps = dailySteps[date] !== undefined ? dailySteps[date] : dayBaseSteps;
              const dayExtraActivityCalories = sumExtraActivityCalories(dailyExtraActivities[date] || []);
              const dayBurned = (dayActiveGoals.maintenance || 2300) + calculateStepCalorieAdjustment(daySteps, dayBaseSteps) + dayExtraActivityCalories;
              const m = dailyMetrics[date] || {};
              const mText = [ m.weight ? `Вес: ${m.weight} кг` : '', m.fatPercent ? `Жир: ${m.fatPercent}%` : '', m.leanMass ? `БЖМ: ${m.leanMass} кг` : '', m.fatMass ? `Жир: ${m.fatMass} кг` : '' ].filter(Boolean).join(' | ');

              return (
                <div key={date} style={{ marginBottom: '15px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981', margin: '0 0 4px 0' }}>{date}</h2>
                  <p style={{ fontSize: '11px', marginBottom: '5px' }}>
                    Шаги: {dailySteps[date] || '—'} | Доп. активность: {dayExtraActivityCalories || '—'} ккал | <strong>Дефицит: {dayBurned - dayCals} ккал</strong>{dailyWorkouts[date] ? ' | Силовая тренировка' : ''}{dailyWater[date] !== undefined ? ` | Вода: ${dailyWater[date]} мл` : ''}<br/>
                    {dayLogs.length > 0 && <span>Б: {Math.round(dayPro)}г | Ж: {Math.round(dayFat)}г | У: {Math.round(dayCarb)}г</span>}
                    {mText && <span><br/><span style={{ color: '#005f73' }}>Тело: {mText}</span></span>}
                  </p>

                  {dayLogs.length > 0 && (
                    <table style={{ fontSize: '10px', width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ backgroundColor: '#f9fafb' }}>
                        <tr>
                          <th style={{ border: '1px solid #e4e4e7', padding: '4px', textAlign: 'left', width: '40%' }}>Продукт</th>
                          <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '15%' }}>Вес (г)</th>
                          <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '15%' }}>Ккал</th>
                          <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '10%' }}>Б</th>
                          <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '10%' }}>Ж</th>
                          <th style={{ border: '1px solid #e4e4e7', padding: '4px', width: '10%' }}>У</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayLogs.map((log, i) => (
                          <tr key={i}>
                            <td style={{ border: '1px solid #e4e4e7', padding: '3px' }}>{foods.find(f => f.id === log.foodId)?.name || '—'}</td>
                            <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{log.grams}</td>
                            <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{Math.round(log.totalCalories)}</td>
                            <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{Math.round(log.totalProtein)}</td>
                            <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{Math.round(log.totalFats)}</td>
                            <td style={{ border: '1px solid #e4e4e7', padding: '3px', textAlign: 'center' }}>{Math.round(log.totalCarbs)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
          })}
        </div>
      );

      if (showReportView) {
        return (
          <div className="report-view" style={{ background: 'var(--bg-deep)', color: 'var(--text)', height: '100lvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '8px', paddingTop: 'max(10px, calc(env(safe-area-inset-top) + 4px))', position: 'relative', zIndex: 2 }}>
            <div className="print-hide" style={{ position: 'sticky', top: '6px', zIndex: 5, display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '22px', padding: '10px', background: 'var(--header-bg)', border: '1px solid var(--line)', borderRadius: '14px', boxShadow: 'none', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
               <button 
                 onClick={() => { setIsPrinting(false); setShowReportView(false); }} 
                 className="btn-active" 
                 style={{ padding: '12px 18px', background: 'var(--surface-strong)', borderRadius: '12px', fontWeight: 'bold', color: 'var(--text)', border: '1px solid var(--line-strong)', fontSize: '14px', transition: 'all 0.2s', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
               >
                 <IconArrowLeft className="w-4 h-4" /> Назад
               </button>
               <button 
                 onClick={handlePrintClick} 
                 disabled={isPrinting}
                 className="btn-active" 
                 style={{ padding: '12px 18px', background: isPrinting ? 'var(--accent-strong)' : 'var(--accent)', borderRadius: '12px', fontWeight: 'bold', color: 'var(--accent-ink)', border: 'none', fontSize: '14px', boxShadow: 'none', transition: 'all 0.2s', opacity: isPrinting ? 0.8 : 1, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
               >
                 {isPrinting ? 'Обработка...' : <><IconPrinter className="w-4 h-4" /> Сохранить PDF</>}
               </button>
            </div>
            <ExportReport />
          </div>
        );
      }

      return (
        <div
          className="app-shell flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#09090b] text-zinc-100 font-sans shadow-2xl border-x border-zinc-900 relative overflow-hidden"
          onFocusCapture={handleEditableFieldFocus}
        >
            {isNeonRainTheme && <div className="rain-atmosphere" aria-hidden="true" />}
            <header className="app-header shrink-0 pt-8 px-4 pb-4 bg-[#09090b] flex justify-between items-center z-10">
              <div>
                <h1 key={activeTab} className="text-2xl font-bold">{activeTabTitle}</h1>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsDrawerOpen(true)} className="relative btn-active p-2 bg-zinc-800 rounded-xl text-zinc-300 transition-all border border-zinc-800/50 cursor-pointer" aria-label="Открыть меню" aria-expanded={isDrawerOpen}>
                  <IconMenu className="w-5 h-5" />
                  {incomingRequests.length > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-[#09090b]">+{incomingRequests.length}</span>}
                </button>
              </div>
            </header>

            <main ref={scrollContainerRef} onClick={() => { if (selectedFoodId) setSelectedFoodId(''); }} className="app-main flex-1 overflow-y-auto overflow-x-hidden px-3 pt-2 pb-8">
              {appUpdate && !appUpdate.mandatory && <UpdateCallout />}
              <AnimatePresence initial={false}>
              <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} style={{ willChange: 'opacity, transform' }}>
              {activeTab === 'diary' && (
                <div className="space-y-4">
                  {showKbjuRecalc && (
                    <div className="card-enter bg-amber-500/10 border border-amber-400/30 rounded-3xl p-4 flex gap-3 items-start">
                      <div className="w-10 h-10 shrink-0 rounded-2xl bg-amber-400/15 flex items-center justify-center"><IconCalc className="w-5 h-5 text-amber-400" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-amber-100">Пора пересчитать КБЖУ</p>
                        <p className="text-xs text-amber-200/70 mt-1">Замеры изменились — по формуле выходит {kbjuPreview.calories} ккал вместо {goals.calories}. Обновить цели?</p>
                        <button type="button" onClick={applyAutoKbju} className="btn-active mt-2 bg-amber-400 text-amber-950 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-widest">Пересчитать</button>
                      </div>
                      <button type="button" onClick={dismissKbjuRecalc} className="btn-active shrink-0 text-[10px] font-bold text-amber-100/70 bg-amber-950/40 rounded-xl px-3 py-2">Позже</button>
                    </div>
                  )}
                  <div className="date-toolbar card-enter flex items-center justify-between bg-[#18181b] rounded-2xl p-1 border border-zinc-800/50">
                    <button onClick={() => {const d = new Date(currentDate); d.setDate(d.getDate()-1); setCurrentDate(getLocalDateString(d));}} className="btn-active p-3 text-zinc-400"><IconChevronLeft className="w-5 h-5" /></button>
                    <div className="relative font-bold text-sm text-zinc-200 flex items-center justify-center cursor-pointer px-4">
                      {displayDate(currentDate)}
                      <input type="date" className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" value={currentDate} max={getLocalDateString(new Date())} onChange={(e) => { if(e.target.value) setCurrentDate(e.target.value); }} />
                    </div>
                    <button onClick={() => {const d = new Date(currentDate); d.setDate(d.getDate()+1); setCurrentDate(getLocalDateString(d));}} disabled={currentDate === getLocalDateString(new Date())} className="btn-active p-3 text-zinc-400 disabled:opacity-20"><IconChevronRight className="w-5 h-5" /></button>
                  </div>

                  {(blocks.calories || blocks.steps || blocks.workout || blocks.protein || blocks.fats || blocks.carbs) && (
                  <div className="calorie-overview section-card card-enter bg-[#18181b] rounded-3xl p-5 shadow-xl border border-zinc-800/50">
                    <h2 className="section-legend text-[10px] text-zinc-500 uppercase font-bold tracking-widest">КБЖУ и активность</h2>
                    {blocks.calories && (<>
                    <div className="flex justify-between items-end mb-3">
                      <div>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1 tracking-widest">Калории</p>
                        <div className="flex items-baseline gap-1">
                          <AnimatedNumber value={totalCals} className="text-4xl font-black" />
                          <span className="text-zinc-600 text-sm">/ {dailyAvailableCalories}</span>
                        </div>
                      </div>
                      <div className={`text-right ${calsColorClass}`}>
                        <span className="text-2xl font-black">{displayCals}</span>
                        <p className="text-[10px] uppercase font-bold mt-1 tracking-widest opacity-80">{calsLabel}</p>
                      </div>
                    </div>
                    <div className="progress-track h-2 w-full bg-zinc-900 rounded-full overflow-hidden mb-4">
                      <motion.div className={`h-full ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`} initial={false} animate={{ width: `${progressCals}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}></motion.div>
                    </div>
                    </>)}

                    {blocks.steps && (
                    <div className="movement-panel mt-4 mb-4 flex items-center justify-between bg-zinc-900/40 p-3 rounded-2xl border border-zinc-800/40">
                      <div className="step-summary flex min-w-0 flex-1 items-center gap-3">
                        <IconSteps className="w-5 h-5 text-amber-400" />
                        <div className="flex flex-col">
                          <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Шаги</span>
                          <span className="text-[9px] text-zinc-500 font-bold mt-0.5">
                            {todaySteps} × 0.04 = {todayStepCalories} ккал{stepCaloriesDelta !== 0 ? ` · ${stepCaloriesDelta > 0 ? '+' : ''}${stepCaloriesDelta} к цели` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="step-controls flex shrink-0 items-center gap-2">
                        <button type="button" onClick={refreshCurrentDayVitals} disabled={isRefreshingDay || !uid} className="btn-active w-10 h-10 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center border border-zinc-700/30 disabled:opacity-40 transition-all" title="Обновить шаги">
                          <IconRefresh className={`w-5 h-5 ${isRefreshingDay ? 'animate-spin' : ''}`} />
                        </button>
                        <input type="number" className="step-input w-24 bg-zinc-800 rounded-xl p-2 text-center text-sm font-bold outline-none text-zinc-200 border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={todaySteps} onChange={(e) => handleUpdateSteps(e.target.value)} onFocus={(e) => e.target.select()} />
                      </div>
                    </div>
                    )}

                    {blocks.workout && (
                    <div className="activity-panel mb-4 space-y-3">
                      <button onClick={toggleWorkout} className={`workout-toggle btn-active w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${dailyWorkouts[currentDate] ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-zinc-900/40 border-zinc-800/40'}`}>
                        <div className="flex items-center gap-3">
                          <IconDumbbell className="w-5 h-5 text-amber-400" />
                          <span className={`text-[10px] uppercase font-bold tracking-widest ${dailyWorkouts[currentDate] ? 'text-emerald-400' : 'text-zinc-400'}`}>Силовая тренировка</span>
                        </div>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${dailyWorkouts[currentDate] ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                          {dailyWorkouts[currentDate] && <IconCheck className="w-4 h-4 text-white" />}
                        </div>
                      </button>

                      <div className="rounded-2xl border border-zinc-800/40 bg-zinc-900/40 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">Дополнительная активность</p>
                            <p className={`text-xs font-bold mt-1 ${extraActivityCalories > 0 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                              {extraActivityCalories > 0 ? `+${extraActivityCalories} ккал` : 'не добавлена'}
                            </p>
                          </div>
                          <button type="button" onClick={() => openExtraActivityModal()} className="btn-active shrink-0 cursor-pointer rounded-xl bg-emerald-600/15 border border-emerald-600/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300 transition-all">
                            + Добавить
                          </button>
                        </div>

                        {todayExtraActivities.length > 0 && (
                          <div className="flex flex-col gap-2">
                            {todayExtraActivities.map((activity) => (
                              <div key={activity.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#27272a] border border-zinc-700/30 px-3 py-2">
                                <span className="min-w-0 text-xs font-bold text-zinc-200 truncate">{activity.name} <span className="text-emerald-400">+{activity.calories} ккал</span></span>
                                <div className="flex shrink-0 items-center gap-1">
                                  <button type="button" onClick={() => openExtraActivityModal(activity)} className="btn-active rounded-lg px-2 py-1 text-[10px] font-bold text-zinc-400 border border-zinc-700/30">Изменить</button>
                                  <button type="button" onClick={() => removeExtraActivity(activity.id)} className="btn-active rounded-lg px-2 py-1 text-[10px] font-bold text-zinc-500 active:text-red-400" aria-label={`Удалить ${activity.name}`}>Удалить</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    )}

                    {(blocks.protein || blocks.fats || blocks.carbs) && (
                    <div className="macro-stack flex flex-col gap-3 mt-4 border-t border-zinc-800/50 pt-4">
                      {blocks.protein && <MacroBar label="Белок" current={totalPro} goal={activeGoals.protein} colorClass="text-indigo-400" bgClass="bg-indigo-500" />}
                      {blocks.fats && <MacroBar label="Жиры" current={totalFats} goal={activeGoals.fats} colorClass="text-amber-400" bgClass="bg-amber-500" />}
                      {blocks.carbs && <MacroBar label="Углеводы" current={totalCarbs} goal={dailyCarbGoal} colorClass="text-blue-400" bgClass="bg-blue-500" />}
                      {blocks.protein && proteinPerKg !== null && (
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Белок на кг веса</span>
                          <span className={`text-[11px] font-bold ${proteinPerKg >= 1.6 ? 'text-emerald-400' : 'text-amber-400'}`}>{proteinPerKg} г/кг <span className="text-zinc-600">· цель {proteinGoalPerKg}</span></span>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                  )}

                  {blocks.bodyMetrics && (
                    <div className="section-card card-enter bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 space-y-4">
                      <h2 className="section-legend text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Показатели тела</h2>
                      <div className="metric-date-nav flex items-center w-full min-h-14 bg-zinc-900 rounded-2xl border border-zinc-800/70 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            const date = new Date(currentDate);
                            date.setDate(date.getDate() - 1);
                            setCurrentDate(getLocalDateString(date));
                          }}
                          className="btn-active h-11 w-14 shrink-0 rounded-xl text-zinc-400 flex items-center justify-center"
                          aria-label="Предыдущий день"
                        >
                          <IconChevronLeft className="w-7 h-7" />
                        </button>
                        <div className="relative flex-1 self-stretch flex items-center justify-center">
                          <span className="text-sm font-bold text-zinc-200">{displayDate(currentDate)}</span>
                          <input type="date" aria-label="Дата показателей тела" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" value={currentDate} max={getLocalDateString(new Date())} onChange={(e) => { if(e.target.value) setCurrentDate(e.target.value); }} />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const date = new Date(currentDate);
                            date.setDate(date.getDate() + 1);
                            setCurrentDate(getLocalDateString(date));
                          }}
                          disabled={currentDate === getLocalDateString(new Date())}
                          className="btn-active h-11 w-14 shrink-0 rounded-xl text-zinc-400 flex items-center justify-center disabled:opacity-20"
                          aria-label="Следующий день"
                        >
                          <IconChevronRight className="w-7 h-7" />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {DAILY_BODY_METRICS.map((metric) => (
                          <div key={metric.key} className="bg-[#27272a] rounded-xl p-2 flex flex-col items-center border border-zinc-700/50 focus-within:border-emerald-500">
                            <label htmlFor={`daily-metric-${metric.key}`} className="text-[8px] text-zinc-400 uppercase font-bold tracking-widest mb-1 text-center leading-tight">{metric.label}</label>
                            <input
                              id={`daily-metric-${metric.key}`}
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              min="0"
                              className="w-full bg-transparent text-center text-sm font-bold text-zinc-200 outline-none"
                              value={dailyMetrics[currentDate]?.[metric.key] ?? ''}
                              onChange={(e) => handleUpdateMetrics(metric.key, e.target.value)}
                              onFocus={(e) => e.target.select()}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {blocks.water && (
                    <div className="water-card section-card card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50">
                      <h2 className="section-legend text-[10px] text-zinc-500 uppercase font-bold tracking-widest flex items-center gap-1.5"><IconDrop className="w-3.5 h-3.5 text-blue-400" /> Вода</h2>
                      <div className="flex justify-between items-end mb-3">
                        <div>
                          <div className="flex items-baseline gap-1">
                            <AnimatedNumber value={todayWater} className="text-4xl font-black" />
                            <span className="text-zinc-600 text-sm">/ {waterGoal} мл</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black text-blue-400">{Math.max(0, waterGoal - todayWater)}</span>
                          <p className="text-[10px] uppercase font-bold mt-1 tracking-widest opacity-80 text-blue-400">осталось</p>
                        </div>
                      </div>
                      <div className="progress-track h-2 w-full bg-zinc-900 rounded-full overflow-hidden mb-4">
                        <motion.div className="h-full bg-blue-500" initial={false} animate={{ width: `${waterProgress}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}></motion.div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {WATER_QUICK.map(v => (
                          <motion.button whileTap={{ scale: 0.92 }} type="button" key={v} onClick={() => addWater(v)} className="btn-active flex-1 min-w-[64px] bg-zinc-900/40 border border-zinc-800/40 text-zinc-200 rounded-2xl py-3 text-sm font-bold transition-all">+{v}</motion.button>
                        ))}
                        <motion.button whileTap={{ scale: 0.92 }} type="button" onClick={() => addWater(-100)} disabled={todayWater <= 0} className="btn-active w-12 bg-zinc-900/40 border border-zinc-800/40 text-zinc-400 rounded-2xl py-3 flex items-center justify-center transition-all disabled:opacity-30" aria-label="Убрать 100 мл"><IconMinus className="w-4 h-4" /></motion.button>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <input type="number" inputMode="numeric" placeholder="Своё значение (мл)" className="flex-1 bg-[#27272a] rounded-2xl p-3 outline-none text-zinc-200 text-sm border border-zinc-700/30 focus:border-blue-500" value={customWater} onChange={(e) => setCustomWater(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustomWater(); }} onFocus={(e) => e.target.select()} />
                        <button type="button" onClick={addCustomWater} disabled={!customWater} className="btn-active w-14 shrink-0 bg-blue-600 rounded-2xl flex items-center justify-center transition-all disabled:opacity-35" aria-label="Добавить воду"><IconPlus className="w-6 h-6 text-white" /></button>
                        <button type="button" onClick={resetWater} disabled={todayWater <= 0} className="btn-active w-14 shrink-0 bg-zinc-800 text-zinc-400 rounded-2xl flex items-center justify-center transition-all disabled:opacity-30" aria-label="Сбросить воду"><IconRefresh className="w-5 h-5" /></button>
                      </div>
                    </div>
                  )}

                  <form ref={mealFormRef} onSubmit={handleAddLog} className="meal-composer section-card card-enter bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 flex flex-col gap-3">
                    <h2 className="section-legend text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Добавить приём пищи</h2>

                    <div className="flex items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
                      <p className="min-w-0 text-[10px] text-zinc-500 leading-tight">Введите список продуктов — ИИ разберёт названия и количество.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMealAiModal(true);
                          setMealAiText('');
                          setMealAiError('');
                          setMealAiItems(null);
                        }}
                        className="btn-active shrink-0 flex items-center gap-1 bg-indigo-600/15 text-indigo-300 border border-indigo-600/30 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all"
                      >
                        <IconSparkles className="w-3.5 h-3.5" />
                        Распознать
                      </button>
                    </div>

                    {/* Поиск — первая точка выбора продукта. */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <label htmlFor="food-search" className="sr-only">Поиск продукта</label>
                      <IconSearch aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                      <input
                        ref={foodSearchRef}
                        id="food-search"
                        type="search"
                        enterKeyHint="search"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="Поиск продукта"
                        className="w-full bg-[#27272a] rounded-2xl py-3 pl-11 pr-14 outline-none text-zinc-200 text-base border border-zinc-700/30 focus:border-emerald-500"
                        value={foodSearch}
                        onChange={(e) => setFoodSearch(e.target.value)}
                      />
                      {foodSearch && (
                        <button type="button" onClick={() => { setFoodSearch(''); foodSearchRef.current?.focus(); }} className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 bg-transparent text-zinc-400 flex items-center justify-center active:text-zinc-200" title="Очистить поиск">
                          <IconClose className="w-12 h-12" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                      <p className="px-1 text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Избранные</p>
                      <div ref={favScrollRef} className="hscroll-fade flex gap-2 overflow-x-auto py-2 -my-2 px-1 -mx-1">
                        {favoriteMealFoods.map(f => (
                          <motion.button whileTap={{ scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} type="button" key={f.id} onClick={() => selectedFoodId === f.id ? clearFoodSelection() : selectFood(f.id)} className={`shrink-0 text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-colors ${selectedFoodId === f.id ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800/60 text-zinc-300 border-zinc-700/40'}`}>{f.name}</motion.button>
                        ))}
                        {favoriteMealFoods.length === 0 && <span className="self-center text-xs text-zinc-500 px-1 py-2 whitespace-nowrap">{foodSearch.trim() ? 'Нет совпадений' : 'Нет избранных'}</span>}
                      </div>
                    </div>

                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                      <p className="px-1 text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Все</p>
                      <div className="flex items-center gap-2 -mx-1 px-1">
                        <button type="button" onClick={clearFoodSelection} title="Сбросить выбор" aria-label="Сбросить выбор продукта" className={`btn-active shrink-0 flex items-center justify-center w-10 h-10 rounded-xl border transition-all ${!selectedFoodId ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800/60 text-emerald-300 border-emerald-700/40'}`}><IconClose className="w-4 h-4" /></button>
                        <div ref={mealListScrollRef} className="hscroll-fade flex gap-2 overflow-x-auto py-2 -my-2 pl-1 -ml-1 min-w-0">
                          {allMealFoods.map(f => (
                            <motion.button whileTap={{ scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} type="button" key={f.id} onClick={() => selectFood(f.id)} className={`shrink-0 text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-colors ${selectedFoodId === f.id ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-800/60 text-zinc-300 border-zinc-700/40'}`}>{f.name}</motion.button>
                          ))}
                          {allMealFoods.length === 0 && <span className="self-center text-xs text-zinc-500 px-1 py-2 whitespace-nowrap">{foodSearch.trim() ? 'Ничего не найдено' : 'Нет продуктов'}</span>}
                        </div>
                      </div>
                    </div>

                    {/* Вес и добавление — после поиска и списка продуктов. */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <label htmlFor="grams-input" className="sr-only">Вес продукта в граммах</label>
                      <input ref={gramsInputRef} id="grams-input" type="number" step="0.1" inputMode="decimal" placeholder="Вес (г)" className="flex-1 bg-[#27272a] rounded-2xl p-4 outline-none text-zinc-200 text-base border border-zinc-700/30 focus:border-emerald-500" value={gramsInput} onChange={(e) => setGramsInput(e.target.value)} onFocus={(e) => e.target.select()} required />
                      <button type="submit" disabled={!selectedFoodId || !gramsInput} className="btn-active w-14 shrink-0 bg-emerald-600 rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-35 disabled:shadow-none" aria-label="Добавить продукт"><IconPlus className="w-6 h-6 text-white" /></button>
                    </div>
                  </form>

                  <div className="food-log-list space-y-3 pt-2">
                    <AnimatePresence initial={false}>
                    {currentDayLogs.map(log => (
                      <motion.div key={log.id} layout initial={{ opacity: 0, y: -10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 60, scale: 0.95 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }} className="food-log-row list-item-active bg-[#18181b] rounded-2xl p-4 flex justify-between items-center border border-zinc-800/30 transition-colors">
                        <div className="flex-1 cursor-pointer pr-4 overflow-hidden" onClick={() => { if(editingLogId !== log.id) { setEditingLogId(log.id); setEditValue({ grams: log.grams }); setModifier({ type: null, value: '' }); }}}>
                          {editingLogId === log.id ? (
                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <input autoFocus={!modifier.type} type="number" step="0.1" className="w-16 bg-zinc-900 rounded-lg p-2 text-sm outline-none border border-emerald-500 text-white text-center" value={editValue.grams} onChange={(e) => setEditValue({grams: e.target.value})} onFocus={(e) => e.target.select()} />
                              
                              {!modifier.type ? (
                                <>
                                  <button type="button" onClick={() => setModifier({type: '+', value: ''})} className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-emerald-400 font-bold text-lg active:bg-zinc-700">+</button>
                                  <button type="button" onClick={() => setModifier({type: '-', value: ''})} className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center text-red-400 font-bold text-lg active:bg-zinc-700">-</button>
                                </>
                              ) : (
                                <>
                                  <span className={`font-bold text-lg ${modifier.type === '+' ? 'text-emerald-400' : 'text-red-400'}`}>{modifier.type}</span>
                                  <input autoFocus type="number" step="0.1" className="w-16 bg-zinc-900 rounded-lg p-2 text-sm outline-none border border-emerald-500 text-white text-center" value={modifier.value} onChange={(e) => setModifier({...modifier, value: e.target.value})} placeholder="0" onFocus={(e) => e.target.select()} />
                                </>
                              )}
                              
                              <button type="button" onClick={() => submitEdit(log.id)} className="w-8 h-8 ml-1 bg-emerald-600 rounded-lg flex items-center justify-center text-white active:bg-emerald-500"><IconCheck className="w-5 h-5"/></button>
                            </div>
                          ) : (
                            <div className="flex flex-col">
                              <span className="text-[10px] text-zinc-500 font-medium mb-0.5">{new Date(parseInt(log.id)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                              <p className="font-bold text-sm text-zinc-200 leading-tight break-words">{foods.find(f => f.id === log.foodId)?.name || 'Удалено'}</p>
                              <p className="text-[10px] text-zinc-400 font-bold uppercase block mt-1">{log.grams}г</p>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex flex-col justify-center items-end text-right">
                            <span className="text-emerald-400 font-bold text-sm mb-1">{Math.round(log.totalCalories || 0)} ккал</span>
                            <div className="flex gap-1.5 opacity-80">
                                <span className="text-indigo-400 text-[9px] font-bold">Б:{Math.round(log.totalProtein || 0)}</span>
                                <span className="text-amber-400 text-[9px] font-bold">Ж:{Math.round(log.totalFats || 0)}</span>
                                <span className="text-blue-400 text-[9px] font-bold">У:{Math.round(log.totalCarbs || 0)}</span>
                            </div>
                          </div>
                          <button onClick={() => deleteLog(log.id)} className="btn-active text-zinc-700 active:text-red-500 p-2 transition-colors"><IconTrash className="w-5 h-5" /></button>
                        </div>
                      </motion.div>
                    ))}
                    </AnimatePresence>
                    {currentDayLogs.length === 0 && <div className="text-center text-zinc-600 text-sm mt-10">Записей нет. Добавьте первый прием пищи.</div>}
                  </div>
                </div>
              )}

              {activeTab === 'progress' && (
                <div className="progress-panel space-y-4 w-full max-w-full">
                  {showBodyReminder && (
                    <div className="card-enter bg-amber-500/10 border border-amber-400/30 rounded-3xl p-4 flex gap-3 items-start max-w-full">
                      <div className="w-10 h-10 shrink-0 rounded-2xl bg-amber-400/15 flex items-center justify-center"><IconTimer className="w-5 h-5 text-amber-400" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-amber-100">Добавьте замеры (талия и др.) и фото</p>
                        <p className="text-xs text-amber-200/70 mt-1">{latestBodyDate ? `Последняя запись была ${displayDate(latestBodyDate).toLowerCase()}.` : 'Замеров пока нет.'} Фиксируйте обхваты и фото раз в 2 недели — так будет проще видеть изменения.</p>
                      </div>
                      <button type="button" onClick={dismissBodyReminder} className="btn-active shrink-0 text-[10px] font-bold text-amber-100/70 bg-amber-950/40 rounded-xl px-3 py-2">Позже</button>
                    </div>
                  )}

                  <div className="card-enter bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 space-y-3">
                    <div>
                      <h2 className="text-sm font-bold text-zinc-100">Период графиков</h2>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-1">Фильтр от сегодняшней даты назад</p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
                      {progressPeriods.map(period => {
                        const active = progressChartPeriod === period.key;
                        return (
                          <button
                            key={period.key}
                            type="button"
                            onClick={() => setProgressChartPeriod(period.key)}
                            aria-pressed={active}
                            className={`btn-active shrink-0 cursor-pointer rounded-2xl px-3.5 py-2 text-[10px] font-black uppercase tracking-widest border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 ${active ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/20' : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/70 hover:text-zinc-200 hover:border-zinc-700'}`}
                          >
                            {period.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {metricChartSeries.some(series => series.data.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).length >= 2) && (
                    <div className="space-y-3">
                      <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Графики тела</h2>
                      {metricChartSeries.map(series => (
                        <MiniWeightChart key={series.key} title={series.title} data={series.data} dates={metricChartLabels} color={series.color} unit={series.unit} />
                      ))}
                    </div>
                  )}

                  {progressBodyMeasureSeries.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Графики замеров</h2>
                      {progressBodyMeasureSeries.map(series => (
                        <MiniWeightChart key={series.key} title={series.label} data={series.data} dates={progressBodyMeasureDates} color={series.color} unit="см" />
                      ))}
                    </div>
                  )}

                  <button type="button" onClick={toggleBodyEditor} className="btn-active w-full rounded-3xl bg-zinc-900/70 border border-zinc-800/70 p-4 flex items-center justify-between">
                    <span className="text-sm font-black text-zinc-100">{showBodyEditor ? 'Скрыть фото и замеры' : 'Открыть фото и замеры'}</span>
                    <span className="text-lg text-zinc-500">{showBodyEditor ? '−' : '+'}</span>
                  </button>

                  {showBodyEditor && (
                  <div className="body-editor-panel space-y-6">
                  <form onSubmit={addBodyEntry} className="bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-zinc-100">Новая запись</h2>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-1">Мерки тела и фото</p>
                      </div>
                      <div className="relative shrink-0 bg-zinc-900 rounded-xl px-3 py-2 border border-zinc-800/70">
                        <span className="text-xs font-bold text-zinc-200">{displayDate(bodyDraft.date)}</span>
                        <input type="date" className="absolute inset-0 opacity-0" value={bodyDraft.date} max={getLocalDateString(new Date())} onChange={(e) => setBodyDraft(prev => ({ ...prev, date: e.target.value }))} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {BODY_MEASURE_FIELDS.map(field => (
                        <label key={field.key} className="bg-[#27272a] rounded-2xl p-3 border border-zinc-700/50">
                          <span className="block text-[9px] text-zinc-500 uppercase font-bold tracking-widest mb-2 leading-tight">{field.label}</span>
                          <div className="flex items-baseline gap-1">
                            <input type="number" step="0.1" inputMode="decimal" className="w-full bg-transparent text-lg font-black text-zinc-100 outline-none" value={bodyDraft.measures[field.key]} onChange={(e) => handleBodyMeasureChange(field.key, e.target.value)} onFocus={(e) => e.target.select()} />
                            <span className="text-[10px] text-zinc-500 font-bold">{field.unit}</span>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="bg-zinc-900/50 rounded-2xl p-3 border border-zinc-800/60">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-zinc-200">Фото прогресса</p>
                          <p className="text-[10px] text-zinc-500 mt-1">До 3 фото: анфас, бок, спина. Они сжимаются перед сохранением.</p>
                        </div>
                        <label className="btn-active shrink-0 rounded-xl bg-indigo-500/20 text-indigo-200 px-3 py-2 text-[10px] font-bold uppercase tracking-widest border border-indigo-400/20">
                          Добавить
                          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleBodyPhotoFiles(e.target.files); e.target.value = ''; }} />
                        </label>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3">
                        {BODY_PHOTO_LABELS.map((label, idx) => {
                          const photo = bodyDraft.photos[idx];
                          const src = getBodyPhotoSrc(photo);
                          return (
                            <label key={label} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-950 btn-active cursor-pointer block">
                              {src ? (
                                <img src={src} className="w-full h-full object-cover pointer-events-none" alt={label} />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center px-2 text-center gap-1 bg-zinc-900/70 pointer-events-none">
                                  <span className="text-lg text-zinc-600">+</span>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</span>
                                </div>
                              )}
                              <span className="absolute left-1 bottom-1 rounded-full bg-black/60 px-2 py-0.5 text-[8px] font-bold text-white/80 pointer-events-none">{label}</span>
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleBodyDraftPhotoSlot(idx, e.target.files); e.target.value = ''; }} />
                              {src && <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBodyDraft(prev => ({ ...prev, photos: (prev.photos || []).map((item, itemIdx) => itemIdx === idx ? null : item) })); }} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs z-10">×</button>}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <button type="submit" className="btn-active w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-rose-500 text-white rounded-2xl p-4 font-black transition-all">Сохранить замеры</button>
                  </form>

                  {bodyEntryOptions.length >= 2 && (
                    <div className="bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 space-y-4">
                      <div>
                        <h2 className="text-sm font-bold text-zinc-100">Сравнение</h2>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-1">Выбери две записи</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[0, 1].map(idx => (
                          <select key={idx} className="w-full min-w-0 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-xs font-bold outline-none" value={compareBodyIds[idx] || (idx === 0 ? compareBodyA?.id : compareBodyB?.id) || ''} onChange={(e) => { setCompareBodyIds(prev => idx === 0 ? [e.target.value, prev[1]] : [prev[0], e.target.value]); setComparePhotoIndexes(prev => idx === 0 ? [0, prev[1]] : [prev[0], 0]); }}>
                            {bodyEntryOptions.map(entry => <option key={entry.id} value={entry.id}>{displayDate(entry.date)}</option>)}
                          </select>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[compareBodyA, compareBodyB].map((entry, idx) => (
                          <select key={idx} className="w-full min-w-0 bg-zinc-900/70 border border-zinc-800 rounded-2xl p-3 text-xs font-bold outline-none" value={comparePhotoIndexes[idx]} onChange={(e) => setComparePhotoIndexes(prev => idx === 0 ? [Number(e.target.value), prev[1]] : [prev[0], Number(e.target.value)])}>
                            {BODY_PHOTO_LABELS.map((label, photoIdx) => <option key={label} value={photoIdx}>{label}{getBodyPhotoSrc(entry?.photos?.[photoIdx]) ? '' : ' (нет)'}</option>)}
                          </select>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Сравнение фото</p>
                          <button type="button" onClick={() => { setBodyPhotoZoom(false); setShowBodyPhotoCompare(true); }} className="btn-active text-[10px] font-bold text-violet-200 bg-violet-500/15 border border-violet-400/15 rounded-xl px-3 py-2">На весь экран</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[[compareBodyA, comparePhotoA], [compareBodyB, comparePhotoB]].map(([entry, photo], idx) => (
                            <div key={entry?.id || idx} className="rounded-2xl overflow-hidden bg-zinc-950 border border-zinc-800">
                              <div className="aspect-[9/16] bg-zinc-900 relative">
                                {getBodyPhotoSrc(photo) ? <img src={getBodyPhotoSrc(photo)} className="w-full h-full object-contain" /> : <div className="h-full flex items-center justify-center text-[10px] text-zinc-600 font-bold uppercase text-center px-2">Нет фото</div>}
                                <span className="absolute left-2 top-2 rounded-full bg-black/30 px-2 py-1 text-[9px] font-black text-white/65">{idx === 0 ? 'Было' : 'Стало'}</span>
                              </div>
                              <p className="p-2 text-center text-[10px] font-bold text-zinc-400">{entry ? `${displayDate(entry.date)} · ${getBodyPhotoLabel(photo, comparePhotoIndexes[idx])}` : '—'}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {compareBodyA && compareBodyB && (
                        <div className="space-y-2">
                          {BODY_MEASURE_FIELDS.map(field => {
                            const a = Number(compareBodyA.measures?.[field.key]);
                            const b = Number(compareBodyB.measures?.[field.key]);
                            const hasBoth = !isNaN(a) && !isNaN(b) && a > 0 && b > 0;
                            const delta = hasBoth ? Math.round((b - a) * 10) / 10 : null;
                            return (
                              <div key={field.key} className="flex items-center justify-between bg-zinc-900/50 rounded-2xl p-3 border border-zinc-800/50">
                                <span className="text-xs font-bold text-zinc-300">{field.label}</span>
                                <div className="text-right">
                                  <span className="text-xs text-zinc-500">{hasBoth ? `${a} → ${b} см` : '—'}</span>
                                  {hasBoth && <span className={`ml-2 text-sm font-black ${delta < 0 ? 'text-emerald-400' : delta > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">История ({bodyEntries.length})</h2>
                    {sortedBodyEntries.map(entry => (
                      <div key={entry.id} className="bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-zinc-100">{displayDate(entry.date)}</p>
                            <p className="text-[10px] text-zinc-500 mt-1">{countBodyPhotos(entry.photos)} фото</p>
                          </div>
                          <div className="shrink-0">
                            <button type="button" onClick={() => deleteBodyEntry(entry.id)} className="btn-active text-zinc-700 active:text-red-400 p-2"><IconTrash className="w-5 h-5" /></button>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          {BODY_PHOTO_LABELS.map((label, idx) => {
                            const photo = entry.photos?.[idx];
                            const src = getBodyPhotoSrc(photo);
                            return (
                              <label key={label} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-950 btn-active cursor-pointer block">
                                {src ? (
                                  <img src={src} className="w-full h-full object-cover pointer-events-none" alt={label} />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center px-2 text-center gap-1 bg-zinc-900/70 pointer-events-none">
                                    <span className="text-lg text-zinc-600">+</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">{label}</span>
                                  </div>
                                )}
                                <span className="absolute left-1 bottom-1 rounded-full bg-black/60 px-2 py-0.5 text-[8px] font-bold text-white/80 pointer-events-none">{label}</span>
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleBodyEntryPhotoSlot(entry.id, idx, e.target.files); e.target.value = ''; }} />
                                {src && (
                                  <>
                                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSingleBodyPhotoZoom(false); setSingleBodyPhoto({ src, date: entry.date, label: getBodyPhotoLabel(photo, idx) }); }} className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/70 text-white text-[10px] z-10">⤢</button>
                                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeBodyEntryPhoto(entry.id, idx); }} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] z-10">×</button>
                                  </>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {BODY_MEASURE_FIELDS.map(field => entry.measures?.[field.key] ? (
                            <div key={field.key} className="bg-zinc-900/50 rounded-xl p-2 border border-zinc-800/40">
                              <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest leading-tight">{field.label}</p>
                              <p className="text-sm font-black text-zinc-200 mt-1">{entry.measures[field.key]} см</p>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    ))}
                  </div>
                  </div>
                  )}
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="space-y-5">
                  {/* Личные данные */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconUser className="w-4 h-4" /> Личные данные</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {[['male', 'Мужчина'], ['female', 'Женщина']].map(([s, label]) => (
                        <button key={s} type="button" onClick={() => handleProfileChange('sex', s)} className={`btn-active rounded-xl p-3 text-sm font-bold border transition-all ${profileData.sex === s ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{label}</button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ВОЗРАСТ</span><input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={profileData.age} onChange={(e) => handleProfileChange('age', e.target.value)} onFocus={(e) => e.target.select()} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">РОСТ, СМ</span><input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={profileData.height} onChange={(e) => handleProfileChange('height', e.target.value)} onFocus={(e) => e.target.select()} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ВЕС, КГ</span><input type="number" inputMode="decimal" step="0.1" disabled={measuredWeight != null} title={measuredWeight != null ? 'Берётся из показателей в «Дневнике»' : undefined} className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors disabled:opacity-70" value={measuredWeight != null ? measuredWeight : profileData.weight} onChange={(e) => handleProfileChange('weight', e.target.value)} onFocus={(e) => e.target.select()} /></div>
                    </div>
                    {measuredWeight != null && <p className="text-[10px] text-zinc-600 leading-relaxed">Вес берётся из последних показателей в «Дневнике» ({measuredWeight} кг). Он обновляется автоматически.</p>}
                    <div>
                      <span className="text-[9px] text-zinc-500 font-bold block mb-2">УРОВЕНЬ АКТИВНОСТИ</span>
                      <p className="text-[10px] text-zinc-600 leading-relaxed mb-2">
                        Уровень активности — это фиксированная надбавка за NEAT, работу и тренировки. Шаги считаются отдельной строкой.
                      </p>
                      <div className="flex flex-col gap-2">
                        {ACTIVITY_LEVELS.map(l => (
                          <button key={l.key} type="button" onClick={() => handleProfileChange('activity', l.key)} className={`btn-active text-left rounded-xl p-3 border transition-all ${selectedActivityKey === l.key ? 'bg-emerald-600/15 border-emerald-600/40' : 'bg-[#27272a] border-zinc-700/30'}`}>
                            <span className={`text-sm font-bold ${selectedActivityKey === l.key ? 'text-emerald-300' : 'text-zinc-200'}`}>{l.label}</span>
                            <span className="block text-[10px] text-zinc-500 mt-0.5">{l.hint} · +{l.activityCalories} ккал</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label htmlFor="usual-steps" className="text-[9px] text-zinc-500 font-bold block mb-1">ОБЫЧНО ШАГОВ В ДЕНЬ</label>
                      <input
                        id="usual-steps"
                        type="number"
                        inputMode="numeric"
                        min="0"
                        className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors"
                        value={profileData.usualSteps ?? DEFAULT_USUAL_STEPS}
                        onChange={(e) => handleUsualStepsChange(e.target.value)}
                        onFocus={(e) => e.target.select()}
                      />
                      <p className="text-[10px] text-zinc-600 leading-relaxed mt-1.5">Шаги добавляются к расходу отдельно: шаги × 0.04 ккал. В активности они не спрятаны.</p>
                    </div>
                  </div>

                  {/* Расчёт КБЖУ */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconCalc className="w-4 h-4" /> Расчёт КБЖУ</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {[['auto', 'Автоматически'], ['manual', 'Вручную']].map(([m, label]) => (
                        <button key={m} type="button" onClick={() => handleProfileChange('mode', m)} className={`btn-active rounded-xl p-3 text-sm font-bold border transition-all ${profileData.mode === m ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{label}</button>
                      ))}
                    </div>
                    {profileData.mode === 'auto' ? (
                      <>
                        <div>
                          <span className="text-[9px] text-zinc-500 font-bold block mb-1">ДЕФИЦИТ, ККАЛ/ДЕНЬ</span>
                          <input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={profileData.deficit} onChange={(e) => handleProfileChange('deficit', e.target.value === '' ? '' : parseInt(e.target.value))} onFocus={(e) => e.target.select()} />
                          <p className="text-[10px] text-zinc-600 leading-relaxed mt-1.5">По умолчанию 500 — комфортное похудение ~0,5 кг/нед. Поставьте 0, чтобы удерживать вес, или отрицательное значение — для набора массы.</p>
                        </div>
                        {kbjuPreview ? (
                          <div className="bg-[#27272a] rounded-2xl p-4 border border-zinc-700/30">
                            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-3">Расчёт по формуле Миффлина</p>
                            <div className="grid grid-cols-2 gap-y-2 text-sm">
                              <span className="text-zinc-400">Базовый обмен (BMR)</span><span className="text-right font-bold text-zinc-200">{kbjuPreview.bmr} ккал</span>
                              <span className="text-zinc-400">Шаги</span><span className="text-right font-bold text-zinc-200">{kbjuPreview.steps} × {kbjuPreview.kcalPerStep.toFixed(2)} = {kbjuPreview.stepsCalories} ккал</span>
                              <span className="text-zinc-400">Активность</span><span className="text-right font-bold text-zinc-200">{kbjuPreview.activityLabel}, +{kbjuPreview.activityCalories} ккал</span>
                              <span className="text-zinc-400">Норма (TDEE)</span><span className="text-right font-bold text-zinc-200">{kbjuPreview.maintenance} ккал</span>
                              <span className="text-zinc-400">Цель калорий</span><span className="text-right font-bold text-emerald-400">{kbjuPreview.calories} ккал</span>
                              <span className="text-zinc-400">Белок</span><span className="text-right font-bold text-indigo-400">{kbjuPreview.protein} г</span>
                              <span className="text-zinc-400">Жиры</span><span className="text-right font-bold text-amber-400">{kbjuPreview.fats} г</span>
                              <span className="text-zinc-400">Углеводы</span><span className="text-right font-bold text-blue-400">{kbjuPreview.carbs} г</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-400/90 leading-relaxed">Заполните пол, возраст, рост и вес выше — расчёт появится здесь.</p>
                        )}
                        <button type="button" onClick={applyAutoKbju} disabled={!kbjuPreview} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-35"><IconCheck className="w-5 h-5" /> Рассчитать и применить</button>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-500 leading-relaxed">Ручной режим: задайте КБЖУ самостоятельно во вкладке «База» → «Ваши цели».</p>
                    )}
                  </div>

                  {/* Норма воды */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconDrop className="w-4 h-4" /> Норма воды</h2>
                    <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ЦЕЛЬ, МЛ/ДЕНЬ</span><input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-blue-400 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={draftGoals.waterGoal} onChange={(e) => handleDraftGoalChange('waterGoal', e.target.value === '' ? '' : parseInt(e.target.value))} onFocus={(e) => e.target.select()} /></div>
                    {hasUnsavedGoals && <button type="button" onClick={() => setShowGoalModal(true)} className="btn-active w-full bg-indigo-600 text-white p-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"><IconSave className="w-5 h-5" /> Сохранить цели</button>}
                  </div>

                </div>
              )}

              {activeTab === 'settings' && (
                <div className="space-y-5">
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconSliders className="w-4 h-4" /> Тема оформления</h2>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">Темы применяются сразу, сохраняются в профиле и меняют главный цвет интерфейса глобально.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {THEMES.map(t => (
                        <button key={t.key} type="button" onClick={() => setTheme(t.key)} className={`btn-active flex items-center gap-2.5 rounded-xl p-3 border transition-all cursor-pointer ${activeTheme === t.key ? 'border-emerald-500 bg-emerald-600/15' : 'bg-[#27272a] border-zinc-700/30'}`}>
                          <span className="shrink-0 w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center" style={{ background: t.bg }}><span className="w-3 h-3 rounded-full" style={{ background: t.dot }} /></span>
                          <span className={`text-xs font-bold text-left leading-tight ${activeTheme === t.key ? 'text-emerald-300' : 'text-zinc-300'}`}>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconSliders className="w-4 h-4" /> Размер шрифта</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {[['normal', 'Стандартный'], ['large', 'Увеличенный']].map(([sc, label]) => (
                        <button key={sc} type="button" onClick={() => setFontScale(sc)} className={`btn-active rounded-xl p-3 text-sm font-bold border transition-all cursor-pointer ${settings.fontScale === sc ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{label}</button>
                      ))}
                    </div>
                  </div>

                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Блоки в дневнике</h2>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">По умолчанию включены все блоки. Отключите лишние — они исчезнут из дневника, но данные сохранятся.</p>
                    <div className="space-y-2">
                      {TOGGLEABLE_BLOCKS.map(b => (
                        <button key={b.key} type="button" role="switch" aria-checked={!!blocks[b.key]} onClick={() => toggleBlock(b.key)} className="btn-active w-full flex items-center justify-between gap-3 bg-[#27272a] rounded-xl p-3 border border-zinc-700/30 text-left transition-all cursor-pointer">
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-zinc-200">{b.label}</span>
                            <span className="block text-[10px] text-zinc-500 mt-0.5">{b.hint}</span>
                          </div>
                          <div className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${blocks[b.key] ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${blocks[b.key] ? 'translate-x-5' : 'translate-x-0'}`} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Аккаунт</h2>
                    <p className="text-xs text-zinc-500 break-all">{auth.currentUser ? auth.currentUser.email : ''}</p>
                    {installPrompt && <button type="button" onClick={installApp} className="btn-active w-full bg-indigo-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" />Установить приложение</button>}
                    <button type="button" onClick={deleteAccountNow} disabled={deleteBusy} className="btn-active w-full bg-red-950/40 text-red-400 border border-red-900/50 rounded-xl p-3 font-bold transition-all disabled:opacity-50">{deleteBusy ? 'Удаление…' : 'Удалить аккаунт'}</button>
                    <p className="text-[10px] text-zinc-600 leading-relaxed">Удаление аккаунта стирает все данные безвозвратно. Расчёты КБЖУ и ИИ-оценки — ориентировочные, не медицинская рекомендация.</p>
                  </div>
                </div>
              )}

              {activeTab === 'about' && (
                <div className="space-y-5">
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center"><IconBowl className="w-7 h-7 text-emerald-400" /></div>
                    <div>
                      <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconInfo className="w-4 h-4" /> О приложении</h2>
                      <p className="text-2xl font-black text-zinc-100 mt-2">MoteoTracker</p>
                      <p className="text-xs text-zinc-500 leading-relaxed mt-2">Дневник питания, активности, прогресса тела и личной базы продуктов. Расчёты КБЖУ и ИИ-подсказки — ориентировочные, не медицинская рекомендация.</p>
                    </div>
                    <div className="bg-[#27272a] rounded-2xl p-4 border border-zinc-700/30 space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-zinc-500">Текущая версия</span>
                        <span className="font-bold text-zinc-200">{APP_VERSION}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-zinc-500">Обновления</span>
                        <span className={`font-bold ${appUpdate ? 'text-amber-400' : 'text-emerald-400'}`}>{appUpdate ? `доступна ${appUpdate.version}` : 'актуально'}</span>
                      </div>
                    </div>
                    {appUpdate ? (
                      <button type="button" onClick={applyAppUpdate} disabled={isApplyingUpdate} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60"><IconDownload className="w-5 h-5" />{isApplyingUpdate ? 'Обновляем…' : 'Обновить приложение'}</button>
                    ) : (
                      <>
                        <button type="button" onClick={applyAppUpdate} disabled={isApplyingUpdate} className="btn-active w-full bg-zinc-800 text-zinc-100 border border-zinc-700/40 rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60"><IconRefresh className="w-5 h-5" />{isApplyingUpdate ? 'Обновляем…' : 'Обновить приложение'}</button>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">Приложение само проверяет обновления при запуске. Эта кнопка принудительно сбрасывает кэш и подтягивает свежую сборку.</p>
                      </>
                    )}
                    {installPrompt && <button type="button" onClick={installApp} className="btn-active w-full bg-indigo-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" />Установить приложение</button>}
                  </div>
                </div>
              )}

              {activeTab === 'support' && (
                <div className="space-y-5">
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center"><IconHelpCircle className="w-7 h-7 text-emerald-400" /></div>
                    <div>
                      <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconHelpCircle className="w-4 h-4" /> Поддержка</h2>
                      <p className="text-sm text-zinc-400 leading-relaxed mt-2">Если что-то сломалось, не считается или хочется предложить улучшение — напишите владельцу приложения.</p>
                    </div>
                    <a href={`mailto:${OWNER_EMAIL}?subject=MoteoTracker%20support`} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 text-center">{OWNER_EMAIL}</a>
                  </div>
                </div>
              )}

              {activeTab === 'social' && (
                <div className="space-y-5">
                  {/* Мой код */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconUser className="w-4 h-4" /> Моя карточка</h2>
                    <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ИМЯ (видят друзья)</span><input type="text" maxLength={24} placeholder="Как вас зовут" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={profileData.displayName || ''} onChange={(e) => handleProfileChange('displayName', e.target.value)} /></div>
                    <div>
                      <span className="text-[9px] text-zinc-500 font-bold block mb-1">ВАШ КОД ДЛЯ ДРУЗЕЙ</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-[#27272a] rounded-xl p-3 font-black text-lg tracking-[0.3em] text-emerald-400 text-center border border-zinc-700/30">{myFriendCode || '—'}</div>
                        <button type="button" onClick={() => { if (navigator.clipboard) { navigator.clipboard.writeText(myFriendCode); notify('Код скопирован'); } }} className="btn-active w-12 h-12 shrink-0 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 border border-zinc-700/30" aria-label="Скопировать код"><IconCopy className="w-5 h-5" /></button>
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1.5">Поделитесь кодом, чтобы вас добавили в друзья.</p>
                    </div>
                  </div>

                  {/* Добавить друга */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Добавить друга по коду</h2>
                    <div className="flex gap-2">
                      <input type="text" placeholder="Код друга" maxLength={6} className="flex-1 min-w-0 bg-[#27272a] rounded-xl p-3 font-black tracking-[0.2em] uppercase text-zinc-200 outline-none border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={friendCodeInput} onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())} />
                      <button type="button" onClick={sendFriendRequest} disabled={!friendCodeInput.trim()} className="btn-active px-4 shrink-0 bg-emerald-600 text-white rounded-xl font-bold transition-all disabled:opacity-35">Добавить</button>
                    </div>
                  </div>

                  {/* Входящие заявки */}
                  {incomingRequests.length > 0 && (
                    <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                      <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Заявки в друзья ({incomingRequests.length})</h2>
                      {incomingRequests.map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2 bg-[#27272a] rounded-xl p-3 border border-zinc-700/30">
                          <span className="text-sm font-bold text-zinc-200 truncate">{friendName(otherUid(c))}</span>
                          <div className="flex gap-2 shrink-0">
                            <button type="button" onClick={() => acceptConnection(c)} className="btn-active bg-emerald-600 text-white rounded-lg px-3 py-2 text-xs font-bold">Принять</button>
                            <button type="button" onClick={() => removeConnection(c)} className="btn-active bg-zinc-800 text-zinc-400 rounded-lg px-3 py-2 text-xs font-bold">Отклонить</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Друзья */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconUsers className="w-4 h-4" /> Друзья ({acceptedFriends.length})</h2>
                      {acceptedFriends.length > 0 && <button type="button" onClick={() => openChallengeWith('')} className="btn-active flex items-center gap-1.5 bg-emerald-600 text-white rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-widest"><IconTrophy className="w-4 h-4" /> Новый спор</button>}
                    </div>
                    {acceptedFriends.length === 0 && <p className="text-xs text-zinc-500">Пока нет друзей. Добавьте по коду — и спорьте, кто быстрее придёт к цели.</p>}
                    {acceptedFriends.map(c => {
                      const fid = otherUid(c);
                      const rec = challengeRecordVs(challenges, uid, fid);
                      const hasRec = rec.wins + rec.losses + rec.ties > 0;
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 bg-[#27272a] rounded-xl p-3 border border-zinc-700/30">
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-zinc-200 block truncate">{friendName(fid)}</span>
                            {hasRec
                              ? <span className="text-[10px] text-zinc-400 font-bold">Счёт: <span className="text-emerald-400">{rec.wins}</span> : <span className="text-red-400">{rec.losses}</span>{rec.ties ? <span className="text-zinc-500"> · {rec.ties} нич.</span> : null}</span>
                              : <span className="text-[10px] text-zinc-500">Показатели видны только в общем споре</span>}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button type="button" onClick={() => openChallengeWith(fid)} className="btn-active bg-emerald-600/15 text-emerald-300 border border-emerald-600/30 rounded-lg px-3 py-2 text-xs font-bold">Спорить</button>
                            <button type="button" onClick={() => removeConnection(c)} className="btn-active text-zinc-700 active:text-red-400 p-2"><IconTrash className="w-5 h-5" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Сравнение прогресса */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconTrophy className="w-4 h-4" /> Сравнение прогресса</h2>
                        <p className="text-xs text-zinc-500 mt-2 leading-relaxed">Выберите друга и период, чтобы сравнить динамику веса.</p>
                      </div>
                      <div className="w-11 h-11 shrink-0 rounded-2xl bg-emerald-600/15 border border-emerald-600/30 flex items-center justify-center"><IconTarget className="w-5 h-5 text-emerald-400" /></div>
                    </div>

                    {acceptedFriends.length === 0 ? (
                      <div className="rounded-2xl bg-[#27272a] border border-zinc-700/30 p-4">
                        <p className="text-sm font-bold text-zinc-200">У вас пока нет друзей для спора</p>
                        <p className="text-[11px] text-zinc-500 mt-1">Добавьте друга по коду, и здесь появится сравнение прогресса.</p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Выберите друга</p>
                          <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
                            {acceptedFriends.map(c => {
                              const fid = otherUid(c);
                              const active = challengeProgressFriendUid === fid;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setChallengeProgressFriendUid(fid)}
                                  aria-pressed={active}
                                  className={`btn-active shrink-0 cursor-pointer rounded-2xl px-3.5 py-2.5 text-xs font-bold border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 ${active ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/20' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30 hover:border-zinc-600 hover:text-zinc-100'}`}
                                >
                                  {friendName(fid)}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Период</p>
                          <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
                            {progressPeriods.map(period => {
                              const active = challengeProgressPeriod === period.key;
                              return (
                                <button
                                  key={period.key}
                                  type="button"
                                  onClick={() => setChallengeProgressPeriod(period.key)}
                                  aria-pressed={active}
                                  className={`btn-active shrink-0 cursor-pointer rounded-2xl px-3 py-2 text-[10px] font-black uppercase tracking-widest border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/60 ${active ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-900/70 text-zinc-400 border-zinc-800/70 hover:text-zinc-200 hover:border-zinc-700'}`}
                                >
                                  {period.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className={`rounded-2xl border p-4 ${challengeProgressToneClass}`}>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Итог</p>
                          <p className="text-sm font-black mt-1">{challengeProgressOutcome.text}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            { key: 'me', title: 'Мой прогресс', name: myDisplayName, summary: myWeightProgressSummary, empty: 'У вас пока нет записей прогресса', color: '#34d399' },
                            { key: 'friend', title: 'Прогресс друга', name: challengeProgressFriendUid ? friendName(challengeProgressFriendUid) : 'Друг', summary: friendWeightProgressSummary, empty: 'У друга пока нет записей прогресса', color: '#38bdf8' },
                          ].map(card => {
                            const summary = card.summary;
                            const deltaClass = summary.delta == null || summary.delta === 0 ? 'text-zinc-400' : (summary.delta < 0 ? 'text-emerald-400' : 'text-red-400');
                            const deltaText = summary.delta == null ? '—' : `${summary.delta > 0 ? '+' : ''}${summary.delta} кг`;
                            const percentText = summary.percent == null ? '' : ` (${summary.percent > 0 ? '+' : ''}${summary.percent}%)`;
                            return (
                              <div key={card.key} className="bg-[#27272a] rounded-2xl p-4 border border-zinc-700/30 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">{card.title}</p>
                                    <p className="text-sm font-black text-zinc-100 mt-1 truncate">{card.name}</p>
                                  </div>
                                  <span className={`shrink-0 rounded-xl px-2.5 py-1 text-[9px] font-bold ${summary.hasData ? 'bg-emerald-600/15 text-emerald-300' : 'bg-zinc-900/70 text-zinc-500'}`}>{summary.status}</span>
                                </div>

                                {summary.hasData ? (
                                  <>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="rounded-xl bg-zinc-900/60 p-3 border border-zinc-800/60">
                                        <p className="text-[9px] text-zinc-500 font-bold uppercase">Текущий вес</p>
                                        <p className="text-lg font-black text-zinc-100 mt-1">{summary.currentWeight != null ? `${summary.currentWeight} кг` : '—'}</p>
                                      </div>
                                      <div className="rounded-xl bg-zinc-900/60 p-3 border border-zinc-800/60">
                                        <p className="text-[9px] text-zinc-500 font-bold uppercase">Изменение</p>
                                        <p className={`text-lg font-black mt-1 ${deltaClass}`}>{deltaText}</p>
                                        {percentText && <p className="text-[9px] text-zinc-500 font-bold">{percentText}</p>}
                                      </div>
                                      <div className="rounded-xl bg-zinc-900/60 p-3 border border-zinc-800/60">
                                        <p className="text-[9px] text-zinc-500 font-bold uppercase">Записей</p>
                                        <p className="text-lg font-black text-zinc-100 mt-1">{summary.count}</p>
                                      </div>
                                      <div className="rounded-xl bg-zinc-900/60 p-3 border border-zinc-800/60">
                                        <p className="text-[9px] text-zinc-500 font-bold uppercase">Лучший вес</p>
                                        <p className="text-lg font-black text-zinc-100 mt-1">{summary.bestWeight != null ? `${summary.bestWeight} кг` : '—'}</p>
                                      </div>
                                    </div>
                                    {summary.filteredHistory.length >= 2 ? (
                                      <MiniWeightChart
                                        title={`${card.title} · ${selectedChallengeProgressPeriod.label.toLowerCase()}`}
                                        data={summary.filteredHistory.map(point => point.v)}
                                        dates={summary.filteredHistory.map(point => point.d.slice(5))}
                                        color={card.color}
                                        unit="кг"
                                      />
                                    ) : (
                                      <p className="text-[11px] text-zinc-500 leading-relaxed">Для честного сравнения нужна ещё одна запись в выбранном периоде.</p>
                                    )}
                                  </>
                                ) : (
                                  <div className="rounded-xl bg-zinc-900/60 p-4 border border-zinc-800/60">
                                    <p className="text-sm font-bold text-zinc-200">{card.empty}</p>
                                    <p className="text-[11px] text-zinc-500 mt-1">Карточка обновится автоматически, когда появятся записи.</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Активные споры */}
                  {(() => {
                    const sorted = [...challenges].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    const active = sorted.filter(c => c.status !== 'finished' && c.status !== 'cancelled');
                    const archived = sorted.filter(c => c.status === 'finished' || c.status === 'cancelled');
                    return (
                      <>
                        {active.length > 0 && (
                          <div className="space-y-3">
                            <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconTrophy className="w-4 h-4" /> Активные споры ({active.length})</h2>
                            {active.map(c => renderChallengeCard(c))}
                          </div>
                        )}
                        {archived.length > 0 && (
                          <div className="space-y-3">
                            <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconTrophy className="w-4 h-4" /> История споров ({archived.length})</h2>
                            {archived.map(c => renderChallengeCard(c))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {activeTab === 'directory' && (
                <div className="space-y-6">
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2"><IconTarget className="w-4 h-4" /> Ваши цели</h2>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ККАЛ (ЦЕЛЬ)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-emerald-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.calories} onChange={(e) => handleCaloriesChange(e.target.value)} onFocus={(e) => e.target.select()} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ЖЕЛАЕМЫЙ ДЕФИЦИТ</span><input type="number" className="w-full bg-[#27272a] rounded-xl p-3 text-amber-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.deficit} onChange={(e) => handleDeficitChange(e.target.value)} onFocus={(e) => e.target.select()} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">НОРМА (БЕЗ ДЕФИЦИТА)</span><input type="number" className="w-full bg-[#27272a] rounded-xl p-3 text-white font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.maintenance} onChange={(e) => handleMaintenanceChange(e.target.value)} onFocus={(e) => e.target.select()} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">БАЗА ШАГОВ</span><input type="number" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-300 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.baseSteps} onChange={(e) => handleDraftGoalChange('baseSteps', e.target.value === '' ? '' : parseInt(e.target.value))} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">БЕЛОК (Г)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-indigo-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.protein} onChange={(e) => handleDraftGoalChange('protein', e.target.value === '' ? '' : parseFloat(e.target.value))} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ЖИРЫ (Г)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-amber-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.fats} onChange={(e) => handleDraftGoalChange('fats', e.target.value === '' ? '' : parseFloat(e.target.value))} /></div>
                      <div className="col-span-2"><span className="text-[9px] text-zinc-500 font-bold block mb-1">УГЛЕВОДЫ (Г)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-blue-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.carbs} onChange={(e) => handleDraftGoalChange('carbs', e.target.value === '' ? '' : parseFloat(e.target.value))} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ЦЕЛЬ ПО ЖИРУ (%)</span><input type="number" step="0.1" className="w-full bg-[#27272a] rounded-xl p-3 text-amber-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.targetFat} onChange={(e) => handleDraftGoalChange('targetFat', e.target.value === '' ? '' : parseFloat(e.target.value))} /></div>
                      <div><span className="text-[9px] text-zinc-500 font-bold block mb-1">ВОДА (МЛ)</span><input type="number" className="w-full bg-[#27272a] rounded-xl p-3 text-blue-400 font-bold outline-none border border-zinc-700/30 focus:border-indigo-500 transition-colors" value={draftGoals.waterGoal} onChange={(e) => handleDraftGoalChange('waterGoal', e.target.value === '' ? '' : parseInt(e.target.value))} /></div>
                    </div>
                    <p className="text-[10px] text-zinc-600 leading-relaxed px-1">Дефицит и цель калорий связаны: цель = норма − дефицит. Измените дефицит — пересчитается цель, и наоборот.</p>
                    {hasUnsavedGoals && <button onClick={() => setShowGoalModal(true)} className="btn-active w-full bg-indigo-600 text-white p-4 rounded-xl font-bold mt-4 shadow-lg shadow-indigo-900/30 transition-all flex items-center justify-center gap-2"><IconSave className="w-5 h-5" />Сохранить цели</button>}
                  </div>

                  <form onSubmit={handleAddFood} className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-4">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Добавить продукт (на 100г)</h2>
                    <input type="text" placeholder="Название" className="w-full bg-[#27272a] rounded-xl p-3 outline-none text-zinc-200 border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={newFood.name} onChange={(e) => setNewFood({...newFood, name: e.target.value})} required />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="number" step="0.1" placeholder="Ккал" className="w-full bg-[#27272a] rounded-xl p-3 outline-none text-zinc-200 border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={newFood.cals} onChange={(e) => setNewFood({...newFood, cals: e.target.value})} onFocus={(e) => e.target.select()} required />
                      <input type="number" step="0.1" placeholder="Б (г)" className="w-full bg-[#27272a] rounded-xl p-3 outline-none text-zinc-200 border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={newFood.pro} onChange={(e) => setNewFood({...newFood, pro: e.target.value})} onFocus={(e) => e.target.select()} required />
                      <input type="number" step="0.1" placeholder="Ж (г)" className="w-full bg-[#27272a] rounded-xl p-3 outline-none text-zinc-200 border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={newFood.fat} onChange={(e) => setNewFood({...newFood, fat: e.target.value})} onFocus={(e) => e.target.select()} required />
                      <input type="number" step="0.1" placeholder="У (г)" className="w-full bg-[#27272a] rounded-xl p-3 outline-none text-zinc-200 border border-zinc-700/30 focus:border-emerald-500 transition-colors" value={newFood.carb} onChange={(e) => setNewFood({...newFood, carb: e.target.value})} onFocus={(e) => e.target.select()} required />
                    </div>
                    <button type="submit" className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold shadow-lg shadow-emerald-900/20 transition-all">Добавить в базу</button>
                  </form>

                  {false && (
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Резервное копирование</h2>
                    <button onClick={downloadBackup} className="btn-active w-full bg-zinc-800 text-zinc-200 rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" /> Скачать бэкап (JSON)</button>
                    <label className="btn-active w-full bg-zinc-800 text-zinc-200 rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2 cursor-pointer">
                      ♻️ Восстановить из файла
                      <input type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
                    </label>
                    <p className="text-[10px] text-zinc-600 leading-relaxed">JSON — полная копия всех данных. Восстановление дополнит/перезапишет данные аккаунта.</p>
                    <button onClick={importLegacy} className="btn-active w-full bg-zinc-900 text-zinc-400 rounded-xl p-3 text-sm font-bold transition-all border border-zinc-800">⬆️ Перенести из старой версии</button>
                  </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-500 leading-relaxed px-1 mb-1">
                      Отмечайте часто используемые продукты звёздочкой: они появятся в «Избранном» для быстрого выбора в дневнике.<br />
                      ➕ Не нашли нужный продукт? Добавьте свой с КБЖУ через форму выше.
                    </p>
                    <div className="flex items-center justify-between gap-3 px-1 mb-2">
                      <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">База продуктов ({foods.length})</h2>
                      {favoriteFoods.length > 1 && (
                        <button type="button" onClick={() => { setIsReorderingFavorites(!isReorderingFavorites); setDraggingFavoriteId(null); }} className={`btn-active px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${isReorderingFavorites ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-zinc-900 text-zinc-400 border-zinc-800'}`}>
                          {isReorderingFavorites ? 'Готово' : 'Изменить порядок'}
                        </button>
                      )}
                    </div>
                    {isReorderingFavorites && <p className="text-[10px] text-zinc-500 px-1 pb-1">Перетаскивай избранные продукты за ручку ☰. Обычные продукты не двигаются.</p>}
                    {sortedFoods.map(f => (
                      <div
                        key={f.id}
                        data-favorite-id={isReorderingFavorites && f.isFavorite ? f.id : undefined}
                        className={`card-enter list-item-active reorder-item bg-[#18181b] rounded-xl p-3 border ${isReorderingFavorites ? 'select-none' : ''} ${draggingFavoriteId === f.id ? 'reorder-item-active border-emerald-500/70' : 'border-zinc-800/30'}`}
                        style={isReorderingFavorites ? { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } : undefined}
                      >
                        {editingFoodId === f.id ? (
                          <div className="space-y-3">
                             <input autoFocus className="w-full bg-zinc-900 rounded-lg p-2 text-sm text-white border border-indigo-500 outline-none" value={editValue.name} onChange={e => setEditValue({...editValue, name: e.target.value})} />
                             <div className="grid grid-cols-2 gap-2">
                                <input type="number" step="0.1" placeholder="Ккал" className="bg-zinc-900 rounded-lg p-2 text-sm text-emerald-400 outline-none text-center" value={editValue.calories} onChange={e => setEditValue({...editValue, calories: e.target.value})} onFocus={(e) => e.target.select()} />
                                <input type="number" step="0.1" placeholder="Белок" className="bg-zinc-900 rounded-lg p-2 text-sm text-indigo-400 outline-none text-center" value={editValue.protein} onChange={e => setEditValue({...editValue, protein: e.target.value})} onFocus={(e) => e.target.select()} />
                                <input type="number" step="0.1" placeholder="Жиры" className="bg-zinc-900 rounded-lg p-2 text-sm text-amber-400 outline-none text-center" value={editValue.fats} onChange={e => setEditValue({...editValue, fats: e.target.value})} onFocus={(e) => e.target.select()} />
                                <input type="number" step="0.1" placeholder="Углев" className="bg-zinc-900 rounded-lg p-2 text-sm text-blue-400 outline-none text-center" value={editValue.carbs} onChange={e => setEditValue({...editValue, carbs: e.target.value})} onFocus={(e) => e.target.select()} />
                             </div>
                             <button onClick={() => updateFoodBase(f.id)} className="btn-active w-full bg-emerald-600 p-2 rounded-lg flex justify-center transition-all"><IconCheck className="w-5 h-5 text-white" /></button>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center cursor-pointer">
                            <div className="flex items-center">
                              <button onClick={(e) => toggleFavorite(e, f.id)} className="btn-active p-2 pl-0 transition-colors">
                                <IconStar className={`w-6 h-6 ${f.isFavorite ? 'text-amber-400' : 'text-zinc-700'}`} fill={f.isFavorite ? "currentColor" : "none"} />
                              </button>
                              {isReorderingFavorites && f.isFavorite && (
                                <button
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  onContextMenu={(e) => e.preventDefault()}
                                  onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDraggingFavoriteId(f.id); e.currentTarget.setPointerCapture?.(e.pointerId); }}
                                  onPointerMove={(e) => { if (draggingFavoriteId) { e.preventDefault(); moveFavoritePointer(e.clientX, e.clientY); } }}
                                  onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.releasePointerCapture?.(e.pointerId); setDraggingFavoriteId(null); }}
                                  onPointerCancel={() => setDraggingFavoriteId(null)}
                                  className={`btn-active drag-handle mr-2 px-3 py-3 rounded-xl bg-zinc-900 text-zinc-400 active:text-zinc-100 cursor-grab touch-none ${draggingFavoriteId === f.id ? 'drag-handle-active' : ''}`}
                                  style={{ WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none', touchAction: 'none' }}
                                  title="Перетащить избранное"
                                >
                                  ☰
                                </button>
                              )}
                            </div>
                            <div className="flex-1" onClick={() => { if (!isReorderingFavorites && (!f._shared || isOwner)) { setEditingFoodId(f.id); setEditValue({ ...f, fats: f.fats || 0, carbs: f.carbs || 0 }); } }}>
                              <span className="text-sm font-medium border-b border-zinc-800/50 pb-0.5">{f.name}{f._shared && <span className="ml-2 text-[9px] text-zinc-600 uppercase tracking-wider">база</span>}</span>
                              <div className="flex gap-3 text-[10px] font-bold uppercase mt-1.5 opacity-80">
                                <span className="text-emerald-500">{f.calories}</span>
                                <span className="text-indigo-500">Б: {f.protein}</span>
                                <span className="text-amber-500">Ж: {f.fats}</span>
                                <span className="text-blue-500">У: {f.carbs}</span>
                              </div>
                            </div>
                            {(!f._shared || isOwner) && <button onClick={(e) => deleteFood(e, f.id)} className="btn-active text-zinc-800 active:text-red-500 p-2 transition-colors"><IconTrash className="w-5 h-5" /></button>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {isOwner && (
                    <button type="button" onClick={publishSharedBase} className="btn-active w-full bg-indigo-600/15 text-indigo-300/90 border border-indigo-600/30 rounded-2xl p-3 text-[11px] font-bold uppercase tracking-widest transition-all">
                      Опубликовать базу для всех ({foods.length})
                    </button>
                  )}

                </div>
              )}
              </motion.div>
              </AnimatePresence>
            </main>

            <AnimatePresence>
              {isDrawerOpen && (
                <motion.div
                  key="drawer-overlay"
                  className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex justify-end"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={closeDrawer}
                >
                  <motion.aside
                    className="drawer-panel h-full w-[84%] max-w-[360px] bg-[#18181b] border-l border-zinc-800/50 shadow-2xl p-4 flex flex-col"
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={{ left: 0, right: 0.18 }}
                    onDragEnd={(_, info) => {
                      if (info.offset.x > 80 || info.velocity.x > 500) closeDrawer();
                    }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-3 mb-5 pt-[max(0px,env(safe-area-inset-top))]">
                      <div className="min-w-0">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">MoteoTracker</p>
                        <p className="text-sm font-bold text-zinc-200 truncate">{auth.currentUser?.email || userEmail || 'Профиль'}</p>
                      </div>
                      <button type="button" onClick={closeDrawer} className="btn-active shrink-0 w-10 h-10 bg-zinc-800 rounded-xl text-zinc-300 border border-zinc-800/50 flex items-center justify-center cursor-pointer" aria-label="Закрыть меню"><IconClose className="w-5 h-5" /></button>
                    </div>

                    <div className="space-y-2">
                      {drawerItems.map(({ key, label, icon: DrawerIcon, onClick, active, badge }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={onClick}
                          className={`drawer-item btn-active w-full flex items-center justify-between gap-3 rounded-2xl p-3 border text-left transition-all cursor-pointer ${active ? 'drawer-item-active bg-emerald-600/15 border-emerald-600/30 text-emerald-300' : 'bg-[#27272a] border-zinc-700/30 text-zinc-300'}`}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? 'bg-emerald-600/20' : 'bg-zinc-900/50'}`}><DrawerIcon className="w-5 h-5" /></span>
                            <span className="text-sm font-bold truncate">{label}</span>
                          </span>
                          {badge > 0 && <span className="shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">+{badge}</span>}
                        </button>
                      ))}
                    </div>

                    <div className="mt-auto pt-4 space-y-3">
                      <button type="button" onClick={applyAppUpdate} disabled={isApplyingUpdate} className={`btn-active w-full rounded-2xl p-3 font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${appUpdate ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-zinc-100 border border-zinc-700/40'}`}>
                        {appUpdate ? <IconDownload className="w-5 h-5" /> : <IconRefresh className="w-5 h-5" />}
                        {isApplyingUpdate ? 'Обновляем…' : 'Обновить приложение'}
                      </button>
                      <button type="button" onClick={signOutFromDrawer} className="drawer-item btn-active w-full flex items-center gap-3 rounded-2xl p-3 border bg-[#27272a] border-zinc-700/30 text-red-400 text-left transition-all cursor-pointer">
                        <span className="w-10 h-10 rounded-xl bg-zinc-900/50 flex items-center justify-center shrink-0"><IconLogOut className="w-5 h-5" /></span>
                        <span className="text-sm font-bold">Выход</span>
                      </button>
                      <p className="text-[10px] text-zinc-600 text-center">v{APP_VERSION}</p>
                    </div>
                  </motion.aside>
                </motion.div>
              )}
            </AnimatePresence>

            <nav className="bottom-nav shrink-0 bg-[#09090b] flex justify-around gap-1 px-1 pb-2 pt-2 safe-pb relative z-40 border-t border-zinc-900">
              <button onClick={() => setActiveTab('diary')} className={`btn-active flex-1 flex flex-col items-center py-2 transition-all rounded-xl ${activeTab === 'diary' ? 'text-emerald-400 bg-zinc-900/50' : 'text-zinc-600'}`}>
                <IconCalendar className="w-6 h-6" /><span className="text-[9px] font-bold mt-1 uppercase tracking-widest">Дневник</span>
              </button>
              <button onClick={() => setActiveTab('progress')} className={`btn-active flex-1 flex flex-col items-center py-2 transition-all rounded-xl ${activeTab === 'progress' ? 'text-violet-300 bg-zinc-900/50' : 'text-zinc-600'}`}>
                <IconCamera className="w-6 h-6" /><span className="text-[9px] font-bold mt-1 uppercase tracking-widest">Прогресс</span>
              </button>
              <button onClick={() => setActiveTab('directory')} className={`btn-active flex-1 flex flex-col items-center py-2 transition-all rounded-xl ${activeTab === 'directory' ? 'text-indigo-400 bg-zinc-900/50' : 'text-zinc-600'}`}>
                <IconBook className="w-6 h-6" /><span className="text-[9px] font-bold mt-1 uppercase tracking-widest">База</span>
              </button>
            </nav>

            {/* Модалки */}
            <AnimatePresence>
            {showExtraActivityModal && (
              <motion.div key="extra-activity" className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.div className="bg-[#18181b] p-5 rounded-3xl border border-zinc-800 w-full max-w-sm max-h-[90vh] overflow-y-auto" initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-lg font-bold">Дополнительная активность</h3>
                      <p className="text-xs text-zinc-500 mt-1 leading-relaxed">Добавит калории только к выбранному дню, без изменения профиля и шагов.</p>
                    </div>
                    <button type="button" onClick={closeExtraActivityModal} className="btn-active shrink-0 w-10 h-10 bg-zinc-800 rounded-xl text-zinc-300 border border-zinc-800/50 flex items-center justify-center cursor-pointer" aria-label="Закрыть"><IconClose className="w-5 h-5" /></button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold block mb-2 tracking-widest">Тип активности</p>
                      <div className="grid grid-cols-2 gap-2">
                        {EXTRA_ACTIVITY_TYPES.map((activity) => {
                          const active = extraActivityDraft.type === activity.key;
                          return (
                            <button
                              key={activity.key}
                              type="button"
                              onClick={() => setExtraActivityType(activity.key)}
                              aria-pressed={active}
                              className={`btn-active cursor-pointer rounded-xl p-2.5 text-left border transition-all ${active ? 'bg-emerald-600/15 border-emerald-600/40 text-emerald-300' : 'bg-[#27272a] border-zinc-700/30 text-zinc-300'}`}
                            >
                              <span className="text-xs font-bold block">{activity.label}</span>
                              <span className="text-[9px] text-zinc-500 leading-tight mt-1 block">{activity.hint}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <label className="block">
                      <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-1 tracking-widest">Калории</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="1"
                        className={`w-full bg-[#27272a] rounded-xl p-4 text-zinc-100 font-black text-lg outline-none border transition-colors ${extraActivityError ? 'border-red-500' : 'border-zinc-700/30 focus:border-emerald-500'}`}
                        value={extraActivityDraft.calories}
                        onChange={(e) => { setExtraActivityDraft({ ...extraActivityDraft, calories: e.target.value }); setExtraActivityError(''); }}
                        onFocus={(e) => e.target.select()}
                      />
                    </label>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">{extraActivitySelectedType.hint}. Значение можно изменить вручную.</p>
                    {extraActivityError && <p className="text-xs text-red-400 font-bold" role="alert">{extraActivityError}</p>}
                    {extraActivityWarning && <p className="text-xs text-amber-300 font-bold leading-relaxed" role="status">{extraActivityWarning}</p>}

                    <div className="flex gap-3 pt-1">
                      <button type="button" onClick={closeExtraActivityModal} className="btn-active flex-1 p-4 rounded-xl bg-zinc-800 font-bold text-zinc-300 transition-all">Не добавлять</button>
                      <button type="button" onClick={saveExtraActivity} className="btn-active flex-1 p-4 rounded-xl bg-emerald-600 font-bold text-white transition-all">{editingExtraActivityId ? 'Сохранить' : 'Добавить калории'}</button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>

            <AnimatePresence>
            {showExportModal && (
              <motion.div key="export" className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.div className="bg-[#18181b] p-6 rounded-3xl border border-zinc-800 w-full max-w-sm" initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                  <h3 className="text-lg font-bold mb-4 text-center">Выгрузка данных</h3>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Начало периода</label>
                      <div className="relative w-full bg-[#27272a] rounded-xl p-4 flex items-center justify-center border border-zinc-700/50">
                        <span className="text-zinc-200 font-bold">{displayDate(exportStart)}</span>
                        <input type="date" className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" value={exportStart} onChange={(e) => { if(e.target.value) setExportStart(e.target.value); }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase font-bold block mb-1">Конец периода</label>
                      <div className="relative w-full bg-[#27272a] rounded-xl p-4 flex items-center justify-center border border-zinc-700/50">
                        <span className="text-zinc-200 font-bold">{displayDate(exportEnd)}</span>
                        <input type="date" className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" value={exportEnd} max={getDefaultExportEndDate()} onChange={(e) => { if(e.target.value) setExportEnd(e.target.value); }} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button onClick={() => { setShowExportModal(false); downloadCSV(); }} className="btn-active w-full p-4 rounded-xl bg-blue-600 font-bold text-white transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" /> Скачать CSV (для Excel / анализа)</button>
                    <div className="flex gap-3">
                      <button onClick={() => setShowExportModal(false)} className="btn-active flex-1 p-4 rounded-xl bg-zinc-800 font-bold text-zinc-300 transition-all">Отмена</button>
                      <button onClick={startExport} className="btn-active flex-1 p-4 rounded-xl bg-emerald-600 font-bold text-white transition-all">PDF-отчёт</button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>

            <AnimatePresence>
            {showGoalModal && (
              <motion.div key="goal" className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.div className="bg-[#18181b] p-6 rounded-3xl border border-zinc-800 w-full max-w-sm" initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                  <h3 className="text-lg font-bold mb-3 text-center">Применить цели?</h3>
                  <p className="text-zinc-400 text-sm mb-6 text-center leading-relaxed">Выберите, с какого момента изменятся цели по КБЖУ</p>
                  <div className="flex flex-col gap-3">
                    <button onClick={() => confirmGoalSave('today')} className="btn-active w-full p-4 rounded-xl bg-emerald-600 font-bold text-white transition-all">Только с этого дня</button>
                    <button onClick={() => confirmGoalSave('all')} className="btn-active w-full p-4 rounded-xl bg-zinc-800 font-bold text-zinc-200 transition-all">Применить ко всей истории</button>
                    <button onClick={() => setShowGoalModal(false)} className="btn-active w-full p-4 rounded-xl border border-zinc-800 text-zinc-500 font-bold mt-2 transition-all">Отмена</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>

            {/* Модалка: новый спор */}
            <AnimatePresence>
            {showChallengeModal && (
              <motion.div key="challenge" className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.div className="bg-[#18181b] p-6 rounded-3xl border border-zinc-800 w-full max-w-sm max-h-[88vh] overflow-y-auto" initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                  <h3 className="text-lg font-bold mb-4 text-center flex items-center justify-center gap-2"><IconTrophy className="w-5 h-5 text-amber-400" /> Новый спор</h3>
                  <div className="space-y-3">
                    <div>
                      <span className="text-[9px] text-zinc-500 font-bold block mb-1">СОПЕРНИК</span>
                      <select className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30" value={challengeDraft.friendUid} onChange={(e) => setChallengeDraft({ ...challengeDraft, friendUid: e.target.value })}>
                        <option value="">— выберите —</option>
                        {acceptedFriends.map(c => { const fid = otherUid(c); return <option key={fid} value={fid}>{friendName(fid)}</option>; })}
                      </select>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-500 font-bold block mb-1">ТИП СПОРА</span>
                      <div className="grid grid-cols-2 gap-2">
                        {CHALLENGE_TYPES.map(t => (
                          <button key={t.key} type="button" onClick={() => setChallengeDraft({ ...challengeDraft, type: t.key })} className={`btn-active rounded-xl p-2.5 text-xs font-bold border transition-all ${challengeDraft.type === t.key ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{t.short}</button>
                        ))}
                      </div>
                      <p className="text-[10px] text-zinc-600 mt-1.5">{challengeType(challengeDraft.type).help}</p>
                    </div>
                    {(() => {
                      const tp = challengeType(challengeDraft.type);
                      const myCur = myStatsNow[tp.metric];
                      const frCur = friendMetricNow(challengeDraft.friendUid, tp.metric);
                      const fmt = (v) => typeof v === 'number' ? Math.round(v * 10) / 10 : null;
                      return (
                        <div>
                          <span className="text-[9px] text-zinc-500 font-bold block mb-1">ЦЕЛИ — у каждого своя ({tp.dir === 'down' ? 'не выше' : 'не ниже'}), {tp.unit}</span>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[10px] text-zinc-400 font-bold block mb-1 truncate">Вы{fmt(myCur) != null ? ` · сейчас ${fmt(myCur)}` : ''}</span>
                              <input type="number" inputMode="decimal" placeholder="—" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500" value={challengeDraft.myTarget} onChange={(e) => setChallengeDraft({ ...challengeDraft, myTarget: e.target.value })} onFocus={(e) => e.target.select()} />
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-400 font-bold block mb-1 truncate">{challengeDraft.friendUid ? friendName(challengeDraft.friendUid) : 'Соперник'}{fmt(frCur) != null ? ` · ${fmt(frCur)}` : ''}</span>
                              <input type="number" inputMode="decimal" placeholder="необязательно" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500" value={challengeDraft.friendTarget} onChange={(e) => setChallengeDraft({ ...challengeDraft, friendTarget: e.target.value })} onFocus={(e) => e.target.select()} />
                            </div>
                          </div>
                          <p className="text-[10px] text-zinc-600 mt-1.5">Цель соперника — лишь предложение: он подтвердит или изменит её, когда примет вызов.</p>
                        </div>
                      );
                    })()}
                    <div>
                      <span className="text-[9px] text-zinc-500 font-bold block mb-1">СРОК</span>
                      <div className="relative w-full bg-[#27272a] rounded-xl p-3 flex items-center justify-center border border-zinc-700/30">
                        <span className="text-zinc-200 font-bold">{challengeDraft.deadline ? displayDate(challengeDraft.deadline) : 'выберите дату'}</span>
                        <input type="date" className="absolute opacity-0 top-0 left-0 w-full h-full cursor-pointer" value={challengeDraft.deadline} min={getLocalDateString(new Date(Date.now() + 86400000))} onChange={(e) => { if (e.target.value) setChallengeDraft({ ...challengeDraft, deadline: e.target.value }); }} />
                      </div>
                    </div>
                    {challengeSafetyWarning && (
                      <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3 flex gap-2 items-start">
                        <IconTimer className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-200/90 leading-relaxed">{challengeSafetyWarning}</p>
                      </div>
                    )}
                    <button type="button" onClick={createChallenge} disabled={!challengeDraft.friendUid || challengeDraft.myTarget === '' || !challengeDraft.deadline} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all disabled:opacity-35">Бросить вызов</button>
                    <button type="button" onClick={() => setShowChallengeModal(false)} className="btn-active w-full border border-zinc-800 text-zinc-500 rounded-xl p-3 font-bold transition-all">Отмена</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>

            {/* Модалка: принять вызов — соперник задаёт СВОЮ цель */}
            <AnimatePresence>
            {showAcceptModal && (() => {
              const c = challenges.find(x => x.id === acceptDraft.challengeId);
              const tp = c ? challengeType(c.type) : null;
              const myCur = tp ? myStatsNow[tp.metric] : null;
              const fmt = (v) => typeof v === 'number' ? Math.round(v * 10) / 10 : null;
              return (
              <motion.div key="accept-challenge" className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.div className="bg-[#18181b] p-6 rounded-3xl border border-zinc-800 w-full max-w-sm" initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                  <h3 className="text-lg font-bold mb-1 text-center flex items-center justify-center gap-2"><IconTrophy className="w-5 h-5 text-amber-400" /> Принять вызов</h3>
                  {tp && (
                    <>
                      <p className="text-zinc-500 text-xs mb-4 text-center leading-relaxed">{tp.label}. Задайте свою цель ({tp.dir === 'down' ? 'не выше' : 'не ниже'}), {tp.unit}.</p>
                      <div className="space-y-3">
                        <div>
                          <span className="text-[10px] text-zinc-400 font-bold block mb-1">Ваша цель{fmt(myCur) != null ? ` · сейчас ${fmt(myCur)} ${tp.unit}` : ''}</span>
                          <input type="number" inputMode="decimal" placeholder="—" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500" value={acceptDraft.myTarget} onChange={(e) => setAcceptDraft({ ...acceptDraft, myTarget: e.target.value })} onFocus={(e) => e.target.select()} />
                        </div>
                        <button type="button" onClick={confirmAcceptChallenge} disabled={acceptDraft.myTarget === ''} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all disabled:opacity-35">Принять и начать</button>
                        <button type="button" onClick={() => setShowAcceptModal(false)} className="btn-active w-full border border-zinc-800 text-zinc-500 rounded-xl p-3 font-bold transition-all">Отмена</button>
                      </div>
                    </>
                  )}
                </motion.div>
              </motion.div>
              );
            })()}
            </AnimatePresence>

            <ConfirmModal state={confirmState} onResolve={resolveConfirm} />
            <Toasts toasts={toasts} onDismiss={(id) => setToasts(prev => prev.filter(x => x.id !== id))} />

            {/* Модалка: онбординг при регистрации (данные для КБЖУ + минимум шагов) */}
            <AnimatePresence>
            {showOnboarding && (
              <motion.div key="onboarding" className="fixed inset-0 bg-black/85 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.div className="bg-[#18181b] p-6 rounded-3xl border border-zinc-800 w-full max-w-sm max-h-[90vh] overflow-y-auto" initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                  <h3 className="text-lg font-bold mb-1 text-center">Расскажите о себе</h3>
                  <p className="text-zinc-500 text-xs mb-4 text-center leading-relaxed">По этим данным посчитаем вашу норму КБЖУ. Можно поменять позже в профиле.</p>
                  <div className="space-y-3">
                    <div>
                      <span className="text-[9px] text-zinc-500 font-bold block mb-1">ПОЛ</span>
                      <div className="grid grid-cols-2 gap-2">
                        {[['male', 'Мужской'], ['female', 'Женский']].map(([k, l]) => (
                          <button key={k} type="button" onClick={() => setOnboardDraft({ ...onboardDraft, sex: k })} className={`btn-active rounded-xl p-3 text-sm font-bold border transition-all ${onboardDraft.sex === k ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-[9px] text-zinc-500 font-bold">Возраст<input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 mt-1" value={onboardDraft.age} onChange={(e) => setOnboardDraft({ ...onboardDraft, age: e.target.value })} /></label>
                      <label className="text-[9px] text-zinc-500 font-bold">Рост, см<input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 mt-1" value={onboardDraft.height} onChange={(e) => setOnboardDraft({ ...onboardDraft, height: e.target.value })} /></label>
                      <label className="text-[9px] text-zinc-500 font-bold">Вес, кг<input type="number" inputMode="decimal" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 mt-1" value={onboardDraft.weight} onChange={(e) => setOnboardDraft({ ...onboardDraft, weight: e.target.value })} /></label>
                    </div>
                    <div>
                      <span className="text-[9px] text-zinc-500 font-bold block mb-1">АКТИВНОСТЬ</span>
                      <p className="text-[10px] text-zinc-600 leading-relaxed mb-2">
                        Уровень добавляет фиксированные калории за NEAT/работу/тренировки. Шаги считаются отдельно: шаги × 0.04 ккал.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {ACTIVITY_LEVELS.map(l => (
                          <button key={l.key} type="button" onClick={() => setOnboardDraft({ ...onboardDraft, activity: l.key })} className={`btn-active text-left rounded-xl p-2.5 border transition-all ${normalizeActivityKey(onboardDraft.activity) === l.key ? 'bg-emerald-600/15 border-emerald-600/40' : 'bg-[#27272a] border-zinc-700/30'}`}>
                            <span className={`text-xs font-bold block ${normalizeActivityKey(onboardDraft.activity) === l.key ? 'text-emerald-300' : 'text-zinc-200'}`}>{l.label}</span>
                            <span className="text-[9px] text-zinc-500">{l.hint} · +{l.activityCalories} ккал</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[9px] text-zinc-500 font-bold">Дефицит, ккал/день<input type="number" inputMode="numeric" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 mt-1" value={onboardDraft.deficit} onChange={(e) => setOnboardDraft({ ...onboardDraft, deficit: e.target.value })} /></label>
                      <label className="text-[9px] text-zinc-500 font-bold">Обычно шагов/день<input type="number" inputMode="numeric" min="0" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500 mt-1" value={onboardDraft.usualSteps} onChange={(e) => setOnboardDraft({ ...onboardDraft, usualSteps: e.target.value })} /></label>
                    </div>
                    {(() => { const k = computeKbju({ ...onboardDraft }); return k ? <p className="text-[11px] text-emerald-400 font-bold text-center">Ваша норма ≈ {k.calories} ккал/день</p> : <p className="text-[10px] text-zinc-600 text-center">Заполните возраст, рост и вес — покажем норму.</p>; })()}
                    <button type="button" onClick={finishOnboarding} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all">Готово</button>
                    <button type="button" onClick={() => setShowOnboarding(false)} className="btn-active w-full text-zinc-500 text-xs p-1">Заполнить позже</button>
                    <p className="text-zinc-600 text-[10px] text-center leading-relaxed">Расчёты — ориентировочные, не медицинская рекомендация.</p>
                  </div>
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>

            {/* Модалка: текст → продукты для дневника */}
            <AnimatePresence>
            {showMealAiModal && (
              <motion.div key="meal-ai" className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <motion.div className="bg-[#18181b] p-6 rounded-3xl border border-zinc-800 w-full max-w-sm max-h-[88vh] overflow-y-auto" initial={{ opacity: 0, scale: 0.9, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 12 }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
                  <h3 className="text-lg font-bold mb-1 text-center flex items-center justify-center gap-2"><IconSparkles className="w-5 h-5 text-indigo-400" /> Распознать продукты</h3>
                  <p className="text-zinc-500 text-xs mb-4 text-center leading-relaxed">Введите продукт или список продуктов. Сначала покажу КБЖУ на 100 г, затем попрошу вес порции.</p>
                  <textarea rows={5} maxLength={MAX_FOOD_TEXT_LENGTH} placeholder={'Например:\nПицца Маргарита\nили\nтворог 5% 250 г, банан 100 г'} className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 text-sm outline-none border border-zinc-700/30 focus:border-emerald-500 resize-none" value={mealAiText} onChange={(e) => setMealAiText(e.target.value)} />
                  <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-zinc-500">
                    <span>Пустой вес нужно уточнить перед добавлением.</span>
                    <span aria-live="polite">{mealAiText.length}/{MAX_FOOD_TEXT_LENGTH}</span>
                  </div>
                  <button type="button" onClick={runMealAi} disabled={mealAiBusy || !mealAiText.trim() || mealAiText.length > MAX_FOOD_TEXT_LENGTH} className="btn-active w-full mt-3 bg-indigo-600 text-white rounded-xl p-3 font-bold transition-all disabled:opacity-35 flex items-center justify-center gap-2">
                    {mealAiBusy ? 'Распознаём продукты…' : <><IconSparkles className="w-5 h-5" /> Распознать</>}
                  </button>
                  {mealAiBusy && <p className="text-indigo-300 text-xs mt-3 text-center" role="status" aria-live="polite">Распознаём продукты…</p>}
                  {mealAiError && <p className="text-red-400 text-xs mt-3 leading-relaxed" role="alert">{mealAiError}</p>}
                  {mealAiItems && mealAiItems.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Распознано · сначала КБЖУ на 100 г, затем вес порции</p>
                      {mealAiItems.map((it, i) => {
                        const food = it.matchedFoodId ? (foods.find(f => f.id === it.matchedFoodId) || it.food) : (it.status === 'estimated' ? it.food : null);
                        const canAskWeight = Boolean(food && it.status !== 'estimated');
                        const grams = evaluateMath(String(it.grams || ''));
                        const portion = canAskWeight && Number.isFinite(grams) && grams > 0 ? calculateFoodPortion(food, grams) : null;
                        const statusLabel = it.status === 'estimated' ? 'Нет в базе · AI-оценка' : it.status === 'created' ? 'в базе' : it.status === 'found' ? 'в базе' : 'проверка';
                        const statusClass = it.status === 'estimated' ? 'text-amber-300' : (it.status === 'created' || it.status === 'found') ? 'text-emerald-300' : 'text-zinc-500';
                        return (
                        <div key={`${it.name}-${i}`} className="rounded-xl p-3 border bg-[#27272a] border-zinc-700/30 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-zinc-100 truncate">{it.name}</p>
                              <p className="text-xs text-zinc-400 mt-0.5">Распознано: {formatParsedFoodAmount(it)}</p>
                            </div>
                            <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider ${statusClass}`}>{statusLabel}</span>
                          </div>

                          <p className={`text-[10px] leading-relaxed ${it.status === 'estimated' ? 'text-amber-300' : (it.status === 'created' || it.status === 'found') ? 'text-emerald-300' : 'text-zinc-400'}`}>
                            {it.statusText}
                          </p>

                          {it.status === 'found' && (
                            <p className="text-[10px] text-emerald-300 leading-relaxed">
                              Этот продукт уже у вас в базе есть. Сколько граммов вы съели этого продукта?
                            </p>
                          )}

                          {it.status === 'suggestions' && (
                            <div className="space-y-2">
                              <p className="text-[10px] text-amber-300 leading-relaxed">Похоже, это один из продуктов. Выберите совпадение, чтобы не создавать дубль:</p>
                              <div className="flex flex-col gap-2">
                                {(it.suggestions || []).map(s => (
                                  <button key={s.id} type="button" onClick={() => selectMealAiSuggestion(i, s)} className="btn-active text-left bg-zinc-900 rounded-lg p-2 border border-zinc-700/30 text-xs font-bold text-zinc-200">
                                    {s.name}
                                  </button>
                                ))}
                              </div>
                              {it.needsChoice && <p className="text-[10px] text-amber-300" role="alert">Сначала выберите продукт из списка.</p>}
                            </div>
                          )}

                          {food ? (
                            <>
                              <div className="bg-zinc-900/70 rounded-xl p-3 border border-zinc-700/30">
                                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mb-2">КБЖУ на 100 г</p>
                                <div className="grid grid-cols-4 gap-2 text-center">
                                  <div><p className="text-sm font-black text-emerald-400">{Math.round(food.calories || 0)}</p><p className="text-[9px] text-zinc-500">ккал</p></div>
                                  <div><p className="text-sm font-black text-indigo-400">{Math.round(food.protein || 0)}</p><p className="text-[9px] text-zinc-500">белки</p></div>
                                  <div><p className="text-sm font-black text-amber-400">{Math.round(food.fats || 0)}</p><p className="text-[9px] text-zinc-500">жиры</p></div>
                                  <div><p className="text-sm font-black text-blue-400">{Math.round(food.carbs || 0)}</p><p className="text-[9px] text-zinc-500">углев.</p></div>
                                </div>
                              </div>

                              {it.status === 'estimated' ? (
                                <div className="space-y-2">
                                  <p className="text-[10px] text-zinc-400 leading-relaxed">Я рассчитал примерное КБЖУ на 100 г. Проверьте значения и добавьте продукт в базу.</p>
                                  {it.isEditingNutrition && (
                                    <div className="grid grid-cols-2 gap-2">
                                      <input type="number" step="0.1" inputMode="decimal" placeholder="Ккал" className="bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border border-zinc-700/30 focus:border-emerald-500" value={it.nutritionDraft?.calories ?? ''} onChange={(e) => updateMealAiNutritionDraft(i, 'calories', e.target.value)} />
                                      <input type="number" step="0.1" inputMode="decimal" placeholder="Белки" className="bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border border-zinc-700/30 focus:border-emerald-500" value={it.nutritionDraft?.protein ?? ''} onChange={(e) => updateMealAiNutritionDraft(i, 'protein', e.target.value)} />
                                      <input type="number" step="0.1" inputMode="decimal" placeholder="Жиры" className="bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border border-zinc-700/30 focus:border-emerald-500" value={it.nutritionDraft?.fats ?? ''} onChange={(e) => updateMealAiNutritionDraft(i, 'fats', e.target.value)} />
                                      <input type="number" step="0.1" inputMode="decimal" placeholder="Углеводы" className="bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border border-zinc-700/30 focus:border-emerald-500" value={it.nutritionDraft?.carbs ?? ''} onChange={(e) => updateMealAiNutritionDraft(i, 'carbs', e.target.value)} />
                                    </div>
                                  )}
                                  {it.nutritionError && <p className="text-[10px] text-amber-300" role="alert">{it.nutritionError}</p>}
                                  {it.needsBaseConfirm && <p className="text-[10px] text-amber-300" role="alert">Сначала добавьте продукт в базу.</p>}
                                  <div className="grid grid-cols-1 gap-2">
                                    {it.isEditingNutrition ? (
                                      <button type="button" onClick={() => saveMealAiNutritionDraft(i)} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Сохранить КБЖУ</button>
                                    ) : (
                                      <button type="button" onClick={() => addMealAiEstimatedFoodToBase(i)} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">Добавить в базу</button>
                                    )}
                                    <button type="button" onClick={() => editMealAiEstimatedFood(i)} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Изменить КБЖУ</button>
                                    <button type="button" onClick={() => cancelMealAiItem(i)} className="btn-active w-full text-zinc-500 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">Отмена</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <label className="block text-[10px] text-zinc-500 font-bold">
                                    Сколько грамм вы съели?
                                    <div className="mt-1 flex items-center gap-2">
                                      <input type="number" min="0" step="0.1" inputMode="decimal" placeholder="Например, 150" className={`flex-1 min-w-0 bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border ${it.needsWeight ? 'border-amber-400' : 'border-zinc-700/30'} focus:border-emerald-500`} value={it.grams} onChange={(e) => updateMealAiItem(i, { grams: e.target.value, needsWeight: false, portionError: '' })} />
                                      <span className="shrink-0 text-xs font-bold text-zinc-500">г</span>
                                    </div>
                                  </label>

                                  {it.amount_g === null && <p className="text-[10px] text-amber-300 leading-relaxed">{it.unit === 'pcs' ? 'Количество штук не переводим в граммы автоматически.' : it.unit === 'ml' || it.unit === 'l' ? 'Объём не переводим в граммы без отдельной логики плотности.' : 'Укажите граммовку перед расчётом КБЖУ.'}</p>}
                                  {it.portionError && <p className="text-[10px] text-amber-300" role="alert">{it.portionError}</p>}
                                  {portion && (
                                    <p className="text-[10px] text-zinc-400 leading-relaxed">
                                      Итого за {grams} г: <span className="font-bold text-zinc-200">{portion.calories} ккал</span> · Б {portion.protein} · Ж {portion.fats} · У {portion.carbs}
                                    </p>
                                  )}
                                  {it.added ? <p className="text-xs font-bold text-emerald-300 flex items-center gap-1"><IconCheck className="w-4 h-4" /> {it.addedMessage || 'Добавлено в дневник'}</p> : (
                                    <button type="button" onClick={() => addMealAiItemToDiary(i)} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">
                                      Добавить в дневник
                                    </button>
                                  )}
                                </>
                              )}
                            </>
                          ) : it.status !== 'suggestions' && (
                            <>
                              <p className="text-[10px] text-zinc-400 leading-relaxed">Уточните продукт или блюдо, например: курица с рисом, омлет, пицца Маргарита. Ручное добавление остаётся запасным вариантом.</p>
                              <button type="button" onClick={() => moveMealAiItemToManualEntry(it)} className="btn-active w-full bg-zinc-900 text-zinc-200 border border-zinc-700/30 rounded-lg p-2.5 text-xs font-bold transition-all">
                                Добавить продукт вручную
                              </button>
                            </>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                  <button type="button" onClick={() => { setShowMealAiModal(false); setMealAiText(''); setMealAiItems(null); setMealAiError(''); }} className="btn-active w-full mt-3 border border-zinc-800 text-zinc-500 rounded-xl p-3 font-bold transition-all">Закрыть</button>
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>


            <AnimatePresence>
            {showBodyPhotoCompare && (
              <motion.div key="photo-compare" className="fixed inset-0 z-[70] bg-black text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                  <button type="button" onClick={() => setShowBodyPhotoCompare(false)} className="btn-active rounded-full bg-black/60 border border-white/10 px-4 py-2 text-xs font-black backdrop-blur-md">Закрыть</button>
                  <button type="button" onClick={() => setBodyPhotoZoom(prev => !prev)} className="btn-active rounded-full bg-white/12 border border-white/10 px-4 py-2 text-xs font-black backdrop-blur-md">{bodyPhotoZoom ? 'Обычный' : 'Ближе'}</button>
                </div>

                <div className="grid grid-rows-2 gap-px flex-1 min-h-0 bg-zinc-900">
                  {[[compareBodyA, comparePhotoA], [compareBodyB, comparePhotoB]].map(([entry, photo], idx) => (
                    <div key={entry?.id || idx} className="relative overflow-hidden bg-black flex items-center justify-center" onClick={() => setBodyPhotoZoom(prev => !prev)}>
                      {getBodyPhotoSrc(photo) ? (
                        <img
                          src={getBodyPhotoSrc(photo)}
                          className={`h-full w-full object-contain transition-transform duration-300 ${bodyPhotoZoom ? 'scale-125' : 'scale-100'}`}
                          style={{ transformOrigin: 'center center' }}
                        />
                      ) : (
                        <div className="px-3 text-center text-xs font-bold text-zinc-500">Нет фото</div>
                      )}
                      <div className="absolute left-3 top-14 inline-flex flex-col rounded-2xl bg-black/25 px-3 py-2 backdrop-blur-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/55 leading-none">{idx === 0 ? 'Было' : 'Стало'}</p>
                        <p className="text-[9px] font-bold text-white/35 mt-1 leading-none">{entry ? `${displayDate(entry.date)} · ${getBodyPhotoLabel(photo, comparePhotoIndexes[idx])}` : '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            </AnimatePresence>

            <AnimatePresence>
            {singleBodyPhoto && (
              <motion.div key="single-photo" className="fixed inset-0 z-[75] bg-black text-white flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }} initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
                  <button type="button" onClick={() => setSingleBodyPhoto(null)} className="btn-active rounded-full bg-black/60 border border-white/10 px-4 py-2 text-xs font-black backdrop-blur-md">Закрыть</button>
                  <button type="button" onClick={() => setSingleBodyPhotoZoom(prev => !prev)} className="btn-active rounded-full bg-white/12 border border-white/10 px-4 py-2 text-xs font-black backdrop-blur-md">{singleBodyPhotoZoom ? 'Целиком' : 'Ближе'}</button>
                </div>
                <button type="button" onClick={() => setSingleBodyPhotoZoom(prev => !prev)} className="relative flex-1 min-h-0 p-0 bg-black overflow-hidden">
                  <img src={singleBodyPhoto.src} className={`w-full h-full object-contain transition-transform duration-300 ${singleBodyPhotoZoom ? 'scale-125' : 'scale-100'}`} />
                  <span className="absolute left-3 bottom-4 rounded-full bg-black/25 border border-white/5 px-3 py-1.5 text-[10px] font-bold text-white/45 backdrop-blur-sm">{displayDate(singleBodyPhoto.date)} · {singleBodyPhoto.label || 'Фото'}</span>
                </button>
              </motion.div>
            )}
            </AnimatePresence>
        </div>
      );
    }

export default App;
