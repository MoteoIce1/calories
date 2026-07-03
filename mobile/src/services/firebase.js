import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
} from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Тот же Firebase-проект, что и web-версия: данные пользователя общие.
// В mobile используется модульный SDK (compat тянет лишний код и хуже дружит с RN).
const firebaseConfig = {
  apiKey: 'AIzaSyBg9rVgF6WUjuu9abFvV_1KCHdSW3fZ5uQ',
  authDomain: 'my-test-db-de78c.firebaseapp.com',
  projectId: 'my-test-db-de78c',
  storageBucket: 'my-test-db-de78c.firebasestorage.app',
  messagingSenderId: '30801099639',
  appId: '1:30801099639:web:585da0bba1f27d4a6fff72',
};

// TODO(app-check): для mobile App Check нужен провайдер Play Integrity / App Attest —
// это отдельная настройка в Firebase Console, web reCAPTCHA здесь не работает.

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth c персистентностью в AsyncStorage (аналог LOCAL persistence в web).
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db = getFirestore(app);
// Регион по умолчанию us-central1 — совпадает с Cloud Functions проекта.
export const functions = getFunctions(app);

// Ссылки на данные — та же структура коллекций, что в web-версии.
export const profileRef = (uid) => doc(db, 'users', uid);
export const dayRef = (uid, date) => doc(db, 'users', uid, 'days', date);
export const daysCol = (uid) => collection(db, 'users', uid, 'days');
export const bodyCol = (uid) => collection(db, 'users', uid, 'body');
export const bodyDocRef = (uid, id) => doc(db, 'users', uid, 'body', id);
export const OWNER_EMAIL = 'i9293658888@mail.ru';
export const sharedFoodsRef = doc(db, 'shared', 'foods');
export const publicProfilesCol = collection(db, 'publicProfiles');
export const publicProfileRef = (uid) => doc(db, 'publicProfiles', uid);
export const connectionsCol = collection(db, 'connections');
export const connectionRef = (id) => doc(db, 'connections', id);
export const challengesCol = collection(db, 'challenges');
export const challengeRef = (id) => doc(db, 'challenges', id);

export default app;
