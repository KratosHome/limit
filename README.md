# Limit

Limit — локальний desktop-трекер активного часу для macOS, Windows і Linux/X11. Він показує, скільки часу ви провели в застосунках, дозволяє фільтрувати статистику за періодом і встановлювати денні, тижневі або місячні ліміти з системними сповіщеннями.

## Що вже працює

- фонове визначення активного desktop-застосунку;
- добровільний облік часу за доменами в Arc та підтримуваних браузерах на macOS;
- автоматично розгорнута статистика сайтів під браузером у «Топ застосунків»;
- ігнорування простою, sleep і заблокованого екрана;
- локальна статистика за сьогодні, вчора, 7/30 днів або власний період;
- таблиця із пошуком, категоріями та сортуванням;
- денні, тижневі й місячні ліміти, раннє попередження та сповіщення при досягненні;
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

## Graphify

[Graphify](https://github.com/Graphify-Labs/graphify) будує локальний граф
залежностей коду. Skill для Codex включений у
`.agents/skills/graphify/`, а правила використання — в `AGENTS.md`.
Для CLI потрібні Python 3.10+ та [uv](https://docs.astral.sh/uv/).
Перевірена версія — `graphifyy==0.9.53` (назва пакета має дві `y`).

```bash
uv tool install graphifyy==0.9.53
npm run graphify:build
npm run graphify:query -- "limit notifications"
npm run graphify:update
```

`graphify:build` аналізує код локально, без LLM та API-ключів, і створює
`graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md` та інтерактивний
`graphify-out/graph.html`. Після змін коду граф можна оновити через
`graphify:update`. Згенеровані файли виключені з Git, а `.graphifyignore`
виключає залежності, збірки та службові файли з індексації.
У Codex skill можна викликати як `$graphify`; термінальні запити також
доступні через `graphify query`, `graphify path` і `graphify explain`.

Якщо термінал не знаходить `graphify` після встановлення, виконайте
`uv tool update-shell` та відкрийте новий термінал.

## Команди розробки

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
npm run dist:mac:universal # підписані universal DMG + ZIP для macOS
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

## Розповсюдження та автоматичні оновлення

Користувачеві потрібно надіслати лише один встановщик для його ОС:

- Windows: файл `.exe` (NSIS, x64).
- macOS: файл `.dmg` з universal-застосунком для Intel та Apple Silicon.

Першу версію з підтримкою оновлень людина встановлює вручну. Після цього
релізний Limit перевіряє GitHub Releases при запуску та кожні чотири години,
завантажує нову версію у фоні та встановлює її під час виходу із застосунку.
У меню tray видно поточну версію; там також можна перевірити оновлення вручну
або перезапустити Limit для встановлення завантаженої версії. Закриття вікна
лише ховає Limit у tray; для виходу використовуйте пункт «Вийти».
Статистика та налаштування залишаються у наявному каталозі користувача.
Локальні та dev-збірки не завантажують production-оновлення.
Помилки оновлення записуються в `logs/updates.log` усередині каталогу
даних Limit; розмір журналу обмежений 1 МіБ із ротацією.

### Одноразове налаштування GitHub

Релізи завантажуються з публічного репозиторію `KratosHome/limit`; GitHub-акаунт
або токен на комп’ютерах користувачів не потрібен. У GitHub відкрийте
**Settings → Secrets and variables → Actions → New repository secret** та
додайте дані підписування:

| Secret                        | Значення                                               |
| ----------------------------- | ------------------------------------------------------ |
| `MAC_CSC_LINK`                | Експортований Developer ID Application `.p12` у base64 |
| `MAC_CSC_KEY_PASSWORD`        | Пароль цього `.p12`                                    |
| `APPLE_ID`                    | Apple ID учасника Apple Developer Program              |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password для нотаризації                  |
| `APPLE_TEAM_ID`               | Apple Developer Team ID                                |
| `WIN_CSC_LINK`                | Windows code-signing `.pfx` у base64, придатний для CI |
| `WIN_CSC_KEY_PASSWORD`        | Пароль цього `.pfx`                                    |

Секрети не потрібно записувати у код або передавати користувачам.
Для macOS потрібні чинний Developer ID та нотаризація Apple. Windows-реліз
також вимагає підписування; якщо сертифікат працює через апаратний ключ або
хмарний сервіс, крок підписування у workflow потрібно адаптувати до провайдера.
Без налаштованих сертифікатів workflow зупиниться до публікації.

### Що відбувається після push

Workflow `.github/workflows/release.yml` запускається після push у `main`.
Він призначає нову версію, перевіряє код, збирає Windows та macOS на відповідних
GitHub runners, перевіряє готові файли й публікує реліз лише після успіху обох
збірок. Невдала збірка залишає попередній реліз доступним для користувачів.

Номер версії обчислюється як `major.minor.(patch + GITHUB_RUN_NUMBER)` на основі
`package.json`: база `0.1.0` і запуск №42 дають `0.1.42`. Це зміна лише у CI;
workflow не створює комітів у репозиторії. Не зменшуйте базову версію та не
замінюйте опубліковані релізи старішими збірками. Пуш у `main` означає випуск
для всіх користувачів, тому незавершені зміни краще тримати в окремих гілках.

На сторінці GitHub Releases потрібно зберігати також `.zip`, `.yml` та
`.blockmap`: вони потрібні механізму оновлення. Надсилати ці службові файли
людям не потрібно — достатньо `.exe` або `.dmg`.

Після налаштування підписування ці самі встановщики можна зібрати локально
через `npm run dist:win:x64 -- --publish never` на Windows або
`npm run dist:mac:universal -- --publish never` на Mac. Релізні файли потрапляють
у `release/publish/`, окремо від тестових локальних збірок.

Перед першим розповсюдженням перевірте встановлення та перехід між двома
послідовними підписаними версіями на Windows і macOS. Збірка й модульні тести
не підтверджують системне встановлення та перевірку підписів на чужій ОС.

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
