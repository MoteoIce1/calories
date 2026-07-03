import AsyncStorage from '@react-native-async-storage/async-storage';

// Обёртка над AsyncStorage: единый интерфейс + безопасный JSON.
// localStorage из web-версии заменён на эти функции (все они асинхронные).

export async function getItem(key) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key, value) {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {
    // Хранилище не критично: приложение работает и без него.
  }
}

export async function removeItem(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // no-op
  }
}

export function safeJsonParse(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Задел под миграции формата хранилища между версиями приложения.
export async function migrateStorageIfNeeded() {
  // Пока миграций нет: основные данные живут в Firestore, локально — только флаги UI.
  return true;
}
