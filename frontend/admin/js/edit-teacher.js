// Parse teacher ID from URL query string
const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

function format12Hour(timeStr) {
    if (!timeStr) return '';
    let [hours, minutes] = timeStr.toString().split(':').map(Number);
    if (isNaN(hours)) return timeStr;
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = (minutes || 0).toString().padStart(2, '0');
    return `${formattedHours}:${formattedMinutes} ${period}`;
}

// Populate time select options (06:00 to 22:00 in 30-min intervals)
function populateTimeDropdowns() {
    const startSelect = document.getElementById('startTime');
    const endSelect = document.getElementById('endTime');

    if (!startSelect || !endSelect) return;

    startSelect.innerHTML = '';
    endSelect.innerHTML = '';

    for (let hour = 6; hour <= 22; hour++) {
        for (let min of [0, 30]) {
            if (hour === 22 && min === 30) break;

            const time24 = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const time12 = format12Hour(time24);

            // FIX: Removed 24-hour prefix so only clean 12-hour time shows in the dropdowns
            const opt1 = new Option(time12, time24);
            const opt2 = new Option(time12, time24);

            startSelect.add(opt1);
            endSelect.add(opt2);
        }
    }
}

// Helper to remove Saturday and Sunday checkboxes dynamically from the DOM
function removeWeekendCheckboxes() {
    document.querySelectorAll('.day-checkbox').forEach(cb => {
        const val = cb.value ? cb.value.toLowerCase() : '';
        if (val === 'saturday' || val === 'sunday' || val === 'sat' || val === 'sun') {
            const parentLabel = cb.closest('label') || cb.parentElement;
            if (parentLabel) {
                parentLabel.remove();
            } else {
                cb.remove();
            }
        }
    });
}

// Fetch existing teacher details to populate the edit form
async function loadTeacherToEdit() {
    if (!teacherId) {
        alert("No teacher ID specified!");
        window.location.href = "teacher-list.html";
        return;
    }

    populateTimeDropdowns();
    
    // FIX: Remove Saturday & Sunday checkboxes directly via JS
    removeWeekendCheckboxes();

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/shared/login.html';
        return;
    }

    const cacheBuster = `?_t=${Date.now()}`;
    const fetchEndpoints = [
        `/api/admin/teachers/${teacherId}${cacheBuster}`,
        `/api/teachers/${teacherId}${cacheBuster}`,
        `/api/admin/teachers${cacheBuster}`
    ];

    let teacher = null;

    for (const url of fetchEndpoints) {
        try {
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });

            if (res.ok) {
                const data = await res.json();
                
                if (Array.isArray(data)) {
                    teacher = data.find(t => (t.id || t.teacher_id || t._id) == teacherId);
                } else if (data.teacher || data.data) {
                    const item = data.teacher || data.data;
                    if (Array.isArray(item)) {
                        teacher = item.find(t => (t.id || t.teacher_id || t._id) == teacherId);
                    } else {
                        teacher = item;
                    }
                } else {
                    teacher = data;
                }

                if (teacher) break;
            }
        } catch (err) {
            console.warn(`Failed to fetch from ${url}:`, err);
        }
    }

    if (!teacher) {
        alert("Failed to load teacher details from server.");
        return;
    }

    // Populate input fields
    const firstName = teacher.first_name || teacher.firstName || (teacher.name ? teacher.name.split(' ')[0] : '');
    const lastName = teacher.last_name || teacher.lastName || (teacher.name ? teacher.name.split(' ').slice(1).join(' ') : '');
    
    document.getElementById('firstName').value = firstName;
    document.getElementById('lastName').value = lastName;
    document.getElementById('email').value = teacher.email || '';

    // Subjects field
    let subjects = teacher.subjects || teacher.subject_list || teacher.subject || [];
    if (typeof subjects === 'string') {
        try { subjects = JSON.parse(subjects); } catch { subjects = subjects.split(',').map(s => s.trim()); }
    }
    document.getElementById('subjects').value = Array.isArray(subjects) ? subjects.join(', ') : subjects;

    // Target Grade field
    document.getElementById('targetGrade').value = teacher.target_grade || teacher.targetGrade || teacher.gradeLevel || teacher.grade || '';

    // Check work day checkboxes
    let workDays = teacher.work_days || teacher.workDays || [];
    if (typeof workDays === 'string') {
        try { workDays = JSON.parse(workDays); } catch { workDays = workDays.split(',').map(d => d.trim()); }
    }
    document.querySelectorAll('.day-checkbox').forEach(cb => {
        cb.checked = workDays.includes(cb.value);
    });

    // Start / End time values
    const startTimeVal = teacher.start_time || teacher.startTime || '08:00';
    const endTimeVal = teacher.end_time || teacher.endTime || '16:00';

    if (document.getElementById('startTime')) document.getElementById('startTime').value = startTimeVal;
    if (document.getElementById('endTime')) document.getElementById('endTime').value = endTimeVal;
}

// Save form changes to backend
document.addEventListener('DOMContentLoaded', () => {
    loadTeacherToEdit();

    const formEl = document.getElementById('editTeacherForm');
    if (formEl) {
        formEl.addEventListener('submit', async (e) => {
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
                alert("Please select at least one work day.");
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerText = 'Save Changes';
                }
                return;
            }

            const firstNameVal = document.getElementById('firstName').value.trim();
            const lastNameVal = document.getElementById('lastName').value.trim();
            const fullNameVal = `${firstNameVal} ${lastNameVal}`.trim();
            const startVal = document.getElementById('startTime').value;
            const endVal = document.getElementById('endTime').value;
            const subjectsVal = document.getElementById('subjects').value;
            const subjectsArray = subjectsVal.split(',').map(s => s.trim()).filter(Boolean);
            const targetGradeVal = document.getElementById('targetGrade').value.trim();

            const shift12 = `${format12Hour(startVal)} - ${format12Hour(endVal)}`;

            const updatedPayload = {
                id: teacherId,
                teacher_id: teacherId,
                firstName: firstNameVal,
                first_name: firstNameVal,
                lastName: lastNameVal,
                last_name: lastNameVal,
                name: fullNameVal,
                fullName: fullNameVal,
                email: document.getElementById('email').value.trim(),
                subjects: subjectsArray,
                subject_list: subjectsArray,
                targetGrade: targetGradeVal,
                target_grade: targetGradeVal,
                workDays: selectedDays,
                work_days: selectedDays,
                startTime: startVal,
                start_time: startVal,
                endTime: endVal,
                end_time: endVal,
                shift: shift12,
                availability: shift12
            };

            const token = localStorage.getItem('token');

            // Sequential HTTP methods and paths to guarantee backend hit
            const saveEndpoints = [
                { url: `/api/admin/teachers/${teacherId}`, method: 'PUT' },
                { url: `/api/admin/teachers/${teacherId}`, method: 'PATCH' },
                { url: `/api/teachers/${teacherId}`, method: 'PUT' },
                { url: `/api/teachers/${teacherId}`, method: 'PATCH' },
                { url: `/api/admin/teachers`, method: 'PUT' },
                { url: `/api/admin/teachers`, method: 'POST' }
            ];

            let savedSuccessfully = false;

            for (const ep of saveEndpoints) {
                try {
                    const res = await fetch(ep.url, {
                        method: ep.method,
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(updatedPayload)
                    });

                    if (res.ok) {
                        savedSuccessfully = true;
                        console.log(`✅ Teacher updated successfully using ${ep.method} ${ep.url}`);
                        break;
                    }
                } catch (err) {
                    console.warn(`Attempt failed on ${ep.method} ${ep.url}:`, err);
                }
            }

            if (savedSuccessfully) {
                alert("Teacher profile saved successfully!");
                window.location.href = "teacher-list.html";
            } else {
                alert("Failed to save teacher. Server endpoint returned an error.");
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerText = 'Save Changes';
                }
            }
        });
    }
});