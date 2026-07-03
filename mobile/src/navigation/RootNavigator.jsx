import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';

import { TAB_TITLES } from '../constants/routes.js';
import { useTheme } from '../theme/ThemeContext.jsx';
import { useAppData } from '../app/AppDataProvider.jsx';
import BottomTabs from './BottomTabs.jsx';
import ProfileScreen from '../features/profile/ProfileScreen.jsx';
import FriendsScreen from '../features/friends/FriendsScreen.jsx';
import DisputesScreen from '../features/disputes/DisputesScreen.jsx';
import ExportScreen from '../features/export/ExportScreen.jsx';
import SettingsScreen from '../features/settings/SettingsScreen.jsx';
import AboutScreen from '../features/updates/AboutScreen.jsx';
import SupportScreen from '../features/settings/SupportScreen.jsx';

const Drawer = createDrawerNavigator();

// Пункты drawer-меню — как в web DrawerMenu.jsx.
const DRAWER_ITEMS = [
  { route: 'Main', label: 'Дневник', icon: 'home-outline' },
  { route: 'Profile', label: TAB_TITLES.profile, icon: 'person-outline' },
  { route: 'Friends', label: 'Друзья', icon: 'people-outline' },
  { route: 'Disputes', label: 'Споры', icon: 'trophy-outline' },
  { route: 'Export', label: 'Экспорт отчёта', icon: 'download-outline' },
  { route: 'Settings', label: TAB_TITLES.settings, icon: 'options-outline' },
  { route: 'About', label: TAB_TITLES.about, icon: 'information-circle-outline' },
  { route: 'Support', label: TAB_TITLES.support, icon: 'help-circle-outline' },
];

function DrawerContent({ navigation, state }) {
  const t = useTheme();
  const { myDisplayName, userEmail, doSignOut, confirmDialog } = useAppData();
  const activeRoute = state.routeNames[state.index];

  const signOut = async () => {
    navigation.closeDrawer();
    if (await confirmDialog('Выйти из аккаунта?')) doSignOut();
  };

  return (
    <DrawerContentScrollView contentContainerStyle={{ flex: 1 }}>
      <View style={styles.profileBlock}>
        <Text style={[styles.name, { color: t.text }]}>{myDisplayName}</Text>
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{userEmail}</Text>
      </View>
      {DRAWER_ITEMS.map((item) => {
        const active = item.route === activeRoute;
        return (
          <Pressable
            key={item.route}
            onPress={() => navigation.navigate(item.route)}
            style={[styles.item, active && { backgroundColor: t.accentSoft }]}
          >
            <Ionicons name={item.icon} size={20} color={active ? t.accent : t.textMuted} />
            <Text style={[styles.itemText, { color: active ? t.accent : t.text }]}>{item.label}</Text>
          </Pressable>
        );
      })}
      <View style={styles.spacer} />
      <Pressable onPress={signOut} style={styles.item}>
        <Ionicons name="log-out-outline" size={20} color={t.danger} />
        <Text style={[styles.itemText, { color: t.danger }]}>Выход</Text>
      </Pressable>
    </DrawerContentScrollView>
  );
}

export default function RootNavigator() {
  const t = useTheme();
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: t.bgDeep },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 16 },
        drawerStyle: { backgroundColor: t.surface },
        sceneStyle: { backgroundColor: t.bgDeep },
      }}
    >
      <Drawer.Screen name="Main" component={BottomTabs} options={{ title: 'Трекер Диеты', headerShown: false }} />
      <Drawer.Screen name="Profile" component={ProfileScreen} options={{ title: TAB_TITLES.profile }} />
      <Drawer.Screen name="Friends" component={FriendsScreen} options={{ title: 'Друзья' }} />
      <Drawer.Screen name="Disputes" component={DisputesScreen} options={{ title: 'Споры' }} />
      <Drawer.Screen name="Export" component={ExportScreen} options={{ title: 'Экспорт отчёта' }} />
      <Drawer.Screen name="Settings" component={SettingsScreen} options={{ title: TAB_TITLES.settings }} />
      <Drawer.Screen name="About" component={AboutScreen} options={{ title: TAB_TITLES.about }} />
      <Drawer.Screen name="Support" component={SupportScreen} options={{ title: TAB_TITLES.support }} />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  profileBlock: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 8,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  spacer: { flex: 1 },
});
