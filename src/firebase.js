import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';
import 'firebase/compat/functions';
import 'firebase/compat/app-check';

    // App Check защищает Cloud Functions от вызовов НЕ из вашего приложения (боты, абуз —
    // чтобы чужой скрипт не жёг ваш бюджет и лимиты ИИ). Чтобы включить:
    //   1) Firebase Console → App Check → зарегистрируйте веб-приложение, провайдер
    //      reCAPTCHA v3, получите site key (и зарегистрируйте сам reCAPTCHA-ключ на
    //      google.com/recaptcha, тип v3).
    //   2) Вставьте site key ниже в APPCHECK_SITE_KEY.
    //   3) В Console → App Check включите Enforcement для Cloud Functions, и в
    //      functions/index.js добавьте `enforceAppCheck: true` в опции onCall(...).
    // Пока ключ пустой — App Check не активируется, ничего не ломается.
    const APPCHECK_SITE_KEY = '6LddMTAtAAAAAJ5Ctl7Gxr20th1BoyZTYJeCi5Fq';

    const firebaseConfig = {
      apiKey: "AIzaSyBg9rVgF6WUjuu9abFvV_1KCHdSW3fZ5uQ",
      authDomain: "my-test-db-de78c.firebaseapp.com",
      projectId: "my-test-db-de78c",
      storageBucket: "my-test-db-de78c.firebasestorage.app",
      messagingSenderId: "30801099639",
      appId: "1:30801099639:web:585da0bba1f27d4a6fff72",
      measurementId: "G-KW2YVT1ZJW"
    };

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      // Активируем App Check только если задан site key (иначе пропускаем — без поломок).
      if (APPCHECK_SITE_KEY) {
        try {
          // Для локальной отладки можно временно включить debug-токен:
          // if (location.hostname === 'localhost') self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
          firebase.appCheck().activate(new firebase.appCheck.ReCaptchaV3Provider(APPCHECK_SITE_KEY), true);
          // Диагностика: подтверждаем, что клиент реально получает App Check токен.
          // В консоли браузера: __appCheckToken() — покажет токен или ошибку конфигурации.
          if (typeof window !== 'undefined') {
            window.__appCheckToken = () => firebase.appCheck().getToken().then(t => { console.log('AppCheck OK, token len:', (t.token || '').length); return t; }).catch(e => { console.error('AppCheck FAIL:', e); throw e; });
            firebase.appCheck().getToken().then(t => console.log('AppCheck активен, токен получен (len ' + (t.token || '').length + ')')).catch(e => console.error('AppCheck НЕ получил токен:', e && e.message));
          }
        } catch (e) { console.warn('App Check init error:', e); }
      }
      firebase.firestore().enablePersistence().catch((err) => {
        console.warn("Firebase persistence error:", err.code);
      });
    }
    const db = firebase.firestore();
    const auth = firebase.auth();
    const functions = firebase.functions(); // регион по умолчанию us-central1 (совпадает с Cloud Function)
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

    // Ссылки на данные в БД считаются по uid авторизованного пользователя.
    // Профиль (цели, продукты) — один документ; каждый день — отдельный документ.
    const profileRef = (uid) => db.collection('users').doc(uid);
    const dayRef = (uid, date) => db.collection('users').doc(uid).collection('days').doc(date);
    const daysCol = (uid) => db.collection('users').doc(uid).collection('days');
    // Замеры тела — отдельный документ на запись (фото base64 в одном документе профиля упирались в лимит Firestore 1 МБ).
    const bodyCol = (uid) => db.collection('users').doc(uid).collection('body');
    const bodyDocRef = (uid, id) => db.collection('users').doc(uid).collection('body').doc(id);
    // Общая база продуктов: один документ shared/foods (читают все, пишет только владелец).
    const OWNER_EMAIL = 'i9293658888@mail.ru';
    const sharedFoodsRef = db.collection('shared').doc('foods');
    const legacyRef = db.collection('users').doc('main_profile'); // старая единая структура (для переноса)

    // Соревновательная часть: публичная витрина показателей, связи (друзья) и споры.
    const publicProfilesCol = db.collection('publicProfiles');
    const publicProfileRef = (uid) => db.collection('publicProfiles').doc(uid);
    const connectionsCol = db.collection('connections');
    const connectionRef = (id) => db.collection('connections').doc(id);
    const challengesCol = db.collection('challenges');
    const challengeRef = (id) => db.collection('challenges').doc(id);

    // Доступ из консоли браузера для разовых операций с данными (правила Firestore по-прежнему защищают).
    if (typeof window !== 'undefined') { window.__db = db; window.__auth = auth; }

export default firebase;
export { db, auth, functions, profileRef, dayRef, daysCol, bodyCol, bodyDocRef, OWNER_EMAIL, sharedFoodsRef, legacyRef, publicProfilesCol, publicProfileRef, connectionsCol, connectionRef, challengesCol, challengeRef };
