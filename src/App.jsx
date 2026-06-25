import React, { useState, useEffect, useRef } from 'react';
import firebase, { db, auth, functions, profileRef, dayRef, daysCol, bodyCol, bodyDocRef, OWNER_EMAIL, sharedFoodsRef, legacyRef, publicProfileRef, publicProfilesCol, connectionsCol, connectionRef, challengesCol, challengeRef } from './firebase.js';
import { motion, AnimatePresence, animate } from 'framer-motion';
import { evaluateMath } from './utils/math.js';
import { searchFoodsByName, getFoodNameWords } from './utils/food.js';
import { AI_UNAVAILABLE_MESSAGE, formatParsedFoodAmount, MAX_FOOD_TEXT_LENGTH, parseFoodText } from './services/foodAi.js';
import { ACTIVITY_LEVELS, DEFAULT_ACTIVITY_KEY, computeKbju, normalizeActivityKey } from './utils/kbju.js';
import { movingAverage } from './utils/stats.js';
import { getLocalDateString, getDefaultStartDate, getDefaultExportEndDate, displayDate } from './utils/date.js';
import { BODY_MEASURE_FIELDS, EMPTY_BODY_MEASURES, BODY_PHOTO_LABELS } from './constants.js';
import { MacroBar, ProgressChart, MiniWeightChart } from './components/Charts.jsx';
import { IconStar, IconPlus, IconClose, IconSearch, IconBook, IconCalendar, IconChevronLeft, IconChevronRight, IconTrash, IconTarget, IconCheck, IconDownload, IconRefresh, IconBowl, IconSteps, IconDumbbell, IconTimer, IconSave, IconArrowLeft, IconPrinter, IconCamera, IconUser, IconDrop, IconMinus, IconCalc, IconSliders, IconUsers, IconTrophy, IconCopy, IconFlame, IconSparkles } from './components/Icons.jsx';

    // Типы споров (вызовов). dir: 'down' — цель достичь значения не выше target; 'up' — не ниже target.
    const CHALLENGE_TYPES = [
      { key: 'weight', label: 'Сбросить вес', short: 'Вес', unit: 'кг', metric: 'weight', dir: 'down', help: 'Кто первым дойдёт до целевого веса' },
      { key: 'fat', label: 'Снизить % жира', short: 'Жир', unit: '%', metric: 'fatPercent', dir: 'down', help: 'Кто первым дойдёт до целевого % жира' },
      { key: 'waist', label: 'Уменьшить талию', short: 'Талия', unit: 'см', metric: 'waist', dir: 'down', help: 'Кто первым дойдёт до целевого обхвата талии' },
      { key: 'steps', label: 'Среднее шагов в день', short: 'Шаги', unit: 'шаг', metric: 'avg7Steps', dir: 'up', help: 'У кого выше среднее за 7 дней' },
      { key: 'deficit', label: 'Средний дефицит', short: 'Дефицит', unit: 'ккал', metric: 'avg7Deficit', dir: 'up', help: 'У кого выше средний дефицит за 7 дней' },
      { key: 'streak', label: 'Дни подряд в цели', short: 'Серия', unit: 'дн', metric: 'goalStreak', dir: 'up', help: 'Кто дольше держит дефицит без срыва' },
    ];
    const challengeType = (key) => CHALLENGE_TYPES.find(t => t.key === key) || CHALLENGE_TYPES[0];

    // Блоки дневника, которые можно скрыть в настройках профиля.
    const TOGGLEABLE_BLOCKS = [
      { key: 'calories', label: 'Калории', hint: 'счётчик калорий и прогресс дня' },
      { key: 'protein', label: 'Белок', hint: 'прогресс-бар белка' },
      { key: 'fats', label: 'Жиры', hint: 'прогресс-бар жиров' },
      { key: 'carbs', label: 'Углеводы', hint: 'прогресс-бар углеводов' },
      { key: 'steps', label: 'Шаги', hint: 'учёт шагов без пересчёта TDEE' },
      { key: 'workout', label: 'Силовая тренировка', hint: 'отметка тренировки' },
      { key: 'water', label: 'Вода', hint: 'учёт выпитой воды' },
      { key: 'bodyMetrics', label: 'Показатели тела', hint: 'вес, жир, БЖМ и масса жира' },
    ];

    const DAILY_BODY_METRICS = [
      { key: 'weight', label: 'Вес' },
      { key: 'fatPercent', label: 'Жир %' },
      { key: 'leanMass', label: 'БЖМ' },
      { key: 'fatMass', label: 'Жир кг' },
    ];

    const DEFAULT_USUAL_STEPS = 2000;
    const DEFAULT_PROFILE = {
      sex: 'male',
      age: '',
      height: '',
      weight: '',
      activity: DEFAULT_ACTIVITY_KEY,
      usualSteps: DEFAULT_USUAL_STEPS,
      mode: 'manual',
      deficit: 500,
    };
    const DEFAULT_SETTINGS = { fontScale: 'normal', theme: 'lime', blocks: TOGGLEABLE_BLOCKS.reduce((acc, b) => ({ ...acc, [b.key]: true }), {}) };
    const WATER_QUICK = [100, 300, 500];
    const NON_SELECTABLE_INPUT_TYPES = [
      'button',
      'checkbox',
      'color',
      'date',
      'file',
      'hidden',
      'radio',
      'range',
      'reset',
      'submit',
    ];

    // Темы оформления (выбираются в профиле). bg/dot — для превью-чипа.
    const THEMES = [
      { key: 'lime', label: 'Тёмная · лайм', bg: '#0a0a0b', dot: '#a3e635' },
      { key: 'sky', label: 'Тёмная · голубая', bg: '#0a0a0b', dot: '#38bdf8' },
      { key: 'violet', label: 'Тёмная · фиолетовая', bg: '#0a0a0b', dot: '#a78bfa' },
      { key: 'light', label: 'Светлая · голубая', bg: '#eef3f8', dot: '#0ea5e9' },
    ];
    const THEME_META_COLOR = { lime: '#0a0a0b', sky: '#0a0a0b', violet: '#0a0a0b', light: '#eef3f8' };

    function getUsualSteps(value) {
      const steps = Number(value);
      return Number.isFinite(steps) ? Math.max(0, Math.round(steps)) : DEFAULT_USUAL_STEPS;
    }

    // Плавный «накрут» числа при изменении значения (count-up).
    function AnimatedNumber({ value, className }) {
      const [display, setDisplay] = useState(Math.round(Number(value) || 0));
      const prev = useRef(Math.round(Number(value) || 0));
      useEffect(() => {
        const target = Math.round(Number(value) || 0);
        const controls = animate(prev.current, target, {
          duration: 0.5,
          ease: [0.22, 1, 0.36, 1],
          onUpdate: (v) => setDisplay(Math.round(v)),
        });
        prev.current = target;
        return () => controls.stop();
      }, [value]);
      return <span className={className}>{display}</span>;
    }

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
      const [profileData, setProfileData] = useState(DEFAULT_PROFILE);
      const [settings, setSettings] = useState(DEFAULT_SETTINGS);
      const [customWater, setCustomWater] = useState('');

      // Соревновательная часть.
      const [connections, setConnections] = useState([]);
      const [challenges, setChallenges] = useState([]);
      const [friendProfiles, setFriendProfiles] = useState({});
      const [friendCodeInput, setFriendCodeInput] = useState('');
      const [showChallengeModal, setShowChallengeModal] = useState(false);
      const [challengeDraft, setChallengeDraft] = useState({ friendUid: '', type: 'weight', myTarget: '', friendTarget: '', deadline: '' });
      // ИИ разбирает текст на продукты только через VPS API; ключи остаются на сервере.
      const [showMealAiModal, setShowMealAiModal] = useState(false);
      const [mealAiText, setMealAiText] = useState('');
      const [mealAiBusy, setMealAiBusy] = useState(false);
      const [mealAiError, setMealAiError] = useState('');
      const [mealAiItems, setMealAiItems] = useState(null);
      const [isRefreshingDay, setIsRefreshingDay] = useState(false);
      
      const [currentDate, setCurrentDate] = useState(getLocalDateString(new Date()));
      const [activeTab, setActiveTab] = useState('diary');
      
      const [selectedFoodId, setSelectedFoodId] = useState('');
      const [gramsInput, setGramsInput] = useState('');
      const [foodSearch, setFoodSearch] = useState('');
      const [foodSearchFocused, setFoodSearchFocused] = useState(false);
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

      // Масштаб шрифта: Tailwind использует rem, поэтому меняем базовый размер корня.
      useEffect(() => {
        document.documentElement.style.fontSize = settings.fontScale === 'large' ? '18px' : '';
        return () => { document.documentElement.style.fontSize = ''; };
      }, [settings.fontScale]);

      // Тема оформления: переключаем data-theme и цвет статус-бара PWA.
      useEffect(() => {
        const theme = settings.theme || 'lime';
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
            if (lg) payload.logs = lg;
            if (st !== undefined && st !== '') payload.steps = st;
            if (mt) payload.metrics = mt;
            payload.workout = !!wk;
            batch.set(dayRef(uid, date), payload, { merge: true });
          });
          await batch.commit();
        }
      };

      // Перенос данных из старой версии (единый документ users/main_profile)
      const importLegacy = async () => {
        if (!uid) return;
        if (!confirm('Перенести данные из старой версии (main_profile) в твой аккаунт?')) return;
        try {
          const snap = await legacyRef.get();
          if (!snap.exists) { alert('Старый документ main_profile не найден.'); return; }
          await writeAllData(snap.data());
          alert('Данные перенесены. Проверь дневник и отчёт.');
        } catch (err) {
          alert('Не удалось прочитать старые данные: ' + err.message + '\nЕсли правила Firestore уже закрыты — перенеси через JSON-бэкап.');
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
        }, (error) => { console.log("Firebase error", error); setIsLoading(false); });
        return () => unsubscribe();
      }, [uid]);

      // Дни: собираем карты в память из подколлекции days
      useEffect(() => {
        if (!uid) return;
        const unsubscribe = daysCol(uid).onSnapshot((snap) => {
          const logs = {}, steps = {}, metrics = {}, workouts = {}, water = {};
          snap.forEach((doc) => {
            const d = doc.data();
            if (d.logs && d.logs.length) logs[doc.id] = d.logs;
            if (d.steps !== undefined && d.steps !== '' && d.steps !== null) steps[doc.id] = d.steps;
            if (d.metrics && Object.keys(d.metrics).length) metrics[doc.id] = d.metrics;
            if (d.workout) workouts[doc.id] = true;
            if (d.water !== undefined && d.water !== '' && d.water !== null) water[doc.id] = d.water;
          });
          setDailyLogs(logs); setDailySteps(steps); setDailyMetrics(metrics); setDailyWorkouts(workouts); setDailyWater(water);
        }, (e) => console.log("days listener error", e));
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
        }, (e) => console.log("body listener error", e));
        return () => unsubscribe();
      }, [uid]);

      // Общая база продуктов: читают все авторизованные.
      useEffect(() => {
        if (!uid) return;
        const unsub = sharedFoodsRef.onSnapshot((snap) => {
          setSharedFoods(snap.exists && Array.isArray(snap.data().list) ? snap.data().list : []);
        }, (e) => console.log("shared foods error", e));
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
          } catch (e) { console.log('publish shared foods error', e); }
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
          } catch (e) { console.log('body migration error', e); }
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
      // Шаги больше не меняют TDEE и цель калорий: это отдельная метрика дневника.
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

      const confirmGoalSave = (mode) => {
        if (!confirm('Вы уверены, что хотите применить новые настройки?')) return;
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
        if (profileDoc) profileDoc.set({ goals: draftGoals, dailyGoals: updatedDailyGoals }, { merge: true });
        setGoals(draftGoals); setDailyGoals(updatedDailyGoals); setShowGoalModal(false);
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
          alert('Не удалось обновить шаги и замеры: ' + err.message);
        }
        setIsRefreshingDay(false);
      };

      const resetMealForm = () => {
        setSelectedFoodId('');
        setGramsInput('');
        setFoodSearch('');
        setFoodSearchFocused(false);
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

        const newLog = {
          id: Date.now().toString(), foodId: food.id, grams,
          totalCalories: Math.round((grams / 100) * (food.calories || 0)),
          totalProtein: Math.round((grams / 100) * (food.protein || 0)),
          totalFats: Math.round((grams / 100) * (food.fats || 0)),
          totalCarbs: Math.round((grams / 100) * (food.carbs || 0))
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
      const saveSharedFoods = (list) => { setSharedFoods(list); sharedFoodsRef.set({ list }, { merge: true }).catch(err => alert('Не удалось сохранить общую базу: ' + err.message)); };
      const savePersonalFoods = (list) => { setPersonalFoods(list); if (profileDoc) profileDoc.set({ foods: list }, { merge: true }).catch(() => {}); };
      const saveFavoriteIds = (ids) => { setFavoriteIds(ids); if (profileDoc) profileDoc.set({ favoriteIds: ids }, { merge: true }).catch(() => {}); };

      // Владелец публикует текущий список продуктов в общую базу shared/foods (видят все).
      const publishSharedBase = async () => {
        const list = foods.map(({ _shared, isFavorite, ...f }) => f);
        if (!list.length) { alert('Список продуктов пуст — публиковать нечего.'); return; }
        if (!confirm('Опубликовать ' + list.length + ' продуктов в общую базу для всех пользователей?')) return;
        try {
          await sharedFoodsRef.set({ list });
          // Продукты теперь в общей базе — очищаем личный список владельца, чтобы не дублировать.
          if (personalFoods.length && profileDoc) await profileDoc.set({ foods: [] }, { merge: true });
          alert('Готово! В общей базе теперь ' + list.length + ' продуктов. Они видны всем.');
        } catch (e) {
          alert('Не удалось опубликовать: ' + e.message + '\n\nПроверь правила Firestore для shared/foods (запись разрешена только владельцу).');
        }
      };

      const handleAddFood = (e) => {
        e.preventDefault();
        const foodItem = {
          id: Date.now().toString(), name: newFood.name,
          calories: parseFloat(newFood.cals || 0),
          protein: parseFloat(newFood.pro || 0),
          fats: parseFloat(newFood.fat || 0),
          carbs: parseFloat(newFood.carb || 0)
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
        if (uid) bodyDocRef(uid, entry.id).set(entry).catch(err => alert('Не удалось сохранить запись замеров: ' + err.message));
      };
      const removeBodyEntryDoc = (id) => {
        setBodyEntries(prev => prev.filter(e => e.id !== id));
        if (uid) bodyDocRef(uid, id).delete().catch(err => alert('Не удалось удалить запись: ' + err.message));
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
          alert('Не удалось добавить фото: ' + err.message);
        }
      };

      const handleBodyDraftPhotoSlot = async (slotIndex, files) => {
        const file = files?.[0];
        if (!file) return;
        try {
          const src = await compressPhoto(file);
          setBodyDraft(prev => ({ ...prev, photos: setBodyPhotoAtSlot(prev.photos, slotIndex, src) }));
        } catch (err) {
          alert('Не удалось добавить фото: ' + err.message);
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
          alert('Не удалось добавить фото: ' + err.message);
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
          alert('Добавь хотя бы одну мерку или фото.');
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

      const deleteBodyEntry = (id) => {
        if (!confirm('Удалить замеры и фото за эту дату?')) return;
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

      const forceRefreshApp = () => window.location.href = window.location.pathname + '?v=' + Date.now();

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
        if (!res) { alert('Заполните пол, возраст, рост и вес — по ним считается КБЖУ.'); return; }
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

      // Завершение онбординга: сохраняем профиль и считаем КБЖУ по чистой модели BMR × activityMultiplier.
      const finishOnboarding = () => {
        const o = onboardDraft;
        if (!o.age || !o.height || !o.weight) { alert('Заполните возраст, рост и вес — по ним считается КБЖУ.'); return; }
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
        if (!confirm('Удалить аккаунт? Все данные (дневник, замеры, фото, друзья, споры) удалятся безвозвратно.')) return;
        if (!confirm('Точно удалить? Это необратимо.')) return;
        setDeleteBusy(true);
        try {
          const callable = functions.httpsCallable('deleteAccount');
          await callable({});
          await auth.signOut().catch(() => {});
          alert('Аккаунт удалён.');
        } catch (e) {
          alert('Не удалось удалить аккаунт: ' + (e.message || e));
        }
        setDeleteBusy(false);
      };

      const copyPreviousDay = () => {
        const d = new Date(currentDate); d.setDate(d.getDate() - 1);
        const prev = getLocalDateString(d);
        const prevLogs = dailyLogs[prev] || [];
        if (prevLogs.length === 0) { alert('За предыдущий день записей нет.'); return; }
        if (!confirm(`Скопировать ${prevLogs.length} записей из дня ${prev}?`)) return;
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
        const sep = ';';
        const fmt = (n) => (n === undefined || n === null || n === '' || isNaN(n)) ? '' : String(n).replace('.', ',');
        const headers = ['Дата', 'Ккал', 'Белок', 'Жиры', 'Углеводы', 'Шаги', 'Расход', 'Дефицит', 'Тренировка', 'Вода (мл)', 'Вес', 'Жир %', 'БЖМ', 'Масса жира'];
        const rows = [headers.join(sep)];
        allExportDates.forEach(date => {
          const g = getEffectiveGoals(date);
          const bMaint = g.maintenance || 2300;
          const logs = dailyLogs[date] || [];
          const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
          const pro = Math.round(logs.reduce((s, l) => s + (l.totalProtein || 0), 0));
          const fat = Math.round(logs.reduce((s, l) => s + (l.totalFats || 0), 0));
          const carb = Math.round(logs.reduce((s, l) => s + (l.totalCarbs || 0), 0));
          const stepsRaw = dailySteps[date] !== undefined ? dailySteps[date] : '';
          const burned = bMaint;
          const deficit = burned - cals;
          const m = dailyMetrics[date] || {};
          const workout = dailyWorkouts[date] ? 'да' : '';
          const vals = [cals, pro, fat, carb, stepsRaw, burned, deficit, '__W__', dailyWater[date], m.weight, m.fatPercent, m.leanMass, m.fatMass];
          const line = [date, ...vals.map(fmt)].join(sep).replace('__W__', workout);
          rows.push(line);
        });
        triggerDownload('\uFEFF' + rows.join('\n'), `diet_${exportStart}_${exportEnd}.csv`, 'text/csv;charset=utf-8;');
      };

      const downloadBackup = () => {
        const data = { goals, dailyGoals, foods, bodyEntries, dailyLogs, dailySteps, dailyMetrics, dailyWorkouts, _exportedAt: new Date().toISOString() };
        triggerDownload(JSON.stringify(data, null, 2), `backup_${getLocalDateString(new Date())}.json`, 'application/json');
      };

      const importBackup = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (!confirm('Это перезапишет/дополнит данные аккаунта содержимым файла. Продолжить?')) { e.target.value = ''; return; }
            await writeAllData(data);
            alert('Данные восстановлены из бэкапа.');
          } catch (err) {
            alert('Ошибка чтения файла: ' + err.message);
          }
          e.target.value = '';
        };
        reader.readAsText(file);
      };

      const activeGoals = getEffectiveGoals(currentDate);
      const modelMaintenance = activeGoals.maintenance || 2300;
      
      const todaySteps = dailySteps[currentDate] !== undefined
        ? dailySteps[currentDate]
        : getUsualSteps(profileData.usualSteps ?? activeGoals.baseSteps);
      const targetCalories = Number(activeGoals.calories) || 0;
      const dailyCarbGoal = Number(activeGoals.carbs) || 0;

      const currentDayLogs = dailyLogs[currentDate] || [];
      const totalCals = currentDayLogs.reduce((sum, log) => sum + (log.totalCalories || 0), 0);
      const totalPro = currentDayLogs.reduce((sum, log) => sum + (log.totalProtein || 0), 0);
      const totalFats = currentDayLogs.reduce((sum, log) => sum + (log.totalFats || 0), 0);
      const totalCarbs = currentDayLogs.reduce((sum, log) => sum + (log.totalCarbs || 0), 0);
      
      const isOver = totalCals > targetCalories;
      const displayCals = isOver ? (totalCals - targetCalories) : (targetCalories - totalCals);
      const calsColorClass = isOver ? "text-red-500" : "text-emerald-400";
      const calsLabel = isOver ? "перебор" : "осталось";
      
      const progressCals = Math.min(100, (totalCals / (targetCalories || 1)) * 100);

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
      const computePublicStats = () => {
        const t = getLocalDateString(new Date());
        let stepSum = 0, stepCnt = 0, defSum = 0, defCnt = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(t); d.setDate(d.getDate() - i);
          const date = getLocalDateString(d);
          const g = getEffectiveGoals(date); const bM = g.maintenance || 2300;
          if (dailySteps[date] !== undefined) { stepSum += Number(dailySteps[date]) || 0; stepCnt++; }
          const logs = dailyLogs[date] || [];
          if (logs.length) {
            const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
            defSum += bM - cals; defCnt++;
          }
        }
        // Серия: день засчитывается, если дефицит по чистому TDEE достиг целевого.
        // То есть TDEE − съедено ≥ целевой дефицит, без скрытых бонусов за шаги/тренировки.
        let streak = 0;
        for (let i = 0; i < 400; i++) {
          const d = new Date(t); d.setDate(d.getDate() - i);
          const date = getLocalDateString(d); const logs = dailyLogs[date] || [];
          if (!logs.length) break;
          const g = getEffectiveGoals(date);
          const burned2 = g.maintenance || 2300;
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
      };
      const myStatsNow = computePublicStats();
      const acceptedFriends = connections.filter(c => c.status === 'accepted');
      const incomingRequests = connections.filter(c => c.status === 'pending' && c.requestedBy !== uid);
      const outgoingRequests = connections.filter(c => c.status === 'pending' && c.requestedBy === uid);
      const friendName = (fid) => (friendProfiles[fid]?.displayName) || 'Друг';
      const otherUid = (c) => (c.members || []).find(m => m !== uid);
      const statFor = (fid, metric) => fid === uid ? myStatsNow[metric] : (friendProfiles[fid]?.[metric]);

      // Слушаем связи и споры, где я участник.
      useEffect(() => {
        if (!uid) { setConnections([]); setChallenges([]); return; }
        const u1 = connectionsCol.where('members', 'array-contains', uid).onSnapshot(
          (s) => { const a = []; s.forEach(d => a.push({ id: d.id, ...d.data() })); setConnections(a); },
          (e) => console.log('connections error', e));
        const u2 = challengesCol.where('members', 'array-contains', uid).onSnapshot(
          (s) => { const a = []; s.forEach(d => a.push({ id: d.id, ...d.data() })); setChallenges(a); },
          (e) => console.log('challenges error', e));
        return () => { u1(); u2(); };
      }, [uid]);

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
        publicProfileRef(uid).set({ uid, friendCode: myFriendCode, displayName: myDisplayName, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      }, [uid, myDisplayName]);

      // В каждый спор, где я участник, пишу СВОЙ текущий показатель и тренд ТОЛЬКО по
      // метрике этого спора. Документ спора читают лишь его участники (правила Firestore),
      // поэтому соперник видит только ту метрику, по которой поспорили, и никто посторонний.
      const challengeHistKey = (metric) => ({ weight: 'weightHistory', fatPercent: 'fatHistory', avg7Steps: 'stepsHistory', waist: 'waistHistory' }[metric]);
      useEffect(() => {
        if (!uid || !challenges.length) return;
        challenges.forEach(c => {
          if (!(c.members || []).includes(uid)) return;
          const tp = challengeType(c.type);
          const histKey = challengeHistKey(tp.metric);
          const value = typeof myStatsNow[tp.metric] === 'number' ? myStatsNow[tp.metric] : null;
          const history = histKey ? (myStatsNow[histKey] || []) : [];
          // Пишем ТОЛЬКО при реальном изменении — иначе запись→snapshot→запись зациклятся.
          const cur = c.live && c.live[uid];
          if (cur && cur.value === value && JSON.stringify(cur.history || []) === JSON.stringify(history)) return;
          challengeRef(c.id).set({ live: { [uid]: { value, history, updatedAt: Date.now() } } }, { merge: true }).catch(() => {});
        });
      }, [uid, challenges, dailyLogs, dailySteps, dailyMetrics, measuredWeight, bodyEntries]);

      // ── Действия с друзьями и спорами ──
      const sendFriendRequest = async () => {
        const code = friendCodeInput.trim().toUpperCase();
        if (!uid || !code) return;
        if (code === myFriendCode) { alert('Это ваш собственный код.'); return; }
        try {
          const snap = await publicProfilesCol.where('friendCode', '==', code).limit(1).get();
          if (snap.empty) { alert('Пользователь с таким кодом не найден. Проверьте код (он появляется после того, как друг откроет приложение).'); return; }
          const them = snap.docs[0].data();
          const theirUid = them.uid || snap.docs[0].id;
          if (theirUid === uid) { alert('Это ваш собственный код.'); return; }
          const connId = [uid, theirUid].sort().join('__');
          await connectionRef(connId).set({ members: [uid, theirUid].sort(), status: 'pending', requestedBy: uid, createdAt: Date.now() }, { merge: true });
          setFriendProfiles(prev => ({ ...prev, [theirUid]: { id: theirUid, ...them } }));
          setFriendCodeInput('');
          alert('Заявка отправлена ' + (them.displayName || 'другу') + '.');
        } catch (e) { alert('Не удалось отправить заявку: ' + e.message); }
      };
      const acceptConnection = (c) => connectionRef(c.id).set({ status: 'accepted' }, { merge: true }).catch(e => alert('Ошибка: ' + e.message));
      const removeConnection = (c) => { if (confirm('Удалить?')) connectionRef(c.id).delete().catch(e => alert('Ошибка: ' + e.message)); };

      const openChallengeWith = (friendUid) => {
        setChallengeDraft({ friendUid: friendUid || (acceptedFriends[0] ? otherUid(acceptedFriends[0]) : ''), type: 'weight', myTarget: '', friendTarget: '', deadline: getLocalDateString(new Date(Date.now() + 30 * 86400000)) });
        setShowChallengeModal(true);
      };
      const createChallenge = async () => {
        const { friendUid, type, myTarget, friendTarget, deadline } = challengeDraft;
        if (!uid || !friendUid || myTarget === '' || friendTarget === '' || !deadline) { alert('Заполните соперника, обе цели и срок.'); return; }
        // Срок строго в будущем — нельзя сегодня/вчера (жёсткая проверка, не только min инпута).
        if (deadline <= getLocalDateString(new Date())) { alert('Срок спора должен быть в будущем — выберите дату от завтра.'); return; }
        const members = [uid, friendUid].sort();
        // У каждого участника своя цель: я худею до своей, друг — до своей.
        const targets = { [uid]: Number(myTarget), [friendUid]: Number(friendTarget) };
        // Сразу кладу свой текущий показатель и тренд по метрике спора (видят только участники).
        const tp0 = challengeType(type);
        const hk0 = challengeHistKey(tp0.metric);
        // Старт-снимок — ТОЛЬКО метрика спора (не весь профиль, чтобы не светить остальное).
        const start = { [uid]: { [tp0.metric]: typeof myStatsNow[tp0.metric] === 'number' ? myStatsNow[tp0.metric] : null } };
        const live = { [uid]: { value: typeof myStatsNow[tp0.metric] === 'number' ? myStatsNow[tp0.metric] : null, history: hk0 ? (myStatsNow[hk0] || []) : [], updatedAt: Date.now() } };
        const ref = challengesCol.doc();
        try {
          await ref.set({ members, createdBy: uid, type, targets, deadline, status: 'pending', acceptedBy: [uid], start, live, createdAt: Date.now() });
          setShowChallengeModal(false);
          alert('Вызов отправлен ' + friendName(friendUid) + '!');
        } catch (e) { alert('Не удалось создать спор: ' + e.message); }
      };
      const acceptChallenge = (c) => {
        const tp = challengeType(c.type); const hk = challengeHistKey(tp.metric);
        const live = { [uid]: { value: typeof myStatsNow[tp.metric] === 'number' ? myStatsNow[tp.metric] : null, history: hk ? (myStatsNow[hk] || []) : [], updatedAt: Date.now() } };
        const startVal = typeof myStatsNow[tp.metric] === 'number' ? myStatsNow[tp.metric] : null;
        challengeRef(c.id).set({ status: 'active', acceptedBy: firebase.firestore.FieldValue.arrayUnion(uid), start: { [uid]: { [tp.metric]: startVal } }, live }, { merge: true }).catch(e => alert('Ошибка: ' + e.message));
      };
      const removeChallenge = (c) => { if (confirm('Удалить спор?')) challengeRef(c.id).delete().catch(e => alert('Ошибка: ' + e.message)); };

      // Цель участника в споре: новые споры хранят targets[uid]; старые — единый target.
      const challengeTargetFor = (c, m) => (c.targets && typeof c.targets[m] === 'number') ? c.targets[m] : (typeof c.target === 'number' ? c.target : null);
      // Табло спора: у каждого своя цель; лидер — кто ближе к СВОЕЙ цели (или уже достиг).
      const challengeStanding = (c) => {
        const tp = challengeType(c.type);
        const histKey = challengeHistKey(tp.metric);
        const rows = (c.members || []).map(m => {
          // Своё значение берём из свежего myStatsNow; значение соперника — из c.live (приватно).
          const live = (c.live && c.live[m]) ? c.live[m] : null;
          const value = m === uid ? myStatsNow[tp.metric] : (live ? live.value : undefined);
          const history = m === uid ? (histKey ? (myStatsNow[histKey] || []) : []) : (live && Array.isArray(live.history) ? live.history : []);
          const target = challengeTargetFor(c, m);
          const hasV = typeof value === 'number' && !isNaN(value);
          const hasT = typeof target === 'number' && !isNaN(target);
          const reached = hasV && hasT && (tp.dir === 'down' ? value <= target : value >= target);
          // Остаток до своей цели (0 — достигнута). Им меряем близость к цели.
          const remaining = (hasV && hasT) ? Math.max(0, tp.dir === 'down' ? value - target : target - value) : null;
          // Прогресс относительно старта спора (снимок показателей при создании/принятии).
          const startVal = c.start && c.start[m] ? c.start[m][tp.metric] : null;
          const delta = (hasV && typeof startVal === 'number') ? Math.round((value - startVal) * 10) / 10 : null;
          return { uid: m, name: m === uid ? 'Вы' : friendName(m), value, target, reached, remaining, start: typeof startVal === 'number' ? startVal : null, delta, history };
        });
        const valid = rows.filter(r => r.remaining != null);
        let leaderUid = null;
        if (valid.length) leaderUid = valid.reduce((a, b) => (b.remaining < a.remaining ? b : a)).uid;
        const daysLeft = Math.ceil((new Date(c.deadline) - new Date(getLocalDateString(new Date()))) / 86400000);
        return { tp, rows, leaderUid, daysLeft };
      };

      // Предупреждение об агрессивном похудении при создании спора (проверяем обе стороны).
      const challengeSafetyWarning = (() => {
        const { type, myTarget, friendTarget, friendUid, deadline } = challengeDraft;
        if ((type !== 'weight' && type !== 'fat') || !deadline) return '';
        const weeks = Math.max(0.5, (new Date(deadline) - new Date(getLocalDateString(new Date()))) / (86400000 * 7));
        const metric = challengeType(type).metric;
        const rateFor = (current, target) => {
          if (typeof current !== 'number' || target === '' || target == null) return 0;
          const drop = current - Number(target);
          return drop <= 0 ? 0 : drop / weeks;
        };
        const myRate = rateFor(myStatsNow[metric], myTarget);
        const friendRate = rateFor(friendProfiles[friendUid]?.[metric], friendTarget);
        const limit = 1; // кг/нед или %/нед
        const worst = Math.max(myRate, friendRate);
        if (worst <= limit) return '';
        const who = myRate > friendRate ? 'у вас' : 'у соперника';
        if (type === 'weight') return `Темп ${who} ~${worst.toFixed(1)} кг/нед — такое агрессивное похудение вредит организму (безопасно ≈0,5 кг/нед, дефицит ~500 ккал/день). Поставьте срок подальше или цель помягче.`;
        return `Темп ${who} ~${worst.toFixed(1)}% жира в неделю — слишком быстро и вредно (безопасно ≈0,5%/нед). Лучше увеличьте срок.`;
      })();

      // ── ИИ: разбор текста на продукты для дневника ──
      // Ключ названия — набор слов без учёта порядка/регистра: «масло сливочное» == «Сливочное масло».
      const foodNameKey = (name) => getFoodNameWords(name || '').sort().join(' ');
      const findExactFood = (name) => {
        const key = foodNameKey(name);
        return key ? foods.find(f => foodNameKey(f.name) === key) || null : null;
      };
      const runMealAi = async () => {
        const text = mealAiText.trim();
        if (!text) return;
        setMealAiBusy(true); setMealAiError(''); setMealAiItems(null);
        try {
          const result = await parseFoodText(text);
          const list = result.items.map((item) => {
            const food = findExactFood(item.name);
            return {
              ...item,
              grams: item.amount_g === null ? '' : String(item.amount_g),
              matchedFoodId: food?.id || null,
              added: false,
            };
          });
          if (!list.length) setMealAiError('Не удалось распознать продукты. Уточните текст.');
          setMealAiItems(list);
        } catch (e) {
          setMealAiError(e.message || AI_UNAVAILABLE_MESSAGE);
        }
        setMealAiBusy(false);
      };
      const updateMealAiItem = (index, patch) => setMealAiItems(arr => arr.map((x, j) => j === index ? { ...x, ...patch } : x));
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
        const food = item.matchedFoodId ? foods.find(f => f.id === item.matchedFoodId) : findExactFood(item.name);
        const grams = evaluateMath(String(item.grams || ''));
        if (!food) {
          moveMealAiItemToManualEntry(item);
          return;
        }
        if (!Number.isFinite(grams) || grams <= 0) {
          updateMealAiItem(index, { needsWeight: true });
          return;
        }
        if (addFoodLog(food, grams)) updateMealAiItem(index, { added: true, needsWeight: false });
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
      const filterProgressDates = (dates) => {
        const sorted = [...dates].sort();
        if (progressChartPeriod === 'all' || sorted.length < 2) return sorted;
        const latest = sorted[sorted.length - 1];
        const start = new Date(latest);
        start.setDate(start.getDate() - Number(progressChartPeriod));
        const startStr = getLocalDateString(start);
        return sorted.filter(date => date >= startStr);
      };
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
         ...Object.keys(dailyWater).filter(d => d >= exportStart && d <= exportEnd)
      ]);
      const allExportDates = Array.from(allDatesSet).sort((a, b) => new Date(a) - new Date(b));

      const filteredDatesForPdf = Object.keys(dailyLogs)
        .filter(date => date >= exportStart && date <= exportEnd && dailyLogs[date].length > 0)
        .sort((a, b) => new Date(a) - new Date(b));

      let totalPeriodCals = 0;
      let totalPeriodBurned = 0;
      let totalPeriodSteps = 0;

      filteredDatesForPdf.forEach(date => {
          const dayActiveGoals = getEffectiveGoals(date);
          const bMaint = dayActiveGoals.maintenance || 2300;
          const dayLogs = dailyLogs[date] || [];
          const dayCals = dayLogs.reduce((s, l) => s + (l.totalCalories || 0), 0);
          const daySteps = dailySteps[date] !== undefined
            ? dailySteps[date]
            : getUsualSteps(dayActiveGoals.baseSteps);
          const dayBurned = bMaint;

          totalPeriodCals += dayCals;
          totalPeriodBurned += dayBurned;
          totalPeriodSteps += daySteps;
      });

      const periodDeficit = totalPeriodBurned - totalPeriodCals;
      const avgDeficit = filteredDatesForPdf.length ? Math.round(periodDeficit / filteredDatesForPdf.length) : 0;
      const periodDefText = periodDeficit > 0 ? `Дефицит: +${periodDeficit} ккал 🔥` : `Профицит: ${Math.abs(periodDeficit)} ккал 📈`;

      const allDatesInRange = new Set([ ...filteredDatesForPdf, ...Object.keys(dailyMetrics).filter(d => d >= exportStart && d <= exportEnd) ]);
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
        const bMaint = g.maintenance || 2300;
        const logs = dailyLogs[date] || [];
        if (logs.length) {
          const c = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
          const burned = bMaint;
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
        const bMaint = g.maintenance || 2300;
        const logs = dailyLogs[date] || [];
        const cals = logs.reduce((s, l) => s + (l.totalCalories || 0), 0);
        const steps = dailySteps[date] !== undefined ? dailySteps[date] : getUsualSteps(g.baseSteps);
        const burned = bMaint;
        return { date, cals, steps, burned, deficit: burned - cals, workout: !!dailyWorkouts[date] };
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
              {stepDeficitDelta !== null && <p style={{ color: stepDeficitDelta > 0 ? '#166534' : '#991b1b' }}><em>Разница между более и менее активными днями: {stepDeficitDelta > 0 ? '+' : ''}{stepDeficitDelta} ккал/день. Шаги не добавляются к модельному TDEE.</em></p>}
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
              if (dayLogs.length === 0 && !dailyMetrics[date] && dailySteps[date] === undefined && dailyWater[date] === undefined) return null;

              const dayCals = dayLogs.reduce((s, l) => s + (l.totalCalories || 0), 0);
              const dayPro = dayLogs.reduce((s, l) => s + (l.totalProtein || 0), 0);
              const dayFat = dayLogs.reduce((s, l) => s + (l.totalFats || 0), 0);
              const dayCarb = dayLogs.reduce((s, l) => s + (l.totalCarbs || 0), 0);
              const dayBurned = dayActiveGoals.maintenance || 2300;
              const m = dailyMetrics[date] || {};
              const mText = [ m.weight ? `Вес: ${m.weight} кг` : '', m.fatPercent ? `Жир: ${m.fatPercent}%` : '', m.leanMass ? `БЖМ: ${m.leanMass} кг` : '', m.fatMass ? `Жир: ${m.fatMass} кг` : '' ].filter(Boolean).join(' | ');

              return (
                <div key={date} style={{ marginBottom: '15px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                  <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981', margin: '0 0 4px 0' }}>{date}</h2>
                  <p style={{ fontSize: '11px', marginBottom: '5px' }}>
                    Шаги: {dailySteps[date] || '—'} | <strong>Дефицит: {dayBurned - dayCals} ккал</strong>{dailyWorkouts[date] ? ' | Силовая тренировка' : ''}{dailyWater[date] !== undefined ? ` | Вода: ${dailyWater[date]} мл` : ''}<br/>
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
            <header className="app-header shrink-0 pt-8 px-4 pb-4 bg-[#09090b] flex justify-between items-center z-10">
              <div>
                <h1 key={activeTab} className="text-2xl font-bold">{activeTab === 'diary' ? 'Дневник' : activeTab === 'progress' ? 'Прогресс' : activeTab === 'profile' ? 'Профиль' : activeTab === 'social' ? 'Друзья и споры' : 'База'}</h1>
              </div>
              <div className="flex items-center gap-2">
                {activeTab === 'directory' && (
                  <>
                    <button onClick={() => setActiveTab('social')} className="relative btn-active p-2 bg-zinc-800 rounded-xl text-zinc-300 transition-all border border-zinc-800/50" aria-label="Друзья и споры"><IconUsers className="w-5 h-5" />{incomingRequests.length > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-[#09090b]">+{incomingRequests.length}</span>}</button>
                    <button onClick={() => setActiveTab('profile')} className="btn-active p-2 bg-zinc-800 rounded-xl text-zinc-300 transition-all border border-zinc-800/50" aria-label="Профиль"><IconUser className="w-5 h-5" /></button>
                    <button onClick={forceRefreshApp} className="btn-active p-2 bg-zinc-800 rounded-xl text-zinc-300 transition-all border border-zinc-800/50" aria-label="Обновить"><IconRefresh className="w-5 h-5" /></button>
                  </>
                )}
                {(activeTab === 'profile' || activeTab === 'social') && (
                  <button onClick={() => setActiveTab('directory')} className="btn-active p-2 bg-zinc-800 rounded-xl text-zinc-300 transition-all border border-zinc-800/50" aria-label="Назад в базу"><IconArrowLeft className="w-5 h-5" /></button>
                )}
                {activeTab === 'diary' && (
                  <button onClick={() => setShowExportModal(true)} className="btn-active p-2 bg-zinc-800 rounded-xl text-zinc-300 transition-all border border-zinc-800/50" aria-label="Выгрузка"><IconDownload className="w-5 h-5" /></button>
                )}
              </div>
            </header>

            <main ref={scrollContainerRef} onClick={() => { if (selectedFoodId) setSelectedFoodId(''); }} className="app-main flex-1 overflow-y-auto overflow-x-hidden px-3 pt-2 pb-8">
              <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
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
                          <span className="text-zinc-600 text-sm">/ {targetCalories}</span>
                        </div>
                      </div>
                      <div className={`text-right ${calsColorClass}`}>
                        <span className="text-2xl font-black">{displayCals}</span>
                        <p className="text-[10px] uppercase font-bold mt-1 tracking-widest opacity-80">{calsLabel}</p>
                      </div>
                    </div>
                    <div className="progress-track h-2 w-full bg-zinc-900 rounded-full overflow-hidden mb-5">
                      <motion.div className={`h-full ${isOver ? 'bg-red-500' : 'bg-emerald-500'}`} initial={false} animate={{ width: `${progressCals}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}></motion.div>
                    </div>
                    </>)}

                    {blocks.steps && (
                    <div className="movement-panel mt-4 mb-4 flex items-center justify-between bg-zinc-900/40 p-3 rounded-2xl border border-zinc-800/40">
                      <div className="step-summary flex min-w-0 flex-1 items-center gap-3">
                        <IconSteps className="w-5 h-5 text-amber-400" />
                        <div className="flex flex-col">
                          <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">Шаги</span>
                          <span className="text-[9px] text-zinc-500 font-bold mt-0.5">не меняют TDEE</span>
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
                    <button onClick={toggleWorkout} className={`workout-toggle btn-active w-full mb-4 flex items-center justify-between p-3 rounded-2xl border transition-all ${dailyWorkouts[currentDate] ? 'bg-emerald-900/30 border-emerald-700/50' : 'bg-zinc-900/40 border-zinc-800/40'}`}>
                      <div className="flex items-center gap-3">
                        <IconDumbbell className="w-5 h-5 text-amber-400" />
                        <span className={`text-[10px] uppercase font-bold tracking-widest ${dailyWorkouts[currentDate] ? 'text-emerald-400' : 'text-zinc-400'}`}>Силовая тренировка</span>
                      </div>
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${dailyWorkouts[currentDate] ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                        {dailyWorkouts[currentDate] && <IconCheck className="w-4 h-4 text-white" />}
                      </div>
                    </button>
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

                  <div className="card-enter bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-bold text-zinc-100">Период графиков</h2>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-1">По умолчанию весь период</p>
                    </div>
                    <select className="shrink-0 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-xs font-bold outline-none" value={progressChartPeriod} onChange={(e) => setProgressChartPeriod(e.target.value)}>
                      <option value="all">Весь</option>
                      <option value="30">30 дней</option>
                      <option value="90">90 дней</option>
                      <option value="180">180 дней</option>
                    </select>
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
                        Коэффициент описывает бытовую активность/NEAT, работу и тренировки. Шаги не входят в коэффициент и ведутся отдельно.
                      </p>
                      <div className="flex flex-col gap-2">
                        {ACTIVITY_LEVELS.map(l => (
                          <button key={l.key} type="button" onClick={() => handleProfileChange('activity', l.key)} className={`btn-active text-left rounded-xl p-3 border transition-all ${selectedActivityKey === l.key ? 'bg-emerald-600/15 border-emerald-600/40' : 'bg-[#27272a] border-zinc-700/30'}`}>
                            <span className={`text-sm font-bold ${selectedActivityKey === l.key ? 'text-emerald-300' : 'text-zinc-200'}`}>{l.label}</span>
                            <span className="block text-[10px] text-zinc-500 mt-0.5">{l.hint} · × {l.multiplier.toFixed(3)}</span>
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
                      <p className="text-[10px] text-zinc-600 leading-relaxed mt-1.5">Шаги сохраняются как метрика дневника и не меняют TDEE, цель калорий или дефицит.</p>
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
                              <span className="text-zinc-400">Активность</span><span className="text-right font-bold text-zinc-200">× {kbjuPreview.activityMultiplier.toFixed(3)}</span>
                              <span className="text-zinc-400">Шаги</span><span className="text-right font-bold text-zinc-200">отдельно, не в TDEE</span>
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

                  {/* Тема оформления */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconSliders className="w-4 h-4" /> Тема оформления</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {THEMES.map(t => (
                        <button key={t.key} type="button" onClick={() => setTheme(t.key)} className={`btn-active flex items-center gap-2.5 rounded-xl p-3 border transition-all ${(settings.theme || 'lime') === t.key ? 'border-emerald-500 bg-emerald-600/15' : 'bg-[#27272a] border-zinc-700/30'}`}>
                          <span className="shrink-0 w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center" style={{ background: t.bg }}><span className="w-3 h-3 rounded-full" style={{ background: t.dot }} /></span>
                          <span className={`text-xs font-bold text-left leading-tight ${(settings.theme || 'lime') === t.key ? 'text-emerald-300' : 'text-zinc-300'}`}>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Настройки приложения */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconSliders className="w-4 h-4" /> Размер шрифта</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {[['normal', 'Стандартный'], ['large', 'Увеличенный']].map(([sc, label]) => (
                        <button key={sc} type="button" onClick={() => setFontScale(sc)} className={`btn-active rounded-xl p-3 text-sm font-bold border transition-all ${settings.fontScale === sc ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-[#27272a] text-zinc-300 border-zinc-700/30'}`}>{label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Блоки дневника */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Блоки в дневнике</h2>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">По умолчанию включены все блоки. Отключите лишние — они исчезнут из дневника, но данные сохранятся.</p>
                    <div className="space-y-2">
                      {TOGGLEABLE_BLOCKS.map(b => (
                        <button key={b.key} type="button" role="switch" aria-checked={!!blocks[b.key]} onClick={() => toggleBlock(b.key)} className="btn-active w-full flex items-center justify-between gap-3 bg-[#27272a] rounded-xl p-3 border border-zinc-700/30 text-left transition-all">
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

                  {/* Аккаунт */}
                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Аккаунт</h2>
                    <p className="text-xs text-zinc-500 break-all">{auth.currentUser ? auth.currentUser.email : ''}</p>
                    {installPrompt && <button type="button" onClick={installApp} className="btn-active w-full bg-indigo-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" />Установить приложение</button>}
                    <button type="button" onClick={() => { if (confirm('Выйти из аккаунта?')) auth.signOut(); }} className="btn-active w-full bg-zinc-800 text-red-400 rounded-xl p-4 font-bold transition-all">Выйти</button>
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
                        <button type="button" onClick={() => { if (navigator.clipboard) { navigator.clipboard.writeText(myFriendCode); alert('Код скопирован'); } }} className="btn-active w-12 h-12 shrink-0 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-300 border border-zinc-700/30" aria-label="Скопировать код"><IconCopy className="w-5 h-5" /></button>
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
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-2 bg-[#27272a] rounded-xl p-3 border border-zinc-700/30">
                          <div className="min-w-0">
                            <span className="text-sm font-bold text-zinc-200 block truncate">{friendName(fid)}</span>
                            <span className="text-[10px] text-zinc-500">Показатели видны только в общем споре</span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button type="button" onClick={() => openChallengeWith(fid)} className="btn-active bg-emerald-600/15 text-emerald-300 border border-emerald-600/30 rounded-lg px-3 py-2 text-xs font-bold">Спорить</button>
                            <button type="button" onClick={() => removeConnection(c)} className="btn-active text-zinc-700 active:text-red-400 p-2"><IconTrash className="w-5 h-5" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Споры */}
                  {challenges.length > 0 && (
                    <div className="space-y-3">
                      <h2 className="px-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><IconTrophy className="w-4 h-4" /> Споры ({challenges.length})</h2>
                      {[...challenges].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(c => {
                        const st = challengeStanding(c);
                        const isInvite = c.status === 'pending' && !(c.acceptedBy || []).includes(uid);
                        const isWaiting = c.status === 'pending' && (c.acceptedBy || []).includes(uid);
                        const finished = st.daysLeft < 0 || c.status === 'finished';
                        return (
                          <div key={c.id} className="card-enter bg-[#18181b] rounded-3xl p-4 border border-zinc-800/50">
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="min-w-0">
                                <p className="text-sm font-black text-zinc-100">{st.tp.label}</p>
                                <p className="text-[10px] text-zinc-500 mt-0.5">У каждого своя цель · {finished ? 'завершён' : `осталось ${Math.max(0, st.daysLeft)} дн`}</p>
                              </div>
                              <button type="button" onClick={() => removeChallenge(c)} className="btn-active text-zinc-700 active:text-red-400 p-1 shrink-0"><IconTrash className="w-4 h-4" /></button>
                            </div>
                            <div className="space-y-2">
                              {st.rows.map(r => {
                                const goodDelta = r.delta != null && r.delta !== 0 && (st.tp.dir === 'down' ? r.delta < 0 : r.delta > 0);
                                return (
                                <div key={r.uid} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border ${st.leaderUid === r.uid ? 'bg-emerald-600/15 border-emerald-600/40' : 'bg-[#27272a] border-zinc-700/30'}`}>
                                  <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5 min-w-0 truncate">{st.leaderUid === r.uid && <IconFlame className="w-4 h-4 text-amber-400 shrink-0" />}{r.name}</span>
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
                                  return <MiniWeightChart key={r.uid} title={`${r.name} · ${st.tp.short.toLowerCase()}`} data={hist.map(p => p.v)} dates={hist.map(p => { const a = (p.d || '').split('-'); return a.length === 3 ? `${a[2]}.${a[1]}` : p.d; })} color={st.leaderUid === r.uid ? '#34d399' : '#a3e635'} unit={st.tp.unit} positiveIsGood={st.tp.dir === 'up'} />;
                                })}
                              </div>
                            )}
                            {isInvite && (
                              <div className="flex gap-2 mt-3">
                                <button type="button" onClick={() => acceptChallenge(c)} className="btn-active flex-1 bg-emerald-600 text-white rounded-xl p-3 text-xs font-bold">Принять вызов</button>
                                <button type="button" onClick={() => removeChallenge(c)} className="btn-active flex-1 bg-zinc-800 text-zinc-400 rounded-xl p-3 text-xs font-bold">Отказаться</button>
                              </div>
                            )}
                            {isWaiting && <p className="text-[10px] text-zinc-500 mt-2 text-center">Ждём, пока соперник примет вызов…</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
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

                  <div className="card-enter bg-[#18181b] rounded-3xl p-5 border border-zinc-800/50 space-y-3">
                    <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Аккаунт</h2>
                    <p className="text-xs text-zinc-500 break-all">{auth.currentUser ? auth.currentUser.email : ''}</p>
                    {installPrompt && <button type="button" onClick={installApp} className="btn-active w-full bg-indigo-600 text-white rounded-xl p-4 font-bold transition-all flex items-center justify-center gap-2"><IconDownload className="w-5 h-5" />Установить приложение</button>}
                    <button onClick={() => { if (confirm('Выйти из аккаунта?')) auth.signOut(); }} className="btn-active w-full bg-zinc-800 text-red-400 rounded-xl p-4 font-bold transition-all">Выйти</button>
                    <button type="button" onClick={deleteAccountNow} disabled={deleteBusy} className="btn-active w-full bg-red-950/40 text-red-400 border border-red-900/50 rounded-xl p-3 font-bold transition-all disabled:opacity-50">{deleteBusy ? 'Удаление…' : 'Удалить аккаунт'}</button>
                    <p className="text-[10px] text-zinc-600 leading-relaxed">Удаление аккаунта стирает все данные безвозвратно. Расчёты КБЖУ и ИИ-оценки — ориентировочные, не медицинская рекомендация.</p>
                  </div>
                </div>
              )}
              </motion.div>
              </AnimatePresence>
            </main>

            <nav className="bottom-nav shrink-0 bg-[#09090b] flex justify-around gap-1 px-1 pb-2 pt-2 safe-pb relative z-40 border-t border-zinc-900">
              <button onClick={() => setActiveTab('diary')} className={`btn-active flex-1 flex flex-col items-center py-2 transition-all rounded-xl ${activeTab === 'diary' ? 'text-emerald-400 bg-zinc-900/50' : 'text-zinc-600'}`}>
                <IconCalendar className="w-6 h-6" /><span className="text-[9px] font-bold mt-1 uppercase tracking-widest">Дневник</span>
              </button>
              <button onClick={() => setActiveTab('progress')} className={`btn-active flex-1 flex flex-col items-center py-2 transition-all rounded-xl ${activeTab === 'progress' ? 'text-violet-300 bg-zinc-900/50' : 'text-zinc-600'}`}>
                <IconCamera className="w-6 h-6" /><span className="text-[9px] font-bold mt-1 uppercase tracking-widest">Прогресс</span>
              </button>
              <button onClick={() => setActiveTab('directory')} className={`relative btn-active flex-1 flex flex-col items-center py-2 transition-all rounded-xl ${activeTab === 'directory' || activeTab === 'profile' || activeTab === 'social' ? 'text-indigo-400 bg-zinc-900/50' : 'text-zinc-600'}`}>
                <IconBook className="w-6 h-6" />{incomingRequests.length > 0 && <span className="absolute top-1 right-1/2 mr-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">+{incomingRequests.length}</span>}<span className="text-[9px] font-bold mt-1 uppercase tracking-widest">База</span>
              </button>
            </nav>

            {/* Модалки */}
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
                    <button onClick={() => { setShowExportModal(false); downloadCSV(); }} className="btn-active w-full p-4 rounded-xl bg-blue-600 font-bold text-white transition-all">📊 Скачать CSV (для Excel / анализа)</button>
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
                      const frCur = friendProfiles[challengeDraft.friendUid]?.[tp.metric];
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
                              <input type="number" inputMode="decimal" placeholder="—" className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 font-bold outline-none border border-zinc-700/30 focus:border-emerald-500" value={challengeDraft.friendTarget} onChange={(e) => setChallengeDraft({ ...challengeDraft, friendTarget: e.target.value })} onFocus={(e) => e.target.select()} />
                            </div>
                          </div>
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
                    <button type="button" onClick={createChallenge} disabled={!challengeDraft.friendUid || challengeDraft.myTarget === '' || challengeDraft.friendTarget === '' || !challengeDraft.deadline} className="btn-active w-full bg-emerald-600 text-white rounded-xl p-4 font-bold transition-all disabled:opacity-35">Бросить вызов</button>
                    <button type="button" onClick={() => setShowChallengeModal(false)} className="btn-active w-full border border-zinc-800 text-zinc-500 rounded-xl p-3 font-bold transition-all">Отмена</button>
                  </div>
                </motion.div>
              </motion.div>
            )}
            </AnimatePresence>

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
                        Уровень учитывает NEAT/работу/тренировки. Шаги — отдельная метрика и не прибавляются к TDEE.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {ACTIVITY_LEVELS.map(l => (
                          <button key={l.key} type="button" onClick={() => setOnboardDraft({ ...onboardDraft, activity: l.key })} className={`btn-active text-left rounded-xl p-2.5 border transition-all ${normalizeActivityKey(onboardDraft.activity) === l.key ? 'bg-emerald-600/15 border-emerald-600/40' : 'bg-[#27272a] border-zinc-700/30'}`}>
                            <span className={`text-xs font-bold block ${normalizeActivityKey(onboardDraft.activity) === l.key ? 'text-emerald-300' : 'text-zinc-200'}`}>{l.label}</span>
                            <span className="text-[9px] text-zinc-500">{l.hint} · × {l.multiplier.toFixed(3)}</span>
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
                  <p className="text-zinc-500 text-xs mb-4 text-center leading-relaxed">Введите продукты и количество. ИИ только распознаёт позиции; КБЖУ считаются лишь после выбора продукта и указания веса.</p>
                  <textarea rows={5} maxLength={MAX_FOOD_TEXT_LENGTH} placeholder={'Например:\nтворог 5% 250 г, банан 100 г\nили\n2 яйца, рис 150 г, куриная грудка 200 г'} className="w-full bg-[#27272a] rounded-xl p-3 text-zinc-200 text-sm outline-none border border-zinc-700/30 focus:border-emerald-500 resize-none" value={mealAiText} onChange={(e) => setMealAiText(e.target.value)} />
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
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Распознано · уточните вес при необходимости</p>
                      {mealAiItems.map((it, i) => (
                        <div key={`${it.name}-${i}`} className="rounded-xl p-3 border bg-[#27272a] border-zinc-700/30 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-zinc-100 truncate">{it.name}</p>
                              <p className="text-xs text-zinc-400 mt-0.5">{formatParsedFoodAmount(it)}</p>
                            </div>
                            {it.matchedFoodId ? <span className="shrink-0 text-[9px] text-emerald-300 font-bold uppercase tracking-wider">в базе</span> : <span className="shrink-0 text-[9px] text-zinc-500 font-bold uppercase tracking-wider">нет в базе</span>}
                          </div>
                          {it.matchedFoodId && (
                            <p className="text-[10px] text-emerald-300 leading-relaxed">
                              Этот продукт уже у вас в базе есть. Сколько граммов вы съели этого продукта?
                            </p>
                          )}
                          <label className="block text-[10px] text-zinc-500 font-bold">
                            Вес для КБЖУ, г
                            <input type="number" min="0" step="0.1" inputMode="decimal" placeholder="Уточните вес" className={`w-full bg-zinc-900 rounded-lg p-2 text-sm text-zinc-100 outline-none border mt-1 ${it.needsWeight ? 'border-amber-400' : 'border-zinc-700/30'} focus:border-emerald-500`} value={it.grams} onChange={(e) => updateMealAiItem(i, { grams: e.target.value, needsWeight: false })} />
                          </label>
                          {it.amount_g === null && <p className="text-[10px] text-amber-300 leading-relaxed">{it.unit === 'pcs' ? 'Количество штук не переводим в граммы автоматически.' : it.unit === 'ml' || it.unit === 'l' ? 'Объём не переводим в граммы без отдельной логики плотности.' : 'Укажите граммовку перед расчётом КБЖУ.'}</p>}
                          {it.needsWeight && <p className="text-[10px] text-amber-300" role="alert">Укажите вес больше нуля, чтобы рассчитать КБЖУ.</p>}
                          {it.added ? <p className="text-xs font-bold text-emerald-300 flex items-center gap-1"><IconCheck className="w-4 h-4" /> Добавлено в дневник</p> : (
                            <button type="button" onClick={() => addMealAiItemToDiary(i)} className="btn-active w-full bg-emerald-600 text-white rounded-lg p-2.5 text-xs font-bold transition-all">
                              {it.matchedFoodId ? 'Добавить в дневник' : 'Выбрать продукт вручную'}
                            </button>
                          )}
                        </div>
                      ))}
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
