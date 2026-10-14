document.addEventListener('DOMContentLoaded', async () => {
    // ═══ AUTH CHECK ═══
    const role = localStorage.getItem('userRole');
    if (role && role !== 'admin') {
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

            if (tabName === 'history' && !auditLoaded) {
                auditOffset = 0;
                loadAuditLog();
            }
        });
    });

    // ═══ GENERAL FORM SUBMIT ═══
    document.getElementById('general-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const displayName = document.getElementById('display-name').value.trim();
        const email = document.getElementById('email').value.trim();

        try {
            const res = await fetch('/api/admin/profile', {
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
                showToast('Profile updated successfully!', 'success');
                if (data.profile) {
                    updateProfileUI(data.profile);
                    localStorage.setItem('userName', data.profile.displayName || data.profile.name);
                }
            } else {
                showToast(data.error || 'Failed to update profile', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error', 'error');
        }
    });

    // ═══ USERNAME FORM SUBMIT ═══
    document.getElementById('username-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const newUsername = document.getElementById('new-username').value.trim();
        const currentPassword = document.getElementById('username-current-password').value;

        if (!confirm(`Are you sure you want to change your username to "${newUsername}"?\n\nYou will need to use this new username next time you log in.`)) {
            return;
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Updating...';

        try {
            const res = await fetch('/api/admin/profile/username', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newUsername, currentPassword })
            });

            if (res.status === 401 || res.status === 403) {
                handleSessionExpired();
                return;
            }

            const data = await res.json();

            if (res.ok) {
                showToast(data.message || 'Username updated successfully!', 'success');
                document.getElementById('current-username-display').textContent = newUsername;
                document.getElementById('username-form').reset();
            } else {
                showToast(data.error || 'Failed to update username', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Network error', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Update Username';
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
            const res = await fetch('/api/admin/profile/password', {
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

// ═══ HELPER: HANDLE SESSION EXPIRY ═══
function handleSessionExpired() {
    showToast('Session expired. Please log in again.', 'error');
    setTimeout(() => {
        window.location.href = '/auth/login.html';
    }, 1500);
}

// ═══ LOAD PROFILE ═══
async function loadProfile() {
    try {
        const res = await fetch('/api/admin/profile', {
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

// ═══ UPDATE PROFILE UI ═══
function updateProfileUI(profile) {
    if (!profile) return;

    const displayName = profile.displayName || profile.name || 'Administrator';
    const username = profile.username || 'unknown';
    const role = profile.role || 'admin';
    const email = profile.email || '';
    const createdAt = profile.createdAt ? new Date(profile.createdAt) : new Date();
    const initial = displayName.charAt(0).toUpperCase();

    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) avatarEl.innerHTML = `<span>${initial}</span>`;

    const nameEl = document.getElementById('profile-display-name');
    if (nameEl) nameEl.textContent = displayName;

    const roleEl = document.getElementById('profile-role-badge');
    if (roleEl) roleEl.textContent = role === 'admin' ? 'Administrator' : 'Teacher';

    const metaEl = document.getElementById('profile-meta');
    if (metaEl) {
        metaEl.innerHTML = `<strong>@${username}</strong> · Member since ${createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`;
    }

    const displayInput = document.getElementById('display-name');
    if (displayInput) displayInput.value = displayName;

    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = email;

    const usernameDisplay = document.getElementById('current-username-display');
    if (usernameDisplay) usernameDisplay.textContent = username;

    const lastChangeEl = document.getElementById('last-password-change');
    if (lastChangeEl) {
        const lastChange = profile.lastPasswordChange
            ? new Date(profile.lastPasswordChange).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Never';
        lastChangeEl.textContent = lastChange;
    }
}

// ═══ PASSWORD STRENGTH METER ═══
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
        hint.textContent = 'Passwords match';
        hint.style.color = '#16a34a';
    } else {
        hint.textContent = 'Passwords do not match';
        hint.style.color = '#ef4444';
    }
}

// ═══ SIDEBAR TOGGLE ═══
function initSidebarToggle() {
    const sidebar = document.getElementById('app-sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const expandBtn = document.getElementById('sidebar-expand-btn');

    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed) {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('sidebar-collapsed');
        expandBtn.classList.add('visible');
        const icon = toggleBtn.querySelector('.toggle-icon');
        if (icon) icon.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    }

    let isAnimating = false;

    function toggleSidebar() {
        if (isAnimating) return;
        isAnimating = true;

        requestAnimationFrame(() => {
            const nowCollapsed = sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('sidebar-collapsed', nowCollapsed);
            expandBtn.classList.toggle('visible', nowCollapsed);
            localStorage.setItem('sidebar-collapsed', nowCollapsed);

            const icon = toggleBtn.querySelector('.toggle-icon');
            if (icon) icon.innerHTML = nowCollapsed
                ? '<i class="fa-solid fa-chevron-right"></i>'
                : '<i class="fa-solid fa-chevron-left"></i>';

            setTimeout(() => { isAnimating = false; }, 350);
        });
    }

    toggleBtn.addEventListener('click', toggleSidebar);
    expandBtn.addEventListener('click', toggleSidebar);
}

// ═══ TOAST ═══
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
    toast.style.background = type === 'success' ? '#16a34a' : '#ef4444';
    toast.style.color = '#ffffff';
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ═══ SYSTEM-WIDE ACTIVITY LOG ═══
const AUDIT_PAGE_SIZE = 25;
let auditOffset = 0;
let auditTotal = 0;
let auditLoaded = false;

const auditTbody = document.getElementById("auditTableBody");
const auditActionFilter = document.getElementById("auditActionFilter");
const auditRefreshBtn = document.getElementById("auditRefreshBtn");
const auditPrevBtn = document.getElementById("auditPrevBtn");
const auditNextBtn = document.getElementById("auditNextBtn");
const auditPageInfo = document.getElementById("auditPageInfo");

function formatAuditDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function renderAuditUser(entry) {
    if (entry.displayName) return entry.displayName;
    if (entry.username) return entry.username;
    if (entry.details && entry.details.username) return entry.details.username;
    return "(unknown)";
}

function renderAuditRole(entry) {
    if (entry.role) return entry.role;
    if (entry.details && entry.details.role) return entry.details.role;
    return "—";
}

function renderAuditAction(action) {
    const labels = {
        login_success: "Login",
        logout: "Logout",
        login_failed: "Failed login",
        create_teacher: "Create teacher",
        update_teacher: "Update teacher",
        delete_teacher: "Delete teacher",
        hide_teacher: "Hide teacher",
        unhide_teacher: "Restore teacher",
        create_section: "Create section",
        delete_section: "Delete section",
        create_room: "Create room",
        delete_room: "Delete room",
        create_subject: "Create subject",
        delete_subject: "Delete subject",
        generate_jhs_master: "Generate schedule",
        save_master_schedule: "Save master schedule",
        swap_slots: "Swap slots",
        move_slot: "Move slot",
        change_password: "Change password",
        change_password_failed: "Failed password change",
        reset_password_success: "Reset password",
        reset_password_failed: "Failed password reset",
        update_profile: "Update profile",
        change_username: "Change username",
        change_username_failed: "Failed username change",
        unauthorized_access: "Unauthorized access",
        send_credentials_email: "Credentials emailed",
        send_credentials_email_failed: "Credentials email failed",
    };
    return labels[action] || action;
}

function formatAuditDetails(details) {
    if (!details) return "";
    try {
        const obj = typeof details === "string" ? JSON.parse(details) : details;
        const parts = [];
        if (obj.username && !obj.role) parts.push(`user: ${obj.username}`);
        if (obj.reason) parts.push(`reason: ${obj.reason}`);
        if (obj.name) parts.push(`name: ${obj.name}`);
        if (obj.teacherId) parts.push(`teacherId: ${obj.teacherId}`);
        if (obj.teacherEmail) parts.push(`email: ${obj.teacherEmail}`);
        if (obj.sectionName) parts.push(`section: ${obj.sectionName}`);
        if (obj.roomName) parts.push(`room: ${obj.roomName}`);
        if (obj.subjectId) parts.push(`subjectId: ${obj.subjectId}`);
        if (obj.sections) parts.push(`sections: ${obj.sections}`);
        if (obj.teachers) parts.push(`teachers: ${obj.teachers}`);
        if (obj.slotsSaved) parts.push(`slots: ${obj.slotsSaved}`);
        if (obj.oldUsername) parts.push(`from: ${obj.oldUsername}`);
        if (obj.newUsername) parts.push(`to: ${obj.newUsername}`);
        if (parts.length === 0) {
            return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(", ");
        }
        return parts.join(", ");
    } catch {
        return String(details);
    }
}

async function loadAuditLog() {
    if (!auditTbody) return;
    auditTbody.innerHTML = `<tr><td colspan="6" class="empty">Loading…</td></tr>`;

    const params = new URLSearchParams({
        limit: AUDIT_PAGE_SIZE,
        offset: auditOffset,
    });
    if (auditActionFilter.value) params.set("action", auditActionFilter.value);

    try {
        const res = await fetch(`/api/admin/audit-log?${params.toString()}`, {
            credentials: "include",
        });
        if (res.status === 401 || res.status === 403) {
            handleSessionExpired();
            return;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        auditTotal = data.total;
        auditLoaded = true;
        renderAuditEntries(data.entries);
        renderAuditPagination();
    } catch (err) {
        auditTbody.innerHTML = `<tr><td colspan="6" class="empty error">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderAuditEntries(entries) {
    if (!entries || entries.length === 0) {
        auditTbody.innerHTML = `<tr><td colspan="6" class="empty">No activity yet.</td></tr>`;
        return;
    }

    auditTbody.innerHTML = entries.map(e => {
        const role = renderAuditRole(e);
        return `
            <tr>
                <td class="audit-time">${escapeHtml(formatAuditDate(e.createdAt))}</td>
                <td><strong>${escapeHtml(renderAuditUser(e))}</strong></td>
                <td><span class="role-badge role-${escapeHtml(role)}">${escapeHtml(role)}</span></td>
                <td><span class="audit-action action-${escapeHtml(e.action)}">${escapeHtml(renderAuditAction(e.action))}</span></td>
                <td class="audit-details">${escapeHtml(formatAuditDetails(e.details))}</td>
                <td class="audit-ip">${escapeHtml(e.ipAddress || "—")}</td>
            </tr>
        `;
    }).join("");
}

function renderAuditPagination() {
    const from = auditTotal === 0 ? 0 : auditOffset + 1;
    const to = Math.min(auditOffset + AUDIT_PAGE_SIZE, auditTotal);
    auditPageInfo.textContent = `${from}–${to} of ${auditTotal}`;
    auditPrevBtn.disabled = auditOffset === 0;
    auditNextBtn.disabled = auditOffset + AUDIT_PAGE_SIZE >= auditTotal;
}

if (auditRefreshBtn) {
    auditRefreshBtn.addEventListener("click", () => {
        auditOffset = 0;
        loadAuditLog();
    });

    auditActionFilter.addEventListener("change", () => {
        auditOffset = 0;
        loadAuditLog();
    });

    auditPrevBtn.addEventListener("click", () => {
        auditOffset = Math.max(0, auditOffset - AUDIT_PAGE_SIZE);
        loadAuditLog();
    });

    auditNextBtn.addEventListener("click", () => {
        auditOffset += AUDIT_PAGE_SIZE;
        loadAuditLog();
    });
}