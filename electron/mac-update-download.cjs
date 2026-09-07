const { createHash, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const ASSET_HOSTS = new Set([
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_SIZE = 2 * 1024 ** 3;

function selectUpdate(info) {
  const version = info?.version;
  if (
    typeof version !== 'string' ||
    !/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(version) ||
    version.split('.').some((part) => Number(part) > 65535)
  )
    throw new Error('Invalid Mac update version');
  if (info.tag !== undefined && info.tag !== `v${version}`)
    throw new Error('Mac update tag does not match its version');
  const filename = `Limit-${version}-mac-universal.dmg`;
  const url = `https://github.com/KratosHome/limit/releases/download/v${version}/${filename}`;
  const matches = Array.isArray(info.files)
    ? info.files.filter((file) => file?.url === filename || file?.url === url)
    : [];
  if (matches.length !== 1)
    throw new Error('Expected Mac update asset is missing or ambiguous');
  const { sha512, size } = matches[0];
  const checksum =
    typeof sha512 === 'string' && sha512.length === 88
      ? Buffer.from(sha512, 'base64')
      : null;
  if (
    !checksum ||
    checksum.length !== 64 ||
    checksum.toString('base64') !== sha512
  )
    throw new Error('Invalid Mac update checksum');
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_SIZE)
    throw new Error('Invalid Mac update size');
  return { filename, url, checksum, size };
}

async function fetchAsset(url, fetch, signal) {
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    signal.throwIfAborted();
    const target = new URL(url);
    if (
      target.protocol !== 'https:' ||
      !ASSET_HOSTS.has(target.hostname) ||
      target.username ||
      target.password ||
      target.port
    )
      throw new Error('Untrusted Mac update redirect');
    const response = await fetch(target.href, {
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      bypassCustomProtocolHandlers: true,
      signal,
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 5)
        throw new Error('Invalid Mac update redirect');
      url = new URL(location, target).href;
      continue;
    }
    if (response.status !== 200 || !response.body || response.redirected) {
      await response.body?.cancel();
      throw new Error(`Mac update request failed (${response.status})`);
    }
    return response;
  }
}

async function downloadMacUpdate(
  info,
  { directory, fetch, onProgress = () => {}, signal, timeoutMs = 15 * 60_000 },
) {
  const asset = selectUpdate(info);
  if (typeof directory !== 'string' || !path.isAbsolute(directory))
    throw new Error('Mac update download directory must be absolute');
  if (typeof fetch !== 'function')
    throw new Error('Mac update fetch is unavailable');
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > 15 * 60_000
  )
    throw new Error('Invalid Mac update timeout');
  const timeout = new AbortController();
  const downloadSignal = signal
    ? AbortSignal.any([signal, timeout.signal])
    : timeout.signal;
  const timer = setTimeout(
    () => timeout.abort(new Error('Mac update download timed out')),
    timeoutMs,
  );
  timer.unref?.();
  let temporaryDirectory;
  let lastProgress = -1;
  function reportProgress(value) {
    if (value !== lastProgress) {
      lastProgress = value;
      onProgress(value);
    }
  }
  try {
    downloadSignal.throwIfAborted();
    temporaryDirectory = await fs.promises.mkdtemp(
      path.join(directory, 'Limit-Update-'),
    );
    const filePath = path.join(temporaryDirectory, asset.filename);
    const partialPath = `${filePath}.partial`;
    reportProgress(0);
    const response = await fetchAsset(asset.url, fetch, downloadSignal);
    const hash = createHash('sha512');
    let received = 0;
    await pipeline(
      Readable.fromWeb(response.body),
      async function* verifyChunks(source) {
        for await (const chunk of source) {
          received += chunk.length;
          if (received > asset.size)
            throw new Error('Mac update exceeds expected size');
          hash.update(chunk);
          yield chunk;
          reportProgress(
            Math.min(99, Math.floor((received * 100) / asset.size)),
          );
        }
      },
      fs.createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }),
      { signal: downloadSignal },
    );
    downloadSignal.throwIfAborted();
    if (received !== asset.size)
      throw new Error('Mac update download is incomplete');
    if (!timingSafeEqual(hash.digest(), asset.checksum))
      throw new Error('Mac update checksum mismatch');
    await fs.promises.rename(partialPath, filePath);
    downloadSignal.throwIfAborted();
    reportProgress(100);
    return filePath;
  } catch (error) {
    if (temporaryDirectory)
      await fs.promises.rm(temporaryDirectory, {
        recursive: true,
        force: true,
      });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { downloadMacUpdate };
