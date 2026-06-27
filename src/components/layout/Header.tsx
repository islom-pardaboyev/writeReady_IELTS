import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Logo from '/logo.png'

export function Header() {
  const { user } = useAuth();

  const firstName = user?.displayName
    ? user.displayName.split(' ')[0]
    : user?.email?.split('@')[0] ?? '';

  return (
    <header
      className="sticky top-0 z-[100] bg-[rgba(255,255,255,0.95)] backdrop-blur-[8px] border-b border-[#e2e8f0]"
    >
      <div
        className="max-w-[1160px] mx-auto px-6 h-[60px] flex items-center justify-between"
      >
        <Link
          to="/"
          className="flex items-center gap-2 no-underline"
        >
          <img src={Logo} width={50} alt="" />
          <span className="font-bold text-base text-[#0f172a]">
            WriteReady <span className="text-[#c9900a]">IELTS</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            to="/writing/mock"
            className="text-[#475569] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline"
          >
            Writing
          </Link>
          <Link
            to="/pricing"
            className="text-[#475569] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline"
          >
            Pricing
          </Link>
          {user ? (
            <Link
              to="/account"
              className="ml-2 flex items-center gap-2 bg-[#1e3a5f] text-white text-sm font-semibold pl-1.5 pr-4 py-1.5 rounded-lg no-underline"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={firstName}
                  className="w-7 h-7 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
                  {firstName.charAt(0).toUpperCase()}
                </span>
              )}
              {firstName}
            </Link>
          ) : (
            <>
              <Link
                to="/auth?mode=login"
                className="text-[#475569] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline"
              >
                Sign in
              </Link>
              <Link
                to="/auth?mode=signup"
                className="ml-1 bg-[#1e3a5f] text-white text-sm font-semibold px-5 py-2 rounded-lg no-underline"
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
