function bccToPlainText(bcc) {
  const body = Array.isArray(bcc && bcc.body) ? bcc.body : [];
  const lines = body
    .map((item) => String(item && item.content ? item.content : '').trim())
    .filter(Boolean);
  return `${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`;
}

module.exports = { bccToPlainText };
