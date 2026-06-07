const fs = require('fs');
const path = require('path');

const arch = process.arch;
const root = path.join(__dirname, '..', 'vendor', 'nowplaying-cli');
const bundle = path.join(root, `darwin-${arch}`);
const required = [
  path.join(bundle, 'nowplaying-cli'),
  path.join(bundle, 'build', 'mediaremote-mini', 'MediaRemoteMini.dylib'),
  path.join(bundle, 'scripts', 'mediaremote-mini.pl'),
  path.join(root, 'LICENSE'),
  path.join(root, 'NOTICE.md'),
  path.join(root, 'source', 'nowplaying-cli-8c8c1fa.tar.gz')
];

const missing = required.filter(file => !fs.existsSync(file));
if (missing.length > 0) {
  console.error(`Missing bundled nowplaying-cli files:\n${missing.join('\n')}`);
  console.error('Run npm run build:mac-helper on a matching macOS architecture.');
  process.exit(1);
}

const sourceArchive = path.join(root, 'source', 'nowplaying-cli-8c8c1fa.tar.gz');
if (fs.statSync(sourceArchive).size === 0) {
  console.error('Bundled nowplaying-cli source archive is empty.');
  process.exit(1);
}

console.log(`Verified bundled nowplaying-cli payload for ${arch}`);
