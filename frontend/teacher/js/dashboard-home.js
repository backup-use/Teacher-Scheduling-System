document.addEventListener('DOMContentLoaded', () => {
    // ═══ 1. Session Protection ═══
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName');

    if (!token || role !== 'teacher') {
        alert('Unauthorized access! Please login to your teacher account.');
        window.location.href = '/index.html';
        return;
    }

    // ═══ 2. Set Personal Welcome Text ═══
    const welcomeText = document.getElementById('welcome-text');
    if (welcomeText && userName) {
        welcomeText.textContent = `Welcome back, Instructor ${userName}!`;
    }

    // ═══ 3. Handle Logout Request ═══
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear();
            window.location.href = '/index.html?logout=success';
        });
    }

    // ═══════════════════════════════════════════════════════
    // ═══ TODAY'S SCHEDULE HELPERS ═══
    // ═══════════════════════════════════════════════════════
    function getTodayDayName() {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return days[new Date().getDay()];
    }

    function getTodayDateString() {
        const today = new Date();
        return today.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    function isWeekend() {
        const day = new Date().getDay();
        return day === 0 || day === 6;
    }

    // ─── Philippine Holidays (Fixed Dates) ───
    function getHoliday(date) {
        const month = date.getMonth() + 1;
        const day = date.getDate();

        const holidays = {
            "1-1": "New Year's Day",
            "4-9": "Araw ng Kagitingan (Day of Valor)",
            "5-1": "Labor Day",
            "6-12": "Independence Day",
            "8-21": "Ninoy Aquino Day",
            "8-26": "National Heroes Day",
            "11-1": "All Saints' Day",
            "11-2": "All Souls' Day",
            "11-30": "Bonifacio Day",
            "12-8": "Feast of the Immaculate Conception",
            "12-24": "Christmas Eve",
            "12-25": "Christmas Day",
            "12-30": "Rizal Day",
            "12-31": "Last Day of the Year"
        };

        return holidays[`${month}-${day}`] || null;
    }

    function formatTime(time24) {
        if (!time24) return '';
        const [hours, minutes] = time24.split(':');
        const h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${minutes} ${ampm}`;
    }

    function calculateDuration(start, end) {
        if (!start || !end) return 0;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
    }

    function formatMinutes(mins) {
        if (mins < 60) return `${mins} min`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ═══════════════════════════════════════════════════════
    // ═══ RENDER TODAY'S SCHEDULE ═══
    // ═══════════════════════════════════════════════════════
    function renderTodaySchedule(teacherClasses) {
        const todayTitle = document.getElementById('today-title');
        const todayDate = document.getElementById('today-date');
        const todayBody = document.getElementById('today-body');

        const todayDayName = getTodayDayName();
        const todayDateStr = getTodayDateString();

        todayTitle.textContent = "Today's Schedule";
        todayDate.textContent = todayDateStr;

        // ─── Weekend check ───
        if (isWeekend()) {
            const dayName = getTodayDayName();
            const emoji = dayName === 'Saturday' ? '🎉' : '☀️';
            todayBody.innerHTML = `
                <div class="holiday-message weekend">
                    <span class="holiday-icon">${emoji}</span>
                    <div class="holiday-title">It's ${dayName}!</div>
                    <p class="holiday-subtitle">Enjoy your rest day. No classes scheduled today.</p>
                </div>
            `;
            return;
        }

        // ─── Holiday check ───
        const holiday = getHoliday(new Date());
        if (holiday) {
            todayBody.innerHTML = `
                <div class="holiday-message special">
                    <span class="holiday-icon">🎄</span>
                    <div class="holiday-title">${holiday}</div>
                    <p class="holiday-subtitle">It's a holiday today. No classes scheduled.</p>
                </div>
            `;
            return;
        }

        // ─── Filter today's classes ───
        const todayClasses = teacherClasses
            .filter(slot => (slot.day || '').toLowerCase() === todayDayName.toLowerCase())
            .sort((a, b) => {
                const aTime = (a.startTime || '00:00').replace(':', '');
                const bTime = (b.startTime || '00:00').replace(':', '');
                return aTime.localeCompare(bTime);
            });

        // ─── No classes today ───
        if (todayClasses.length === 0) {
            todayBody.innerHTML = `
                <div class="no-classes-message">
                    <span class="no-classes-icon">☕</span>
                    <div class="no-classes-title">No Classes Today</div>
                    <p class="no-classes-subtitle">You have no scheduled classes for ${todayDayName}. Enjoy your free time!</p>
                </div>
            `;
            return;
        }

        // ─── Calculate total ───
        const totalMinutes = todayClasses.reduce((sum, slot) => {
            return sum + calculateDuration(slot.startTime, slot.endTime);
        }, 0);

        // ─── Build class list ───
        const classListHTML = todayClasses.map(slot => {
            const duration = calculateDuration(slot.startTime, slot.endTime);
            const roomText = slot.room && slot.room !== 'N/A' ? slot.room : null;
            const sectionText = slot.section || '';

            return `
                <div class="today-class-item">
                    <div class="class-time-block">
                        <div class="class-time">${formatTime(slot.startTime)} – ${formatTime(slot.endTime)}</div>
                        <div class="class-duration">${formatMinutes(duration)}</div>
                    </div>
                    <div class="class-info-block">
                        <div class="class-subject">${escapeHtml(slot.subject || 'Untitled')}</div>
                        <div class="class-meta">
                            ${sectionText ? `<span class="meta-item">🏫 Section ${escapeHtml(sectionText)}</span>` : ''}
                            ${roomText ? `<span class="meta-item">🚪 Room ${escapeHtml(roomText)}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // ─── Total summary ───
        const totalHTML = `
            <div class="today-total">
                <span class="total-item">📚 ${todayClasses.length} ${todayClasses.length === 1 ? 'Class' : 'Classes'}</span>
                <span class="total-item">⏱️ ${formatMinutes(totalMinutes)} Total</span>
            </div>
        `;

        todayBody.innerHTML = `<div class="today-classes-list">${classListHTML}</div>${totalHTML}`;
    }

    // ═══════════════════════════════════════════════════════
    // ═══ MAIN DATA LOADER ═══
    // ═══════════════════════════════════════════════════════
    async function loadDashboardStats() {
        try {
            const sessionToken = localStorage.getItem('token');

            const response = await fetch('/api/teacher/schedule', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Database fetch mismatch.');

            const data = await response.json();
            const schedule = data.schedule;
            const slots = (schedule && Array.isArray(schedule.slots)) ? schedule.slots : [];

            const uniqueSubjects = new Set(slots.map(s => s.subject).filter(Boolean));

            // ─── Stat cards ───
            document.getElementById('stat-slots').textContent = `${slots.length} Slots`;
            document.getElementById('stat-subjects').textContent = `${uniqueSubjects.size} Active`;

            // ─── Update welcome badge ───
                const badgeText = document.getElementById('badge-text');
                if (badgeText) {
                    if (slots.length > 0) {
                        badgeText.textContent = `${slots.length} Classes Assigned`;
                    } else {
                        badgeText.textContent = 'No Schedule';
                    }
            }
            
            // ─── Today's Schedule ───
            renderTodaySchedule(slots);

            // ─── Quick summary ───
            const summaryBox = document.getElementById('quick-summary-box');
            if (slots.length > 0) {
                summaryBox.innerHTML = `
                    <p style="color: #4caf50; font-weight: bold; margin-bottom: 0.5rem;">✅ Operational Status: Active Schedule Assigned</p>
                    <p>You have <strong>${slots.length} active periods</strong> running across
                    <strong>${uniqueSubjects.size} subjects</strong> this week.</p>
                    <p style="margin-top: 1rem; font-size: 0.9rem; color: #00bcd4;">👉 Click "My Timetable" in the sidebar menu to view your complete week schedule grid or download the PDF copy.</p>
                `;
            } else {
                summaryBox.innerHTML = `
                    <p style="color: #ff9800; font-weight: bold;">⚠️ Operational Notice: No schedule allocated yet</p>
                    <p>The scheduler engine hasn't processed periods for your account yet, or your database targets are still being configured by the system admin.</p>
                `;
            }

        } catch (error) {
            console.error('Error rendering homepage details:', error);

            const quickBox = document.getElementById('quick-summary-box');
            if (quickBox) {
                quickBox.innerHTML = `<p style="color: #ff5252;">⚠️ Error connecting to server database endpoints.</p>`;
            }

            const todayBody = document.getElementById('today-body');
            if (todayBody) {
                todayBody.innerHTML = `
                    <div class="no-classes-message">
                        <span class="no-classes-icon">⚠️</span>
                        <div class="no-classes-title">Unable to Load Schedule</div>
                        <p class="no-classes-subtitle">Please refresh the page or try again later.</p>
                    </div>
                `;
            }
        }
    }

    loadDashboardStats();
});