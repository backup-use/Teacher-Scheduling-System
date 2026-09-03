// 1️⃣ EXTRACT TEACHER ID FROM URL QUERY PARAMETER
const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

console.log("🔍 URL Query Parameter Detected ID:", teacherId);

if (!teacherId) {
    alert("Invalid Access: Teacher ID is missing from the browser URL path.");
    window.location.href = "teacher-list.html";
}

// 2️⃣ FETCH & PRE-FILL TEACHER PROFILE DATA
async function loadTeacherProfile() {
    try {
        console.log("🌐 Initiating fetch request to secure API server context...");
        
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const res = await fetch(`/api/admin/teachers`, { headers });
        if (!res.ok) throw new Error(`HTTP network error status: ${res.status}`);
        
        const rawData = await res.json();
        const teachersList = Array.isArray(rawData) ? rawData : (rawData.teachers || rawData.data || []);
        
        console.log("📦 Total Teacher Array List fetched from database:", teachersList);
        
        const teacher = teachersList.find(t => {
            const dbId = t.id || t._id;
            return dbId == teacherId || String(dbId).trim() === String(teacherId).trim();
        });

        if (!teacher) {
            console.error(`❌ Data Match Failure: ID [${teacherId}] could not be found.`);
            alert("Teacher record match failed. Redirecting to table list.");
            window.location.href = "teacher-list.html";
            return;
        }

        console.log("✅ Successfully matched teacher dataset record payload:", teacher);

        // Smart name extraction (Handles split names vs full string name)
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

        if ((!extractedStart || !extractedEnd) && teacher.shift) {
            const parsedShift = teacher.shift.split('-');
            if (parsedShift.length === 2) {
                extractedStart = parsedShift[0].trim();
                extractedEnd = parsedShift[1].trim();
            }
        }

        document.getElementById('startTime').value = extractedStart || '08:00 am';
        document.getElementById('endTime').value = extractedEnd || '04:00 pm';

        // Pre-select work days with case-insensitive matching
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

        console.log("🎉 UI Form elements fully rendered and populated successfully.");

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
    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving...';

    const selectedDays = [];
    document.querySelectorAll('.day-checkbox:checked').forEach(cb => {
        selectedDays.push(cb.value);
    });

    if (selectedDays.length === 0) {
        alert("Please pick at least one available day configuration.");
        saveBtn.disabled = false;
        saveBtn.innerText = 'Save Changes';
        return;
    }

    const firstNameVal = document.getElementById('firstName').value.trim();
    const lastNameVal = document.getElementById('lastName').value.trim();
    const fullNameVal = `${firstNameVal} ${lastNameVal}`.trim();
    const startVal = document.getElementById('startTime').value.trim();
    const endVal = document.getElementById('endTime').value.trim();
    const targetGradeVal = document.getElementById('targetGrade').value.trim();
    const subjectsArray = document.getElementById('subjects').value
        .split(',')
        .map(s => s.trim())
        .filter(s => s !== "");

    // Multi-schema compatibility payload
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
        startTime: startVal,
        start_time: startVal,
        endTime: endVal,
        end_time: endVal,
        shift: `${startVal} - ${endVal}`
    };

    try {
        const response = await fetch(`/api/admin/teachers/${teacherId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedPayload)
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok) {
            alert("Teacher data rewritten successfully!");
            window.location.href = "teacher-list.html";
        } else {
            alert("Database Rejected: " + (result.error || result.message || "Validation error block."));
            saveBtn.disabled = false;
            saveBtn.innerText = 'Save Changes';
        }
    } catch (err) {
        console.error("Network upload pipeline crashed:", err);
        alert("Transmission Failure: Server connection lost.");
        saveBtn.disabled = false;
        saveBtn.innerText = 'Save Changes';
    }
});