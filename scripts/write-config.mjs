import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const examplePath = path.join(root, 'src', 'config.example.js');
const targetPath = path.join(root, 'src', 'config.js');

function escapeSingle(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const onVercel = process.env.VERCEL === '1';
const cid = process.env.YT_CLIENT_ID;
const key = process.env.YT_API_KEY;
const hasEnv = cid && key;

if (hasEnv) {
  let body = fs.readFileSync(examplePath, 'utf8');
  body = body.replace(
    /export const YT_CLIENT_ID = '[^']*';/,
    `export const YT_CLIENT_ID = '${escapeSingle(cid)}';`
  );
  body = body.replace(
    /export const YT_API_KEY\s*=\s*'[^']*';/,
    `export const YT_API_KEY   = '${escapeSingle(key)}';`
  );
  fs.writeFileSync(targetPath, body, 'utf8');
  console.log('write-config: wrote src/config.js from environment variables.');
} else if (onVercel) {
  fs.copyFileSync(examplePath, targetPath);
  console.warn(
    'write-config: YT_CLIENT_ID / YT_API_KEY not set on Vercel; using placeholders (sign-in disabled).'
  );
} else if (!fs.existsSync(targetPath)) {
  fs.copyFileSync(examplePath, targetPath);
  console.log('write-config: created src/config.js from config.example.js (local).');
} else {
  console.log('write-config: keeping existing src/config.js (local).');
}
