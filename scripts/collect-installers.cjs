const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const { requiredReleaseFiles } = require('./release-publish.cjs');

const projectRoot = path.resolve(__dirname, '..');
const destination = path.join(projectRoot, 'installers');
const files = requiredReleaseFiles(version);
const arguments_ = process.argv.slice(2);
if (arguments_.some((argument) => !['--win', '--mac'].includes(argument)))
  throw new Error('Use --win, --mac, or no arguments for both installers');
const selected = [
  ...(!arguments_.length || arguments_.includes('--win')
    ? [files.windows]
    : []),
  ...(!arguments_.length || arguments_.includes('--mac') ? [files.macDmg] : []),
];
const sources = selected.map((name) => {
  const source = path.join(projectRoot, 'release', 'publish', name);
  const stat = fs.lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0)
    throw new Error(`Missing or invalid installer: ${name}`);
  return { name, source };
});
fs.mkdirSync(destination, { recursive: true });
for (const { name, source } of sources) {
  const target = path.join(destination, name);
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
    throw new Error(`Installer destination cannot be a symbolic link: ${name}`);
  fs.copyFileSync(source, target);
  console.log(target);
}
