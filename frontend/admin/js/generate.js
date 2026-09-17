/**
 * Advanced Master Schedule Generator - Makiling Integrated School (MIS) Edition
 * - Full Unfiltered Time Slots (06:00 AM - 06:00 PM)
 * - Automatic RECESS & LUNCH BREAK Row Injections
 * - Grade-Level Matching & Subject Alias Logic
 * - PDF Export & Direct Print Controls
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

// Helper: Extracts numerical grade level (e.g. "Grade 8" -> "8")
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

// Helper: Standardizes subject strings for robust alias matching
function sanitizeSubjectName(str) {
    if (!str) return "";
    let clean = str.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (clean.includes('values') || clean.includes('esp') || clean.includes('edukasyon')) {
        return 'valueseducation';
    }
    if (clean.includes('mapeh') || clean.includes('music') || clean.includes('arts') || clean.includes('pe') || clean.includes('health')) {
        return 'mapeh';
    }
    if (clean.includes('ap') || clean.includes('araling')) {
        return 'aralingpanlipunan';
    }
    if (clean.includes('tle') || clean.includes('epp')) {
        return 'tle';
    }
    return clean;
}

// Helper: Sanitizes text for HTML rendering
function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// High-contrast light palette for subject background colors
const subjectColorPalette = [
    '#e0f2fe', '#dcfce7', '#fef3c7', '#f3e8ff', '#ffe4e6', 
    '#ccfbf1', '#ffedd5', '#fae8ff', '#e0e7ff', '#fce7f3'
];

function getSubjectColor(subjectName) {
    if (!subjectName) return '#ffffff';
    let hash = 0;
    for (let i = 0; i < subjectName.length; i++) {
        hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % subjectColorPalette.length;
    return subjectColorPalette[index];
}

// Helper: Standardizes teacher names for matching
function sanitizeTeacherKey(name) {
    if (!name) return "";
    return name.toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

// ==========================================
// PART 1: MASTER TIMETABLE GENERATION ENGINE
// ==========================================

async function processSystemTimetable() {
    console.log("Executing Makiling Integrated School Master Schedule Generation...");
   
    let container = document.getElementById("timetable-matrix-output-body") || 
                    document.querySelector('.dashboard-card-panel') || 
                    document.querySelector('.main-content') ||
                    document.body;
   
    container.innerHTML = `
        <div id="engine-processing-status" style="text-align: center; color: #1e293b; font-weight: bold; padding: 40px; font-size: 1.1rem; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin-top: 20px;">
            Generating MIS Master Schedules (AM/PM Shifts, Recess & Lunch Blocks)...
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

        // --- FIXED RESPONSE VALIDATION LOGIC ---
        const apiCalls = [
            { name: 'teachers', res: teachersResponse },
            { name: 'subjects', res: subjectsResponse },
            { name: 'rooms', res: roomsResponse },
            { name: 'sections', res: sectionsResponse }
        ];

        const failedCall = apiCalls.find(call => !call.res.ok);
        if (failedCall) {
            throw new Error(`Endpoint /api/admin/${failedCall.name} failed with Status: ${failedCall.res.status}`);
        }
        // ----------------------------------------

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
            "06:00-07:00",
            "07:00-08:00",
            "08:00-09:00",
            "09:00-10:00", 
            "10:00-11:00",
            "11:00-12:00",
            "12:00-01:00", 
            "01:00-02:00",
            "02:00-03:00",
            "03:00-04:00",
            "04:00-05:00",
            "05:00-06:00"
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

        const teacherConflictMatrix = {}; 
        const teacherDailyHoursTracker = {}; 
        const roomConflictMatrix = {};    
        const subjectPerDayTracker = {};  
        const masterSectionSchedules = {}; 

        savedSections.forEach(sec => {
            masterSectionSchedules[sec.name] = {
                details: sec,
                gradeLevel: normalizeGradeLevelName(sec.grade_level || sec.target_grade || sec.gradeLevel || "Grade 7"),
                timetable: {} 
            };
            daySlots.forEach(d => {
                masterSectionSchedules[sec.name].timetable[d] = {};
            });
        });

        for (const section of savedSections) {
            const sectionGrade = normalizeGradeLevelName(section.grade_level || section.target_grade || section.gradeLevel || "Grade 7");
            const sectionGradeNum = extractGradeNumber(sectionGrade);

            let sectionSubjects = safeParseArray(section.subjects || section.subject_list);
            
            if (sectionSubjects.length === 0) {
                sectionSubjects = normalizedSubjects
                    .filter(s => extractGradeNumber(s.gradeLevel) === sectionGradeNum)
                    .map(s => typeof s === 'string' ? s : s.name);
            }

            for (const day of daySlots) {
                for (let timeIndex = 0; timeIndex < timeSlots.length; timeIndex++) {
                    const currentTime = timeSlots[timeIndex];

                    if (currentTime === "09:00-10:00" || currentTime === "12:00-01:00") {
                        continue;
                    }

                    for (const subjectName of sectionSubjects) {
                        const cleanSubjectName = typeof subjectName === 'string' ? subjectName.trim() : subjectName.name.trim();
                        const dailySubjectKey = `${section.name}-${day}-${cleanSubjectName.toLowerCase()}`;

                        if (subjectPerDayTracker[dailySubjectKey]) continue;

                        let teacherToUse = normalizedTeachers.find(t => {
                            const conductsSubject = t.subjects.some(s => {
                                const sanitizedTeacherSubj = sanitizeSubjectName(s);
                                const sanitizedSecSubj = sanitizeSubjectName(cleanSubjectName);
                                return sanitizedTeacherSubj === sanitizedSecSubj || 
                                       sanitizedTeacherSubj.includes(sanitizedSecSubj) || 
                                       sanitizedSecSubj.includes(sanitizedTeacherSubj);
                            });

                            const matchesGrade = !t.targetGradeNum || t.targetGradeNum === sectionGradeNum;
                            const worksThisDay = t.workDays.some(d => d.toLowerCase().trim() === day.toLowerCase().trim());
                            const teacherTimeKey = `${t.fullName}-${day}-${currentTime}`;
                            const dailyHoursKey = `${t.fullName}-${day}`;
                            const currentDailyHours = teacherDailyHoursTracker[dailyHoursKey] || 0;

                            return conductsSubject && matchesGrade && worksThisDay && !teacherConflictMatrix[teacherTimeKey] && currentDailyHours < 6;
                        });

                        if (!teacherToUse) continue;

                        let availableRoom = savedRooms.find(r => !roomConflictMatrix[`${r.name}-${day}-${currentTime}`])?.name || savedRooms[0]?.name || "Classroom 1";

                        const teacherFullName = teacherToUse.fullName;
                        const teacherTimeKey = `${teacherFullName}-${day}-${currentTime}`;
                        const dailyHoursKey = `${teacherFullName}-${day}`;

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

        const gradeAuditMap = {};
        savedSections.forEach(sec => {
            const normG = normalizeGradeLevelName(sec.grade_level || sec.target_grade || sec.gradeLevel);
            const gNum = extractGradeNumber(normG);
            
            if (!gradeAuditMap[normG]) {
                const assignedTeachersCount = normalizedTeachers.filter(t => !t.targetGradeNum || t.targetGradeNum === gNum).length;
                gradeAuditMap[normG] = { missingSubjects: [], teacherCount: assignedTeachersCount };
            }
        });

        const systemAuditSummary = {
            totalSections: savedSections.length,
            totalTeachers: normalizedTeachers.length,
            totalRooms: savedRooms.length,
            gradeAuditMap: gradeAuditMap
        };

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

// ==========================================
// PART 2: DASHBOARD RENDERING & UI EXPORTS
// ==========================================

function renderMasterSectionScheduleDashboard(container, masterSectionSchedules, auditSummary, daySlots, timeSlots, normalizedTeachers) {
    container.innerHTML = "";

    const teacherSchedulesMap = {};
    Object.values(masterSectionSchedules).forEach(secObj => {
        const sectionName = secObj.details.name;
        const gradeLevel = secObj.gradeLevel;

        Object.entries(secObj.timetable).forEach(([day, times]) => {
            Object.entries(times).forEach(([time, slotData]) => {
                if (slotData && slotData.teacher) {
                    const rawTeacher = slotData.teacher.trim();
                    const normalizedKey = sanitizeTeacherKey(rawTeacher);

                    if (!teacherSchedulesMap[normalizedKey]) {
                        teacherSchedulesMap[normalizedKey] = { teacherName: rawTeacher, days: {} };
                    }
                    if (!teacherSchedulesMap[normalizedKey].days[day]) {
                        teacherSchedulesMap[normalizedKey].days[day] = {};
                    }

                    teacherSchedulesMap[normalizedKey].days[day][time] = {
                        subject: slotData.subject,
                        section: sectionName,
                        gradeLevel: gradeLevel,
                        room: slotData.room || "N/A"
                    };
                }
            });
        });
    });

    localStorage.setItem("cached_teacher_schedules", JSON.stringify(teacherSchedulesMap));
    localStorage.setItem("global_master_schedule", JSON.stringify(masterSectionSchedules));

    if (!document.getElementById("printable-schedule-css")) {
        const styleEl = document.createElement("style");
        styleEl.id = "printable-schedule-css";
        styleEl.innerHTML = `
            @media print {
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                @page { size: landscape; margin: 6mm; }
                html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
                body * { visibility: hidden; }
                .section-print-area, .section-print-area * { visibility: visible; }
                .section-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; }
                .no-print { display: none !important; }
            }
            .section-pdf-export { background: #ffffff !important; padding: 10px !important; }
            .section-pdf-export .no-print { display: none !important; }
        `;
        document.head.appendChild(styleEl);
    }

    const mainWrapper = document.createElement("div");
    mainWrapper.style.marginTop = "20px";
    container.appendChild(mainWrapper);

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
            alert("PDF library is missing or loading. Ensure html2pdf.bundle.min.js is included.");
            return;
        }

        cardTarget.classList.add("section-pdf-export");

        const configOptions = {
            margin:       [5, 5, 5, 5],
            filename:     `MIS_Schedule_Section_${sectionName.replace(/\s+/g, '_')}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2.3, useCORS: true, backgroundColor: '#ffffff', logging: false },
            jsPDF:        { unit: 'mm', format: 'letter', orientation: 'landscape' }
        };

        html2pdf().set(configOptions).from(cardTarget).save().then(() => {
            cardTarget.classList.remove("section-pdf-export");
        }).catch((err) => {
            console.error("PDF generation error:", err);
            cardTarget.classList.remove("section-pdf-export");
            alert("Failed to export PDF document.");
        });
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

    sortedGradeKeys.forEach(gradeName => {
        const sectionsList = gradeGroupedSections[gradeName];

        const gradeHeaderBox = document.createElement("div");
        gradeHeaderBox.className = "no-print";
        gradeHeaderBox.style.cssText = "margin-top: 30px; margin-bottom: 15px;";
        
        gradeHeaderBox.innerHTML = `
            <h2 style="color: #0f172a; font-size: 1.35rem; font-weight: 800; border-bottom: 2px solid #0284c7; padding-bottom: 8px;">
                ${escapeHTML(gradeName)} <span style="color: #0284c7; font-size: 0.95rem; font-weight: 600;">(${sectionsList.length} Scheduled Sections)</span>
            </h2>
        `;
        mainWrapper.appendChild(gradeHeaderBox);

        sectionsList.forEach((secObj, secIdx) => {
            const secName = secObj.details.name;
            const uniqueCardId = `schedule-card-${gradeName.replace(/[^a-zA-Z0-9]/g, '')}-${secIdx}`;
            
            const generatedTimestamp = new Date().toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });

            const secCard = document.createElement("div");
            secCard.id = uniqueCardId;
            secCard.style.cssText = "background: #ffffff; border: 2px solid #000000; border-radius: 4px; padding: 15px; margin-bottom: 30px; overflow-x: auto;";

            let tableHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                        <h3 style="color: #000000; margin: 0; font-size: 1.15rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                            SECTION: <span style="color: #000000;">${escapeHTML(secName)}</span>
                        </h3>
                        <div style="color: #475569; font-size: 0.75rem; font-weight: 600; margin-top: 2px;">
                            Generated on: ${generatedTimestamp}
                        </div>
                    </div>
                    <div class="no-print" style="display: flex; gap: 8px;">
                        <button onclick="printSectionSchedule('${uniqueCardId}')" style="background: #000000; color: #ffffff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.8rem;">
                            Print
                        </button>
                        <button onclick="downloadSectionPDF('${uniqueCardId}', '${escapeHTML(secName)}')" style="background: #0284c7; color: #ffffff; border: none; padding: 6px 14px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 0.8rem;">
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

                if (time === "09:00-10:00") {
                    tableHTML += `
                        <td colspan="${daySlots.length}" style="padding: 8px; background: #fef08a; color: #854d0e; font-weight: 800; border: 2px solid #000000; letter-spacing: 2px; font-size: 0.85rem;">
                            RECESS / MORNING BREAK
                        </td>
                    `;
                }
                else if (time === "12:00-01:00") {
                    tableHTML += `
                        <td colspan="${daySlots.length}" style="padding: 8px; background: #fed7aa; color: #9a3412; font-weight: 800; border: 2px solid #000000; letter-spacing: 2px; font-size: 0.85rem;">
                            LUNCH BREAK / SHIFT TRANSITION
                        </td>
                    `;
                }
                else {
                    daySlots.forEach(day => {
                        const slotData = secObj.timetable[day]?.[time];

                        if (slotData) {
                            const cellBgColor = getSubjectColor(slotData.subject);
                            tableHTML += `
                                <td style="padding: 6px; border: 2px solid #000000; background: ${cellBgColor}; color: #000000; vertical-align: middle; font-weight: 700;">
                                    <div style="font-size: 0.9rem; font-weight: 800; line-height: 1.2;">
                                        ${escapeHTML(slotData.subject)}
                                    </div>
                                    <div style="font-size: 0.78rem; font-weight: 600; margin-top: 3px;">
                                        ${escapeHTML(slotData.teacher)}
                                    </div>
                                    ${slotData.room ? `<div style="font-size: 0.72rem; font-weight: 500; opacity: 0.9;">(${escapeHTML(slotData.room)})</div>` : ''}
                                </td>
                            `;
                        } else {
                            tableHTML += `
                                <td style="padding: 6px; border: 2px solid #000000; background: #ffffff; vertical-align: middle;">
                                </td>
                            `;
                        }
                    });
                }

                tableHTML += `</tr>`;
            });

            tableHTML += `</tbody></table>`;
            secCard.innerHTML = tableHTML;
            mainWrapper.appendChild(secCard);
        });
    });
}

// ==========================================
// AUTO-INITIALIZATION & LISTENERS
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    const generateBtn = document.getElementById("btn-generate-schedule") || document.getElementById("generate-btn");
    if (generateBtn) {
        generateBtn.addEventListener("click", () => processSystemTimetable());
    }

    const cachedData = localStorage.getItem("cached_generated_schedule");
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            let container = document.getElementById("timetable-matrix-output-body") || 
                            document.querySelector('.dashboard-card-panel') || 
                            document.querySelector('.main-content') ||
                            document.body;
            renderMasterSectionScheduleDashboard(
                container, 
                parsed.masterSectionSchedules, 
                parsed.auditSummary, 
                parsed.daySlots, 
                parsed.timeSlots, 
                parsed.normalizedTeachers
            );
        } catch (e) {
            console.error("Failed to parse cached schedule:", e);
            processSystemTimetable();
        }
    } else {
        processSystemTimetable();
    }
});