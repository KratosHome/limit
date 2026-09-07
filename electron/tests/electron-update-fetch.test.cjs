const assert = require('node:assert/strict');
const { EventEmitter, getEventListeners } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { createElectronUpdateFetch } = require('../electron-update-fetch.cjs');

const URL =
  'https://github.com/KratosHome/limit/releases/download/v0.2.0/Limit-0.2.0-mac-universal.dmg';

function harness({ cancelledError = false } = {}) {
  const request = new EventEmitter();
  let options;
  let requests = 0;
  let aborts = 0;
  let ended = 0;
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    request.emit('close');
  }
  request.end = () => {
    ended += 1;
  };
  request.abort = () => {
    if (closed) return;
    aborts += 1;
    request.emit('abort');
    if (cancelledError)
      request.emit('error', new Error('Redirect was cancelled'));
    close();
  };
  request.followRedirect = () => {
    throw new Error('Redirect must be validated before another request');
  };
  const fetch = createElectronUpdateFetch({
    request(value) {
      options = value;
      requests += 1;
      return request;
    },
  });
  function respond(statusCode = 200, headers = {}) {
    const incoming = new PassThrough();
    incoming.statusCode = statusCode;
    incoming.headers = headers;
    incoming.once('close', () => {
      if (incoming.readableEnded) close();
    });
    request.emit('response', incoming);
    return incoming;
  }
  return {
    fetch,
    request,
    respond,
    get options() {
      return options;
    },
    get requests() {
      return requests;
    },
    get aborts() {
      return aborts;
    },
    get ended() {
      return ended;
    },
  };
}

test('exposes a manual redirect before Electron emits its cancellation error', async () => {
  const fixture = harness({ cancelledError: true });
  const controller = new AbortController();
  const pending = fixture.fetch(URL, { signal: controller.signal });
  const location =
    'https://release-assets.githubusercontent.com/asset?signature=abc';
  fixture.request.emit('redirect', 302, 'GET', location, {});
  const response = await pending;
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), location);
  assert.equal(response.body, null);
  assert.equal(response.redirected, false);
  assert.equal(fixture.requests, 1);
  assert.equal(fixture.aborts, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('streams the response and converts headers without following redirects or sending credentials', async () => {
  const fixture = harness();
  const controller = new AbortController();
  const pending = fixture.fetch(URL, { signal: controller.signal });
  assert.deepEqual(fixture.options, {
    url: URL,
    method: 'GET',
    redirect: 'manual',
    credentials: 'omit',
    cache: 'no-store',
    bypassCustomProtocolHandlers: true,
  });
  assert.equal(fixture.ended, 1);
  const incoming = fixture.respond(200, {
    'content-length': ['11'],
    'content-type': 'application/octet-stream',
    'x-test': ['one', 'two'],
  });
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.redirected, false);
  assert.equal(response.headers.get('content-length'), '11');
  assert.equal(
    response.headers.get('content-type'),
    'application/octet-stream',
  );
  assert.equal(response.headers.get('x-test'), 'one, two');
  const body = new Response(response.body).text();
  incoming.write('hello ');
  incoming.end('world');
  assert.equal(await body, 'hello world');
  assert.equal(fixture.aborts, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('an already aborted signal prevents creating a request', async () => {
  const fixture = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fixture.fetch(URL, { signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(fixture.requests, 0);
});

test('an early writable close still exposes a later HTTP redirect', async () => {
  const fixture = harness({ cancelledError: true });
  const controller = new AbortController();
  const pending = fixture.fetch(URL, { signal: controller.signal });
  fixture.request.emit('finish');
  fixture.request.emit('close');
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  const location = 'https://release-assets.githubusercontent.com/asset';
  fixture.request.emit('redirect', 302, 'GET', location, {});
  const response = await pending;
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), location);
  assert.equal(fixture.aborts, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('an early writable close retains cancellation until the HTTP body finishes', async () => {
  const fixture = harness();
  const controller = new AbortController();
  const pending = fixture.fetch(URL, { signal: controller.signal });
  fixture.request.emit('finish');
  fixture.request.emit('close');
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  const incoming = fixture.respond();
  const response = await pending;
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  const body = new Response(response.body).text();
  incoming.end('installer');
  assert.equal(await body, 'installer');
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('aborting before headers rejects the fetch and releases the signal listener', async () => {
  const fixture = harness();
  const controller = new AbortController();
  const pending = fixture.fetch(URL, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(fixture.aborts, 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test(
  'aborting after headers destroys the response and rejects a pending body read',
  { timeout: 1000 },
  async () => {
    const fixture = harness();
    const controller = new AbortController();
    const pending = fixture.fetch(URL, { signal: controller.signal });
    const incoming = fixture.respond();
    const response = await pending;
    const body = new Response(response.body).arrayBuffer();
    controller.abort();
    await assert.rejects(body, { name: 'AbortError' });
    assert.equal(incoming.destroyed, true);
    assert.equal(fixture.aborts, 1);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  },
);

test('request failures before headers reject the fetch', async () => {
  const fixture = harness();
  const pending = fixture.fetch(URL);
  const error = new Error('Connection refused');
  fixture.request.emit('error', error);
  await assert.rejects(pending, error);
});

test(
  'request failures after headers reject the body instead of leaving a transfer pending',
  { timeout: 1000 },
  async () => {
    const fixture = harness();
    const pending = fixture.fetch(URL);
    const incoming = fixture.respond();
    const response = await pending;
    const body = new Response(response.body).arrayBuffer();
    incoming.write('partial');
    const error = new Error('Connection reset');
    fixture.request.emit('error', error);
    await assert.rejects(body, error);
    assert.equal(incoming.destroyed, true);
  },
);

test(
  'an aborted Electron response rejects the body instead of leaving a transfer pending',
  { timeout: 1000 },
  async () => {
    const fixture = harness();
    const pending = fixture.fetch(URL);
    const incoming = fixture.respond();
    const response = await pending;
    const body = new Response(response.body).arrayBuffer();
    incoming.emit('aborted');
    await assert.rejects(body, /Update response was aborted/);
    assert.equal(incoming.destroyed, true);
  },
);

test(
  'cancelling a body closes the underlying request',
  { timeout: 1000 },
  async () => {
    const fixture = harness();
    const pending = fixture.fetch(URL);
    const incoming = fixture.respond(404);
    const response = await pending;
    const closed = new Promise((resolve) =>
      fixture.request.once('close', resolve),
    );
    await response.body.cancel();
    await closed;
    assert.equal(incoming.destroyed, true);
    assert.equal(fixture.aborts, 1);
  },
);
