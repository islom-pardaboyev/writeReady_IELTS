/**
 * Stands in for the `re2js` package in the browser build (vite.config.ts).
 *
 * Firestore imports re2js (about 300 KB) at load time, but calls it only to
 * evaluate the regex and LIKE functions of Firestore Pipelines, which this
 * site does not use. Every one of those calls is wrapped in a try/catch that
 * turns an error into "no match", so this stub fails safely if one ever runs.
 */
export const RE2JS = {
  compile(): never {
    throw new Error('re2js is not bundled: Firestore Pipelines are not used on this site.');
  },
};
