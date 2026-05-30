const path = require('node:path');

function dateFolderName(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function withDateFolder(outputDir, value = new Date()) {
  return path.join(outputDir || 'downloads', dateFolderName(value));
}

module.exports = { dateFolderName, withDateFolder };
