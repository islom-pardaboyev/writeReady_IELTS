import type { ReactNode } from "react";
import { Link } from "react-router";
import { PLAN_INFO } from "@/lib/plans";
import { LEGAL, TELEGRAM_CONTACT_URL } from "@/lib/legal";
import { FREE_WEEKLY_LIMIT } from "@/lib/weeklyFree";

/**
 * Every question the site answers, in one place, so the short list on the home
 * page and the full page at /faq can never tell people different things.
 *
 * `plain` repeats the answer as text with no markup: it is what goes into the
 * FAQPage structured data for search engines, which cannot read JSX.
 */
export interface Qa {
  q: string;
  /** Kept as plain text as well, so search engines get the same answer the reader sees. */
  plain: string;
  /** Shown in the short list on the home page as well as on /faq. */
  home?: boolean;
  a: ReactNode;
}

export interface Group {
  title: string;
  items: Qa[];
}

const uzs = (n: number) => `${n.toLocaleString("en-US")} UZS`;

export const GROUPS: Group[] = [
  {
    title: "Getting started",
    items: [
      {
        q: "What is WriteReady?",
        plain:
          "WriteReady is an IELTS Writing practice site. You get exam-style Task 1 and Task 2 prompts, a place to write, and AI feedback on what you wrote: sentence-by-sentence notes, vocabulary suggestions with Uzbek meanings, and an estimated band score against the four IELTS criteria.",
        a: (
          <>
            An IELTS Writing practice site. You get exam-style Task 1 and Task 2 prompts, a place to write, and AI
            feedback on what you wrote: sentence-by-sentence notes, vocabulary suggestions with Uzbek meanings, and an
            estimated band score against the four IELTS criteria.
          </>
        ),
      },
      {
        q: "Why is this better than just asking ChatGPT?",
        home: true,
        plain:
          "Ask ChatGPT for a band score and it will give you one. It marks against whatever you paste in, and it forgets the essay you wrote last week. WriteReady sends your essay with the official IELTS Writing band descriptors and the best-fit method examiners are trained to use, plus wording that stops the model putting everybody on Band 7, and we test that prompt against reference essays so the marking does not drift. Every full report comes back in the same shape: each sentence reviewed in order, up to 15 better words and up to 10 grammar points taken from your own essay (the words with Uzbek meanings), a band 8 to 9 answer to your exact question, and the three fixes worth doing first. Two reports a month apart can be compared, so you can see whether you improved. Around that you get exam-style prompts, a 60-minute timer, every report saved and downloadable, and a teacher you can pay to check the same essay. The colours, the spacing and the type are chosen so your eye lands on what matters first and an hour of practice does not wear you out.",
        a: (
          <>
            <p>
              Ask ChatGPT for a band score and it will give you one. It marks against whatever you paste in, and it
              forgets the essay you wrote last week.
            </p>
            <p>
              WriteReady sends your essay with the <strong>official IELTS Writing band descriptors</strong> and the
              best-fit method examiners are trained to use, plus wording that stops the model putting everybody on
              Band 7. We test that prompt against reference essays, so the marking does not drift when we change
              something.
            </p>
            <p>
              Every full report comes back in the same shape: each sentence reviewed in order, up to 15 better
              words and up to 10 grammar points taken from your own essay (the words with Uzbek meanings), a band 8 to 9 answer to your exact question, and the three fixes worth doing
              first. Two reports a month apart can be compared, so you can see whether you improved.
            </p>
            <p>
              Around that you get exam-style prompts, a 60-minute timer, every report saved and downloadable, and a
              teacher you can pay to check the same essay. The colours, the spacing and the type are chosen so your eye
              lands on what matters first and an hour of practice does not wear you out.
            </p>
          </>
        ),
      },
      {
        q: "Is this the official IELTS test?",
        plain:
          "No. WriteReady is not connected to the British Council, IDP or Cambridge, and the band score you see is an estimate produced by AI, not an official result. Use it to practise and to find your weak points, not to predict your exam score.",
        a: (
          <>
            No. WriteReady is not connected to the British Council, IDP or Cambridge, and the band score you see is an
            estimate produced by AI, not an official result. Use it to practise and to find your weak points, not to
            predict your exam score. The full wording is in the <Link to="/terms#not-ielts">Terms of Service</Link>.
          </>
        ),
      },
      {
        q: "Do I need to pay to try it?",
        home: true,
        plain: `No. Every account gets ${FREE_WEEKLY_LIMIT} free AI feedback report each week, with no card needed. One report covers one essay, so if you sit a full mock exam you choose whether to mark Task 1 or Task 2. The free report gives you the four band scores. The sentence-by-sentence notes, the vocabulary, the grammar points and the sample answer come with a paid plan. The free allowance starts again every Monday.`,
        a: (
          <>
            No. Every account gets <strong>{FREE_WEEKLY_LIMIT} free AI feedback report each week</strong>, with no card
            needed. One report covers <strong>one essay</strong>, so if you sit a full mock exam you choose whether to
            mark Task 1 or Task 2. The free report gives you the four band scores. The sentence-by-sentence notes, the
            vocabulary, the grammar points and the sample answer come with a paid plan. The free allowance starts again
            every Monday.
          </>
        ),
      },
      {
        q: "What are the four practice modes?",
        home: true,
        plain:
          "Mock Exam runs a 60-minute timer over both tasks, like the real test. Practice has no timer, so you can work at your own pace. Quick Write gives you one random task for a short daily session. Relax lets you paste your own prompt and upload your own chart.",
        a: (
          <ul>
            <li>
              <strong>Mock Exam</strong>: a 60-minute timer over both tasks, like the real test.
            </li>
            <li>
              <strong>Practice</strong>: no timer, work at your own pace.
            </li>
            <li>
              <strong>Quick Write</strong>: one random task, good for a short daily session.
            </li>
            <li>
              <strong>Relax</strong>: paste your own prompt and upload your own chart.
            </li>
          </ul>
        ),
      },
    ],
  },
  {
    title: "Plans and payment",
    items: [
      {
        q: "What do the paid plans include?",
        home: true,
        plain: `Basic is ${uzs(PLAN_INFO.basic.monthlyPriceUZS)} a month for ${PLAN_INFO.basic.monthlyAnalyses} AI reports. Standard is ${uzs(PLAN_INFO.standard.monthlyPriceUZS)} for ${PLAN_INFO.standard.monthlyAnalyses}. Premium is ${uzs(PLAN_INFO.premium.monthlyPriceUZS)} for ${PLAN_INFO.premium.monthlyAnalyses}. Every paid plan gives the same full report; only the number of reports a month changes.`,
        a: (
          <>
            <ul>
              <li>
                <strong>Basic</strong>: {uzs(PLAN_INFO.basic.monthlyPriceUZS)} a month, {PLAN_INFO.basic.monthlyAnalyses} AI reports.
              </li>
              <li>
                <strong>Standard</strong>: {uzs(PLAN_INFO.standard.monthlyPriceUZS)} a month, {PLAN_INFO.standard.monthlyAnalyses} AI reports.
              </li>
              <li>
                <strong>Premium</strong>: {uzs(PLAN_INFO.premium.monthlyPriceUZS)} a month, {PLAN_INFO.premium.monthlyAnalyses} AI reports.
              </li>
            </ul>
            Every paid plan gives the same full report. Only the number of reports a month changes. See{" "}
            <Link to="/pricing">Pricing</Link>.
          </>
        ),
      },
      {
        q: "How do I pay?",
        plain:
          "Transfer the amount to the card shown at checkout, then send a screenshot of the receipt on Telegram. Your plan is switched on by hand, normally within 24 hours. Nothing renews automatically, so you are never charged without deciding to pay again.",
        a: (
          <>
            Transfer the amount to the card shown at checkout, then send a screenshot of the receipt on Telegram. Your
            plan is switched on by hand, normally <strong>within 24 hours</strong>. Nothing renews automatically, so you
            are never charged without deciding to pay again.
          </>
        ),
      },
      {
        q: "Can I get my money back?",
        plain:
          "No. Payments are final: we do not refund reports you did not use or a month you were too busy to write in. The two exceptions are if we take your money and never switch the plan on, or if we close the site while your plan is still running. That is why the free weekly report exists, so you can try it before you pay.",
        a: (
          <>
            No. Payments are final: we do not refund reports you did not use, or a month you were too busy to write in.
            The two exceptions are if we take your money and never switch the plan on, or if we close the site while your
            plan is still running. That is why the free weekly report exists, so you can try it before you pay. Full wording
            in the{" "}
            <Link to="/terms#refunds">Terms of Service</Link>.
          </>
        ),
      },
      {
        q: "Do unused reports carry over to next month?",
        plain: "No. Each month starts again at your plan's number, and anything you did not use is gone.",
        a: <>No. Each month starts again at your plan&apos;s number, and anything you did not use is gone.</>,
      },
      {
        q: "If a report fails, do I lose it?",
        plain:
          "No. If the AI report fails or comes back cut off, the site puts that report back on your account by itself. Send the same essay again and it is not counted twice.",
        a: (
          <>
            No. If the AI report fails or comes back cut off, the site puts that report back on your account by itself.
            Send the same essay again and it is not counted twice.
          </>
        ),
      },
    ],
  },
  {
    title: "Feedback and marking",
    items: [
      {
        q: "Is it as accurate as a real IELTS examiner?",
        home: true,
        plain:
          "It is not an examiner, and we will not pretend otherwise. What it does do is mark with the official IELTS Writing band descriptors, follow the same best-fit method examiners are trained to use, and point to real evidence in your essay for every band it awards. That makes the score explainable: you can see which sentence cost you a mark. Treat it as a well-argued second opinion, not as your exam result.",
        a: (
          <>
            <p>
              It is not an examiner, and we will not pretend otherwise. What it does do is mark with the{" "}
              <strong>official IELTS Writing band descriptors</strong>, follow the same best-fit method examiners are
              trained to use, and point to real evidence in your essay for every band it awards.
            </p>
            <p>
              That is what makes the score useful: you can see which sentence cost you a mark, instead of being handed a
              number. Treat it as a well-argued second opinion, not as your exam result. If you want a person to look at
              it, use Human Check.
            </p>
          </>
        ),
      },
      {
        q: "How accurate is the band score?",
        plain:
          "It is an estimate. The AI marks against the four public IELTS criteria and explains why it gave each score, which makes it useful for spotting weak points. It is not an examiner, and real examiners sometimes disagree with each other too. Treat a half band either way as normal.",
        a: (
          <>
            It is an estimate. The AI marks against the four public IELTS criteria (task achievement, coherence and
            cohesion, lexical resource, grammatical range and accuracy) and explains why it gave each score, which is
            what makes it useful. It is not an examiner. Treat half a band either way as normal.
          </>
        ),
      },
      {
        q: "Can a real teacher check my essay?",
        home: true,
        plain:
          "Yes. Human Check sends one essay to a teacher on the site, paid from your account balance. You see the price before you confirm, and you choose which teacher. The teacher sends back a marked document.",
        a: (
          <>
            Yes. <strong>Human Check</strong> sends one essay to a teacher on the site, paid from your account balance.
            You see the price before you confirm, and you pick the teacher yourself. They send back a marked document.
          </>
        ),
      },
      {
        q: "How long does my essay need to be?",
        plain:
          "The same as the real exam: at least 150 words for Task 1 and at least 250 for Task 2. The page counts as you type and tells you when you have enough.",
        a: (
          <>
            The same as the real exam: <strong>150 words</strong> for Task 1 and <strong>250 words</strong> for Task 2.
            The page counts as you type and tells you when you have enough.
          </>
        ),
      },
      {
        q: "Can I keep a copy of my feedback?",
        plain: "Yes. Every report can be downloaded as a PDF, and your past reports stay in your account.",
        a: <>Yes. Every report downloads as a PDF, and your past reports stay in your account.</>,
      },
      {
        q: "Is the feedback in Uzbek or English?",
        plain:
          "Both. The explanations are in English, and new vocabulary comes with its Uzbek meaning. Your essay itself must be in English, because that is what the exam marks.",
        a: (
          <>
            Both. The explanations are in English, and new vocabulary comes with its Uzbek meaning. Your essay itself has
            to be in English, because that is what the exam marks.
          </>
        ),
      },
    ],
  },
  {
    title: "Accounts and privacy",
    items: [
      {
        q: "My learning centre gave me an account. How does that work?",
        plain:
          "Your centre bought places and chose a plan for its students, so you get that plan for as long as its contract runs. When the contract ends your account stays and goes back to the free weekly report until the centre renews. Centre staff can see your name, your login and how much you have practised, but not the essays you write.",
        a: (
          <>
            Your centre bought places and chose a plan for its students, so you get that plan for as long as its contract
            runs. When the contract ends your account stays and goes back to the free weekly report until the centre
            renews. Centre staff can see your name, your login and how much you have practised, but not the essays you
            write.
          </>
        ),
      },
      {
        q: "Is my writing used to train AI?",
        home: true,
        plain:
          "No. Your essay is sent to an AI provider to produce your feedback and nothing else, and under the terms we have with that provider it is not used to train its models.",
        a: (
          <>
            No. Your essay goes to an AI provider to produce your feedback and nothing else, and under the terms we have
            with that provider it is not used to train its models. The detail is in the{" "}
            <Link to="/privacy#essays">Privacy Policy</Link>.
          </>
        ),
      },
      {
        q: "Can I delete my account?",
        plain:
          "Yes. Ask us on Telegram and we remove your profile, your feedback reports, your submissions and your notifications.",
        a: (
          <>
            Yes. Ask us on Telegram and we remove your profile, your feedback reports, your submissions and your
            notifications. See <Link to="/privacy#how-long">how long we keep data</Link>.
          </>
        ),
      },
      {
        q: "Does it work on a phone?",
        plain:
          "Yes, in a mobile browser. The writing screen stacks the question above your answer instead of side by side. For a full mock exam a laptop is closer to the real computer-based test.",
        a: (
          <>
            Yes, in a mobile browser. The writing screen stacks the question above your answer instead of side by side.
            For a full mock exam a laptop is closer to the real computer-based test.
          </>
        ),
      },
      {
        q: "Something is broken, or I have a question you have not answered.",
        plain: `Message us on Telegram at @${LEGAL.telegram}. There is also a feedback button inside the site for reporting a problem.`,
        a: (
          <>
            Message us on Telegram at{" "}
            <a href={TELEGRAM_CONTACT_URL} target="_blank" rel="noopener noreferrer">
              @{LEGAL.telegram}
            </a>
            . There is also a feedback button inside the site for reporting a problem.
          </>
        ),
      },
    ],
  },
];

/** Google reads this to show the questions directly in search results. */
export function faqJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: GROUPS.flatMap((g) =>
      g.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.plain },
      })),
    ),
  });
}

/** The handful a first-time visitor actually asks, for the home page. */
export const HOME_QUESTIONS: Qa[] = GROUPS.flatMap((g) => g.items).filter((item) => item.home);
