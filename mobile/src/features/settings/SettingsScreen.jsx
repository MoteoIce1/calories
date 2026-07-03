import React from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';

import { useAppData } from '../../app/AppDataProvider.jsx';
import { useTheme } from '../../theme/ThemeContext.jsx';
import ScreenContainer from '../../components/layout/ScreenContainer.jsx';
import { Card, SectionTitle } from '../../components/common/ui.jsx';
import { THEME_LIST } from '../../theme/themes.js';
import { TOGGLEABLE_BLOCKS } from '../../constants/app.js';

// Настройки: тема, масштаб шрифта, видимость блоков дневника.
export default function SettingsScreen() {
  const t = useTheme();
  const { settings, setTheme, setFontScale, toggleBlock } = useAppData();

  return (
    <ScreenContainer>
      <Card>
        <SectionTitle>Тема оформления</SectionTitle>
        <View style={styles.themesWrap}>
          {THEME_LIST.map((theme) => {
            const active = (settings.theme === theme.key) || (settings.theme === 'rain' && theme.key === 'dark-neon-rain');
            return (
              <Pressable
                key={theme.key}
                onPress={() => setTheme(theme.key)}
                style={[
                  styles.themeChip,
                  { backgroundColor: theme.bg, borderColor: active ? t.accent : t.line, borderWidth: active ? 2 : 1 },
                ]}
              >
                <View style={[styles.themeDot, { backgroundColor: theme.dot }]} />
                <Text style={{ color: theme.bg === '#eef3f8' || theme.bg === '#f3faf5' ? '#0f172a' : '#fafafa', fontSize: 11, fontWeight: '600' }}>
                  {theme.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <SectionTitle>Масштаб шрифта</SectionTitle>
        <View style={styles.row}>
          {[{ key: 'normal', label: 'Обычный' }, { key: 'large', label: 'Крупный' }].map((opt) => {
            const active = (settings.fontScale || 'normal') === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setFontScale(opt.key)}
                style={[styles.scaleChip, { backgroundColor: active ? t.accent : t.surfaceStrong, borderColor: active ? t.accent : t.line }]}
              >
                <Text style={{ color: active ? t.accentInk : t.text2, fontWeight: '700', fontSize: 13 }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: t.textFaint, fontSize: 11, marginTop: 8 }}>
          На мобильном размер шрифта также подчиняется системным настройкам доступности.
        </Text>
      </Card>

      <Card>
        <SectionTitle>Блоки дневника</SectionTitle>
        {TOGGLEABLE_BLOCKS.map((block) => (
          <View key={block.key} style={[styles.blockRow, { borderColor: t.line }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{block.label}</Text>
              <Text style={{ color: t.textMuted, fontSize: 11 }}>{block.hint}</Text>
            </View>
            <Switch
              value={settings.blocks?.[block.key] !== false}
              onValueChange={() => toggleBlock(block.key)}
              trackColor={{ true: t.accent, false: t.track }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  themesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  themeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  scaleChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
