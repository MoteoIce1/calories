import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

// Mobile update flow: service worker web-версии заменён на expo-updates (EAS Update).
// Проверяем OTA-обновление при старте и при возврате приложения из фона.
// TODO(mandatory): для принудительных обновлений добавить remote version endpoint
// и blocking screen, когда минимальная поддерживаемая версия вырастет.
export function useUpdateCheck() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [applying, setApplying] = useState(false);
  const checking = useRef(false);

  const check = useCallback(async () => {
    // В Expo Go и dev-режиме OTA-обновления недоступны.
    if (__DEV__ || !Updates.isEnabled || checking.current) return;
    checking.current = true;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        setUpdateAvailable(true);
      }
    } catch {
      // Проверка обновлений не должна ломать приложение.
    }
    checking.current = false;
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const applyUpdate = useCallback(async () => {
    setApplying(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setApplying(false);
    }
  }, []);

  return { updateAvailable, applying, applyUpdate, check };
}
