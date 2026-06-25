import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';

export function Header() {
  const { user, profile } = useAuth();

  return (
    <header
      style={{
        background: 'white',
        color: '#0f172a',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: 'Fraunces, serif',
            fontWeight: 700,
            fontSize: '1.25rem',
            color: '#0f172a',
            letterSpacing: '-0.01em',
          }}
        >
          WriteReady <span style={{ color: '#c9900a' }}>IELTS</span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user ? (
            <>
              <Link
                to="/writing/mock"
                style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 500 }}
              >
                Writing
              </Link>
              <Link
                to="/pricing"
                style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 500 }}
              >
                Pricing
              </Link>
              {profile?.plan === 'free' && (
                <Link to="/pricing">
                  <span
                    style={{
                      background: '#1d4ed8',
                      color: 'white',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.25rem 0.75rem',
                      borderRadius: 20,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Upgrade
                  </span>
                </Link>
              )}
              {profile?.plan !== 'free' && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#c9900a',
                    border: '1px solid #c9900a',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 20,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {profile?.plan === 'forever' ? 'Lifetime' : 'Pro'}
                </span>
              )}
              <Link to="/account" title="Account">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Account"
                    style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid #e2e8f0' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: '#1d4ed8',
                      border: '2px solid #dbeafe',
                      color: 'white', fontSize: '0.75rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      letterSpacing: 0,
                    }}
                  >
                    {(user.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
                  </div>
                )}
              </Link>
            </>
          ) : (
            <>
              <Link to="/pricing" style={{ color: '#475569', fontSize: '0.875rem' }}>
                Pricing
              </Link>
              <Link to="/auth?mode=login">
                <Button variant="secondary" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link to="/auth?mode=signup">
                <Button size="sm" style={{ background: '#1d4ed8' } as React.CSSProperties}>
                  Start Free
                </Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
