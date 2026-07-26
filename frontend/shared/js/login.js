document.addEventListener('DOMContentLoaded', () => {
    // --- 1. LOGOUT TOAST TOKENS & UTILITIES ---
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('logout') === 'success') {
        const toast = document.getElementById('logout-toast');
        if (toast) {
            toast.classList.remove('hidden');
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => { toast.classList.add('hidden'); }, 3000);
        }
    }

    // --- 2. PASSWORD VISIBILITY EYE TOGGLE ENGINE ---
    // Targets your existing structural class selectors
    const pwWrapper = document.querySelector('.pw-wrap');
    if (pwWrapper) {
        const passwordInput = pwWrapper.querySelector('input');
        const togglePasswordBtn = pwWrapper.querySelector('.pw-toggle');

        if (passwordInput && togglePasswordBtn) {
            togglePasswordBtn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevents accidental form submissions if button behaves weirdly
                
                // Determine current state
                const isPassword = passwordInput.getAttribute('type') === 'password';
                
                // Toggle input masking type
                passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
                
                // Optional: If you want to cycle visual icon indicators dynamically
                // togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
            });
        }
    }

    // --- 3. LOGIN FORM SUBMISSION ENGINE ---
    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-message');

    if (!loginForm) return;

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
});