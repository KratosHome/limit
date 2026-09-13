const http = require('node:http');
const { isIP } = require('node:net');
const { TextDecoder } = require('node:util');

const MAX_BODY_BYTES = 24 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const unavailable = () => new Error('Feedback delivery unavailable');

class InvalidRequest extends Error {
  constructor(status = 400) {
    super('Invalid feedback request');
    this.status = status;
  }
}

function normalizeIp(value) {
  if (typeof value !== 'string' || !isIP(value)) return null;
  return value.startsWith('::ffff:') && isIP(value.slice(7)) === 4
    ? value.slice(7)
    : value.toLowerCase();
}

function clientIp(request, trustProxy) {
  const peer = normalizeIp(request.socket.remoteAddress);
  if (!peer) throw new InvalidRequest();
  if (
    trustProxy === 'loopback' &&
    (peer === '127.0.0.1' || peer === '::1') &&
    request.headers['x-real-ip'] !== undefined
  ) {
    const forwarded = normalizeIp(request.headers['x-real-ip']);
    if (!forwarded) throw new InvalidRequest();
    return forwarded;
  }
  return peer;
}

function validateFeedback(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !['message', 'contact', 'source'].includes(key),
    ) ||
    typeof value.message !== 'string' ||
    !['health', 'settings'].includes(value.source) ||
    (value.contact !== undefined && typeof value.contact !== 'string')
  )
    throw new InvalidRequest();
  const message = value.message.trim();
  const contact = value.contact?.trim() ?? '';
  if (
    message.length < 10 ||
    message.length > 3000 ||
    contact.length > 200 ||
    [...(message + contact)].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    throw new InvalidRequest();
  return { message, contact, source: value.source };
}

function readBody(request, signal) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    const cleanup = () => {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onFailure);
      request.off('aborted', onFailure);
      signal.removeEventListener('abort', onFailure);
    };
    const fail = (error) => {
      cleanup();
      request.pause();
      reject(error);
    };
    const onFailure = () => fail(unavailable());
    const onData = (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) return fail(new InvalidRequest(413));
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(
          Buffer.concat(chunks),
        );
        resolve(validateFeedback(JSON.parse(text)));
      } catch {
        reject(new InvalidRequest());
      }
    };
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onFailure);
    request.once('aborted', onFailure);
    signal.addEventListener('abort', onFailure, { once: true });
    if (signal.aborted) onFailure();
  });
}

function abortable(operation, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(unavailable());
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(operation)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    if (signal.aborted) onAbort();
  });
}

async function readTelegramResponse(response, signal) {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
    throw unavailable();
  if (!response.body) throw unavailable();
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE_BYTES) throw unavailable();
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } finally {
    // A failed or oversized upstream body must not leave a connection streaming.
    void reader.cancel().catch(() => {});
  }
}

function sendJson(response, status, error) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Connection: 'close',
    ...(status === 429 ? { 'Retry-After': '3600' } : {}),
  });
  response.end(JSON.stringify(error ? { ok: false, error } : { ok: true }));
}

function createFeedbackRelay({
  botToken,
  chatId,
  trustProxy = 'none',
  fetch: fetchImpl = globalThis.fetch,
  now = () => performance.now(),
  timeoutMs = 10_000,
  rateWindowMs = 60 * 60 * 1000,
  perIpLimit = 5,
  globalLimit = 60,
  maxIps = 2048,
  maxConcurrent = 4,
} = {}) {
  if (
    typeof botToken !== 'string' ||
    !/^\d{1,20}:[A-Za-z0-9_-]{20,100}$/.test(botToken) ||
    typeof chatId !== 'string' ||
    !/^-?[1-9]\d{0,19}$/.test(chatId) ||
    !['none', 'loopback'].includes(trustProxy) ||
    typeof fetchImpl !== 'function' ||
    [
      timeoutMs,
      rateWindowMs,
      perIpLimit,
      globalLimit,
      maxIps,
      maxConcurrent,
    ].some((value) => !Number.isSafeInteger(value) || value < 1)
  )
    throw new Error('Feedback relay configuration is invalid');

  const ipWindows = new Map();
  let globalWindow = { started: now(), count: 0 };
  let active = 0;
  let stopping = false;
  let closing;
  const controllers = new Set();
  const requests = new Set();

  function takeQuota(ip) {
    const time = now();
    if (time - globalWindow.started >= rateWindowMs)
      globalWindow = { started: time, count: 0 };
    for (const [key, entry] of ipWindows) {
      if (time - entry.started >= rateWindowMs) ipWindows.delete(key);
    }
    const previous = ipWindows.get(ip);
    if (
      globalWindow.count >= globalLimit ||
      (previous?.count ?? 0) >= perIpLimit ||
      (!previous && ipWindows.size >= maxIps)
    )
      return false;
    ipWindows.set(ip, {
      started: previous?.started ?? time,
      count: (previous?.count ?? 0) + 1,
    });
    globalWindow.count += 1;
    return true;
  }

  async function handle(request, response) {
    if (stopping) return sendJson(response, 503, 'unavailable');
    if (request.url !== '/feedback') return sendJson(response, 404, 'invalid');
    if (request.method !== 'POST') return sendJson(response, 405, 'invalid');
    if (request.headers.origin !== undefined)
      return sendJson(response, 403, 'invalid');
    if (
      typeof request.headers['content-type'] !== 'string' ||
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        request.headers['content-type'],
      ) ||
      (request.headers['content-encoding'] !== undefined &&
        request.headers['content-encoding'] !== 'identity')
    )
      return sendJson(response, 415, 'invalid');
    const length = request.headers['content-length'];
    if (
      length !== undefined &&
      (typeof length !== 'string' ||
        !/^\d+$/.test(length) ||
        Number(length) > MAX_BODY_BYTES)
    )
      return sendJson(response, 413, 'invalid');
    let ip;
    try {
      ip = clientIp(request, trustProxy);
    } catch {
      return sendJson(response, 400, 'invalid');
    }
    if (active >= maxConcurrent) return sendJson(response, 503, 'unavailable');
    if (!takeQuota(ip)) return sendJson(response, 429, 'rate_limited');

    active += 1;
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const disconnected = () => {
      if (!response.writableEnded) controller.abort();
    };
    response.once('close', disconnected);
    try {
      const feedback = await readBody(request, controller.signal);
      if (controller.signal.aborted) throw unavailable();
      const text = [
        'Limit feedback',
        `Source: ${feedback.source === 'health' ? 'Health' : 'Settings'}`,
        ...(feedback.contact ? [`Contact: ${feedback.contact}`] : []),
        '',
        feedback.message,
      ].join('\n');
      const telegram = await abortable(
        fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            chat_id: chatId,
            text,
            link_preview_options: { is_disabled: true },
          }),
        }),
        controller.signal,
      );
      const result = await readTelegramResponse(telegram, controller.signal);
      if (!telegram.ok || result?.ok !== true) throw unavailable();
      sendJson(response, 200);
    } catch (error) {
      sendJson(
        response,
        error instanceof InvalidRequest ? error.status : 503,
        error instanceof InvalidRequest ? 'invalid' : 'unavailable',
      );
    } finally {
      clearTimeout(timer);
      response.off('close', disconnected);
      controller.abort();
      controllers.delete(controller);
      active -= 1;
    }
  }

  function handler(request, response) {
    // An aborted IncomingMessage can emit `error` after `aborted`, including
    // after the body listeners were cleaned up. Do not let that crash the relay.
    request.on('error', () => {});
    const operation = handle(request, response).catch(() => {
      try {
        sendJson(response, 503, 'unavailable');
      } catch {
        // The client may have disconnected while the response was being sent.
      }
    });
    requests.add(operation);
    void operation.finally(() => requests.delete(operation));
    return operation;
  }
  const server = http.createServer(
    {
      maxHeaderSize: 8192,
      headersTimeout: 10_000,
      requestTimeout: 15_000,
      connectionsCheckingInterval: 1000,
    },
    handler,
  );
  server.keepAliveTimeout = 1000;
  server.maxConnections = 128;
  server.maxRequestsPerSocket = 10;

  function close({ graceMs = 10_000 } = {}) {
    if (closing) return closing;
    stopping = true;
    closing = (async () => {
      const connectionsClosed = new Promise((resolve) =>
        server.close(() => resolve()),
      );
      server.closeIdleConnections();
      const deadline = setTimeout(() => {
        for (const controller of controllers) controller.abort();
        server.closeAllConnections();
      }, graceMs);
      try {
        await Promise.all([
          connectionsClosed,
          Promise.allSettled([...requests]),
        ]);
      } finally {
        clearTimeout(deadline);
      }
    })();
    return closing;
  }

  return { server, handler, close };
}

function configurationFromEnvironment(env = process.env) {
  const host = env.FEEDBACK_HOST || '127.0.0.1';
  const rawPort = env.FEEDBACK_PORT || '8787';
  if (
    !isIP(host) ||
    !/^\d+$/.test(rawPort) ||
    Number(rawPort) < 1 ||
    Number(rawPort) > 65535
  )
    throw new Error('Feedback relay listening configuration is invalid');
  return {
    host,
    port: Number(rawPort),
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_BOT_CHAT_ID,
    trustProxy: env.FEEDBACK_TRUST_PROXY || 'none',
  };
}

if (require.main === module) {
  try {
    const config = configurationFromEnvironment();
    const relay = createFeedbackRelay(config);
    relay.server.once('error', () => {
      console.error(
        'Feedback relay could not start. Check the listening configuration.',
      );
      process.exitCode = 1;
    });
    relay.server.listen(config.port, config.host, () => {
      console.log(
        'Feedback relay is listening. Public HTTPS deployment is configured separately.',
      );
    });
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => {
        void relay.close().then(() => {
          process.exitCode = 0;
        });
      });
  } catch {
    console.error(
      'Feedback relay could not start. Check the server environment configuration.',
    );
    process.exitCode = 1;
  }
}

module.exports = { createFeedbackRelay, configurationFromEnvironment };
