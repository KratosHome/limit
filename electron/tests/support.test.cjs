const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const errors = require('../errors.cjs');
const { createSupport, validateFeedback } = require('../support.cjs');
const supportConfig = require('../support-config.cjs');
const { GITHUB_URL, publicUrl, buildPublicSupportConfig, readSupportConfig } =
  supportConfig;

const config = {
  feedbackUrl: 'https://feedback.example.org/v1/feedback',
  donationUrl: 'https://donate.example.org/limit?currency=UAH',
};
const feedback = {
  message: 'Please add a useful health integration.',
  contact: 'person@example.org',
  source: 'health',
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const isCode = (code) => (error) => {
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  return true;
};
const success = () => ({
  status: 200,
  ok: true,
  json: async () => ({ ok: true }),
});

function supportHarness(options = {}) {
  const calls = [];
  const opened = [];
  const clock = { now: 100_000 };
  const support = createSupport({
    config,
    now: () => clock.now,
    fetch: async (...args) => {
      calls.push(args);
      return success();
    },
    openExternal: async (url) => opened.push(url),
    ...options,
  });
  return { support, calls, opened, clock };
}

test('feedback validates exact field types and lengths before any network request', async () => {
  const h = supportHarness();
  for (const input of [
    null,
    [],
    'hello',
    {},
    { ...feedback, message: null },
    { ...feedback, message: 1234567890 },
    { ...feedback, message: new String('long enough message') },
    { ...feedback, message: '         short         ' },
    { ...feedback, message: 'x'.repeat(3001) },
    { ...feedback, source: 'https://elsewhere.example.org' },
    { ...feedback, source: undefined },
    { ...feedback, source: ['health'] },
    { ...feedback, contact: null },
    { ...feedback, contact: {} },
    { ...feedback, contact: 'x'.repeat(201) },
  ]) {
    await assert.rejects(
      h.support.sendFeedback(input),
      isCode(errors.ERROR_CODES.FEEDBACK_INVALID),
    );
  }
  assert.equal(h.calls.length, 0);
  assert.deepEqual(
    validateFeedback({ message: '  0123456789  ', source: 'settings' }),
    { message: '0123456789', source: 'settings', contact: '' },
  );
  assert.equal(
    validateFeedback({
      ...feedback,
      message: 'x'.repeat(3000),
      contact: 'y'.repeat(200),
    }).message.length,
    3000,
  );
});

test('feedback sends only the three requested fields, omitting diagnostics, URLs, tokens and other private extras', async () => {
  const h = supportHarness();
  const input = {
    ...feedback,
    message: `  ${feedback.message}  `,
    contact: `  ${feedback.contact}  `,
    websiteHistory: ['private.example.org'],
    settings: { secret: 'synthetic-private-setting' },
    token: 'synthetic-private-token',
    url: 'https://unrequested.example.org',
    chatId: 'synthetic-private-chat',
  };
  Object.defineProperty(input, 'diagnostics', {
    get() {
      throw new Error('unrequested diagnostics must not be read');
    },
    enumerable: true,
  });
  assert.equal(await h.support.sendFeedback(input), true);
  assert.equal(h.calls.length, 1);
  const [url, options] = h.calls[0];
  assert.equal(url, config.feedbackUrl);
  assert.deepEqual(JSON.parse(options.body), feedback);
  assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  assert.equal(options.credentials, 'omit');
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(h.support.getConfig(), {
    feedbackAvailable: true,
    donationAvailable: true,
  });
});

test('public URLs require HTTPS and reject malformed, credentialed or unsafe feedback destinations', () => {
  assert.equal(
    publicUrl(config.feedbackUrl, { feedback: true }),
    config.feedbackUrl,
  );
  assert.equal(publicUrl(config.donationUrl), config.donationUrl);
  for (const url of [
    undefined,
    null,
    123,
    {},
    [],
    '',
    'not a URL',
    '//example.org/path',
    'http://example.org/path',
    'file:///tmp/test',
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://user:password@example.org/feedback',
    'https://example.org/feedback#section',
    `https://example.org/${'x'.repeat(2048)}`,
  ])
    assert.equal(publicUrl(url), '', String(url));
  for (const url of [
    'https://example.org/feedback?token=synthetic-secret',
    'https://api.telegram.org/bot-synthetic-token/sendMessage',
    'https://api.telegram.org./bot-synthetic-token/sendMessage',
  ])
    assert.equal(publicUrl(url, { feedback: true }), '', url);
});

test('loopback relay URLs are development-only, including alternate loopback spellings in releases', () => {
  for (const url of [
    'http://127.0.0.1:8787/feedback',
    'http://localhost:8787/feedback',
    'http://[::1]:8787/feedback',
  ]) {
    assert.equal(publicUrl(url, { feedback: true, loopback: true }), url);
    assert.equal(publicUrl(url, { feedback: true }), '');
  }
  for (const url of [
    'https://127.0.0.1/feedback',
    'https://127.0.0.2/feedback',
    'https://127.1/feedback',
    'https://localhost./feedback',
    'https://[::1]/feedback',
    'https://[::ffff:127.0.0.1]/feedback',
  ])
    assert.equal(publicUrl(url, { feedback: true }), '', url);
  assert.equal(
    publicUrl('http://192.168.1.2/feedback', {
      feedback: true,
      loopback: true,
    }),
    '',
  );
  assert.equal(
    publicUrl('http://localhost.example.org/feedback', {
      feedback: true,
      loopback: true,
    }),
    '',
  );
});

test('build config serializes only explicitly public URLs and rejects accidental browser Telegram credentials', () => {
  const env = {
    LIMIT_FEEDBACK_URL: config.feedbackUrl,
    LIMIT_DONATION_URL: config.donationUrl,
    TELEGRAM_BOT_TOKEN: 'synthetic-private-bot-token',
    TELEGRAM_CHAT_ID: 'synthetic-private-chat-id',
    LIMIT_FEEDBACK_DEV_URL: 'http://localhost:8787/private',
    OTHER_SECRET: 'synthetic-private-secret',
  };
  assert.deepEqual(buildPublicSupportConfig(env), config);
  assert.doesNotMatch(
    JSON.stringify(buildPublicSupportConfig(env)),
    /synthetic-private|localhost/,
  );
  assert.deepEqual(buildPublicSupportConfig({}), {
    feedbackUrl: '',
    donationUrl: '',
  });
  for (const patch of [
    { LIMIT_FEEDBACK_URL: 'http://localhost:8787/feedback' },
    { LIMIT_FEEDBACK_URL: 'https://example.org/?token=synthetic-secret' },
    { LIMIT_DONATION_URL: 'javascript:alert(1)' },
    { VITE_TELEGRAM_BOT_TOKEN: 'synthetic-private-bot-token' },
    { VITE_PUBLIC_TELEGRAM_CHAT_ID: 'synthetic-private-chat-id' },
  ]) {
    assert.throws(
      () => buildPublicSupportConfig({ ...env, ...patch }),
      (error) => {
        assert.doesNotMatch(
          error.message,
          /synthetic-private|synthetic-secret/,
        );
        return true;
      },
    );
  }
});

test('public config writer writes a minimal artifact and never logs environment values', () => {
  const written = [];
  const logs = [];
  const env = {
    LIMIT_FEEDBACK_URL: config.feedbackUrl,
    LIMIT_DONATION_URL: config.donationUrl,
    TELEGRAM_BOT_TOKEN: 'synthetic-never-serialize-token',
    TELEGRAM_CHAT_ID: 'synthetic-never-serialize-chat',
  };
  const run = () => {
    const processMock = { env, exitCode: 0 };
    vm.runInNewContext(
      fs.readFileSync(
        path.join(__dirname, '../../scripts/write-support-config.cjs'),
        'utf8',
      ),
      {
        require(name) {
          if (name === 'node:fs')
            return {
              mkdirSync() {},
              writeFileSync: (...args) => written.push(args),
            };
          if (name === 'node:path') return path;
          if (name === '../electron/support-config.cjs')
            return {
              buildPublicSupportConfig: () => buildPublicSupportConfig(env),
            };
          throw new Error(`Unexpected module: ${name}`);
        },
        __dirname: '/synthetic/project/scripts',
        process: processMock,
        console: {
          log: (message) => logs.push(message),
          error: (message) => logs.push(message),
        },
      },
    );
    return processMock.exitCode;
  };
  assert.equal(run(), 0);
  assert.equal(written.length, 1);
  assert.equal(written[0][0], '/synthetic/project/dist/support-config.json');
  assert.deepEqual(JSON.parse(written[0][1]), config);
  env.LIMIT_FEEDBACK_URL =
    'https://api.telegram.org/bot-synthetic-never-serialize-token/sendMessage';
  assert.equal(run(), 1);
  assert.equal(
    written.length,
    1,
    'invalid input must not create another artifact',
  );
  assert.doesNotMatch(
    JSON.stringify({ written, logs }),
    /synthetic-never-serialize/,
  );
});

test('the actual Vite config keeps synthetic VITE credentials out of renderer bundles', async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-support-vite-test-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(directory, '.env'),
    'VITE_TELEGRAM_BOT_TOKEN=synthetic-renderer-secret-canary\n',
  );
  fs.writeFileSync(
    path.join(directory, 'entry.js'),
    'export const exposed = import.meta.env; export const token = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;',
  );
  const { build } = await import('vite');
  const built = await build({
    configFile: path.resolve(__dirname, '../../vite.config.ts'),
    root: directory,
    envDir: directory,
    mode: 'test',
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: path.join(directory, 'entry.js'),
        formats: ['es'],
        fileName: 'test',
      },
    },
  });
  const output = (Array.isArray(built) ? built : [built]).flatMap(
    (result) => result.output,
  );
  assert.ok(output.some((item) => item.type === 'chunk'));
  const bundle = output
    .filter((item) => item.type === 'chunk')
    .map((item) => item.code)
    .join('\n');
  assert.doesNotMatch(
    bundle,
    /synthetic-renderer-secret-canary|VITE_TELEGRAM_BOT_TOKEN/,
  );
});

test('missing or malformed build config safely disables features and packaged apps ignore development overrides', (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-support-test-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const env = {
    LIMIT_FEEDBACK_DEV_URL: 'http://localhost:8787/feedback',
    LIMIT_DONATION_URL: 'https://untrusted-runtime.example.org',
  };
  assert.deepEqual(readSupportConfig(directory, { env }), {
    feedbackUrl: '',
    donationUrl: '',
  });
  assert.deepEqual(readSupportConfig(directory, { development: true, env }), {
    feedbackUrl: env.LIMIT_FEEDBACK_DEV_URL,
    donationUrl: '',
  });
  fs.mkdirSync(path.join(directory, 'dist'));
  const file = path.join(directory, 'dist/support-config.json');
  for (const content of [
    'not JSON',
    'null',
    '[]',
    '{"feedbackUrl":123,"donationUrl":false}',
  ]) {
    fs.writeFileSync(file, content);
    assert.deepEqual(readSupportConfig(directory, { env }), {
      feedbackUrl: '',
      donationUrl: '',
    });
  }
  fs.writeFileSync(
    file,
    JSON.stringify({ ...config, TELEGRAM_BOT_TOKEN: 'synthetic-secret' }),
  );
  assert.deepEqual(readSupportConfig(directory, { env }), config);
  assert.deepEqual(readSupportConfig(directory, { development: true, env }), {
    ...config,
    feedbackUrl: env.LIMIT_FEEDBACK_DEV_URL,
  });
});

test('only the configured donation page and fixed GitHub page can be opened', async () => {
  const h = supportHarness();
  assert.equal(await h.support.openLink('github'), true);
  assert.equal(await h.support.openLink('donate'), true);
  assert.deepEqual(h.opened, [GITHUB_URL, config.donationUrl]);
  for (const kind of [
    'feedback',
    'https://unrequested.example.org',
    'file:///tmp/test',
    { kind: 'github' },
    null,
  ]) {
    await assert.rejects(
      h.support.openLink(kind),
      isCode(errors.ERROR_CODES.SUPPORT_LINK_UNAVAILABLE),
    );
  }
  assert.equal(h.opened.length, 2);
  const missing = supportHarness({ config: {} });
  assert.deepEqual(missing.support.getConfig(), {
    feedbackAvailable: false,
    donationAvailable: false,
  });
  await assert.rejects(
    missing.support.sendFeedback(feedback),
    isCode(errors.ERROR_CODES.FEEDBACK_UNAVAILABLE),
  );
  await assert.rejects(
    missing.support.openLink('donate'),
    isCode(errors.ERROR_CODES.SUPPORT_LINK_UNAVAILABLE),
  );
  assert.equal(missing.calls.length, 0);
  assert.equal(await missing.support.openLink('github'), true);
  const broken = supportHarness({
    openExternal: async () => {
      throw new Error('private system path');
    },
  });
  await assert.rejects(
    broken.support.openLink('github'),
    isCode(errors.ERROR_CODES.SUPPORT_LINK_UNAVAILABLE),
  );
});

test('success enforces cooldown, concurrent sends are rejected and a failed request can be retried', async () => {
  let resolveRequest;
  let requests = 0;
  const clock = { now: 100_000 };
  const { support } = supportHarness({
    now: () => clock.now,
    fetch: () => {
      requests += 1;
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    },
  });
  const pending = support.sendFeedback(feedback);
  await assert.rejects(
    support.sendFeedback(feedback),
    isCode(errors.ERROR_CODES.FEEDBACK_RATE_LIMITED),
  );
  clock.now += 10_000;
  await assert.rejects(
    support.sendFeedback(feedback),
    isCode(errors.ERROR_CODES.FEEDBACK_RATE_LIMITED),
  );
  assert.equal(requests, 1);
  resolveRequest({ status: 503, ok: false });
  await assert.rejects(
    pending,
    isCode(errors.ERROR_CODES.FEEDBACK_UNAVAILABLE),
  );
  const retry = support.sendFeedback(feedback);
  assert.equal(requests, 2);
  resolveRequest(success());
  assert.equal(await retry, true);
  clock.now += 29_999;
  await assert.rejects(
    support.sendFeedback(feedback),
    isCode(errors.ERROR_CODES.FEEDBACK_RATE_LIMITED),
  );
  clock.now += 1;
  const afterCooldown = support.sendFeedback(feedback);
  resolveRequest(success());
  assert.equal(await afterCooldown, true);
  assert.equal(requests, 3);
});

test('server rate limits and quick failures release pending state but retain a short retry delay', async () => {
  for (const response of [
    { status: 429, ok: false },
    { status: 500, ok: false },
  ]) {
    const clock = { now: 100_000 };
    let calls = 0;
    const { support } = supportHarness({
      now: () => clock.now,
      fetch: async () => {
        calls += 1;
        return calls === 1 ? response : success();
      },
    });
    await assert.rejects(
      support.sendFeedback(feedback),
      isCode(
        response.status === 429
          ? errors.ERROR_CODES.FEEDBACK_RATE_LIMITED
          : errors.ERROR_CODES.FEEDBACK_UNAVAILABLE,
      ),
    );
    clock.now += 4999;
    await assert.rejects(
      support.sendFeedback(feedback),
      isCode(errors.ERROR_CODES.FEEDBACK_RATE_LIMITED),
    );
    clock.now += 1;
    assert.equal(await support.sendFeedback(feedback), true);
    assert.equal(calls, 2);
  }
});

test('redirect, transport, response and JSON failures return generic errors without private response details', async () => {
  for (const fetch of [
    async (_url, options) => {
      assert.equal(options.redirect, 'error');
      throw new Error('redirect to https://private.example.org/token');
    },
    async () => {
      throw new Error('DNS private internal host');
    },
    async () => ({ status: 302, ok: false }),
    async () => ({
      status: 204,
      ok: true,
      json: async () => {
        throw new SyntaxError('private response body');
      },
    }),
    async () => ({
      status: 200,
      ok: true,
      json: async () => ({ ok: false, error: 'private response' }),
    }),
    async () => ({ status: 200, ok: true, json: async () => ({ ok: 'true' }) }),
    async () => ({ status: 200, ok: true, json: async () => null }),
  ]) {
    const { support } = supportHarness({ fetch });
    await assert.rejects(
      support.sendFeedback(feedback),
      isCode(errors.ERROR_CODES.FEEDBACK_UNAVAILABLE),
    );
  }
});

test('the configured 15-second abort signal cancels a pending request and permits a later retry', async () => {
  const aborts = [];
  const deadlines = [];
  const module = { exports: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../support.cjs'), 'utf8'),
    {
      module,
      exports: module.exports,
      require(name) {
        if (name === './errors.cjs') return errors;
        if (name === './support-config.cjs') return supportConfig;
        throw new Error(`Unexpected module: ${name}`);
      },
      AbortSignal: {
        timeout: (milliseconds) => {
          deadlines.push(milliseconds);
          const abort = new AbortController();
          aborts.push(abort);
          return abort.signal;
        },
      },
    },
  );
  let now = 100_000;
  let calls = 0;
  const support = module.exports.createSupport({
    config,
    now: () => now,
    fetch: (_url, options) => {
      calls += 1;
      if (calls > 1) return Promise.resolve(success());
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener(
          'abort',
          () => reject(options.signal.reason),
          { once: true },
        ),
      );
    },
  });
  const pending = support.sendFeedback(feedback);
  assert.deepEqual(deadlines, [15_000]);
  // Trigger the injected signal immediately; the asserted production budget is unchanged.
  now += 15_000;
  aborts[0].abort(new Error('private timeout context'));
  await assert.rejects(
    pending,
    isCode(errors.ERROR_CODES.FEEDBACK_UNAVAILABLE),
  );
  assert.equal(await support.sendFeedback(feedback), true);
  assert.equal(calls, 2);
  assert.equal(aborts[1].signal.aborted, false);
});

function mainHarness({
  packaged = true,
  signedDevelopment = false,
  fetch = async () => success(),
} = {}) {
  const handlers = new Map();
  const opened = [];
  const configReads = [];
  const electron = {
    app: {
      isPackaged: packaged,
      getAppPath: () => '/synthetic/app',
      getPath: () => '/tmp',
      setPath() {},
      requestSingleInstanceLock: () => true,
      on() {},
      whenReady: () => new Promise(() => {}),
    },
    ipcMain: {
      handle: (channel, action) => handlers.set(channel, action),
      on() {},
    },
    shell: { openExternal: async (url) => opened.push(url) },
  };
  const context = vm.createContext({
    require(name) {
      if (name === 'electron') return electron;
      if (name === './errors.cjs') return errors;
      if (name === '../package.json')
        return { limitSignedDevelopment: signedDevelopment };
      if (name === './support.cjs')
        return {
          createSupport: (options) => createSupport({ ...options, fetch }),
        };
      if (name === './support-config.cjs')
        return {
          readSupportConfig: (...args) => {
            configReads.push(args);
            return config;
          },
        };
      if (name.startsWith('node:')) return require(name);
      return {};
    },
    process: { platform: 'darwin', env: {}, on() {} },
    console,
    __dirname: path.resolve(__dirname, '..'),
  });
  const setup = vm.runInContext(
    `${fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8')}
    ;(window) => { mainWindow = window; registerIpc(); return (nextWindow) => { mainWindow = nextWindow; }; }`,
    context,
  );
  const url = 'file:///app/index.html';
  const frame = { url };
  const contents = { mainFrame: frame, getURL: () => url };
  const window = { webContents: contents, isDestroyed: () => false };
  const setWindow = setup(window);
  return {
    handlers,
    opened,
    configReads,
    setWindow,
    window,
    event: { sender: contents, senderFrame: frame },
  };
}

function preloadHarness(invoke) {
  let api;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8'),
    {
      require(name) {
        assert.equal(name, 'electron');
        return {
          contextBridge: {
            exposeInMainWorld: (name, value) => {
              assert.equal(name, 'limitApi');
              api = value;
            },
          },
          ipcRenderer: { invoke, on() {}, removeListener() {}, send() {} },
        };
      },
    },
  );
  return api;
}

test('all support IPC channels reject untrusted renderers, child frames and stale frame URLs before side effects', () => {
  let calls = 0;
  const h = mainHarness({
    fetch: async () => {
      calls += 1;
      return success();
    },
  });
  assert.deepEqual(
    [...h.handlers.keys()].filter((name) => name.startsWith('support:')).sort(),
    ['support:config', 'support:feedback', 'support:open-link'],
  );
  for (const [channel, input] of [
    ['support:config', undefined],
    ['support:feedback', feedback],
    ['support:open-link', 'github'],
  ]) {
    const handler = h.handlers.get(channel);
    for (const event of [
      { sender: {}, senderFrame: {} },
      { ...h.event, senderFrame: undefined },
      { ...h.event, senderFrame: { url: h.event.senderFrame.url } },
      {
        sender: { mainFrame: h.event.senderFrame },
        senderFrame: h.event.senderFrame,
      },
    ])
      assert.throws(() => handler(event, input), /IPC sender/);
    h.event.senderFrame.url = 'https://untrusted.example.org';
    assert.throws(() => handler(h.event, input), /IPC sender/);
    h.event.senderFrame.url = 'file:///app/index.html';
    h.setWindow(null);
    assert.throws(() => handler(h.event, input), /IPC sender/);
    h.setWindow(h.window);
  }
  assert.equal(calls, 0);
  assert.equal(h.opened.length, 0);
});

test('preload routes narrow arguments through trusted main and returns only public config and safe error codes', async () => {
  const calls = [];
  const h = mainHarness({
    fetch: async (...args) => {
      calls.push(args);
      return success();
    },
  });
  const invoked = [];
  const api = preloadHarness((channel, ...args) => {
    invoked.push([channel, ...args]);
    return h.handlers.get(channel)(h.event, ...args);
  });
  assert.deepEqual(plain(await api.getSupportConfig('ignored-secret')), {
    feedbackAvailable: true,
    donationAvailable: true,
  });
  assert.equal(
    await api.sendFeedback(
      { ...feedback, private: 'never-send' },
      'ignored-secret',
    ),
    true,
  );
  assert.deepEqual(JSON.parse(calls[0][1].body), feedback);
  assert.equal(
    await api.openSupportLink('donate', 'https://unrequested.example.org'),
    true,
  );
  assert.deepEqual(h.opened, [config.donationUrl]);
  assert.deepEqual(
    invoked.map((call) => [call[0], call.length - 1]),
    [
      ['support:config', 0],
      ['support:feedback', 1],
      ['support:open-link', 1],
    ],
  );
  await assert.rejects(
    api.sendFeedback({ ...feedback, source: 'secret-source' }),
    { message: errors.ERROR_CODES.FEEDBACK_INVALID },
  );
  await assert.rejects(api.openSupportLink('https://unrequested.example.org'), {
    message: errors.ERROR_CODES.SUPPORT_LINK_UNAVAILABLE,
  });
  const broken = mainHarness({
    fetch: async () => {
      throw new Error('synthetic-private-server-response');
    },
  });
  assert.deepEqual(
    plain(
      await broken.handlers.get('support:feedback')(broken.event, feedback),
    ),
    { ok: false, error: { code: errors.ERROR_CODES.FEEDBACK_UNAVAILABLE } },
  );
});

test('main permits loopback development override only for unpackaged or explicitly signed development builds', () => {
  for (const [options, expected] of [
    [{ packaged: true }, false],
    [{ packaged: false }, true],
    [{ packaged: true, signedDevelopment: true }, true],
  ]) {
    const h = mainHarness(options);
    assert.deepEqual(plain(h.configReads), [
      ['/synthetic/app', { development: expected }],
    ]);
  }
});
