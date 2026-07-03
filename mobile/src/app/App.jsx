import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import { AppDataProvider, useAppData } from './AppDataProvider.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { ThemeProvider, useTheme } from '../theme/ThemeContext.jsx';
import { normalizeThemeKey } from '../theme/themes.js';
import RootNavigator from '../navigation/RootNavigator.jsx';
import AuthScreen from '../features/auth/AuthScreen.jsx';
import Toasts from '../components/common/Toasts.jsx';
import ConfirmModal from '../components/common/ConfirmModal.jsx';

function Root() {
  const { uid, authReady, isLoading, settings, toasts, confirmState, resolveConfirm } = useAppData();
  const themeKey = normalizeThemeKey(settings.theme);

  return (
    <ThemeProvider themeKey={themeKey}>
      <ThemedRoot uid={uid} authReady={authReady} isLoading={isLoading}>
        <Toasts toasts={toasts} />
        <ConfirmModal state={confirmState} onResolve={resolveConfirm} />
      </ThemedRoot>
    </ThemeProvider>
  );
}

function ThemedRoot({ uid, authReady, isLoading, children }) {
  const t = useTheme();
  const navTheme = {
    ...(t.isLight ? DefaultTheme : DarkTheme),
    colors: {
      ...(t.isLight ? DefaultTheme.colors : DarkTheme.colors),
      primary: t.accent,
      background: t.bgDeep,
      card: t.bgDeep,
      text: t.text,
      border: t.line,
    },
  };

  let content;
  if (!authReady || (uid && isLoading)) {
    content = (
      <View style={[styles.loader, { backgroundColor: t.bgDeep }]}>
        <ActivityIndicator size="large" color={t.accent} />
        <Text style={{ color: t.textMuted, marginTop: 12 }}>Загрузка…</Text>
      </View>
    );
  } else if (!uid) {
    content = <AuthScreen />;
  } else {
    content = (
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.bgDeep }]}>
      <StatusBar style={t.isLight ? 'dark' : 'light'} />
      {content}
      {children}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AppDataProvider>
            <Root />
          </AppDataProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
