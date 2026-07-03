import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { Button, Input, Label, Card } from '../../components/common/ui.jsx';

// Тексты ошибок Firebase Auth — те же, что в web-версии.
const AUTH_ERRORS = {
  'auth/invalid-email': 'Неверный формат e-mail.',
  'auth/missing-password': 'Введите пароль.',
  'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов).',
  'auth/email-already-in-use': 'Аккаунт уже существует — войдите.',
  'auth/invalid-credential': 'Неверный e-mail или пароль.',
  'auth/wrong-password': 'Неверный пароль.',
  'auth/user-not-found': 'Аккаунт не найден — зарегистрируйтесь.',
  'auth/network-request-failed': 'Нет сети.',
};

export default function AuthScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { doSignIn, doRegister, doPasswordReset } = useAppData();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'register') await doRegister(email, password);
      else await doSignIn(email, password);
      setPassword('');
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || err.message);
    }
    setBusy(false);
  };

  const resetPassword = async () => {
    setError(''); setInfo('');
    if (!email.trim()) { setError('Введите e-mail — на него придёт письмо для сброса пароля.'); return; }
    setBusy(true);
    try {
      await doPasswordReset(email);
      setInfo('Письмо для сброса пароля отправлено на ' + email.trim() + '. Проверьте и «Спам».');
    } catch (err) {
      setError(AUTH_ERRORS[err.code] || err.message);
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bgDeep }}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.appTitle, { color: t.accent }]}>Трекер Диеты</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          {mode === 'register' ? 'Создайте аккаунт' : 'Войдите в аккаунт'}
        </Text>
        <Card>
          <Label>E-mail</Label>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            style={styles.input}
          />
          <Label>Пароль</Label>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••"
            style={styles.input}
          />
          {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}
          {info ? <Text style={[styles.info, { color: t.accent }]}>{info}</Text> : null}
          <Button
            title={busy ? 'Подождите…' : mode === 'register' ? 'Зарегистрироваться' : 'Войти'}
            onPress={submit}
            disabled={busy}
          />
          <Pressable onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setInfo(''); }} style={styles.link}>
            <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
              {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
            </Text>
          </Pressable>
          {mode === 'login' && (
            <Pressable onPress={resetPassword} style={styles.link}>
              <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center' }}>Забыли пароль?</Text>
            </Pressable>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    marginBottom: 14,
  },
  error: {
    fontSize: 13,
    marginBottom: 10,
  },
  info: {
    fontSize: 13,
    marginBottom: 10,
  },
  link: {
    marginTop: 14,
  },
});
