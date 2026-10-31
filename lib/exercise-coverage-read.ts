import { exerciseCoverage } from './exercise-coverage.ts';

/** Administrative maintenance only: never import this reader into a client component. */
export async function readExerciseCoverage(address: string, key: string, request: typeof fetch = fetch) {
  if (!address || !key) throw new Error('missing_configuration');
  const project = new URL(address);
  if (project.protocol !== 'https:' || project.username || project.password || project.search || project.hash) throw new Error('invalid_url');
  const records: unknown[] = [];
  const pageSize = 500;
  for (let offset = 0; ; ) {
    const url = new URL('/rest/v1/summer_fitness_state', project);
    url.searchParams.set('select', 'workouts:data->workouts');
    // A stable server-side ordering key; student identifiers are not selected.
    url.searchParams.set('order', 'user_id.asc');
    const response = await request(url, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: `${offset}-${offset + pageSize - 1}` },
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('invalid_response');
    const range = response.headers.get('content-range')?.match(/^(\d+)-(\d+)\/(\d+|\*)$/);
    if (rows.length && (!range || Number(range[1]) !== offset || Number(range[2]) - Number(range[1]) + 1 !== rows.length)) throw new Error('invalid_response');
    records.push(...rows);
    if (!rows.length) break;
    offset += rows.length;
    const total = range?.[3];
    if (total && total !== '*' && offset >= Number(total)) break;
  }
  const exercises = exerciseCoverage(records);
  return { returnedRecords: records.length, distinctNames: exercises.length, exercises };
}
