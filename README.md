# Limit

Limit — локальний desktop-трекер активного часу для macOS, Windows і Linux/X11. Він показує, скільки часу ви провели в застосунках, дозволяє фільтрувати статистику за періодом і встановлювати щоденні ліміти з системними сповіщеннями.

## Що вже працює

- фонове визначення активного desktop-застосунку;
- ігнорування простою, sleep і заблокованого екрана;
- локальна статистика за сьогодні, вчора, 7/30 днів або власний період;
- таблиця із пошуком, категоріями та сортуванням;
- щоденні ліміти, раннє попередження й сповіщення при досягненні;
- пауза ліміту до кінця дня;
- фоновий режим через tray;
- світла й темна тема;
- автозапуск після пакування застосунку.

Усі дані зберігаються локально у `app.getPath('userData')/usage-data.json`. Limit не зберігає заголовки вікон, URL, тексти повідомлень або вміст документів.

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
npm run package   # unpacked desktop build для поточної ОС
npm run dist      # інсталятор/образ для поточної ОС
```

## Архітектура

- `electron/main.cjs` — lifecycle Electron, tray, IPC, notifications і limit engine;
- `electron/preload.cjs` — вузький API через `contextBridge`;
- `electron/tracker.cjs` — polling активного застосунку та idle/sleep handling;
- `electron/store.cjs` — атомарне локальне збереження й агрегація;
- `src/` — React + TypeScript + Tailwind renderer.

Renderer працює з `contextIsolation: true`, `nodeIntegration: false` і `sandbox: true`. Він не отримує прямого доступу до Node.js або файлової системи.

## Обмеження MVP

- Telegram рахується як окремий застосунок. Instagram у вкладці браузера входить у загальний час Chrome/Safari; для статистики за доменами потрібне окреме opt-in browser extension.
- Ліміт показує сповіщення, але не закриває чужий процес автоматично.
- Linux/Wayland не дає стандартного глобального API для активного вікна; Linux/X11 підтримується як beta.
- Історія починається після першого запуску Limit — системну статистику за минулий час він не імпортує.
- Production notifications на macOS варто перевіряти у підписаному/notarized build.

## Наступні кроки

1. Перейти з агрегованого JSON на SQLite із raw usage segments і міграціями.
2. Додати одноразовий таймер, який спливає лише коли вибраний застосунок активний.
3. Підписати macOS/Windows builds і додати CI smoke-тести на кожній ОС.
4. За потреби створити browser extension для добровільного обліку часу за доменами.
