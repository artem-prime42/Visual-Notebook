const path = require('node:path');
const { Arch, Platform, build } = require('electron-builder');

const config = {
  directories: { output: path.resolve('dist-linux') },
};

async function buildTarget(target) {
  await build({
    targets: Platform.LINUX.createTarget([target], Arch.x64),
    config,
  });
}

async function main() {
  if (process.platform !== 'linux') {
    throw new Error('AppImage must be built on Linux; run this script in Linux or WSL.');
  }
  await buildTarget('AppImage');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
