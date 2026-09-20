import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const mode = process.argv[2] ?? 'all';
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}. Fix the error above and rerun; downloads are cached.`);
}
if (mode !== 'assets') {
  if (!existsSync(python)) {
    const candidates = process.platform === 'win32' ? [['py', '-3'], ['python']] : [['python3'], ['python']];
    const found = candidates.find(([command, ...args]) => spawnSync(command, [...args, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)'], { stdio: 'ignore' }).status === 0);
    if (!found) throw new Error('Install Python 3.12, then rerun npm run setup.');
    run(found[0], [...found.slice(1), '-m', 'venv', path.join(root, '.venv')]);
  }
  if (mode === 'all') {
    run(python, ['-m', 'pip', 'install', '-r', 'scripts/requirements.txt']);
    run(python, ['scripts/download_connectome.py']);
  }
  run(python, ['scripts/preprocess_connectome.py', ...(process.argv.includes('--force') ? ['--force'] : [])]);
  run(process.execPath, ['--import', 'tsx', 'scripts/calibrate.ts'], web);
}
const assets = path.join(web, 'public', 'models');
mkdirSync(assets, { recursive: true });
cpSync(path.join(web, 'node_modules/@mediapipe/tasks-vision/wasm'), path.join(assets, 'wasm'), { recursive: true });
cpSync(path.join(web, 'node_modules/@mediapipe/tasks-vision/vision_bundle.js'), path.join(assets, 'vision_bundle.js'));
console.log('FlyTalk assets ready. Start the app with npm run dev in web/.');
