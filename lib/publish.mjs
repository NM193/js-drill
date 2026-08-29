import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const NTFY_SERVER = process.env.NTFY_SERVER ?? 'https://ntfy.sh';

export const lessonPayload = (drill) => ({
  title: `Lekcija: ${drill.lesson.title}`,
  message: drill.lesson.body,
  tags: ['book'],
  priority: 3,
});

export const taskPayload = (drill, siteUrl) => ({
  title: `Zadatak: ${drill.task.title}`,
  message: drill.task.brief,
  tags: ['brain'],
  priority: 4,
  actions: [{ action: 'view', label: 'Resi', url: `${siteUrl}?d=${drill.id}`, clear: false }],
});

// task?.title ?? title - stara pending vezba iz prethodne sheme ne sme da srusi
// prvi run posle migracije.
export const solutionPayload = (drill) => ({
  title: `Resenje: ${drill.task?.title ?? drill.title}`,
  message: `${drill.answer}\n\n${drill.explanation}`,
  tags: ['white_check_mark'],
  priority: 2,
});

// JSON publishing umesto HTTP headera - headeri lome UTF-8, JSON body ne.
export async function push(payload, topic) {
  if (!topic) throw new Error('NTFY_TOPIC nije postavljen');

  const res = await fetch(NTFY_SERVER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, ...payload }),
  });

  if (!res.ok) throw new Error(`ntfy ${res.status}: ${await res.text()}`);
}

export async function notifyMac(title, message) {
  if (process.platform !== 'darwin') return;
  const clean = (s) => s.replace(/["\\]/g, "'").replace(/\n/g, ' ').slice(0, 180);
  await execFileAsync('osascript', [
    '-e', `display notification "${clean(message)}" with title "${clean(title)}"`,
  ]).catch(() => {});
}
