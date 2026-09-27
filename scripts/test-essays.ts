/**
 * Reference essays for scripts/compare-band-scores.ts.
 *
 * Every expected band below is set by matching the essay against the official
 * IELTS wording in scripts/ielts-official-band-descriptors.md (public version,
 * updated May 2023) — not by opinion. The `because` line quotes the descriptor
 * phrase that decides it, so you can check the call yourself and overrule it.
 *
 * Expectations are per criterion, because that is where scoring drift shows up.
 * A model can read Task Response correctly and still inflate Lexical Resource,
 * and an overall-band-only comparison hides exactly that.
 *
 * Replace these with real student essays whose bands you already know. Essays
 * from your own students are worth far more than mine.
 */

export interface Expected {
  /** Task Achievement (Task 1) / Task Response (Task 2) */
  ta: number;
  /** Coherence & Cohesion */
  cc: number;
  /** Lexical Resource */
  lr: number;
  /** Grammatical Range & Accuracy */
  gra: number;
}

export interface TestEssay {
  id: string;
  taskType: 'Task 1' | 'Task 2';
  expected: Expected;
  /** The official descriptor phrases that decide each band, or, for a
   *  human-marked essay, the errors the marker still accepted at that band. */
  because: string;
  /** Who set the expected bands, when a real person marked the essay. Left
   *  out where the bands were set from the descriptors alone. */
  markedBy?: string;
  question: string;
  essay: string;
}

/** Official IELTS rounding: mean of the four criteria, .25 and .75 round up. */
export function expectedOverall(e: Expected): number {
  const sumN = [e.ta, e.cc, e.lr, e.gra].map((s) => Math.round(s * 2)).reduce((a, b) => a + b, 0);
  const r = sumN % 4;
  const nearestInt =
    r === 0 ? sumN / 4 :
    r === 1 ? (sumN - 1) / 4 :
    r === 2 ? (sumN + 2) / 4 :
    (sumN + 1) / 4;
  return nearestInt / 2;
}

export const TEST_ESSAYS: TestEssay[] = [
  {
    id: 'weak',
    taskType: 'Task 2',
    // official overall 5.0 (mean 4.875 -> .875 rounds to 5.0)
    expected: { ta: 5, cc: 5, lr: 5, gra: 4.5 },
    because:
      'TR 5: "main ideas are put forward, but they are limited and are not sufficiently developed" + "there may be some repetition". ' +
      'CC 5: "organisation is evident but is not wholly logical" + "sentences are not fluently linked to each other". ' +
      'LR 5: "limited but minimally adequate" — "simple vocabulary may be used accurately but the range does not permit much variation". ' +
      'GRA 4.5: errors are systematic, not occasional ("I am agree", "many student", "for pay"), which sits below Band 5.',
    question:
      'Some people believe that university education should be free for everyone. To what extent do you agree or disagree?',
    essay: `I am agree that university education should be free for everyone. There is many reason for this and I will explain them in my essay.

First reason is money. Many student don't have money for pay university. Their family is poor and they can not afford it. So they can not study and they stay poor. This is not good for them and not good for country also. If education is free then everybody can study and everybody can get good job.

Second reason is that country need educated people. Doctor, engineer, teacher, all of them study in university. If university is expensive, less people study, and country have less doctor and less engineer. This is bad problem.

Some people say that free education is too expensive for government. Maybe this is true. But government spend money for many things, so they can spend for education too. Education is more important than other things.

In conclusion, I am agree that university should be free because poor student can study and country need educated people. I think government must make university free for everyone.`,
  },
  {
    id: 'middle',
    taskType: 'Task 2',
    // official overall 7.0 — mean is 6.75, and IELTS rounds .75 UP, so this
    // essay is a 7.0 even though no single criterion reaches 7 on its own
    expected: { ta: 7, cc: 7, lr: 6.5, gra: 6.5 },
    because:
      'TR 7: "the main parts of the prompt are appropriately addressed" with "a clear and developed position", but ideas "may over-generalise". ' +
      'CC 7: "logically organised and there is a clear progression"; cohesive devices are used flexibly. ' +
      'LR 6.5: above "generally adequate" (Band 6) but short of Band 7\'s "some ability to use less common or idiomatic items" — the range is competent, not adventurous. ' +
      'GRA 6.5: "a mix of simple and complex sentence forms" handled well, but not yet Band 7\'s "frequent error-free sentences" throughout.',
    question:
      'Some people think that children should begin learning a foreign language at primary school rather than secondary school. Do the advantages outweigh the disadvantages?',
    essay: `It is often argued that foreign language teaching should start in primary school instead of secondary school. In my opinion, the benefits of an early start clearly outweigh the drawbacks, although some difficulties should be recognised.

The main advantage is that young children acquire languages more naturally than teenagers. At a young age, learners absorb pronunciation and grammar patterns without consciously analysing them, which is why children who move abroad usually speak like native speakers within a few years. Starting at eleven or twelve means students must memorise rules instead, and this makes progress slower and less enjoyable. Furthermore, an early start simply gives more years of exposure, and language learning depends heavily on time spent using the language.

Another benefit is cultural. Children who learn another language early also learn that other ways of living exist, and they tend to become more open-minded adults. In a world where people work internationally, this attitude is nearly as valuable as the language itself.

There are, however, some disadvantages. Primary schools often lack teachers who speak the language well, so pupils may learn incorrect pronunciation that is hard to correct later. In addition, adding another subject to a crowded timetable may reduce the time available for reading and mathematics, which some parents consider more important.

Despite these concerns, I believe the advantages are stronger. The problems described are practical ones which can be solved by training teachers properly, whereas the benefit of learning during the best years for language acquisition cannot be recovered later. Therefore schools should introduce foreign languages in the primary years.`,
  },
  {
    id: 'strong',
    taskType: 'Task 2',
    // official overall 8.5 (mean 8.625 -> rounds to 8.5)
    expected: { ta: 8.5, cc: 8.5, lr: 9, gra: 8.5 },
    because:
      'TR 8.5: "appropriately and sufficiently addressed" with "a clear and well-developed position" and ideas "well extended and supported"; both parts of the two-part question are answered, but the social-effects paragraph is slightly lighter than the rest. ' +
      'CC 8.5: "the message can be followed with ease", "logically sequenced", "paragraphing used sufficiently and appropriately". ' +
      'LR 9: "full flexibility and precise use" — "wide range used accurately and appropriately with very natural and sophisticated control" ("structural", "quietly extended", "erodes the social fabric"). ' +
      'GRA 8.5: "a wide range of structures is flexibly and accurately used" and "the majority of sentences are error-free"; short of Band 9 only because the range, while wide, is not fully effortless throughout.',
    question:
      'In many countries, people are working longer hours than in the past. What are the causes of this trend, and what effects does it have on individuals and society?',
    essay: `The steady lengthening of the working day in many developed economies is often blamed on individual ambition, but its roots are structural. Two forces in particular have reshaped how long people stay at their desks, and the consequences reach well beyond the office.

The first cause is the collapse of the boundary that technology was supposed to protect. Email and messaging platforms were sold as efficiency tools, yet by making employees reachable at any hour they quietly extended the working day into the evening. A manager who once left unfinished business on a desk now carries it home in a pocket. The second cause is economic insecurity. As permanent contracts have given way to short-term and freelance arrangements, visible overwork has become a form of insurance: employees who fear being cut stay late to demonstrate their value, and once a few do so, the rest follow simply to avoid standing out.

The effects on individuals are well documented and largely negative. Chronic overwork is associated with cardiovascular disease, disturbed sleep and depression, and the irony is that productivity per hour falls sharply beyond roughly fifty hours a week. People are therefore sacrificing their health to produce work of diminishing value. The damage to family life is subtler but no less real, since the hours surrendered are precisely those that would otherwise be spent with children or ageing parents.

At the social level, the consequences are mixed. Longer hours may raise output in the short term, but they impose costs that societies eventually absorb through health systems and lost caring capacity. Countries that have experimented with shorter weeks, notably Iceland, found that output held steady while wellbeing improved markedly — evidence that long hours reflect cultural habit rather than economic necessity.

In short, the trend stems from technological intrusion and job insecurity rather than personal choice, and while it may appear to benefit employers, it steadily erodes the health and social fabric on which any productive economy ultimately depends.`,
  },

  /* ── Human-marked essays ─────────────────────────────────────────────────
   * The bands below come from a person, not from the descriptors. They matter
   * most here because they show how many errors a real marker lets through at
   * Band 7 and 8. Do not also paste these into the prompt as examples: a test
   * essay the model has already seen marked proves nothing.                 */
  {
    id: 'school-purpose',
    taskType: 'Task 2',
    // mean 7.5
    expected: { ta: 8, cc: 7, lr: 8, gra: 7 },
    markedBy: 'a teacher with IELTS Band 9.0 (bands supplied 2026-09-27)',
    because:
      'GRA 7 was given with slips in about half the sentences: "student’ personal development", "be a self-employed", "teach them doing exercises", "children’ artistic talents", no comma before a sentence-level "which". ' +
      'LR 8 was given despite loose choices such as "professions such as accountants" and "common job positions". ' +
      'TR 8 was given to an "I completely disagree" position whose conclusion also grants school a role for work ("vital for both personal and professional lives").',
    question:
      'Some people think the main purpose of school is to turn children into good citizens and workers, rather than to benefit them as individuals. To what extent do you agree or disagree?',
    essay: `It is often argued that the main objective of schools is preparing students for the professional workplace and for being responsible citizens. I completely disagree with this view as the school curriculum consists of subjects that benefit student’ personal development.

Some believe that a school is an educational setting that prepares future employees. In other words, many subjects in the syllabus are relevant to different professions such as accountants, teachers, doctors and other common job positions. Therefore, it is believed that school graduates primarily learn only professional skills that are necessary for employment. Furthermore, there are some core subjects such as law and culture which teach schoolchildren how to become a better citizen by explaining civic values of a country.

However, I believe the main aim of schools is to prepare students for life whether they work in a company or be a self-employed. Students at school can learn a wide range of skills that can be beneficial in all walks of life which means it is not limited to just gaining professional knowledge for work or society. While art lessons, for instance, nurture children’ artistic talents and creativity, physical education classes teach them doing exercises in the right way and lead a healthy lifestyle. Hence, school education is not only necessary for work purposes but it is also essential for personal development.

In conclusion, school is considered a place to prepare workers and good citizens, but it has a crucial role in students’ personal development and way of life. I think school education is vital for both personal and professional lives of graduates.`,
  },
  {
    id: 'cultural-objects',
    taskType: 'Task 2',
    // mean 7.75, which IELTS rounds up to 8.0
    expected: { ta: 8, cc: 8, lr: 8, gra: 7 },
    markedBy: 'a teacher with IELTS Band 9.0 (bands supplied 2026-09-27)',
    because:
      'GRA 7 was given with errors in 6 of 12 sentences: only small slips in three ("some of cultural objects", "have all facilities", "the British museum and Louvre") and real errors in three (a "which" clause that is hard to follow, "where these cultural objects were taken", a comma splice with "even if British Museum return"). ' +
      'CC 8 was given despite two loosely used linkers: "However" with no contrast before it, and "In other words" opening a new point. ' +
      'LR 8 was given despite "reconcile their relationships" and "at risk of ruin". ' +
      'TR 8 was given to a partly-agree position with one sweeping claim ("only foreign artefacts").',
    question:
      'Important cultural objects should be returned to their countries of origin. To what extent do you agree or disagree?',
    essay: `It is often argued that countries should return cultural artifacts to their home countries. While I agree that these historical objects should be repatriated, I believe international museums may play a key role in preserving them.

Historical objects are considered national identity as they represent traditions, beliefs and history. However, some of cultural objects were stolen illegally from their home countries, during colonisation. For instance, the British Museum is claimed to include only foreign artefacts from countries such as India and Nigeria which were taken from other countries in the wartime. By returning them countries can reconcile their relationships with other countries where these cultural objects were taken. If all of these artifacts were displayed in their local museums, it would boost national pride and tourism.

However, global museums have all facilities to preserve these artefacts. In other words, some countries may lack funding or necessary equipment to keep these artifacts intact, thereby putting these historical objects at risk of ruin. Take Nigeria as an example, even if British Museum return their historical artifacts, the government of Nigeria may not be able to preserve these objects as the British Museum does. Moreover, some museums such as the British museum and Louvre are visited by millions of tourists annually which means they can improve cross-cultural understanding and serve as global museums.

To conclude, although it is morally right to return historical objects to their home countries, not all of them should be returned because of practical and educational reasons.`,
  },
];
