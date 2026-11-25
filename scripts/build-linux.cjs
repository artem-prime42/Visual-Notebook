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
  await buildTarget('tar.gz');
  if (process.platform !== 'win32') {
    await buildTarget('AppImage');
  } else {
    console.warn('Skipping AppImage: build it on Linux; Windows cannot run its mksquashfs tool.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
