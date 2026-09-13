const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const {
  createFeedbackRelay,
  configurationFromEnvironment,
} = require('../../services/feedback/server.cjs');

const botToken = '12345:FAKE_TOKEN_USED_ONLY_FOR_TESTS_1234567890';
const chatId = '-123456789';
const feedback = { message: 'Please add a calendar view.', source: 'settings' };
const success = () =>
  new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));

function fixture(t, options = {}) {
  const deliveries = [];
  const relay = createFeedbackRelay({
    botToken,
    chatId,
    fetch: async (...args) => {
      deliveries.push(args);
      return success();
    },
    ...options,
  });
  t.after(() => relay.close({ graceMs: 5 }));
  return { ...relay, deliveries };
}

function request(
  relay,
  value = feedback,
  {
    ip = '203.0.113.1',
    method = 'POST',
    url = '/feedback',
    headers = {},
    raw,
    leaveOpen = false,
  } = {},
) {
  const incoming = new PassThrough();
  incoming.socket = { remoteAddress: ip };
  incoming.method = method;
  incoming.url = url;
  incoming.headers = { 'content-type': 'application/json', ...headers };
  const response = new EventEmitter();
  response.writeHead = (status, responseHeaders) => {
    response.status = status;
    response.headers = responseHeaders;
  };
  response.end = (body) => {
    response.body = JSON.parse(body);
    response.writableEnded = true;
  };
  const finished = relay.handler(incoming, response);
  if (!leaveOpen) incoming.end(raw ?? JSON.stringify(value));
  return { incoming, response, finished };
}

async function send(relay, value, options) {
  const operation = request(relay, value, options);
  await operation.finished;
  return operation.response;
}

test('feedback uses only the server recipient and sends trimmed plain text without formatting or link previews', async (t) => {
  const relay = fixture(t);
  const result = await send(relay, {
    message: '  <b>Нова ідея</b> *literal text*  ',
    contact: '  @example  ',
    source: 'health',
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(relay.deliveries.length, 1);
  const [url, options] = relay.deliveries[0];
  assert.equal(url, `https://api.telegram.org/bot${botToken}/sendMessage`);
  assert.equal(options.redirect, 'error');
  assert.equal(options.method, 'POST');
  assert.deepEqual(JSON.parse(options.body), {
    chat_id: chatId,
    text: 'Limit feedback\nSource: Health\nContact: @example\n\n<b>Нова ідея</b> *literal text*',
    link_preview_options: { is_disabled: true },
  });
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
});

test('validation accepts exact trimmed limits and rejects malformed, oversized or recipient-changing payloads before delivery', async (t) => {
  const relay = fixture(t, { perIpLimit: 100, globalLimit: 100 });
  for (const message of ['1234567890', 'x'.repeat(3000)]) {
    assert.equal(
      (
        await send(relay, {
          message: ` ${message} `,
          source: 'settings',
          contact: 'a'.repeat(200),
        })
      ).status,
      200,
    );
  }
  for (const value of [
    null,
    [],
    {},
    { ...feedback, message: 123 },
    { ...feedback, message: '  short  ' },
    { ...feedback, message: 'x'.repeat(3001) },
    { ...feedback, contact: null },
    { ...feedback, contact: 'a'.repeat(201) },
    { ...feedback, source: 'other' },
    { ...feedback, message: 'Invalid\u0000message' },
    { ...feedback, chat_id: '98765' },
    { ...feedback, botToken: 'another-token' },
  ]) {
    const result = await send(relay, value);
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { ok: false, error: 'invalid' });
  }
  assert.equal(relay.deliveries.length, 2);
});

test('route, method, Origin, content type, compression, JSON and UTF-8 are checked before Telegram', async (t) => {
  const relay = fixture(t, { perIpLimit: 100 });
  for (const [options, status] of [
    [{ url: '/feedback?chat_id=123' }, 404],
    [{ method: 'GET' }, 405],
    [{ method: 'OPTIONS' }, 405],
    [{ headers: { origin: 'https://example.com' } }, 403],
    [{ headers: { origin: 'null' } }, 403],
    [{ headers: { origin: '' } }, 403],
    [{ headers: { 'content-type': 'text/plain' } }, 415],
    [{ headers: { 'content-type': 'application/json; charset=latin1' } }, 415],
    [{ headers: { 'content-encoding': 'gzip' } }, 415],
    [{ raw: '{invalid json' }, 400],
    [{ raw: Buffer.from([0xc3, 0x28]) }, 400],
  ]) {
    const result = await send(relay, feedback, options);
    assert.equal(result.status, status);
    assert.deepEqual(result.body, { ok: false, error: 'invalid' });
  }
  assert.equal(relay.deliveries.length, 0);
});

test('request size is enforced both with and without Content-Length', async (t) => {
  const relay = fixture(t);
  const declared = await send(relay, feedback, {
    headers: { 'content-length': '999999' },
  });
  assert.equal(declared.status, 413);
  const streamed = await send(relay, feedback, {
    raw: Buffer.alloc(24 * 1024 + 1, 32),
  });
  assert.equal(streamed.status, 413);
  assert.equal(relay.deliveries.length, 0);
});

test('per-IP and global limits expire and cannot be bypassed with untrusted forwarding headers', async (t) => {
  let time = 0;
  const relay = fixture(t, {
    now: () => time,
    perIpLimit: 1,
    globalLimit: 2,
    rateWindowMs: 1000,
  });
  assert.equal((await send(relay)).status, 200);
  assert.equal(
    (
      await send(relay, feedback, {
        headers: {
          'x-real-ip': '198.51.100.1',
          'x-forwarded-for': '198.51.100.2',
        },
      })
    ).status,
    429,
  );
  assert.equal(
    (await send(relay, feedback, { ip: '::ffff:203.0.113.1' })).status,
    429,
  );
  assert.equal(
    (await send(relay, feedback, { ip: '203.0.113.2' })).status,
    200,
  );
  const global = await send(relay, feedback, { ip: '203.0.113.3' });
  assert.deepEqual(global.body, { ok: false, error: 'rate_limited' });
  assert.equal(global.status, 429);
  time = 1000;
  assert.equal((await send(relay)).status, 200);
});

test('the bounded IP map rejects new entries instead of evicting active rate limits', async (t) => {
  let time = 0;
  const relay = fixture(t, {
    now: () => time,
    maxIps: 2,
    perIpLimit: 1,
    globalLimit: 100,
    rateWindowMs: 1000,
  });
  assert.equal(
    (await send(relay, feedback, { ip: '203.0.113.1' })).status,
    200,
  );
  assert.equal(
    (await send(relay, feedback, { ip: '203.0.113.2' })).status,
    200,
  );
  assert.equal(
    (await send(relay, feedback, { ip: '203.0.113.3' })).status,
    429,
  );
  assert.equal(
    (await send(relay, feedback, { ip: '203.0.113.1' })).status,
    429,
  );
  time = 1000;
  assert.equal(
    (await send(relay, feedback, { ip: '203.0.113.3' })).status,
    200,
  );
});

test('explicit loopback proxy trust accepts only a single valid X-Real-IP from a loopback peer', async (t) => {
  const relay = fixture(t, { trustProxy: 'loopback', perIpLimit: 1 });
  assert.equal(
    (
      await send(relay, feedback, {
        ip: '127.0.0.1',
        headers: { 'x-real-ip': '203.0.113.1' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send(relay, feedback, {
        ip: '::1',
        headers: { 'x-real-ip': '203.0.113.2' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send(relay, feedback, {
        ip: '::ffff:127.0.0.1',
        headers: { 'x-real-ip': '203.0.113.1' },
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await send(relay, feedback, {
        ip: '127.0.0.1',
        headers: { 'x-real-ip': '203.0.113.3, 203.0.113.4' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send(relay, feedback, {
        ip: '198.51.100.5',
        headers: { 'x-real-ip': '203.0.113.6' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await send(relay, feedback, {
        ip: '198.51.100.5',
        headers: { 'x-real-ip': '203.0.113.7' },
      })
    ).status,
    429,
  );
});

test('Telegram failures and exceptions expose no credentials, destination, message or upstream response', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (...values) => logs.push(values));
  const secret = `${botToken} ${chatId} ${feedback.message}`;
  for (const fetch of [
    async () => {
      throw new Error(`Failed URL https://api.telegram.org/bot${secret}`);
    },
    async () =>
      new Response(JSON.stringify({ ok: false, description: secret }), {
        status: 429,
      }),
    async () => new Response(JSON.stringify({ ok: true }), { status: 500 }),
    async () => new Response(secret),
    async () => new Response('{}'),
    async () => new Response(' '.repeat(64 * 1024 + 1)),
    async () =>
      new Response('{}', { headers: { 'content-length': '9999999' } }),
  ]) {
    const relay = fixture(t, { fetch });
    const result = await send(relay);
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { ok: false, error: 'unavailable' });
  }
  assert.deepEqual(logs, []);
});

test('a Telegram timeout aborts the request even when an injected fetch ignores cancellation', async (t) => {
  let signal;
  const relay = fixture(t, {
    timeoutMs: 15,
    fetch: (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  const result = await send(relay);
  assert.equal(result.status, 503);
  assert.equal(signal.aborted, true);
});

test('slow incoming bodies time out without being delivered', async (t) => {
  const relay = fixture(t, { timeoutMs: 15 });
  const operation = request(relay, feedback, { leaveOpen: true });
  await operation.finished;
  operation.incoming.destroy();
  assert.equal(operation.response.status, 503);
  assert.equal(relay.deliveries.length, 0);
});

test('an aborted upload and its following stream error cannot send feedback or crash the relay', async (t) => {
  const relay = fixture(t);
  const operation = request(relay, feedback, { leaveOpen: true });
  operation.incoming.emit('aborted');
  assert.doesNotThrow(() =>
    operation.incoming.emit('error', new Error('connection reset')),
  );
  await operation.finished;
  operation.incoming.destroy();
  assert.equal(operation.response.status, 503);
  assert.equal(relay.deliveries.length, 0);
});

test('concurrent delivery is bounded and successful completion frees the slot', async (t) => {
  let release;
  const started = new Promise((resolve) => {
    release = resolve;
  });
  let complete;
  const upstream = new Promise((resolve) => {
    complete = resolve;
  });
  const relay = fixture(t, {
    maxConcurrent: 1,
    fetch: () => {
      release();
      return upstream;
    },
  });
  const first = request(relay);
  await started;
  assert.equal(
    (await send(relay, feedback, { ip: '203.0.113.2' })).status,
    503,
  );
  complete(success());
  await first.finished;
  assert.equal(first.response.status, 200);
  // A fresh Response is required because the first upstream body was consumed.
  const second = request(relay, feedback, {
    ip: '203.0.113.2',
    raw: 'invalid',
  });
  await second.finished;
  assert.equal(second.response.status, 400);
});

test('graceful stop refuses new feedback, allows completed work, and bounds hung delivery shutdown', async (t) => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let signal;
  const relay = fixture(t, {
    fetch: (_url, options) => {
      signal = options.signal;
      started();
      return new Promise(() => {});
    },
  });
  const first = request(relay);
  await ready;
  const stopping = relay.close({ graceMs: 5 });
  assert.equal((await send(relay)).status, 503);
  await stopping;
  await first.finished;
  assert.equal(signal.aborted, true);
  assert.equal(first.response.status, 503);
});

test('graceful stop lets an already accepted Telegram delivery finish within the grace period', async (t) => {
  let ready;
  const started = new Promise((resolve) => {
    ready = resolve;
  });
  let finish;
  const delivery = new Promise((resolve) => {
    finish = resolve;
  });
  const relay = fixture(t, {
    fetch: () => {
      ready();
      return delivery;
    },
  });
  const first = request(relay);
  await started;
  const stopping = relay.close({ graceMs: 100 });
  finish(success());
  await stopping;
  assert.equal(first.response.status, 200);
});

test('server configuration uses server-only env keys, safe defaults, and generic failures', () => {
  assert.deepEqual(
    configurationFromEnvironment({
      TELEGRAM_BOT_TOKEN: botToken,
      TELEGRAM_BOT_CHAT_ID: chatId,
    }),
    {
      host: '127.0.0.1',
      port: 8787,
      botToken,
      chatId,
      trustProxy: 'none',
    },
  );
  for (const extra of [
    { FEEDBACK_HOST: 'example.com' },
    { FEEDBACK_PORT: '-1' },
    { FEEDBACK_PORT: '65536' },
  ]) {
    assert.throws(
      () => configurationFromEnvironment(extra),
      /configuration is invalid/,
    );
  }
  for (const extra of [
    { botToken: 'SECRET_INVALID_TOKEN' },
    { chatId: 'SECRET_INVALID_DESTINATION' },
    { trustProxy: true },
  ]) {
    assert.throws(
      () => createFeedbackRelay({ botToken, chatId, ...extra }),
      (error) => {
        assert.equal(error.message, 'Feedback relay configuration is invalid');
        return true;
      },
    );
  }
});
