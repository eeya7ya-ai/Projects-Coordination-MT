// Script to generate PNG app icons for PWA
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background — brand dark red
  ctx.fillStyle = '#8B0000';
  ctx.fillRect(0, 0, size, size);

  // "MT" monogram
  const fontSize = Math.round(size * 0.46);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MT', size / 2, size * 0.48);

  // Bottom accent bar
  const barH = Math.max(6, Math.round(size * 0.035));
  const barY = size * 0.78;
  const barX = size * 0.15;
  const barW = size * 0.70;
  const radius = barH / 2;
  ctx.fillStyle = '#E74C3C';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(barX + radius, barY);
  ctx.lineTo(barX + barW - radius, barY);
  ctx.arcTo(barX + barW, barY, barX + barW, barY + barH, radius);
  ctx.lineTo(barX + barW, barY + barH - radius);
  ctx.arcTo(barX + barW, barY + barH, barX + barW - radius, barY + barH, radius);
  ctx.lineTo(barX + radius, barY + barH);
  ctx.arcTo(barX, barY + barH, barX, barY + barH - radius, radius);
  ctx.lineTo(barX, barY + radius);
  ctx.arcTo(barX, barY, barX + radius, barY, radius);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

const outDir = path.join(__dirname, 'public');
const sizes = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

for (const { size, name } of sizes) {
  const canvas = drawIcon(size);
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(`Generated ${name} (${size}x${size})`);
}
console.log('Done.');
