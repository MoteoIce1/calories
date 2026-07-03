import React from 'react';
import { Pressable } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { TAB_TITLES } from '../constants/routes.js';
import { useTheme } from '../theme/ThemeContext.jsx';
import DiaryScreen from '../features/diary/DiaryScreen.jsx';
import ProgressScreen from '../features/progress/ProgressScreen.jsx';
import FoodBaseScreen from '../features/food/FoodBaseScreen.jsx';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Diary: 'restaurant-outline',
  Progress: 'trending-up-outline',
  Directory: 'library-outline',
};

// Нижние вкладки — как в web BottomNav: Дневник / Прогресс / База.
export default function BottomTabs({ navigation }) {
  const t = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: t.bgDeep },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 16 },
        headerLeft: () => (
          <Pressable onPress={() => navigation.openDrawer()} hitSlop={12} style={{ paddingHorizontal: 16 }}>
            <Ionicons name="menu-outline" size={24} color={t.text} />
          </Pressable>
        ),
        tabBarStyle: { backgroundColor: t.navSolid, borderTopColor: t.line },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Diary" component={DiaryScreen} options={{ title: TAB_TITLES.diary }} />
      <Tab.Screen name="Progress" component={ProgressScreen} options={{ title: TAB_TITLES.progress }} />
      <Tab.Screen name="Directory" component={FoodBaseScreen} options={{ title: TAB_TITLES.directory }} />
    </Tab.Navigator>
  );
}
