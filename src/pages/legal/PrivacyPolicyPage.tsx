import { LegalPage } from "./LegalPage";
import { LEGAL, TELEGRAM_CONTACT_URL } from "@/lib/legal";

const SECTIONS = [
  { id: "who-we-are", title: "Who we are" },
  { id: "what-we-collect", title: "What we collect" },
  { id: "essays", title: "Your essays and feedback" },
  { id: "why", title: "Why we use it" },
  { id: "who-sees-it", title: "Who else sees it" },
  { id: "storage", title: "Cookies and browser storage" },
  { id: "payments", title: "Payments" },
  { id: "where", title: "Where your data is kept" },
  { id: "how-long", title: "How long we keep it" },
  { id: "your-rights", title: "Your choices and rights" },
  { id: "centres", title: "If a learning centre gave you your account" },
  { id: "children", title: "Students under 18" },
  { id: "security", title: "Security" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "How to contact us" },
];

export function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What WriteReady collects when you practise IELTS Writing here, who else sees it, and how to get it deleted."
      sections={SECTIONS}
    >
      <h2 id="who-we-are">1. Who we are</h2>
      <p>
        {LEGAL.service} is an IELTS Writing practice site at {LEGAL.site}. It is run from {LEGAL.country} by{" "}
        <strong>{LEGAL.entity}</strong>. We decide what happens to the information described here, so in data-protection
        language we are the controller of it.
      </p>

      <h2 id="what-we-collect">2. What we collect</h2>
      <p>We only collect what the site needs to work. That is:</p>
      <table>
        <thead>
          <tr>
            <th>What</th>
            <th>When it reaches us</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Your email address and password</td>
            <td>When you create an account. Your password is held by the sign-in service we use, not by us — we never see it.</td>
          </tr>
          <tr>
            <td>Your name and profile picture</td>
            <td>If you sign in with Google, Google passes us your name, email and picture.</td>
          </tr>
          <tr>
            <td>Your essays, prompts and any chart you upload</td>
            <td>Every time you submit work for feedback.</td>
          </tr>
          <tr>
            <td>Your AI feedback reports and band estimates</td>
            <td>When the AI finishes checking your essay.</td>
          </tr>
          <tr>
            <td>How many checks you have used this month or week</td>
            <td>Automatically, so your plan limit can be counted.</td>
          </tr>
          <tr>
            <td>Your plan, plan end date and account balance in UZS</td>
            <td>When you buy a plan, top up, or a learning centre adds you.</td>
          </tr>
          <tr>
            <td>Messages you send to the assistant chatbot</td>
            <td>When you use the chat bubble.</td>
          </tr>
          <tr>
            <td>Bug reports and ratings you send us</td>
            <td>When you use the feedback button, and automatically when a page crashes. A crash report includes the page address, your browser version and the error.</td>
          </tr>
        </tbody>
      </table>
      <p>
        We do <strong>not</strong> run advertising trackers, and we do not sell anything about you to anyone.
      </p>

      <h2 id="essays">3. Your essays and feedback</h2>
      <p>
        Your essay is the heart of this service, so it is worth being exact about what happens to it. When you ask for
        feedback, the text of your essay and its prompt are sent to <strong>an artificial-intelligence company outside
        {LEGAL.country}</strong>, which writes the feedback and the band estimate. The result comes back to us and is
        saved to your account so you can open it again later.
      </p>
      <p>
        That company processes your text to answer that one request, and under the terms we have with it your essay is
        not used to train its models. Messages you type into the chat bubble go to a different AI company, also outside
        {LEGAL.country}. If you want to know exactly which companies these are, ask us and we will tell you.
      </p>
      <p>
        If you ask for a Human Check, the essay you choose is also shown to the teacher you pick, together with your
        name and email, so they can mark it and send the correction back.
      </p>

      <h2 id="why">4. Why we use it</h2>
      <ul>
        <li>To give you an account and keep you signed in.</li>
        <li>To produce your feedback and keep your history of reports.</li>
        <li>To count your monthly or weekly allowance so plans work.</li>
        <li>To take payment for a plan and to activate it.</li>
        <li>To fix crashes and answer the questions you send us.</li>
        <li>To show a learning centre how its own students are doing, if a centre enrolled you.</li>
      </ul>
      <p>
        The legal basis, where that idea applies, is the contract between you and us for most of it, our legitimate
        interest in keeping the service working and safe for crash reports and security, and your consent for anything
        you send us voluntarily.
      </p>

      <h2 id="who-sees-it">5. Who else sees it</h2>
      <p>
        These are the kinds of companies that handle your information for us so the site can run. Each one may only use
        it to do that job, and nothing else. If you want their names, ask us and we will tell you.
      </p>
      <table>
        <thead>
          <tr>
            <th>Kind of company</th>
            <th>What it does for us</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>A cloud database and sign-in provider</td>
            <td>Holds your account, your essays, your reports and your plan.</td>
          </tr>
          <tr>
            <td>An artificial-intelligence provider</td>
            <td>Writes the AI feedback on the essay you submit.</td>
          </tr>
          <tr>
            <td>A second artificial-intelligence provider</td>
            <td>Answers your messages in the chat bubble.</td>
          </tr>
          <tr>
            <td>A website hosting provider</td>
            <td>Hosts the site and keeps short server logs, which include IP addresses.</td>
          </tr>
          <tr>
            <td>Telegram</td>
            <td>Carries messages between you and our staff, including bug reports, teacher notifications and payment receipts you send.</td>
          </tr>
        </tbody>
      </table>
      <p>
        We also give data to people, not only companies: the teacher you choose for a Human Check, and the staff of your
        learning centre if one enrolled you. Beyond that we share nothing, unless a court or the law of {LEGAL.country}{" "}
        requires it.
      </p>

      <h2 id="storage">6. Cookies and browser storage</h2>
      <p>
        We use no advertising or analytics cookies. What the site stores in your browser is what it needs to work:
      </p>
      <ul>
        <li>
          <strong>Sign-in.</strong> Our sign-in provider keeps your session so you are not asked to sign in on every
          page.
        </li>
        <li>
          <strong>Your settings.</strong> Light or dark theme, your keyboard shortcuts, and which announcements you have
          already seen.
        </li>
        <li>
          <strong>Staff sessions.</strong> If you are a teacher, a centre or an admin, the panel remembers you are
          signed in.
        </li>
      </ul>
      <p>
        None of this is shared with anyone, and all of it stays on your own device. Clearing your browser data removes
        it and signs you out.
      </p>
      <p>
        One thing to know about our blog: some articles show a cover picture that is loaded from the website it came
        from. When your browser fetches that picture, that website can see your IP address, the same as if you had
        visited it. We do not control what those sites record.
      </p>

      <h2 id="payments">7. Payments</h2>
      <p>
        We do not take card payments on the site and we never see your card details. You transfer the amount yourself
        using your bank or payment app, then send a screenshot of the receipt to us on Telegram. That screenshot, and
        whatever else you write in that chat, is held by Telegram under its own privacy policy. We record only which
        plan you bought, when it was activated and your balance in UZS.
      </p>

      <h2 id="where">8. Where your data is kept</h2>
      <p>
        The providers listed above keep data on servers outside {LEGAL.country}. Using the site means your information
        is sent to and stored in those countries.
      </p>
      <p>
        If you are in the European Union or the United Kingdom, this is a transfer outside your region, and our
        providers rely on standard contractual clauses for it.
      </p>

      <h2 id="how-long">9. How long we keep it</h2>
      <ul>
        <li>Your account and your reports: until you ask us to delete them.</li>
        <li>Crash reports and feedback messages: kept while they are still useful for fixing the problem.</li>
        <li>Payment records: kept while the plan runs and afterwards for our accounts.</li>
      </ul>
      <p>
        When we delete your account we remove your profile, your feedback reports, your submissions, your Human Check
        requests and your notifications.
      </p>

      <h2 id="your-rights">10. Your choices and rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>send you a copy of what we hold about you;</li>
        <li>correct anything that is wrong;</li>
        <li>delete your account and its contents;</li>
        <li>stop using your data for something you object to.</li>
      </ul>
      <p>
        Write to us on Telegram at <a href={TELEGRAM_CONTACT_URL} target="_blank" rel="noopener noreferrer">@{LEGAL.telegram}</a>{" "}
        and we will answer within 30 days. You can change your name and password yourself on the Account page at any
        time. If you think we have handled your data badly, you may complain to the data-protection authority in your
        country.
      </p>

      <h2 id="centres">11. If a learning centre gave you your account</h2>
      <p>
        Some students are enrolled by an IELTS learning centre. If that is you, be aware that:
      </p>
      <ul>
        <li>the centre created your login and set your first password, and its staff can see both;</li>
        <li>the centre can see your name, how many checks you have used and how active you have been;</li>
        <li>your plan lasts as long as the centre&apos;s contract with us, and ends when that contract ends;</li>
        <li>the centre can remove you from its list, which takes away the access it gave you.</li>
      </ul>
      <p>The centre is responsible for how it uses what it sees. Your essays themselves are not shown to it.</p>

      <h2 id="children">12. Students under 18</h2>
      <p>
        IELTS candidates are often school age. If you are under 18, please use WriteReady with a parent, guardian or
        teacher who agrees to this policy on your behalf. We do not knowingly collect anything from a child under 13. If
        you believe a child under 13 has an account here, tell us and we will remove it.
      </p>

      <h2 id="security">13. Security</h2>
      <p>
        Sign-in is handled by a specialist provider, not by us. Access to your reports is limited by security rules to
        your own account and to staff who need it. No service is perfectly safe, so please use a password you do not use
        anywhere else, and tell us straight away if you think someone else is in your account.
      </p>

      <h2 id="changes">14. Changes to this policy</h2>
      <p>
        When we change this page we update the date at the top. If a change matters to you — for example a new company
        processing your essays — we will say so on the site rather than quietly editing the text.
      </p>

      <h2 id="contact">15. How to contact us</h2>
      <p>
        The fastest way to reach a person is Telegram:{" "}
        <a href={TELEGRAM_CONTACT_URL} target="_blank" rel="noopener noreferrer">@{LEGAL.telegram}</a>
        {LEGAL.email ? <> or by email at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></> : null}. We are
        {" "}{LEGAL.entity}, {LEGAL.address}.
      </p>
    </LegalPage>
  );
}
