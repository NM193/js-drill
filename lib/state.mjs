import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

const EMPTY_STATE = { runCount: 0, pending: null, history: [] };

export async function loadState(root) {
  try {
    return { ...EMPTY_STATE, ...JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8')) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function saveState(root, state) {
  await writeFile(path.join(root, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function log(root, line) {
  await appendFile(path.join(root, 'drill.log'), `${new Date().toISOString()} ${line}\n`, 'utf8');
}
