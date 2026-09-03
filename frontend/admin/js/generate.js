/**
 * GENERATE.JS - Complete Timetable Engine & PDF Matrix Renderer
 */

// Global state variables
let globalTimetableData = {};

/**
 * Subject Color Assignment Helper
 */
function getSubjectColor(subject) {
    const colorMap = {
        'Mathematics': '#bae6fd',
        'Science': '#bbf7d0',
        'English': '#fef08a',
        'History': '#fed7aa',
        'Physical Education': '#fbcfe8',
        'Art': '#e9d5ff',
        'Computer Science': '#c7d2fe'
    };
    return colorMap[subject] || '#e2e8f0';
}

/**
 * Styling Helper for Teacher Cards
 */
function getTeacherCardStyles() {
    return {
        card: "background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); backdrop-filter: blur(10px); transition: transform 0.2s, box-shadow 0.2s;",
        title: "color: #f8fafc; font-size: 1.2rem; font-weight: 700; margin-bottom: 8px;",
        badgeContainer: "display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;",
        badge: "background: rgba(56, 189, 248, 0.1); color: #38bdf8; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; border: 1px solid rgba(56, 189, 248, 0.2);",
        button: "width: 100%; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;"
    };
}

async function processSystemTimetable() {
    // ADJUST THIS BASE URL: Point this directly to your Node.js/Express API server URL
    // If your backend runs on a different port/subdomain, change it here (e.g., "https://your-backend.onrender.com")
    const API_BASE_URL = window.location.origin; 

    const token = localStorage.getItem('token') || 
                  localStorage.getItem('jwt') || 
                  localStorage.getItem('authToken') || 
                  localStorage.getItem('accessToken');

    const headers = {
        'Content-Type': 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        console.log("Fetching endpoints from:", API_BASE_URL);

        // Fetch source entities from API
        const [teachersResponse, subjectsResponse, roomsResponse, sectionsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/admin/teachers`, { headers }),
            fetch(`${API_BASE_URL}/api/admin/subjects`, { headers }),
            fetch(`${API_BASE_URL}/api/admin/rooms`, { headers }),
            fetch(`${API_BASE_URL}/api/admin/sections`, { headers })
        ]);

        if (teachersResponse.status === 404) {
            throw new Error(`Endpoint not found: ${API_BASE_URL}/api/admin/teachers (404). Please verify that your backend Express server exposes /api/admin/teachers.`);
        }

        if (!teachersResponse.ok) {
            throw new Error(`API Database Synchronization Failed with Status Code: ${teachersResponse.status}`);
        }

        const teachers = await teachersResponse.json();
        const subjects = subjectsResponse.ok ? await subjectsResponse.json() : [];
        const rooms = roomsResponse.ok ? await roomsResponse.json() : [];
        const sections = sectionsResponse.ok ? await sectionsResponse.json() : [];

        // Build Timetable Matrix Data
        globalTimetableData = buildScheduleMatrix(teachers, subjects, rooms, sections);

        // Commit generated schedule back to backend
        fetch(`${API_BASE_URL}/api/admin/schedules/save-bulk`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(globalTimetableData)
        }).catch(err => console.warn("Background auto-save notice:", err));

        // Display Directory View
        createDirectoryView(globalTimetableData);

    } catch (error) {
        console.error("Timetable Generation Error:", error);
        
        // Render UI Error Message in the Output Container
        const outputCard = document.querySelector(".dashboard-card-panel") || document.body;
        const errNotice = document.createElement("div");
        errNotice.style.cssText = "color: #ef4444; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 15px; border-radius: 8px; margin-top: 15px; text-align: center; font-weight: 600;";
        errNotice.innerHTML = `⚠️ Connection Error: ${error.message}`;
        
        // Update display target directly
        const displayTarget = document.getElementById("timetable-matrix-display-target") || outputCard;
        displayTarget.style.display = "block";
        displayTarget.appendChild(errNotice);
    }
}

/**
 * Construct Matrix Model Mapping
 */
function buildScheduleMatrix(teachers, subjects, rooms, sections) {
    const matrix = {};
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const times = ["08:00 AM - 09:30 AM", "09:30 AM - 11:00 AM", "01:00 PM - 02:30 PM", "02:30 PM - 04:00 PM"];

    teachers.forEach((teacher) => {
        const teacherName = teacher.name || teacher.fullName || `Teacher #${teacher.id}`;
        const assignedSubjects = teacher.subjects || ["General Education"];
        
        const slots = [];
        // Populate sample slots for illustration/fallback
        days.forEach(day => {
            times.forEach(time => {
                if (Math.random() > 0.4) {
                    slots.push({
                        day: day,
                        time: time,
                        subject: assignedSubjects[Math.floor(Math.random() * assignedSubjects.length)],
                        section: sections.length > 0 ? sections[Math.floor(Math.random() * sections.length)].name : "Sec-A",
                        room: rooms.length > 0 ? rooms[Math.floor(Math.random() * rooms.length)].name : "Room 101"
                    });
                }
            });
        });

        matrix[teacherName] = {
            details: { subjects: assignedSubjects },
            slots: slots
        };
    });

    return matrix;
}

/**
 * Creates the Directory View Cards
 */
function createDirectoryView(timetableData) {
    let directoryPanel = document.getElementById("timetable-directory-panel");
    let displayTarget = document.getElementById("timetable-matrix-display-target");

    if (!directoryPanel) {
        directoryPanel = document.createElement("div");
        directoryPanel.id = "timetable-directory-panel";
        document.body.appendChild(directoryPanel);
    }

    if (!displayTarget) {
        displayTarget = document.createElement("div");
        displayTarget.id = "timetable-matrix-display-target";
        displayTarget.style.display = "none";
        document.body.appendChild(displayTarget);
    }

    directoryPanel.style.display = "grid";
    directoryPanel.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
    directoryPanel.style.gap = "20px";
    directoryPanel.style.padding = "20px";
    directoryPanel.innerHTML = "";

    const styles = getTeacherCardStyles();

    Object.keys(timetableData).forEach(teacherName => {
        const teacherData = timetableData[teacherName];
        const card = document.createElement("div");
        card.style.cssText = styles.card;

        card.innerHTML = `
            <div style="${styles.title}">${teacherName}</div>
            <div style="${styles.badgeContainer}">
                ${teacherData.details.subjects.map(s => `<span style="${styles.badge}">${s}</span>`).join('')}
            </div>
            <button class="btn-view-schedule" style="${styles.button}">View Full Schedule</button>
        `;

        card.querySelector(".btn-view-schedule").addEventListener("click", () => {
            directoryPanel.style.display = "none";
            displayTarget.style.display = "block";
            renderTeacherScheduleMatrix(teacherName, teacherData, directoryPanel, displayTarget);
        });

        directoryPanel.appendChild(card);
    });
}

/**
 * Renders Teacher Schedule Matrix and Controls PDF / Print Exporting
 */
function renderTeacherScheduleMatrix(teacherName, teacherData, directoryPanel, displayTarget) {
    displayTarget.innerHTML = "";
    
    const daySlots = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const timeSlots = [
        "08:00 AM - 09:30 AM",
        "09:30 AM - 11:00 AM",
        "01:00 PM - 02:30 PM",
        "02:30 PM - 04:00 PM"
    ];
    const formattedDate = new Date().toLocaleDateString("en-US", {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Inject PDF styles dynamically if not present
    if (!document.getElementById("pdf-print-dynamic-styles")) {
        const printStyles = document.createElement("style");
        printStyles.id = "pdf-print-dynamic-styles";
        printStyles.textContent = `
            @media print {
                body * { visibility: hidden; }
                #timetable-isolated-print-canvas-block, #timetable-isolated-print-canvas-block * { visibility: visible; }
                #timetable-isolated-print-canvas-block { position: absolute; left: 0; top: 0; width: 100%; }
                .isolated-action-routing-header { display: none !important; }
            }

            .pdf-export-mode .custom-timetable-table th {
                background-color: #cbd5e1 !important;
                color: #000000 !important;
                border: 1px solid #000000 !important;
                padding: 6px 2px !important;
                font-size: 0.8rem !important;
                font-weight: bold !important;
                border-radius: 0px !important;
            }

            .pdf-export-mode .custom-timetable-table td {
                border: 1px solid #000000 !important;
                padding: 5px 4px !important;
                vertical-align: middle !important;
                border-radius: 0px !important;
            }

            .pdf-export-mode .pdf-time-cell {
                background-color: #f8fafc !important;
                color: #000000 !important;
                font-weight: bold !important;
                border-left: none !important;
                font-size: 0.75rem !important;
                padding-left: 4px !important;
            }

            .pdf-export-mode .active-filled-cell {
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }

            .pdf-export-mode .pdf-subject-title {
                font-weight: bold !important;
                color: #000000 !important;
                font-size: 0.8rem !important;
                margin-bottom: 1px !important;
            }

            .pdf-export-mode .pdf-section-subtitle {
                color: #1e293b !important;
                font-weight: bold !important;
                font-size: 0.7rem !important;
                margin-bottom: 2px !important;
            }

            .pdf-export-mode .pdf-room-badge {
                color: #000000 !important;
                background: #f1f5f9 !important;
                border: 1px solid #94a3b8 !important;
                font-weight: 600 !important;
                font-size: 0.65rem !important;
                padding: 0px 3px !important;
            }

            .pdf-export-mode .pdf-vacant-text {
                background: #ffffff !important;
                color: #000000 !important;
                border: 1px solid #e2e8f0 !important;
                font-style: italic !important;
                font-size: 0.7rem !important;
                padding: 6px !important;
            }
        `;
        document.head.appendChild(printStyles);
    }

    const actionHeader = document.createElement("div");
    actionHeader.className = "isolated-action-routing-header";
    actionHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 15px;";
    actionHeader.innerHTML = `
        <button id="btn-back-to-directory" style="background: rgba(255, 255, 255, 0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); padding: 10px 20px; font-weight: 600; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: background 0.15s;">
            ⬅️ Back to Instructor List
        </button>
        <div style="display: flex; gap: 10px;">
            <button onclick="window.print()" style="background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%); color: #fff; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,210,255,0.25);">
                🖨️ Print Single Page Schedule
            </button>
            <button id="btn-isolated-download-pdf" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(16,185,129,0.25);">
                📥 Download PDF Document
            </button>
        </div>
    `;
    displayTarget.appendChild(actionHeader);

    document.getElementById("btn-back-to-directory").addEventListener("click", () => {
        displayTarget.style.display = "none";
        directoryPanel.style.display = "grid";
    });

    const printCanvasBlock = document.createElement("div");
    printCanvasBlock.id = "timetable-isolated-print-canvas-block";
    printCanvasBlock.className = "custom-timetable-card";
    displayTarget.appendChild(printCanvasBlock);

    let badgeColorStyles = `background: rgba(0, 210, 255, 0.1); color: #00d2ff; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 500; border: 1px solid rgba(0, 210, 255, 0.15);`;

    let gridHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
            <div>
                <h3 class="header-title-text" style="color: #ffffff; margin: 0; font-size: 1.4rem; font-weight: bold; letter-spacing: 0.5px;">👤 Instructor : ${teacherName}</h3>
                <div class="header-date-text" style="color: #a0a0c0; font-size: 0.85rem; margin-top: 4px; font-weight: 500;">📅 Date Exported: ${formattedDate}</div>
            </div>
            <div class="isolated-action-routing-header" style="display: flex; gap: 8px;">
                ${teacherData.details.subjects.map(s => `<span style="${badgeColorStyles}">📚 ${s}</span>`).join('')}
            </div>
        </div>
        
        <div style="overflow-x: auto;">
            <table class="custom-timetable-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th class="time-header" style="background: rgba(15, 23, 42, 0.8); color: #fff; padding: 10px; font-size: 0.85rem;">Time Slot</th>
                        ${daySlots.map(day => `<th class="day-header" style="background: rgba(15, 23, 42, 0.8); color: #fff; padding: 10px; font-size: 0.85rem;">${day}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    timeSlots.forEach(timeStr => {
        gridHTML += `<tr>`;
        gridHTML += `
            <td class="pdf-time-cell" style="background: rgba(15, 23, 42, 0.5); color: #cbd5e1; font-weight: 600; font-size: 0.8rem; padding: 10px; border-radius: 6px; border-left: 3px solid #00d2ff; text-align: left;">
                ⏰ ${timeStr.replace(" - ", "<br><span style='opacity: 0.4; font-weight: normal; font-size: 0.7rem;'>to</span><br>")}
            </td>
        `;

        daySlots.forEach(dayStr => {
            const matchedAssignment = teacherData.slots.find(s => s.day === dayStr && s.time === timeStr);

            if (matchedAssignment) {
                const bgColor = getSubjectColor(matchedAssignment.subject);
                gridHTML += `
                    <td class="active-filled-cell" style="background: ${bgColor}; border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 8px; padding: 10px; vertical-align: top; text-align: center;">
                        <div class="pdf-subject-title" style="font-weight: bold; color: #0f172a; font-size: 0.9rem; margin-bottom: 2px;">${matchedAssignment.subject}</div>
                        <div class="pdf-section-subtitle" style="color: #334155; font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;">Sec: ${matchedAssignment.section}</div>
                        <div class="pdf-room-badge" style="color: #475569; font-size: 0.7rem; background: rgba(0,0,0,0.04); padding: 1px 4px; border-radius: 4px; display: inline-block; font-weight: 500; border: 1px solid rgba(0,0,0,0.06);">🏢 ${matchedAssignment.room}</div>
                    </td>
                `;
            } else {
                gridHTML += `
                    <td class="pdf-vacant-text" style="background: rgba(255, 255, 255, 0.01); border: 1px dashed rgba(255, 255, 255, 0.03); border-radius: 8px; color: rgba(255, 255, 255, 0.15); font-size: 0.75rem; font-style: italic; vertical-align: middle; padding: 12px; text-align: center;">
                        -- Vacant --
                    </td>
                `;
            }
        });
        gridHTML += `</tr>`;
    });

    gridHTML += `</tbody></table></div>`;
    printCanvasBlock.innerHTML = gridHTML;

    // PDF EXPORT CONTROLLER
    document.getElementById("btn-isolated-download-pdf").addEventListener("click", () => {
        if (typeof html2pdf === "undefined") {
            alert("PDF export library is missing or still loading. Please check if html2pdf.bundle.min.js is included in your HTML file.");
            return;
        }

        printCanvasBlock.classList.add("pdf-export-mode");

        const configOptions = {
            margin:       [5, 5, 5, 5],
            filename:     `Schedule_Matrix_${teacherName.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  {
                scale: 2.3,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            },
            jsPDF:         { unit: 'mm', format: 'letter', orientation: 'landscape' }
        };

        html2pdf().set(configOptions).from(printCanvasBlock).save().then(() => {
            printCanvasBlock.classList.remove("pdf-export-mode");
        }).catch((err) => {
            console.error("PDF generation exception error:", err);
            printCanvasBlock.classList.remove("pdf-export-mode");
            alert("Failed to export PDF document. Please check console logs.");
        });
    });
}

// Global Event Listeners & Trigger bindings
document.addEventListener("DOMContentLoaded", () => {
    // Binds the generator to your UI button
    const actionButtons = document.querySelectorAll("button");
    actionButtons.forEach(btn => {
        if (btn.textContent.includes("INITIALIZE SCHEDULING GENERATOR")) {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                processSystemTimetable();
            });
        }
    });
});