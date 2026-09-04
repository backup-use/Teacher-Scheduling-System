document.addEventListener('DOMContentLoaded', () => {
    // 1. Session Protection check
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName');

    if (!token || role !== 'teacher') {
        alert('Unauthorized access! Redirecting to login.');
        window.location.href = '/index.html';
        return;
    }

    // Set page title header dynamically
    document.getElementById('instructor-title').textContent = `Instructor: ${userName}`;

    // Generate dynamic date string (e.g., "May 22, 2026")
    const formattedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Define standard operational system hours grid matrix
    const standardTimeSlots = [
        "07:30 AM to 08:30 AM",
        "08:30 AM to 09:30 AM",
        "09:30 AM to 10:30 AM",
        "10:30 AM to 11:30 AM",
        "01:00 PM to 02:00 PM",
        "02:00 PM to 03:00 PM",
        "03:00 PM to 04:00 PM",
        "04:00 PM to 05:00 PM"
    ];

    const targetDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    // Dynamic Print & View Styles for Official Teacher Attendance / Schedule
    if (!document.getElementById("print-isolated-matrix-rules")) {
        const printStyles = document.createElement("style");
        printStyles.id = "print-isolated-matrix-rules";
        printStyles.innerHTML = `
            /* --- SCREEN VIEW RULES --- */
            #timetable-container table {
                width: 100% !important;
                border-collapse: collapse !important;
                font-family: 'Arial', 'Helvetica', sans-serif !important;
                border: 2px solid #1e293b !important;
                background: #ffffff !important;
            }

            #timetable-container table th {
                background-color: #1e293b !important;
                color: #ffffff !important;
                text-transform: uppercase;
                font-size: 0.85rem !important;
                padding: 12px 8px !important;
                letter-spacing: 0.5px;
                border: 1px solid #334155 !important;
            }

            #timetable-container table td {
                border: 1px solid #cbd5e1 !important;
                padding: 6px !important; 
                height: 75px !important; 
                vertical-align: middle !important;
                text-align: center !important;
                box-sizing: border-box;
            }

            .time-cell {
                font-weight: 700 !important;
                color: #0f172a !important;
                font-size: 0.8rem !important;
                background-color: #f8fafc !important;
            }

            .schedule-card {
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                background-color: #eff6ff !important;
                border: 1px solid #bfdbfe !important;
                border-radius: 4px !important;
                padding: 6px !important;
                height: 100% !important;
            }

            .schedule-card strong {
                color: #1e3a8a !important;
                font-size: 0.85rem !important;
                font-weight: 800 !important;
            }

            .schedule-card span {
                color: #1e40af !important;
                font-size: 0.72rem !important;
                font-weight: 600 !important;
            }

            .vacant-cell-fill {
                background-color: #ffffff !important;
                color: #94a3b8 !important;
                font-size: 0.75rem !important;
                position: relative;
            }

            .vacant-text {
                display: none !important; /* Hide casual '-- Vacant --' text for formal look */
            }

            .add-note-btn {
                position: absolute !important;
                bottom: 4px !important;
                right: 4px !important;
                width: 18px !important;
                height: 18px !important;
                border-radius: 3px !important;
                background: #64748b !important; 
                border: none !important;
                color: #ffffff !important;      
                font-size: 0.7rem !important;
                cursor: pointer !important;
                opacity: 0;
            }

            .vacant-cell-fill:hover .add-note-btn { opacity: 1 !important; }

            .saved-cell-note {
                font-size: 0.75rem !important;
                color: #334155 !important;
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
                    font-family: 'Times New Roman', Times, serif, sans-serif !important;
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
                    margin: 12mm 10mm 10mm 10mm;
                }

                /* Official School Document Header */
                #instructor-title {
                    text-transform: capitalize !important;
                    font-size: 1.4rem !important;
                    font-weight: bold !important;
                    text-align: left !important;
                    color: #000000 !important;
                    margin: 0 0 4px 0 !important;
                    border-bottom: 2px solid #000000 !important;
                    padding-bottom: 4px !important;
                }

                #instructor-title::before {
                    content: "FACULTY OFFICIAL CLASS SCHEDULE & LOAD\\A";
                    white-space: pre !important;
                    font-size: 0.9rem !important;
                    letter-spacing: 1px !important;
                    color: #333333 !important;
                    display: block !important;
                    margin-bottom: 2px !important;
                }

                #instructor-title::after {
                    content: "Academic Year: 2026-2027   |   Date Generated: ${formattedDate}   |   Status: Verified";
                    display: block !important;
                    font-size: 0.8rem !important;
                    font-weight: normal !important;
                    color: #444444 !important;
                    margin-top: 4px !important;
                }

                .main-content, .dashboard-card-panel, .timetable-card, #timetable-container {
                    background: #ffffff !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: none !important;
                    box-shadow: none !important;
                    width: 100% !important;
                }

                table {
                    width: 100% !important;
                    border-collapse: collapse !important;
                    border: 2px solid #000000 !important;
                    margin-top: 10px !important;
                }

                th {
                    background-color: #0f172a !important;
                    color: #ffffff !important;
                    padding: 8px 4px !important;
                    font-size: 0.8rem !important;
                    font-weight: bold !important;
                    text-transform: uppercase !important;
                    border: 1px solid #000000 !important;
                }

                td {
                    border: 1px solid #000000 !important;
                    height: 55px !important;
                    padding: 4px !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                }

                .time-cell {
                    background-color: #f1f5f9 !important;
                    font-size: 0.75rem !important;
                    font-weight: bold !important;
                    color: #000000 !important;
                }

                .schedule-card {
                    background-color: transparent !important;
                    border: none !important;
                    padding: 0 !important;
                }

                .schedule-card strong {
                    font-size: 0.85rem !important;
                    font-weight: 900 !important;
                    color: #000000 !important;
                    display: block !important;
                }

                .schedule-card span {
                    font-size: 0.72rem !important;
                    font-weight: 700 !important;
                    color: #1e293b !important;
                    display: block !important;
                }

                .vacant-cell-fill {
                    background-color: #ffffff !important;
                    border: none !important;
                }

                .vacant-text {
                    display: none !important;
                }

                .saved-cell-note {
                    color: #000000 !important;
                    font-size: 0.72rem !important;
                    font-style: italic !important;
                    font-weight: 600 !important;
                }

                .card-math { background-color: #fefae0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                .card-science { background-color: #e8f5e9 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                .card-default { background-color: #eff6ff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

                .schedule-card {
                    border-radius: 0px !important;
                    color: #000000 !important;
                    box-shadow: none !important;
                    padding: 6px 3px !important;
                    font-weight: bold !important;
                }
            }
        `;
        document.head.appendChild(printStyles);
    }

    // Initialize English HTML Modal into DOM if it doesn't exist
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

    document.getElementById("modal-cancel-btn").addEventListener('click', closeModal);
    
    document.getElementById("modal-save-btn").addEventListener('click', () => {
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
        try {
            const sessionToken = localStorage.getItem('token');

            const response = await fetch('/api/timetable', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                }
            }); 
            
            if (!response.ok) throw new Error('Failed to grab active allocation database blocks.');
            
            const fullTimetable = await response.json();

            const myClasses = fullTimetable.filter(slot => 
                slot.instructor && slot.instructor.toLowerCase().trim() === userName.toLowerCase().trim()
            );

            const tbody = document.getElementById('timetable-rows');
            tbody.innerHTML = ''; 

            standardTimeSlots.forEach(timeSlot => {
                const tr = document.createElement('tr');

                const timeCell = document.createElement('td');
                timeCell.className = 'time-cell';
                timeCell.textContent = timeSlot;
                tr.appendChild(timeCell);

                targetDays.forEach(day => {
                    const td = document.createElement('td');
                    
                    const matchingMatch = myClasses.find(c => 
                        c.timeSlot === timeSlot && 
                        c.day.toLowerCase() === day.toLowerCase()
                    );

                    if (matchingMatch) {
                        const upperSubject = matchingMatch.subject ? matchingMatch.subject.toUpperCase() : '';
                        const upperSection = matchingMatch.section ? matchingMatch.section.toUpperCase() : 'N/A';
                        const upperRoom = matchingMatch.room ? matchingMatch.room.toUpperCase() : 'N/A';

                        td.innerHTML = `
                            <div class="cell-content-wrapper">
                                <div class="schedule-card" style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; box-sizing: border-box;">
                                    <strong style="margin-bottom: 2px;">${upperSubject}</strong>
                                    <span style="font-size: 0.75rem;">SEC: ${upperSection}</span>
                                    <span style="font-size: 0.75rem;">ROOM: ${upperRoom}</span>
                                </div>
                            </div>
                        `;
                    } else {
                        const storageKey = `note_${userName}_${day}_${timeSlot}`;
                        const savedNote = localStorage.getItem(storageKey) || "";
                        
                        const cellMarkup = savedNote 
                            ? `<div class="saved-cell-note">${savedNote}</div>`
                            : `<span class="vacant-text">-- Vacant --</span>`;

                        // DITO BINAGO: Magdadagdag ng class na 'has-note' kapag may naisave na note ang user
                        const extraClass = savedNote ? 'has-note' : '';

                        td.innerHTML = `
                            <div class="cell-content-wrapper vacant-cell-fill ${extraClass}">
                                ${cellMarkup}
                                <button class="add-note-btn" onclick="window.openVacantNoteModal('${day}', '${timeSlot}')" title="Add Memo Note">+</button>
                            </div>
                        `;
                    }
                    tr.appendChild(td);
                });

                tbody.appendChild(tr);
            });

        } catch (error) {
            console.error('Error drawing operational grid matrix:', error);
            document.getElementById('timetable-rows').innerHTML = 
                `<tr><td colspan="7" style="color:#ff5252; padding:2rem;">⚠️ Failed to parse matching timetable database grids.</td></tr>`;
        }
    }

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