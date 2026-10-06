/**
 * An in-memory stand-in for the Admin SDK's Firestore, enough of it for
 * scripts/test-samples.ts: documents, merges (deep, like Firestore's),
 * serverTimestamp / increment / delete, where / limit / select / count,
 * getAll, batches and transactions. Local development shares the live
 * database with the real site, so tests never touch it.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

const isPlain = (v: unknown): v is Data =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof FieldValue) && !(v instanceof Date);

function resolveValue(v: unknown, before: unknown): unknown {
  if (v instanceof FieldValue) {
    const operand = (v as unknown as { operand?: unknown }).operand;
    if (typeof operand === 'number') return (Number(before) || 0) + operand;
    if (v.isEqual(FieldValue.delete())) return DELETE;
    return Timestamp.now();
  }
  if (isPlain(v)) {
    const out: Data = {};
    for (const [k, inner] of Object.entries(v)) {
      const r = resolveValue(inner, isPlain(before) ? before[k] : undefined);
      if (r !== DELETE) out[k] = r;
    }
    return out;
  }
  return v;
}
const DELETE = Symbol('delete');

function deepMerge(base: Data, patch: Data): Data {
  const out: Data = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const r = resolveValue(v, base[k]);
    if (r === DELETE) delete out[k];
    else if (isPlain(r) && isPlain(base[k]) && isPlain(v)) out[k] = deepMerge(base[k] as Data, v);
    else out[k] = r;
  }
  return out;
}

const getPath = (data: Data | undefined, path: string): unknown =>
  path.split('.').reduce<unknown>((cur, key) => (isPlain(cur) ? cur[key] : undefined), data);

// structuredClone would turn a Timestamp into a plain object; Firestore hands back a Timestamp.
function clone<T>(v: T): T {
  if (Array.isArray(v)) return v.map(clone) as T;
  if (isPlain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)])) as T;
  return v;
}

export class FakeFirestore {
  tables = new Map<string, Map<string, Data>>();
  private autoId = 0;
  private queue: Promise<unknown> = Promise.resolve();

  table(name: string): Map<string, Data> {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  reset(): void {
    this.tables.clear();
  }

  doc(name: string, id: string) {
    const table = () => this.table(name);
    const snapshot = () => {
      const data = table().get(id);
      const copy = data ? clone(data) : undefined;
      return {
        id,
        exists: data !== undefined,
        ref,
        data: () => copy,
        get: (path: string) => getPath(copy, path),
      };
    };
    const ref = {
      id,
      path: `${name}/${id}`,
      get: async () => snapshot(),
      set: async (data: Data, options?: { merge?: boolean }) => {
        const before = table().get(id);
        table().set(id, options?.merge && before ? deepMerge(before, data) : deepMerge({}, data));
      },
      create: async (data: Data) => {
        if (table().has(id)) throw Object.assign(new Error(`ALREADY_EXISTS: ${name}/${id}`), { code: 6 });
        table().set(id, deepMerge({}, data));
      },
      update: async (data: Data) => {
        const before = table().get(id);
        if (!before) throw Object.assign(new Error(`NOT_FOUND: ${name}/${id}`), { code: 5 });
        table().set(id, deepMerge(before, data));
      },
      delete: async () => {
        table().delete(id);
      },
      snapshot,
    };
    return ref;
  }

  private query(name: string, filters: [string, string, unknown][], max = Infinity) {
    const comparable = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : v);
    const matches = (actual: unknown, op: string, wanted: unknown) => {
      const a = comparable(actual);
      const w = comparable(wanted);
      if (op === '==') return a === w;
      if (op === 'in') return (wanted as unknown[]).map(comparable).includes(a);
      if (a === undefined || a === null || typeof a !== typeof w) return false;
      const [x, y] = [a as number | string, w as number | string];
      if (op === '>') return x > y;
      if (op === '>=') return x >= y;
      if (op === '<') return x < y;
      if (op === '<=') return x <= y;
      throw new Error(`stand-in does not support ${op}`);
    };
    const found = () =>
      [...this.table(name).entries()]
        .filter(([, d]) => filters.every(([f, op, v]) => matches(getPath(d, f), op, v)))
        .slice(0, max);
    const q = {
      where: (field: string, op: string, value: unknown) => this.query(name, [...filters, [field, op, value]], max),
      limit: (n: number) => this.query(name, filters, n),
      select: (..._fields: string[]) => q,
      orderBy: () => q,
      get: async () => {
        const docs = found().map(([id]) => this.doc(name, id).snapshot());
        return { docs, empty: docs.length === 0, size: docs.length };
      },
      count: () => ({ get: async () => ({ data: () => ({ count: found().length }) }) }),
    };
    return q;
  }

  collection(name: string) {
    return {
      ...this.query(name, []),
      doc: (id?: string) => this.doc(name, id ?? `auto${String(++this.autoId).padStart(16, '0')}`),
      add: async (data: Data) => {
        const ref = this.doc(name, `auto${String(++this.autoId).padStart(16, '0')}`);
        await ref.set(data);
        return ref;
      },
    };
  }

  async getAll(...refs: ReturnType<FakeFirestore['doc']>[]) {
    return refs.map((r) => r.snapshot());
  }

  batch() {
    const writes: (() => Promise<void>)[] = [];
    const b = {
      set: (ref: ReturnType<FakeFirestore['doc']>, data: Data, options?: { merge?: boolean }) => {
        writes.push(() => ref.set(data, options));
        return b;
      },
      delete: (ref: ReturnType<FakeFirestore['doc']>) => {
        writes.push(() => ref.delete());
        return b;
      },
      commit: async () => {
        for (const w of writes) await w();
      },
    };
    return b;
  }

  /**
   * One transaction at a time, reads then writes, like Firestore's outcome.
   * A create() on a document that exists fails the whole transaction.
   */
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const run = async () => {
      const writes: { ref: ReturnType<FakeFirestore['doc']>; kind: 'set' | 'create' | 'update' | 'delete'; data?: Data; merge?: boolean }[] = [];
      const tx = {
        get: async (ref: ReturnType<FakeFirestore['doc']>) => ref.snapshot(),
        getAll: async (...refs: ReturnType<FakeFirestore['doc']>[]) => refs.map((r) => r.snapshot()),
        set: (ref: ReturnType<FakeFirestore['doc']>, data: Data, options?: { merge?: boolean }) => {
          writes.push({ ref, kind: 'set', data, merge: options?.merge });
        },
        create: (ref: ReturnType<FakeFirestore['doc']>, data: Data) => {
          writes.push({ ref, kind: 'create', data });
        },
        update: (ref: ReturnType<FakeFirestore['doc']>, data: Data) => {
          writes.push({ ref, kind: 'update', data });
        },
        delete: (ref: ReturnType<FakeFirestore['doc']>) => {
          writes.push({ ref, kind: 'delete' });
        },
      };
      const result = await fn(tx);
      for (const w of writes) {
        if (w.kind === 'create' && w.ref.snapshot().exists) throw Object.assign(new Error(`ALREADY_EXISTS: ${w.ref.path}`), { code: 6 });
      }
      for (const w of writes) {
        if (w.kind === 'set') await w.ref.set(w.data!, { merge: w.merge });
        else if (w.kind === 'create') await w.ref.create(w.data!);
        else if (w.kind === 'update') await w.ref.update(w.data!);
        else await w.ref.delete();
      }
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  /** Every document of a collection, as plain data with its id. */
  all(name: string): (Data & { id: string })[] {
    return [...this.table(name).entries()].map(([id, d]) => ({ id, ...clone(d) }));
  }

  put(name: string, id: string, data: Data): void {
    this.table(name).set(id, deepMerge({}, data));
  }
}
