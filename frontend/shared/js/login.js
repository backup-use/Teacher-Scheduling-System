document.addEventListener('DOMContentLoaded', () => {
    // ═══════════════════════════════════════════════════════
    // 1. LOGOUT TOAST
    // ═══════════════════════════════════════════════════════
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('logout') === 'success') {
        const toast = document.getElementById('logout-toast');
        if (toast) {
            toast.classList.remove('hidden');
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => { toast.classList.add('hidden'); }, 8000);
        }
    }

    // ═══════════════════════════════════════════════════════
    // 2. PASSWORD VISIBILITY EYE TOGGLE (Login Form)
    // ═══════════════════════════════════════════════════════
    const pwWrapper = document.querySelector('.pw-wrap');
    if (pwWrapper) {
        const passwordInput = pwWrapper.querySelector('input');
        const togglePasswordBtn = pwWrapper.querySelector('.pw-toggle');

        if (passwordInput && togglePasswordBtn) {
            togglePasswordBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const isPassword = passwordInput.getAttribute('type') === 'password';
                passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            });
        }
    }

    // ═══════════════════════════════════════════════════════
    // 3. LOGIN FORM SUBMISSION
    // ═══════════════════════════════════════════════════════
    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-msg') || document.getElementById('error-message');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    const user = data.user || {};

                    localStorage.setItem('token', data.token);
                    localStorage.setItem('userRole', user.role || '');
                    localStorage.setItem('userName', user.name || '');
                    localStorage.setItem('userId', user.id || '');

                    if (user.teacher_id) {
                        localStorage.setItem('teacherId', user.teacher_id);
                    } else {
                        localStorage.removeItem('teacherId');
                    }

                    if (user.role === 'admin') {
                        window.location.href = '/admin/pages/Addteacher.html';
                    } else if (user.role === 'teacher') {
                        window.location.href = '/teacher/pages/index.html';
                    } else {
                        console.error('Login succeeded but role is unrecognized:', user.role);
                        if (errorMsg) {
                            errorMsg.textContent = 'Login succeeded but your account role is unrecognized.';
                            errorMsg.classList.remove('hidden');
                        } else {
                            alert('Login succeeded but your account role is unrecognized.');
                        }
                    }
                } else {
                    if (errorMsg) {
                        errorMsg.textContent = data.error || 'Invalid credentials.';
                        errorMsg.classList.remove('hidden');
                    } else {
                        alert(data.error || 'Login failed. Please try again.');
                    }
                }
            } catch (error) {
                console.error('Error during login:', error);
                alert('Server is not responding. Check if server.js is running!');
            }
        });
    }

    // ═══════════════════════════════════════════════════════
    // 4. FORGOT PASSWORD MODAL — USERNAME-BASED RESET
    // ═══════════════════════════════════════════════════════
    const modal = document.getElementById('forgot-modal');
    const forgotBtn = document.getElementById('forgot-pw-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const resetBtn = document.getElementById('reset-password-btn');
    const resetMessage = document.getElementById('reset-message');

    // Input fields
    const resetUsernameInput = document.getElementById('reset-username-input');
    const resetMasterKey = document.getElementById('reset-master-key');
    const resetNewPassword = document.getElementById('reset-new-password');
    const resetConfirmPassword = document.getElementById('reset-confirm-password');

    // ═══════════════════════════════════════════════════════
    // 5. EYE TOGGLE FOR RESET MODAL PASSWORD FIELDS
    // ═══════════════════════════════════════════════════════
    const eyeToggleButtons = document.querySelectorAll('.pw-toggle-eye');

    eyeToggleButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);

            if (!targetInput) return;

            const isCurrentlyPassword = targetInput.getAttribute('type') === 'password';
            targetInput.setAttribute('type', isCurrentlyPassword ? 'text' : 'password');
            btn.classList.toggle('visible', isCurrentlyPassword);
        });
    });

    // Reset form helper
    const resetModalForm = () => {
        if (resetUsernameInput) resetUsernameInput.value = '';
        if (resetMasterKey) resetMasterKey.value = '';
        if (resetNewPassword) resetNewPassword.value = '';
        if (resetConfirmPassword) resetConfirmPassword.value = '';
        if (resetMessage) {
            resetMessage.style.display = 'none';
            resetMessage.textContent = '';
        }

        // ✅ Reset all password fields to hidden
        const passwordInputs = [
            document.getElementById('reset-master-key'),
            document.getElementById('reset-new-password'),
            document.getElementById('reset-confirm-password')
        ];
        passwordInputs.forEach(input => {
            if (input) input.setAttribute('type', 'password');
        });

        // ✅ Reset all eye buttons to default state
        document.querySelectorAll('.pw-toggle-eye').forEach(btn => {
            btn.classList.remove('visible');
        });
    };

    // Show message helper
    function showResetMessage(msg, type = 'error') {
        if (!resetMessage) return;
        resetMessage.style.display = 'block';
        resetMessage.textContent = msg;

        if (type === 'error') {
            resetMessage.style.background = 'rgba(185, 28, 28, 0.1)';
            resetMessage.style.color = '#991b1b';
            resetMessage.style.border = '1px solid rgba(185, 28, 28, 0.3)';
        } else if (type === 'success') {
            resetMessage.style.background = 'rgba(34, 197, 94, 0.1)';
            resetMessage.style.color = '#166534';
            resetMessage.style.border = '1px solid rgba(34, 197, 94, 0.3)';
        } else {
            resetMessage.style.background = 'rgba(202, 138, 4, 0.1)';
            resetMessage.style.color = '#854d0e';
            resetMessage.style.border = '1px solid rgba(202, 138, 4, 0.3)';
        }
    }

    // Open modal
    if (forgotBtn && modal) {
        forgotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resetModalForm();
            modal.style.display = 'flex';
        });
    }

    // Close modal
    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            resetModalForm();
        });
    }

    // Close on overlay click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                resetModalForm();
            }
        });
    }

    // Submit reset password
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const username = resetUsernameInput ? resetUsernameInput.value.trim() : '';
            const masterKey = resetMasterKey ? resetMasterKey.value : '';
            const newPassword = resetNewPassword ? resetNewPassword.value : '';
            const confirmPassword = resetConfirmPassword ? resetConfirmPassword.value : '';

            // ═══ VALIDATION ═══
            if (!username) {
                showResetMessage('Please enter your username.');
                return;
            }
            if (!masterKey) {
                showResetMessage('Please enter the Master Security Key.');
                return;
            }
            if (!newPassword) {
                showResetMessage('Please enter a new password.');
                return;
            }
            if (newPassword.length < 8) {
                showResetMessage('Password must be at least 8 characters.');
                return;
            }
            if (!/[A-Z]/.test(newPassword)) {
                showResetMessage('Password must contain at least one uppercase letter.');
                return;
            }
            if (!/[a-z]/.test(newPassword)) {
                showResetMessage('Password must contain at least one lowercase letter.');
                return;
            }
            if (!/[0-9]/.test(newPassword)) {
                showResetMessage('Password must contain at least one number.');
                return;
            }
            if (newPassword !== confirmPassword) {
                showResetMessage('Passwords do not match.');
                return;
            }

            // ═══ SUBMIT ═══
            const originalText = resetBtn.innerText;
            resetBtn.innerText = 'Resetting...';
            resetBtn.disabled = true;
            if (resetMessage) resetMessage.style.display = 'none';

            try {
                const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, masterKey, newPassword })
                });

                const data = await res.json();

                if (res.ok) {
                    // ✅ Ipakita muna yung success message
                    showResetMessage(
                        data.message || 'Password reset successfully! You can now log in with your new password.',
                        'success'
                    );

                    // ✅ Clear lang yung input fields (huwag i-touch yung message)
                    if (resetUsernameInput) resetUsernameInput.value = '';
                    if (resetMasterKey) resetMasterKey.value = '';
                    if (resetNewPassword) resetNewPassword.value = '';
                    if (resetConfirmPassword) resetConfirmPassword.value = '';

                    // ✅ Reset eye toggle states
                    const passwordInputs = [
                        document.getElementById('reset-master-key'),
                        document.getElementById('reset-new-password'),
                        document.getElementById('reset-confirm-password')
                    ];
                    passwordInputs.forEach(input => {
                        if (input) input.setAttribute('type', 'password');
                    });
                    document.querySelectorAll('.pw-toggle-eye').forEach(btn => {
                        btn.classList.remove('visible');
                    });

                    // ✅ Auto-close modal after 3 seconds (kasabay yung message)
                    setTimeout(() => {
                        modal.style.display = 'none';
                        if (resetMessage) {
                            resetMessage.style.display = 'none';
                            resetMessage.textContent = '';
                        }
                    }, 3000);

                } else {
                    showResetMessage(data.error || 'Failed to reset password.');
                }
            } catch (err) {
                console.error('Reset password error:', err);
                showResetMessage('Network error. Please try again.');
            } finally {
                resetBtn.innerText = originalText;
                resetBtn.disabled = false;
            }
        });
    }
});