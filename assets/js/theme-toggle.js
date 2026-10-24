'use strict';

(function initThemeToggle() {
        // GitHub Pages cannot send a frame-ancestors response header. Refuse to
        // render inside a frame as a clickjacking fallback; the app is not meant
        // to be embedded. See SECURITY.md.
        try {
                if (window.top !== window.self) {
                        document.documentElement.hidden = true;
                        return;
                }
        } catch (error) {
                document.documentElement.hidden = true;
                return;
        }

        const STORAGE_KEY = 'alphaTimer.theme';
        const LEGACY_STORAGE_KEY = 'theme';
        const LIGHT_CLASS = 'light-theme';
        const DARK_THEME_COLOR = '#0a0a1a';
        const LIGHT_THEME_COLOR = '#ffffff';

        const root = document.documentElement;
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        const systemPrefersLight = window.matchMedia
                ? window.matchMedia('(prefers-color-scheme: light)')
                : null;

        let userChoseTheme = false;

        function safeGet(key) {
                try {
                        return window.localStorage.getItem(key);
                } catch (error) {
                        return null;
                }
        }

        function safeSet(key, value) {
                try {
                        window.localStorage.setItem(key, value);
                } catch (error) {
                        // Storage disabled: the theme still works for this page view.
                }
        }

        function readTheme() {
                const currentTheme = safeGet(STORAGE_KEY);
                if (currentTheme === 'light' || currentTheme === 'dark') {
                        return currentTheme;
                }

                // One-time migration from the old, unnamespaced key. The legacy
                // key is intentionally left in place for older versions.
                const legacyTheme = safeGet(LEGACY_STORAGE_KEY);
                if (legacyTheme === 'light' || legacyTheme === 'dark') {
                        safeSet(STORAGE_KEY, legacyTheme);
                        return legacyTheme;
                }

                return null;
        }

        function applyTheme(isLight) {
                root.classList.toggle(LIGHT_CLASS, isLight);
                const toggleButton = document.getElementById('toggle-theme');
                if (toggleButton) {
                        toggleButton.setAttribute('aria-pressed', String(isLight));
                }
                if (themeColorMeta) {
                        themeColorMeta.setAttribute('content', isLight ? LIGHT_THEME_COLOR : DARK_THEME_COLOR);
                }
        }

        // Apply the saved theme (or the OS preference) immediately, before the
        // body is painted, so light-theme users never see a dark flash.
        const savedTheme = readTheme();
        if (savedTheme === 'light' || savedTheme === 'dark') {
                userChoseTheme = true;
                applyTheme(savedTheme === 'light');
        } else {
                applyTheme(Boolean(systemPrefersLight && systemPrefersLight.matches));
        }

        if (systemPrefersLight) {
                const handleSystemThemeChange = function (event) {
                        if (!userChoseTheme) {
                                applyTheme(event.matches);
                        }
                };
                if (typeof systemPrefersLight.addEventListener === 'function') {
                        systemPrefersLight.addEventListener('change', handleSystemThemeChange);
                } else if (typeof systemPrefersLight.addListener === 'function') {
                        // Older Safari
                        systemPrefersLight.addListener(handleSystemThemeChange);
                }
        }

        function wireThemeButton() {
                const toggleButton = document.getElementById('toggle-theme');
                if (!toggleButton) {
                        return;
                }
                toggleButton.setAttribute('aria-pressed', String(root.classList.contains(LIGHT_CLASS)));
                toggleButton.addEventListener('click', function () {
                        const isLight = !root.classList.contains(LIGHT_CLASS);
                        userChoseTheme = true;
                        applyTheme(isLight);
                        safeSet(STORAGE_KEY, isLight ? 'light' : 'dark');
                });
        }

        // This script is loaded in <head>; the button does not exist yet.
        if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', wireThemeButton);
        } else {
                wireThemeButton();
        }
})();
