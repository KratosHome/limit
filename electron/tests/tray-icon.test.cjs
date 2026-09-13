const assert = require('node:assert/strict');
const test = require('node:test');
const { createTrayIcon } = require('../tray-icon.cjs');

function captureIcon(platform) {
  let bitmap;
  let options;
  const image = { setTemplateImage: (value) => (image.template = value) };
  const result = createTrayIcon(
    {
      createFromBitmap: (pixels, size) => {
        bitmap = pixels;
        options = size;
        return image;
      },
    },
    platform,
  );
  assert.equal(result, image);
  assert.deepEqual(options, { width: 36, height: 36, scaleFactor: 2 });
  assert.equal(bitmap.length, 36 * 36 * 4);
  return { image, bitmap };
}

test('the final Mac tray image is a nonempty antialiased clock template at 18 logical points', () => {
  const { image, bitmap } = captureIcon('darwin');
  assert.equal(image.template, true);
  const alpha = [];
  for (let index = 0; index < bitmap.length; index += 4) {
    assert.equal(bitmap[index] + bitmap[index + 1] + bitmap[index + 2], 0);
    alpha.push(bitmap[index + 3]);
  }
  assert.ok(alpha.includes(0));
  assert.ok(alpha.includes(255));
  assert.ok(alpha.some((value) => value > 0 && value < 255));
  assert.equal(alpha[0], 0);
  assert.equal(alpha[18 * 36 + 18], 255);
});

test('other platforms receive a visible white clock on a dark badge with valid premultiplied pixels', () => {
  for (const platform of ['win32', 'linux']) {
    const { image, bitmap } = captureIcon(platform);
    assert.equal(image.template, undefined);
    let hasWhite = false;
    let hasDarkBadge = false;
    for (let index = 0; index < bitmap.length; index += 4) {
      const [blue, green, red, alpha] = bitmap.subarray(index, index + 4);
      assert.ok(blue <= alpha && green <= alpha && red <= alpha);
      hasWhite ||= red === 255 && green === 255 && blue === 255;
      hasDarkBadge ||= red === 17 && green === 24 && blue === 39;
    }
    assert.equal(hasWhite, true);
    assert.equal(hasDarkBadge, true);
    assert.equal(bitmap[3], 0);
  }
});
