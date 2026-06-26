import { Link } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { Button } from "../components/ui/Button";
import { useAuth } from "../contexts/AuthContext";

const FREE_FEATURES = [
  "All 3 practice modes (Mock, Practice, Relax)",
  "Full question bank access",
  "Word count & timer tools",
  "Writing history",
];

const PRO_FEATURES = [
  "Everything in Free",
  "12 AI analyses per month",
  "Sentence-by-sentence feedback",
  "Vocabulary upgrades with Uzbek meanings",
  "Band score estimate per sentence",
  "Model paragraph",
  "PDF export",
];

export function PricingPage() {
  const { user, profile } = useAuth();

  const isFree = !profile || profile.plan === "free";
  const isPro = profile?.plan === "pro" || profile?.plan === "forever";

  return (
    <Layout>
      <section className="">
        <div className="my-10">
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <div
              className="inline-block"
              style={{
                color: "#1d4ed8",
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderRadius: 20,
                marginBottom: "1.25rem",
              }}
            >
              Pricing
            </div>
            <h1
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: "clamp(2rem, 5vw, 2.75rem)",
                fontWeight: 800,
                color: "#0f172a",
                marginBottom: "0.75rem",
                lineHeight: 1.15,
              }}
            >
              Simple, honest pricing
            </h1>
            <p
              style={{
                color: "#64748b",
                fontSize: "1.0625rem",
                maxWidth: 460,
                margin: "0 auto",
              }}
            >
              Start free. Upgrade when you're ready for AI-powered feedback.
            </p>
          </div>

          {/* Plans */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "1.5rem",
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            {/* Free plan */}
            <div className="hover:-translate-y-2 transition-all hover:shadow-xl bg-white rounded-[20px] p-8 border border-slate-200 shadow-[0_1px_4px_rgba(0,0,0,0.06)] flex flex-col">
              <div style={{ marginBottom: "1.5rem" }}>
                <div
                  style={{
                    fontFamily: "Fraunces, serif",
                    fontSize: "1.375rem",
                    fontWeight: 700,
                    color: "#0f172a",
                    marginBottom: "0.25rem",
                  }}
                >
                  Free
                </div>
                <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                  Get started with unlimited writing practice
                </div>
              </div>

              <div style={{ marginBottom: "2rem" }}>
                <span
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: "2.25rem",
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  $0
                </span>
                <span
                  style={{
                    fontSize: "0.875rem",
                    color: "#94a3b8",
                    marginLeft: "0.375rem",
                  }}
                >
                  forever
                </span>
              </div>

              <ul
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginBottom: "2rem",
                  flex: 1,
                }}
              >
                {FREE_FEATURES.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.625rem",
                      fontSize: "0.9rem",
                      color: "#334155",
                    }}
                  >
                    <span
                      style={{
                        color: "#22c55e",
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
                <li
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.625rem",
                    fontSize: "0.9rem",
                    color: "#94a3b8",
                  }}
                >
                  <span style={{ flexShrink: 0, marginTop: 1 }}>✗</span>
                  No AI feedback
                </li>
              </ul>

              <Link
                to={user ? "/dashboard" : "/auth?mode=signup"}
                style={{ display: "block" }}
              >
                <Button
                  variant="secondary"
                  style={
                    {
                      width: "100%",
                      opacity: isFree ? 0.55 : 1,
                    } as React.CSSProperties
                  }
                  disabled={isFree}
                >
                  {isFree ? "Current plan" : "Downgrade to Free"}
                </Button>
              </Link>
            </div>

            {/* Pro plan */}
            <div className="hover:-translate-y-2 transition-all hover:shadow-2xl bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] rounded-[20px] p-8 border-2 border-[#c9900a] shadow-[0_8px_32px_rgba(15,23,42,0.18)] flex flex-col relative">
              {/* Badge */}
              <div
                style={{
                  position: "absolute",
                  top: -13,
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#c9900a",
                  color: "white",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "0.3rem 1rem",
                  borderRadius: 20,
                  whiteSpace: "nowrap",
                }}
              >
                Most popular
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <div
                  style={{
                    fontFamily: "Fraunces, serif",
                    fontSize: "1.375rem",
                    fontWeight: 700,
                    color: "white",
                    marginBottom: "0.25rem",
                  }}
                >
                  Pro
                </div>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  AI feedback to accelerate your improvement
                </div>
              </div>

              <div style={{ marginBottom: "2rem" }}>
                <span
                  style={{
                    fontFamily: "IBM Plex Mono, monospace",
                    fontSize: "2.25rem",
                    fontWeight: 600,
                    color: "white",
                  }}
                >
                  25,000
                </span>
                <span
                  style={{
                    fontSize: "0.875rem",
                    color: "rgba(255,255,255,0.5)",
                    marginLeft: "0.375rem",
                  }}
                >
                  UZS / month
                </span>
              </div>

              <ul
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginBottom: "2rem",
                  flex: 1,
                }}
              >
                {PRO_FEATURES.map((f) => (
                  <li
                    key={f}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "0.625rem",
                      fontSize: "0.9rem",
                      color: "rgba(255,255,255,0.85)",
                    }}
                  >
                    <span
                      style={{
                        color: "#fbbf24",
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <a href="#contact" style={{ display: "block" }}>
                <Button
                  style={
                    {
                      width: "100%",
                      background: "#c9900a",
                      border: "none",
                      opacity: isPro ? 0.55 : 1,
                    } as React.CSSProperties
                  }
                  disabled={isPro}
                >
                  {isPro ? "Current plan" : "Get Pro →"}
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
