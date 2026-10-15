/**
 * ═══════════════════════════════════════════════════════
 * MAKILING INTEGRATED SCHOOL — MOBILE SIDEBAR TOGGLE
 * ═══════════════════════════════════════════════════════
 * Handles off-canvas sidebar for mobile view (≤ 768px).
 * Works together with mobile.css
 */

(function initMobileSidebar() {
    'use strict';

    function setup() {
        const sidebar = document.getElementById('app-sidebar');
        const mobileBtn = document.getElementById('mobile-menu-btn');
        const overlay = document.getElementById('mobile-overlay');

        if (!sidebar || !mobileBtn || !overlay) {
            console.warn('[MobileMenu] Required elements not found. Skipping.');
            return;
        }

        const MOBILE_BREAKPOINT = 768;

        function isMobile() {
            return window.innerWidth <= MOBILE_BREAKPOINT;
        }

        function openSidebar() {
            if (!isMobile()) return;
            sidebar.classList.add('mobile-open');
            overlay.classList.add('active');
            document.body.classList.add('mobile-menu-open');
        }

        function closeSidebar() {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
            document.body.classList.remove('mobile-menu-open');
        }

        function toggleSidebar() {
            if (sidebar.classList.contains('mobile-open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        }

        // ═══ EVENT LISTENERS ═══
        mobileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });

        overlay.addEventListener('click', closeSidebar);

        // Close sidebar when a nav link is clicked (mobile only)
        sidebar.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (isMobile()) {
                    setTimeout(closeSidebar, 150);
                }
            });
        });

        // Close sidebar on window resize to desktop
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (!isMobile()) {
                    closeSidebar();
                }
            }, 150);
        });

        // Close sidebar on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
                closeSidebar();
            }
        });

        // Ensure sidebar starts closed on mobile
        if (isMobile()) {
            closeSidebar();
        }

        console.log('[MobileMenu] Initialized ✓');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();