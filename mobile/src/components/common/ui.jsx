import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

import { useTheme } from '../../theme/ThemeContext.jsx';

// Базовые UI-примитивы: заменяют Tailwind-классы web-версии.
// Все цвета берутся из активной темы (theme tokens).

export function Card({ children, style }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children, style }) {
  const t = useTheme();
  return (
    <Text style={[styles.sectionTitle, { color: t.accent }, style]}>
      {String(children || '').toUpperCase()}
    </Text>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled, style, small }) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.accent
    : variant === 'danger' ? t.danger
    : t.surfaceStrong;
  const color = variant === 'primary' ? t.accentInk
    : variant === 'danger' ? '#fff'
    : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color }]}>{title}</Text>
    </Pressable>
  );
}

export function Input({ style, ...props }) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.textFaint}
      selectTextOnFocus
      {...props}
      style={[
        styles.input,
        { backgroundColor: t.surfaceStrong, color: t.text, borderColor: t.line },
        style,
      ]}
    />
  );
}

export function Label({ children, style }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.textMuted }, style]}>{children}</Text>;
}

export function EmptyState({ text }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={{ color: t.textMuted, fontSize: 13, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

// Горизонтальный сегментированный переключатель (например, периоды прогресса).
export function Segmented({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={styles.segmentRow}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[
              styles.segment,
              { backgroundColor: active ? t.accent : t.surfaceStrong, borderColor: active ? t.accent : t.line },
            ]}
          >
            <Text style={{ color: active ? t.accentInk : t.textMuted, fontSize: 11, fontWeight: '700' }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ progress, color, height = 8 }) {
  const t = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: t.track, height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${Math.max(0, Math.min(100, progress))}%`,
          backgroundColor: color || t.accent,
          height: '100%',
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSmall: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  buttonTextSmall: {
    fontSize: 12,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  empty: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  segment: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
});
