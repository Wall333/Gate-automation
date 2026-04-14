const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../lib/prisma');

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.bin', '.ota']);
const FIRMWARE_DIR = path.join(__dirname, '..', 'firmware');

function printUsage() {
  console.log('Usage: node scripts/publish-firmware.js <file> [--version 1.5.9] [--filename gate_controller_v1.5.9.ota]');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/publish-firmware.js /tmp/gate_controller_v1.5.9.ota --version 1.5.9');
  console.log('  node scripts/publish-firmware.js ./build/gate_controller.bin --version 1.5.9');
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const inputPath = argv[0];
  let version = '';
  let filename = '';

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      version = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--filename') {
      filename = argv[index + 1] || '';
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { inputPath, version, filename };
}

async function main() {
  const { inputPath, version, filename } = parseArgs(process.argv.slice(2));
  const sourcePath = path.resolve(inputPath);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Firmware file not found: ${sourcePath}`);
  }

  const stats = fs.statSync(sourcePath);
  if (!stats.isFile()) {
    throw new Error(`Not a file: ${sourcePath}`);
  }
  if (stats.size > MAX_FILE_BYTES) {
    throw new Error(`Firmware file is too large (${stats.size} bytes). Max size is ${MAX_FILE_BYTES} bytes.`);
  }

  const extension = path.extname(sourcePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported firmware type: ${extension || '(none)'}. Use .bin or .ota.`);
  }

  fs.mkdirSync(FIRMWARE_DIR, { recursive: true });

  const storedName = `${crypto.randomUUID()}${extension}`;
  const destinationPath = path.join(FIRMWARE_DIR, storedName);
  const originalName = filename || path.basename(sourcePath);

  fs.copyFileSync(sourcePath, destinationPath);

  try {
    const firmware = await prisma.firmware.create({
      data: {
        filename: originalName,
        storedName,
        version,
        size: stats.size,
      },
      select: {
        id: true,
        filename: true,
        storedName: true,
        version: true,
        size: true,
        uploadedAt: true,
      },
    });

    console.log('Published firmware:');
    console.log(JSON.stringify(firmware, null, 2));
    console.log('This is now the latest firmware by upload time.');
  } catch (error) {
    if (fs.existsSync(destinationPath)) {
      fs.unlinkSync(destinationPath);
    }
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('[publish-firmware] Error:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });