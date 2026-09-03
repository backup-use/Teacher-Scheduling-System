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

    const targetDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    // 🖨️ DESIGN OVERRIDES: OVERALL SCREEN PADDING, LARGE FONTS & + BUTTON INTERACTION
    if (!document.getElementById("print-isolated-matrix-rules")) {
        const printStyles = document.createElement("style");
        printStyles.id = "print-isolated-matrix-rules";
        printStyles.innerHTML = `
            /* --- SCREEN VIEW RULES --- */
            #timetable-container table {
                width: 100% !important;
                border-collapse: separate !important;
                border-spacing: 6px !important; 
                font-weight: bold !important; /* Ginawang BOLD ang lahat ng text sa table */
            }

            #timetable-container table tbody tr {
                display: table-row !important; 
                visibility: visible !important;
            }

            #timetable-container table tbody td {
                padding: 4px !important; 
                height: 90px !important; 
                vertical-align: middle !important;
                text-align: center !important;
                box-sizing: border-box;
                display: table-cell !important; 
                visibility: visible !important;
            }
            
            #timetable-container table tbody td .cell-content-wrapper {
                width: 100% !important;
                height: 100% !important;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                box-sizing: border-box;
                padding: 10px !important; 
                font-size: 0.82rem;
                line-height: 1.35;
                font-weight: bold !important; /* Siguradong BOLD ang wrapper contents */
            }

            .schedule-card {
                padding: 12px !important; 
                border-radius: 8px !important;
                font-weight: bold !important;
            }

            /* Standard vacant cell wrapper view style */
            .vacant-cell-fill {
                background-color: #f8fafc !important; 
                color: #64748b !important;            
                font-style: italic;
                padding: 14px !important;
                border-radius: 8px !important;
                border: 1px dashed #cbd5e1 !important; /* Broken border line default */
                position: relative !important;
                overflow: hidden;
            }

            /* BAGO: Tatanggalin ang broken border at babaguhin ang background kapag may note na */
            .vacant-cell-fill.has-note {
                border: none !important; 
                background-color: #ffffff !important; /* Ginawang malinis na solid white background */
                box-shadow: 0 2px 4px rgba(0,0,0,0.05) !important; /* Opsyonal na pampaganda ng card */
            }

            /* Ang Interactive "+" Plus sign button profile */
            .add-note-btn {
                position: absolute !important;
                bottom: 4px !important;
                right: 4px !important;
                width: 22px !important;
                height: 22px !important;
                border-radius: 50% !important;
                background: #334155 !important; 
                border: none !important;
                color: #ffffff !important;      
                font-size: 0.8rem !important;
                font-weight: bold !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.2s ease-in-out !important;
                opacity: 0; 
            }

            /* Lilitaw ang button kapag itinapat ang mouse cursor sa cell block */
            .vacant-cell-fill:hover .add-note-btn {
                opacity: 1 !important;
                background: #00bcd4 !important; 
                color: #000000 !important;
                transform: scale(1.1);
            }

            /* Ang anyo ng isinulat na personal note sa screen table view */
            .saved-cell-note {
                font-family: 'Inter', sans-serif !important;
                font-size: 0.85rem !important;      
                color: #000000 !important;          
                font-weight: 700 !important;        /* Garantisadong makapal/bold */
                margin-top: 4px !important;
                font-style: normal !important;
                max-width: 100% !important;
                width: 100% !important;
                white-space: normal !important;     
                overflow: visible !important;
                text-overflow: clip !important;
                text-align: center !important;
                display: block !important;
            }
            

            /* --- POP-UP MODAL OVERLAY BACKGROUND --- */
            .vacant-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            }

            .vacant-modal-overlay.modal-active {
                opacity: 1;
                pointer-events: auto;
            }

            .vacant-modal-content {
                background: #1e293b; 
                border: 1px solid #334155;
                padding: 24px;
                border-radius: 12px;
                width: 90%;
                max-width: 420px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
                font-family: 'Poppins', sans-serif;
                color: #ffffff;
                text-align: left;
            }

            .vacant-modal-content h3 {
                margin: 0 0 6px 0;
                font-size: 1.15rem;
                color: #f8fafc;
                font-weight: 600;
            }

            .modal-subtitle {
                margin: 0 0 14px 0;
                font-size: 0.8rem;
                color: #94a3b8;
            }

            #modal-note-textarea {
                width: 100%;
                height: 100px;
                background: #0f172a;
                border: 1px solid #475569;
                border-radius: 6px;
                padding: 10px;
                color: #ffffff;
                font-size: 0.85rem;
                resize: none;
                box-sizing: border-box;
                margin-bottom: 16px;
                font-family: 'Inter', sans-serif;
            }

            #modal-note-textarea:focus {
                outline: none;
                border-color: #00bcd4;
            }

            .modal-actions-row {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }

            .modal-actions-row button {
                padding: 8px 16px;
                font-size: 0.82rem;
                font-weight: 600;
                border-radius: 6px;
                cursor: pointer;
                border: none;
                transition: background 0.15s ease;
                font-family: 'Poppins', sans-serif;
            }

            #modal-cancel-btn {
                background: #334155;
                color: #cbd5e1;
            }

            #modal-cancel-btn:hover {
                background: #475569;
            }

            #modal-save-btn {
                background: #00bcd4;
                color: #000000;
            }

            #modal-save-btn:hover {
                background: #00acc1;
            }

            /* --- PRINT VIEW CONFIGURATION --- */
            @media print {
                html, body {
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    color: #000000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: hidden !important; 
                    height: auto !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                header, nav, .sidebar, .sidebar-wrapper, .nav-container, 
                button, .btn, .print-actions, .isolated-action-routing-header, 
                #btn-logout, .btn-group, .timetable-controls button,
                .timetable-card p, .main-content p, .add-note-btn, .vacant-modal-overlay {
                    display: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    height: 0 !important;
                    width: 0 !important;
                }
                
                .main-content, .dashboard-card-panel, .timetable-card, .timetable-wrapper, #timetable-container {
                    background: transparent !important; 
                    background-color: transparent !important;
                    color: #000000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: none !important; 
                    outline: none !important;
                    box-shadow: none !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    transform: none !important;
                    font-family: 'Poppins', 'Inter', sans-serif !important;
                    overflow: visible !important; 
                }

                @page {
                    size: letter landscape;
                    margin: 4mm 4mm 4mm 4mm; 
                }

                h1, h2, h3, .timetable-controls {
                    display: block !important;
                    visibility: visible !important;
                    color: #000000 !important;
                    margin: 0 0 4px 0 !important;
                    padding: 0 0 0 4px !important; 
                    text-align: left !important;
                    font-family: 'Poppins', sans-serif !important;
                }

                h1 {
                    font-size: 1.85rem !important; 
                    font-weight: 800 !important;
                    text-transform: capitalize !important;
                    line-height: 1.1 !important;
                    letter-spacing: -0.02em !important;
                }

                h1::after {
                    content: "\\A Date Exported: ${formattedDate}";
                    display: block !important;
                    white-space: pre !important;
                    font-family: 'Inter', sans-serif !important;
                    font-size: 1.0rem !important; 
                    color: #1e293b !important; 
                    font-weight: bold !important; 
                    margin-top: 6px !important;
                    margin-bottom: 14px !important;
                }

                table, th, td {
                    border: 1.5px solid #000000 !important; 
                    font-family: 'Poppins', 'Inter', sans-serif !important;
                    font-weight: bold !important; /* Lahat Bold sa Print window */
                }
                
                table { 
                    display: table !important; 
                    width: 99% !important; 
                    margin-left: auto !important;
                    margin-right: auto !important;
                    table-layout: fixed !important; 
                    border-collapse: collapse !important; 
                    background: #ffffff !important;
                    margin-top: 2px !important; 
                }

                table tbody tr {
                    display: table-row !important; 
                }

                th { 
                    background: #e2e8f0 !important; 
                    color: #000000 !important; 
                    padding: 8px 2px !important; 
                    font-size: 0.88rem !important; 
                    font-weight: bold !important;
                }

                .time-cell {
                    background: #f1f5f9 !important;
                    font-size: 0.82rem !important; 
                    font-weight: bold !important;
                    color: #000000 !important;
                    padding: 6px 2px !important;
                    display: table-cell !important;
                }

                #timetable-container table tbody td {
                    height: auto !important; 
                    padding: 0 !important;
                    display: table-cell !important; 
                }

                #timetable-container table tbody td .cell-content-wrapper {
                    padding: 6px 3px !important; 
                    font-size: 0.82rem !important; 
                    line-height: 1.25 !important;
                    color: #000000 !important;
                    font-weight: bold !important;
                }

                #timetable-container table tbody td .cell-content-wrapper strong {
                    font-size: 0.94rem !important; 
                    font-weight: 900 !important;
                    color: #000000 !important;
                    display: block;
                    margin-bottom: 2px;
                }

                #timetable-container table tbody td .cell-content-wrapper span {
                    color: #000000 !important;
                    font-weight: 700 !important;
                }

                .vacant-cell-fill {
                    background: #fafafa !important;
                    color: #f0f0ff !important;
                    font-size: 0.80rem !important; 
                    font-style: italic !important;
                    font-weight: 500 !important;
                    border-radius: 0px !important;
                    padding: 6px 3px !important;
                }

                /* Alisin ang border sa print layout kung may note */
                .vacant-cell-fill.has-note {
                    border: none !important;
                }

                .saved-cell-note {
                    color: #000000 !important;
                    font-size: 0.74rem !important;
                    font-style: italic !important;
                    white-space: normal !important;
                    overflow: visible !important;
                    text-overflow: clip !important;
                    font-weight: bold !important;
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