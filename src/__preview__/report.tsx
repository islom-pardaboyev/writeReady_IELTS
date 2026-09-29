// TEMPORARY preview harness. Renders the real FeedbackPage with made-up data,
// a fake user and every /api call blocked, so no AI call can happen. Delete
// this file and /preview-report.html after looking.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { User } from 'firebase/auth';
import '../index.css';
import { ThemeProvider } from '../contexts/ThemeContext';
import { AuthContext } from '../contexts/authContextDef';
import { FeedbackPage } from '../pages/FeedbackPage';
import { encodeReport } from '../lib/reportEncoding';

const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/api/')) return Promise.resolve(new Response('{"error":"preview"}', { status: 503 }));
  return realFetch(input, init);
};

const question =
  'Some people think that universities should provide graduates with the knowledge and skills needed in the workplace. Others think that the true function of a university should be to give access to knowledge for its own sake. Discuss both views and give your opinion.';

const S = [
  'Nowadays, many people think that universities should give students skills for their future job, while others believe that university is a place for getting knowledge for its own sake.',
  'In this essay I will discuss both views and give my opinion.',
  'On the one hand, there are a lot of people who think that the main goal of university is to prepare students for work because the job market is very competitive and employers want graduates who already have practical skills and can start working without a long training period which costs companies a lot of money and time.',
  'For example, in Uzbekistan many graduates can not find a job because they only know theory.',
  'This is a big problem for the young people.',
  'On the other hand, some people believe that knowledge is important itself.',
  'They say that subjects like history and philosophy teaches people to think critically, and this is good thing for society, it also helps people to understand the world better.',
  'If universities only focus on jobs, this subjects might disappear.',
  'In my opinion, universities should do both of this things.',
  'They should teach practical skills, but they should not forget about knowledge for its own sake, because it makes people more educated and more good citizens.',
  'In conclusion, although practical skills is very important for students, universities also has a responsibility to give knowledge which is not connected to jobs.',
];
const essay = `${S[0]} ${S[1]}\n\n${S[2]} ${S[3]} ${S[4]}\n\n${S[5]} ${S[6]} ${S[7]}\n\n${S[8]} ${S[9]}\n\n${S[10]}`;

const report = {
  taskType: 'Task 2',
  topic: 'Education',
  wordCount: 262,
  limited: false,
  scores: { taskAchievement: 6, coherenceCohesion: 6, lexicalResource: 5.5, grammaticalRangeAccuracy: 5.5, overall: 6 },
  feedback: {
    taskAchievement: { strengths: ['Both views are discussed and a clear opinion is given.'], issues: ['The second view has no concrete example.'] },
    coherenceCohesion: { strengths: ['Clear paragraphs with one view in each.'], issues: ['"This" and "this things" often do not say what they refer to.'] },
    lexicalResource: { strengths: ['Topic words like "critically" and "competitive" are used correctly.'], issues: ['Vague words such as "big problem" and "more good" are repeated.'] },
    grammaticalRangeAccuracy: { strengths: ['A correct conditional sentence in paragraph 3.'], issues: ['Frequent subject-verb agreement mistakes (subjects teaches, skills is).'] },
  },
  priorityFixes: [
    'Fix subject-verb agreement: "subjects teach", "skills are", "universities have".',
    'Split long sentences so each one carries one idea.',
    'Replace vague words ("big problem", "more good") with precise ones.',
  ],
  readability: {
    summary: 'The essay is mostly easy to follow, but a few long sentences and an unclear "this" make the reader slow down.',
    tips: [
      {
        problem: 'This sentence carries four ideas at once, so the main point is lost before the end.',
        original: 'the main goal of university is to prepare students for work because the job market is very competitive and employers want graduates who already have practical skills',
        clearer: 'Many people think the main goal of a university is to prepare students for work. The job market is highly competitive, and employers want graduates who can start without long, costly training.',
      },
      {
        problem: 'Two separate points are joined with commas, so it is hard to see where one ends and the next begins.',
        original: S[6],
        clearer: 'Subjects such as history and philosophy teach people to think critically. This benefits society and helps people understand the world better.',
      },
      {
        problem: '"Both of this things" does not say which two things, so the reader has to look back to find them.',
        original: S[8],
        clearer: 'In my opinion, universities should both prepare students for work and offer knowledge for its own sake.',
      },
    ],
  },
  bandGapAnalysis: 'To reach Band 6.5, fix the repeated agreement errors, give an example for the second view, and use more precise topic vocabulary.',
  sampleResponse: 'Universities are increasingly expected to produce job-ready graduates, yet many argue that their true purpose is the pursuit of knowledge itself. ...',
  sentenceAnalysis: [
    { sentence: S[0], type: 'word_choice', feedback: '"Skills for their future job" is vague; name the kind of skills.', improved: 'Many people believe universities should equip students with employability skills, while others see them as places to pursue knowledge for its own sake.' },
    { sentence: S[1], type: 'ok', feedback: 'A clear, simple outline of the essay.', improved: S[1] },
    { sentence: S[2], type: 'structure', feedback: 'Too many ideas in one sentence; split it.', improved: 'Many people think the main goal of a university is to prepare students for work. Employers want graduates who can start without long, costly training.' },
    { sentence: S[3], type: 'grammar', feedback: '"can not" is written as one word: "cannot".', improved: 'In Uzbekistan, for example, many graduates cannot find work because they have never put theory into practice.' },
    { sentence: S[4], type: 'word_choice', feedback: '"A big problem" is vague, and "the" is not needed before a general group.', improved: 'This is a serious concern for young people.' },
    { sentence: S[5], type: 'word_choice', feedback: '"Important itself" is not natural English.', improved: 'On the other hand, some people believe that knowledge is valuable in its own right.' },
    { sentence: S[6], type: 'grammar', feedback: '"Subjects teaches" should be "subjects teach", and the comma joins two sentences.', improved: 'Subjects such as history and philosophy teach people to think critically. This benefits society and helps people understand the world better.' },
    { sentence: S[7], type: 'grammar', feedback: '"This subjects" should be "these subjects".', improved: 'If universities focus only on jobs, these subjects might be sidelined.' },
    { sentence: S[8], type: 'coherence', feedback: '"This things" should be "these things", and it is unclear which things.', improved: 'In my opinion, universities should strike a balance between job skills and knowledge for its own sake.' },
    { sentence: S[9], type: 'grammar', feedback: '"More good" should be "better".', improved: 'They should teach practical skills without neglecting broader knowledge, because it produces better-informed citizens.' },
    { sentence: S[10], type: 'grammar', feedback: '"Skills is" and "universities has" need plural verbs.', improved: 'In conclusion, although practical skills are very important, universities also have a responsibility to offer knowledge that is not tied to jobs.' },
  ],
  vocabulary: [
    { word: 'employability skills', uzbek: "ishga yaroqlilik ko'nikmalari", english: "The practical abilities that help a graduate get and keep a job. Instead of: 'skills for their future job'", exampleFromEssay: 'Many people think universities should give students the employability skills they need for their first job.' },
    { word: 'put theory into practice', uzbek: "nazariyani amalda qo'llash", english: "To use what you learned in real work. Instead of: 'they only know theory'", exampleFromEssay: 'In Uzbekistan, many graduates cannot find work because they have never put theory into practice.' },
    { word: 'a serious concern', uzbek: 'jiddiy muammo', english: "A problem people are worried about. Instead of: 'a big problem'", exampleFromEssay: 'This is a serious concern for young people.' },
    { word: 'valuable in its own right', uzbek: "o'z-o'zidan qimmatli", english: "Useful for its own sake, not only for what it leads to. Instead of: 'important itself'", exampleFromEssay: 'Some people believe that knowledge is valuable in its own right.' },
    { word: 'foster critical thinking', uzbek: 'tanqidiy fikrlashni rivojlantirmoq', english: "To help people learn to question and judge ideas. Instead of: 'teaches people to think critically'", exampleFromEssay: 'Subjects such as history and philosophy foster critical thinking.' },
    { word: 'be sidelined', uzbek: 'chetga surilmoq', english: "To be treated as less important. Instead of: 'disappear'", exampleFromEssay: 'If universities focus only on jobs, these subjects might be sidelined.' },
    { word: 'strike a balance between', uzbek: "... o'rtasida muvozanat topmoq", english: "To give fair weight to two things. Instead of: 'do both of this things'", exampleFromEssay: 'Universities should strike a balance between job skills and knowledge for its own sake.' },
    { word: 'well-informed citizens', uzbek: 'yaxshi xabardor fuqarolar', english: "People who know a lot about the world around them. Instead of: 'more good citizens'", exampleFromEssay: 'Broader knowledge produces well-informed citizens.' },
  ],
  grammar: [
    { point: 'Subject-verb agreement with plural subjects', explanation: 'You wrote "subjects ... teaches", "practical skills is" and "universities also has". A plural subject needs a plural verb: subjects teach, skills are, universities have.', example: 'Although practical skills are very important, universities also have a responsibility to offer broader knowledge.' },
    { point: '"These", not "this", before plural nouns', explanation: 'You wrote "this subjects" and "this things". Use "this" with one thing and "these" with more than one.', example: 'If universities focus only on jobs, these subjects might disappear.' },
    { point: 'Joining two sentences with only a comma', explanation: 'In "this is good thing for society, it also helps..." two full sentences are joined by a comma. Use a full stop, or a linking word such as "and".', example: 'This is a good thing for society. It also helps people understand the world better.' },
    { point: 'Articles before singular nouns', explanation: 'You wrote "this is good thing". A singular countable noun needs "a" or "the" in front of it.', example: 'This is a good thing for society.' },
    { point: 'Comparatives: "better", not "more good"', explanation: 'You wrote "more good citizens". "Good" has its own comparative form: better.', example: 'It makes people more educated and better citizens.' },
    { point: 'Concession with "while" (missing from your essay)', explanation: 'You never show both sides in one sentence. "While ..." lets you accept one view and still give your own, which raises Grammatical Range.', example: 'While practical skills matter, universities should not forget knowledge for its own sake.' },
  ],
};

const id = encodeReport({ task2: { report: question }, task1: null, userText1: '', userText2: essay });
// Newer reports say which grammar points are the student's own mistakes and
// which are structures to add, each with the sentence it came from; the
// Grammar tab groups them under "Mistakes to fix" and "Structures to add".
const GRAMMAR_SOURCE: ['mistake' | 'add', number][] = [['mistake', 10], ['mistake', 7], ['mistake', 6], ['mistake', 6], ['mistake', 9], ['add', 9]];
const grammar = report.grammar.map((g, i) => ({ ...g, kind: GRAMMAR_SOURCE[i][0], yours: S[GRAMMAR_SOURCE[i][1]] }));

// ?free shows the report a free student gets: the bands only.
sessionStorage.setItem(`feedback_${id}_task2`, JSON.stringify({ ...report, grammar, limited: new URLSearchParams(location.search).has('free') }));
localStorage.setItem('theme', new URLSearchParams(location.search).has('dark') ? 'dark' : 'light');

const fakeUser = { uid: 'preview', email: 'preview@example.com', displayName: 'Preview', getIdToken: async () => 'preview' } as unknown as User;
const noop = async () => {};
const auth = {
  user: fakeUser,
  profile: { uid: 'preview', email: 'preview@example.com', plan: 'premium' as const, subscriptionExpiresAt: null, createdAt: new Date() },
  loading: false,
  signIn: async () => 'signed-in' as const, signInWithGoogle: noop, logOut: noop, refreshProfile: noop, updateDisplayName: noop, changePassword: noop,
};

const tab = new URLSearchParams(location.search).get('tab');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[`/feedback/${id}${tab ? `?tab=${tab}` : ''}`]}>
          <Routes>
            <Route path="/feedback/:id" element={<FeedbackPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>
  </StrictMode>,
);
