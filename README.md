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

Потрібен актуальний Node.js і npm.

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
npm run dist      # інсталятор/образ для поточної ОС
```

Після `npm install` Husky автоматично вмикає Git hooks. `pre-commit` форматує та
перевіряє лише staged-файли, а `pre-push` запускає ESLint, Prettier, тести й build.
`commit-msg` перевіряє повідомлення за стандартом Conventional Commits, наприклад
`feat: додати таймер`, `fix: виправити підрахунок часу` або `chore: оновити залежності`.

Щоб увімкнути статистику сайтів на macOS, відкрийте **Налаштування → Відстеження сайтів** і підтвердьте системні дозволи Accessibility та Automation. Нові доменні дані почнуть накопичуватися після ввімкнення; повні URL не записуються.

У dev-режимі macOS може привʼязати Accessibility/Automation до застосунку, з якого запущено Electron (`IntelliJ IDEA`, `Terminal` або `Electron`). Для перевірки дозволів під назвою **Limit** потрібно запустити packaged `Limit.app` напряму. Фоновий трекер перевіряє Accessibility без системного prompt; запит із prompt виконується не більше одного разу за запуск і лише після явної дії користувача.

Для локальної macOS-збірки без чинного Developer ID після `npm run package` виконайте `npm run sign:mac:local`, а потім відкрийте `release/mac-arm64/Limit.app`. Це ad-hoc підпис лише для локального тестування: після кожної нової збірки macOS може попросити дозволи знову. Для стабільного релізу потрібен чинний сертифікат Apple Development або Developer ID Application.

## Архітектура

- `electron/main.cjs` — lifecycle Electron, tray, IPC, notifications і limit engine;
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
