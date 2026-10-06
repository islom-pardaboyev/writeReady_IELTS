import { useEffect, useState } from 'react';
import {
  EMBEDDED_DATA_ID, QUESTION_INDEX_PATH, SITE_URL, questionDataPath,
  type QuestionIndexData, type QuestionPageData, type QuestionTask,
} from '@/lib/questionData';

/**
 * Where the question pages get their data: from the page itself on the first
 * visit (the build embeds it next to the static HTML), and from the static
 * JSON files under /question-data/ when a student moves between pages.
 * Neither touches Firestore.
 */

interface Embedded {
  path: string;
  kind: 'index' | 'question';
  data: unknown;
}

let embedded: Embedded | null | undefined;

function readEmbedded(): Embedded | null {
  if (embedded !== undefined) return embedded;
  try {
    const text = document.getElementById(EMBEDDED_DATA_ID)?.textContent;
    embedded = text ? (JSON.parse(text) as Embedded) : null;
  } catch {
    embedded = null;
  }
  return embedded;
}

const cache = new Map<string, unknown>();

type Load<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'missing' } | { state: 'error' };

function useStatic<T>(url: string | null, kind: Embedded['kind'], pathname: string): Load<T> {
  const fromPage = (() => {
    const e = readEmbedded();
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    return e && e.kind === kind && e.path === path ? (e.data as T) : undefined;
  })();
  const initial: Load<T> = fromPage !== undefined
    ? { state: 'ready', data: fromPage }
    : url && cache.has(url) ? { state: 'ready', data: cache.get(url) as T } : url ? { state: 'loading' } : { state: 'missing' };
  const [load, setLoad] = useState<{ key: string; value: Load<T> }>({ key: `${kind}:${pathname}`, value: initial });
  const current = load.key === `${kind}:${pathname}` ? load.value : initial;

  useEffect(() => {
    if (!url || current.state !== 'loading') return;
    let live = true;
    const key = `${kind}:${pathname}`;
    fetch(url)
      .then(async (res) => {
        if (res.status === 404) return { state: 'missing' } as const;
        if (!res.ok) throw new Error(String(res.status));
        // An unknown slug is answered with the app shell, not JSON.
        if (!(res.headers.get('content-type') ?? '').includes('json')) return { state: 'missing' } as const;
        const data = (await res.json()) as T;
        cache.set(url, data);
        return { state: 'ready', data } as const;
      })
      .then((value) => live && setLoad({ key, value }))
      .catch(() => live && setLoad({ key, value: { state: 'error' } }));
    return () => { live = false; };
  }, [url, kind, pathname, current.state]);

  return current;
}

export function useQuestionIndex(pathname: string): Load<QuestionIndexData> {
  return useStatic<QuestionIndexData>(QUESTION_INDEX_PATH, 'index', pathname);
}

export function useQuestionPage(taskType: string | undefined, slug: string | undefined, pathname: string): Load<QuestionPageData> {
  const valid = (taskType === 'task1' || taskType === 'task2') && !!slug && /^[a-z0-9-]{1,80}$/.test(slug);
  return useStatic<QuestionPageData>(valid ? questionDataPath(taskType as QuestionTask, slug!) : null, 'question', pathname);
}

/** Keeps the tab title, description and canonical address right while moving between pages in the app. */
export function useHead(title: string | null, description: string | null, path: string): void {
  useEffect(() => {
    if (!title) return;
    const undo: (() => void)[] = [];
    const set = (selector: string, attr: string, value: string) => {
      const el = document.head.querySelector(selector);
      if (!el) return;
      const before = el.getAttribute(attr);
      el.setAttribute(attr, value);
      undo.push(() => (before === null ? el.removeAttribute(attr) : el.setAttribute(attr, before)));
    };
    document.title = title;
    if (description) set('meta[name="description"]', 'content', description);
    set('link[rel="canonical"]', 'href', `${SITE_URL}${path}`);
    // Other pages keep the site's own description and canonical address.
    return () => undo.reverse().forEach((fn) => fn());
  }, [title, description, path]);
}
