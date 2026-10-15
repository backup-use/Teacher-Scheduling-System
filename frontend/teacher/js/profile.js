/* ═══════════════════════════════════════════════════════
   MAKILING INTEGRATED SCHOOL — TEACHER PROFILE
   Handles: profile load, general updates, password change,
            activity log (account changes only — no login/logout)
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
    // ═══ AUTH CHECK ═══
    const role = localStorage.getItem('userRole');
    if (role && role !== 'teacher') {
        alert('Unauthorized access! Redirecting to login.');
        window.location.href = '/auth/login.html';
        return;
    }

    // ═══ SIDEBAR TOGGLE ═══
    initSidebarToggle();

    // ═══ LOAD PROFILE ═══
    await loadProfile();

    // ═══ TAB SWITCHING ═══
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`tab-${tabName}`).classList.add('active');

            if (tabName === 'history') loadHistory();
        });
    });

    // ═══ GENERAL FORM SUBMIT ═══
    document.getElementById('general-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const displayName = document.getElementById('display-name').value.trim();
        const email = document.getElementById('email').value.trim();

        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const res = await fetch('/api/teacher/profile', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName, email })
            });

            if (res.status === 401 || res.status === 403) {
                handleSessionExpired();
                return;
            }

            const data = await res.json();

            if (res.ok) {
                // Server decides if anything actually changed
                if (data.changed === false) {
                    showToast('No changes to save.', 'info');
                } else {
                    showToast('Profile updated successfully!', 'success');
                }

                if (data.profile) {
                    updateProfileUI(data.profile);
                    localStorage.setItem(
                        'userName',
                        data.profile.displayName || data.profile.name || ''
                    );
                }

                // If user is on Activity Log tab, refresh it
                if (document.getElementById('tab-history').classList.contains('active')) {
                    loadHistory();
                }
            } else {
                showToast(data.error || 'Failed to update profile', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // ═══ PASSWORD FORM SUBMIT ═══
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');

    newPasswordInput.addEventListener('input', updateStrengthMeter);
    confirmPasswordInput.addEventListener('input', updateMatchHint);

    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPassword = document.getElementById('current-password').value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }

        if (!confirm('Are you sure you want to change your password?\n\nAll other devices will be logged out for your security.')) {
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Changing...';

        try {
            const res = await fetch('/api/teacher/profile/password', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            if (res.status === 401 || res.status === 403) {
                handleSessionExpired();
                return;
            }

            const data = await res.json();

            if (res.ok) {
                showToast(data.message || 'Password changed successfully!', 'success');
                document.getElementById('password-form').reset();
                updateStrengthMeter();
                updateMatchHint();
                await loadProfile();
            } else {
                showToast(data.error || 'Failed to change password', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Change Password';
        }
    });
});


/* ═══════════════════════════════════════════════════════
   SESSION
   ═══════════════════════════════════════════════════════ */
function handleSessionExpired() {
    showToast('Session expired. Please log in again.', 'error');
    setTimeout(() => {
        window.location.href = '/auth/login.html';
    }, 1500);
}


/* ═══════════════════════════════════════════════════════
   LOAD PROFILE
   ═══════════════════════════════════════════════════════ */
async function loadProfile() {
    try {
        const res = await fetch('/api/teacher/profile', {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.status === 401 || res.status === 403) {
            handleSessionExpired();
            return;
        }

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to load profile');
        }

        const profile = await res.json();
        updateProfileUI(profile);
    } catch (err) {
        console.error('Load profile error:', err);
        showToast('Failed to load profile: ' + err.message, 'error');
    }
}


/* ═══════════════════════════════════════════════════════
   UPDATE PROFILE UI
   ═══════════════════════════════════════════════════════ */
function updateProfileUI(profile) {
    if (!profile) return;

    const displayName = profile.displayName || profile.name || 'Teacher';
    const username = profile.username || 'unknown';
    const role = profile.role || 'teacher';
    const email = profile.email || '';
    const createdAtRaw = profile.createdAt || profile.joinedAt || null;
    const initial = displayName.charAt(0).toUpperCase();

    // Avatar
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) avatarEl.innerHTML = `<span>${escapeHtml(initial)}</span>`;

    // Display name
    const nameEl = document.getElementById('profile-display-name');
    if (nameEl) nameEl.textContent = displayName;

    // Role badge
    const roleEl = document.getElementById('profile-role-badge');
    if (roleEl) {
        roleEl.textContent = role === 'teacher' ? '👨‍🏫 Teacher' : '👤 User';
    }

    // Meta line: @username · Member since Month Year
    const metaEl = document.getElementById('profile-meta');
    if (metaEl) {
        let memberSince = '';
        if (createdAtRaw) {
            const d = new Date(createdAtRaw);
            if (!isNaN(d.getTime())) {
                memberSince = d.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long'
                });
            }
        }
        metaEl.innerHTML = `<strong>@${escapeHtml(username)}</strong> · Member since ${escapeHtml(memberSince || 'Unknown')}`;
    }

    // Form inputs
    const displayInput = document.getElementById('display-name');
    if (displayInput) displayInput.value = displayName;

    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = email;

    // Security tab
    const usernameDisplay = document.getElementById('current-username-display');
    if (usernameDisplay) usernameDisplay.textContent = username;

    const lastChangeEl = document.getElementById('last-password-change');
    if (lastChangeEl) {
        const lastChangeRaw = profile.lastPasswordChange || profile.passwordChangedAt || null;
        let lastChange = 'Never';
        if (lastChangeRaw) {
            const d = new Date(lastChangeRaw);
            if (!isNaN(d.getTime())) {
                lastChange = d.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        }
        lastChangeEl.textContent = lastChange;
    }
}


/* ═══════════════════════════════════════════════════════
   PASSWORD STRENGTH METER
   ═══════════════════════════════════════════════════════ */
function updateStrengthMeter() {
    const password = document.getElementById('new-password').value;
    const fill = document.getElementById('strength-fill');
    const text = document.getElementById('strength-text');

    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const levels = [
        { width: '0%', color: '#e2e8f0', label: 'Enter a password' },
        { width: '20%', color: '#ef4444', label: 'Very Weak' },
        { width: '40%', color: '#f97316', label: 'Weak' },
        { width: '60%', color: '#eab308', label: 'Fair' },
        { width: '80%', color: '#84cc16', label: 'Good' },
        { width: '90%', color: '#22c55e', label: 'Strong' },
        { width: '100%', color: '#15803d', label: 'Very Strong' },
    ];

    const level = levels[Math.min(strength, levels.length - 1)];
    fill.style.width = level.width;
    fill.style.background = level.color;
    text.textContent = level.label;
    text.style.color = level.color;
}

function updateMatchHint() {
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    const hint = document.getElementById('match-hint');

    if (!confirmPass) {
        hint.textContent = '';
        hint.style.color = '';
        return;
    }

    if (newPass === confirmPass) {
        hint.textContent = '✓ Passwords match';
        hint.style.color = '#16a34a';
    } else {
        hint.textContent = '✗ Passwords do not match';
        hint.style.color = '#ef4444';
    }
}


/* ═══════════════════════════════════════════════════════
   ACTIVITY LOG — ACCOUNT CHANGES ONLY
   (Login/logout events live in the admin dashboard.)
   ═══════════════════════════════════════════════════════ */

// Type → { icon, label, color-class }
const ACTIVITY_META = {
    // Profile changes
    profile_updated:    { icon: '👤', label: 'Profile Updated',       color: 'warning' },
    display_name:       { icon: '👤', label: 'Display Name Changed',  color: 'warning' },
    email:              { icon: '📧', label: 'Email Changed',         color: 'warning' },
    email_updated:      { icon: '📧', label: 'Email Updated',         color: 'warning' },

    // Security
    password:           { icon: '🔑', label: 'Password Changed',      color: 'warning' },
    password_changed:   { icon: '🔑', label: 'Password Changed',      color: 'warning' },
    change_password:    { icon: '🔑', label: 'Password Changed',      color: 'warning' },

    // Username (admin-managed, but if it ever changes, log it)
    username:           { icon: '🆔', label: 'Username Changed',      color: 'warning' },

    // Preferences / misc
    preferences_updated:{ icon: '⚙️', label: 'Preferences Updated',   color: 'warning' },
    avatar_updated:     { icon: '🖼️', label: 'Avatar Updated',        color: 'warning' },

    // Default fallback
    default:            { icon: '📌', label: 'Account Activity',      color: '' },
};

async function loadHistory() {
    const container = document.getElementById('history-list');

    container.innerHTML = '<div class="loading-state">Loading activity history...</div>';

    try {
        const res = await fetch('/api/teacher/profile/history', {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.status === 401 || res.status === 403) {
            handleSessionExpired();
            return;
        }

        if (!res.ok) throw new Error('Failed to load history');

        const data = await res.json();

        // ✅ Filter out any login/logout events — those belong to admin
        const IGNORED_TYPES = new Set([
            'login_success', 'login_failed',
            'logout', 'login', 'signin', 'signout',
        ]);

        const history = (data.history || []).filter(item => {
            const type = (item.change_type || item.type || '').toLowerCase();
            return !IGNORED_TYPES.has(type);
        });

        if (history.length === 0) {
            container.innerHTML =
                '<div class="loading-state">No account changes recorded yet.</div>';
            return;
        }

        container.innerHTML = history.map(renderActivityItem).join('');
    } catch (err) {
        console.error('Load history error:', err);
        container.innerHTML =
            '<div class="loading-state" style="color:#ef4444;">Failed to load history.</div>';
    }
}

function renderActivityItem(item) {
    const rawType = (item.change_type || item.type || '').toLowerCase();
    const meta = ACTIVITY_META[rawType] || ACTIVITY_META.default;

    // Prefer server-provided label if it exists (keeps admin/backend in control)
    const label = item.label || meta.label;
    const icon = meta.icon;

    // Build the details line — human readable
    let details = '';

    if (item.details) {
        // Server supplied a friendly description
        details = escapeHtml(item.details);
    } else if (item.old_value || item.new_value) {
        // Show "from → to"
        const from = escapeHtml(item.old_value || '—');
        const to   = escapeHtml(item.new_value || '—');
        details = `From <strong>${from}</strong> to <strong>${to}</strong>`;
    } else if (rawType === 'password' || rawType === 'password_changed' || rawType === 'change_password') {
        details = 'Password was successfully updated.';
    } else if (rawType === 'profile_updated') {
        details = 'Profile information was updated.';
    } else {
        details = 'Account change recorded.';
    }

    // Device + location line (no raw IP for teacher view)
    const metaParts = [];
    if (item.device) metaParts.push(escapeHtml(item.device));
    if (item.location) metaParts.push(escapeHtml(item.location));

    const metaLine = metaParts.length
        ? `<div class="history-item-meta">${metaParts.join(' · ')}</div>`
        : '';

    const date = formatDate(item.timestamp);

    return `
        <div class="history-item ${meta.color ? 'history-item-' + meta.color : ''}">
            <div class="history-item-info">
                <div class="history-item-type">${icon} ${escapeHtml(label)}</div>
                <div class="history-item-details">${details}</div>
                ${metaLine}
            </div>
            <div class="history-item-date">${escapeHtml(date)}</div>
        </div>
    `;
}

function formatDate(timestamp) {
    if (!timestamp) return '—';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}


/* ═══════════════════════════════════════════════════════
   SIDEBAR TOGGLE
   ═══════════════════════════════════════════════════════ */
function initSidebarToggle() {
    const sidebar = document.getElementById('app-sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const expandBtn = document.getElementById('sidebar-expand-btn');

    if (!sidebar || !mainContent || !toggleBtn || !expandBtn) return;

    const toggleIcon = toggleBtn.querySelector('.toggle-icon');

    let isCollapsed = false;
    try {
        isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    } catch (e) {
        console.warn('Unable to restore sidebar preference.', e);
    }

    function applySidebarState(collapsed) {
        sidebar.classList.toggle('collapsed', collapsed);
        mainContent.classList.toggle('sidebar-collapsed', collapsed);
        expandBtn.classList.toggle('visible', collapsed);

        toggleBtn.setAttribute('aria-expanded', String(!collapsed));
        expandBtn.setAttribute('aria-expanded', String(collapsed));

        toggleBtn.setAttribute(
            'aria-label',
            collapsed ? 'Expand sidebar' : 'Collapse sidebar'
        );
        toggleBtn.setAttribute(
            'title',
            collapsed ? 'Expand sidebar' : 'Collapse sidebar'
        );

        // ✅ Toggle Font Awesome classes (keep the <i> element intact)
        if (toggleIcon) {
            toggleIcon.classList.toggle('fa-chevron-left', !collapsed);
            toggleIcon.classList.toggle('fa-chevron-right', collapsed);
        }

        try {
            localStorage.setItem('sidebar-collapsed', String(collapsed));
        } catch (e) {
            console.warn('Unable to save sidebar preference.', e);
        }
    }

    applySidebarState(isCollapsed);

    let isAnimating = false;

    function toggleSidebar() {
        if (isAnimating) return;
        isAnimating = true;

        isCollapsed = !sidebar.classList.contains('collapsed');
        applySidebarState(isCollapsed);

        setTimeout(() => { isAnimating = false; }, 350);
    }

    toggleBtn.addEventListener('click', toggleSidebar);
    expandBtn.addEventListener('click', toggleSidebar);
}


/* ═══════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════ */
function showToast(message, type = 'success') {
    let toast = document.getElementById('profile-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'profile-toast';
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 14px 22px;
            border-radius: 10px; font-weight: 600; font-size: 0.9rem;
            z-index: 99999; box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            transition: all 0.3s ease; max-width: 420px;
            font-family: 'Inter', sans-serif;
        `;
        document.body.appendChild(toast);
    }

    const colors = {
        success: '#16a34a',
        error:   '#ef4444',
        info:    '#0c2f6b',
    };

    toast.style.background = colors[type] || colors.success;
    toast.style.color = '#ffffff';
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
    }, 4000);
}


/* ═══════════════════════════════════════════════════════
   UTIL
   ═══════════════════════════════════════════════════════ */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}