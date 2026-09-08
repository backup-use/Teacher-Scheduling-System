// 1️⃣ EXTRACT TEACHER ID FROM URL QUERY PARAMETER
const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

console.log("🔍 URL Query Parameter Detected ID:", teacherId);

if (!teacherId) {
    alert("Invalid Access: Teacher ID is missing from the browser URL path.");
    window.location.href = "teacher-list.html";
}

/**
 * ⏰ Injects clean, aligned Hour/Minute/AM-PM select UI into the existing HTML containers
 */
function populateTimeDropdowns() {
    const startSelect = document.getElementById('startTime') || document.getElementById('start_time');
    const endSelect = document.getElementById('endTime') || document.getElementById('end_time');

    if (!startSelect || !endSelect) {
        console.warn("⚠️ Start/End select elements not found in HTML DOM.");
        return;
    }

    // Inject styles for dark theme dropdowns
    if (!document.getElementById('edit-time-select-styles')) {
        const style = document.createElement('style');
        style.id = 'edit-time-select-styles';
        style.textContent = `
            .custom-edit-time-select {
                background: transparent;
                border: none;
                color: #00d2ff;
                font-weight: 600;
                font-size: 0.95rem;
                padding: 4px 2px;
                cursor: pointer;
                outline: none;
            }
            .custom-edit-time-select option {
                background: #121420;
                color: #fff;
            }
        `;
        document.head.appendChild(style);
    }

    // Find the common container wrapping both start/end controls
    const container = startSelect.closest('.input-group, .form-group') || startSelect.parentElement;

    if (container) {
        container.innerHTML = `
            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #fff;">Preferred Shift / Availability Window</label>
            <div style="display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap;">
                
                <!-- Start Time Block -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-size: 0.75rem; color: #a0a0c0; font-weight: 500;">Start Time</span>
                    <div style="display: flex; gap: 4px; align-items: center; background: rgba(255, 255, 255, 0.05); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
                        <select id="edit-t-start-hour" class="custom-edit-time-select">
                            ${generateHourOptions('08')}
                        </select>
                        <span style="color: #a0a0c0; font-weight: bold;">:</span>
                        <select id="edit-t-start-min" class="custom-edit-time-select">
                            ${generateMinOptions('00')}
                        </select>
                        <select id="edit-t-start-ampm" class="custom-edit-time-select">
                            <option value="AM" selected>AM</option>
                            <option value="PM">PM</option>
                        </select>
                    </div>
                </div>

                <span style="color: #a0a0c0; font-weight: 500; margin-bottom: 8px;">to</span>

                <!-- End Time Block -->
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <span style="font-size: 0.75rem; color: #a0a0c0; font-weight: 500;">End Time</span>
                    <div style="display: flex; gap: 4px; align-items: center; background: rgba(255, 255, 255, 0.05); padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
                        <select id="edit-t-end-hour" class="custom-edit-time-select">
                            ${generateHourOptions('04')}
                        </select>
                        <span style="color: #a0a0c0; font-weight: bold;">:</span>
                        <select id="edit-t-end-min" class="custom-edit-time-select">
                            ${generateMinOptions('00')}
                        </select>
                        <select id="edit-t-end-ampm" class="custom-edit-time-select">
                            <option value="AM">AM</option>
                            <option value="PM" selected>PM</option>
                        </select>
                    </div>
                </div>

            </div>
        `;
    }
}

// Option HTML generators
function generateHourOptions(selectedVal) {
    const hours = ['01','02','03','04','05','06','07','08','09','10','11','12'];
    return hours.map(h => `<option value="${h}" ${h === selectedVal ? 'selected' : ''}>${h}</option>`).join('');
}

function generateMinOptions(selectedVal) {
    const minutes = ['00', '15', '30', '45'];
    return minutes.map(m => `<option value="${m}" ${m === selectedVal ? 'selected' : ''}>${m}</option>`).join('');
}

/**
 * Reads user selections from the split controls and converts them to "HH:MM" (24-hour)
 */
function getEdit24HourTime(type) {
    const hElem = document.getElementById(`edit-t-${type}-hour`);
    const mElem = document.getElementById(`edit-t-${type}-min`);
    const pElem = document.getElementById(`edit-t-${type}-ampm`);

    if (!hElem || !mElem || !pElem) return type === 'start' ? '08:00' : '16:00';

    let hours = parseInt(hElem.value, 10) || 8;
    const minutes = mElem.value || '00';
    const period = pElem.value;

    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Sets values for Hour, Minute, and AM/PM select elements from a 24-hour format ("HH:MM")
 */
function setEditTimeValues(type, time24Str) {
    if (!time24Str) return;
    
    const time24 = normalizeTo24Hour(time24Str);
    const parts = time24.split(':');
    if (parts.length < 2) return;

    let hours = parseInt(parts[0], 10);
    const minutes = parts[1] || '00';
    const ampm = hours >= 12 ? 'PM' : 'AM';

    if (hours === 0) hours = 12;
    else if (hours > 12) hours -= 12;

    const hourStr = hours.toString().padStart(2, '0');

    const hElem = document.getElementById(`edit-t-${type}-hour`);
    const mElem = document.getElementById(`edit-t-${type}-min`);
    const pElem = document.getElementById(`edit-t-${type}-ampm`);

    if (hElem) hElem.value = hourStr;
    if (mElem) mElem.value = minutes;
    if (pElem) pElem.value = ampm;
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

        // Apply loaded shift values to custom dropdowns
        const startVal = normalizeTo24Hour(extractedStart) || '08:00';
        const endVal = normalizeTo24Hour(extractedEnd) || '16:00';

        setEditTimeValues('start', startVal);
        setEditTimeValues('end', endVal);

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
        
        // Read selected time values from split dropdowns
        const startVal = getEdit24HourTime('start');
        const endVal = getEdit24HourTime('end');
        
        const start12 = format12Hour(startVal);
        const end12 = format12Hour(endVal);
        const shiftString12 = `${start12} - ${end12}`;
        const shiftString24 = `${startVal} - ${endVal}`;

        const targetGradeVal = (document.getElementById('targetGrade')?.value || '').trim();
        const subjectsVal = (document.getElementById('subjects')?.value || '');
        const subjectsArray = subjectsVal.split(',').map(s => s.trim()).filter(s => s !== "");

        const updatedPayload = {
            id: teacherId,
            teacher_id: teacherId,
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
            const updateEndpoints = [
                `/api/admin/teachers/${teacherId}`,
                `/api/teachers/${teacherId}`
            ];

            let response = null;
            let result = {};

            for (const endpoint of updateEndpoints) {
                try {
                    const res = await fetch(endpoint, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(updatedPayload)
                    });

                    if (res.ok) {
                        response = res;
                        result = await res.json().catch(() => ({}));
                        break;
                    }
                } catch (err) {
                    console.warn(`Update attempt failed on ${endpoint}`, err);
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