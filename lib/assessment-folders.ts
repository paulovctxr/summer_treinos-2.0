import type { AssessmentSummary } from './assessments.ts';

export function instructorKey(name: string) {
  return name.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
export function assessmentFolders(items: AssessmentSummary[]) {
  const folders = new Map<string, { key: string; name: string; total: number; drafts: number; published: number }>();
  for (const item of items) {
    const key = instructorKey(item.instructor);
    const folder = folders.get(key) || { key, name: item.instructor.trim().replace(/\s+/g, ' '), total: 0, drafts: 0, published: 0 };
    folder.total++; folder[item.status === 'draft' ? 'drafts' : 'published']++;
    folders.set(key, folder);
  }
  return [...folders.values()].sort((a,b) => !a.key ? 1 : !b.key ? -1 : a.name.localeCompare(b.name, 'pt-BR'));
}

// The existing API returns 30 summaries per page. Read every page before grouping,
// so a professor whose records are older does not disappear from the folder screen.
export async function allAssessmentSummaries(readPage: (offset: number) => Promise<AssessmentSummary[]>, active: () => boolean) {
  const items = new Map<string, AssessmentSummary>();
  for (let offset = 0; offset <= 100000 && active(); offset += 30) {
    const page = await readPage(offset);
    for (const item of page) items.set(item.id, item);
    if (page.length < 30) return [...items.values()];
  }
  if (!active()) return [];
  throw new Error('Não foi possível carregar todas as avaliações.');
}
