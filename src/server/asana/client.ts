/**
 * Minimal Asana REST client: reads the side hustle project, its tasks and their stories.
 * Read-only. Needs ASANA_TOKEN (a personal access token) in the server's environment.
 */
import { ASANA } from './config'
import type { AsanaData, RawProject, RawStory, RawTask } from './build'

const BASE = 'https://app.asana.com/api/1.0'

const PROJECT_FIELDS = 'name,created_at,members.name,members.email,members.photo.image_60x60'
const TASK_FIELDS = [
  'name',
  'notes',
  'created_at',
  'created_by.name',
  'completed',
  'completed_at',
  'assignee.name',
  'memberships.project.name',
  'memberships.section.name',
  'custom_fields.display_value',
  'custom_fields.number_value',
  'custom_fields.date_value',
  'custom_fields.enum_value.name',
  'permalink_url',
  'modified_at',
  'parent.name',
].join(',')
const STORY_FIELDS =
  'created_at,created_by.name,resource_subtype,type,text,new_section.name,old_section.name'

export class AsanaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

async function get<T>(path: string, token: string): Promise<{ data: T; next?: string }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null
    throw new AsanaError(body?.errors?.[0]?.message ?? `Asana answered ${res.status}`, res.status)
  }
  const json = (await res.json()) as { data: T; next_page?: { offset?: string } | null }
  return { data: json.data, next: json.next_page?.offset ?? undefined }
}

async function all<T>(path: string, token: string): Promise<T[]> {
  const out: T[] = []
  let offset: string | undefined
  do {
    const sep = path.includes('?') ? '&' : '?'
    const page = await get<T[]>(`${path}${sep}limit=100${offset ? `&offset=${offset}` : ''}`, token)
    out.push(...page.data)
    offset = page.next
  } while (offset)
  return out
}

/**
 * Reads everything the dashboard needs. Stories are only fetched again for
 * tasks whose `modified_at` changed since the previous read (comments and
 * section moves both bump it).
 */
export class AsanaReader {
  private storyCache = new Map<string, { modifiedAt: string; stories: RawStory[] }>()

  constructor(private token: string) {}

  async read(): Promise<AsanaData> {
    const p = ASANA.projectGid
    const [{ data: project }, tasks] = await Promise.all([
      get<RawProject>(`/projects/${p}?opt_fields=${PROJECT_FIELDS}`, this.token),
      all<RawTask>(`/projects/${p}/tasks?opt_fields=${TASK_FIELDS}`, this.token),
    ])
    // The ledger is a completed task in the project, so it's in `tasks` too.
    const stale = tasks.filter(
      (t) => this.storyCache.get(t.gid)?.modifiedAt !== (t.modified_at ?? ''),
    )
    const fetched = await mapLimit(stale, 5, async (t) => ({
      gid: t.gid,
      modifiedAt: t.modified_at ?? '',
      stories: await all<RawStory>(
        `/tasks/${t.gid}/stories?opt_fields=${STORY_FIELDS}`,
        this.token,
      ),
    }))
    for (const f of fetched)
      this.storyCache.set(f.gid, { modifiedAt: f.modifiedAt, stories: f.stories })
    const live = new Set(tasks.map((t) => t.gid))
    for (const gid of this.storyCache.keys()) if (!live.has(gid)) this.storyCache.delete(gid)
    const stories = Object.fromEntries([...this.storyCache].map(([gid, c]) => [gid, c.stories]))
    return { project, tasks, stories }
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}
