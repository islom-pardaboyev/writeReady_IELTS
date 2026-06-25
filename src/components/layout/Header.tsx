import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';

export function Header() {
  const { user, profile, logOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  return (
    <header
      style={{
        background: 'var(--ink-blue)',
        color: 'white',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
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
            color: 'white',
            letterSpacing: '-0.01em',
          }}
        >
          WriteReady <span style={{ color: 'var(--gold)' }}>IELTS</span>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user ? (
            <>
              <Link
                to="/writing/mock"
                style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', fontWeight: 500 }}
              >
                Writing
              </Link>
              <Link
                to="/pricing"
                style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem', fontWeight: 500 }}
              >
                Pricing
              </Link>
              {profile?.plan === 'free' && (
                <Link to="/pricing">
                  <span
                    style={{
                      background: 'var(--gold)',
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
                    color: 'var(--gold)',
                    border: '1px solid var(--gold)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 20,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {profile?.plan === 'forever' ? 'Lifetime' : 'Pro'}
                </span>
              )}
              {/* Avatar → account page */}
              <Link to="/account" title="Account">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Account"
                    style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '2px solid rgba(255,255,255,0.2)' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.2)',
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
              <Link to="/pricing" style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.875rem' }}>
                Pricing
              </Link>
              <Link to="/auth?mode=login">
                <Button variant="secondary" size="sm" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)' } as React.CSSProperties}>
                  Sign in
                </Button>
              </Link>
              <Link to="/auth?mode=signup">
                <Button size="sm" style={{ background: 'var(--gold)' } as React.CSSProperties}>
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
