import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import type { Submission, SentenceFeedback, VocabUpgrade } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

async function getSubmission(id: string): Promise<Submission | null> {
  const snap = await getDoc(doc(db, 'submissions', id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    uid: d.uid,
    questionId: d.questionId,
    questionText: d.questionText,
    essayText: d.essayText,
    mode: d.mode,
    feedback: d.feedback,
    createdAt: d.createdAt?.toDate?.() ?? new Date(),
  } as Submission;
}

export function FeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const locked = searchParams.get('locked') === 'true';
  useAuth();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    getSubmission(id).then((s) => {
      setSubmission(s);
      setLoading(false);
    });
  }, [id]);

  const handleExportPDF = async () => {
    if (!submission?.feedback) return;
    setExporting(true);
    const fb = submission.feedback;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const margin = 18;
    const lineW = pageW - margin * 2;
    let y = 20;

    const addText = (text: string, fontSize: number, bold = false, color: [number, number, number] = [26, 34, 48]) => {
      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setTextColor(...color);
      const lines = pdf.splitTextToSize(text, lineW) as string[];
      if (y + lines.length * (fontSize * 0.4) > 270) { pdf.addPage(); y = 20; }
      pdf.text(lines, margin, y);
      y += lines.length * (fontSize * 0.4) + 3;
    };

    const addSpacer = (h = 5) => { y += h; };

    pdf.setFillColor(28, 58, 94);
    pdf.rect(0, 0, pageW, 18, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('WriteReady IELTS — Essay Feedback', margin, 12);
    y = 28;

    addText('Question', 11, true, [100, 110, 130]);
    addText(submission.questionText, 10);
    addSpacer(4);

    addText('Your Essay', 11, true, [100, 110, 130]);
    addText(submission.essayText, 10);
    addSpacer(6);

    pdf.setDrawColor(200, 196, 187);
    pdf.line(margin, y, pageW - margin, y);
    addSpacer(6);

    addText(`Estimated Band Score: ${fb.bandEstimate}`, 16, true, [28, 58, 94]);
    addSpacer(4);

    addText('Overall Summary', 12, true);
    addText(fb.overallSummary, 10);
    addSpacer(6);

    addText('Task Achievement', 12, true);
    addText(fb.taskAchievementNotes, 10);
    addSpacer(6);

    addText('Sentence-by-sentence Feedback', 12, true);
    fb.sentenceFeedback.forEach((s, i) => {
      if (s.type === 'ok') return;
      addText(`${i + 1}. "${s.original}"`, 10, false, [26, 34, 48]);
      if (s.correction) addText(`  ✓ Correction: ${s.correction}`, 9, false, [224, 101, 75]);
      if (s.explanation) addText(`  ${s.explanation}`, 9, false, [107, 114, 128]);
      addSpacer(2);
    });
    addSpacer(4);

    addText('Vocabulary Upgrades', 12, true);
    fb.vocabUpgrades.forEach((v) => {
      addText(`${v.word}`, 10, true, [217, 164, 65]);
      addText(`  O'zbek: ${v.uzbekMeaning} · English: ${v.englishMeaning}`, 9, false, [107, 114, 128]);
      addText(`  Example: "${v.exampleSentence}"`, 9);
      addSpacer(2);
    });
    addSpacer(4);

    addText('Model Paragraph', 12, true);
    addText(fb.modelParagraph, 10);

    pdf.save(`WriteReady_Feedback_${new Date().toISOString().slice(0, 10)}.pdf`);
    setExporting(false);
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading feedback…</div>
      </Layout>
    );
  }

  if (!submission) {
    return (
      <Layout>
        <div style={{ padding: '4rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Submission not found.</p>
          <Link to="/dashboard"><Button>Back to Dashboard</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ padding: '2.5rem 0', minHeight: 'calc(100vh - 120px)' }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <Link to="/dashboard" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>← Dashboard</Link>
              <h1 style={{ fontSize: '1.75rem', marginTop: '0.5rem' }}>Essay Feedback</h1>
            </div>
            {submission.feedback && (
              <Button onClick={handleExportPDF} loading={exporting} variant="secondary">
                ⬇ Download PDF
              </Button>
            )}
          </div>

          {/* Locked state for free users */}
          {locked && (
            <Card
              style={{
                background: 'var(--ink-blue)',
                textAlign: 'center',
                padding: '3rem',
                marginBottom: '2rem',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
              <h2 style={{ color: 'white', fontFamily: 'Fraunces, serif', marginBottom: '0.75rem' }}>
                AI Feedback is a Pro Feature
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem', maxWidth: 440, margin: '0 auto 1.5rem' }}>
                Your essay has been saved. Upgrade to Pro to unlock sentence-by-sentence feedback, vocabulary upgrades, band score estimates, and PDF export.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to="/pricing">
                  <Button style={{ background: 'var(--gold)' } as React.CSSProperties} size="lg">
                    Upgrade to Pro — 25,000 UZS/mo
                  </Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="secondary" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.35)' } as React.CSSProperties}>
                    Back to Dashboard
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* Essay submitted */}
          <Card style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: '0.75rem', fontSize: '1.125rem' }}>
              The Question
            </h3>
            <p style={{ fontFamily: 'Georgia, serif', lineHeight: 1.8, color: 'var(--slate)', fontSize: '0.9375rem' }}>
              {submission.questionText}
            </p>
          </Card>

          {submission.feedback ? (
            <div ref={feedbackRef} className="fade-in">
              {/* Band score */}
              <div
                style={{
                  background: 'var(--ink-blue)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem',
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  color: 'white',
                }}
              >
                <p style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem' }}>
                  Estimated Band Score
                </p>
                <div
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '5rem',
                    fontWeight: 500,
                    color: 'var(--gold)',
                    lineHeight: 1,
                    marginBottom: '1rem',
                  }}
                >
                  {submission.feedback.bandEstimate.toFixed(1)}
                </div>
                <p style={{ color: 'rgba(255,255,255,0.8)', maxWidth: 500, margin: '0 auto', lineHeight: 1.7, fontSize: '0.9375rem' }}>
                  {submission.feedback.overallSummary}
                </p>
              </div>

              {/* Task achievement */}
              <Card style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: '0.75rem', fontSize: '1.125rem' }}>
                  Task Achievement
                </h3>
                <p style={{ color: 'var(--slate)', lineHeight: 1.75, fontSize: '0.9375rem' }}>
                  {submission.feedback.taskAchievementNotes}
                </p>
              </Card>

              {/* Sentence-by-sentence */}
              <Card style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: '1rem', fontSize: '1.125rem' }}>
                  Sentence-by-Sentence Annotations
                </h3>
                <div
                  style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: '1.0625rem',
                    lineHeight: 2,
                    color: 'var(--slate)',
                  }}
                >
                  {submission.feedback.sentenceFeedback.map((sf, i) => (
                    <SentenceBlock key={i} sf={sf} />
                  ))}
                </div>
              </Card>

              {/* Vocab upgrades */}
              {submission.feedback.vocabUpgrades.length > 0 && (
                <Card style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: '1rem', fontSize: '1.125rem' }}>
                    Vocabulary Upgrades
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                    {submission.feedback.vocabUpgrades.map((v, i) => (
                      <VocabCard key={i} vocab={v} />
                    ))}
                  </div>
                </Card>
              )}

              {/* Model paragraph */}
              <Card>
                <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: '0.75rem', fontSize: '1.125rem' }}>
                  Model Paragraph
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  A stronger version of your response, showing how to apply the suggestions above.
                </p>
                <div
                  style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: '1.0625rem',
                    lineHeight: 2,
                    color: 'var(--slate)',
                    borderLeft: '3px solid var(--gold)',
                    paddingLeft: '1.25rem',
                    background: 'rgba(217,164,65,0.04)',
                    borderRadius: '0 var(--radius) var(--radius) 0',
                    padding: '1rem 1rem 1rem 1.25rem',
                  }}
                >
                  {submission.feedback.modelParagraph}
                </div>
              </Card>
            </div>
          ) : !locked ? (
            <Card style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ color: 'var(--text-muted)' }}>No AI feedback was generated for this submission.</p>
            </Card>
          ) : null}

          {/* Your essay */}
          <Card style={{ marginTop: '1.5rem' }}>
            <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: '0.75rem', fontSize: '1.125rem' }}>
              Your Essay
            </h3>
            <p
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: '1.0625rem',
                lineHeight: 2,
                color: 'var(--slate)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {submission.essayText}
            </p>
          </Card>

          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Link to="/dashboard">
              <Button variant="secondary">← Try another question</Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function SentenceBlock({ sf }: { sf: SentenceFeedback }) {
  const [open, setOpen] = useState(false);
  const hasNote = sf.type !== 'ok' && (sf.correction || sf.explanation);

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <span
        style={{
          textDecoration: sf.type === 'grammar' || sf.type === 'coherence' ? 'underline wavy var(--coral)' : undefined,
          textDecorationThickness: sf.type === 'grammar' || sf.type === 'coherence' ? 1.5 : undefined,
          textUnderlineOffset: 3,
          cursor: hasNote ? 'pointer' : 'default',
        }}
        onClick={() => hasNote && setOpen(!open)}
        title={hasNote ? 'Click to see feedback' : undefined}
      >
        {sf.original}
      </span>
      {hasNote && open && (
        <div
          style={{
            background: sf.type === 'grammar' || sf.type === 'coherence' ? 'rgba(224,101,75,0.06)' : 'rgba(28,58,94,0.04)',
            border: `1px solid ${sf.type === 'grammar' || sf.type === 'coherence' ? 'rgba(224,101,75,0.2)' : 'rgba(28,58,94,0.1)'}`,
            borderRadius: 'var(--radius)',
            padding: '0.75rem 1rem',
            margin: '0.375rem 0 0.375rem 1.5rem',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.875rem',
            lineHeight: 1.6,
          }}
        >
          {sf.correction && (
            <p style={{ fontWeight: 600, color: 'var(--coral)', marginBottom: sf.explanation ? '0.25rem' : 0 }}>
              ✓ {sf.correction}
            </p>
          )}
          {sf.explanation && (
            <p style={{ color: 'var(--text-muted)' }}>{sf.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

function VocabCard({ vocab }: { vocab: VocabUpgrade }) {
  return (
    <div
      style={{
        background: 'rgba(217,164,65,0.06)',
        border: '1px solid rgba(217,164,65,0.25)',
        borderRadius: 'var(--radius)',
        padding: '0.875rem 1rem',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: '0.75rem',
        alignItems: 'start',
      }}
    >
      <span
        style={{
          background: 'var(--gold)',
          color: 'white',
          fontSize: '0.75rem',
          fontWeight: 700,
          padding: '0.25rem 0.625rem',
          borderRadius: 20,
          fontFamily: 'Inter, sans-serif',
          whiteSpace: 'nowrap',
          alignSelf: 'center',
        }}
      >
        vocab
      </span>
      <div>
        <p style={{ fontWeight: 700, color: 'var(--ink-blue)', marginBottom: '0.25rem', fontFamily: 'Inter, sans-serif' }}>
          {vocab.word}
        </p>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontFamily: 'Inter, sans-serif' }}>
          <strong>O'zbek:</strong> {vocab.uzbekMeaning} &nbsp;·&nbsp; <strong>English:</strong> {vocab.englishMeaning}
        </p>
        <p style={{ fontSize: '0.875rem', color: 'var(--slate)', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
          "{vocab.exampleSentence}"
        </p>
      </div>
    </div>
  );
}
