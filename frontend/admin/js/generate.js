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

function getSubjectColor(subjectName) {
    if (!subjectName) return "rgba(255, 255, 255, 0.05)";
    let hash = 0;
    for (let i = 0; i < subjectName.length; i++) {
        hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsla(${hue}, 70%, 85%, 0.95)`;
}

window.scheduleData = window.scheduleData || { gradeLevels: {}, teachers: {} };

// ==========================================
// 🚀 MAIN GENERATOR ENGINE FUNCTION
// ==========================================

function processSystemTimetable() {
    console.log("⚡ Starting Automated Timetable Generation Engine...");
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
        buildSampleScheduleData();

        if (outputContainer) {
            outputContainer.innerHTML = `
                <div id="grade-level-directory-container" style="margin-bottom: 30px;"></div>
                <div id="section-timetable-display-target" style="display: none;"></div>
            `;
        }

        renderGradeLevelDirectory();
    }, 600);
}

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
                sections: { "Section A": { timetable: {} } }
            }
        }
    };
}

// ==========================================
// 📂 DIRECTORY, STATUS & WARNINGS
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
            timeSlots.forEach(timeStr => {
                daySlots.forEach(dayStr => {
                    totalRequiredSlots++;
                    const slotData = sectionData.timetable?.[dayStr]?.[timeStr];

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

    // STATUS BAR
    const statusCard = document.createElement("div");
    statusCard.style.cssText = `
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;

    const statusBadgeColor = validation.isComplete ? "#10b981" : "#f59e0b";
    statusCard.innerHTML = `
        <div>
            <h3 style="margin: 0; color: #fff; font-size: 1.2rem;">🏫 Schedule Allocation Status</h3>
            <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 0.85rem;">
                Total Assigned Slots: <strong style="color: #38bdf8;">${validation.filledSlots}</strong> / ${validation.totalRequiredSlots}
            </p>
        </div>
        <div>
            <span style="background: ${statusBadgeColor}20; color: ${statusBadgeColor}; border: 1px solid ${statusBadgeColor}40; padding: 6px 14px; border-radius: 20px; font-weight: 700;">
                ${validation.isComplete ? '✅ Complete' : '⚠️ Incomplete'} (${validation.completionRate}%)
            </span>
        </div>
    `;
    container.appendChild(statusCard);

    // ⚠️ WARNING MESSAGE LIST (IF INCOMPLETE)
    if (!validation.isComplete && validation.unassignedSlots.length > 0) {
        const warningBox = document.createElement("div");
        warningBox.style.cssText = `
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.3);
            border-radius: 10px;
            padding: 15px 20px;
            margin-bottom: 24px;
            color: #fbbf24;
        `;
        warningBox.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">⚠️ Warning: Schedule Allocation Incomplete</div>
            <div style="font-size: 0.85rem; color: #cbd5e1; max-height: 100px; overflow-y: auto;">
                There are <strong>${validation.unassignedSlots.length} vacant/unassigned schedule slots</strong> across sections. Please assign teachers and rooms to finish the generation.
            </div>
        `;
        container.appendChild(warningBox);
    }

    // GRADE FOLDERS GRID
    const folderGrid = document.createElement("div");
    folderGrid.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;`;

    Object.entries(window.scheduleData.gradeLevels).forEach(([gradeKey, gradeData]) => {
        const folderCard = document.createElement("div");
        folderCard.style.cssText = `
            background: rgba(30, 41, 59, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 16px;
            cursor: pointer;
        `;

        const sectionCount = Object.keys(gradeData.sections || {}).length;
        folderCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="font-size: 1.8rem;">📁</span>
                <span style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; font-size: 0.75rem; padding: 2px 8px; border-radius: 12px;">${sectionCount} Sections</span>
            </div>
            <h4 style="margin: 0 0 4px 0; color: #f8fafc;">${gradeKey}</h4>
            <p style="margin: 0; color: #64748b; font-size: 0.8rem;">Click to view section timetables</p>
        `;

        folderCard.addEventListener("click", () => openGradeSectionsModal(gradeKey, gradeData));
        folderGrid.appendChild(folderCard);
    });

    container.appendChild(folderGrid);
}

// ==========================================
// 🪟 MODAL & TIMETABLE MATRIX VIEWER
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
    
    modal.innerHTML = `
        <div style="background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 14px; width: 90%; max-width: 500px; padding: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #fff;">📁 ${gradeName} Sections</h3>
                <button id="btn-close-modal" style="background: none; border: none; color: #94a3b8; font-size: 1.5rem; cursor: pointer;">✕</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${Object.keys(sections).map(secName => `
                    <button class="btn-select-section" data-section="${secName}" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 12px; border-radius: 8px; cursor: pointer; text-align: left; display: flex; justify-content: space-between;">
                        <span>📖 ${secName}</span>
                        <span style="color: #38bdf8;">View Schedule →</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    modal.style.display = "flex";

    document.getElementById("btn-close-modal").onclick = () => modal.style.display = "none";

    // OPEN SECTION TIMETABLE MATRIX
    modal.querySelectorAll(".btn-select-section").forEach(btn => {
        btn.addEventListener("click", () => {
            const secName = btn.getAttribute("data-section");
            modal.style.display = "none";
            renderSectionTimetable(gradeName, secName, sections[secName]);
        });
    });
}

function renderSectionTimetable(gradeName, sectionName, sectionData) {
    const displayTarget = document.getElementById("section-timetable-display-target");
    const directoryPanel = document.getElementById("grade-level-directory-container");

    displayTarget.innerHTML = "";
    displayTarget.style.display = "block";
    directoryPanel.style.display = "none";

    // Setup Print CSS
    if (!document.getElementById("isolated-print-styles")) {
        const printStyles = document.createElement("style");
        printStyles.id = "isolated-print-styles";
        printStyles.textContent = `
            @media print {
                body * { visibility: hidden !important; }
                #timetable-print-block, #timetable-print-block * { visibility: visible !important; }
                #timetable-print-block { position: absolute; left: 0; top: 0; width: 100%; background: #fff; color: #000; }
                .no-print { display: none !important; }
            }
            .pdf-export-mode { background: #fff !important; color: #000 !important; padding: 15px; }
            .pdf-export-mode table { width: 100%; border-collapse: collapse; }
            .pdf-export-mode th, .pdf-export-mode td { border: 1px solid #000 !important; color: #000 !important; padding: 8px; }
        `;
        document.head.appendChild(printStyles);
    }

    // TOP ACTIONS (BACK, PRINT, PDF)
    const actionHeader = document.createElement("div");
    actionHeader.className = "no-print";
    actionHeader.style.cssText = "display: flex; justify-content: space-between; margin-bottom: 20px;";
    actionHeader.innerHTML = `
        <button id="btn-back-dir" style="background: rgba(255,255,255,0.1); color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer;">
            ⬅️ Back to Folders
        </button>
        <div style="display: flex; gap: 10px;">
            <button onclick="window.print()" style="background: #00d2ff; color: #000; font-weight: bold; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer;">
                🖨️ Print
            </button>
            <button id="btn-export-pdf" style="background: #10b981; color: #fff; font-weight: bold; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer;">
                📥 Download PDF
            </button>
        </div>
    `;
    displayTarget.appendChild(actionHeader);

    document.getElementById("btn-back-dir").onclick = () => {
        displayTarget.style.display = "none";
        directoryPanel.style.display = "block";
    };

    // TIMETABLE MATRIX TABLE
    const printBlock = document.createElement("div");
    printBlock.id = "timetable-print-block";

    let timetable = sectionData.timetable || {};
    let tableHTML = `
        <h3 style="color: #fff; margin-bottom: 15px;">🏫 ${gradeName} - ${sectionName} Timetable Matrix</h3>
        <table style="width: 100%; border-collapse: collapse; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.1);">
            <thead>
                <tr style="background: rgba(255,255,255,0.05); color: #38bdf8;">
                    <th style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">Time Slot</th>
                    ${daySlots.map(day => `<th style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${day}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    timeSlots.forEach(timeStr => {
        tableHTML += `<tr><td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); font-weight: bold; color: #cbd5e1;">${timeStr}</td>`;
        daySlots.forEach(dayStr => {
            const slot = timetable[dayStr]?.[timeStr];
            if (slot) {
                tableHTML += `
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); background: ${getSubjectColor(slot.subject)}; color: #000; text-align: center;">
                        <strong style="display:block;">${slot.subject}</strong>
                        <span style="font-size:0.8rem;">👤 ${slot.instructor}</span><br>
                        <span style="font-size:0.75rem;">🏢 ${slot.room}</span>
                    </td>
                `;
            } else {
                tableHTML += `<td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); color: #64748b; text-align: center; font-style: italic;">-- Vacant --</td>`;
            }
        });
        tableHTML += `</tr>`;
    });

    tableHTML += `</tbody></table>`;
    printBlock.innerHTML = tableHTML;
    displayTarget.appendChild(printBlock);

    // PDF EXPORT HANDLER
    document.getElementById("btn-export-pdf").onclick = () => {
        if (typeof html2pdf === "undefined") {
            alert("PDF library is loading. Please try again.");
            return;
        }
        printBlock.classList.add("pdf-export-mode");
        html2pdf().set({
            margin: [5, 5, 5, 5],
            filename: `${gradeName}_${sectionName}_Schedule.pdf`,
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'letter', orientation: 'landscape' }
        }).from(printBlock).save().then(() => {
            printBlock.classList.remove("pdf-export-mode");
        });
    };
}

document.addEventListener("DOMContentLoaded", () => {
    buildSampleScheduleData();
});