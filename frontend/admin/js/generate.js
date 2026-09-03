/**
 * Advanced Automated Timetable Generator
 * Features an Executive Resource Audit Summary to detect system-wide shortages across all grades.
 */

function safeParseArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
            return val.split(',').map(s => s.trim()).filter(Boolean);
        }
    }
    return [];
}

function extractGradeNumber(str) {
    if (!str) return "";
    const match = str.toString().match(/\d+/);
    return match ? match[0] : str.toString().toLowerCase().trim();
}

async function processSystemTimetable() {
    console.log("⚡ Executing School-Wide Resource Audit & Timetable Matrix Generation...");
   
    let container = document.getElementById("timetable-matrix-output-body") || 
                    document.querySelector('.dashboard-card-panel') || 
                    document.querySelector('.main-content') ||
                    document.body;
   
    container.innerHTML = `
        <div id="engine-processing-status" style="text-align: center; color: #00d2ff; font-weight: bold; padding: 40px; font-size: 1.1rem; background: rgba(15,23,42,0.6); border-radius: 12px; margin-top: 20px;">
            🔄 Auditing Grade-Level Resources & Calculating Master Schedule...
        </div>
    `;

    const token = localStorage.getItem('token') || 
                  localStorage.getItem('jwt') || 
                  localStorage.getItem('authToken') || 
                  localStorage.getItem('accessToken');

    if (!token) {
        container.innerHTML = `
            <div style="text-align: center; color: #ff5f5f; padding: 30px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; margin-top: 20px;">
                ⚠️ Authentication Failure: Security token missing or expired. Please re-login.
            </div>
        `;
        return;
    }

    try {
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        const baseOrigin = window.location.origin;

        const [teachersResponse, subjectsResponse, roomsResponse, sectionsResponse] = await Promise.all([
            fetch(`${baseOrigin}/api/admin/teachers`, { headers }),
            fetch(`${baseOrigin}/api/admin/subjects`, { headers }),
            fetch(`${baseOrigin}/api/admin/rooms`, { headers }),
            fetch(`${baseOrigin}/api/admin/sections`, { headers })
        ]);

        if (!teachersResponse.ok || !subjectsResponse.ok || !roomsResponse.ok || !sectionsResponse.ok) {
            throw new Error(`API Synchronization Failed with Status: ${teachersResponse.status}`);
        }

        const rawTeachersData = await teachersResponse.json();
        const rawSubjectsData = await subjectsResponse.json();
        const savedRoomsData = await roomsResponse.json();
        const savedSectionsData = await sectionsResponse.json();

        const rawTeachers = Array.isArray(rawTeachersData) ? rawTeachersData : (rawTeachersData.teachers || rawTeachersData.data || []);
        const savedRooms = Array.isArray(savedRoomsData) ? savedRoomsData : (savedRoomsData.rooms || savedRoomsData.data || []);
        const savedSections = Array.isArray(savedSectionsData) ? savedSectionsData : (savedSectionsData.sections || savedSectionsData.data || []);

        let normalizedSubjects = [];
        if (Array.isArray(rawSubjectsData)) {
            normalizedSubjects = rawSubjectsData.map(s => typeof s === 'string' ? { name: s, gradeLevel: "General" } : s);
        } else if (typeof rawSubjectsData === 'object' && rawSubjectsData !== null) {
            Object.keys(rawSubjectsData).forEach(gradeCategory => {
                const list = rawSubjectsData[gradeCategory];
                if (Array.isArray(list)) {
                    list.forEach(subj => {
                        if (typeof subj === 'string') {
                            normalizedSubjects.push({ name: subj, gradeLevel: gradeCategory });
                        } else {
                            normalizedSubjects.push({ ...subj, gradeLevel: subj.gradeLevel || gradeCategory });
                        }
                    });
                }
            });
        }

        const daySlots = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const timeSlots = [
            "07:30 AM - 08:30 AM",
            "08:30 AM - 09:30 AM",
            "09:30 AM - 10:30 AM",
            "10:30 AM - 11:30 AM",
            "01:00 PM - 02:00 PM",
            "02:00 PM - 03:00 PM",
            "03:00 PM - 04:00 PM",
            "04:00 PM - 05:00 PM"
        ];

        const normalizedTeachers = rawTeachers.map(t => {
            const firstName = t.firstName || t.first_name || "Instructor";
            const lastName = t.lastName || t.last_name || "";
            const fullName = (t.name || t.fullName || `${firstName} ${lastName}`).trim();
            const subjects = safeParseArray(t.subjects || t.subject_list || t.subject);
            const workDays = safeParseArray(t.workDays || t.work_days);
            const targetGrade = t.target_grade || t.targetGrade || t.gradeLevel || "Grade 8";

            return {
                ...t,
                fullName,
                subjects,
                targetGrade,
                workDays: workDays.length > 0 ? workDays : daySlots
            };
        });

        // --- OVERALL HIGH-LEVEL AUDIT SUMMARY METRICS ---
        const systemAuditSummary = {
            totalSections: savedSections.length,
            totalTeachers: normalizedTeachers.length,
            totalRooms: savedRooms.length,
            uncoveredSubjects: [],
            gradeDeficits: [],
            dayDeficits: []
        };

        // 1. Audit Day-Level Shortages across all grades
        daySlots.forEach(day => {
            const working = normalizedTeachers.filter(t => t.workDays.some(d => d.toLowerCase().trim() === day.toLowerCase().trim()));
            if (working.length === 0) {
                systemAuditSummary.dayDeficits.push(day);
            }
        });

        // 2. Audit Subject Shortages across all registered subjects
        const allSystemSubjects = [...new Set(normalizedSubjects.map(s => typeof s === 'string' ? s : s.name))];
        allSystemSubjects.forEach(subj => {
            const qualified = normalizedTeachers.filter(t => t.subjects.some(s => s.toLowerCase().trim() === subj.toLowerCase().trim()));
            if (qualified.length === 0) {
                systemAuditSummary.uncoveredSubjects.push(subj);
            }
        });

        // 3. Audit Specific Grade Levels
        const distinctGrades = [...new Set(savedSections.map(s => s.grade_level || s.target_grade || s.gradeLevel || "Grade 8"))];
        distinctGrades.forEach(grade => {
            const gradeNum = extractGradeNumber(grade);
            const gradeTeachers = normalizedTeachers.filter(t => extractGradeNumber(t.targetGrade) === gradeNum);
            if (gradeTeachers.length === 0) {
                systemAuditSummary.gradeDeficits.push(`${grade} (0 Teachers Assigned)`);
            }
        });

        // Matrix Tracking Containers
        const teacherConflictMatrix = {};
        const sectionConflictMatrix = {};
        const roomConflictMatrix = {};    
        const subjectPerDayTracker = {};  
        const lastAssignedTracker = {};
        const systemDiagnosticsLogs = [];
        const teacherSchedulesMap = {};

        normalizedTeachers.forEach(t => {
            teacherSchedulesMap[t.fullName] = { details: t, slots: [] };
        });

        // Matrix Generation Loop
        for (const section of savedSections) {
            const sectionGrade = section.grade_level || section.target_grade || section.gradeLevel || "Grade 8";
            const sectionGradeNum = extractGradeNumber(sectionGrade);

            let sectionSubjects = safeParseArray(section.subjects || section.subject_list);
            
            if (sectionSubjects.length === 0) {
                const gradeTeachers = normalizedTeachers.filter(t => {
                    const tGradeNum = extractGradeNumber(t.targetGrade);
                    return !sectionGradeNum || !tGradeNum || tGradeNum === sectionGradeNum;
                });
                sectionSubjects = [...new Set(gradeTeachers.flatMap(t => t.subjects))];
            }

            if (sectionSubjects.length === 0) {
                sectionSubjects = allSystemSubjects;
            }

            for (const day of daySlots) {
                let dailyFilledCount = 0;

                for (let timeIndex = 0; timeIndex < timeSlots.length; timeIndex++) {
                    const currentTime = timeSlots[timeIndex];
                    const sectionSlotKey = `${section.name}-${day}-${currentTime}`;

                    if (sectionConflictMatrix[sectionSlotKey]) {
                        dailyFilledCount++;
                        continue;
                    }

                    for (const subjectName of sectionSubjects) {
                        const cleanSubjectName = typeof subjectName === 'string' ? subjectName.trim() : subjectName.name.trim();

                        const dailySubjectKey = `${section.name}-${day}-${cleanSubjectName.toLowerCase()}`;
                        if (subjectPerDayTracker[dailySubjectKey]) continue;

                        const fatigueSectionKey = `${section.name}-${day}`;
                        const lastSessionData = lastAssignedTracker[fatigueSectionKey];
                        if (lastSessionData && lastSessionData.subject.toLowerCase() === cleanSubjectName.toLowerCase()) {
                            continue;
                        }

                        let teacherToUse = normalizedTeachers.find(t => {
                            const conductsSubject = t.subjects.some(s => s.toLowerCase().trim() === cleanSubjectName.toLowerCase());
                            const worksThisDay = t.workDays.some(d => d.toLowerCase().trim() === day.toLowerCase().trim());
                            const teacherKey = `${t.fullName}-${day}-${currentTime}`;
                            const isTeacherBusy = teacherConflictMatrix[teacherKey];

                            const teacherGradeNum = extractGradeNumber(t.targetGrade);
                            const isGradeMatch = !sectionGradeNum || !teacherGradeNum || (teacherGradeNum === sectionGradeNum);
                            let hasFatigue = lastSessionData && lastSessionData.teacher === t.fullName;

                            return conductsSubject && worksThisDay && !isTeacherBusy && isGradeMatch && !hasFatigue;
                        });

                        if (!teacherToUse) {
                            teacherToUse = normalizedTeachers.find(t => {
                                const conductsSubject = t.subjects.some(s => s.toLowerCase().trim() === cleanSubjectName.toLowerCase());
                                const worksThisDay = t.workDays.some(d => d.toLowerCase().trim() === day.toLowerCase().trim());
                                const teacherKey = `${t.fullName}-${day}-${currentTime}`;
                                return conductsSubject && worksThisDay && !teacherConflictMatrix[teacherKey];
                            });
                        }

                        if (!teacherToUse) continue;

                        let availableRoom = savedRooms.find(r => !roomConflictMatrix[`${r.name}-${day}-${currentTime}`])?.name;
                        if (!availableRoom && savedRooms.length > 0) availableRoom = savedRooms[0].name;

                        if (!availableRoom) continue;

                        const teacherFullName = teacherToUse.fullName;
                        teacherConflictMatrix[`${teacherFullName}-${day}-${currentTime}`] = true;
                        sectionConflictMatrix[sectionSlotKey] = true;
                        roomConflictMatrix[`${availableRoom}-${day}-${currentTime}`] = true;
                        subjectPerDayTracker[dailySubjectKey] = true;

                        lastAssignedTracker[fatigueSectionKey] = { teacher: teacherFullName, subject: cleanSubjectName };

                        teacherSchedulesMap[teacherFullName].slots.push({
                            subject: cleanSubjectName,
                            section: section.name,
                            day: day,
                            time: currentTime,
                            room: availableRoom,
                            gradeLevel: sectionGrade
                        });

                        dailyFilledCount++;
                        break;
                    }
                }

                if (dailyFilledCount < timeSlots.length) {
                    systemDiagnosticsLogs.push(`Section [${section.name}] missing ${timeSlots.length - dailyFilledCount} period(s) on ${day}`);
                }
            }
        }

        renderSearchableDirectoryDashboard(container, teacherSchedulesMap, systemAuditSummary, systemDiagnosticsLogs);

    } catch (err) {
        console.error("Critical matrix application failure:", err);
        container.innerHTML = `
            <div style="text-align: center; color: #ff5f5f; padding: 40px; background: rgba(239, 68, 68, 0.1); border-radius: 10px; margin-top: 20px;">
                ⚠️ Connection Error: Failed to generate master timetable. (${err.message})
            </div>
        `;
    }
}

function renderSearchableDirectoryDashboard(container, teacherSchedulesMap, auditSummary, diagnosticsLogs) {
    container.innerHTML = "";

    const directoryPanel = document.createElement("div");
    directoryPanel.id = "engine-directory-panel-view";
    directoryPanel.style.marginTop = "20px";
    container.appendChild(directoryPanel);

    // --- OVERALL SYSTEM HEALTH & CAPACITY AUDIT BOARD ---
    const summaryCard = document.createElement("div");
    summaryCard.style.cssText = "background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(0, 210, 255, 0.2); border-radius: 12px; padding: 20px; margin-bottom: 25px;";

    const totalIssues = auditSummary.uncoveredSubjects.length + auditSummary.gradeDeficits.length + auditSummary.dayDeficits.length;
    const statusColor = totalIssues === 0 ? "#34d399" : "#f59e0b";
    const statusIcon = totalIssues === 0 ? "✅" : "⚠️";

    summaryCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 14px; margin-bottom: 16px;">
            <h3 style="color: #ffffff; margin: 0; font-size: 1.25rem; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                ${statusIcon} Overall School Capacity Audit Report
            </h3>
            <span style="background: ${statusColor}22; color: ${statusColor}; font-size: 0.85rem; font-weight: bold; padding: 4px 14px; border-radius: 20px; border: 1px solid ${statusColor}44;">
                ${totalIssues === 0 ? "System Fully Operational" : `${totalIssues} Resource Shortages Detected`}
            </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px;">
            <div style="background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 8px; border-left: 3px solid #00d2ff;">
                <div style="color: #94a3b8; font-size: 0.78rem;">Total Registered Sections</div>
                <div style="color: #ffffff; font-size: 1.3rem; font-weight: bold; margin-top: 2px;">${auditSummary.totalSections} Sections</div>
            </div>
            <div style="background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 8px; border-left: 3px solid #00d2ff;">
                <div style="color: #94a3b8; font-size: 0.78rem;">Total Active Teachers</div>
                <div style="color: #ffffff; font-size: 1.3rem; font-weight: bold; margin-top: 2px;">${auditSummary.totalTeachers} Teachers</div>
            </div>
            <div style="background: rgba(30, 41, 59, 0.5); padding: 12px; border-radius: 8px; border-left: 3px solid #00d2ff;">
                <div style="color: #94a3b8; font-size: 0.78rem;">Available Classrooms</div>
                <div style="color: #ffffff; font-size: 1.3rem; font-weight: bold; margin-top: 2px;">${auditSummary.totalRooms} Rooms</div>
            </div>
        </div>

        ${totalIssues > 0 ? `
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 14px; color: #fca5a5; font-size: 0.88rem;">
                <div style="font-weight: bold; color: #ef4444; margin-bottom: 6px;">Critical Action Items for Admin:</div>
                <ul style="margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px;">
                    ${auditSummary.uncoveredSubjects.map(s => `<li><strong>Missing Subject Teacher:</strong> No teacher assigned to teach <u>${s}</u>.</li>`).join('')}
                    ${auditSummary.gradeDeficits.map(g => `<li><strong>Grade Coverage Deficit:</strong> <u>${g}</u> has no instructors.</li>`).join('')}
                    ${auditSummary.dayDeficits.map(d => `<li><strong>Day Coverage Deficit:</strong> No teachers are set to work on <u>${d}</u>.</li>`).join('')}
                </ul>
            </div>
        ` : `
            <div style="color: #34d399; font-size: 0.88rem;">
                All subjects, grade levels, and workdays have sufficient teacher coverage.
            </div>
        `}
    `;

    directoryPanel.appendChild(summaryCard);

    // --- GRADE LEVEL DIRECTORY CARDS ---
    const gradeLevelTeacherMap = {};

    for (const teacherName in teacherSchedulesMap) {
        const item = teacherSchedulesMap[teacherName];
        if (!item.slots || item.slots.length === 0) continue;

        const teacherPref = item.details.targetGrade || "Grade 8";
        const primaryGradeKey = teacherPref.includes("Junior High School") 
            ? teacherPref 
            : `Junior High School - ${teacherPref}`;

        if (!gradeLevelTeacherMap[primaryGradeKey]) {
            gradeLevelTeacherMap[primaryGradeKey] = {};
        }

        gradeLevelTeacherMap[primaryGradeKey][teacherName] = item;
    }

    const gradeCardsContainer = document.createElement("div");
    gradeCardsContainer.style.cssText = "display: flex; flex-direction: column; gap: 20px;";
    directoryPanel.appendChild(gradeCardsContainer);

    const sortedGrades = Object.keys(gradeLevelTeacherMap).sort();

    sortedGrades.forEach(gradeName => {
        const teachersInGrade = gradeLevelTeacherMap[gradeName];

        const gradeBox = document.createElement("div");
        gradeBox.style.cssText = "background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px;";

        let boxHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px;">
                <h3 style="color: #00d2ff; margin: 0; font-size: 1.1rem; font-weight: bold;">
                    📁 ${gradeName}
                </h3>
                <span style="background: rgba(0,210,255,0.1); color: #00d2ff; font-size: 0.8rem; font-weight: bold; padding: 4px 12px; border-radius: 20px;">
                    ${Object.keys(teachersInGrade).length} Teachers Assigned
                </span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
        `;

        for (const teacherName in teachersInGrade) {
            const teacherObj = teachersInGrade[teacherName];
            const subjects = teacherObj.details.subjects || [];

            boxHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.6); padding: 12px 18px; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <span style="color: #00d2ff;">👤</span>
                        <div>
                            <div style="color: #ffffff; font-weight: bold;">${teacherName}</div>
                            <div style="display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap;">
                                ${subjects.map(s => `<span style="background: rgba(148, 163, 184, 0.12); color: #cbd5e1; font-size: 0.73rem; padding: 2px 7px; border-radius: 4px;">📚 ${s}</span>`).join('')}
                            </div>
                        </div>
                    </div>
                    <span style="background: rgba(16, 185, 129, 0.1); color: #34d399; font-size: 0.78rem; font-weight: 600; padding: 4px 10px; border-radius: 12px;">
                        ${teacherObj.slots.length} Classes Scheduled
                    </span>
                </div>
            `;
        }

        boxHTML += `</div>`;
        gradeBox.innerHTML = boxHTML;
        gradeCardsContainer.appendChild(gradeBox);
    });

    // 5. Search Bar Handler
    const searchBar = document.getElementById("directory-search-bar");
    if (searchBar) {
        searchBar.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            document.querySelectorAll(".teacher-item-row").forEach(row => {
                const searchData = row.getAttribute("data-teacher-search");
                row.style.display = searchData.includes(query) ? "flex" : "none";
            });
        });
    }

    // 6. View Schedule Action Handler
    document.querySelectorAll(".view-single-schedule-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const selectedTeacher = btn.getAttribute("data-teacher-key");
            directoryPanel.style.display = "none";
            renderTargetedInstructorMatrix(scheduleViewerPanel, directoryPanel, teacherSchedulesMap[selectedTeacher], selectedTeacher, daySlots, timeSlots);
            scheduleViewerPanel.style.display = "block";
        });
    });
}

/**
 * Renders an isolated timeline sheet for the instructor
 */
function renderTargetedInstructorMatrix(displayTarget, directoryPanel, teacherData, teacherName, daySlots, timeSlots) {
    displayTarget.innerHTML = "";

    const formattedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    if (!document.getElementById("print-isolated-matrix-rules")) {
        const printStyles = document.createElement("style");
        printStyles.id = "print-isolated-matrix-rules";
        printStyles.innerHTML = `
            .custom-timetable-card {
                background: rgba(30, 41, 59, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                padding: 22px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                backdrop-filter: blur(4px);
            }
            .custom-timetable-table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 5px;
                text-align: center;
                min-width: 900px;
            }
            .custom-timetable-table th.time-header {
                background: rgba(15, 23, 42, 0.6); color: #94a3b8; padding: 10px; border-radius: 6px; font-size: 0.85rem; width: 13%;
            }
            .custom-timetable-table th.day-header {
                background: rgba(15, 23, 42, 0.4); color: #e2e8f0; padding: 10px; border-radius: 6px; font-size: 0.85rem;
            }

            @media print {
                div.control-deck-panel, header, nav, .sidebar, .nav-container, .btn-print-trigger, button,
                #btn-generate, #engine-processing-status, .dashboard-card-panel > h3, .system-diagnostics-card,
                #engine-directory-panel-view, .isolated-action-routing-header,
                .main-content > p, .main-content > h2, #timetable-isolated-print-canvas-block > p, #timetable-isolated-print-canvas-block > h2 {
                    display: none !important;
                }
               
                body, .main-content, .dashboard-card-panel, #timetable-isolated-print-canvas-block {
                    background: #ffffff !important;
                    color: #000000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    box-shadow: none !important;
                    border: none !important;
                    font-family: Arial, sans-serif !important;
                }

                @page {
                    size: letter landscape;
                    margin: 5mm;
                }

                #timetable-isolated-print-canvas-block {
                    display: block !important;
                    background: #ffffff !important;
                    padding: 0 !important;
                }

                .timetable-controls, .instructor-header-box, .custom-timetable-card {
                    border: none !important;
                    box-shadow: none !important;
                    background: transparent !important;
                    background-color: transparent !important;
                    padding: 0 !important;
                    margin: 0 0 10px 0 !important;
                }
               
                .custom-timetable-table {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
                    width: 100% !important;
                    border: 2px solid #000000 !important;
                }

                .custom-timetable-table th {
                    background: #f1f5f9 !important;
                    color: #000000 !important;
                    border: 1px solid #000000 !important;
                    padding: 6px 4px !important;
                    font-size: 0.8rem !important;
                }

                .custom-timetable-table td {
                    border: 1px solid #000000 !important;
                    padding: 6px 4px !important;
                    background: #ffffff !important;
                }
            }

            .pdf-export-mode {
                background: #ffffff !important;
                color: #000000 !important;
                border: none !important;
                box-shadow: none !important;
                padding: 4px !important;
                font-family: Arial, Helvetica, sans-serif !important;
                width: 100% !important;
                page-break-inside: avoid !important;
            }

            .pdf-export-mode .custom-timetable-card,
            .pdf-export-mode .timetable-controls,
            .pdf-export-mode .instructor-header-box {
                border: none !important;
                box-shadow: none !important;
                background: transparent !important;
                padding: 0 !important;
            }

            .pdf-export-mode .header-title-text {
                color: #000000 !important;
                font-size: 1.2rem !important;
            }

            .pdf-export-mode .header-date-text {
                color: #475569 !important;
                font-size: 0.75rem !important;
            }

            .pdf-export-mode .custom-timetable-table {
                border-collapse: collapse !important;
                border-spacing: 0 !important;
                width: 100% !important;
                background: #ffffff !important;
                border: 1.5px solid #000000 !important;
                page-break-inside: avoid !important;
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
        directoryPanel.style.display = "block";
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
                    <td class="pdf-vacant-text" style="background: rgba(255, 255, 255, 0.01); border: 1px dashed rgba(255, 255, 255, 0.03); border-radius: 8px; color: rgba(255, 255, 255, 0.15); font-size: 0.75rem; font-style: italic; vertical-align: middle; padding: 12px;">
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