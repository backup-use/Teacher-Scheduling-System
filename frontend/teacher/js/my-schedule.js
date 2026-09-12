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
        'VALUES EDUCATION': '#fef9c3'
    };

    function getSubjectColor(subjectName) {
        if (!subjectName) return '#f1f5f9';
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

    // Dynamic Print & Screen CSS Matching Admin View
    if (!document.getElementById("admin-style-matrix-rules")) {
        const printStyles = document.createElement("style");
        printStyles.id = "admin-style-matrix-rules";
        printStyles.innerHTML = `
            /* --- SCREEN VIEW MATCHING ADMIN DASHBOARD --- */
            #timetable-container table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important;
                border: 2px solid #000000 !important;
                background: #ffffff !important;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
            }

            #timetable-container table th {
                background-color: #ffffff !important;
                color: #000000 !important;
                text-transform: uppercase !important;
                font-size: 0.85rem !important;
                font-weight: 800 !important;
                padding: 10px 4px !important;
                letter-spacing: 0.5px !important;
                border: 2px solid #000000 !important;
            }

            #timetable-container table td {
                border: 2px solid #000000 !important;
                padding: 6px !important; 
                height: 60px !important; 
                vertical-align: middle !important;
                text-align: center !important;
                box-sizing: border-box !important;
            }

            .time-cell {
                font-weight: 800 !important;
                color: #000000 !important;
                font-size: 0.82rem !important;
                background-color: #ffffff !important;
                width: 120px !important;
            }

            .recess-row {
                background-color: #fef08a !important;
                color: #854d0e !important;
                font-weight: 800 !important;
                letter-spacing: 1.5px !important;
                font-size: 0.85rem !important;
                border: 2px solid #000000 !important;
            }

            .lunch-row {
                background-color: #fed7aa !important;
                color: #9a3412 !important;
                font-weight: 800 !important;
                letter-spacing: 1.5px !important;
                font-size: 0.85rem !important;
                border: 2px solid #000000 !important;
            }

            .vacant-cell-fill {
                background-color: #ffffff !important;
                position: relative;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .vacant-text {
                display: none !important;
            }

            .add-note-btn {
                position: absolute !important;
                bottom: 4px !important;
                right: 4px !important;
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

            .vacant-cell-fill:hover .add-note-btn { opacity: 1 !important; }

            .saved-cell-note {
                font-size: 0.75rem !important;
                color: #1e293b !important;
                font-style: italic !important;
                font-weight: 600 !important;
            }

            /* --- FORMAL OFFICIAL PRINT & PDF EXPORT --- */
            @media print {
                html, body {
                    background: #ffffff !important;
                    color: #000000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    font-family: Arial, sans-serif !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                header, nav, .sidebar, .sidebar-wrapper, .nav-container, 
                button, .btn, .print-actions, #btn-logout, .add-note-btn, 
                .vacant-modal-overlay, .timetable-card p {
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
                    border: 1.5px solid #000000 !important;
                    padding: 4px !important;
                }
            }
        `;
        document.head.appendChild(printStyles);
    }

    // Modal Injection for Vacant Notes
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

    function matchTeacherName(nameA, nameB) {
        if (!nameA || !nameB) return false;
        const cleanA = nameA.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanB = nameB.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
    }

    async function loadTeacherTimetable() {
        const tbody = document.getElementById('timetable-rows');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        let myClassesMap = {};

        // 1. Fetch backend API
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
                fullTimetable.forEach(slot => {
                    if (matchTeacherName(slot.instructor || slot.teacher, userName)) {
                        if (!myClassesMap[slot.day]) myClassesMap[slot.day] = {};
                        myClassesMap[slot.day][slot.timeSlot] = {
                            subject: slot.subject,
                            section: slot.section,
                            room: slot.room || 'N/A'
                        };
                    }
                });
            } else {
                throw new Error("API unready");
            }
        } catch (apiError) {
            // 2. Local Storage Fallback
            const cachedTeacherSchedules = localStorage.getItem("cached_teacher_schedules");
            if (cachedTeacherSchedules) {
                try {
                    const parsedMap = JSON.parse(cachedTeacherSchedules);
                    const teacherKey = Object.keys(parsedMap).find(k => matchTeacherName(k, userName));
                    if (teacherKey && parsedMap[teacherKey]) {
                        myClassesMap = parsedMap[teacherKey];
                    }
                } catch (err) {
                    console.error("Error parsing cached schedules:", err);
                }
            }
        }

        // Render schedule rows
        standardTimeSlots.forEach(timeSlot => {
            const tr = document.createElement('tr');

            // Time Column
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
            // Standard Academic Classes
            else {
                targetDays.forEach(day => {
                    const td = document.createElement('td');
                    const slotData = myClassesMap[day] ? myClassesMap[day][timeSlot] : null;

                    if (slotData) {
                        const cellBg = getSubjectColor(slotData.subject);
                        td.style.backgroundColor = cellBg;
                        td.style.color = '#000000';

                        td.innerHTML = `
                            <div style="font-size: 0.9rem; font-weight: 800; line-height: 1.2;">
                                ${slotData.subject}
                            </div>
                            <div style="font-size: 0.78rem; font-weight: 600; margin-top: 3px;">
                                ${slotData.section || userName}
                            </div>
                            <div style="font-size: 0.72rem; font-weight: 500; opacity: 0.9;">
                                (room ${slotData.room || '10'})
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

    // Print & PDF Event Binding
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