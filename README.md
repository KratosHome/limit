# Limit

Limit — локальний desktop-трекер активного часу для macOS, Windows і Linux/X11. Він показує, скільки часу ви провели в застосунках, дозволяє фільтрувати статистику за періодом і встановлювати щоденні ліміти з системними сповіщеннями.

## Що вже працює

- фонове визначення активного desktop-застосунку;
- добровільний облік часу за доменами в Arc та підтримуваних браузерах на macOS;
- автоматично розгорнута статистика сайтів під браузером у «Топ застосунків»;
- ігнорування простою, sleep і заблокованого екрана;
- локальна статистика за сьогодні, вчора, 7/30 днів або власний період;
- таблиця із пошуком, категоріями та сортуванням;
- щоденні ліміти, раннє попередження й сповіщення при досягненні;
- глобальний перемикач сповіщень про ліміти в налаштуваннях;
- пауза ліміту до кінця дня;
- фоновий режим через tray;
- світла й темна тема;
- автозапуск після пакування застосунку.

Усі дані зберігаються локально у SQLite-базі
`app.getPath('userData')/usage-data.sqlite3`. Під час першого запуску після
оновлення Limit одноразово імпортує наявний `usage-data.json`; старий JSON
залишається поруч як резервна копія. Схема оновлюється versioned migrations, а
на macOS/Linux файли бази, WAL і SHM отримують права `0600`. За замовчуванням
Limit не читає адреси сайтів. Якщо користувач окремо вмикає «Відстеження
сайтів», застосунок зберігає лише hostname (наприклад, `youtube.com`) — без
повного URL, шляху, пошукових параметрів, заголовків сторінок або вмісту.

## Запуск

Потрібні Node.js 22.12 або новіший і npm. Для локальної macOS-збірки також
потрібні Xcode Command Line Tools; Linux/X11 використовує `xprop` із пакета
`x11-utils`.

```bash
npm install
npm run dev
```

Інші команди:

```bash
npm test          # модульні тести сховища
npm run build     # TypeScript + production renderer
npm run lint      # ESLint для React, TypeScript і Electron
npm run format:check # перевірка форматування Prettier
npm run check     # усі перевірки, які виконує pre-push
npm run package   # unpacked desktop build для поточної ОС
npm run package:mac:local # локальний ad-hoc signed Limit.app для macOS
npm run package:win:x64 # unpacked Windows x64 build
npm run test:notification:mac # один нативний test-банер macOS
npm run dist      # підписаний release-артефакт для поточної ОС
npm run dist:win:x64 # підписаний Windows x64 installer
```

Після `npm install` Husky автоматично вмикає Git hooks. `pre-commit` форматує та
перевіряє лише staged-файли, а `pre-push` запускає ESLint, Prettier, тести й build.
`commit-msg` перевіряє повідомлення за стандартом Conventional Commits, наприклад
`feat: додати таймер`, `fix: виправити підрахунок часу` або `chore: оновити залежності`.

Щоб увімкнути статистику сайтів на macOS, відкрийте **Налаштування → Відстеження сайтів** і підтвердьте системні дозволи Accessibility та Automation. Нові доменні дані почнуть накопичуватися після ввімкнення; повні URL не записуються.

На macOS `npm run dev` збирає локальний ad-hoc signed `Limit.app` і запускає
packaged renderer зі сховищем `Limit Development`. Це потрібно для нативних
сповіщень Electron 42+: macOS не приймає їх від сирого непідписаного
`node_modules/electron/dist/Electron.app`. Перед повторним dev-запуском завершіть
попередній Limit через tray; команда зупиниться до перепакування, якщо попередній
підписаний процес ще працює.
Для швидкої роботи над UI з Vite/HMR є `npm run dev:ui`. Він використовує окреме
сховище `Limit UI Development`, тому не конфліктує з підписаним dev-запуском,
але системні сповіщення macOS у цьому непідписаному режимі не підтримуються.

Під час першого підписаного запуску Limit запитує системний дозвіл на
сповіщення, якщо перемикач **Налаштування → Сповіщення про ліміти** увімкнений.
Якщо дозвіл уже відхилений або alerts вимкнені, повторне ввімкнення перемикача
пропонує перейти до **System Settings → Notifications**. Невеликий N-API
bridge читає офіційний `UNUserNotificationCenter.authorizationStatus` усередині
Electron main-process; дата попередження/досягнення зберігається лише після
стану `authorized` і прийнятого системою notification request.

У dev-режимі macOS може привʼязати Accessibility/Automation до застосунку, з якого запущено Electron (`IntelliJ IDEA`, `Terminal` або `Electron`). Для перевірки дозволів під назвою **Limit** потрібно запустити packaged `Limit.app` напряму. Фоновий трекер перевіряє Accessibility без системного prompt; запит із prompt виконується не більше одного разу за запуск і лише після явної дії користувача.

Для окремої локальної macOS-збірки без чинного Developer ID виконайте
`npm run package:mac:local`, а потім відкрийте `Limit.app` у відповідній папці
`release/mac*`. Це ad-hoc підпис лише для локального тестування: після кожної
нової збірки macOS може попросити дозволи знову. Команди `dist` навмисно
відмовляються створювати непідписаний production-реліз: для macOS потрібні
Developer ID Application і нотаризація, для Windows — сертифікат code signing.
Windows-збірка зараз таргетує x64; її інсталятор і системні toast-сповіщення
потрібно smoke-тестувати на реальній Windows 10/11 після встановлення через
створений ярлик.

## Архітектура

- `electron/main.cjs` — lifecycle Electron, tray, IPC, notifications і limit engine;
- `electron/native/macos-notification-permission.mm` — in-process перевірка дозволу macOS;
- `electron/preload.cjs` — вузький API через `contextBridge`;
- `electron/tracker.cjs` — polling активного застосунку та idle/sleep handling;
- `electron/store.cjs` — правила запису статистики, ліміти й агрегація;
- `electron/sqlite-storage.cjs` — SQLite-схема, транзакції, recovery та міграція JSON;
- `src/` — React + TypeScript + Tailwind renderer.

Renderer працює з `contextIsolation: true`, `nodeIntegration: false` і `sandbox: true`. Він не отримує прямого доступу до Node.js або файлової системи.

## Обмеження MVP

- Облік сайтів зараз доступний на macOS для Arc, Safari та підтримуваних Chromium-браузерів і потребує дозволів Accessibility/Automation. На Windows і Linux браузер поки рахується як один застосунок; для кросплатформного обліку доменів потрібне opt-in browser extension.
- Внутрішні сторінки браузера (`arc://`, `chrome://`, new tab) і час без доступного URL входять у час браузера, але не в список сайтів.
- Ліміт показує сповіщення, але не закриває чужий процес автоматично.
- Linux/Wayland не дає стандартного глобального API для активного вікна; Linux/X11 підтримується як beta.
- Історія починається після першого запуску Limit — системну статистику за минулий час він не імпортує.
- Production notifications на macOS варто перевіряти у підписаному/notarized build.

## Наступні кроки

1. Додати raw usage segments та outbox для майбутньої синхронізації.
2. Додати одноразовий таймер, який спливає лише коли вибраний застосунок активний.
3. Підписати macOS/Windows builds і додати CI smoke-тести на кожній ОС.
4. Створити browser extension для добровільного кросплатформного обліку часу за доменами.
