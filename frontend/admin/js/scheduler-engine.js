/**
 * Advanced Automated Timetable Generator (Strict Conflict Detection Architecture)
 * Renders an isolated Master Directory List view of teachers with a targeted drill-down schedule viewer.
 * Retains comprehensive, scannable system diagnostics logs block above the workflow board.
 */
async function processSystemTimetable() {
    console.log("⚡ Generating Synchronized 8-Period Student Timetable Matrix with Directory & Diagnostics...");
    const tableBody = document.getElementById("timetable-matrix-output-body");
    
    const container = tableBody ? tableBody.closest('.dashboard-card-panel') || tableBody.parentElement : null;
    
    if (!container) {
        console.error("Layout Error: Container element for timetable display not found.");
        return;
    }

    container.innerHTML = `
        <div id="engine-processing-status" style="text-align: center; color: #00d2ff; font-weight: bold; padding: 40px; font-size: 1.1rem;">
            🔄 Composing Strict Subject-Teacher Constraints & Building Distributed Calendar Grids...
        </div>
    `;

    const token = localStorage.getItem('token');
    if (!token) {
        container.innerHTML = `
            <div style="text-align: center; color: #ff5f5f; padding: 40px;">
                ⚠️ Authentication Failure: Security token missing. Please sign out and log back in.
            </div>
        `;
        return;
    }

    try {
        const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
        const baseOrigin = window.location.origin;

        // KINUKUHA ANG LAHAT NG DATA MULA SA API
        const [teachersResponse, subjectsResponse, roomsResponse, sectionsResponse] = await Promise.all([
            fetch(`${baseOrigin}/api/admin/teachers`, { headers }),
            fetch(`${baseOrigin}/api/admin/subjects`, { headers }),
            fetch(`${baseOrigin}/api/admin/rooms`, { headers }),
            fetch(`${baseOrigin}/api/admin/sections`, { headers })
        ]);

        if (!teachersResponse.ok || !subjectsResponse.ok || !roomsResponse.ok || !sectionsResponse.ok) {
            throw new Error("API Database Synchronization Failed.");
        }

        const rawTeachers = await teachersResponse.json();
        const rawSubjects = await subjectsResponse.json();
        const savedRooms = await roomsResponse.json();
        const savedSections = await sectionsResponse.json();

        let missingTabs = [];
        if (rawTeachers.length === 0) missingTabs.push("Teachers 👤");
        if (rawSubjects.length === 0) missingTabs.push("Subjects 📚");
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

        // CONFIGURATION NG MGA ARAW AT TIME SLOTS
        const daySlots = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const timeSlots = [
            "07:30 AM - 08:30 AM", // Period 1
            "08:30 AM - 09:30 AM", // Period 2
            "09:30 AM - 10:30 AM", // Period 3
            "10:30 AM - 11:30 AM", // Period 4
            "01:00 PM - 02:00 PM", // Period 5
            "02:00 PM - 03:00 PM", // Period 6
            "03:00 PM - 04:00 PM", // Period 7
            "04:00 PM - 05:00 PM"  // Period 8
        ];

        // INITIALIZATION NG CONFLICT REGISTRY
        const teacherConflictMatrix = {}; 
        const sectionConflictMatrix = {}; 
        const roomConflictMatrix = {};    
        const subjectPerDayTracker = {};  
        const lastAssignedTracker = {}; 
        
        const systemDiagnosticsLogs = [];
        const teacherSchedulesMap = {};

        rawTeachers.forEach(t => {
            const fullName = `${t.firstName} ${t.lastName}`;
            teacherSchedulesMap[fullName] = {
                details: t,
                slots: []
            };
        });

        // PRE-FLIGHT DIAGNOSTICS
        for (const day of daySlots) {
            for (const subjectObj of rawSubjects) {
                const subjectName = typeof subjectObj === 'string' ? subjectObj : subjectObj.name;
                
                const hasTeacherForDay = rawTeachers.some(t => {
                    const conductsSubject = (t.subjects || []).some(s => s.toLowerCase() === subjectName.toLowerCase());
                    const worksThisDay = t.workDays && t.workDays.some(d => d.toLowerCase() === day.toLowerCase());
                    return conductsSubject && worksThisDay;
                });

                if (!hasTeacherForDay) {
                    systemDiagnosticsLogs.push(`❌ Quota Threat: Walang pwedeng magturo ng [${subjectName}] tuwing [${day}].`);
                }
            }
        }

        // AUTOMATED RUNTIME SCHEDULING PARSER ENGINE
        for (const section of savedSections) {
            for (const day of daySlots) {
                let dailyFilledCount = 0;

                for (let timeIndex = 0; timeIndex < timeSlots.length; timeIndex++) {
                    const currentTime = timeSlots[timeIndex];

                    for (const subjectObj of rawSubjects) {
                        const subjectName = typeof subjectObj === 'string' ? subjectObj : subjectObj.name;

                        const dailySubjectKey = `${section.name}-${day}-${subjectName.toLowerCase()}`;
                        if (subjectPerDayTracker[dailySubjectKey]) continue; 

                        const fatigueSectionKey = `${section.name}-${day}`;
                        const lastSessionData = lastAssignedTracker[fatigueSectionKey];
                        if (lastSessionData && lastSessionData.subject.toLowerCase() === subjectName.toLowerCase()) {
                            continue; 
                        }

                        const eligibleTeacher = rawTeachers.find(t => {
                            const fullName = `${t.firstName} ${t.lastName}`;
                            const subjectList = t.subjects || [];
                            const conductsSubject = subjectList.some(s => s.toLowerCase() === subjectName.toLowerCase());
                            const worksThisDay = t.workDays && t.workDays.some(d => d.toLowerCase() === day.toLowerCase());
                            
                            const teacherKey = `${fullName}-${day}-${currentTime}`;
                            const isTeacherBusy = teacherConflictMatrix[teacherKey];

                            let hasTeacherFatigue = false;
                            if (lastSessionData && lastSessionData.teacher === fullName) {
                                hasTeacherFatigue = true; 
                            }

                            return conductsSubject && worksThisDay && !isTeacherBusy && !hasTeacherFatigue;
                        });

                        let teacherToUse = eligibleTeacher;
                        if (!teacherToUse) {
                            teacherToUse = rawTeachers.find(t => {
                                const fullName = `${t.firstName} ${t.lastName}`;
                                const subjectList = t.subjects || [];
                                const conductsSubject = subjectList.some(s => s.toLowerCase() === subjectName.toLowerCase());
                                const worksThisDay = t.workDays && t.workDays.some(d => d.toLowerCase() === day.toLowerCase());
                                const teacherKey = `${fullName}-${day}-${currentTime}`;
                                return conductsSubject && worksThisDay && !teacherConflictMatrix[teacherKey];
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

                        const teacherFullName = `${teacherToUse.firstName} ${teacherToUse.lastName}`;
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

                        teacherSchedulesMap[teacherFullName].slots.push({
                            subject: subjectName,
                            section: section.name,
                            day: day,
                            time: currentTime,
                            room: availableRoom
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

        // I-render ang pinal na layout view kasama ang kumpletong diagnostics panel at list table
        renderSearchableDirectoryDashboard(container, teacherSchedulesMap, daySlots, timeSlots, systemDiagnosticsLogs);

        // 🔥 COMMIT ENGINE GENERATED SLOTS DIRECTLY TO THE SERVER FOR TEACHERS TO SEE
        try {
            console.log("💾 Automatically committing computed timetables over old server targets...");
            const saveResponse = await fetch(`${baseOrigin}/api/admin/schedules/save-bulk`, {
                method: "POST",
                headers: { 
                    'Authorization': `Bearer ${token}`, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ schedules: teacherSchedulesMap })
            });

            const saveData = await saveResponse.json();
            if (!saveResponse.ok) {
                console.error("Save warning:", saveData.error);
            } else {
                console.log("🎉 Success! Real-time optimization matrix permanently written to server database file.");
            }
        } catch (saveErr) {
            console.error("Failed to background-commit timetable to server storage file:", saveErr);
        }

    } catch (err) {
        console.error("Critical matrix application failure:", err);
        container.innerHTML = `
            <div style="text-align: center; color: #ff5f5f; padding: 40px;">
                ⚠️ Connection Error: Failed to secure teacher metrics from your database server.
            </div>
        `;
    }
}

/**
 * Builds an isolated interactive view separating the directory database from the calendar matrix layout
 */
function renderSearchableDirectoryDashboard(container, teacherSchedulesMap, daySlots, timeSlots, diagnosticsLogs) {
    container.innerHTML = ""; 

    // Gumawa ng wrapper para sa dalawang magkahiwalay na view panels
    const directoryPanel = document.createElement("div");
    directoryPanel.id = "engine-directory-panel-view";
    
    const scheduleViewerPanel = document.createElement("div");
    scheduleViewerPanel.id = "engine-schedule-viewer-panel";
    scheduleViewerPanel.style.display = "none"; 

    container.appendChild(directoryPanel);
    container.appendChild(scheduleViewerPanel);

    // 📢 IBINALIK NA KUMPLETONG LIST DIAGNOSTICS LOG PANEL (Naka-scrollable table list)
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
    } else {
        const diagPanel = document.createElement("div");
        diagPanel.style.cssText = "background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 10px; padding: 14px; margin-bottom: 25px; color: #34d399; font-size: 0.9rem; font-weight: 500;";
        diagPanel.innerHTML = "✅ Database Verification Complete: Balanced system teacher metrics deployed across universal section clusters.";
        directoryPanel.appendChild(diagPanel);
    }

    // 🔍 SEARCH INPUT CONTROL DECK
    const filterHeaderBox = document.createElement("div");
    filterHeaderBox.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; background: rgba(15,23,42,0.3); padding: 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.04);";
    filterHeaderBox.innerHTML = `
        <div>
            <h4 style="color: #ffffff; margin: 0; font-size: 1.2rem; font-weight: bold;">👤 Registered Instructors Directory</h4>
            <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 0.85rem;">Select an instructor below to view, export, or print their isolated active calendar matrix.</p>
        </div>
        <input type="text" id="directory-search-bar" placeholder="Type name to filter list instantly..." style="background: rgba(30, 41, 59, 0.9); color: #fff; border: 1px solid rgba(255,255,255,0.12); padding: 10px 16px; border-radius: 8px; font-size: 0.9rem; width: 320px; outline: none; transition: all 0.2s;">
    `;
    directoryPanel.appendChild(filterHeaderBox);

    // 📋 RENDER THE CLEAN MASTER INSTRUCTORS TABLE
    const tableContainer = document.createElement("div");
    tableContainer.style.cssText = "overflow-x: auto; background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;";
    
    let tableHTML = `
        <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.95rem;">
            <thead>
                <tr style="background: rgba(15, 23, 42, 0.7); border-bottom: 1px solid rgba(255,255,255,0.08);">
                    <th style="padding: 14px 20px; color: #94a3b8; font-weight: 600;">Instructor Full Name</th>
                    <th style="padding: 14px 20px; color: #94a3b8; font-weight: 600;">Handled Subject Competencies</th>
                    <th style="padding: 14px 20px; color: #94a3b8; font-weight: 600; text-align: center;">Total Scheduled Slots</th>
                    <th style="padding: 14px 20px; color: #94a3b8; font-weight: 600; text-align: right;">Action Control</th>
                </tr>
            </thead>
            <tbody id="directory-table-body-rows">
    `;

    let activeRecords = 0;
    for (const name in teacherSchedulesMap) {
        const item = teacherSchedulesMap[name];
        if (item.slots.length === 0) continue; 
        activeRecords++;

        tableHTML += `
            <tr class="directory-teacher-row" data-name="${name.toLowerCase()}" style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 14px 20px; color: #ffffff; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                    <span style="background: rgba(0,210,255,0.1); color: #00d2ff; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 0.85rem;">👤</span>
                    ${name}
                </td>
                <td style="padding: 14px 20px;">
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${item.details.subjects.map(s => `<span style="background: rgba(148, 163, 184, 0.1); color: #cbd5e1; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">📚 ${s}</span>`).join('')}
                    </div>
                </td>
                <td style="padding: 14px 20px; text-align: center;">
                    <span style="background: rgba(16, 185, 129, 0.1); color: #34d399; font-size: 0.8rem; font-weight: bold; padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(16,185,129,0.15);">
                        ${item.slots.length} Assigned Periods
                    </span>
                </td>
                <td style="padding: 14px 20px; text-align: right;">
                    <button class="view-single-schedule-btn" data-teacher-key="${name}" style="background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%); color: #fff; border: none; padding: 8px 16px; font-size: 0.85rem; font-weight: bold; border-radius: 6px; cursor: pointer; transition: transform 0.1s; box-shadow: 0 2px 8px rgba(0,210,255,0.2);" onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
                        📅 View Schedule ⚡
                    </button>
                </td>
            </tr>
        `;
    }

    tableHTML += `</tbody></table>`;
    tableContainer.innerHTML = tableHTML;
    directoryPanel.appendChild(tableContainer);

    if (activeRecords === 0) {
        tableContainer.innerHTML = `<div style="text-align: center; color: #64748b; padding: 40px; font-style: italic;">⚠️ No active teacher schedule grids could be rendered inside the database matrix.</div>`;
    }

    // 🔍 ATTACHING REAL-TIME DIRECTORY SEARCH ALGORITHM
    const searchBar = document.getElementById("directory-search-bar");
    if (searchBar) {
        searchBar.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const rows = document.querySelectorAll(".directory-teacher-row");
            rows.forEach(row => {
                const nameAttr = row.getAttribute("data-name");
                if (nameAttr.includes(query)) {
                    row.style.display = "table-row";
                } else {
                    row.style.display = "none";
                }
            });
        });
        searchBar.addEventListener("focus", () => searchBar.style.borderColor = "#00d2ff");
        searchBar.addEventListener("blur", () => searchBar.style.borderColor = "rgba(255,255,255,0.12)");
    }

    // 🔄 DRILL-DOWN ROUTING LOGIC
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
 * Renders an isolated single timeline calendar layout sheet for the clicked instructor.
 * Fully optimized to clear canvas color matrices and auto-scale smoothly onto one structural bond paper sheet.
 * Fixed: Reduces vertical spaces dynamically during compilation to guarantee a 1-page fit.
 */
function renderTargetedInstructorMatrix(displayTarget, directoryPanel, teacherData, teacherName, daySlots, timeSlots) {
    displayTarget.innerHTML = ""; 

    const formattedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

// 🖨️ STRICT PRINT & PDF ENGINE RULE INJECTION (Clean slate rendering pipeline)
    if (!document.getElementById("print-isolated-matrix-rules")) {
        const printStyles = document.createElement("style");
        printStyles.id = "print-isolated-matrix-rules";
        printStyles.innerHTML = `
            /* --- Screen Base Styles inside the Application Dashboard (Dark Mode UI) --- */
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

            /* --- Hardcopy Print Window Styles Sheet --- */
            @media print {
                /* Tinanggal ang p at h2 title selectors sa display, partikular ang lumalabas sa pinakataas */
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

                /* TINANGGAL ANG KAHON SA INSTRUCTOR AT DATE AREA */
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

            /* ==========================================================================
               📥 DYNAMIC FIXED html2pdf ENGINE CONTROLLER DECK
               ========================================================================== */
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

            /* SINIGURADONG WALANG KAHON AT LABIS NA BORDER SA PDF VIEW CONTAINER NG MGA HEADERS */
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

    // 🔙 TOP ROUTING ACTION BAR (BACK, PRINT & DOWNLOAD ACTIONS)
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

    // 📅 CREATE THE TIMETABLE CANVAS BLOCK
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

    // 📥 HIGH-CONTRAST SECURE PDF EXPORT CONTROLLER
    document.getElementById("btn-isolated-download-pdf").addEventListener("click", () => {
        printCanvasBlock.classList.add("pdf-export-mode");

        const configOptions = {
            margin:       [5, 5, 5, 5], // Pinaliit ang margins para mas malawak ang sakop ng table
            filename:     `Schedule_Matrix_${teacherName.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { 
                scale: 2.3, // Binabaan ng bahagya (mula 2.5 patungong 2.3) para mag-fit ang rendering bounding box
                useCORS: true, 
                backgroundColor: '#ffffff', 
                logging: false 
            },
            jsPDF:        { unit: 'mm', format: 'letter', orientation: 'landscape' }
        };

        html2pdf().set(configOptions).from(printCanvasBlock).save().then(() => {
            printCanvasBlock.classList.remove("pdf-export-mode");
        }).catch((err) => {
            console.error("PDF generation exception error:", err);
            printCanvasBlock.classList.remove("pdf-export-mode");
        });
    });
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