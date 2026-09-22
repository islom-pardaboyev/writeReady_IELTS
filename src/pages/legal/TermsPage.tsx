import { Link } from "react-router";
import { LegalPage } from "./LegalPage";
import { IELTS_DISCLAIMER, LEGAL, TELEGRAM_CONTACT_URL } from "@/lib/legal";

const SECTIONS = [
  { id: "agreement", title: "This agreement" },
  { id: "what-it-is", title: "What WriteReady is" },
  { id: "not-ielts", title: "We are not IELTS" },
  { id: "accounts", title: "Your account" },
  { id: "centres", title: "Learning centre accounts" },
  { id: "plans", title: "Plans and what they include" },
  { id: "paying", title: "Paying" },
  { id: "refunds", title: "Payments are not refundable" },
  { id: "human-check", title: "Human Check" },
  { id: "your-work", title: "Your essays stay yours" },
  { id: "fair-use", title: "Fair use" },
  { id: "availability", title: "Availability and changes" },
  { id: "liability", title: "Our responsibility, and its limits" },
  { id: "ending", title: "Ending this agreement" },
  { id: "law", title: "Which law applies" },
  { id: "contact", title: "How to contact us" },
];

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The rules for using WriteReady: what you get, what you pay, and what each of us is responsible for."
      sections={SECTIONS}
    >
      <h2 id="agreement">1. This agreement</h2>
      <p>
        These terms are an agreement between you and <strong>{LEGAL.entity}</strong> ({LEGAL.address}), which runs{" "}
        {LEGAL.service} at {LEGAL.site}. By making an account or using the site you accept them. If you do not accept
        them, please do not use the site. Read the <Link to="/privacy">Privacy Policy</Link> too, because it is part of
        this agreement.
      </p>

      <h2 id="what-it-is">2. What WriteReady is</h2>
      <p>
        WriteReady gives you IELTS-style Writing prompts, a place to write, and feedback produced by artificial
        intelligence: sentence-level notes, vocabulary suggestions, and an <strong>estimated</strong> band score against
        the four public IELTS criteria.
      </p>
      <p>
        AI makes mistakes. The band estimate is a practice aid and a teaching tool, not a prediction of your real
        result, and no examiner has looked at your work unless you buy a Human Check. Do not treat anything here as a
        guarantee of the score you will get in a real test.
      </p>

      <h2 id="not-ielts">3. We are not IELTS</h2>
      <p>{IELTS_DISCLAIMER}</p>
      <p>
        Our prompts are written in the style of the exam, for practice. They are not copies of live exam papers, and
        nothing on this site gives you access to real exam questions.
      </p>

      <h2 id="accounts">4. Your account</h2>
      <ul>
        <li>Give a real email address, and keep your password to yourself.</li>
        <li>One account per person. Do not share a login with your friends or classmates.</li>
        <li>You are responsible for what happens under your account.</li>
        <li>Tell us if you think someone else has got in.</li>
      </ul>

      <h2 id="centres">5. Learning centre accounts</h2>
      <p>
        An IELTS learning centre can buy places and enrol its students. If your account came from a centre:
      </p>
      <ul>
        <li>the centre chose your plan, and you get that plan while its contract with us is running;</li>
        <li>when the contract ends, your account stays but drops to the free plan until the centre renews;</li>
        <li>the centre&apos;s staff can see your login, your name and how much you have practised, and can remove you from its list.</li>
      </ul>
      <p>A centre may only give places to its own students, and may not resell them.</p>

      <h2 id="plans">6. Plans and what they include</h2>
      <p>
        The free plan gives one AI feedback report each calendar week. Paid plans give a fixed number of AI reports each
        month. The exact number for each plan is shown on the <Link to="/pricing">Pricing</Link> page. Allowances do
        not roll over: an unused report does not move to next month.
      </p>
      <p>
        Prices are in Uzbek som (UZS) and are shown on the Pricing page. We can change prices, and we will publish the
        new price before it applies to you. A plan you have already paid for keeps its price until it ends.
      </p>

      <h2 id="paying">7. Paying</h2>
      <p>
        Payment is by transfer to the card shown at checkout. After you transfer, send the receipt to us on Telegram.
        Plans are activated by hand, normally <strong>within 24 hours</strong> of the receipt arriving. Plans do not
        renew automatically: when a month ends you decide whether to buy another.
      </p>

      <h2 id="refunds">8. Payments are not refundable</h2>
      <p>
        <strong>All payments are final.</strong> Once a plan is activated we do not refund it: not for reports you did
        not use, not for a month you were too busy to write in, and not if you change your mind. The same goes for money
        you add to your account balance and for a Human Check you have asked a teacher to do: once the teacher has your
        essay, that payment is spent. Your balance is for use on this site and is not paid back in cash.
      </p>
      <p>
        Two narrow exceptions, because it would not be fair otherwise. If you pay and we never activate the plan, you
        get that money back. If we close WriteReady while your plan is still running, you get back the part you have not
        used. Nothing here takes away a right your own country&apos;s consumer law gives you and does not let us sign
        away.
      </p>
      <p>
        The free plan gives one report a week, so you can try the AI feedback and see whether it suits you before you
        pay anything.
      </p>

      <h2 id="human-check">9. Human Check</h2>
      <p>
        A Human Check sends one essay to a teacher on this site, paid for from your balance. The teacher is an
        independent tutor, not our employee. We pass on your essay, your name and your email so they can mark it, and we
        keep a part of the price as a platform fee. Their opinion is their own, and it is still not an official IELTS
        score.
      </p>

      <h2 id="your-work">10. Your essays stay yours</h2>
      <p>
        You keep every right in what you write. You give us permission to store your essay and to send it to the AI
        provider and, if you ask for it, to the teacher you pick, only so that you can be given feedback. We do not
        publish your writing, sell it, or hand it to anyone else.
      </p>
      <p>
        The site itself, with its design, its code, its prompts and its explanations, belongs to us. Please do not copy
        it, scrape it or resell it.
      </p>

      <h2 id="fair-use">11. Fair use</h2>
      <p>While using WriteReady, do not:</p>
      <ul>
        <li>submit someone else&apos;s writing as your own to get it marked;</li>
        <li>upload anything unlawful, hateful or someone else&apos;s private information;</li>
        <li>try to break, overload or reverse-engineer the service, or get around plan limits;</li>
        <li>use automated tools to submit essays in bulk;</li>
        <li>share your account with other people to avoid paying.</li>
      </ul>
      <p>If you do, we may suspend or close the account.</p>

      <h2 id="availability">12. Availability and changes</h2>
      <p>
        We work to keep WriteReady up, but we cannot promise it will never be down. We may take it offline for
        maintenance, change features, or stop offering a feature. A short outage is not a reason for money back. If we
        close the service altogether, we will give notice and return the unused part of any plan that is still running,
        as section 8 says.
      </p>

      <h2 id="liability">13. Our responsibility, and its limits</h2>
      <p>
        We give the service as it is. We do not promise a particular IELTS result, and we are not responsible for what
        you decide based on an AI band estimate.
      </p>
      <p>
        If we cause you loss, our responsibility is limited to what you paid us in the 12 months before the problem. We
        do not limit responsibility for anything the law does not allow us to limit, for example death, personal injury
        or fraud caused by us.
      </p>

      <h2 id="ending">14. Ending this agreement</h2>
      <p>
        You can stop at any time and ask us to delete your account. We can end your access if you break these terms, or
        if we close the service. Deleting the account removes your profile, your reports and your submissions.
      </p>

      <h2 id="law">15. Which law applies</h2>
      <p>
        These terms follow the law of {LEGAL.country}, and the courts of {LEGAL.country} decide any dispute. If you live
        in a country whose consumer law gives you stronger rights, you keep those rights.
      </p>

      <h2 id="contact">16. How to contact us</h2>
      <p>
        Message us on Telegram at{" "}
        <a href={TELEGRAM_CONTACT_URL} target="_blank" rel="noopener noreferrer">@{LEGAL.telegram}</a>
        {LEGAL.email ? <> or write to <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></> : null}.
      </p>
    </LegalPage>
  );
}
