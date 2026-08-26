// ==========================================
// ⚙️ GLOBAL DATA & TIMETABLE CORE CONFIG
// ==========================================

const daySlots = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const timeSlots = [
    "07:30 AM - 08:30 AM",
    "08:30 AM - 09:30 AM",
    "09:30 AM - 10:30 AM",
    "10:30 AM - 11:30 AM",
    "01:00 PM - 02:00 PM",
    "02:00 PM - 03:00 PM",
    "03:00 PM - 04:00 PM"
];

// Subject Color Mapping Helper
function getSubjectColor(subjectName) {
    if (!subjectName) return "rgba(255, 255, 255, 0.05)";
    
    let hash = 0;
    for (let i = 0; i < subjectName.length; i++) {
        hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = Math.abs(hash % 360);
    return `hsla(${hue}, 70%, 85%, 0.95)`;
}

// Global schedule state buffer
window.scheduleData = window.scheduleData || {
    gradeLevels: {},
    teachers: {}
};

// ==========================================
// 🚀 MAIN GENERATOR ENGINE FUNCTION
// ==========================================

/**
 * Main handler triggered by the "INITIALIZE SCHEDULING GENERATOR" button
 */
function processSystemTimetable() {
    console.log("⚡ Starting Automated Timetable Generation Engine...");

    // 🎯 Matches the exact container ID in generate.html
    const outputContainer = document.getElementById("timetable-matrix-output-body");
    
    if (outputContainer) {
        outputContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #38bdf8;">
                <div style="font-size: 2rem; margin-bottom: 10px;">⚙️</div>
                <h3>Generating Schedules & Resolving Conflicts...</h3>
            </div>
        `;
    }

    setTimeout(() => {
        // Compile or fetch schedule state
        buildSampleScheduleData();

        if (outputContainer) {
            outputContainer.innerHTML = `
                <div id="grade-level-directory-container" style="margin-bottom: 30px;"></div>
                <div id="instructor-matrix-display-target" style="display: none;"></div>
            `;
        }

        // Render the Grade Level folders and status summary
        renderGradeLevelDirectory();

        alert("✅ Timetable Generation Completed Successfully!");
    }, 600);
}

/**
 * Builds mock/initial data structure if window.scheduleData is empty
 */
function buildSampleScheduleData() {
    if (Object.keys(window.scheduleData.gradeLevels).length > 0) return;

    window.scheduleData = {
        gradeLevels: {
            "Grade 7": {
                sections: {
                    "Section A": {
                        timetable: {
                            "Monday": {
                                "07:30 AM - 08:30 AM": { subject: "Mathematics", instructor: "Prof. Smith", room: "Room 101" },
                                "08:30 AM - 09:30 AM": { subject: "English", instructor: "Prof. Davis", room: "Room 101" }
                            }
                        }
                    },
                    "Section B": { timetable: {} }
                }
            },
            "Grade 8": {
                sections: {
                    "Section A": { timetable: {} }
                }
            }
        },
        teachers: {}
    };
}

// ==========================================
// 🖨️ SINGLE INSTRUCTOR MATRIX PRINT & EXPORT
// ==========================================

function renderTargetedInstructorMatrix(teacherName, teacherData, displayTarget, directoryPanel) {
    displayTarget.innerHTML = "";
    displayTarget.style.display = "block";
    directoryPanel.style.display = "none";

    const formattedDate = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });

    if (!document.getElementById("isolated-print-styles")) {
        const printStyles = document.createElement("style");
        printStyles.id = "isolated-print-styles";
        printStyles.textContent = `
            @media print {
                body * { visibility: hidden !important; }
                #timetable-isolated-print-canvas-block, 
                #timetable-isolated-print-canvas-block * { visibility: visible !important; }
                #timetable-isolated-print-canvas-block {
                    position: absolute !important; left: 0 !important; top: 0 !important;
                    width: 100% !important; background: #ffffff !important; color: #000000 !important;
                    box-shadow: none !important; padding: 0 !important; margin: 0 !important;
                }
                .isolated-action-routing-header { display: none !important; }
            }
            .pdf-export-mode .header-title-text { color: #000000 !important; font-size: 1.2rem !important; }
            .pdf-export-mode .header-date-text { color: #475569 !important; font-size: 0.75rem !important; }
            .pdf-export-mode .custom-timetable-table {
                border-collapse: collapse !important; width: 100% !important; background: #ffffff !important;
                border: 1.5px solid #000000 !important; page-break-inside: avoid !important; 
            }
            .pdf-export-mode .custom-timetable-table th {
                background-color: #cbd5e1 !important; color: #000000 !important;
                border: 1px solid #000000 !important; padding: 6px 2px !important; font-size: 0.8rem !important; font-weight: bold !important;
            }
            .pdf-export-mode .custom-timetable-table td {
                border: 1px solid #000000 !important; padding: 5px 4px !important; vertical-align: middle !important;
            }
            .pdf-export-mode .pdf-time-cell {
                background-color: #f8fafc !important; color: #000000 !important; font-weight: bold !important; font-size: 0.75rem !important;
            }
            .pdf-export-mode .active-filled-cell { color: #000000 !important; print-color-adjust: exact !important; }
            .pdf-export-mode .pdf-subject-title { font-weight: bold !important; color: #000000 !important; font-size: 0.8rem !important; }
            .pdf-export-mode .pdf-section-subtitle { color: #1e293b !important; font-weight: bold !important; font-size: 0.7rem !important; }
            .pdf-export-mode .pdf-room-badge { color: #000000 !important; background: #f1f5f9 !important; border: 1px solid #94a3b8 !important; font-size: 0.65rem !important; }
            .pdf-export-mode .pdf-vacant-text { background: #ffffff !important; color: #000000 !important; border: 1px solid #e2e8f0 !important; font-style: italic !important; font-size: 0.7rem !important; }
        `;
        document.head.appendChild(printStyles);
    }

    const actionHeader = document.createElement("div");
    actionHeader.className = "isolated-action-routing-header";
    actionHeader.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 15px;";
    actionHeader.innerHTML = `
        <button id="btn-back-to-directory" style="background: rgba(255, 255, 255, 0.05); color: #fff; border: 1px solid rgba(255,255,255,0.1); padding: 10px 20px; font-weight: 600; border-radius: 8px; cursor: pointer;">
            ⬅️ Back to Instructor List
        </button>
        <div style="display: flex; gap: 10px;">
            <button onclick="window.print()" style="background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%); color: #fff; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer;">
                🖨️ Print Single Page Schedule
            </button>
            <button id="btn-isolated-download-pdf" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer;">
                📥 Download PDF Document
            </button>
        </div>
    `;
    displayTarget.appendChild(actionHeader);

    document.getElementById("btn-back-to-directory").addEventListener("click", () => {
        displayTarget.style.display = "none";
        directoryPanel.style.display = "block"; 
    });

    const printCanvasBlock = document.createElement("div");
    printCanvasBlock.id = "timetable-isolated-print-canvas-block";
    printCanvasBlock.className = "custom-timetable-card";
    displayTarget.appendChild(printCanvasBlock);

    let badgeColorStyles = `background: rgba(0, 210, 255, 0.1); color: #00d2ff; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; border: 1px solid rgba(0, 210, 255, 0.15);`;

    let gridHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px;">
            <div>
                <h3 class="header-title-text" style="color: #ffffff; margin: 0; font-size: 1.4rem; font-weight: bold;">👤 Instructor : ${teacherName}</h3>
                <div class="header-date-text" style="color: #a0a0c0; font-size: 0.85rem; margin-top: 4px;">📅 Date Exported: ${formattedDate}</div>
            </div>
            <div class="isolated-action-routing-header" style="display: flex; gap: 8px;">
                ${(teacherData.details?.subjects || []).map(s => `<span style="${badgeColorStyles}">📚 ${s}</span>`).join('')}
            </div>
        </div>
        
        <div style="overflow-x: auto;">
            <table class="custom-timetable-table">
                <thead>
                    <tr>
                        <th class="time-header">Time Slot</th>
                        ${daySlots.map(day => `<th class="day-header">${day}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    timeSlots.forEach(timeStr => {
        gridHTML += `<tr>`;
        gridHTML += `
            <td class="pdf-time-cell" style="background: rgba(15, 23, 42, 0.5); color: #cbd5e1; font-weight: 600; font-size: 0.8rem; padding: 10px; border-left: 3px solid #00d2ff;">
                ⏰ ${timeStr.replace(" - ", "<br><span style='opacity: 0.4; font-size: 0.7rem;'>to</span><br>")}
            </td>
        `;

        daySlots.forEach(dayStr => {
            const matchedAssignment = (teacherData.slots || []).find(s => s.day === dayStr && s.time === timeStr);

            if (matchedAssignment) {
                const bgColor = getSubjectColor(matchedAssignment.subject);
                gridHTML += `
                    <td class="active-filled-cell" style="background: ${bgColor}; border: 1px solid rgba(0, 0, 0, 0.12); padding: 10px; text-align: center;">
                        <div class="pdf-subject-title" style="font-weight: bold; color: #0f172a; font-size: 0.9rem;">${matchedAssignment.subject}</div>
                        <div class="pdf-section-subtitle" style="color: #334155; font-size: 0.75rem; font-weight: 600;">Sec: ${matchedAssignment.section}</div>
                        <div class="pdf-room-badge" style="color: #475569; font-size: 0.7rem; background: rgba(0,0,0,0.04); padding: 1px 4px; border-radius: 4px; display: inline-block;">🏢 ${matchedAssignment.room}</div>
                    </td>
                `;
            } else {
                gridHTML += `
                    <td class="pdf-vacant-text" style="background: rgba(255, 255, 255, 0.01); border: 1px dashed rgba(255, 255, 255, 0.03); color: rgba(255, 255, 255, 0.15); font-size: 0.75rem; font-style: italic; text-align: center; padding: 12px;">
                        -- Vacant --
                    </td>
                `;
            }
        });
        gridHTML += `</tr>`;
    });

    gridHTML += `</tbody></table></div>`;
    printCanvasBlock.innerHTML = gridHTML;

    document.getElementById("btn-isolated-download-pdf").addEventListener("click", () => {
        if (typeof html2pdf === "undefined") {
            alert("PDF export library is missing or still loading.");
            return;
        }

        printCanvasBlock.classList.add("pdf-export-mode");

        const configOptions = {
            margin:       [5, 5, 5, 5],
            filename:     `Schedule_Matrix_${teacherName.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2.3, useCORS: true, backgroundColor: '#ffffff', logging: false },
            jsPDF:         { unit: 'mm', format: 'letter', orientation: 'landscape' }
        };

        html2pdf().set(configOptions).from(printCanvasBlock).save().then(() => {
            printCanvasBlock.classList.remove("pdf-export-mode");
        }).catch((err) => {
            console.error("PDF generation exception:", err);
            printCanvasBlock.classList.remove("pdf-export-mode");
        });
    });
}

// ==========================================
// 📂 GRADE LEVEL DIRECTORY & VALIDATION LOGIC
// ==========================================

function validateScheduleCompletion() {
    const unassignedSlots = [];
    let totalRequiredSlots = 0;
    let filledSlots = 0;

    if (!window.scheduleData || !window.scheduleData.gradeLevels) {
        return { isComplete: false, completionRate: 0, unassignedSlots: [] };
    }

    Object.entries(window.scheduleData.gradeLevels).forEach(([gradeName, gradeData]) => {
        if (!gradeData.sections) return;

        Object.entries(gradeData.sections).forEach(([sectionName, sectionData]) => {
            if (!sectionData.timetable) return;

            timeSlots.forEach(timeStr => {
                daySlots.forEach(dayStr => {
                    totalRequiredSlots++;
                    const slotData = sectionData.timetable[dayStr]?.[timeStr];

                    if (slotData && slotData.subject && slotData.instructor) {
                        filledSlots++;
                    } else {
                        unassignedSlots.push({ grade: gradeName, section: sectionName, day: dayStr, time: timeStr });
                    }
                });
            });
        });
    });

    const completionRate = totalRequiredSlots > 0 ? Math.round((filledSlots / totalRequiredSlots) * 100) : 0;

    return {
        isComplete: unassignedSlots.length === 0,
        completionRate,
        filledSlots,
        totalRequiredSlots,
        unassignedSlots
    };
}

function renderGradeLevelDirectory() {
    const container = document.getElementById("grade-level-directory-container");
    if (!container) return;

    container.innerHTML = "";
    const validation = validateScheduleCompletion();

    const statusCard = document.createElement("div");
    statusCard.className = "schedule-status-card";
    statusCard.style.cssText = `
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        backdrop-filter: blur(10px);
    `;

    const statusBadgeColor = validation.isComplete ? "#10b981" : "#f59e0b";
    const statusText = validation.isComplete ? "Complete" : "Incomplete";

    statusCard.innerHTML = `
        <div>
            <h3 style="margin: 0; color: #fff; font-size: 1.2rem; font-weight: 700;">🏫 Schedule Allocation Status</h3>
            <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 0.85rem;">
                Total Assigned Slots: <strong style="color: #38bdf8;">${validation.filledSlots}</strong> / ${validation.totalRequiredSlots}
            </p>
        </div>
        <div>
            <span style="background: ${statusBadgeColor}20; color: ${statusBadgeColor}; border: 1px solid ${statusBadgeColor}40; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 0.85rem;">
                ${validation.isComplete ? '✅' : '⚠️'} ${statusText} (${validation.completionRate}%)
            </span>
        </div>
    `;
    container.appendChild(statusCard);

    const folderGrid = document.createElement("div");
    folderGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;`;

    if (!window.scheduleData || !window.scheduleData.gradeLevels) {
        folderGrid.innerHTML = `<p style="color: #64748b;">No grade level data available.</p>`;
        container.appendChild(folderGrid);
        return;
    }

    Object.entries(window.scheduleData.gradeLevels).forEach(([gradeKey, gradeData]) => {
        const folderCard = document.createElement("div");
        folderCard.className = "grade-folder-card";
        folderCard.style.cssText = `
            background: rgba(30, 41, 59, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 16px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        const sectionCount = Object.keys(gradeData.sections || {}).length;

        folderCard.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                <span style="font-size: 1.8rem;">📁</span>
                <span style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; font-weight: 600;">
                    ${sectionCount} Sections
                </span>
            </div>
            <h4 style="margin: 0 0 4px 0; color: #f8fafc; font-size: 1.05rem;">${gradeKey}</h4>
            <p style="margin: 0; color: #64748b; font-size: 0.8rem;">Click to view section timetables</p>
        `;

        folderCard.addEventListener("click", () => openGradeSectionsModal(gradeKey, gradeData));
        folderGrid.appendChild(folderCard);
    });

    container.appendChild(folderGrid);
}

// ==========================================
// 🪟 MODAL CONTROLLER
// ==========================================

function openGradeSectionsModal(gradeName, gradeData) {
    let modal = document.getElementById("grade-sections-modal");
    
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "grade-sections-modal";
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px);
            display: flex; justify-content: center; align-items: center; z-index: 9999;
        `;
        document.body.appendChild(modal);
    }

    const sections = gradeData.sections || {};
    
    let sectionsListHTML = Object.keys(sections).map(secName => `
        <button class="btn-select-section" data-section="${secName}" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #fff; padding: 12px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; text-align: left; display: flex; justify-content: space-between; width: 100%;">
            <span>📖 ${secName}</span>
            <span style="color: #38bdf8; font-size: 0.8rem;">View →</span>
        </button>
    `).join("");

    modal.innerHTML = `
        <div style="background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 14px; width: 90%; max-width: 500px; padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #fff; font-size: 1.25rem;">📁 ${gradeName} Sections</h3>
                <button id="btn-close-modal" style="background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer;">✕</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow-y: auto;">
                ${sectionsListHTML || '<p style="color: #64748b;">No sections found.</p>'}
            </div>
        </div>
    `;

    modal.style.display = "flex";

    document.getElementById("btn-close-modal").addEventListener("click", () => {
        modal.style.display = "none";
    });
}

// Initial Auto Load Setup
document.addEventListener("DOMContentLoaded", () => {
    buildSampleScheduleData();
});