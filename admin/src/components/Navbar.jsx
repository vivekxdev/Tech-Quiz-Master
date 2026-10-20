import React, { useState, useEffect, useRef } from 'react';
import { navbarStyles } from '../assets/dummyStyles.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { UserButton, useUser, SignInButton, useAuth } from '@clerk/clerk-react';
import { List, Home, User, X, Menu } from 'lucide-react';

const Navbar = ({
  logoSrc = null,
  siteName = 'Tech Quiz Master',
  onNavigate = null,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Current-page markers, announced via aria-current and drawn with the
  // registry's active-state classes.
  const onDashboard = location.pathname === '/dashboard';
  const onList = location.pathname === '/list';

  // To collapse the model on escape key
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setMobileMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Closse when resizing to md+ and lock scroll when open
  useEffect(() => {
    const onResize = () =>
      window.innerWidth >= 768 && setMobileMenuOpen(false);

    window.addEventListener('resize', onResize);

    const prevOverflow = document.body.style.overflow;
    if (mobileMenuOpen) document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('resize', onResize);
      document.body.style.overflow = prevOverflow || '';
    };
  }, [mobileMenuOpen]);

  const handleNavigate = (href) => {
    setMobileMenuOpen(false);
    if (onNavigate) return onNavigate(href);

    try {
      navigate(href);
    } catch {
      window.location.href = href;
    }
  };

  // To save token in localStorage for API calls
  const  prevSignedInRef = useRef(isSignedIn);

  useEffect(() => {
    let mounted = true;
    async function saveTokenAndMaybeRedirect() {
      if(!isSignedIn || prevSignedInRef.current === isSignedIn) return;
       try {
        const token = await getToken();
        if (token && mounted) {
          localStorage.setItem('clerkToken', token);
          console.log("Clerk Token saved");
        }
       } catch (error) {
        console.error("Error getting Clerk token:", error);
       }
        const path = window.location.pathname;
        const shouldRedirect = path === '/' || path === '/login' || path === '/signin' || path === '';

       if( shouldRedirect ) {
        if (onNavigate) onNavigate('/dashboard');
       } else {
        try {
          navigate("/dashboard");
        } catch {
          window.location.href = '/dashboard';
        }
       }
       prevSignedInRef.current = isSignedIn;
    }
    saveTokenAndMaybeRedirect();
    return () => { mounted = false; }

  }, [isSignedIn, getToken, navigate, onNavigate]);

  return (
    <nav className={navbarStyles.nav}>
      <div className={navbarStyles.container}>
        <div className={navbarStyles.innerContainer}>

          {/* LEFT - LOGO */}
          <button
            type="button"
            onClick={() => handleNavigate('/')}
            className={navbarStyles.homeButton}
          >
            <div className={navbarStyles.logoWrapper}>
              <img
                src={
                  logoSrc ||
                  'https://cdn-icons-png.flaticon.com/128/5806/5806364.png'
                }
                alt=""
                className={navbarStyles.logoImg}
              />
            </div>

            <div className={navbarStyles.siteNameWrapper}>
              <span className={navbarStyles.siteName}>{siteName}</span>
              <span className={navbarStyles.siteSubtitle}>
                Learning Platform
              </span>
            </div>
          </button>

          {/* CENTER MENU */}
          <div className={navbarStyles.desktopCenterContainer}>
            <div className={navbarStyles.desktopCenterInner}>

            {/* ONLY WHEN LOGGED IN */}
            {isSignedIn && (
              <>
                <button
                  onClick={() => handleNavigate('/dashboard')}
                  className={`${navbarStyles.dashboardButton} ${
                    onDashboard ? navbarStyles.dashboardButtonActive : ''
                  }`}
                  aria-current={onDashboard ? 'page' : undefined}
                >
                  <Home className={navbarStyles.dashboardIcon} />
                  <span>Dashboard</span>
                </button>

                <button
                  onClick={() => handleNavigate('/list')}
                  className={`${navbarStyles.listButton} ${
                    onList ? navbarStyles.listButtonActive : ''
                  }`}
                  aria-current={onList ? 'page' : undefined}
                >
                  <List className={navbarStyles.listIcon} />
                  <span>List Quiz</span>
                </button>
              </>
            )}

            </div>
          </div>

          {/* RIGHT SIDE */}
          <div className={navbarStyles.desktopRightContent}>

            {/* NOT LOGGED IN → MY PROFILE */}
            {!isSignedIn && (
              <SignInButton mode="modal">
                <button className={navbarStyles.profileButton}>
                  <User className={navbarStyles.profileIcon} />
                  <span>My Profile</span>
                </button>
              </SignInButton>
            )}

            {/* LOGGED IN → AVATAR */}
            {isSignedIn && (
              <div className={navbarStyles.profileGroup}>
                <UserButton
                  appearance={{ elements: { avatarBox: 'w-9 h-9' } }}
                />
              </div>
            )}

            {/* MOBILE MENU */}
            <div className={navbarStyles.mobileMenuContainer}>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((s) => !s)}
                className={navbarStyles.hamburgerButton}
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? (
                  <X className={navbarStyles.xIcon} aria-hidden="true" />
                ) : (
                  <Menu className={navbarStyles.menuIcon} aria-hidden="true" />
                )}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* MOBILE MENU */}
      {mobileMenuOpen && (
        <div className={navbarStyles.mobileOverlay}>
          <div
            onClick={() => setMobileMenuOpen(false)}
            className={navbarStyles.mobileBackdrop}
          />

          <div className={navbarStyles.mobilePanel}>
            <nav className={navbarStyles.mobileNav}>

              {!isSignedIn && (
                <SignInButton mode="modal">
                  <button className={navbarStyles.mobileNavButton}>
                    <User className={navbarStyles.mobileNavIcon} />
                    <div>
                      <div className={navbarStyles.mobileNavItemTitle}>
                        Login
                      </div>
                    </div>
                  </button>
                </SignInButton>
              )}

              {isSignedIn && (
                <>
                  <button
                    onClick={() => handleNavigate('/dashboard')}
                    className={`${navbarStyles.mobileNavButton} ${
                      onDashboard ? navbarStyles.mobileNavButtonActive : ''
                    }`}
                    aria-current={onDashboard ? 'page' : undefined}
                  >
                    <Home className={navbarStyles.mobileNavIcon} />
                    <div>
                      <div className={navbarStyles.mobileNavItemTitle}>
                        Dashboard
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleNavigate('/list')}
                    className={`${navbarStyles.mobileNavButton} ${
                      onList ? navbarStyles.mobileNavButtonActive : ''
                    }`}
                    aria-current={onList ? 'page' : undefined}
                  >
                    <List className={navbarStyles.mobileNavIcon} />
                    <div>
                      <div className={navbarStyles.mobileNavItemTitle}>
                        List Quiz
                      </div>
                    </div>
                  </button>
                </>
              )}

            </nav>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;