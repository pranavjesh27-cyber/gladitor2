import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const url = 'http://localhost:3000';
const openBrowser = () => spawn('cmd.exe', ['/c', 'start', '', url], { stdio: 'ignore' });
async function ready() {
  try {
    const r = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
    const data = await r.json();
    return r.ok && typeof data.transportProvider === 'string';
  } catch { return false; }
}
if (!existsSync('node_modules/next/dist/bin/next')) {
  console.error('Dependencies are missing. Run npm install once in this project folder.');
  process.exitCode = 1;
} else if (await ready()) {
  console.log(`Chennai Voice is already running: ${url}`);
  openBrowser();
} else {
  console.log('Starting Chennai Voice. Keep this window open while using the website.');
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--port', '3000'], { stdio: 'inherit' });
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    if (await ready()) { clearInterval(timer); openBrowser(); }
    checking = false;
  }, 2000);
  server.on('exit', code => { clearInterval(timer); process.exitCode = code ?? 1; });
  server.on('error', error => { clearInterval(timer); console.error(error.message); process.exitCode = 1; });
}
