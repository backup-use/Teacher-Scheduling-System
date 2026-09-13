document.addEventListener('DOMContentLoaded', () => {
    // 1. Session Protection check
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName') || '';

    if (!token || role !== 'teacher') {
        alert('Unauthorized access! Redirecting to login.');
        window.location.href = '/index.html';
        return;
    }

    // Dynamic Subject Color Palette matching Admin View
    const subjectColorMap = {
        'ARALING PANLIPUNAN': '#fef08a',
        'ENGLISH': '#dbeafe',
        'FILIPINO': '#e0e7ff',
        'MAPEH': '#f3e8ff',
        'MATHEMATICS': '#ffe4e6',
        'SCIENCE': '#dcfce7',
        'TLE': '#ffedd5',
        'VALUES EDUCATION': '#fef9c3',
        'ESP': '#fef9c3'
    };

    function getSubjectColor(subjectName) {
        if (!subjectName) return '#ffffff';
        const key = subjectName.trim().toUpperCase();
        return subjectColorMap[key] || '#e2e8f0';
    }

    // Set instructor header title dynamically
    const instructorTitleEl = document.getElementById('instructor-title');
    if (instructorTitleEl) {
        instructorTitleEl.textContent = `INSTRUCTOR: ${userName.toUpperCase()}`;
    }

    // Standard operational system hours grid matrix
    const standardTimeSlots = [
        "06:00-07:00",
        "07:00-08:00",
        "08:00-09:00",
        "09:00-10:00", // Recess / Break
        "10:00-11:00",
        "11:00-12:00",
        "12:00-01:00", // Lunch Break
        "01:00-02:00",
        "02:00-03:00",
        "03:00-04:00",
        "04:00-05:00",
        "05:00-06:00"
    ];

    const targetDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    // Clean Fuzzy Name Matching (Handles case sensitivity, extra spaces, middle initial formats, etc.)
    function matchTeacherName(nameA, nameB) {
        if (!nameA || !nameB) return false;
        const cleanA = nameA.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanB = nameB.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
    }

    // Dynamic Style Injection
    if (!document.getElementById("admin-tight-layout-rules")) {
        const adminStyles = document.createElement("style");
        adminStyles.id = "admin-tight-layout-rules";
        adminStyles.innerHTML = `
            body, .main-content, .dashboard-container, main {
                background-color: #0b0f19 !important;
                color: #ffffff !important;
                padding: 15px 20px !important;
                margin: 0 !important;
            }

            .header-container, .page-header, header {
                margin-bottom: 12px !important;
                padding: 0 !important;
            }

            #instructor-title, h1, h2, h3 {
                color: #ffffff !important;
                font-weight: 800 !important;
                margin-top: 0 !important;
                margin-bottom: 4px !important;
            }

            p, .subtitle, .text-muted {
                color: #94a3b8 !important;
                margin-top: 0 !important;
                margin-bottom: 12px !important;
            }

            .timetable-card, .card, .dashboard-card-panel {
                background-color: #0f172a !important;
                border: 1px solid #1e293b !important;
                border-radius: 6px !important;
                padding: 0 !important;
                margin: 0 !important;
                overflow: hidden !important;
            }

            #timetable-container {
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
            }

            #timetable-container table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-family: Arial, sans-serif !important;
                border: 2px solid #000000 !important;
                background-color: #ffffff !important;
                margin: 0 !important;
            }

            #timetable-container table th {
                background-color: #ffffff !important;
                color: #000000 !important;
                text-transform: uppercase !important;
                font-size: 0.88rem !important;
                font-weight: 800 !important;
                padding: 8px 4px !important;
                letter-spacing: 0.5px !important;
                border: 2px solid #000000 !important;
            }

            #timetable-container table td {
                border: 2px solid #000000 !important;
                padding: 4px !important; 
                height: 52px !important; 
                vertical-align: middle !important;
                text-align: center !important;
                box-sizing: border-box !important;
                background-color: #ffffff;
            }

            .time-cell {
                font-weight: 800 !important;
                color: #000000 !important;
                font-size: 0.82rem !important;
                background-color: #ffffff !important;
                width: 110px !important;
                border: 2px solid #000000 !important;
            }

            .recess-row {
                background-color: #fef08a !important;
                color: #854d0e !important;
                font-weight: 800 !important;
                letter-spacing: 1.5px !important;
                font-size: 0.85rem !important;
                border: 2px solid #000000 !important;
                padding: 6px !important;
            }

            .lunch-row {
                background-color: #fed7aa !important;
                color: #9a3412 !important;
                font-weight: 800 !important;
                letter-spacing: 1.5px !important;
                font-size: 0.85rem !important;
                border: 2px solid #000000 !important;
                padding: 6px !important;
            }

            .vacant-cell-fill {
                height: 100% !important;
                width: 100% !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                position: relative !important;
            }

            .vacant-text {
                display: none !important;
            }

            .add-note-btn {
                position: absolute !important;
                bottom: 2px !important;
                right: 2px !important;
                width: 18px !important;
                height: 18px !important;
                border-radius: 3px !important;
                background: #000000 !important; 
                border: none !important;
                color: #ffffff !important;      
                font-size: 0.7rem !important;
                cursor: pointer !important;
                opacity: 0;
                transition: opacity 0.2s ease;
            }

            td:hover .add-note-btn { opacity: 1 !important; }

            .saved-cell-note {
                font-size: 0.75rem !important;
                color: #000000 !important;
                font-style: italic !important;
                font-weight: 700 !important;
            }

            @media print {
                body, .main-content, .timetable-card {
                    background-color: #ffffff !important;
                    color: #000000 !important;
                    padding: 0 !important;
                }
                header, nav, .sidebar, .sidebar-wrapper, .nav-container, 
                button, .btn, .print-actions, #btn-logout, .add-note-btn, 
                .vacant-modal-overlay {
                    display: none !important;
                }
                @page {
                    size: letter landscape;
                    margin: 8mm;
                }
                #timetable-container table {
                    width: 100% !important;
                    border: 2px solid #000000 !important;
                }
                #timetable-container table th, 
                #timetable-container table td {
                    border: 2px solid #000000 !important;
                }
            }
        `;
        document.head.appendChild(adminStyles);
    }

    // Modal Injection for vacant notes
    if (!document.getElementById("vacant-note-modal")) {
        const modalHTML = `
            <div id="vacant-note-modal" class="vacant-modal-overlay">
                <div class="vacant-modal-content">
                    <h3>Personal Task / Memo</h3>
                    <p class="modal-subtitle">What are your plans during this vacant period?</p>
                    <textarea id="modal-note-textarea" placeholder="Example: Checking papers, lesson preparation, break time..."></textarea>
                    <div class="modal-actions-row">
                        <button id="modal-cancel-btn">Cancel</button>
                        <button id="modal-save-btn">Save Note</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    let currentEditingDay = '';
    let currentEditingTime = '';

    window.openVacantNoteModal = function(day, timeSlot) {
        currentEditingDay = day;
        currentEditingTime = timeSlot;
        const storageKey = `note_${userName}_${day}_${timeSlot}`;
        const savedNote = localStorage.getItem(storageKey) || "";
        document.getElementById("modal-note-textarea").value = savedNote;
        document.getElementById("vacant-note-modal").classList.add("modal-active");
    };

    const closeModal = () => {
        document.getElementById("vacant-note-modal").classList.remove("modal-active");
    };

    document.getElementById("modal-cancel-btn")?.addEventListener('click', closeModal);
    
    document.getElementById("modal-save-btn")?.addEventListener('click', () => {
        const noteValue = document.getElementById("modal-note-textarea").value.trim();
        const storageKey = `note_${userName}_${currentEditingDay}_${currentEditingTime}`;
        if (noteValue) {
            localStorage.setItem(storageKey, noteValue);
        } else {
            localStorage.removeItem(storageKey);
        }
        closeModal();
        loadTeacherTimetable(); 
    });

    async function loadTeacherTimetable() {
        const tbody = document.getElementById('timetable-rows');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        let myClassesMap = {};
        let loadedFromApi = false;

        // 1. Attempt API fetch first
        try {
            const response = await fetch('/api/timetable', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }); 

            if (response.ok) {
                const fullTimetable = await response.json();
                if (Array.isArray(fullTimetable) && fullTimetable.length > 0) {
                    loadedFromApi = true;
                    fullTimetable.forEach(slot => {
                        const teacherInSlot = slot.instructor || slot.teacher || slot.teacherName;
                        if (matchTeacherName(teacherInSlot, userName)) {
                            const day = slot.day;
                            const timeSlot = slot.timeSlot || slot.time;
                            if (!myClassesMap[day]) myClassesMap[day] = {};
                            myClassesMap[day][timeSlot] = {
                                subject: slot.subject,
                                section: slot.section || 'Grade 7',
                                room: slot.room || '10'
                            };
                        }
                    });
                }
            }
        } catch (e) {
            console.log("API unavailable, switching to LocalStorage parser...");
        }

        // 2. Fallback: Parse generated data from LocalStorage (Matches generate.js exports)
        if (!loadedFromApi) {

            // A. First Check: Pre-mapped teacher schedules key from generate.js
            const cachedTeacherMapStr = localStorage.getItem("cached_teacher_schedules");
            if (cachedTeacherMapStr) {
                try {
                    const teacherMap = JSON.parse(cachedTeacherMapStr);
                    const matchedKey = Object.keys(teacherMap).find(k => matchTeacherName(k, userName));
                    
                    if (matchedKey && teacherMap[matchedKey]) {
                        const teacherData = teacherMap[matchedKey];
                        myClassesMap = teacherData.days ? teacherData.days : teacherData;
                    }
                } catch (err) {
                    console.error("Error parsing cached_teacher_schedules:", err);
                }
            }

            // B. Second Check: If no direct match found, extract directly from masterSectionSchedules / global_master_schedule
            if (Object.keys(myClassesMap).length === 0) {
                const masterScheduleKeys = ["global_master_schedule", "cached_generated_schedule", "generated_timetable", "master_schedule"];
                let masterData = null;

                for (const key of masterScheduleKeys) {
                    const item = localStorage.getItem(key);
                    if (item) {
                        try {
                            const parsed = JSON.parse(item);
                            // If cached under "cached_generated_schedule", extract masterSectionSchedules property
                            masterData = parsed.masterSectionSchedules || parsed;
                            break;
                        } catch (err) {}
                    }
                }

                if (masterData && typeof masterData === 'object') {
                    // Iterate through each section in the master schedule
                    Object.values(masterData).forEach(secObj => {
                        const sectionName = secObj.details ? secObj.details.name : (secObj.sectionName || '');
                        const timetable = secObj.timetable || {};

                        Object.entries(timetable).forEach(([day, times]) => {
                            Object.entries(times).forEach(([time, slotData]) => {
                                if (slotData && slotData.teacher && matchTeacherName(slotData.teacher, userName)) {
                                    if (!myClassesMap[day]) myClassesMap[day] = {};
                                    myClassesMap[day][time] = {
                                        subject: slotData.subject,
                                        section: sectionName,
                                        room: slotData.room || '10'
                                    };
                                }
                            });
                        });
                    });
                }
            }
        }

        // 3. Render the Grid Matrix
        standardTimeSlots.forEach(timeSlot => {
            const tr = document.createElement('tr');

            // Time Slot Label Column
            const timeCell = document.createElement('td');
            timeCell.className = 'time-cell';
            timeCell.textContent = timeSlot;
            tr.appendChild(timeCell);

            // Recess Row
            if (timeSlot === "09:00-10:00") {
                const breakTd = document.createElement('td');
                breakTd.colSpan = targetDays.length;
                breakTd.className = "recess-row";
                breakTd.textContent = "RECESS / MORNING BREAK";
                tr.appendChild(breakTd);
            }
            // Lunch Row
            else if (timeSlot === "12:00-01:00") {
                const breakTd = document.createElement('td');
                breakTd.colSpan = targetDays.length;
                breakTd.className = "lunch-row";
                breakTd.textContent = "LUNCH BREAK / SHIFT TRANSITION";
                tr.appendChild(breakTd);
            }
            // Academic Class Slot
            else {
                targetDays.forEach(day => {
                    const td = document.createElement('td');
                    const slotData = myClassesMap[day] ? myClassesMap[day][timeSlot] : null;

                    if (slotData) {
                        const cellBg = getSubjectColor(slotData.subject);
                        td.style.backgroundColor = cellBg;
                        td.style.color = '#000000';

                        td.innerHTML = `
                            <div style="font-size: 0.88rem; font-weight: 800; line-height: 1.2; text-transform: uppercase;">
                                ${slotData.subject}
                            </div>
                            <div style="font-size: 0.76rem; font-weight: 600; margin-top: 2px; color: #334155;">
                                ${slotData.section || ''}
                            </div>
                            <div style="font-size: 0.72rem; font-weight: 500; color: #475569;">
                                (room ${slotData.room || 'N/A'})
                            </div>
                        `;
                    } else {
                        const storageKey = `note_${userName}_${day}_${timeSlot}`;
                        const savedNote = localStorage.getItem(storageKey) || "";
                        
                        const cellMarkup = savedNote 
                            ? `<div class="saved-cell-note">${savedNote}</div>`
                            : `<span class="vacant-text">-- Vacant --</span>`;

                        td.innerHTML = `
                            <div class="vacant-cell-fill">
                                ${cellMarkup}
                                <button class="add-note-btn" onclick="window.openVacantNoteModal('${day}', '${timeSlot}')" title="Add Memo Note">+</button>
                            </div>
                        `;
                    }
                    tr.appendChild(td);
                });
            }

            tbody.appendChild(tr);
        });
    }

    // Action button handlers
    const printBtn = document.getElementById('print-schedule-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            printBtn.blur();
            window.print(); 
        });
    }

    const pdfBtn = document.getElementById('download-pdf-btn');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', () => {
            pdfBtn.blur();
            window.print();
        });
    }

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear();
            window.location.href = '/index.html?logout=success';
        });
    }

    loadTeacherTimetable();
});