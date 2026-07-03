import React, { createContext, useContext, useMemo } from 'react';

import { getTheme } from './themes.js';

const ThemeContext = createContext(getTheme('lime'));

// Тема приходит из настроек пользователя (Firestore), провайдер лишь резолвит токены.
export function ThemeProvider({ themeKey, children }) {
  const theme = useMemo(() => getTheme(themeKey), [themeKey]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
