# Трекер Диеты — mobile (React Native / Expo)

Мобильная версия трекера для App Store и Google Play. Использует тот же Firebase-проект,
что и web-версия: аккаунт и данные пользователя общие. Web-версия (`../src`) продолжает
работать независимо — этот проект живёт рядом и её не трогает.

## Стек

- Expo SDK 54 (React Native 0.81, React 19)
- React Navigation (drawer + bottom tabs)
- Firebase JS SDK (modular): Auth + Firestore + Functions
- AsyncStorage (замена localStorage)
- expo-print / expo-sharing / expo-file-system — PDF и CSV экспорт
- expo-updates — OTA-обновления (замена service worker)
- react-native-svg — графики прогресса

## Структура

- `src/app` — корень приложения, ErrorBoundary, AppDataProvider (весь дата-слой Firebase)
- `src/navigation` — drawer + bottom tabs
- `src/theme` — темы (токены из CSS-переменных web-версии), ThemeContext
- `src/components` — common UI (Button, Card, Input, модалки, графики), layout
- `src/features` — экраны: diary, food, progress, activity, disputes, friends, profile, settings, export, updates, auth
- `src/utils` — чистая бизнес-логика, скопирована из web без изменений (kbju, activity, food, progress, challenges, export, math, stats, date)
- `src/constants` — константы приложения и ключи хранилища
- `src/services` — firebase, foodAi (AI-шлюз), storage (AsyncStorage)

## Запуск

```bash
npm install
npx expo start          # QR-код для Expo Go / dev build
```

## Сборка через EAS

Перед первой сборкой:

1. `npm install -g eas-cli && eas login`
2. `eas init` — создаст projectId (заменить TODO_EAS_PROJECT_ID в app.json)
3. Добавить иконку и splash в `assets/` и прописать в app.json

Команды:

```bash
npx eas build --platform android --profile preview   # APK для теста
npx eas build --platform android                     # AAB для Google Play
npx eas build --platform ios                         # для App Store (нужен Apple Developer)
npx eas submit --platform android
npx eas submit --platform ios
npx eas update                                       # OTA-обновление без пересборки
```

## Проверки

```bash
npx expo-doctor
npx expo export --platform android   # проверка, что бандл собирается
npx expo export --platform ios
```

## Что осталось (TODO)

- Иконка приложения и splash screen (assets/) — обязательно для сторов.
- EAS projectId в app.json (`eas init`).
- Фото прогресса тела: нужен expo-image-picker (в web фото хранятся base64 в Firestore).
- App Check для mobile (Play Integrity / App Attest) — web reCAPTCHA здесь не работает.
- Онбординг при регистрации (в web — модалка после регистрации); сейчас данные заполняются в Профиле.
- Offline-персистентность Firestore (в web включена через IndexedDB, в RN требует отдельной настройки).
- Обязательные обновления: remote version endpoint + blocking screen.
