const test = require('node:test');
const assert = require('node:assert/strict');
const { extractBvid } = require('../src/bvid');

test('extracts bvid from a bilibili video url', () => {
  assert.equal(extractBvid('https://www.bilibili.com/video/BV1Jh5d68Er3'), 'BV1Jh5d68Er3');
});

test('accepts a raw BV id', () => {
  assert.equal(extractBvid('BV1vBdMBREtm'), 'BV1vBdMBREtm');
});

test('rejects input without a BV id', () => {
  assert.throws(() => extractBvid('https://space.bilibili.com/123'), /Could not find BV id/);
});
