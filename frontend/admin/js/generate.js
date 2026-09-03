/**
 * Advanced Automated Timetable Generator (Strict Conflict Detection Architecture)
 * Renders an isolated Master Directory List view of teachers with a targeted drill-down schedule viewer.
 * Retains comprehensive, scannable system diagnostics logs block above the workflow board.
 */

// Helper to handle stringified JSON array fields safely
function safeParseArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/**
 * Helper function to return placeholder soft colors for subjects inside admin panel preview canvas
 */
function getSubjectColor(subjectName) {
    const name = (subjectName || "").toLowerCase();
    if (name.includes("math")) return "#fed7aa";
    if (name.includes("science")) return "#bbf7d0";
    if (name.includes("english")) return "#bfdbfe";
    if (name.includes("history") || name.includes("ap")) return "#fef08a";
    if (name.includes("filipino")) return "#fbcfe8";
    return "#e2e8f0";
}

async function processSystemTimetable() {
    console.log("⚡ Generating Synchronized 8-Period Student Timetable Matrix with Directory & Diagnostics...");
   
    const tableBody = document.getElementById("timetable-matrix-output-body");
    const container = tableBody
        ? (tableBody.closest('.dashboard-card-panel') || tableBody.parentElement)
        : (document.querySelector('.dashboard-card-panel') || document.querySelector('.main-content'));
   
    if (!container) {
        console.error("Layout Error: Container element for timetable display not found.");
        return;
    }

    container.innerHTML = `
        <div id="engine-processing-status" style="text-align: center; color: #00d2ff; font-weight: bold; padding: 40px; font-size: 1.1rem;">
            🔄 Composing Strict Subject-Teacher Constraints & Building Distributed Calendar Grids...
        </div>
    `;

    const token = localStorage.getItem('token') || 
                  localStorage.getItem('jwt') || 
                  localStorage.getItem('authToken') || 
                  localStorage.getItem('accessToken');

    if (!token) {
        container.innerHTML = `
            <div style="text-align: center; color: #ff5f5f; padding: 40px; border: 1px solid rgba(255,95,95,0.2); border-radius: 8px;">
                ⚠️ Authentication Failure: Security token missing or expired. Please sign out and log back in.
            </div>
        `;
        return;
    }

    try {
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        const baseOrigin = window.location.origin;

        // Fetch data from endpoints
        const [teachersResponse, subjectsResponse, roomsResponse, sectionsResponse] = await Promise.all([
            fetch(`${baseOrigin}/api/admin/teachers`, { headers }),
            fetch(`${baseOrigin}/api/admin/subjects`, { headers }),
            fetch(`${baseOrigin}/api/admin/rooms`, { headers }),
            fetch(`${baseOrigin}/api/admin/sections`, { headers })
        ]);

        if (!teachersResponse.ok || !subjectsResponse.ok || !roomsResponse.ok || !sectionsResponse.ok) {
            throw new Error(`API Database Synchronization Failed with Status Code: ${teachersResponse.status}`);
        }

        const rawTeachersData = await teachersResponse.json();
        const rawSubjectsData = await subjectsResponse.json();
        const savedRoomsData = await roomsResponse.json();
        const savedSectionsData = await sectionsResponse.json();

        // 1. Safe Normalization Converters
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

        let missingTabs = [];
        if (rawTeachers.length === 0) missingTabs.push("Teachers 👤");
        if (normalizedSubjects.length === 0) missingTabs.push("Subjects 📚");
        if (savedRooms.length === 0) missingTabs.push("Rooms 🏠");
        if (savedSections.length === 0) missingTabs.push("Sections 📅");

        if (missingTabs.length > 0) {
            container.innerHTML = `
                <div style="text-align: center; color: #ff5f5f; padding: 40px; border: 1px solid rgba(255,95,95,0.2); border-radius: 8px;">
                    ⚠️ Generation Suspended: Missing database targets for: <strong style="color: #fff;">${missingTabs.join(', ')}</strong>.<br><br>
                    <span style="color: #a0a0c0; font-size: 0.9rem;">Make sure you have added entries in all tabs before running the engine.</span>
                </div>
            `;
            return;
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

        const teacherConflictMatrix = {};
        const sectionConflictMatrix = {};
        const roomConflictMatrix = {};    
        const subjectPerDayTracker = {};  
        const lastAssignedTracker = {};
       
        const systemDiagnosticsLogs = [];
        const teacherSchedulesMap = {};

        // Normalize raw teacher data with explicit preferred target grade
        const normalizedTeachers = rawTeachers.map(t => {
            const firstName = t.firstName || t.first_name || "Instructor";
            const lastName = t.lastName || t.last_name || "";
            const fullName = `${firstName} ${lastName}`.trim();
           
            const subjects = safeParseArray(t.subjects || t.subject_list);
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

        normalizedTeachers.forEach(t => {
            teacherSchedulesMap[t.fullName] = {
                details: t,
                slots: []
            };
        });

        const validSubjectsToSchedule = normalizedSubjects;

        // Count teachers per preferred target grade to check saturation
        const preferredGradeCounts = {};
        normalizedTeachers.forEach(t => {
            const g = t.targetGrade;
            preferredGradeCounts[g] = (preferredGradeCounts[g] || 0) + 1;
        });

        // 3. Automated Priority-First & Fallback Reallocation Engine
        for (const section of savedSections) {
            const sectionGrade = section.grade_level || section.target_grade || section.gradeLevel;

            for (const day of daySlots) {
                let dailyFilledCount = 0;

                for (let timeIndex = 0; timeIndex < timeSlots.length; timeIndex++) {
                    const currentTime = timeSlots[timeIndex];

                    for (const subjectObj of validSubjectsToSchedule) {
                        const subjectName = typeof subjectObj === 'string' ? subjectObj : subjectObj.name;

                        const dailySubjectKey = `${section.name}-${day}-${subjectName.toLowerCase()}`;
                        if (subjectPerDayTracker[dailySubjectKey]) continue;

                        const fatigueSectionKey = `${section.name}-${day}`;
                        const lastSessionData = lastAssignedTracker[fatigueSectionKey];
                        if (lastSessionData && lastSessionData.subject.toLowerCase() === subjectName.toLowerCase()) {
                            continue;
                        }

                        // Helper filter for candidate validation
                        const filterTeacher = (t) => {
                            const conductsSubject = t.subjects.some(s => s.toLowerCase() === subjectName.toLowerCase());
                            const worksThisDay = t.workDays.some(d => d.toLowerCase() === day.toLowerCase());
                            const teacherKey = `${t.fullName}-${day}-${currentTime}`;
                            const isTeacherBusy = teacherConflictMatrix[teacherKey];

                            let hasFatigue = false;
                            if (lastSessionData && lastSessionData.teacher === t.fullName) {
                                hasFatigue = true;
                            }

                            return conductsSubject && worksThisDay && !isTeacherBusy && !hasFatigue;
                        };

                        // PRIORITY 1: Teacher who MATCHES the section/target grade level
                        let teacherToUse = normalizedTeachers.find(t => {
                            const gradeMatch = sectionGrade ? t.targetGrade.toLowerCase() === sectionGrade.toLowerCase() : true;
                            return gradeMatch && filterTeacher(t);
                        });

                        // FALLBACK 1: Relax fatigue check for exact grade match
                        if (!teacherToUse) {
                            teacherToUse = normalizedTeachers.find(t => {
                                const gradeMatch = sectionGrade ? t.targetGrade.toLowerCase() === sectionGrade.toLowerCase() : true;
                                const conductsSubject = t.subjects.some(s => s.toLowerCase() === subjectName.toLowerCase());
                                const worksThisDay = t.workDays.some(d => d.toLowerCase() === day.toLowerCase());
                                const teacherKey = `${t.fullName}-${day}-${currentTime}`;
                                return gradeMatch && conductsSubject && worksThisDay && !teacherConflictMatrix[teacherKey];
                            });
                        }

                        // FALLBACK 2: OVERFLOW REALLOCATION
                        // If no exact match is found, pull an available teacher from a saturated grade cohort
                        if (!teacherToUse) {
                            teacherToUse = normalizedTeachers.find(t => {
                                const isSaturatedCohort = preferredGradeCounts[t.targetGrade] >= 2;
                                return isSaturatedCohort && filterTeacher(t);
                            });
                        }

                        if (!teacherToUse) continue;

                        let availableRoom = null;
                        for (const room of savedRooms) {
                            const roomKey = `${room.name}-${day}-${currentTime}`;
                            if (!roomConflictMatrix[roomKey]) {
                                availableRoom = room.name;
                                break;
                            }
                        }

                        if (!availableRoom) continue;

                        const teacherFullName = teacherToUse.fullName;
                        const finalTeacherKey = `${teacherFullName}-${day}-${currentTime}`;
                        const finalSectionKey = `${section.name}-${day}-${currentTime}`;
                        const finalRoomKey = `${availableRoom}-${day}-${currentTime}`;

                        teacherConflictMatrix[finalTeacherKey] = true;
                        sectionConflictMatrix[finalSectionKey] = true;
                        roomConflictMatrix[finalRoomKey] = true;
                        subjectPerDayTracker[dailySubjectKey] = true;

                        lastAssignedTracker[fatigueSectionKey] = {
                            teacher: teacherFullName,
                            subject: subjectName
                        };

                        // Determine assigned grade label
                        const assignedGradeLabel = sectionGrade 
                            ? (sectionGrade.includes("Grade") ? `Junior High School - ${sectionGrade}` : sectionGrade)
                            : `Junior High School - ${teacherToUse.targetGrade}`;

                        teacherSchedulesMap[teacherFullName].slots.push({
                            subject: subjectName,
                            section: section.name,
                            day: day,
                            time: currentTime,
                            room: availableRoom,
                            gradeLevel: assignedGradeLabel
                        });

                        dailyFilledCount++;
                        break;
                    }
                }

                if (dailyFilledCount < timeSlots.length) {
                    systemDiagnosticsLogs.push(`⚠️ Quota Deficit: Ang [${section.name}] ay mayroon lamang ${dailyFilledCount}/${timeSlots.length} subjects tuwing [${day}].`);
                }
            }
        }

        renderSearchableDirectoryDashboard(container, teacherSchedulesMap, daySlots, timeSlots, systemDiagnosticsLogs);

        // Commit engine results
        try {
            console.log("💾 Automatically committing computed timetables over old server targets...");
            await fetch(`${baseOrigin}/api/admin/schedules/save-bulk`, {
                method: "POST",
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ schedules: teacherSchedulesMap })
            });
        } catch (saveErr) {
            console.error("Failed to background-commit timetable to server storage file:", saveErr);
        }

    } catch (err) {
        console.error("Critical matrix application failure:", err);
        container.innerHTML = `
            <div style="text-align: center; color: #ff5f5f; padding: 40px;">
                ⚠️ Connection Error: Failed to secure teacher metrics from your database server. (${err.message})
            </div>
        `;
    }
}

/**
 * Renders Teacher Directory Grouped Strictly by Preferred / Assigned Grade Level
 */
function renderSearchableDirectoryDashboard(container, teacherSchedulesMap, daySlots, timeSlots, diagnosticsLogs) {
    container.innerHTML = "";

    const directoryPanel = document.createElement("div");
    directoryPanel.id = "engine-directory-panel-view";
   
    const scheduleViewerPanel = document.createElement("div");
    scheduleViewerPanel.id = "engine-schedule-viewer-panel";
    scheduleViewerPanel.style.display = "none";

    container.appendChild(directoryPanel);
    container.appendChild(scheduleViewerPanel);

    // 1. Diagnostics Header
    if (diagnosticsLogs && diagnosticsLogs.length > 0) {
        const diagPanel = document.createElement("div");
        diagPanel.className = "system-diagnostics-card";
        diagPanel.style.cssText = "background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; padding: 16px; margin-bottom: 25px;";
       
        let logsHTML = `
            <h4 style="color: #ef4444; margin: 0 0 10px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">
                ⚠️ Timetable Engine Quota Diagnostics (${diagnosticsLogs.length})
            </h4>
            <div style="max-height: 140px; overflow-y: auto; font-size: 0.88rem; color: #fca5a5; line-height: 1.6; display: flex; flex-direction: column; gap: 6px; padding-right: 5px;">
        `;
       
        diagnosticsLogs.forEach(log => {
            logsHTML += `<div style="background: rgba(0,0,0,0.2); padding: 6px 12px; border-radius: 6px; border-left: 3px solid #ef4444;">${log}</div>`;
        });
       
        logsHTML += `</div><div style="font-size: 0.8rem; color: #94a3b8; margin-top: 10px; font-style: italic;">Tip: Ang mga guro ay maaari nang magturo sa kahit anong section o grade level na may hawak ng kanilang paksa nang walang restriksyon.</div>`;
        diagPanel.innerHTML = logsHTML;
        directoryPanel.appendChild(diagPanel);
    }

    // 2. Directory Grouping based on explicitly assigned grade or teacher preference
    const gradeLevelTeacherMap = {};

    for (const teacherName in teacherSchedulesMap) {
        const item = teacherSchedulesMap[teacherName];
        const teacherPref = item.details.targetGrade || item.details.target_grade || "Grade 8";
        
        let primaryGradeKey = teacherPref.includes("Junior High School") 
            ? teacherPref 
            : `Junior High School - ${teacherPref}`;

        // If teacher has assigned slots, check if they were assigned to an actual section grade
        if (item.slots && item.slots.length > 0) {
            const slotGrade = item.slots[0].gradeLevel;
            if (slotGrade) primaryGradeKey = slotGrade;
        }

        if (!gradeLevelTeacherMap[primaryGradeKey]) {
            gradeLevelTeacherMap[primaryGradeKey] = {};
        }

        gradeLevelTeacherMap[primaryGradeKey][teacherName] = item;
    }

    // 3. Search and Header Box
    const filterHeaderBox = document.createElement("div");
    filterHeaderBox.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; flex-wrap: wrap; gap: 12px; background: rgba(15,23,42,0.4); padding: 18px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06);";
    filterHeaderBox.innerHTML = `
        <div>
            <h4 style="color: #ffffff; margin: 0; font-size: 1.25rem; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                🏫 Grade-Level Instructor Directories
            </h4>
            <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 0.85rem;">Instructors are grouped below by their umbrella grade levels.</p>
        </div>
        <input type="text" id="directory-search-bar" placeholder="🔍 Search teacher or subject..." style="background: rgba(30, 41, 59, 0.9); color: #fff; border: 1px solid rgba(255,255,255,0.15); padding: 10px 16px; border-radius: 8px; font-size: 0.9rem; width: 300px; outline: none;">
    `;
    directoryPanel.appendChild(filterHeaderBox);

    const gradeCardsContainer = document.createElement("div");
    gradeCardsContainer.style.cssText = "display: flex; flex-direction: column; gap: 24px;";
    directoryPanel.appendChild(gradeCardsContainer);

    const sortedGrades = Object.keys(gradeLevelTeacherMap).sort();

    if (sortedGrades.length === 0) {
        gradeCardsContainer.innerHTML = `
            <div style="text-align: center; color: #64748b; padding: 40px; font-style: italic; background: rgba(15,23,42,0.3); border-radius: 12px;">
                ⚠️ No active schedules assigned to any grade level.
            </div>
        `;
        return;
    }

    // 4. Render Directory Folder Cards
    sortedGrades.forEach(gradeName => {
        const teachersInGrade = gradeLevelTeacherMap[gradeName];

        const gradeBox = document.createElement("div");
        gradeBox.className = "grade-level-card-box";
        gradeBox.style.cssText = "background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);";

        let boxHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px;">
                <h3 style="color: #00d2ff; margin: 0; font-size: 1.15rem; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                    📁 ${gradeName}
                </h3>
                <span style="background: rgba(0,210,255,0.1); color: #00d2ff; font-size: 0.8rem; font-weight: bold; padding: 4px 12px; border-radius: 20px; border: 1px solid rgba(0,210,255,0.2);">
                    ${Object.keys(teachersInGrade).length} Teachers Assigned
                </span>
            </div>
           
            <div style="display: flex; flex-direction: column; gap: 10px;">
        `;

        for (const teacherName in teachersInGrade) {
            const teacherObj = teachersInGrade[teacherName];
            const subjects = teacherObj.details.subjects || [];

            boxHTML += `
                <div class="teacher-item-row" data-teacher-search="${teacherName.toLowerCase()} ${subjects.join(' ').toLowerCase()}" style="display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 42, 0.6); padding: 12px 18px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);">
                   
                    <div style="display: flex; align-items: center; gap: 14px; flex: 1;">
                        <span style="background: rgba(0,210,255,0.1); color: #00d2ff; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 1rem; flex-shrink: 0;">👤</span>
                        <div>
                            <div style="color: #ffffff; font-weight: bold; font-size: 0.95rem;">${teacherName}</div>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
                                ${subjects.map(s => `<span style="background: rgba(148, 163, 184, 0.12); color: #cbd5e1; font-size: 0.73rem; padding: 2px 7px; border-radius: 4px;">📚 ${s}</span>`).join('')}
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; gap: 16px;">
                        <span style="background: rgba(16, 185, 129, 0.1); color: #34d399; font-size: 0.78rem; font-weight: 600; padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(16,185,129,0.15);">
                            ${teacherObj.slots.length} Classes
                        </span>

                        <button class="view-single-schedule-btn" data-teacher-key="${teacherName}" style="background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%); color: #fff; border: none; padding: 8px 14px; font-size: 0.82rem; font-weight: bold; border-radius: 6px; cursor: pointer;">
                            📅 View Schedule ⚡
                        </button>
                    </div>

                </div>
            `;
        }

        boxHTML += `</div>`;
        gradeBox.innerHTML = boxHTML;
        gradeCardsContainer.appendChild(gradeBox);
    });
}

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