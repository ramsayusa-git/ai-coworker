/**
 * The shared list-page query contract: ?q=&sort=&dir=&page=
 *
 * Lives outside the client component so Server Components can parse the same
 * params they render the table with.
 */
export function listParams(
  searchParams: Record<string, string | string[] | undefined>,
  defaults: { sort?: string; dir?: 'asc' | 'desc'; pageSize?: number } = {},
) {
  const get = (k: string) => {
    const v = searchParams[k]
    return Array.isArray(v) ? v[0] : v
  }
  const pageSize = defaults.pageSize ?? 50
  const page = Math.max(1, Number(get('page') ?? 1) || 1)
  return {
    q: (get('q') ?? '').trim(),
    sort: get('sort') ?? defaults.sort ?? 'id',
    dir: (get('dir') ?? defaults.dir ?? 'desc') === 'asc' ? ('asc' as const) : ('desc' as const),
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  }
}
