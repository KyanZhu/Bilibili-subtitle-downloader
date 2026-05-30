const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { dateFolderName, withDateFolder } = require('../src/output-paths');

test('formats date folder names as yyyy-mm-dd', () => {
  assert.equal(dateFolderName(new Date('2026-05-30T12:34:56Z')), '2026-05-30');
});

test('appends date folder to base output directory', () => {
  assert.equal(withDateFolder('downloads', new Date('2026-05-30T12:34:56Z')), path.join('downloads', '2026-05-30'));
});
