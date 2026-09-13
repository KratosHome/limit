const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
  findSignedDevelopmentProcesses,
} = require('../../scripts/signed-macos-dev-processes.cjs');
const {
  stopSignedDevelopment,
} = require('../../scripts/stop-signed-macos-dev.cjs');

const projectRoot = path.resolve('/tmp/Limit Project');
const executable = (root = projectRoot, directory = 'mac-arm64') =>
  path.join(
    root,
    'release/development',
    directory,
    'Limit Development.app/Contents/MacOS/Limit Development',
  );
const development = { pid: 123, command: executable() };

function stopHarness({ snapshots = [[development]], signalError } = {}) {
  const signals = [];
  const waits = [];
  let elapsed = 0;
  let reads = 0;
  const options = {
    platform: 'darwin',
    findProcesses() {
      const value = snapshots[Math.min(reads++, snapshots.length - 1)];
      if (value instanceof Error) throw value;
      return value;
    },
    signalProcess(pid, signal) {
      signals.push({ pid, signal });
      if (signalError) throw signalError;
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      elapsed += milliseconds;
    },
    now: () => elapsed,
    timeoutMs: 250,
    pollIntervalMs: 100,
    log() {},
  };
  return { options, signals, waits, reads: () => reads };
}

test('development process discovery matches only this project’s exact main executable paths', () => {
  const otherProject = executable(path.resolve('/tmp/Other Project'));
  const production = path.join(
    projectRoot,
    'release/mac-arm64/Limit.app/Contents/MacOS/Limit',
  );
  const helper = path.join(
    executable(),
    '../../Frameworks/Limit Development Helper.app/Contents/MacOS/Limit Development Helper',
  );
  const processList = [
    `123 ${executable()}`,
    `124 ${executable(projectRoot, 'mac-universal')}`,
    `200 ${production}`,
    `201 ${otherProject}`,
    `202 ${helper}`,
    `203 ${executable()} Copy`,
    `204 ${executable()}-old`,
    `0 ${executable()}`,
    `9007199254740992 ${executable()}`,
  ].join('\n');
  const processes = findSignedDevelopmentProcesses(
    projectRoot,
    (command, args, options) => {
      assert.equal(command, 'ps');
      assert.deepEqual(args, ['-axo', 'pid=,comm=']);
      assert.equal(options.timeout, 2000);
      return { status: 0, stdout: processList };
    },
  );
  assert.deepEqual(processes, [
    development,
    { pid: 124, command: executable(projectRoot, 'mac-universal') },
  ]);
});

test('process discovery fails closed when ps fails or returns no usable output', () => {
  for (const result of [
    { status: 1, stdout: '' },
    { status: 0, stdout: null },
    { error: new Error('ps timed out') },
  ]) {
    assert.throws(() =>
      findSignedDevelopmentProcesses(projectRoot, () => result),
    );
  }
});

test('no running development process or a non-Mac platform needs no signal', async () => {
  const empty = stopHarness({ snapshots: [[]] });
  await stopSignedDevelopment(empty.options);
  assert.deepEqual(empty.signals, []);
  assert.deepEqual(empty.waits, []);
  const windows = stopHarness();
  await stopSignedDevelopment({ ...windows.options, platform: 'win32' });
  assert.equal(windows.reads(), 0);
  assert.deepEqual(windows.signals, []);
});

test('development restart sends SIGTERM once and waits for a graceful exit', async () => {
  const h = stopHarness({
    snapshots: [[development], [development], [development], []],
  });
  await stopSignedDevelopment(h.options);
  assert.deepEqual(h.signals, [{ pid: 123, signal: 'SIGTERM' }]);
  assert.deepEqual(h.waits, [100]);
  assert.equal(h.reads(), 4);
});

test('a process that disappeared or changed identity before signalling is not killed', async () => {
  const disappeared = stopHarness({ snapshots: [[development], [], []] });
  await stopSignedDevelopment(disappeared.options);
  assert.deepEqual(disappeared.signals, []);
  const changed = stopHarness({
    snapshots: [
      [development],
      [{ ...development, command: executable(projectRoot, 'mac-universal') }],
      [],
    ],
  });
  await stopSignedDevelopment(changed.options);
  assert.deepEqual(changed.signals, []);
});

test('an exit between ownership check and SIGTERM is harmless', async () => {
  const h = stopHarness({
    snapshots: [[development], [development], []],
    signalError: Object.assign(new Error('gone'), { code: 'ESRCH' }),
  });
  await stopSignedDevelopment(h.options);
  assert.deepEqual(h.signals, [{ pid: 123, signal: 'SIGTERM' }]);
});

test('a stuck development process aborts at the deadline without force-killing', async () => {
  const h = stopHarness();
  await assert.rejects(stopSignedDevelopment(h.options), /Збірку зупинено/);
  assert.deepEqual(h.signals, [{ pid: 123, signal: 'SIGTERM' }]);
  assert.deepEqual(h.waits, [100, 100, 50]);
});

test('a newly started development process blocks packaging without being signalled', async () => {
  const replacement = { ...development, pid: 456 };
  const h = stopHarness({
    snapshots: [[development], [development], [replacement]],
  });
  await assert.rejects(stopSignedDevelopment(h.options), /PID: 456/);
  assert.deepEqual(h.signals, [{ pid: 123, signal: 'SIGTERM' }]);
});

test('signal and process inspection errors stop the restart', async () => {
  const denied = stopHarness({
    signalError: Object.assign(new Error('permission denied'), {
      code: 'EPERM',
    }),
  });
  await assert.rejects(
    stopSignedDevelopment(denied.options),
    /permission denied/,
  );
  assert.deepEqual(denied.waits, []);
  const failedRead = stopHarness({
    snapshots: [[development], [development], new Error('ps unavailable')],
  });
  await assert.rejects(
    stopSignedDevelopment(failedRead.options),
    /ps unavailable/,
  );
  assert.deepEqual(failedRead.waits, []);
});

test('packaging and launch require successful stop preflight and retain a final running-process guard', () => {
  const { scripts } = require('../../package.json');
  assert.equal(
    scripts['dev:mac:signed'],
    'node scripts/stop-signed-macos-dev.cjs && npm run package:mac:local && node scripts/start-signed-macos-dev.cjs',
  );
  assert.match(
    scripts['package:mac:local'],
    /^node scripts\/assert-signed-macos-dev-not-running\.cjs && /,
  );
});
