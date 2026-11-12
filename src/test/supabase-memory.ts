// In-memory stand-in for the shared kitchen tables, kept in (per-test) localStorage so a remount
// behaves like another browser loading the same shared kitchen.
type Row = Record<string, unknown>;
const load = (t: string): Row[] => JSON.parse(globalThis.localStorage?.getItem(`mock-db:${t}`) ?? "[]");
const save = (t: string, rows: Row[]) => globalThis.localStorage?.setItem(`mock-db:${t}`, JSON.stringify(rows));

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "upsert" = "select";
  let payload: Row | null = null;
  let ignoreDup = false;
  let single = false;
  const run = async () => {
    const rows = load(table);
    if (op === "insert") {
      const id = (rows.reduce((m, r) => Math.max(m, Number(r['id'] ?? 0)), 0) as number) + 1;
      rows.push({ id, ...payload }); save(table, rows); return { data: null, error: null };
    }
    if (op === "upsert") {
      const i = rows.findIndex((r) => r['id'] === payload!['id']);
      if (i < 0) rows.push({ ...payload }); else if (!ignoreDup) rows[i] = { ...rows[i], ...payload };
      save(table, rows); return { data: null, error: null };
    }
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    if (op === "update") { save(table, rows.map((r) => hit.includes(r) ? { ...r, ...payload } : r)); return { data: null, error: null }; }
    hit.sort((a, b) => Number(a['id']) - Number(b['id']));
    return { data: single ? hit[0] ?? null : hit, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b, order: () => b, limit: () => b,
    eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
    gt: (k: string, v: number) => { filters.push((r) => Number(r[k]) > v); return b; },
    lt: (k: string, v: number) => { filters.push((r) => Number(r[k]) < v); return b; },
    maybeSingle: () => { single = true; return b; },
    insert: (p: Row) => { op = "insert"; payload = p; return b; },
    update: (p: Row) => { op = "update"; payload = p; return b; },
    upsert: (p: Row, o?: { ignoreDuplicates?: boolean }) => { op = "upsert"; payload = p; ignoreDup = !!o?.ignoreDuplicates; return b; },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
  };
  return b;
}

export const memorySupabase = {
  from: (t: string) => query(t),
  channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  removeChannel: () => undefined,
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getUser: async () => ({ data: { user: null } }) },
  storage: { from: () => ({ createSignedUrl: async () => ({ data: null }), upload: async () => ({ error: null }) }) },
};
