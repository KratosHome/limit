const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { setImmediate: nextTurn } = require('node:timers/promises');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(
  fs.readFileSync(
    path.join(__dirname, '../../src/hooks/use-limit-app.ts'),
    'utf8',
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  },
).outputText;
const formatSource = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../../src/lib/format.ts'), 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  },
).outputText;

function dashboard(totalSeconds) {
  return {
    totalSeconds,
    apps: [],
    knownApps: [],
    limits: [],
    settings: { language: 'en' },
  };
}

function harness({ runEffects = false } = {}) {
  const hooks = [];
  const requests = [];
  const effects = [];
  const intervals = new Map();
  const listeners = new Map();
  const clock = { now: new Date('2026-09-12T23:59:50').getTime() };
  let nextTimerId = 0;
  class ClockDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [clock.now]));
    }
    static now() {
      return clock.now;
    }
  }
  const language = {
    __esModule: true,
    default: { resolvedLanguage: 'en', t: (key) => key },
    normalizeLanguage: (value) => value,
  };
  const formatModule = { exports: {} };
  vm.runInNewContext(formatSource, {
    module: formatModule,
    exports: formatModule.exports,
    Date: ClockDate,
    require: () => language,
  });
  let cursor = 0;
  function memo(factory, dependencies) {
    const index = cursor++;
    const previous = hooks[index];
    if (
      !previous ||
      dependencies.some((value, key) => !Object.is(value, previous.deps[key]))
    ) {
      hooks[index] = { value: factory(), deps: dependencies };
    }
    return hooks[index].value;
  }
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks))
        hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [
        hooks[index],
        (value) => {
          hooks[index] =
            typeof value === 'function' ? value(hooks[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      hooks[index] ??= { current: initial };
      return hooks[index];
    },
    useMemo: memo,
    useCallback: (callback, dependencies) => memo(() => callback, dependencies),
    useEffect(callback, dependencies) {
      if (!runEffects) return;
      const index = cursor++;
      const previous = hooks[index];
      if (
        !previous ||
        dependencies.some((value, key) => !Object.is(value, previous.deps[key]))
      ) {
        const effect = { deps: dependencies };
        hooks[index] = effect;
        effects.push(() => {
          previous?.cleanup?.();
          effect.cleanup = callback();
        });
      }
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    Error,
    Date: ClockDate,
    localStorage: { getItem: () => 'light', setItem: () => {} },
    document: { documentElement: { classList: { toggle: () => {} } } },
    window: {
      setInterval(callback, delay) {
        const id = ++nextTimerId;
        intervals.set(id, { callback, delay });
        return id;
      },
      clearInterval: (id) => intervals.delete(id),
      addEventListener: (event, callback) => listeners.set(event, callback),
      removeEventListener: (event, callback) => {
        if (listeners.get(event) === callback) listeners.delete(event);
      },
    },
    require(name) {
      if (name === 'react') return react;
      if (name === '../api')
        return {
          limitApi: {
            onDataUpdated: () => () => {},
            onLimitNotification: () => () => {},
            getDashboard(range) {
              return new Promise((resolve, reject) => {
                requests.push({ range, resolve, reject });
              });
            },
          },
        };
      if (name === '../lib/format') return formatModule.exports;
      if (name === '../i18n') return language;
      if (name === '../i18n/helpers')
        return { translateError: (_message, fallback) => fallback };
      if (name === '../types/limits')
        return { normalizeLimitPeriod: (period) => period };
      throw new Error(`Unexpected hook dependency: ${name}`);
    },
  });
  return {
    requests,
    clock,
    intervals,
    listeners,
    checkDay: () => intervals.forEach(({ callback }) => callback()),
    focus: () => listeners.get('focus')?.(),
    dispose: () => hooks.forEach((hook) => hook?.cleanup?.()),
    render() {
      cursor = 0;
      const state = module.exports.useLimitApp();
      for (const effect of effects.splice(0)) effect();
      return state;
    },
  };
}

test('background dashboard failures resolve safely, report an error and retain displayed data', async () => {
  const h = harness();
  const initial = h.render().loadDashboard();
  h.requests[0].resolve(dashboard(100));
  await initial;
  const displayedData = h.render().data;

  const refresh = h.render().loadDashboard();
  h.requests[1].reject(new Error('storageRead'));
  await assert.doesNotReject(refresh);

  const state = h.render();
  assert.equal(state.data, displayedData);
  assert.equal(state.error, 'dashboardLoad');
  assert.equal(state.loading, false);
});

test('mutation refresh rejects for dialog recovery, retains displayed data and succeeds on retry', async () => {
  const h = harness();
  const initial = h.render().loadDashboard();
  h.requests[0].resolve(dashboard(100));
  await initial;
  const displayedData = h.render().data;
  const error = new Error('storageRead');

  const refresh = h.render().loadDashboard(true, { throwOnError: true });
  assert.equal(h.render().loading, true);
  h.requests[1].reject(error);
  await assert.rejects(refresh, (reason) => reason === error);
  assert.equal(h.render().data, displayedData);
  assert.equal(h.render().error, '');
  assert.equal(h.render().loading, false);

  const retry = h.render().loadDashboard(false, { throwOnError: true });
  h.requests[2].resolve(dashboard(200));
  await retry;
  assert.equal(h.render().data.totalSeconds, 200);
  assert.equal(h.render().error, '');
});

test('older dashboard results and background errors never replace newer displayed data', async () => {
  const h = harness();
  const olderResult = h.render().loadDashboard();
  const olderFailure = h.render().loadDashboard();
  const latest = h.render().loadDashboard();
  h.requests[2].resolve(dashboard(300));
  await latest;

  h.requests[0].resolve(dashboard(100));
  h.requests[1].reject(new Error('storageRead'));
  await Promise.all([olderResult, olderFailure]);
  assert.equal(h.render().data.totalSeconds, 300);
  assert.equal(h.render().error, '');
});

test('range changes discard stale data but still return mutation failures to their caller', async () => {
  const h = harness();
  h.render().setPeriod('custom');
  const oldRange = h.render().loadDashboard();
  const nextRange = { from: '2026-09-01', to: '2026-09-07' };
  h.render().setCustomRange(nextRange);
  h.render();
  h.requests[0].resolve(dashboard(100));
  await oldRange;
  assert.equal(h.render().data, null);

  const mutation = h.render().loadDashboard(false, { throwOnError: true });
  const finalRange = { from: '2026-08-01', to: '2026-08-07' };
  h.render().setCustomRange(finalRange);
  h.render();
  const error = new Error('storageRead');
  h.requests[1].reject(error);
  await assert.rejects(mutation, (reason) => reason === error);
  assert.equal(h.render().data, null);
  assert.equal(h.render().error, '');

  const refresh = h.render().loadDashboard();
  assert.equal(h.requests[2].range, finalRange);
  h.requests[2].resolve(dashboard(200));
  await refresh;
  assert.equal(h.render().data.totalSeconds, 200);
});

for (const [period, from, to] of [
  ['today', '2026-09-13', '2026-09-13'],
  ['yesterday', '2026-09-12', '2026-09-12'],
  ['7days', '2026-09-07', '2026-09-13'],
  ['30days', '2026-08-15', '2026-09-13'],
]) {
  test(`${period} follows the local day on refresh and rejects a late previous-day response`, async () => {
    const h = harness();
    h.render().setPeriod(period);
    const refresh = h.render().loadDashboard;
    const oldDay = refresh();
    h.clock.now = new Date('2026-09-13T00:00:01').getTime();
    const newDay = refresh();
    assert.deepEqual({ ...h.requests[1].range }, { from, to });

    h.requests[1].resolve(dashboard(200));
    await newDay;
    h.requests[0].resolve(dashboard(100));
    await oldDay;
    assert.equal(h.render().data.totalSeconds, 200);
    assert.equal(h.render().loadDashboard, refresh);
  });
}

test('a request crossing midnight is rejected even before another request starts', async () => {
  const h = harness();
  const oldDay = h.render().loadDashboard();
  h.clock.now = new Date('2026-09-13T00:00:01').getTime();
  h.requests[0].resolve(dashboard(100));
  await oldDay;
  assert.equal(h.requests.length, 1);
  assert.equal(h.render().data, null);

  const newDay = h.render().loadDashboard();
  h.requests[1].resolve(dashboard(200));
  await newDay;
  assert.equal(h.render().data.totalSeconds, 200);
  assert.equal(h.render().loading, false);
});

test('a custom range stays fixed across midnight and accepts its pending response', async () => {
  const h = harness();
  const selected = { from: '2026-08-01', to: '2026-08-07' };
  h.render().setPeriod('custom');
  h.render().setCustomRange(selected);
  const pending = h.render().loadDashboard();
  h.clock.now = new Date('2026-09-13T00:00:01').getTime();
  h.requests[0].resolve(dashboard(100));
  await pending;
  assert.equal(h.render().data.totalSeconds, 100);

  const refresh = h.render().loadDashboard();
  assert.equal(h.requests[0].range, selected);
  assert.equal(h.requests[1].range, selected);
  h.requests[1].resolve(dashboard(200));
  await refresh;
  assert.equal(h.render().data.totalSeconds, 200);
});

test('day polling rolls over without tracking events and focus refreshes after sleep, with cleanup', async () => {
  const h = harness({ runEffects: true });
  const refresh = h.render().loadDashboard;
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(dashboard(100));
  await nextTurn();
  assert.equal(h.render().data.totalSeconds, 100);
  assert.equal(h.intervals.size, 1);
  assert.equal([...h.intervals.values()][0].delay, 30_000);
  h.checkDay();
  assert.equal(h.requests.length, 1);

  h.clock.now = new Date('2026-09-13T00:00:20').getTime();
  h.checkDay();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(
    { ...h.requests[1].range },
    { from: '2026-09-13', to: '2026-09-13' },
  );
  h.requests[1].resolve(dashboard(200));
  await nextTurn();
  assert.equal(h.render().data.totalSeconds, 200);
  h.checkDay();
  assert.equal(h.requests.length, 2);

  h.clock.now = new Date('2026-09-15T11:00:00').getTime();
  h.focus();
  assert.equal(h.requests.length, 3);
  assert.deepEqual(
    { ...h.requests[2].range },
    { from: '2026-09-15', to: '2026-09-15' },
  );
  h.requests[2].resolve(dashboard(300));
  await nextTurn();
  assert.equal(h.render().data.totalSeconds, 300);
  assert.equal(h.render().loadDashboard, refresh);
  h.checkDay();
  assert.equal(h.requests.length, 3);

  h.dispose();
  assert.equal(h.intervals.size, 0);
  assert.equal(h.listeners.size, 0);
  h.focus();
  h.checkDay();
  assert.equal(h.requests.length, 3);
});
