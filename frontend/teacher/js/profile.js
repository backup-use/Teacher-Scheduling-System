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
        console.log("📦 Teacher profile data received:", profile);
        updateProfileUI(profile);
    } catch (err) {
        console.error('Load profile error:', err);
        showToast('Failed to load profile: ' + err.message, 'error');
    }
}

// ═══ UPDATE PROFILE UI ═══
function updateProfileUI(profile) {
    if (!profile) return;

    const displayName = profile.displayName || profile.name || 'Teacher';
    const username = profile.username || 'unknown';
    const role = profile.role || 'teacher';
    const email = profile.email || '';
    const createdAt = profile.createdAt ? new Date(profile.createdAt) : new Date();
    const initial = displayName.charAt(0).toUpperCase();

    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) avatarEl.innerHTML = `<span>${initial}</span>`;

    const nameEl = document.getElementById('profile-display-name');
    if (nameEl) nameEl.textContent = displayName;

    const roleEl = document.getElementById('profile-role-badge');
    if (roleEl) roleEl.textContent = role === 'teacher' ? '👨‍🏫 Teacher' : '👤 User';

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
        hint.textContent = '✓ Passwords match';
        hint.style.color = '#16a34a';
    } else {
        hint.textContent = '✗ Passwords do not match';
        hint.style.color = '#ef4444';
    }
}

// ═══ LOAD HISTORY (with merged audit + profile changes) ═══
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
        
        if (!data.history || data.history.length === 0) {
            container.innerHTML = '<div class="loading-state">No activity recorded yet.</div>';
            return;
        }
        
        container.innerHTML = data.history.map(item => {
            let typeLabel = '';
            let details = '';
            
            if (item.source === 'audit') {
                // Events from audit_logs
                typeLabel = {
                    'login_success': '✅ Login Successful',
                    'login_failed': '❌ Login Failed',
                    'change_password': '🔒 Password Changed',
                    'change_password_failed': '❌ Password Change Failed',
                    'reset_password_success': '🔑 Password Reset',
                    'reset_password_failed': '❌ Password Reset Failed',
                    'update_profile': '👤 Profile Updated',
                    'logout': '🚪 Logout',
                }[item.change_type] || `🔔 ${item.change_type}`;
                details = item.ip_address ? `IP: <strong>${escapeHtml(item.ip_address)}</strong>` : '';
            } else {
                // Events from user_profile_changes
                typeLabel = {
                    'username': '🔑 Username Changed',
                    'password': '🔒 Password Changed',
                    'display_name': '👤 Display Name Changed',
                    'email': '📧 Email Changed',
                }[item.change_type] || item.change_type;
                
                if (item.change_type === 'display_name' || item.change_type === 'email' || item.change_type === 'username') {
                    details = `From <strong>${escapeHtml(item.old_value || '')}</strong> to <strong>${escapeHtml(item.new_value || '')}</strong>`;
                } else if (item.change_type === 'password') {
                    details = 'Password was updated';
                }
            }
            
            const date = new Date(item.timestamp).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            
            return `
                <div class="history-item">
                    <div class="history-item-info">
                        <div class="history-item-type">${typeLabel}</div>
                        <div class="history-item-details">${details}</div>
                    </div>
                    <div class="history-item-date">${date}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Load history error:', err);
        container.innerHTML = '<div class="loading-state" style="color: #ef4444;">Failed to load history.</div>';
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
        if (icon) icon.textContent = '▶';
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
            if (icon) icon.textContent = nowCollapsed ? '▶' : '◀';

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