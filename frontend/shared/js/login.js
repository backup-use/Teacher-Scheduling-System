document.addEventListener('DOMContentLoaded', () => {
    // --- 1. LOGOUT TOAST TOKENS & UTILITIES ---
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('logout') === 'success') {
        const toast = document.getElementById('logout-toast');
        if (toast) {
            toast.classList.remove('hidden');
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => { toast.classList.add('hidden'); }, 8000);
        }
    }

    // --- 2. PASSWORD VISIBILITY EYE TOGGLE ENGINE ---
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

    // --- 3. LOGIN FORM SUBMISSION ENGINE ---
    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-msg') || document.getElementById('error-message');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('userRole', data.role);
                    localStorage.setItem('userName', data.name);
                    
                    if (data.teacherId) {
                        localStorage.setItem('teacherId', data.teacherId);
                    }

                    if (data.role === 'admin') {
                        window.location.href = '/admin/pages/Addteacher.html';
                    } else if (data.role === 'teacher') {
                        window.location.href = '/teacher/pages/index.html'; 
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

    // --- 4. FORGOT PASSWORD MODAL ENGINE ---
    const modal = document.getElementById('forgot-modal');
    const forgotBtn = document.getElementById('forgot-pw-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const sendBtn = document.getElementById('send-reset-btn');
    
    const resetEmailInput = document.getElementById('reset-email-input');
    const missingEmailSection = document.getElementById('missingEmailSection');
    const resetTempEmail = document.getElementById('resetTempEmail');
    const resetSecurityKey = document.getElementById('resetSecurityKey');

    // Reset Form Fields Helper
    const resetModalForm = () => {
        if (resetEmailInput) resetEmailInput.value = '';
        if (resetTempEmail) resetTempEmail.value = '';
        if (resetSecurityKey) resetSecurityKey.value = '';
        if (missingEmailSection) missingEmailSection.style.display = 'none';
    };

    if (forgotBtn && modal) {
        // Open Modal
        forgotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resetModalForm();
            modal.style.display = 'flex';
        });

        // Close Modal
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.style.display = 'none';
                resetModalForm();
            });
        }

        // Send Reset Request
        if (sendBtn) {
            sendBtn.addEventListener('click', async () => {
                const identifier = resetEmailInput ? resetEmailInput.value.trim() : '';
                const temporaryEmail = resetTempEmail ? resetTempEmail.value.trim() : '';
                const securityKey = resetSecurityKey ? resetSecurityKey.value.trim() : '';

                if (!identifier) {
                    alert('Please enter your Username or Email address.');
                    return;
                }

                const originalText = sendBtn.innerText;
                sendBtn.innerText = 'Sending...';
                sendBtn.disabled = true;

                try {
                    const res = await fetch('/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ identifier, temporaryEmail, securityKey })
                    });

                    const data = await res.json();

                    // Account exists but needs temporary email & security key
                    if (res.status === 202 && data.requiresVerification) {
                        alert(data.message || 'Account found without an email. Please provide an email and Security Key.');
                        if (missingEmailSection) {
                            missingEmailSection.style.display = 'block';
                        }
                    } else if (res.ok) {
                        alert(data.message || 'Password reset link sent!');
                        modal.style.display = 'none';
                        resetModalForm();
                    } else {
                        alert(data.error || 'Failed to send reset link.');
                    }
                } catch (err) {
                    console.error('Error sending reset email:', err);
                    alert('Failed to send reset link. Please check your network or server.');
                } finally {
                    sendBtn.innerText = originalText;
                    sendBtn.disabled = false;
                }
            });
        }
    }
});