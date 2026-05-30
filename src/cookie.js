function parseCookieText(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return '';
  }

  const pairs = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const columns = trimmed.split('\t');
    if (columns.length >= 7) {
      const domain = columns[0];
      const name = columns[5];
      const value = columns.slice(6).join('\t');
      if (domain.includes('bilibili.com') && name && value) {
        pairs.push(`${name}=${value}`);
      }
    }
  }

  if (pairs.length > 0) {
    return pairs.join('; ');
  }

  return raw.replace(/\r?\n/g, '; ');
}

module.exports = { parseCookieText };
