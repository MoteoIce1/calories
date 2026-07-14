import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import firebase, { db, auth, functions, profileRef, dayRef, daysCol, bodyCol, bodyDocRef, OWNER_EMAIL, sharedFoodsRef, legacyRef, publicProfileRef, publicProfilesCol, connectionsCol, connectionRef, challengesCol, challengeRef } from './firebase.js';
import { motion, AnimatePresence } from 'framer-motion';
import { evaluateMath } from './utils/math.js';
import { calculateFoodPortion, normalizeFoodName, searchFoodsByName } from './utils/food.js';
import FoodAddProductModal from './features/food/FoodAddProductModal.jsx';
import { ACTIVITY_LEVELS, DEFAULT_ACTIVITY_KEY, calculateStepCalorieAdjustment, calculateStepsCalories, computeKbju, normalizeActivityKey } from './utils/kbju.js';
import { movingAverage } from './utils/stats.js';
import { getLocalDateString, getDefaultStartDate, getDefaultExportEndDate, displayDate } from './utils/date.js';
import { buildDietCsv } from './utils/export.js';
import { compareWeightLoss, filterDatesByProgressPeriod, getProgressPeriod, normalizeWeightHistory, summarizeWeightProgress } from './utils/progress.js';
import { EXTRA_ACTIVITY_TYPES, calculateDailyAvailableCalories, getExtraActivityType, normalizeExtraActivities, sumExtraActivityCalories, validateExtraActivityCalories } from './utils/activity.js';
import { BODY_MEASURE_FIELDS, EMPTY_BODY_MEASURES, BODY_PHOTO_LABELS } from './constants.js';
import { CHALLENGE_TYPES, challengeType, challengeHistKey, challengeTargetFor, computeChallengeStanding, shouldFinalizeChallenge, computeChallengeSafetyWarning } from './utils/challenges.js';
import { DEFAULT_USUAL_STEPS, DEFAULT_PROFILE, DEFAULT_SETTINGS, NON_SELECTABLE_INPUT_TYPES, APP_VERSION, VERSION_FILE_URL, logDev, getUsualSteps } from './constants/app.js';
import { THEME_META_COLOR, normalizeThemeKey } from './constants/themes.js';
import { TAB_TITLES } from './constants/routes.js';
import AnimatedNumber from './components/AnimatedNumber.jsx';
import Toasts from './components/Toasts.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import Header from './components/layout/Header.jsx';
import BottomNav from './components/layout/BottomNav.jsx';
import DrawerMenu from './components/layout/DrawerMenu.jsx';
import DiaryScreen from './features/diary/DiaryScreen.jsx';
import UpdateCallout from './features/updates/UpdateCallout.jsx';
import { getBodyPhotoSrc, getBodyPhotoLabel, countBodyPhotos } from './features/progress/bodyPhotos.js';

// Дневник — стартовый экран, грузится сразу; остальные экраны подтягиваются лениво,
// чтобы уменьшить первичный бандл.
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen.jsx'));
const ProfileScreen = lazy(() => import('./features/profile/ProfileScreen.jsx'));
const SocialScreen = lazy(() => import('./features/friends/SocialScreen.jsx'));
const ProgressScreen = lazy(() => import('./features/progress/ProgressScreen.jsx'));
const FoodBaseScreen = lazy(() => import('./features/food/FoodBaseScreen.jsx'));
const ExportReport = lazy(() => import('./features/export/ExportReport.jsx'));
const SupportScreen = lazy(() => import('./features/settings/SupportScreen.jsx'));
const AboutScreen = lazy(() => import('./features/updates/AboutScreen.jsx'));

const ScreenLoader = () => (
  <div className="flex justify-center py-16">
    <div className="loader" />
  </div>
);
import { IconClose, IconCheck, IconDownload, IconBowl, IconTimer, IconArrowLeft, IconPrinter, IconUser, IconSliders, IconUsers, IconTrophy, IconSparkles, IconInfo, IconHelpCircle } from './components/Icons.jsx';

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
      const [showFoodAddModal, setShowFoodAddModal] = useState(false);
      const [foodAddInitialName, setFoodAddInitialName] = useState('');
      const [baseSearch, setBaseSearch] = useState('');
      const [isRefreshingDay, setIsRefreshingDay] = useState(false);
      
      const [currentDate, setCurrentDate] = useState(getLocalDateString(new Date()));
      const [activeTab, setActiveTab] = useState('diary');
      const [isDrawerOpen, setIsDrawerOpen] = useState(false);
      const [appUpdate, setAppUpdate] = useState(null);
      const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
      
      const [selectedFoodId, setSelectedFoodId] = useState('');
      const [gramsInput, setGramsInput] = useState('');
      const [foodSearch, setFoodSearch] = useState('');

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
      const challengeSafetyWarning = computeChallengeSafetyWarning({
        type: challengeDraft.type,
        myTarget: challengeDraft.myTarget,
        friendTarget: challengeDraft.friendTarget,
        myCurrent: myStatsNow[challengeType(challengeDraft.type).metric],
        friendCurrent: friendMetricNow(challengeDraft.friendUid, challengeType(challengeDraft.type).metric),
        deadline: challengeDraft.deadline,
        today: getLocalDateString(new Date()),
      });

      const saveAiGeneratedFood = (food) => {
        if (!food) return Promise.resolve();
        const existing = foods.find((item) => item.normalizedName === food.normalizedName || item.name === food.name);
        if (existing) return Promise.resolve(existing);
        if (isOwner) saveSharedFoods([food, ...sharedFoods]);
        else savePersonalFoods([food, ...personalFoods]);
        return Promise.resolve(food);
      };

      const openFoodProductInBase = (food) => {
        if (!food) return;
        setEditingFoodId(food.id);
        setEditValue({
          name: food.name,
          calories: food.calories,
          protein: food.protein,
          fats: food.fats,
          carbs: food.carbs,
        });
        setBaseSearch(food.name);
      };

      const goToFoodBaseFromDiary = (query) => {
        const trimmed = String(query || '').trim();
        setBaseSearch(trimmed);
        setFoodAddInitialName(trimmed);
        setActiveTab('directory');
      };

      const openFoodAddModal = (initialName = '') => {
        setFoodAddInitialName(String(initialName || '').trim());
        setShowFoodAddModal(true);
      };

      const addSavedFoodToDiary = (food) => {
        if (!food) return;
        setActiveTab('diary');
        setFoodSearch(food.name);
        selectFood(food.id);
      };

      // Избранное — в порядке favoriteIds (порядок задаёт сам пользователь).
      // Сортировка базы мемоизирована: пересчитывается только при изменении продуктов/избранного.
      const { favoriteFoods, regularFoods, sortedFoods } = useMemo(() => {
        const favorites = favoriteIds.map(id => foods.find(f => f.id === id)).filter(Boolean);
        const favoriteFoodIds = new Set(favorites.map(food => food.id));
        const regular = foods
          .filter(food => !favoriteFoodIds.has(food.id))
          .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        return { favoriteFoods: favorites, regularFoods: regular, sortedFoods: [...favorites, ...regular] };
      }, [foods, favoriteIds]);
      // Поиск работает в обеих строках, но продукт выводится только в одной из них.
      const favoriteMealFoods = useMemo(
        () => foodSearch.trim() ? searchFoodsByName(favoriteFoods, foodSearch, 200) : favoriteFoods,
        [favoriteFoods, foodSearch],
      );
      const allMealFoods = useMemo(
        () => foodSearch.trim() ? searchFoodsByName(regularFoods, foodSearch, 200) : regularFoods,
        [regularFoods, foodSearch],
      );
      const filteredBaseFoods = useMemo(
        () => baseSearch.trim() ? searchFoodsByName(sortedFoods, baseSearch, 400) : sortedFoods,
        [sortedFoods, baseSearch],
      );
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

      if (appUpdate?.mandatory) {
        return <UpdateCallout appUpdate={appUpdate} applyAppUpdate={applyAppUpdate} isApplyingUpdate={isApplyingUpdate} blocking />;
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
            <Suspense fallback={<ScreenLoader />}>
            <ExportReport {...{ exportStart, exportEnd, allExportDates, totalPeriodCals, totalPeriodBurned, totalPeriodExtraActivityCalories, totalPeriodSteps, avgPeriodSteps, periodDefText, avgDeficit, filteredDatesForPdf, rangeDayCount, adherence, streak, latestWeekTrend, latestWeek, projectionDate, targetFat, daysToGoal, fatWeeklyRate, latestSmoothedFat, projectionConfidence, projectionConfidenceText, dayStats, bestDeficitDays, worstBalanceDays, highStepAvgDeficit, lowStepAvgDeficit, stepDeficitDelta, workoutDays, restDays, workoutAvgDeficit, workoutAvgCals, workoutAvgSteps, restAvgDeficit, restAvgCals, restAvgSteps, tdeeReal, weeklyRate, modelTdee, tdeeDiff, daysBetweenWeigh, workoutCount, weeklySummary, hasBodyData, wStart, wEnd, fStart, fEnd, lStart, lEnd, fmStart, fmEnd, bodyMeasureSummary, bodyMeasureSeries, bodyMeasureDates, datesWithMetrics, allWeight, allFat, allLean, allFatMass, chartDates, allSteps, stepChartLabels, getEffectiveGoals, dailyLogs, dailyMetrics, dailySteps, dailyWater, dailyExtraActivities, dailyWorkouts, foods }} />
            </Suspense>
          </div>
        );
      }

      return (
        <div
          className="app-shell flex flex-col h-[100dvh] w-full max-w-md mx-auto bg-[#09090b] text-zinc-100 font-sans shadow-2xl border-x border-zinc-900 relative overflow-hidden"
          onFocusCapture={handleEditableFieldFocus}
        >
            {isNeonRainTheme && <div className="rain-atmosphere" aria-hidden="true" />}
            <Header
              title={activeTabTitle}
              activeTabKey={activeTab}
              isDrawerOpen={isDrawerOpen}
              onOpenDrawer={() => setIsDrawerOpen(true)}
              badgeCount={incomingRequests.length}
            />

            <main ref={scrollContainerRef} onClick={() => { if (selectedFoodId) setSelectedFoodId(''); }} className="app-main flex-1 overflow-y-auto overflow-x-hidden px-3 pt-2 pb-8">
              {appUpdate && !appUpdate.mandatory && <UpdateCallout appUpdate={appUpdate} applyAppUpdate={applyAppUpdate} isApplyingUpdate={isApplyingUpdate} />}
              <AnimatePresence initial={false}>
              <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} style={{ willChange: 'opacity, transform' }}>
              <Suspense fallback={<ScreenLoader />}>
              {activeTab === 'diary' && (
                <DiaryScreen
                  showKbjuRecalc={showKbjuRecalc}
                  kbjuPreview={kbjuPreview}
                  goals={goals}
                  applyAutoKbju={applyAutoKbju}
                  dismissKbjuRecalc={dismissKbjuRecalc}
                  currentDate={currentDate}
                  setCurrentDate={setCurrentDate}
                  blocks={blocks}
                  totalCals={totalCals}
                  dailyAvailableCalories={dailyAvailableCalories}
                  calsColorClass={calsColorClass}
                  displayCals={displayCals}
                  calsLabel={calsLabel}
                  isOver={isOver}
                  progressCals={progressCals}
                  todaySteps={todaySteps}
                  stepCaloriesDelta={stepCaloriesDelta}
                  refreshCurrentDayVitals={refreshCurrentDayVitals}
                  isRefreshingDay={isRefreshingDay}
                  uid={uid}
                  handleUpdateSteps={handleUpdateSteps}
                  toggleWorkout={toggleWorkout}
                  dailyWorkouts={dailyWorkouts}
                  extraActivityCalories={extraActivityCalories}
                  openExtraActivityModal={openExtraActivityModal}
                  todayExtraActivities={todayExtraActivities}
                  removeExtraActivity={removeExtraActivity}
                  totalPro={totalPro}
                  totalFats={totalFats}
                  totalCarbs={totalCarbs}
                  activeGoals={activeGoals}
                  dailyCarbGoal={dailyCarbGoal}
                  proteinPerKg={proteinPerKg}
                  proteinGoalPerKg={proteinGoalPerKg}
                  dailyMetrics={dailyMetrics}
                  handleUpdateMetrics={handleUpdateMetrics}
                  todayWater={todayWater}
                  waterGoal={waterGoal}
                  waterProgress={waterProgress}
                  addWater={addWater}
                  customWater={customWater}
                  setCustomWater={setCustomWater}
                  addCustomWater={addCustomWater}
                  resetWater={resetWater}
                  mealFormRef={mealFormRef}
                  handleAddLog={handleAddLog}
                  onGoToFoodBase={goToFoodBaseFromDiary}
                  foodSearchRef={foodSearchRef}
                  foodSearch={foodSearch}
                  setFoodSearch={setFoodSearch}
                  favScrollRef={favScrollRef}
                  favoriteMealFoods={favoriteMealFoods}
                  selectedFoodId={selectedFoodId}
                  clearFoodSelection={clearFoodSelection}
                  selectFood={selectFood}
                  mealListScrollRef={mealListScrollRef}
                  allMealFoods={allMealFoods}
                  gramsInputRef={gramsInputRef}
                  gramsInput={gramsInput}
                  setGramsInput={setGramsInput}
                  currentDayLogs={currentDayLogs}
                  editingLogId={editingLogId}
                  setEditingLogId={setEditingLogId}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  modifier={modifier}
                  setModifier={setModifier}
                  submitEdit={submitEdit}
                  foods={foods}
                  deleteLog={deleteLog}
                />
              )}

              {activeTab === 'progress' && (
                <ProgressScreen
                  showBodyReminder={showBodyReminder}
                  latestBodyDate={latestBodyDate}
                  dismissBodyReminder={dismissBodyReminder}
                  progressChartPeriod={progressChartPeriod}
                  setProgressChartPeriod={setProgressChartPeriod}
                  metricChartSeries={metricChartSeries}
                  metricChartLabels={metricChartLabels}
                  progressBodyMeasureSeries={progressBodyMeasureSeries}
                  progressBodyMeasureDates={progressBodyMeasureDates}
                  showBodyEditor={showBodyEditor}
                  toggleBodyEditor={toggleBodyEditor}
                  addBodyEntry={addBodyEntry}
                  bodyDraft={bodyDraft}
                  setBodyDraft={setBodyDraft}
                  handleBodyMeasureChange={handleBodyMeasureChange}
                  handleBodyPhotoFiles={handleBodyPhotoFiles}
                  handleBodyDraftPhotoSlot={handleBodyDraftPhotoSlot}
                  bodyEntryOptions={bodyEntryOptions}
                  compareBodyIds={compareBodyIds}
                  setCompareBodyIds={setCompareBodyIds}
                  comparePhotoIndexes={comparePhotoIndexes}
                  setComparePhotoIndexes={setComparePhotoIndexes}
                  compareBodyA={compareBodyA}
                  compareBodyB={compareBodyB}
                  comparePhotoA={comparePhotoA}
                  comparePhotoB={comparePhotoB}
                  setBodyPhotoZoom={setBodyPhotoZoom}
                  setShowBodyPhotoCompare={setShowBodyPhotoCompare}
                  bodyEntries={bodyEntries}
                  sortedBodyEntries={sortedBodyEntries}
                  deleteBodyEntry={deleteBodyEntry}
                  handleBodyEntryPhotoSlot={handleBodyEntryPhotoSlot}
                  setSingleBodyPhotoZoom={setSingleBodyPhotoZoom}
                  setSingleBodyPhoto={setSingleBodyPhoto}
                  removeBodyEntryPhoto={removeBodyEntryPhoto}
                />
              )}

              {activeTab === 'profile' && (
                <ProfileScreen
                  profileData={profileData}
                  handleProfileChange={handleProfileChange}
                  measuredWeight={measuredWeight}
                  selectedActivityKey={selectedActivityKey}
                  handleUsualStepsChange={handleUsualStepsChange}
                  kbjuPreview={kbjuPreview}
                  applyAutoKbju={applyAutoKbju}
                  draftGoals={draftGoals}
                  handleDraftGoalChange={handleDraftGoalChange}
                  hasUnsavedGoals={hasUnsavedGoals}
                  onOpenGoalModal={() => setShowGoalModal(true)}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsScreen
                  activeTheme={activeTheme}
                  setTheme={setTheme}
                  fontScale={settings.fontScale}
                  setFontScale={setFontScale}
                  blocks={blocks}
                  toggleBlock={toggleBlock}
                  accountEmail={auth.currentUser ? auth.currentUser.email : ''}
                  installPrompt={installPrompt}
                  installApp={installApp}
                  deleteAccountNow={deleteAccountNow}
                  deleteBusy={deleteBusy}
                />
              )}

              {activeTab === 'about' && (
                <AboutScreen
                  appUpdate={appUpdate}
                  applyAppUpdate={applyAppUpdate}
                  isApplyingUpdate={isApplyingUpdate}
                  installPrompt={installPrompt}
                  installApp={installApp}
                />
              )}

              {activeTab === 'support' && <SupportScreen />}

              {activeTab === 'social' && (
                <SocialScreen
                  uid={uid}
                  profileData={profileData}
                  handleProfileChange={handleProfileChange}
                  myFriendCode={myFriendCode}
                  notify={notify}
                  friendCodeInput={friendCodeInput}
                  setFriendCodeInput={setFriendCodeInput}
                  sendFriendRequest={sendFriendRequest}
                  incomingRequests={incomingRequests}
                  acceptedFriends={acceptedFriends}
                  friendName={friendName}
                  otherUid={otherUid}
                  acceptConnection={acceptConnection}
                  removeConnection={removeConnection}
                  openChallengeWith={openChallengeWith}
                  challenges={challenges}
                  challengeStanding={challengeStanding}
                  removeChallenge={removeChallenge}
                  openAcceptChallenge={openAcceptChallenge}
                  compareProps={{
                    challengeProgressFriendUid,
                    setChallengeProgressFriendUid,
                    challengeProgressPeriod,
                    setChallengeProgressPeriod,
                    challengeProgressToneClass,
                    challengeProgressOutcome,
                    myDisplayName,
                    myWeightProgressSummary,
                    friendWeightProgressSummary,
                    selectedChallengeProgressPeriod,
                  }}
                />
              )}

              {activeTab === 'directory' && (
                <FoodBaseScreen
                  draftGoals={draftGoals}
                  handleCaloriesChange={handleCaloriesChange}
                  handleDeficitChange={handleDeficitChange}
                  handleMaintenanceChange={handleMaintenanceChange}
                  handleDraftGoalChange={handleDraftGoalChange}
                  hasUnsavedGoals={hasUnsavedGoals}
                  onOpenGoalModal={() => setShowGoalModal(true)}
                  onOpenAddProduct={openFoodAddModal}
                  baseSearch={baseSearch}
                  setBaseSearch={setBaseSearch}
                  downloadBackup={downloadBackup}
                  importBackup={importBackup}
                  importLegacy={importLegacy}
                  foods={foods}
                  favoriteFoods={favoriteFoods}
                  sortedFoods={filteredBaseFoods}
                  isReorderingFavorites={isReorderingFavorites}
                  setIsReorderingFavorites={setIsReorderingFavorites}
                  draggingFavoriteId={draggingFavoriteId}
                  setDraggingFavoriteId={setDraggingFavoriteId}
                  moveFavoritePointer={moveFavoritePointer}
                  editingFoodId={editingFoodId}
                  setEditingFoodId={setEditingFoodId}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  updateFoodBase={updateFoodBase}
                  toggleFavorite={toggleFavorite}
                  deleteFood={deleteFood}
                  isOwner={isOwner}
                  publishSharedBase={publishSharedBase}
                />
              )}
              </Suspense>
              </motion.div>
              </AnimatePresence>
            </main>

            <DrawerMenu
              isOpen={isDrawerOpen}
              onClose={closeDrawer}
              userEmail={auth.currentUser?.email || userEmail}
              items={drawerItems}
              hasUpdate={!!appUpdate}
              isApplyingUpdate={isApplyingUpdate}
              onApplyUpdate={applyAppUpdate}
              onSignOut={signOutFromDrawer}
            />

            <BottomNav activeTab={activeTab} onSelect={setActiveTab} />

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

            <FoodAddProductModal
              open={showFoodAddModal}
              initialName={foodAddInitialName}
              onClose={() => { setShowFoodAddModal(false); setFoodAddInitialName(''); }}
              foods={foods}
              onSaveFood={saveAiGeneratedFood}
              onOpenProduct={openFoodProductInBase}
              onAddToDiary={addSavedFoodToDiary}
            />


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
