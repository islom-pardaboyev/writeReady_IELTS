import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// The title from index.html, kept for the home page because search results
// show it.
const HOME_TITLE = document.title;

type TitleFor = string | ((query: URLSearchParams) => string);

const ROUTE_TITLES: [RegExp, TitleFor][] = [
  [/^\/auth$/, (q) => (q.get('mode') === 'signup' ? 'Create your account' : q.get('mode') === 'student' ? 'Student sign in' : 'Sign in')],
  [/^\/dashboard$/, 'Dashboard'],
  [/^\/workspace\/[^/]+$/, 'Writing'],
  [/^\/feedback\/[^/]+$/, 'Feedback report'],
  [/^\/pricing$/, 'Pricing'],
  [/^\/account$/, 'My Account'],
  [/^\/writing\/mock$/, 'Mock Exam'],
  [/^\/writing\/practice$/, 'Practice Mode'],
  [/^\/writing\/relax$/, 'Relax Mode'],
  [/^\/writing\/quick$/, 'Quick Write'],
  [/^\/human-review\/[^/]+$/, 'Human Check'],
  // A blog post swaps in its own title once the post has loaded.
  [/^\/blog(\/[^/]+)?$/, 'IELTS Blog'],
  [/^\/admin$/, 'Admin'],
  [/^\/teacher-portal$/, 'Teacher portal'],
  [/^\/center-admin$/, 'Learning center portal'],
];

/** Names the browser tab after the page, e.g. "Dashboard | WriteReady IELTS". */
export function RouteTitle() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    const match = ROUTE_TITLES.find(([pattern]) => pattern.test(path));
    if (!match) {
      document.title = HOME_TITLE;
      return;
    }
    const [, titleFor] = match;
    const name = typeof titleFor === 'function' ? titleFor(new URLSearchParams(search)) : titleFor;
    document.title = `${name} | WriteReady IELTS`;
  }, [pathname, search]);

  return null;
}
