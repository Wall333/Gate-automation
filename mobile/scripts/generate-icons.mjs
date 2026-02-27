/**
 * Generate app icons for Gate Controller
 * Run: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'assets');

// Colors
const BLUE = '#1565C0';       // Primary blue
const LIGHT_BLUE = '#E3F2FD'; // Light background
const WHITE = '#FFFFFF';
const DARK = '#0D47A1';       // Dark accent

/**
 * Create an SVG gate icon
 */
function gateSvg(size, fg, bg, showBg = true) {
  const s = size;
  const cx = s / 2;
  // Scale factors relative to 1024
  const sc = s / 1024;

  // Gate design: two pillars with an arch and vertical bars
  const pillarW = 100 * sc;
  const pillarH = 480 * sc;
  const pillarY = 320 * sc;
  const leftPillarX = 220 * sc;
  const rightPillarX = s - 220 * sc - pillarW;
  const archY = pillarY;
  const archRadius = (rightPillarX - leftPillarX) / 2 + pillarW / 2;
  const archCx = cx;
  const archCy = archY;

  // Vertical bars
  const barW = 24 * sc;
  const barSpacing = (rightPillarX - leftPillarX - pillarW) / 4;
  const barTop = archY + 60 * sc;
  const barBottom = pillarY + pillarH;

  let bars = '';
  for (let i = 1; i <= 3; i++) {
    const bx = leftPillarX + pillarW + barSpacing * i - barW / 2;
    bars += `<rect x="${bx}" y="${barTop}" width="${barW}" height="${barBottom - barTop}" rx="${barW / 2}" fill="${fg}" />`;
  }

  // Pillar caps (decorative tops)
  const capH = 40 * sc;
  const capExtra = 20 * sc;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    ${showBg ? `<rect width="${s}" height="${s}" fill="${bg}" />` : ''}
    
    <!-- Left pillar -->
    <rect x="${leftPillarX}" y="${pillarY}" width="${pillarW}" height="${pillarH}" rx="${12 * sc}" fill="${fg}" />
    <!-- Left cap -->
    <rect x="${leftPillarX - capExtra}" y="${pillarY - capH}" width="${pillarW + capExtra * 2}" height="${capH}" rx="${8 * sc}" fill="${fg}" />
    
    <!-- Right pillar -->
    <rect x="${rightPillarX}" y="${pillarY}" width="${pillarW}" height="${pillarH}" rx="${12 * sc}" fill="${fg}" />
    <!-- Right cap -->
    <rect x="${rightPillarX - capExtra}" y="${pillarY - capH}" width="${pillarW + capExtra * 2}" height="${capH}" rx="${8 * sc}" fill="${fg}" />
    
    <!-- Arch -->
    <path d="M ${leftPillarX + pillarW / 2} ${archY}
             A ${archRadius} ${archRadius * 0.7} 0 0 1 ${rightPillarX + pillarW / 2} ${archY}"
          fill="none" stroke="${fg}" stroke-width="${36 * sc}" stroke-linecap="round" />
    
    <!-- Bars -->
    ${bars}
    
    <!-- Ground line -->
    <rect x="${160 * sc}" y="${pillarY + pillarH}" width="${s - 320 * sc}" height="${20 * sc}" rx="${10 * sc}" fill="${fg}" />
  </svg>`;
}

async function generate() {
  // 1. Main icon (1024x1024) - used for iOS and general
  const iconSvg = gateSvg(1024, WHITE, BLUE);
  await sharp(Buffer.from(iconSvg))
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('✓ icon.png (1024x1024)');

  // 2. Adaptive icon foreground (1024x1024, transparent bg)
  //    Safe zone is inner 66% circle, so keep content centered
  const fgSvg = gateSvg(1024, BLUE, 'transparent', false);
  await sharp(Buffer.from(fgSvg))
    .png()
    .toFile(path.join(assetsDir, 'android-icon-foreground.png'));
  console.log('✓ android-icon-foreground.png (1024x1024)');

  // 3. Adaptive icon background (1024x1024, solid color)
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 227, g: 242, b: 253, alpha: 1 } // LIGHT_BLUE
    }
  })
    .png()
    .toFile(path.join(assetsDir, 'android-icon-background.png'));
  console.log('✓ android-icon-background.png (1024x1024)');

  // 4. Monochrome icon (1024x1024, white on transparent)
  const monoSvg = gateSvg(1024, '#FFFFFF', 'transparent', false);
  await sharp(Buffer.from(monoSvg))
    .png()
    .toFile(path.join(assetsDir, 'android-icon-monochrome.png'));
  console.log('✓ android-icon-monochrome.png (1024x1024)');

  // 5. Splash icon (200x200)
  const splashSvg = gateSvg(200, BLUE, 'transparent', false);
  await sharp(Buffer.from(splashSvg))
    .resize(200, 200)
    .png()
    .toFile(path.join(assetsDir, 'splash-icon.png'));
  console.log('✓ splash-icon.png (200x200)');

  // 6. Favicon (48x48)
  const favSvg = gateSvg(48, WHITE, BLUE);
  await sharp(Buffer.from(favSvg))
    .png()
    .toFile(path.join(assetsDir, 'favicon.png'));
  console.log('✓ favicon.png (48x48)');

  console.log('\nAll icons generated!');
}

generate().catch(console.error);
