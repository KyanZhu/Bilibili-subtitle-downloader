const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCookieText } = require('../src/cookie');

test('keeps raw cookie header text', () => {
  assert.equal(parseCookieText('SESSDATA=abc; bili_jct=def'), 'SESSDATA=abc; bili_jct=def');
});

test('converts netscape cookie file text to a cookie header', () => {
  const text = [
    '# Netscape HTTP Cookie File',
    '.bilibili.com\tTRUE\t/\tTRUE\t1893456000\tSESSDATA\tabc',
    '.bilibili.com\tTRUE\t/\tTRUE\t1893456000\tbili_jct\tdef',
    '.example.com\tTRUE\t/\tTRUE\t1893456000\tignored\tvalue',
  ].join('\n');

  assert.equal(parseCookieText(text), 'SESSDATA=abc; bili_jct=def');
});
