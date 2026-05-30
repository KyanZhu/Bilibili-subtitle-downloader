function extractBvid(input) {
  const text = String(input || '').trim();
  const match = text.match(/BV[0-9A-Za-z]{10}/);
  if (!match) {
    throw new Error(`Could not find BV id in input: ${text}`);
  }
  return match[0];
}

module.exports = { extractBvid };
