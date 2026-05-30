const test = require('node:test');
const assert = require('node:assert/strict');
const { bccToAss } = require('../src/ass');

test('converts bcc body entries to ass dialogue lines', () => {
  const ass = bccToAss({
    body: [
      { from: 1.2, to: 3.45, content: 'hello' },
      { from: 65, to: 66.5, content: 'second line' },
    ],
  });

  assert.match(ass, /\[Script Info\]/);
  assert.match(ass, /Dialogue: 0,0:00:01\.20,0:00:03\.45,Default,,0,0,0,,hello/);
  assert.match(ass, /Dialogue: 0,0:01:05\.00,0:01:06\.50,Default,,0,0,0,,second line/);
});

test('escapes ass control characters in content', () => {
  const ass = bccToAss({ body: [{ from: 0, to: 1, content: 'a{b}\nc' }] });
  assert.match(ass, /a\\\{b\\\}\\Nc/);
});
