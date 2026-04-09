/**
 * Copies HTML into dist/ and replaces %%SUPABASE_URL%%, %%SUPABASE_ANON_KEY%%,
 * %%DRIVER_FUNCTION_URL%% from process.env or .env.local (project root).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function loadConfig() {
  const fileEnv = parseEnvFile(join(root, '.env.local'));
  const url =
    process.env.SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
    '';
  const key =
    process.env.SUPABASE_ANON_KEY ||
    fileEnv.SUPABASE_ANON_KEY ||
    fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    '';
  let fn =
    process.env.DRIVER_FUNCTION_URL ||
    fileEnv.DRIVER_FUNCTION_URL ||
    '';
  if (!fn && url) {
    fn = url.replace(/\/$/, '').replace('.supabase.co', '.functions.supabase.co') + '/driver-location';
  }
  return { url, key, fn };
}

const { url, key, fn } = loadConfig();

if (process.env.VERCEL && !key) {
  console.error(
    'Build failed: set SUPABASE_ANON_KEY in Vercel → Project → Settings → Environment Variables.',
  );
  process.exit(1);
}

if (process.env.VERCEL && !url) {
  console.error('Build failed: set SUPABASE_URL in Vercel Environment Variables.');
  process.exit(1);
}

mkdirSync(dist, { recursive: true });

const files = ['index.html', 'track.html', 'driver.html'];

for (const name of files) {
  const src = join(root, name);
  if (!existsSync(src)) continue;
  let html = readFileSync(src, 'utf8');
  html = html.replaceAll('%%SUPABASE_URL%%', url);
  html = html.replaceAll('%%SUPABASE_ANON_KEY%%', key);
  html = html.replaceAll('%%DRIVER_FUNCTION_URL%%', fn);
  writeFileSync(join(dist, name), html, 'utf8');
  console.log('Wrote', join('dist', name));
}

const extra = join(root, 'bb');
if (existsSync(extra)) {
  copyFileSync(extra, join(dist, 'bb'));
  console.log('Copied bb');
}
