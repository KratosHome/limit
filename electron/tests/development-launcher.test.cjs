const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = path.resolve(__dirname, '../../scripts/start-development.cjs');

function launcher(platform, env = {}) {
  const calls = [];
  const child = new EventEmitter();
  const processEvents = new EventEmitter();
  const processStub = {
    platform,
    execPath: '/ide node/bin/node',
    env,
    once: processEvents.once.bind(processEvents),
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), {
    __dirname: path.dirname(script),
    process: processStub,
    console: { error() {} },
    require: (name) =>
      name === 'node:child_process'
        ? {
            spawn(command, args, options) {
              calls.push({ command, args: Array.from(args), options });
              return child;
            },
          }
        : require(name),
  });
  return { calls, child, processStub };
}

test('dev uses the npm CLI supplied by the IDE without relying on npm in PATH', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    const npmPath = '/ide node/lib/npm/bin/npm-cli.js';
    const { calls } = launcher(platform, { npm_execpath: npmPath, PATH: '' });
    assert.equal(calls[0].command, '/ide node/bin/node');
    assert.deepEqual(calls[0].args, [
      npmPath,
      'run',
      platform === 'darwin' ? 'dev:mac:signed' : 'dev:ui',
    ]);
  }
});

test('direct dev script calls retain platform fallbacks and report failures', () => {
  const mac = launcher('darwin');
  assert.equal(mac.calls[0].command, 'npm');
  assert.deepEqual(mac.calls[0].args, ['run', 'dev:mac:signed']);
  mac.child.emit('error', new Error('npm missing'));
  assert.equal(mac.processStub.exitCode, 1);

  const windows = launcher('win32', { ComSpec: 'cmd.exe' });
  assert.equal(windows.calls[0].command, 'cmd.exe');
  assert.deepEqual(windows.calls[0].args, ['/d', '/s', '/c', 'npm run dev:ui']);
  windows.child.emit('exit', 7, null);
  assert.equal(windows.processStub.exitCode, 7);
});
