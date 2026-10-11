const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www');
fs.rmSync(www, {recursive:true, force:true});
fs.mkdirSync(www, {recursive:true});
for (const name of ['index.html','app.js','one-shots.json']) {
  const source = path.join(root, name);
  if (!fs.existsSync(source)) throw new Error(`Required mobile asset missing: ${name}`);
  fs.copyFileSync(source, path.join(www, name));
}
console.log('Prepared www/ with the one-shot app and playlist data.');
