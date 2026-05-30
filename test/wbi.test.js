const test = require('node:test');
const assert = require('node:assert/strict');
const { createWbiSigner, extractWbiKeyPart } = require('../src/wbi');

test('extracts wbi key part from image urls', () => {
  assert.equal(extractWbiKeyPart('https://i0.hdslb.com/bfs/wbi/abc123.png'), 'abc123');
});

test('signs wbi params with wts and w_rid', () => {
  const signer = createWbiSigner({
    imgKey: '7cd084941338484aae1ad9425b84077c',
    subKey: '4932caff0ff746eab6f01bf08b70ac45',
    now: () => 1700000000,
  });

  const signed = signer.sign({ mid: 1350959407, order: 'pubdate' });
  assert.equal(signed.mid, 1350959407);
  assert.equal(signed.wts, 1700000000);
  assert.match(signed.w_rid, /^[a-f0-9]{32}$/);
});
