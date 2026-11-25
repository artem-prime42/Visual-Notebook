const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const source = path.resolve('assets/visual-notebook.svg');
const outputDirectory = path.resolve('assets/icons');
const sizes = [16, 24, 32, 48, 64, 128, 256, 512];

async function main() {
  await fs.mkdir(outputDirectory, { recursive: true });
  const entries = [];
  for (const size of sizes) {
    const png = await sharp(source).resize(size, size).png().toBuffer();
    await fs.writeFile(path.join(outputDirectory, `${size}x${size}.png`), png);
    if ([16, 32, 48, 256].includes(size)) entries.push({ size, png });
  }

  const directory = Buffer.alloc(6 + entries.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(entries.length, 4);
  let offset = directory.length;
  for (let index = 0; index < entries.length; index += 1) {
    const { size, png } = entries[index];
    const position = 6 + index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, position);
    directory.writeUInt8(size === 256 ? 0 : size, position + 1);
    directory.writeUInt8(0, position + 2);
    directory.writeUInt8(0, position + 3);
    directory.writeUInt16LE(1, position + 4);
    directory.writeUInt16LE(32, position + 6);
    directory.writeUInt32LE(png.length, position + 8);
    directory.writeUInt32LE(offset, position + 12);
    offset += png.length;
  }
  await fs.writeFile(path.resolve('assets/visual-notebook.ico'), Buffer.concat([directory, ...entries.map((entry) => entry.png)]));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
