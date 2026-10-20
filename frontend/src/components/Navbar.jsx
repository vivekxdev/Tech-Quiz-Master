import React, { useEffect, useRef, useState } from 'react'
import { navbarStyles } from '../assets/dummyStyles (1).js'
import { useLocation, useNavigate } from 'react-router-dom';
import { SignedOut, SignedIn, SignInButton, UserButton } from '@clerk/clerk-react';
import { Menu, X } from 'lucide-react';

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL;
const LOGO_SRC = '/logoquiz.png';

// Shared appearance so the avatar looks the same in the desktop bar and the
// mobile menu.
const USER_BUTTON_APPEARANCE = {
    elements: {
        avatarBox: "h-9 w-9 rounded-full border border-line-strong",
        userButton: "rounded-md hover:bg-surface-3",
        userButtonText: "text-sm text-ink",
        userButtonIcon: "hidden"
    }
};

const Navbar = ({ logoSrc }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);

    // Current-page marker for "My Results"; paired with aria-current so the
    // state is announced, not only drawn.
    const onResultsPage = location.pathname === '/result';
    const resultsButtonClass = onResultsPage
        ? `${navbarStyles.buttonBase} ${navbarStyles.buttonActive}`
        : navbarStyles.buttonBase;

    const navRef = useRef(null);
    const menuBtnRef = useRef(null);
    const menuRef = useRef(null);

    // close menu when clicking outside
    useEffect(() => {
        if (!menuOpen) return;

        const handleDocClick = (e) => {
            if (
                navRef.current?.contains(e.target) ||
                menuBtnRef.current?.contains(e.target) ||
                menuRef.current?.contains(e.target)
            ) {
                return;
            }
            setMenuOpen(false);
        };

        document.addEventListener("click", handleDocClick, { capture: true });
        return () => document.removeEventListener("click", handleDocClick, { capture: true });
    }, [menuOpen]);

    const goTo = (path) => {
        navigate(path);
        setMenuOpen(false);
    };

    return (
        <div className={navbarStyles.container}>
            <nav ref={navRef} className={navbarStyles.nav} aria-label="Main">
                <div className={navbarStyles.innerContainer}>
                    <div className={navbarStyles.flexContainer}>

                        {/* Logo */}
                        <div className={navbarStyles.logoSection}>
                            <button
                                type="button"
                                className={navbarStyles.logoButton}
                                onClick={() => goTo('/')}
                                aria-label="Go to home"
                            >
                                <img
                                    src={logoSrc || LOGO_SRC}
                                    alt=""
                                    className={navbarStyles.logoImage}
                                />
                            </button>
                        </div>

                        {/* Title */}
                        <div className={navbarStyles.titleContainer}>
                            <div className={navbarStyles.titleWrapper}>
                                <div className={navbarStyles.titleBox}>
                                    <h1 className={navbarStyles.titleText}>
                                        Tech Quiz Master
                                    </h1>
                                </div>
                            </div>
                        </div>

                        {/* Desktop Buttons */}
                        <div className={navbarStyles.desktopButtons}>

                            {/* Logged OUT: My Results + Login */}
                            <SignedOut>
                                <SignInButton mode="modal">
                                    <button type="button" className={navbarStyles.buttonBase}>
                                        My Results
                                    </button>
                                </SignInButton>
                                <SignInButton mode="modal">
                                    <button type="button" className={navbarStyles.buttonBase}>
                                        Login
                                    </button>
                                </SignInButton>
                            </SignedOut>

                            {/* Logged IN: My Results + Admin + Avatar */}
                            <SignedIn>
                                <button
                                    type="button"
                                    onClick={() => navigate('/result')}
                                    className={resultsButtonClass}
                                    aria-current={onResultsPage ? "page" : undefined}
                                >
                                    My Results
                                </button>

                                <button
                                    type="button"
                                    onClick={() => window.location.href = `${ADMIN_URL}/dashboard`}
                                    className={navbarStyles.buttonBase}
                                >
                                    Admin
                                </button>

                                <div className="ml-1 flex items-center justify-center">
                                    <UserButton appearance={USER_BUTTON_APPEARANCE} />
                                </div>
                            </SignedIn>
                        </div>

                        {/* Mobile Hamburger Button */}
                        <button
                            ref={menuBtnRef}
                            type="button"
                            className={navbarStyles.mobileMenuButton}
                            onClick={() => setMenuOpen((s) => !s)}
                            aria-expanded={menuOpen}
                            aria-label={menuOpen ? "Close menu" : "Open menu"}
                        >
                            {menuOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>

                    {/* Mobile Menu */}
                    {menuOpen && (
                        <div ref={menuRef} className={navbarStyles.mobileMenuWrapper}>

                            {/* Logged OUT */}
                            <SignedOut>
                                <div className="flex flex-wrap items-center gap-2">
                                    <SignInButton mode="modal">
                                        <button type="button" className={navbarStyles.buttonBase}>
                                            My Results
                                        </button>
                                    </SignInButton>
                                    <SignInButton mode="modal">
                                        <button type="button" className={navbarStyles.buttonBase}>
                                            Login
                                        </button>
                                    </SignInButton>
                                </div>
                            </SignedOut>

                            {/* Logged IN */}
                            <SignedIn>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { navigate('/result'); setMenuOpen(false); }}
                                        className={resultsButtonClass}
                                        aria-current={onResultsPage ? "page" : undefined}
                                    >
                                        My Results
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => { window.location.href = `${ADMIN_URL}/dashboard`; setMenuOpen(false); }}
                                        className={navbarStyles.buttonBase}
                                    >
                                        Admin
                                    </button>

                                    <UserButton appearance={USER_BUTTON_APPEARANCE} />
                                </div>
                            </SignedIn>
                        </div>
                    )}
                </div>
            </nav>
        </div>
    )
}

export default Navbar
