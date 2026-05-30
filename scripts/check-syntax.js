const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const roots = ['src', 'bin', 'test', 'scripts', 'public'];
const files = roots.flatMap((root) => {
  return fs.readdirSync(path.join(__dirname, '..', root))
    .filter((name) => name.endsWith('.js'))
    .map((name) => path.join(root, name));
});

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
