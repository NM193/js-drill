import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export async function writeDrill(docsDir, drill) {
  const dir = path.join(docsDir, 'drills');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${drill.id}.json`), `${JSON.stringify(drill, null, 2)}\n`, 'utf8');

  const indexPath = path.join(dir, 'index.json');
  let index = [];
  try {
    index = JSON.parse(await readFile(indexPath, 'utf8'));
  } catch {
    // prvi upis
  }

  const entry = {
    id: drill.id,
    createdAt: drill.createdAt,
    topic: drill.topic,
    lessonTitle: drill.lesson.title,
    taskTitle: drill.task.title,
  };
  index = [entry, ...index.filter((e) => e.id !== drill.id)];

  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
}

export async function commitAndPush(root, message) {
  await execFileAsync('git', ['add', 'docs/drills'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', message], { cwd: root });
  await execFileAsync('git', ['push', '--quiet'], { cwd: root });
}
