// 1️⃣ EXTRACT TEACHER ID FROM URL QUERY PARAMETER
const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

console.log("🔍 URL Query Parameter Detected ID:", teacherId);

if (!teacherId) {
    alert("Invalid Access: Teacher ID is missing from the browser URL path.");
    window.location.href = "teacher-list.html";
}

// Utility function inside edit-teacher.js
function format12Hour(time24) {
    if (!time24) return '';
    let [hours, minutes] = time24.split(':').map(Number);
    if (isNaN(hours)) return time24;
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, '0')}:${(minutes || 0).toString().padStart(2, '0')} ${period}`;
}

// Inside your submit listener in edit-teacher.js:
const startVal = document.getElementById('startTime').value; // "08:00"
const endVal = document.getElementById('endTime').value;     // "18:00"

const start12 = format12Hour(startVal); // "08:00 AM"
const end12 = format12Hour(endVal);     // "06:00 PM"
const shift12 = `${start12} - ${end12}`; // "08:00 AM - 06:00 PM"

const updatedPayload = {
    // ... basic details ...
    workDays: selectedDays,
    work_days: selectedDays,
    
    // Save both raw values and composite strings
    startTime: startVal,
    start_time: startVal,
    endTime: endVal,
    end_time: endVal,
    shift: shift12,
    time: shift12,
    availability: shift12
};

/**
 * ⏰ Populates <select> elements with user-friendly 12-hour AM/PM time options
 * while assigning 24-hour values (e.g. "18:00") behind the scenes.
 */
function populateTimeDropdowns() {
    const startSelect = document.getElementById('startTime');
    const endSelect = document.getElementById('endTime');

    if (!startSelect || !endSelect) return;

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    // Generate options from 06:00 (6 AM) to 21:00 (9 PM) with 30-min intervals
    for (let hour = 6; hour <= 21; hour++) {
        for (let min of [0, 30]) {
            if (hour === 21 && min === 30) break; // Stop at 9:00 PM

            const val24 = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const display12 = format12Hour(val24);

            const option1 = new Option(display12, val24);
            const option2 = new Option(display12, val24);

            option1.style.backgroundColor = '#1e2330';
            option1.style.color = '#ffffff';
            option2.style.backgroundColor = '#1e2330';
            option2.style.color = '#ffffff';

            startSelect.add(option1);
            endSelect.add(option2);
        }
    }
}

/**
 * Helper: Standardizes input values into matching "HH:MM" 24-hr values
 */
function normalizeTo24Hour(timeStr) {
    if (!timeStr) return '';
    
    const cleanStr = timeStr.trim().toLowerCase();
    
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
        const headers = { 'Authorization': `Bearer ${token}` };

        const endpointsToTry = [
            '/api/admin/teachers',
            '/api/teachers',
            '/api/admin/teacher-list'
        ];

        let response = null;
        for (const endpoint of endpointsToTry) {
            try {
                const res = await fetch(endpoint, { headers });
                if (res.ok) {
                    response = res;
                    break;
                }
            } catch (err) {
                console.warn(`Fetch route search failed for ${endpoint}:`, err);
            }
        }

        if (!response) throw new Error("Could not fetch teachers list from server API.");

        const rawData = await response.json();
        const teachersList = Array.isArray(rawData) ? rawData : (rawData.teachers || rawData.data || []);
        
        const teacher = teachersList.find(t => {
            const dbId = t.id || t._id || t.teacher_id;
            return dbId == teacherId || String(dbId).trim() === String(teacherId).trim();
        });

        if (!teacher) {
            alert("Teacher record match failed. Redirecting to table list.");
            window.location.href = "teacher-list.html";
            return;
        }

        // Smart name extraction
        let first = teacher.firstName || teacher.first_name || '';
        let last = teacher.lastName || teacher.last_name || '';

        if (!first && !last && (teacher.name || teacher.fullName)) {
            const parts = (teacher.name || teacher.fullName).trim().split(' ');
            first = parts[0] || '';
            last = parts.slice(1).join(' ') || '';
        }

        document.getElementById('firstName').value = first;
        document.getElementById('lastName').value = last;
        document.getElementById('email').value = teacher.email || '';
        document.getElementById('targetGrade').value = teacher.targetGrade || teacher.target_grade || teacher.gradeLevel || '';
        
        // Format subjects field
        const rawSubjects = teacher.subjects || teacher.subject_list || teacher.subject;
        if (Array.isArray(rawSubjects)) {
            document.getElementById('subjects').value = rawSubjects.join(', ');
        } else {
            document.getElementById('subjects').value = rawSubjects || '';
        }
        
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

        // Pre-select dropdown options using normalized 24-hr strings
        const startVal = normalizeTo24Hour(extractedStart) || '08:00';
        const endVal = normalizeTo24Hour(extractedEnd) || '18:00';

        document.getElementById('startTime').value = startVal;
        document.getElementById('endTime').value = endVal;

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
        console.error("💥 Critical error triggered inside the script lifecycle:", err);
        alert("API Error: Cannot read database context fields. Check console.");
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTeacherProfile);
} else {
    loadTeacherProfile();
}

// 3️⃣ SAVE FORM DATA
document.getElementById('editTeacherForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const saveBtn = e.target.querySelector('.btn-save');
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

    const firstNameVal = document.getElementById('firstName').value.trim();
    const lastNameVal = document.getElementById('lastName').value.trim();
    const fullNameVal = `${firstNameVal} ${lastNameVal}`.trim();
    
    // Dropdown values selected (24-hr values e.g. "08:00", "18:00")
    const startVal = document.getElementById('startTime').value;
    const endVal = document.getElementById('endTime').value;
    
    // Formatted 12-hr values (e.g. "08:00 AM", "06:00 PM")
    const start12 = format12Hour(startVal);
    const end12 = format12Hour(endVal);
    
    // Formatted shift strings for backend compatibility
    const shiftString12 = `${start12} - ${end12}`;
    const shiftString24 = `${startVal} - ${endVal}`;

    const targetGradeVal = document.getElementById('targetGrade').value.trim();
    const subjectsArray = document.getElementById('subjects').value
        .split(',')
        .map(s => s.trim())
        .filter(s => s !== "");

    // Complete Payload mapping covering all potential schema formats
    const updatedPayload = {
        name: fullNameVal,
        fullName: fullNameVal,
        firstName: firstNameVal,
        first_name: firstNameVal,
        lastName: lastNameVal,
        last_name: lastNameVal,
        email: document.getElementById('email').value.trim(),
        subjects: subjectsArray,
        subject_list: subjectsArray,
        targetGrade: targetGradeVal,
        target_grade: targetGradeVal,
        gradeLevel: targetGradeVal,
        workDays: selectedDays,
        work_days: selectedDays,
        
        // Raw 24-hr strings
        startTime: startVal,
        start_time: startVal,
        endTime: endVal,
        end_time: endVal,
        
        // Standard shift and availability mappings (Both 12-hr and 24-hr formats)
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
                } else if (res.status !== 404) {
                    result = await res.json().catch(() => ({}));
                    break;
                }
            } catch (err) {
                console.warn(`Update attempt failed on ${endpoint}`, err);
            }
        }

        if (response && response.ok) {
            alert("Teacher data rewritten successfully!");
            window.location.href = "teacher-list.html";
        } else {
            alert("Database Rejected: " + (result.error || result.message || "Validation error block."));
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerText = 'Save Changes';
            }
        }
    } catch (err) {
        console.error("Network upload pipeline crashed:", err);
        alert("Transmission Failure: Server connection lost.");
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = 'Save Changes';
        }
    }
});