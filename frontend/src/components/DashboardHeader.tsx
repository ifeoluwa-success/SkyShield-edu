import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  Bell,
  Search,
  Menu,
  Sun,
  Moon,
  LogOut,
  Settings,
  User,
  BookOpen,
  PlayCircle,
  Map,
  X,
  ChevronDown,
} from 'lucide-react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import NotificationPanel from './NotificationPanel';
import {
  searchContent,
  searchItemToRoute,
  type GroupedSearchResults,
} from '../services/contentService';
import { applyThemeToDocument, readStoredTheme, type AppTheme } from '../lib/theme';
import { cn } from '../lib/utils';
import { useContentLibraryBase, usePortalBasePath } from '../hooks/usePortalBasePath';

interface DashboardHeaderProps {
  onMobileToggle: () => void;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ onMobileToggle }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const portalBase = usePortalBasePath();
  const libraryBase = useContentLibraryBase();
  const isTrainee = user?.role === 'trainee';

  const quickLinks = isTrainee
    ? [
        { to: '/', label: 'Home', end: true as const },
        { to: '/dashboard', label: 'Dashboard', end: true as const },
        { to: '/dashboard/simulations', label: 'Simulations', end: false as const },
        { to: '/dashboard/courses', label: 'Courses', end: false as const },
      ]
    : user?.role === 'admin'
      ? [
          { to: '/', label: 'Home', end: true as const },
          { to: '/admin/metrics', label: 'Metrics', end: false as const },
          { to: '/admin/users', label: 'Users', end: false as const },
          { to: '/admin/courses-list', label: 'Courses', end: false as const },
          { to: `${portalBase}/dashboard`, label: 'Teaching', end: false as const },
          { to: libraryBase, label: 'Content Library', end: false as const },
        ]
      : [
          { to: '/', label: 'Home', end: true as const },
          { to: `${portalBase}/dashboard`, label: 'Dashboard', end: true as const },
          { to: `${portalBase}/courses`, label: 'Course Builder', end: false as const },
          { to: `${portalBase}/materials`, label: 'Teaching Materials', end: false as const },
          { to: libraryBase, label: 'Content Library', end: false as const },
        ];

  const [theme, setTheme] = useState<AppTheme>(() => readStoredTheme());

  const [notificationsPanelOpen, setNotificationsPanelOpen] = useState(false);
  const [notificationsCount, setNotificationsCount] = useState(0);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedSearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'User';
  const displayRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : 'Guest';

  const avatarUrl = user?.profile_picture ?? null;
  const profilePath = isTrainee ? '/dashboard/profile' : `${portalBase}/profile`;
  const settingsPath = isTrainee ? '/dashboard/settings' : `${portalBase}/settings`;

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(t)) setSearchOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(t)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    setUserMenuOpen(false);
  }, [location.pathname]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null);
      setSearchOpen(false);
      return;
    }
    setSearching(true);
    try {
      const data = await searchContent(q.trim());
      setResults(data);
      setSearchOpen(true);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(val), 380);
  };

  const clearSearch = () => {
    setQuery('');
    setResults(null);
    setSearchOpen(false);
  };

  /** Light = default; only explicit “night” (dark) turns on dark styles. */
  const toggleNightMode = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const totalHits = results?.total ?? 0;

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-[100] border-b backdrop-blur-md transition-colors',
          theme === 'light'
            ? 'border-zinc-200 bg-white/95 text-zinc-900'
            : 'border-zinc-800 bg-zinc-950/95 text-zinc-100',
        )}
      >
        <div className="max-w-screen-2xl mx-auto px-4 lg:px-6">
          <div className="h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={onMobileToggle}
                className={cn(
                  'lg:hidden shrink-0 p-2 rounded-2xl border transition-colors',
                  theme === 'light'
                    ? 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800'
                    : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200',
                )}
                aria-label="Open menu"
              >
                <Menu size={24} />
              </button>

              {/* <Link to="/" className="flex items-center gap-2 sm:gap-3 shrink-0">
                <LogoMark />
                <div
                  className={cn(
                    'font-bold text-lg sm:text-2xl tracking-tighter whitespace-nowrap',
                    theme === 'light' ? 'text-zinc-900' : 'text-white',
                  )}
                >
                  SkyShield <span className="text-amber-600">Edu</span>
                </div>
              </Link> */}

              <nav
                className="hidden xl:flex items-center justify-center gap-0 flex-1 min-w-0 px-2"
                aria-label="Quick links"
              >
                {quickLinks.map(({ to, label, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors rounded-lg',
                        theme === 'light'
                          ? isActive
                            ? 'text-amber-700'
                            : 'text-zinc-500 hover:text-zinc-800'
                          : isActive
                            ? 'text-amber-400'
                            : 'text-zinc-400 hover:text-zinc-100',
                        isActive &&
                          "after:content-[''] after:absolute after:bottom-0.5 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-amber-500",
                      )
                    }
                  >
                    {label}
                  </NavLink>
                ))}
              </nav>

              <div className="hidden md:block flex-1 max-w-md min-w-[180px] relative" ref={searchRef}>
                <div className="relative">
                  <Search
                    className={cn(
                      'absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none',
                      theme === 'light' ? 'text-zinc-400' : 'text-zinc-500',
                    )}
                    size={18}
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={handleQueryChange}
                    onFocus={() => {
                      if (results && totalHits > 0) setSearchOpen(true);
                    }}
                    placeholder="Search materials, simulations, paths…"
                    autoComplete="off"
                    className={cn(
                      'w-full border pl-10 pr-10 py-2.5 rounded-3xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40',
                      theme === 'light'
                        ? 'bg-zinc-100 border-zinc-200 text-zinc-900 placeholder:text-zinc-500'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder:text-zinc-500',
                    )}
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className={cn(
                        'absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5',
                        theme === 'light'
                          ? 'text-zinc-400 hover:text-zinc-700'
                          : 'text-zinc-500 hover:text-zinc-200',
                      )}
                      aria-label="Clear search"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>

                {searchOpen ? (
                  <div
                    className={cn(
                      'absolute mt-2 w-full rounded-3xl shadow-xl border overflow-hidden z-[200] max-h-[65vh] overflow-y-auto',
                      theme === 'light'
                        ? 'bg-white border-zinc-200'
                        : 'bg-zinc-900 border-zinc-700',
                    )}
                  >
                    {searching ? (
                      <div className="px-6 py-10 text-center text-zinc-500">Searching…</div>
                    ) : null}
                    {!searching && totalHits === 0 ? (
                      <div className="px-6 py-10 text-center text-zinc-500">
                        No results for &quot;{query}&quot;
                      </div>
                    ) : null}

                    {results?.materials && results.materials.length > 0 ? (
                      <div>
                        <div
                          className={cn(
                            'px-5 py-2.5 text-xs font-semibold flex items-center gap-2 border-b',
                            theme === 'light'
                              ? 'text-zinc-500 border-zinc-100'
                              : 'text-zinc-400 border-zinc-800',
                          )}
                        >
                          <BookOpen size={14} /> Materials
                        </div>
                        {results.materials.slice(0, 5).map((m) => (
                          <button
                            type="button"
                            key={`material-${m.id}`}
                            onClick={() => {
                              navigate(searchItemToRoute(m, libraryBase));
                              clearSearch();
                            }}
                            className={cn(
                              'w-full px-5 py-3.5 flex items-center gap-3 text-left transition-colors',
                              theme === 'light' ? 'hover:bg-zinc-50' : 'hover:bg-zinc-800',
                            )}
                          >
                            <BookOpen size={18} className="text-amber-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{m.title}</p>
                              {m.description ? (
                                <p className="text-xs text-zinc-500 truncate">{m.description}</p>
                              ) : null}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {results?.paths && results.paths.length > 0 ? (
                      <div>
                        <div
                          className={cn(
                            'px-5 py-2.5 text-xs font-semibold flex items-center gap-2 border-b',
                            theme === 'light'
                              ? 'text-zinc-500 border-zinc-100'
                              : 'text-zinc-400 border-zinc-800',
                          )}
                        >
                          <Map size={14} /> Learning Paths
                        </div>
                        {results.paths.slice(0, 3).map((p) => (
                          <button
                            type="button"
                            key={`path-${p.id}`}
                            onClick={() => {
                              navigate(searchItemToRoute(p, libraryBase));
                              clearSearch();
                            }}
                            className={cn(
                              'w-full px-5 py-3.5 flex items-center gap-3 text-left transition-colors',
                              theme === 'light' ? 'hover:bg-zinc-50' : 'hover:bg-zinc-800',
                            )}
                          >
                            <Map size={18} className="text-amber-600 shrink-0" />
                            <p className="font-medium truncate">{p.title}</p>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {totalHits > 0 ? (
                      <div
                        className={cn(
                          'p-4 border-t',
                          theme === 'light' ? 'border-zinc-100' : 'border-zinc-800',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            navigate(`/dashboard/search?q=${encodeURIComponent(query.trim())}`);
                            clearSearch();
                          }}
                          className={cn(
                            'w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-medium transition-colors',
                            theme === 'light'
                              ? 'bg-zinc-900 text-white hover:bg-black'
                              : 'bg-white text-zinc-900 hover:bg-zinc-100',
                          )}
                        >
                          <PlayCircle size={18} /> View all {totalHits} results
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={toggleNightMode}
                className={cn(
                  'p-3 rounded-2xl border transition-colors',
                  theme === 'light'
                    ? 'border-transparent hover:bg-zinc-100 text-zinc-700'
                    : 'border-transparent hover:bg-zinc-800 text-zinc-200',
                )}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to night mode'}
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              <button
                type="button"
                onClick={() => setNotificationsPanelOpen(true)}
                className={cn(
                  'p-3 rounded-2xl border relative transition-colors',
                  theme === 'light'
                    ? 'border-transparent hover:bg-zinc-100 text-zinc-700'
                    : 'border-transparent hover:bg-zinc-800 text-zinc-200',
                )}
                aria-label="Notifications"
              >
                <Bell size={20} />
                {notificationsCount > 0 ? (
                  <span className="absolute top-1.5 right-1.5 h-5 min-w-[1.25rem] px-1 bg-red-500 rounded-full text-[10px] font-medium flex items-center justify-center text-white">
                    {notificationsCount > 99 ? '99+' : notificationsCount}
                  </span>
                ) : null}
              </button>

              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className={cn(
                    'flex items-center gap-2 sm:gap-3 pl-2 pr-2 sm:pr-3 py-1.5 rounded-3xl border transition-colors',
                    theme === 'light'
                      ? userMenuOpen
                        ? 'bg-zinc-100 border-amber-300'
                        : 'border-transparent hover:bg-zinc-100'
                      : userMenuOpen
                        ? 'bg-zinc-800 border-amber-500/40'
                        : 'border-transparent hover:bg-zinc-800',
                  )}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-2xl overflow-hidden ring-2 shrink-0',
                      theme === 'light' ? 'bg-zinc-200 ring-white' : 'bg-zinc-700 ring-zinc-800',
                    )}
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div
                        className={cn(
                          'w-full h-full flex items-center justify-center',
                          theme === 'light' ? 'bg-zinc-300 text-zinc-700' : 'bg-zinc-600 text-zinc-200',
                        )}
                      >
                        <User size={20} />
                      </div>
                    )}
                  </div>
                  <div className="hidden md:block text-left pr-1 min-w-0 max-w-[140px]">
                    <p className="font-semibold text-sm leading-none truncate">{displayName}</p>
                    <p className={cn('text-xs truncate', theme === 'light' ? 'text-zinc-500' : 'text-zinc-400')}>
                      {displayRole}
                    </p>
                  </div>
                  <ChevronDown
                    size={18}
                    className={cn(
                      'shrink-0 transition-transform text-zinc-400',
                      userMenuOpen && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>

                {userMenuOpen ? (
                  <div
                    className={cn(
                      'absolute right-0 mt-2 w-64 rounded-3xl shadow-2xl border py-2 z-[200]',
                      theme === 'light'
                        ? 'bg-white border-zinc-200 text-zinc-900'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-100',
                    )}
                    role="menu"
                  >
                    <div
                      className={cn(
                        'px-5 py-4 border-b',
                        theme === 'light' ? 'border-zinc-100' : 'border-zinc-800',
                      )}
                    >
                      <p className="font-semibold truncate">{displayName}</p>
                      <p className="text-sm text-zinc-500 truncate">{user?.email ?? ''}</p>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        navigate(profilePath);
                        setUserMenuOpen(false);
                      }}
                      className={cn(
                        'w-full px-5 py-3 flex items-center gap-3 text-left transition-colors',
                        theme === 'light' ? 'hover:bg-zinc-50' : 'hover:bg-zinc-800',
                      )}
                    >
                      <User size={18} /> Profile
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        navigate(settingsPath);
                        setUserMenuOpen(false);
                      }}
                      className={cn(
                        'w-full px-5 py-3 flex items-center gap-3 text-left transition-colors',
                        theme === 'light' ? 'hover:bg-zinc-50' : 'hover:bg-zinc-800',
                      )}
                    >
                      <Settings size={18} /> Settings
                    </button>

                    <div
                      className={cn(
                        'border-t mt-1 pt-1',
                        theme === 'light' ? 'border-zinc-100' : 'border-zinc-800',
                      )}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void handleLogout()}
                        className={cn(
                          'w-full px-5 py-3 flex items-center gap-3 text-left transition-colors',
                          theme === 'light'
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-red-400 hover:bg-red-950/40',
                        )}
                      >
                        <LogOut size={18} /> Logout
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <NotificationPanel
        isOpen={notificationsPanelOpen}
        onClose={() => setNotificationsPanelOpen(false)}
        onUnreadCountChange={setNotificationsCount}
      />
    </>
  );
};

export default DashboardHeader;
