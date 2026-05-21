import { useState, useEffect, useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { applyThemeToDocument, readStoredTheme } from "../lib/theme";
import { getHomePathForRole } from "../lib/authRouting";
import "@/assets/css/header.css";

type NavLink = { href: string; label: string };

const LogoMark = () => (
  <svg
    width="26" height="26"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    className="logo__mark"
  >
    <path
      d="M16 3L27.3 9.5V22.5L16 29L4.7 22.5V9.5Z"
      stroke="#fbbf24"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <polyline
      points="10,21 16,13.5 22,21"
      stroke="#fbbf24"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

export default function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const dashboardPath = user?.role ? getHomePathForRole(user.role) : '/dashboard';

  const [theme, setTheme] = useState<'dark' | 'light'>(() => readStoredTheme());

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const links: NavLink[] = [
    { href: "/",            label: "Home"        },
    { href: "/simulations", label: "Simulations" },
    { href: "/features",    label: "Features"    },
    { href: "/usecases",    label: "Use Cases"   },
    { href: "/about",       label: "About"       },
  ];

  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [location.pathname]);

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.substring(1));
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [location]);

  const NavItem = ({ href, label }: NavLink) => {
    const isActive = location.pathname === href || (href.startsWith("#") && location.hash === href);
    const cls = `nav__link${isActive ? " nav__link--active" : ""}`;
    return href.startsWith("#")
      ? <a href={href} className={cls}>{label}</a>
      : <Link to={href} className={cls}>{label}</Link>;
  };

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <header className="header" role="banner">
      <div className="header__container">

        {/* Logo */}
        <Link to="/" className="logo" aria-label="SkyShield Edu Home">
          <LogoMark />
          <span className="logo__text">
            SkyShield<span className="logo__edu"> Edu</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="nav" aria-label="Primary navigation">
          {links.map((link) => <NavItem key={link.href} {...link} />)}
        </nav>

        {/* Desktop actions */}
        <div className="actions">
          {isAuthenticated ? (
            <Link to={dashboardPath} className="btn btn--primary">
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login"  className="btn btn--ghost">Sign In</Link>
              <Link to="/signup" className="btn btn--primary">Start Training</Link>
            </>
          )}
        </div>

        {/* Right controls: theme toggle (always) + hamburger (mobile) */}
        <div className="header-controls">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className={`menu-toggle${open ? " menu-toggle--open" : ""}`}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((p) => !p)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`mobile-menu${open ? " mobile-menu--open" : ""}`} aria-hidden={!open}>
        <nav className="mobile-nav">
          {links.map((link) => <NavItem key={link.href} {...link} />)}
          <div className="mobile-actions">
            {isAuthenticated ? (
              <Link
                to={dashboardPath}
                className="btn btn--primary"
                onClick={() => setOpen(false)}
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login"  className="btn btn--ghost"   onClick={() => setOpen(false)}>Sign In</Link>
                <Link to="/signup" className="btn btn--primary" onClick={() => setOpen(false)}>Start Training</Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
