/**
 * Advanced Automated Timetable Generator
 * Dual-View System: Master Section Grid & Isolated Teacher Matrix
 * STRICT CONSTRAINT VERSION: Enforces Strict Target Grade Matching
 */

// Helper: Safely parses array inputs from string/JSON formats
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

// Helper: Extracts numerical grade level (e.g. "Grade 7" -> "7")
function extractGradeNumber(str) {
    if (!str) return "";
    const match = str.toString().match(/\d+/);
    return match ? match[0] : str.toString().toLowerCase().trim();
}

// Helper: Normalizes Grade Level strings
function normalizeGradeLevelName(str) {
    if (!str) return "General";
    const cleanStr = str.toString().trim();
    const match = cleanStr.match(/\d+/);
    
    if (match) {
        const num = parseInt(match[0], 10);
        if (num >= 7 && num <= 10) return `Junior High School - Grade ${num}`;
        if (num >= 11 && num <= 12) return `Senior High School - Grade ${num}`;
        return `Grade ${num}`;
    }
    return cleanStr;
}

// High-contrast subject color palette
const subjectColorPalette = [
    '#e63946', '#3a86ff', '#8338ec', '#fb5607', '#ff006e', 
    '#00b4d8', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51',
    '#4361ee', '#4cc9f0', '#7209b7', '#3f37c9', '#52b788'
];

function getSubjectColor(subjectName) {
    if (!subjectName) return '#e0e0e0';
    let hash = 0;
    for (let i = 0; i < subjectName.length; i++) {
        hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % subjectColorPalette.length;
    return subjectColorPalette[index];
}

// ==========================================
// PART 1: MASTER TIMETABLE GENERATION ENGINE
// ==========================================

async function processSystemTimetable() {
    console.log("Executing Master Schedule Generation...");
   
    let container = document.getElementById("timetable-matrix-output-body") || 
                    document.querySelector('.dashboard-card-panel') || 
                    document.querySelector('.main-content') ||
                    document.body;
   
    container.innerHTML = `
        <div id="engine-processing-status" style="text-align: center; color: #1e293b; font-weight: bold; padding: 40px; font-size: 1.1rem; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 20px;">
            Building Master Section Timetables & Enforcing Grade-Level Constraints...
        </div>
    `;

    const token = localStorage.getItem('token') || 
                  localStorage.getItem('jwt') || 
                  localStorage.getItem('authToken') || 
                  localStorage.getItem('accessToken');

    if (!token) {
        container.innerHTML = `
            <div style="text-align: center; color: #dc2626; padding: 30px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-top: 20px; font-weight: bold;">
                Authentication Failure: Security token missing or expired. Please log in again.
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

        const daySlots = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
        const timeSlots = [
            "07:30-08:30",
            "08:30-09:30",
            "09:30-10:30",
            "10:30-11:30",
            "01:00-02:00",
            "02:00-03:00",
            "03:00-04:00",
            "04:00-05:00"
        ];

        const normalizedTeachers = rawTeachers.map(t => {
            const firstName = t.firstName || t.first_name || "Instructor";
            const lastName = t.lastName || t.last_name || "";
            const fullName = (t.name || t.fullName || `${firstName} ${lastName}`).trim();
            const subjects = safeParseArray(t.subjects || t.subject_list || t.subject);
            const workDays = safeParseArray(t.workDays || t.work_days);
            const targetGrade = t.target_grade || t.targetGrade || t.gradeLevel || "";

            return {
                ...t,
                fullName,
                subjects,
                targetGrade: normalizeGradeLevelName(targetGrade),
                targetGradeNum: extractGradeNumber(targetGrade),
                workDays: workDays.length > 0 ? workDays : daySlots
            };
        });

        // SCHEDULING MATRIX LOGIC (STRICT GRADE LEVEL ENFORCEMENT)
        const teacherConflictMatrix = {}; 
        const teacherDailyHoursTracker = {}; 
        const roomConflictMatrix = {};    
        const subjectPerDayTracker = {};  
        const masterSectionSchedules = {}; 

        savedSections.forEach(sec => {
            masterSectionSchedules[sec.name] = {
                details: sec,
                gradeLevel: normalizeGradeLevelName(sec.grade_level || sec.target_grade || sec.gradeLevel || "Grade 8"),
                timetable: {} 
            };
            daySlots.forEach(d => {
                masterSectionSchedules[sec.name].timetable[d] = {};
            });
        });

        for (const section of savedSections) {
            const sectionGrade = normalizeGradeLevelName(section.grade_level || section.target_grade || section.gradeLevel || "Grade 8");
            const sectionGradeNum = extractGradeNumber(sectionGrade);

            let sectionSubjects = safeParseArray(section.subjects || section.subject_list);
            
            // Get subjects intended for this specific Grade Level
            if (sectionSubjects.length === 0) {
                sectionSubjects = normalizedSubjects
                    .filter(s => extractGradeNumber(s.gradeLevel) === sectionGradeNum)
                    .map(s => typeof s === 'string' ? s : s.name);
            }

            for (const day of daySlots) {
                for (let timeIndex = 0; timeIndex < timeSlots.length; timeIndex++) {
                    const currentTime = timeSlots[timeIndex];

                    for (const subjectName of sectionSubjects) {
                        const cleanSubjectName = typeof subjectName === 'string' ? subjectName.trim() : subjectName.name.trim();

                        const dailySubjectKey = `${section.name}-${day}-${cleanSubjectName.toLowerCase()}`;
                        if (subjectPerDayTracker[dailySubjectKey]) continue;

                        // STRICT MATCHING: Teacher MUST teach this subject AND be assigned to this Grade Level!
                        let teacherToUse = normalizedTeachers.find(t => {
                            const conductsSubject = t.subjects.some(s => s.toLowerCase().trim() === cleanSubjectName.toLowerCase());
                            const matchesGrade = t.targetGradeNum === sectionGradeNum; // STRICT GRADE CONSTRAINT!
                            const worksThisDay = t.workDays.some(d => d.toLowerCase().trim() === day.toLowerCase().trim());
                            const teacherTimeKey = `${t.fullName}-${day}-${currentTime}`;
                            
                            const dailyHoursKey = `${t.fullName}-${day}`;
                            const currentDailyHours = teacherDailyHoursTracker[dailyHoursKey] || 0;

                            return conductsSubject && matchesGrade && worksThisDay && !teacherConflictMatrix[teacherTimeKey] && currentDailyHours < 6;
                        });

                        // If no teacher is assigned for THIS grade level, DO NOT SCHEDULE!
                        if (!teacherToUse) continue;

                        let availableRoom = savedRooms.find(r => !roomConflictMatrix[`${r.name}-${day}-${currentTime}`])?.name || savedRooms[0]?.name || "Classroom 1";

                        const teacherFullName = teacherToUse.fullName;
                        const teacherTimeKey = `${teacherFullName}-${day}-${currentTime}`;
                        const dailyHoursKey = `${teacherFullName}-${day}`;

                        // Lock Schedule Slots
                        teacherConflictMatrix[teacherTimeKey] = true;
                        teacherDailyHoursTracker[dailyHoursKey] = (teacherDailyHoursTracker[dailyHoursKey] || 0) + 1;
                        roomConflictMatrix[`${availableRoom}-${day}-${currentTime}`] = true;
                        subjectPerDayTracker[dailySubjectKey] = true;

                        masterSectionSchedules[section.name].timetable[day][currentTime] = {
                            subject: cleanSubjectName,
                            teacher: teacherFullName,
                            room: availableRoom
                        };

                        break; 
                    }
                }
            }
        }

        // ACCURATE SYSTEM AUDIT & WARNING LOGIC
        const gradeAuditMap = {};

        // Track active sections and count teachers per grade level
        savedSections.forEach(sec => {
            const normG = normalizeGradeLevelName(sec.grade_level || sec.target_grade || sec.gradeLevel);
            const gNum = extractGradeNumber(normG);
            
            if (!gradeAuditMap[normG]) {
                const assignedTeachersCount = normalizedTeachers.filter(t => t.targetGradeNum === gNum).length;
                gradeAuditMap[normG] = { 
                    missingSubjects: [], 
                    teacherCount: assignedTeachersCount 
                };
            }
        });

        // Audit missing subjects: Check which subjects were required for sections but were NOT scheduled
        Object.values(masterSectionSchedules).forEach(secObj => {
            const gName = secObj.gradeLevel;
            const gNum = extractGradeNumber(gName);

            let requiredSubjs = safeParseArray(secObj.details.subjects || secObj.details.subject_list);
            if (requiredSubjs.length === 0) {
                requiredSubjs = normalizedSubjects
                    .filter(s => extractGradeNumber(s.gradeLevel) === gNum)
                    .map(s => typeof s === 'string' ? s : s.name);
            }

            const scheduledSubjs = new Set();
            Object.values(secObj.timetable).forEach(dayObj => {
                Object.values(dayObj).forEach(slot => {
                    if (slot && slot.subject) scheduledSubjs.add(slot.subject.toLowerCase().trim());
                });
            });

            requiredSubjs.forEach(req => {
                const cleanReq = typeof req === 'string' ? req.trim() : req.name.trim();
                if (!scheduledSubjs.has(cleanReq.toLowerCase())) {
                    if (gradeAuditMap[gName] && !gradeAuditMap[gName].missingSubjects.includes(cleanReq)) {
                        gradeAuditMap[gName].missingSubjects.push(cleanReq);
                    }
                }
            });
        });

        const systemAuditSummary = {
            totalSections: savedSections.length,
            totalTeachers: normalizedTeachers.length,
            totalRooms: savedRooms.length,
            gradeAuditMap: gradeAuditMap
        };

        // SAVE CACHE FOR PERSISTENCE
        const scheduleCachePayload = {
            masterSectionSchedules,
            auditSummary: systemAuditSummary,
            daySlots,
            timeSlots,
            normalizedTeachers
        };
        localStorage.setItem("cached_generated_schedule", JSON.stringify(scheduleCachePayload));

        renderMasterSectionScheduleDashboard(container, masterSectionSchedules, systemAuditSummary, daySlots, timeSlots, normalizedTeachers);

    } catch (err) {
        console.error("Critical matrix application failure:", err);
        container.innerHTML = `
            <div style="text-align: center; color: #dc2626; padding: 40px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-top: 20px; font-weight: bold;">
                Connection Error: Failed to generate master timetable. (${err.message})
            </div>
        `;
    }
}

function renderMasterSectionScheduleDashboard(container, masterSectionSchedules, auditSummary, daySlots, timeSlots, normalizedTeachers) {
    container.innerHTML = "";

    if (!document.getElementById("printable-schedule-css")) {
        const styleEl = document.createElement("style");
        styleEl.id = "printable-schedule-css";
        styleEl.innerHTML = `
            @media print {
                body * { visibility: hidden; }
                .section-print-area, .section-print-area * { visibility: visible; }
                .section-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
                .no-print { display: none !important; }
                table { page-break-inside: avoid; }
            }
            .section-pdf-export { background: #ffffff !important; padding: 10px !important; border: none !important; }
            .section-pdf-export .no-print { display: none !important; }
        `;
        document.head.appendChild(styleEl);
    }

    const mainWrapper = document.createElement("div");
    mainWrapper.style.marginTop = "20px";
    container.appendChild(mainWrapper);

    let totalMissingSubjectsCount = 0;
    Object.values(auditSummary.gradeAuditMap).forEach(g => {
        totalMissingSubjectsCount += g.missingSubjects.length;
    });

    const summaryCard = document.createElement("div");
    summaryCard.className = "no-print";
    summaryCard.style.cssText = "background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";

    const statusColor = totalMissingSubjectsCount === 0 ? "#16a34a" : "#dc2626";

    let auditHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 16px;">
            <h3 style="color: #0f172a; margin: 0; font-size: 1.1rem; font-weight: 700;">
                Master School Capacity & Resource Audit
            </h3>
            <div style="display: flex; gap: 10px; align-items: center;">
                <span style="background: ${statusColor}15; color: ${statusColor}; font-size: 0.82rem; font-weight: bold; padding: 5px 14px; border-radius: 20px; border: 1px solid ${statusColor}44;">
                    ${totalMissingSubjectsCount === 0 ? "All Grade Levels Fully Scheduled" : `${totalMissingSubjectsCount} Unassigned Subject Class(es)`}
                </span>
                ${totalMissingSubjectsCount > 0 ? `
                    <button id="toggle-audit-btn" onclick="toggleAuditView()" style="background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: bold;">
                        View Scheduling Shortages
                    </button>
                ` : ''}
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 10px;">
            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
                <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Total Sections</div>
                <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalSections} Sections</div>
            </div>
            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
                <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Total Active Teachers</div>
                <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalTeachers} Teachers</div>
            </div>
            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
                <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Available Rooms</div>
                <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalRooms} Rooms</div>
            </div>
        </div>

        <div id="grade-level-audit-details" style="display: ${totalMissingSubjectsCount > 0 ? 'block' : 'none'}; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
            <div style="font-weight: bold; color: #dc2626; margin-bottom: 12px; font-size: 0.9rem;">
                Schedule Generation Issues & Unassigned Subjects:
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    let activeShortageCardCount = 0;

    Object.keys(auditSummary.gradeAuditMap)
        .sort((a, b) => {
            const numA = parseInt((a.match(/\d+/) || [0])[0], 10);
            const numB = parseInt((b.match(/\d+/) || [0])[0], 10);
            return numA - numB;
        })
        .forEach(grade => {
            const item = auditSummary.gradeAuditMap[grade];

            // Render warning card ONLY if there are missing subjects OR 0 teachers assigned
            if (item.missingSubjects.length > 0 || item.teacherCount === 0) {
                activeShortageCardCount++;
                auditHTML += `
                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px 16px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: #991b1b; font-weight: bold; font-size: 0.95rem;">
                                ${grade} <span style="color: #dc2626; font-size: 0.8rem; font-weight: 600;">(${item.teacherCount} Teachers Assigned for this Grade)</span>
                            </span>
                            <a href="teachers.html" style="background: #ef4444; color: #ffffff; text-decoration: none; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">
                                + Assign Teacher
                            </a>
                        </div>
                        <div style="font-size: 0.82rem; color: #7f1d1d; margin-bottom: 6px;">
                            ${item.teacherCount === 0 ? "⚠️ Cannot generate complete timetable: No instructors assigned to teach this Grade Level." : "⚠️ The following required subjects could not be scheduled due to teacher shortage:"}
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                            ${item.missingSubjects.map(subj => `
                                <span style="background: #ffffff; color: #dc2626; border: 1px solid #fca5a5; padding: 3px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;">
                                    ${subj}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        });

    if (activeShortageCardCount === 0) {
        auditHTML += `
            <div style="color: #16a34a; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">
                No schedule shortages detected. All sections have been fully scheduled.
            </div>
        `;
    }

    auditHTML += `
            </div>
        </div>
    `;

    summaryCard.innerHTML = auditHTML;
    mainWrapper.appendChild(summaryCard);

    window.toggleAuditView = function() {
        const detailsDiv = document.getElementById("grade-level-audit-details");
        const btn = document.getElementById("toggle-audit-btn");
        if (detailsDiv.style.display === "none") {
            detailsDiv.style.display = "block";
            btn.innerHTML = "Hide Shortages";
        } else {
            detailsDiv.style.display = "none";
            btn.innerHTML = "View Scheduling Shortages";
        }
    };

    const gradeGroupedSections = {};

    Object.values(masterSectionSchedules).forEach(secObj => {
        const gName = secObj.gradeLevel;
        if (!gradeGroupedSections[gName]) {
            gradeGroupedSections[gName] = [];
        }
        gradeGroupedSections[gName].push(secObj);
    });

    const sortedGradeKeys = Object.keys(gradeGroupedSections).sort((a, b) => {
        const numA = parseInt((a.match(/\d+/) || [0])[0], 10);
        const numB = parseInt((b.match(/\d+/) || [0])[0], 10);
        return numA - numB;
    });

    if (sortedGradeKeys.length === 0) {
        const emptyAlert = document.createElement("div");
        emptyAlert.style.cssText = "text-align: center; color: #64748b; background: #f8fafc; padding: 30px; border-radius: 8px; border: 1px solid #e2e8f0;";
        emptyAlert.innerHTML = "No active sections registered in system database. Please add sections first.";
        mainWrapper.appendChild(emptyAlert);
        return;
    }

    window.printSectionSchedule = function(cardId) {
        const cardTarget = document.getElementById(cardId);
        if (!cardTarget) return;

        document.querySelectorAll('.section-print-area').forEach(el => el.classList.remove('section-print-area'));
        cardTarget.classList.add('section-print-area');
        window.print();
    };

    window.downloadSectionPDF = function(cardId, sectionName) {
        const cardTarget = document.getElementById(cardId);
        if (!cardTarget) return;

        if (typeof html2pdf === "undefined") {
            alert("PDF export library is missing or still loading. Please check if html2pdf.bundle.min.js is included in your HTML file.");
            return;
        }

        cardTarget.classList.add("section-pdf-export");

        const configOptions = {
            margin:       [5, 5, 5, 5],
            filename:     `Schedule_Section_${sectionName.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  {
                scale: 2.3,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            },
            jsPDF:         { unit: 'mm', format: 'letter', orientation: 'landscape' }
        };

        html2pdf().set(configOptions).from(cardTarget).save().then(() => {
            cardTarget.classList.remove("section-pdf-export");
        }).catch((err) => {
            console.error("PDF generation error:", err);
            cardTarget.classList.remove("section-pdf-export");
            alert("Failed to export PDF document.");
        });
    };

    sortedGradeKeys.forEach(gradeName => {
        const sectionsList = gradeGroupedSections[gradeName];

        const gradeHeaderBox = document.createElement("div");
        gradeHeaderBox.className = "no-print";
        gradeHeaderBox.style.cssText = "margin-top: 30px; margin-bottom: 15px;";
        
        gradeHeaderBox.innerHTML = `
            <h2 style="color: #ffffff; font-size: 1.35rem; font-weight: 800; border-bottom: 2px solid #38bdf8; padding-bottom: 8px;">
                ${gradeName} <span style="color: #38bdf8; font-size: 0.95rem; font-weight: 600;">(${sectionsList.length} Sections)</span>
            </h2>
        `;
        mainWrapper.appendChild(gradeHeaderBox);

        sectionsList.forEach((secObj, secIdx) => {
            const secName = secObj.details.name;
            const uniqueCardId = `schedule-card-${gradeName.replace(/[^a-zA-Z0-9]/g, '')}-${secIdx}`;
            
            const secCard = document.createElement("div");
            secCard.id = uniqueCardId;
            secCard.style.cssText = "background: #ffffff; border: 2px solid #000000; border-radius: 4px; padding: 15px; margin-bottom: 30px; overflow-x: auto;";

            let tableHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="color: #000000; margin: 0; font-size: 1.15rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                        SECTION: <span style="color: #000000;">${secName}</span>
                    </h3>
                    <div class="no-print" style="display: flex; gap: 8px;">
                        <button onclick="printSectionSchedule('${uniqueCardId}')" style="background: #000000; color: #ffffff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.8rem;">
                            Print
                        </button>
                        <button onclick="downloadSectionPDF('${uniqueCardId}', '${secName}')" style="background: #0284c7; color: #ffffff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.8rem;">
                            Download PDF
                        </button>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; min-width: 750px; text-align: center; font-size: 0.85rem; border: 2px solid #000000;">
                    <thead>
                        <tr style="background: #ffffff; color: #000000; border-bottom: 2px solid #000000;">
                            <th style="padding: 10px; border: 2px solid #000000; width: 120px; font-weight: 800; font-size: 0.9rem;">TIME</th>
            `;

            daySlots.forEach(day => {
                tableHTML += `<th style="padding: 10px; border: 2px solid #000000; font-weight: 800; font-size: 0.9rem; text-transform: uppercase;">${day}</th>`;
            });

            tableHTML += `</tr></thead><tbody>`;

            timeSlots.forEach(time => {
                tableHTML += `
                    <tr>
                        <td style="padding: 8px; background: #ffffff; color: #000000; font-weight: 800; border: 2px solid #000000; font-size: 0.85rem;">
                            ${time}
                        </td>
                `;

                daySlots.forEach(day => {
                    const slotData = secObj.timetable[day][time];

                    if (slotData) {
                        const cellBgColor = getSubjectColor(slotData.subject);
                        tableHTML += `
                            <td style="padding: 6px; border: 2px solid #000000; background: ${cellBgColor}; color: #000000; vertical-align: middle; font-weight: 700;">
                                <div style="font-size: 0.9rem; font-weight: 800; line-height: 1.2;">
                                    ${slotData.subject}
                                </div>
                                <div style="font-size: 0.78rem; font-weight: 600; margin-top: 3px;">
                                    ${slotData.teacher}
                                </div>
                                ${slotData.room ? `<div style="font-size: 0.72rem; font-weight: 500; opacity: 0.9;">(${slotData.room})</div>` : ''}
                            </td>
                        `;
                    } else {
                        tableHTML += `
                            <td style="padding: 6px; border: 2px solid #000000; background: #ffffff; vertical-align: middle;">
                            </td>
                        `;
                    }
                });

                tableHTML += `</tr>`;
            });

            tableHTML += `</tbody></table>`;
            secCard.innerHTML = tableHTML;
            mainWrapper.appendChild(secCard);
        });
    });
}

// ==========================================
// PART 2: ISOLATED INSTRUCTOR TIMELINE SHEET
// ==========================================

function renderMasterSectionScheduleDashboard(container, masterSectionSchedules, auditSummary, daySlots, timeSlots, normalizedTeachers) {
    container.innerHTML = "";

    if (!document.getElementById("printable-schedule-css")) {
        const styleEl = document.createElement("style");
        styleEl.id = "printable-schedule-css";
        styleEl.innerHTML = `
            @media print {
                body * { visibility: hidden; }
                .section-print-area, .section-print-area * { visibility: visible; }
                .section-print-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
                .no-print { display: none !important; }
                table { page-break-inside: avoid; }
            }
            .section-pdf-export { background: #ffffff !important; padding: 10px !important; border: none !important; }
            .section-pdf-export .no-print { display: none !important; }
        `;
        document.head.appendChild(styleEl);
    }

    const mainWrapper = document.createElement("div");
    mainWrapper.style.marginTop = "20px";
    container.appendChild(mainWrapper);

    let totalMissingSubjectsCount = 0;
    Object.values(auditSummary.gradeAuditMap).forEach(g => {
        totalMissingSubjectsCount += g.missingSubjects.length;
    });

    const summaryCard = document.createElement("div");
    summaryCard.className = "no-print";
    summaryCard.style.cssText = "background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);";

    const statusColor = totalMissingSubjectsCount === 0 ? "#16a34a" : "#dc2626";

    let auditHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 14px; margin-bottom: 16px;">
            <h3 style="color: #0f172a; margin: 0; font-size: 1.1rem; font-weight: 700;">
                Master School Capacity & Resource Audit
            </h3>
            <div style="display: flex; gap: 10px; align-items: center;">
                <span style="background: ${statusColor}15; color: ${statusColor}; font-size: 0.82rem; font-weight: bold; padding: 5px 14px; border-radius: 20px; border: 1px solid ${statusColor}44;">
                    ${totalMissingSubjectsCount === 0 ? "All Grade Levels Fully Scheduled" : `${totalMissingSubjectsCount} Unassigned Subject Class(es)`}
                </span>
                ${totalMissingSubjectsCount > 0 ? `
                    <button id="toggle-audit-btn" onclick="toggleAuditView()" style="background: #fef2f2; border: 1px solid #fca5a5; color: #dc2626; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: bold;">
                        View Scheduling Shortages
                    </button>
                ` : ''}
            </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 10px;">
            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
                <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Total Sections</div>
                <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalSections} Sections</div>
            </div>
            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
                <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Total Active Teachers</div>
                <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalTeachers} Teachers</div>
            </div>
            <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border-left: 4px solid #0284c7;">
                <div style="color: #64748b; font-size: 0.75rem; font-weight: 600;">Available Rooms</div>
                <div style="color: #0f172a; font-size: 1.2rem; font-weight: 700;">${auditSummary.totalRooms} Rooms</div>
            </div>
        </div>

        <div id="grade-level-audit-details" style="display: ${totalMissingSubjectsCount > 0 ? 'block' : 'none'}; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
            <div style="font-weight: bold; color: #dc2626; margin-bottom: 12px; font-size: 0.9rem;">
                Schedule Generation Issues & Unassigned Subjects:
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
    `;

    let activeShortageCardCount = 0;

    Object.keys(auditSummary.gradeAuditMap)
        .sort((a, b) => {
            const numA = parseInt((a.match(/\d+/) || [0])[0], 10);
            const numB = parseInt((b.match(/\d+/) || [0])[0], 10);
            return numA - numB;
        })
        .forEach(grade => {
            const item = auditSummary.gradeAuditMap[grade];

            if (item.missingSubjects.length > 0 || item.teacherCount === 0) {
                activeShortageCardCount++;
                auditHTML += `
                    <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px 16px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: #991b1b; font-weight: bold; font-size: 0.95rem;">
                                ${grade} <span style="color: #dc2626; font-size: 0.8rem; font-weight: 600;">(${item.teacherCount} Teachers Assigned for this Grade)</span>
                            </span>
                            <a href="teachers.html" style="background: #ef4444; color: #ffffff; text-decoration: none; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: bold;">
                                + Assign Teacher
                            </a>
                        </div>
                        <div style="font-size: 0.82rem; color: #7f1d1d; margin-bottom: 6px;">
                            ${item.teacherCount === 0 ? "⚠️ Cannot generate timetable: No instructors assigned to teach this Grade Level." : "⚠️ The following required subjects could not be scheduled due to teacher shortage:"}
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px;">
                            ${item.missingSubjects.map(subj => `
                                <span style="background: #ffffff; color: #dc2626; border: 1px solid #fca5a5; padding: 3px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;">
                                    ${subj}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        });

    if (activeShortageCardCount === 0) {
        auditHTML += `
            <div style="color: #16a34a; background: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 6px; font-weight: 600; font-size: 0.85rem;">
                No schedule shortages detected. All sections have been fully scheduled.
            </div>
        `;
    }

    auditHTML += `
            </div>
        </div>
    `;

    summaryCard.innerHTML = auditHTML;
    mainWrapper.appendChild(summaryCard);

    window.toggleAuditView = function() {
        const detailsDiv = document.getElementById("grade-level-audit-details");
        const btn = document.getElementById("toggle-audit-btn");
        if (detailsDiv.style.display === "none") {
            detailsDiv.style.display = "block";
            btn.innerHTML = "Hide Shortages";
        } else {
            detailsDiv.style.display = "none";
            btn.innerHTML = "View Scheduling Shortages";
        }
    };

    // FILTER OUT SECTIONS THAT HAVE NO SCHEDULED SLOTS AT ALL
    const gradeGroupedSections = {};
    let totalGeneratedTablesCount = 0;

    Object.values(masterSectionSchedules).forEach(secObj => {
        // Check if this section has at least ONE scheduled subject slot
        let hasAtLeastOneSlot = false;
        Object.values(secObj.timetable).forEach(dayObj => {
            if (Object.keys(dayObj).length > 0) {
                hasAtLeastOneSlot = true;
            }
        });

        // ONLY INCLUDE IF IT HAS SCHEDULED CLASSES
        if (hasAtLeastOneSlot) {
            const gName = secObj.gradeLevel;
            if (!gradeGroupedSections[gName]) {
                gradeGroupedSections[gName] = [];
            }
            gradeGroupedSections[gName].push(secObj);
            totalGeneratedTablesCount++;
        }
    });

    const sortedGradeKeys = Object.keys(gradeGroupedSections).sort((a, b) => {
        const numA = parseInt((a.match(/\d+/) || [0])[0], 10);
        const numB = parseInt((b.match(/\d+/) || [0])[0], 10);
        return numA - numB;
    });

    // If zero tables could be generated across all sections, show a clean info box
    if (totalGeneratedTablesCount === 0) {
        const emptyAlert = document.createElement("div");
        emptyAlert.style.cssText = "text-align: center; color: #dc2626; background: #fef2f2; padding: 30px; border-radius: 8px; border: 1px solid #fecaca; font-weight: bold;";
        emptyAlert.innerHTML = "No timetables could be rendered. Please assign teachers to the respective Grade Levels to generate valid schedules.";
        mainWrapper.appendChild(emptyAlert);
        return;
    }

    window.printSectionSchedule = function(cardId) {
        const cardTarget = document.getElementById(cardId);
        if (!cardTarget) return;

        document.querySelectorAll('.section-print-area').forEach(el => el.classList.remove('section-print-area'));
        cardTarget.classList.add('section-print-area');
        window.print();
    };

    window.downloadSectionPDF = function(cardId, sectionName) {
        const cardTarget = document.getElementById(cardId);
        if (!cardTarget) return;

        if (typeof html2pdf === "undefined") {
            alert("PDF export library is missing or still loading. Please check if html2pdf.bundle.min.js is included in your HTML file.");
            return;
        }

        cardTarget.classList.add("section-pdf-export");

        const configOptions = {
            margin:       [5, 5, 5, 5],
            filename:     `Schedule_Section_${sectionName.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  {
                scale: 2.3,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false
            },
            jsPDF:         { unit: 'mm', format: 'letter', orientation: 'landscape' }
        };

        html2pdf().set(configOptions).from(cardTarget).save().then(() => {
            cardTarget.classList.remove("section-pdf-export");
        }).catch((err) => {
            console.error("PDF generation error:", err);
            cardTarget.classList.remove("section-pdf-export");
            alert("Failed to export PDF document.");
        });
    };

    sortedGradeKeys.forEach(gradeName => {
        const sectionsList = gradeGroupedSections[gradeName];

        const gradeHeaderBox = document.createElement("div");
        gradeHeaderBox.className = "no-print";
        gradeHeaderBox.style.cssText = "margin-top: 30px; margin-bottom: 15px;";
        
        gradeHeaderBox.innerHTML = `
            <h2 style="color: #ffffff; font-size: 1.35rem; font-weight: 800; border-bottom: 2px solid #38bdf8; padding-bottom: 8px;">
                ${gradeName} <span style="color: #38bdf8; font-size: 0.95rem; font-weight: 600;">(${sectionsList.length} Scheduled Sections)</span>
            </h2>
        `;
        mainWrapper.appendChild(gradeHeaderBox);

        sectionsList.forEach((secObj, secIdx) => {
            const secName = secObj.details.name;
            const uniqueCardId = `schedule-card-${gradeName.replace(/[^a-zA-Z0-9]/g, '')}-${secIdx}`;
            
            const secCard = document.createElement("div");
            secCard.id = uniqueCardId;
            secCard.style.cssText = "background: #ffffff; border: 2px solid #000000; border-radius: 4px; padding: 15px; margin-bottom: 30px; overflow-x: auto;";

            let tableHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="color: #000000; margin: 0; font-size: 1.15rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                        SECTION: <span style="color: #000000;">${secName}</span>
                    </h3>
                    <div class="no-print" style="display: flex; gap: 8px;">
                        <button onclick="printSectionSchedule('${uniqueCardId}')" style="background: #000000; color: #ffffff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.8rem;">
                            Print
                        </button>
                        <button onclick="downloadSectionPDF('${uniqueCardId}', '${secName}')" style="background: #0284c7; color: #ffffff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.8rem;">
                            Download PDF
                        </button>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; min-width: 750px; text-align: center; font-size: 0.85rem; border: 2px solid #000000;">
                    <thead>
                        <tr style="background: #ffffff; color: #000000; border-bottom: 2px solid #000000;">
                            <th style="padding: 10px; border: 2px solid #000000; width: 120px; font-weight: 800; font-size: 0.9rem;">TIME</th>
            `;

            daySlots.forEach(day => {
                tableHTML += `<th style="padding: 10px; border: 2px solid #000000; font-weight: 800; font-size: 0.9rem; text-transform: uppercase;">${day}</th>`;
            });

            tableHTML += `</tr></thead><tbody>`;

            timeSlots.forEach(time => {
                tableHTML += `
                    <tr>
                        <td style="padding: 8px; background: #ffffff; color: #000000; font-weight: 800; border: 2px solid #000000; font-size: 0.85rem;">
                            ${time}
                        </td>
                `;

                daySlots.forEach(day => {
                    const slotData = secObj.timetable[day][time];

                    if (slotData) {
                        const cellBgColor = getSubjectColor(slotData.subject);
                        tableHTML += `
                            <td style="padding: 6px; border: 2px solid #000000; background: ${cellBgColor}; color: #000000; vertical-align: middle; font-weight: 700;">
                                <div style="font-size: 0.9rem; font-weight: 800; line-height: 1.2;">
                                    ${slotData.subject}
                                </div>
                                <div style="font-size: 0.78rem; font-weight: 600; margin-top: 3px;">
                                    ${slotData.teacher}
                                </div>
                                ${slotData.room ? `<div style="font-size: 0.72rem; font-weight: 500; opacity: 0.9;">(${slotData.room})</div>` : ''}
                            </td>
                        `;
                    } else {
                        tableHTML += `
                            <td style="padding: 6px; border: 2px solid #000000; background: #ffffff; vertical-align: middle;">
                            </td>
                        `;
                    }
                });

                tableHTML += `</tr>`;
            });

            tableHTML += `</tbody></table>`;
            secCard.innerHTML = tableHTML;
            mainWrapper.appendChild(secCard);
        });
    });
}