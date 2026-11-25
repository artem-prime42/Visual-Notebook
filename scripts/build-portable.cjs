const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Arch, Platform, build } = require('electron-builder');

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  }));
  return nested.flat();
}

async function buildHash() {
  const files = (await Promise.all(['package.json', 'electron', 'renderer', 'assets'].map((name) =>
    name === 'package.json' ? [path.resolve(name)] : listFiles(path.resolve(name)))))
    .flat()
    .sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(process.cwd(), file));
    hash.update(await fs.readFile(file));
  }
  return hash.digest('hex').slice(0, 12);
}

function replaceOnce(source, pattern, replacement, description) {
  const result = source.replace(pattern, replacement);
  if (result === source) throw new Error(`Could not patch portable launcher: ${description}`);
  return result;
}

async function main() {
  const appBuilderRoot = path.resolve(path.dirname(require.resolve('app-builder-lib')), '..');
  const templatePath = path.join(appBuilderRoot, 'templates', 'nsis', 'portable.nsi');
  const originalTemplate = await fs.readFile(templatePath, 'utf8');

  let template = replaceOnce(
    originalTemplate,
    /StrCpy \$INSTDIR "\$TEMP\\\$\{UNPACK_DIR_NAME\}"/,
    String.raw`StrCpy $INSTDIR "$LOCALAPPDATA\VisualNotebook\${UNPACK_DIR_NAME}"`,
    'portable cache path',
  );
  template = replaceOnce(
    template,
    /  RMDir \/r \$INSTDIR\n  SetOutPath \$INSTDIR/,
    '  ; Reuse the packaged runtime after its first extraction.\n' +
      '  IfFileExists "$INSTDIR\\.complete" launchApp\n' +
      '  RMDir /r $INSTDIR\n' +
      '  CreateDirectory $INSTDIR\n' +
      '  SetOutPath $INSTDIR',
    'cache validation',
  );
  template = replaceOnce(
    template,
    /  System::Call 'Kernel32::SetEnvironmentVariable/,
    '  FileOpen $0 "$INSTDIR\\.complete" w\n' +
      '  FileWrite $0 "${VERSION}"\n' +
      '  FileClose $0\n' +
      'launchApp:\n' +
      "  System::Call 'Kernel32::SetEnvironmentVariable",
    'cache completion marker',
  );
  template = replaceOnce(
    template,
    /\n\s*SetOutPath \$EXEDIR\n\s*RMDir \/r \$INSTDIR\nSectionEnd/,
    '\nSectionEnd',
    'preserve extracted runtime',
  );

  await fs.writeFile(templatePath, template, 'utf8');
  try {
    const hash = await buildHash();
    const cacheName = `VisualNotebook-${hash}`;
    console.log(`Portable runtime cache key: ${cacheName}`);
    const buildOutput = path.resolve('portable-build-output');
    await build({
      targets: Platform.WINDOWS.createTarget(['portable'], Arch.x64),
      config: {
        portable: { unpackDirName: cacheName },
        directories: { output: buildOutput },
      },
    });
    await fs.mkdir(path.resolve('dist'), { recursive: true });
    await fs.copyFile(path.join(buildOutput, 'VisualNotebook.exe'), path.resolve('dist', 'VisualNotebook.exe'));
    console.log('Copied portable executable to dist/VisualNotebook.exe');
    await fs.rm(buildOutput, { recursive: true, force: true });
  } finally {
    await fs.writeFile(templatePath, originalTemplate, 'utf8');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
