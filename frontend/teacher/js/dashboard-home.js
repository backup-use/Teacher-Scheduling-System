
document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. SESSION PROTECTION
    // ==========================================

    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName');

    if (!token || role !== 'teacher') {
        alert('Unauthorized access! Please login to your teacher account.');
        window.location.href = '/auth/login.html';
        return;
    }

    // ==========================================
    // 2. PERSONAL WELCOME TEXT
    // ==========================================

    const welcomeText = document.getElementById('welcome-text');

    if (welcomeText && userName) {
        welcomeText.textContent =
            `Welcome back, Instructor ${userName}!`;
    }

    // ==========================================
    // 3. TODAY'S SCHEDULE HELPERS
    // ==========================================

    function getTodayDayName() {
        const days = [
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday'
        ];

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

    // ==========================================
    // 4. PHILIPPINE HOLIDAYS
    // Fixed-date holidays only
    // ==========================================

    function getHoliday(date) {

        const month = date.getMonth() + 1;
        const day = date.getDate();

        const holidays = {
            '1-1': "New Year's Day",
            '4-9': 'Araw ng Kagitingan (Day of Valor)',
            '5-1': 'Labor Day',
            '6-12': 'Independence Day',
            '8-21': 'Ninoy Aquino Day',
            '8-26': 'National Heroes Day',
            '11-1': "All Saints' Day",
            '11-2': "All Souls' Day",
            '11-30': 'Bonifacio Day',
            '12-8': 'Feast of the Immaculate Conception',
            '12-24': 'Christmas Eve',
            '12-25': 'Christmas Day',
            '12-30': 'Rizal Day',
            '12-31': 'Last Day of the Year'
        };

        return holidays[`${month}-${day}`] || null;
    }

    // ==========================================
    // 5. TIME FORMATTERS
    // ==========================================

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

        let startMinutes = sh * 60 + sm;
        let endMinutes = eh * 60 + em;

        // Handle classes that end after midnight
        if (endMinutes < startMinutes) {
            endMinutes += 24 * 60;
        }

        return endMinutes - startMinutes;
    }

    function formatMinutes(mins) {

        if (mins < 60) {
            return `${mins} min`;
        }

        const h = Math.floor(mins / 60);
        const m = mins % 60;

        return m > 0
            ? `${h}h ${m}m`
            : `${h}h`;
    }

    // ==========================================
    // 6. HTML ESCAPING
    // ==========================================

    function escapeHtml(str) {

        if (str === null || str === undefined) {
            return '';
        }

        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ==========================================
    // 7. RENDER TODAY'S SCHEDULE
    // ==========================================

    function renderTodaySchedule(teacherClasses) {

        const todayTitle = document.getElementById('today-title');
        const todayDate = document.getElementById('today-date');
        const todayBody = document.getElementById('today-body');

        if (!todayTitle || !todayDate || !todayBody) {
            return;
        }

        const todayDayName = getTodayDayName();
        const todayDateStr = getTodayDateString();

        todayTitle.textContent = "Today's Schedule";
        todayDate.textContent = todayDateStr;

        // ------------------------------------------
        // WEEKEND CHECK
        // ------------------------------------------

        if (isWeekend()) {

            const dayName = getTodayDayName();

            const weekendIcon = dayName === 'Saturday'
                ? 'fa-calendar-check'
                : 'fa-sun';

            todayBody.innerHTML = `
                <div class="holiday-message weekend">

                    <span class="holiday-icon" aria-hidden="true">
                        <i class="fa-solid ${weekendIcon}"></i>
                    </span>

                    <div class="holiday-title">
                        It's ${dayName}!
                    </div>

                    <p class="holiday-subtitle">
                        Enjoy your rest day. No classes scheduled today.
                    </p>

                </div>
            `;

            return;
        }

        // ------------------------------------------
        // HOLIDAY CHECK
        // ------------------------------------------

        const holiday = getHoliday(new Date());

        if (holiday) {

            todayBody.innerHTML = `
                <div class="holiday-message special">

                    <span class="holiday-icon" aria-hidden="true">
                        <i class="fa-solid fa-calendar-day"></i>
                    </span>

                    <div class="holiday-title">
                        ${escapeHtml(holiday)}
                    </div>

                    <p class="holiday-subtitle">
                        It's a holiday today. No classes scheduled.
                    </p>

                </div>
            `;

            return;
        }

        // ------------------------------------------
        // FILTER TODAY'S CLASSES
        // ------------------------------------------

        const todayClasses = teacherClasses
            .filter(slot =>
                (slot.day || '').toLowerCase() ===
                todayDayName.toLowerCase()
            )
            .sort((a, b) => {

                const aTime = (a.startTime || '00:00')
                    .replace(':', '');

                const bTime = (b.startTime || '00:00')
                    .replace(':', '');

                return aTime.localeCompare(bTime);
            });

        // ------------------------------------------
        // NO CLASSES TODAY
        // ------------------------------------------

        if (todayClasses.length === 0) {

            todayBody.innerHTML = `
                <div class="no-classes-message">

                    <span class="no-classes-icon" aria-hidden="true">
                        <i class="fa-solid fa-mug-hot"></i>
                    </span>

                    <div class="no-classes-title">
                        No Classes Today
                    </div>

                    <p class="no-classes-subtitle">
                        You have no scheduled classes for
                        ${escapeHtml(todayDayName)}.
                        Enjoy your free time!
                    </p>

                </div>
            `;

            return;
        }

        // ------------------------------------------
        // CALCULATE TOTAL CLASS DURATION
        // ------------------------------------------

        const totalMinutes = todayClasses.reduce((sum, slot) => {

            return sum + calculateDuration(
                slot.startTime,
                slot.endTime
            );

        }, 0);

        // ------------------------------------------
        // BUILD CLASS LIST
        // ------------------------------------------

        const classListHTML = todayClasses.map(slot => {

            const duration = calculateDuration(
                slot.startTime,
                slot.endTime
            );

            const roomText =
                slot.room && slot.room !== 'N/A'
                    ? slot.room
                    : null;

            const sectionText = slot.section || '';

            return `
                <div class="today-class-item">

                    <div class="class-time-block">

                        <div class="class-time">
                            ${escapeHtml(formatTime(slot.startTime))}
                            –
                            ${escapeHtml(formatTime(slot.endTime))}
                        </div>

                        <div class="class-duration">
                            ${formatMinutes(duration)}
                        </div>

                    </div>

                    <div class="class-info-block">

                        <div class="class-subject">
                            ${escapeHtml(slot.subject || 'Untitled')}
                        </div>

                        <div class="class-meta">

                            ${
                                sectionText
                                    ? `
                                        <span class="meta-item">
                                            <i class="fa-solid fa-users"
                                               aria-hidden="true"></i>
                                            Section ${escapeHtml(sectionText)}
                                        </span>
                                    `
                                    : ''
                            }

                            ${
                                roomText
                                    ? `
                                        <span class="meta-item">
                                            <i class="fa-solid fa-door-open"
                                               aria-hidden="true"></i>
                                            Room ${escapeHtml(roomText)}
                                        </span>
                                    `
                                    : ''
                            }

                        </div>

                    </div>

                </div>
            `;

        }).join('');

        // ------------------------------------------
        // TODAY'S TOTALS
        // ------------------------------------------

        const totalHTML = `
            <div class="today-total">

                <span class="total-item">
                    <i class="fa-solid fa-book-open"
                       aria-hidden="true"></i>

                    ${todayClasses.length}
                    ${todayClasses.length === 1 ? 'Class' : 'Classes'}
                </span>

                <span class="total-item">
                    <i class="fa-regular fa-clock"
                       aria-hidden="true"></i>

                    ${formatMinutes(totalMinutes)} Total
                </span>

            </div>
        `;

        // ------------------------------------------
        // DISPLAY SCHEDULE
        // ------------------------------------------

        todayBody.innerHTML = `
            <div class="today-classes-list">
                ${classListHTML}
            </div>

            ${totalHTML}
        `;
    }

    // ==========================================
    // 8. LOAD DASHBOARD DATA
    // ==========================================

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

            if (!response.ok) {
                throw new Error('Unable to retrieve teacher schedule.');
            }

            const data = await response.json();

            const schedule = data.schedule;

            const slots =
                schedule && Array.isArray(schedule.slots)
                    ? schedule.slots
                    : [];

            // --------------------------------------
            // CALCULATE UNIQUE SUBJECTS
            // --------------------------------------

            const uniqueSubjects = new Set(
                slots
                    .map(slot => slot.subject)
                    .filter(Boolean)
            );

            // --------------------------------------
            // UPDATE STATISTICS
            // --------------------------------------

            const statSlots = document.getElementById('stat-slots');
            const statSubjects = document.getElementById('stat-subjects');

            if (statSlots) {
                statSlots.textContent = `${slots.length} Slots`;
            }

            if (statSubjects) {
                statSubjects.textContent = `${uniqueSubjects.size} Subjects`;
            }

            // --------------------------------------
            // UPDATE WELCOME BADGE
            // --------------------------------------

            const badgeText = document.getElementById('badge-text');

            if (badgeText) {

                badgeText.textContent = slots.length > 0
                    ? `${slots.length} Classes Assigned`
                    : 'No Schedule';
            }

            // --------------------------------------
            // RENDER TODAY'S SCHEDULE
            // --------------------------------------

            renderTodaySchedule(slots);

        } catch (error) {

            console.error(
                'Error rendering teacher dashboard:',
                error
            );

            // Update the welcome badge
            const badgeText = document.getElementById('badge-text');

            if (badgeText) {
                badgeText.textContent = 'Schedule Unavailable';
            }

            // Display a user-friendly error message
            const todayBody = document.getElementById('today-body');

            if (todayBody) {

                todayBody.innerHTML = `
                    <div class="no-classes-message">

                        <span class="no-classes-icon" aria-hidden="true">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </span>

                        <div class="no-classes-title">
                            Unable to Load Schedule
                        </div>

                        <p class="no-classes-subtitle">
                            Please refresh the page or try again later.
                        </p>

                    </div>
                `;
            }
        }
    }

    // ==========================================
    // 9. INITIALIZE DASHBOARD
    // ==========================================

    loadDashboardStats();

});
