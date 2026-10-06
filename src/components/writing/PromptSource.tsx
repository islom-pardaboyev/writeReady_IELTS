import { PROMPT_SOURCES } from "@/lib/promptSources";

/**
 * Credit for the question bank, under the question in Mock, Practice and
 * Quick Write. Quiet on purpose: it should be there, not draw the eye.
 * Relax does not show it, because the student brings their own question.
 */
export function PromptSource() {
  return (
    <p className="mt-6 text-[11px] italic text-slate-400 dark:text-neutral-500">
      Source from:{" "}
      {PROMPT_SOURCES.map((s, i) => (
        <span key={s.name}>
          {i > 0 && " / "}
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline focus-visible:underline"
          >
            {s.name}
          </a>
        </span>
      ))}
    </p>
  );
}
