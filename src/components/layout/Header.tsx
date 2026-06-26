import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Logo from '/logo.png'

export function Header() {
  const { user, profile } = useAuth();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #e2e8f0",
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          padding: "0 1.5rem",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          to="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            textDecoration: "none",
          }}
        >
          <img src={Logo} width={50} alt="" />
          <span style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>
            WriteReady <span style={{ color: "#c9900a" }}>IELTS</span>
          </span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <Link
            to="/writing/mock"
            style={{
              color: "#475569",
              fontSize: "0.875rem",
              fontWeight: 500,
              padding: "0.375rem 0.875rem",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            Writing
          </Link>
          <Link
            to="/pricing"
            style={{
              color: "#475569",
              fontSize: "0.875rem",
              fontWeight: 500,
              padding: "0.375rem 0.875rem",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            Pricing
          </Link>
          {user ? (
            <Link
              to="/account"
              style={{
                marginLeft: "0.5rem",
                background: "#1e3a5f",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 600,
                padding: "0.5rem 1.25rem",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              My Account
            </Link>
          ) : (
            <>
              <Link
                to="/auth?mode=login"
                style={{
                  color: "#475569",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  padding: "0.375rem 0.875rem",
                  borderRadius: 6,
                  textDecoration: "none",
                }}
              >
                Sign in
              </Link>
              <Link
                to="/auth?mode=signup"
                style={{
                  marginLeft: "0.25rem",
                  background: "#1e3a5f",
                  color: "white",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  padding: "0.5rem 1.25rem",
                  borderRadius: 8,
                  textDecoration: "none",
                }}
              >
                Start Free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
