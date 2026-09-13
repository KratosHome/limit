const SIZE = 36;
const SCALE = 2;

function coverage(distance) {
  return Math.max(0, Math.min(1, 0.5 - distance * SCALE));
}

function segmentDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const fraction = Math.max(
    0,
    Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(x - ax - fraction * dx, y - ay - fraction * dy);
}

function createTrayIcon(nativeImage, platform = process.platform) {
  // NativeImage does not decode SVG. Render an 18-point clock directly into a
  // Retina bitmap with premultiplied BGRA pixels and antialiased edges.
  const bitmap = Buffer.alloc(SIZE * SIZE * 4);
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const x = (column + 0.5) / SCALE;
      const y = (row + 0.5) / SCALE;
      const clock = coverage(
        Math.min(
          Math.abs(Math.hypot(x - 9, y - 9) - 6) - 0.7,
          segmentDistance(x, y, 9, 5, 9, 9) - 0.8,
          segmentDistance(x, y, 9, 9, 12.1, 10.8) - 0.8,
        ),
      );
      const offset = (row * SIZE + column) * 4;
      if (platform === 'darwin') {
        bitmap[offset + 3] = Math.round(clock * 255);
      } else {
        const dx = Math.abs(x - 9) - 3;
        const dy = Math.abs(y - 9) - 3;
        const badge = coverage(
          Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
            Math.min(Math.max(dx, dy), 0) -
            5,
        );
        const white = Math.min(clock, badge);
        const background = badge - white;
        bitmap[offset] = Math.round(39 * background + 255 * white);
        bitmap[offset + 1] = Math.round(24 * background + 255 * white);
        bitmap[offset + 2] = Math.round(17 * background + 255 * white);
        bitmap[offset + 3] = Math.round(badge * 255);
      }
    }
  }
  const icon = nativeImage.createFromBitmap(bitmap, {
    width: SIZE,
    height: SIZE,
    scaleFactor: SCALE,
  });
  if (platform === 'darwin') icon.setTemplateImage(true);
  return icon;
}

module.exports = { createTrayIcon };
