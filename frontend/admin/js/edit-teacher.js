// 1️⃣ EXTRACT TEACHER ID FROM URL QUERY PARAMETER
const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

console.log("🔍 URL Query Parameter Detected ID:", teacherId);

if (!teacherId) {
    alert("Invalid Access: Teacher ID is missing from the browser URL path.");
    window.location.href = "teacher-list.html";
}

/**
 * Converts 24-hour time string (e.g., "18:00") to 12-hour AM/PM format ("06:00 PM")
 */
function format12Hour(time24) {
    if (!time24) return '';
    let [hours, minutes] = String(time24).trim().split(':').map(Number);
    if (isNaN(hours)) return time24;

    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')} ${period}`;
}

/**
 * Helper: Standardizes input values into matching "HH:MM" 24-hr values
 */
function normalizeTo24Hour(timeStr) {
    if (!timeStr) return '';
    
    const cleanStr = String(timeStr).trim().toLowerCase();
    
    if (cleanStr.includes('am') || cleanStr.includes('pm')) {
        const isPM = cleanStr.includes('pm');
        const timeOnly = cleanStr.replace(/(am|pm)/g, '').trim();
        let [hours, minutes] = timeOnly.split(':').map(Number);
        
        if (isNaN(hours)) return '';
        if (isPM && hours < 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        
        return `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')}`;
    }

    const parts = cleanStr.split(':');
    if (parts.length >= 2) {
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }

    return timeStr;
}

/**
 * Generates options HTML for a single dropdown select (06:00 AM to 09:30 PM)
 */
function buildFullTimeOptions() {
    let optionsHtml = '';
    for (let hour = 6; hour <= 21; hour++) {
        for (let min of [0, 30]) {
            if (hour === 21 && min === 30) break;

            const val24 = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const display12 = format12Hour(val24);

            optionsHtml += `<option value="${val24}">${display12}</option>`;
        }
    }
    return optionsHtml;
}

/**
 * ⏰ Overrides parent container styles to force vertical column layout (Title on top, times below)
 */
function populateTimeDropdowns() {
    let startSelect = document.getElementById('startTime') || document.getElementById('start_time');
    
    // Locate the parent row wrapper
    let targetContainer = null;
    if (startSelect) {
        targetContainer = startSelect.closest('.form-group, .time-group, .availability-container, .input-group') || startSelect.parentElement;
        if (targetContainer && targetContainer.parentElement && targetContainer.parentElement.style.display === 'flex') {
            targetContainer = targetContainer.parentElement;
        }
    }

    if (!targetContainer) {
        targetContainer = document.querySelector('.time-group, .availability-container');
    }

    const optionsHtml = buildFullTimeOptions();

    if (targetContainer) {
        // Force parent wrapper to stack elements vertically
        targetContainer.style.setProperty('display', 'flex', 'important');
        targetContainer.style.setProperty('flex-direction', 'column', 'important');
        targetContainer.style.setProperty('align-items', 'flex-start', 'important');
        targetContainer.style.setProperty('width', '100%', 'important');
        targetContainer.style.setProperty('margin-top', '16px', 'important');

        targetContainer.innerHTML = `
            <!-- Title Header on Top -->
            <label style="font-size: 0.85rem; color: #a0a0c0; font-weight: 500; margin-bottom: 10px; display: block; width: 100%;">
                Preferred Shift / Availability Window
            </label>

            <!-- Start / End Row Below -->
            <div style="display: flex !important; flex-direction: row !important; align-items: flex-end !important; gap: 12px !important; width: 100% !important;">
                
                <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 0.8rem; color: #a0a0c0; font-weight: 500;">Start Time</span>
                    <select id="startTime" class="custom-single-time-select">
                        ${optionsHtml}
                    </select>
                </div>

                <span style="color: #a0a0c0; font-weight: 500; font-size: 0.85rem; padding-bottom: 10px;">to</span>

                <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                    <span style="font-size: 0.8rem; color: #a0a0c0; font-weight: 500;">End Time</span>
                    <select id="endTime" class="custom-single-time-select">
                        ${optionsHtml}
                    </select>
                </div>

            </div>
        `;
    }

    // CSS rules to enforce select box sizing inside dark mode UI
    if (!document.getElementById('single-time-select-styles')) {
        const style = document.createElement('style');
        style.id = 'single-time-select-styles';
        style.textContent = `
            select#startTime, select#endTime, .custom-single-time-select {
                width: 100% !important;
                background-color: #1a1e2d !important;
                border: 1px solid #2e354f !important;
                color: #ffffff !important;
                border-radius: 6px !important;
                padding: 8px 12px !important;
                font-size: 0.9rem !important;
                outline: none !important;
                cursor: pointer !important;
                box-sizing: border-box !important;
                height: 40px !important;
            }
            select#startTime option, select#endTime option, .custom-single-time-select option {
                background-color: #1a1e2d !important;
                color: #ffffff !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// 2️⃣ FETCH & PRE-FILL TEACHER PROFILE DATA
async function loadTeacherProfile() {
    try {
        populateTimeDropdowns();

        console.log("🌐 Initiating fetch request to secure API server context...");
        
        const token = localStorage.getItem('token');
        const headers = { 
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-cache'
        };

        const endpointsToTry = [
            `/api/admin/teachers/${teacherId}`,
            `/api/teachers/${teacherId}`,
            '/api/admin/teachers',
            '/api/teachers'
        ];

        let teacher = null;

        for (const endpoint of endpointsToTry) {
            try {
                const res = await fetch(endpoint, { headers, cache: 'no-store' });
                if (!res.ok) continue;

                const rawData = await res.json();
                
                if (rawData && (rawData.id == teacherId || rawData._id == teacherId || rawData.teacher_id == teacherId)) {
                    teacher = rawData;
                    break;
                }
                
                if (rawData && rawData.teacher) {
                    teacher = rawData.teacher;
                    break;
                }

                const teachersList = Array.isArray(rawData) 
                    ? rawData 
                    : (rawData.teachers || rawData.data || []);

                if (Array.isArray(teachersList) && teachersList.length > 0) {
                    const found = teachersList.find(t => {
                        const dbId = t.id ?? t._id ?? t.teacher_id;
                        return String(dbId).trim() === String(teacherId).trim();
                    });
                    if (found) {
                        teacher = found;
                        break;
                    }
                }
            } catch (err) {
                console.warn(`Fetch route attempt failed for ${endpoint}:`, err);
            }
        }

        if (!teacher) {
            console.error("❌ Teacher matching ID " + teacherId + " was not returned by API.");
            alert("Teacher record not found on server.");
            return;
        }

        console.log("✅ Matched Teacher Data:", teacher);

        let first = teacher.firstName || teacher.first_name || '';
        let last = teacher.lastName || teacher.last_name || '';

        if (!first && !last && (teacher.name || teacher.fullName)) {
            const parts = String(teacher.name || teacher.fullName).trim().split(' ');
            first = parts[0] || '';
            last = parts.slice(1).join(' ') || '';
        }

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        setVal('firstName', first);
        setVal('lastName', last);
        setVal('email', teacher.email);
        setVal('targetGrade', teacher.targetGrade || teacher.target_grade || teacher.gradeLevel);
        
        const rawSubjects = teacher.subjects || teacher.subject_list || teacher.subject;
        const subjectsStr = Array.isArray(rawSubjects) ? rawSubjects.join(', ') : (rawSubjects || '');
        setVal('subjects', subjectsStr);
        
        // Extract start and end shift times
        let extractedStart = teacher.startTime || teacher.start_time || '';
        let extractedEnd = teacher.endTime || teacher.end_time || '';

        if ((!extractedStart || !extractedEnd) && (teacher.shift || teacher.time || teacher.availability)) {
            const shiftText = String(teacher.shift || teacher.time || teacher.availability);
            const parsedShift = shiftText.split('-');
            if (parsedShift.length === 2) {
                extractedStart = parsedShift[0].trim();
                extractedEnd = parsedShift[1].trim();
            }
        }

        // Set value in single scroll dropdowns
        const startVal = normalizeTo24Hour(extractedStart) || '08:00';
        const endVal = normalizeTo24Hour(extractedEnd) || '16:00';

        const startEl = document.getElementById('startTime');
        const endEl = document.getElementById('endTime');
        
        if (startEl) startEl.value = startVal;
        if (endEl) endEl.value = endVal;

        // Pre-select work days
        const rawDays = teacher.workDays || teacher.work_days;
        if (rawDays) {
            let activeDays = Array.isArray(rawDays) 
                ? rawDays 
                : String(rawDays).split(',').map(d => d.trim());

            const normalizedActiveDays = activeDays.map(d => String(d).toLowerCase().trim());
            const checkboxes = document.querySelectorAll('.day-checkbox');
            
            checkboxes.forEach(cb => {
                const valLower = cb.value.toLowerCase().trim();
                if (normalizedActiveDays.some(day => day.includes(valLower) || valLower.includes(day))) {
                    cb.checked = true;
                }
            });
        }

    } catch (err) {
        console.error("💥 Error in loadTeacherProfile:", err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTeacherProfile);
} else {
    loadTeacherProfile();
}

// 3️⃣ SAVE FORM DATA
const formEl = document.getElementById('editTeacherForm') || document.querySelector('form');
if (formEl) {
    formEl.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saveBtn = e.target.querySelector('.btn-save') || e.target.querySelector('button[type="submit"]');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerText = 'Saving...';
        }

        const selectedDays = [];
        document.querySelectorAll('.day-checkbox:checked').forEach(cb => {
            selectedDays.push(cb.value);
        });

        if (selectedDays.length === 0) {
            alert("Please pick at least one available day configuration.");
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerText = 'Save Changes';
            }
            return;
        }

        const firstNameVal = (document.getElementById('firstName')?.value || '').trim();
        const lastNameVal = (document.getElementById('lastName')?.value || '').trim();
        const fullNameVal = `${firstNameVal} ${lastNameVal}`.trim();
        
        const startEl = document.getElementById('startTime');
        const endEl = document.getElementById('endTime');
        
        const startVal = startEl ? startEl.value : '08:00';
        const endVal = endEl ? endEl.value : '16:00';
        
        const start12 = format12Hour(startVal);
        const end12 = format12Hour(endVal);
        const shiftString12 = `${start12} - ${end12}`;
        const shiftString24 = `${startVal} - ${endVal}`;

        const targetGradeVal = (document.getElementById('targetGrade')?.value || '').trim();
        const subjectsVal = (document.getElementById('subjects')?.value || '');
        const subjectsArray = subjectsVal.split(',').map(s => s.trim()).filter(s => s !== "");

        const updatedPayload = {
            id: Number(teacherId) || teacherId,
            teacher_id: Number(teacherId) || teacherId,
            name: fullNameVal,
            fullName: fullNameVal,
            firstName: firstNameVal,
            first_name: firstNameVal,
            lastName: lastNameVal,
            last_name: lastNameVal,
            email: (document.getElementById('email')?.value || '').trim(),
            subjects: subjectsArray,
            subject_list: subjectsArray,
            targetGrade: targetGradeVal,
            target_grade: targetGradeVal,
            gradeLevel: targetGradeVal,
            workDays: selectedDays,
            work_days: selectedDays,
            startTime: startVal,
            start_time: startVal,
            endTime: endVal,
            end_time: endVal,
            shift: shiftString12,
            shift_24: shiftString24,
            time: shiftString12,
            availability: shiftString12
        };

        try {
            const token = localStorage.getItem('token');
            
            // Multi-route fallback strategy
            const updateAttempts = [
                { url: `/api/admin/teachers/${teacherId}`, method: 'PUT' },
                { url: `/api/teachers/${teacherId}`, method: 'PUT' },
                { url: `/api/admin/teachers/${teacherId}`, method: 'PATCH' },
                { url: `/api/teachers/${teacherId}`, method: 'PATCH' },
                { url: `/api/admin/teachers`, method: 'PUT' },
                { url: `/api/teachers`, method: 'PUT' },
                { url: `/api/admin/teachers`, method: 'POST' },
                { url: `/api/teachers`, method: 'POST' }
            ];

            let response = null;

            for (const target of updateAttempts) {
                try {
                    console.log(`📡 Attempting update via ${target.method} ${target.url}...`);
                    const res = await fetch(target.url, {
                        method: target.method,
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(updatedPayload)
                    });

                    if (res.ok) {
                        response = res;
                        console.log(`✅ Save successful via ${target.method} ${target.url}`);
                        break;
                    }
                } catch (err) {
                    console.warn(`Update attempt failed on ${target.url}`, err);
                }
            }

            if (response && response.ok) {
                alert("Teacher profile updated successfully!");
                window.location.href = "teacher-list.html";
            } else {
                alert("Save Failed: Could not update profile on server.");
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerText = 'Save Changes';
                }
            }
        } catch (err) {
            console.error("Network error on save:", err);
            alert("Transmission Failure: Server connection lost.");
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerText = 'Save Changes';
            }
        }
    });
}