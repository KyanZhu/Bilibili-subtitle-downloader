const crypto = require('node:crypto');

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function extractWbiKeyPart(url) {
  const text = String(url || '');
  const filename = text.split('/').pop() || '';
  return filename.split('.')[0] || '';
}

function createMixinKey(imgKey, subKey) {
  const source = `${imgKey}${subKey}`;
  return MIXIN_KEY_ENC_TAB.map((index) => source[index]).join('').slice(0, 32);
}

function encodeWbiValue(value) {
  return encodeURIComponent(String(value).replace(/[!'()*]/g, ''));
}

function createWbiSigner(options) {
  const mixinKey = createMixinKey(options.imgKey, options.subKey);
  const now = options.now || (() => Math.floor(Date.now() / 1000));

  return {
    sign(params) {
      const signed = { ...params, wts: now() };
      const query = Object.keys(signed)
        .sort()
        .map((key) => `${encodeURIComponent(key)}=${encodeWbiValue(signed[key])}`)
        .join('&');
      signed.w_rid = crypto.createHash('md5').update(`${query}${mixinKey}`).digest('hex');
      return signed;
    },
  };
}

module.exports = { createWbiSigner, extractWbiKeyPart, createMixinKey };
