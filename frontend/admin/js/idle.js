/* 15-minute idle logout. Include on every authenticated page. */
(function () {
  const IDLE_MS = 15 * 60 * 1000;
  const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
  let idleTimer = null;
  let lastRefresh = 0;

  function goLogout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).finally(() => {
      window.location.href = '/auth/login.html?logout=idle';
    });
  }

  function armTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(goLogout, IDLE_MS);
  }

  function onActivity() {
    armTimer();
    const now = Date.now();
    // Slide the server-side 15-minute window at most once per minute.
    if (now - lastRefresh > 60_000) {
      lastRefresh = now;
      fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => {});
    }
  }

  ACTIVITY_EVENTS.forEach(ev => document.addEventListener(ev, onActivity, { passive: true }));
  armTimer();
})();