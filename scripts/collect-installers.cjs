const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const { requiredReleaseFiles } = require('./release-publish.cjs');

function collectInstallers({
  projectRoot = path.resolve(__dirname, '..'),
  packageVersion = version,
  arguments_ = [],
} = {}) {
  if (
    arguments_.some(
      (argument) => !['--local', '--win', '--mac'].includes(argument),
    )
  )
    throw new Error(
      'Use --local, --win, --mac, or no platform for both installers',
    );
  const local = arguments_.includes('--local');
  const platforms = arguments_.filter((argument) => argument !== '--local');
  const destination = path.join(projectRoot, 'installers');
  const files = requiredReleaseFiles(packageVersion);
  const selected = [
    ...(!platforms.length || platforms.includes('--win')
      ? [files.windows]
      : []),
    ...(!platforms.length || platforms.includes('--mac') ? [files.macDmg] : []),
  ];
  const sources = selected.map((filename) => {
    const name = local ? filename.replace('Limit-', 'Limit-Local-') : filename;
    const source = path.join(
      projectRoot,
      'release',
      local ? 'local' : 'publish',
      name,
    );
    const stat = fs.lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0)
      throw new Error(`Missing or invalid installer: ${name}`);
    return { name, source };
  });
  fs.mkdirSync(destination, { recursive: true });
  return sources.map(({ name, source }) => {
    const target = path.join(destination, name);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
      throw new Error(
        `Installer destination cannot be a symbolic link: ${name}`,
      );
    fs.copyFileSync(source, target);
    return target;
  });
}

if (require.main === module) {
  for (const target of collectInstallers({ arguments_: process.argv.slice(2) }))
    console.log(target);
}

module.exports = { collectInstallers };
