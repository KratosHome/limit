const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
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

function dashboard(totalSeconds) {
  return {
    totalSeconds,
    apps: [],
    knownApps: [],
    limits: [],
    settings: { language: 'en' },
  };
}

function harness() {
  const hooks = [];
  const requests = [];
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
    // Drive the real refresh callback explicitly; subscriptions and DOM effects
    // are unrelated to its data/error/race behavior.
    useEffect: () => {},
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    exports: module.exports,
    Error,
    localStorage: { getItem: () => 'light' },
    require(name) {
      if (name === 'react') return react;
      if (name === '../api')
        return {
          limitApi: {
            getDashboard(range) {
              return new Promise((resolve, reject) => {
                requests.push({ range, resolve, reject });
              });
            },
          },
        };
      if (name === '../lib/format')
        return {
          offsetDay: (date) => date,
          toDayKey: () => '2026-09-12',
          rangeForPeriod: (_period, range) => range,
        };
      if (name === '../i18n')
        return {
          __esModule: true,
          default: { resolvedLanguage: 'en', t: (key) => key },
          normalizeLanguage: (language) => language,
        };
      if (name === '../i18n/helpers')
        return { translateError: (_message, fallback) => fallback };
      if (name === '../types/limits')
        return { normalizeLimitPeriod: (period) => period };
      throw new Error(`Unexpected hook dependency: ${name}`);
    },
  });
  return {
    requests,
    render() {
      cursor = 0;
      return module.exports.useLimitApp();
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
