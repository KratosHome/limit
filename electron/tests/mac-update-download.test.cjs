const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { downloadMacUpdate } = require('../mac-update-download.cjs');

const filename = 'Limit-0.1.9-mac-universal.dmg';
const assetUrl = `https://github.com/KratosHome/limit/releases/download/v0.1.9/${filename}`;

async function fixture(t, body = Buffer.from('verified disk image')) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'limit-download-test-'),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = {
    url: filename,
    sha512: createHash('sha512').update(body).digest('base64'),
    size: body.length,
  };
  return { directory, body, info: { version: '0.1.9', files: [file] }, file };
}

test('downloads the exact DMG in a unique directory without overwriting an existing installer', async (t) => {
  const f = await fixture(t, Buffer.alloc(400, 7));
  await fs.writeFile(path.join(f.directory, filename), 'user file');
  f.info.files.unshift({ url: 'Limit-0.1.9-mac-universal.zip' });
  const progress = [];
  const filePath = await downloadMacUpdate(f.info, {
    directory: f.directory,
    onProgress: (percent) => progress.push(percent),
    fetch: async (url, options) => {
      assert.equal(url, assetUrl);
      assert.equal(options.redirect, 'manual');
      return new Response(
        new ReadableStream({
          start(controller) {
            for (let offset = 0; offset < 400; offset += 100)
              controller.enqueue(f.body.subarray(offset, offset + 100));
            controller.close();
          },
        }),
      );
    },
  });
  assert.equal(path.isAbsolute(filePath), true);
  assert.equal(path.basename(filePath), filename);
  assert.match(path.basename(path.dirname(filePath)), /^Limit-Update-/);
  assert.equal(path.dirname(path.dirname(filePath)), f.directory);
  assert.deepEqual(await fs.readFile(filePath), f.body);
  assert.equal(
    await fs.readFile(path.join(f.directory, filename), 'utf8'),
    'user file',
  );
  assert.deepEqual(await fs.readdir(path.dirname(filePath)), [filename]);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 100);
  assert.deepEqual(
    progress,
    [...new Set(progress)].sort((a, b) => a - b),
  );
  assert.equal(
    progress.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 100,
    ),
    true,
  );
  if (process.platform !== 'win32')
    assert.equal((await fs.stat(path.dirname(filePath))).mode & 0o077, 0);
});

test('accepts trusted absolute metadata URLs and GitHub asset redirects without using Response.url', async (t) => {
  const f = await fixture(t);
  f.file.url = assetUrl;
  f.info.tag = 'v0.1.9';
  const redirected =
    'https://release-assets.githubusercontent.com/github-production-release-asset/example?token=example';
  const calls = [];
  const filePath = await downloadMacUpdate(f.info, {
    directory: f.directory,
    fetch: async (url) => {
      calls.push(url);
      return calls.length === 1
        ? new Response(null, { status: 302, headers: { location: redirected } })
        : new Response(f.body);
    },
  });
  assert.deepEqual(calls, [assetUrl, redirected]);
  assert.deepEqual(await fs.readFile(filePath), f.body);
});

test('rejects unexpected metadata before making requests or creating files', async (t) => {
  const f = await fixture(t);
  const variants = [
    { ...f.info, version: '0.1.9-beta.1' },
    { ...f.info, version: '00.1.9' },
    { ...f.info, version: '0.1.65536' },
    { ...f.info, tag: 'v0.1.8' },
    { ...f.info, tag: '0.1.9' },
    { ...f.info, files: [f.file, f.file] },
    ...[
      { url: `../${filename}` },
      { url: `https://example.com/${filename}` },
      { url: `${assetUrl}?download=1` },
      { url: 'Limit-0.1.8-mac-universal.dmg' },
      { sha512: f.file.sha512.trimEnd().replace(/=$/, '') },
      { sha512: `${f.file.sha512}\n` },
      { sha512: Buffer.alloc(32).toString('base64') },
      { size: 0 },
      { size: 2 * 1024 ** 3 + 1 },
      { size: '19' },
    ].map((patch) => ({ ...f.info, files: [{ ...f.file, ...patch }] })),
  ];
  for (const info of variants) {
    await assert.rejects(
      downloadMacUpdate(info, {
        directory: f.directory,
        fetch: () => assert.fail('untrusted metadata must not be fetched'),
      }),
    );
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
});

test('checksum mismatch, incomplete, oversized and failed streams remove owned downloads', async (t) => {
  const f = await fixture(t);
  const cases = [
    { body: Buffer.alloc(f.body.length), error: /checksum mismatch/ },
    { body: f.body.subarray(1), error: /incomplete/ },
    {
      body: Buffer.concat([f.body, Buffer.from('extra')]),
      error: /exceeds expected size/,
    },
    {
      body: new ReadableStream({
        start(controller) {
          controller.error(new Error('body failed'));
        },
      }),
      error: /body failed/,
    },
  ];
  await fs.writeFile(path.join(f.directory, 'keep.txt'), 'keep');
  for (const entry of cases) {
    const progress = [];
    await assert.rejects(
      downloadMacUpdate(f.info, {
        directory: f.directory,
        fetch: async () => new Response(entry.body),
        onProgress: (percent) => progress.push(percent),
      }),
      entry.error,
    );
    assert.deepEqual(await fs.readdir(f.directory), ['keep.txt']);
    assert.equal(progress.includes(100), false);
  }
});

test('rejects redirects outside official HTTPS asset hosts and limits redirect loops', async (t) => {
  const f = await fixture(t);
  for (const location of [
    'https://example.com/update.dmg',
    'http://release-assets.githubusercontent.com/update.dmg',
    'https://release-assets.githubusercontent.com.example.com/update.dmg',
    'https://user:password@github.com/update.dmg',
    'https://github.com:444/update.dmg',
    'file:///tmp/update.dmg',
    assetUrl,
  ]) {
    let requests = 0;
    await assert.rejects(
      downloadMacUpdate(f.info, {
        directory: f.directory,
        fetch: async () => {
          requests += 1;
          return new Response(null, { status: 302, headers: { location } });
        },
      }),
      /redirect/,
    );
    assert.equal(requests, location === assetUrl ? 6 : 1);
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
});

test('caller cancellation aborts stalled streams and removes the partial file', async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  let cancelled = false;
  await assert.rejects(
    downloadMacUpdate(f.info, {
      directory: f.directory,
      signal: controller.signal,
      fetch: async (_url, options) => {
        assert.equal(options.signal.aborted, false);
        return new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(f.body.subarray(0, 1));
            },
            cancel() {
              cancelled = true;
            },
          }),
        );
      },
      onProgress: (percent) => {
        if (percent > 0) controller.abort();
      },
    }),
    { name: 'AbortError' },
  );
  assert.equal(cancelled, true);
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test('timeout aborts network requests and cleanup also handles HTTP errors', async (t) => {
  const f = await fixture(t);
  for (const status of [404, 500]) {
    await assert.rejects(
      downloadMacUpdate(f.info, {
        directory: f.directory,
        fetch: async () => new Response(null, { status }),
      }),
      /request failed/,
    );
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
  const keepAlive = setInterval(() => {}, 100);
  try {
    await assert.rejects(
      downloadMacUpdate(f.info, {
        directory: f.directory,
        timeoutMs: 10,
        fetch: (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(options.signal.reason),
              { once: true },
            );
          }),
      }),
      /timed out/,
    );
    assert.deepEqual(await fs.readdir(f.directory), []);
  } finally {
    clearInterval(keepAlive);
  }
});

test('already aborted downloads do not create files or fetch', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    downloadMacUpdate(f.info, {
      directory: f.directory,
      signal: AbortSignal.abort(),
      fetch: () => assert.fail('aborted download must not fetch'),
    }),
    { name: 'AbortError' },
  );
  assert.deepEqual(await fs.readdir(f.directory), []);
});
