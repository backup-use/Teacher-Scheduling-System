// 1️⃣ KUNIN ANG TEACHER ID MULA SA URL PARAMETER
const urlParams = new URLSearchParams(window.location.search);
const teacherId = urlParams.get('id');

console.log("🔍 URL Query Parameter Detected ID:", teacherId);

if (!teacherId) {
    alert("Invalid Access: Teacher ID is missing from the browser URL path.");
    window.location.href = "teacher-list.html";
}

// 2️⃣ I-FETCH AT I-PRE-FILL ANG DETALYE NG GURO (MATALINONG PAGHAHANAP)
async function loadTeacherProfile() {
    try {
        console.log("🌐 Initiating fetch request to secure API server context...");
        const response = await fetch(`/api/admin/teachers`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        
        if (!response.ok) throw new Error(`HTTP network error status: ${response.status}`);
        
        const teachers = await response.json();
        console.log("📦 Total Teacher Array List fetched from database:", teachers);
        
        // 🛠️ MATALINONG PAGHAHANAP (Loose comparison at fallback string testing)
        const teacher = teachers.find(t => {
            const currentDbId = t.id || t._id;
            // Gagamit tayo ng double equals (==) para hindi sumablay kung String vs Number ang datatype discrepancy
            return currentDbId == teacherId || String(currentDbId).trim() === String(teacherId).trim();
        });

        if (!teacher) {
            console.error(`❌ Data Match Failure: ID [${teacherId}] could not be found inside the fetched array records.`);
            alert("Teacher record match failed. Redirecting to table list.");
            window.location.href = "teacher-list.html";
            return;
        }

        console.log("✅ Successfully matched teacher dataset record payload:", teacher);

        // Ligtas at Direktang Pag-assign sa UI Inputs Panel
        document.getElementById('firstName').value = teacher.firstName || '';
        document.getElementById('lastName').value = teacher.lastName || '';
        document.getElementById('email').value = teacher.email || '';
        document.getElementById('targetGrade').value = teacher.targetGrade || '';
        
        // Pag-aayos ng display area para sa mga nakatalagang Subjects
        if (Array.isArray(teacher.subjects)) {
            document.getElementById('subjects').value = teacher.subjects.join(', ');
        } else {
            document.getElementById('subjects').value = teacher.subjects || '';
        }
        
        // 🕒 AUTOMATED SHIFT STRING PARSING CONFIGURATION
        let extractedStart = teacher.startTime || '';
        let extractedEnd = teacher.endTime || '';

        // Fallback structure check kung nakaimbak ito sa column field na 'shift'
        if ((!extractedStart || !extractedEnd) && teacher.shift) {
            const parsedShift = teacher.shift.split('-');
            if (parsedShift.length === 2) {
                extractedStart = parsedShift[0].trim();
                extractedEnd = parsedShift[1].trim();
            }
        }

        // Ilagay ang values sa time inputs (o default kapag walang nakitang data record)
        document.getElementById('startTime').value = extractedStart || '08:00 am';
        document.getElementById('endTime').value = extractedEnd || '04:00 pm';

        // 📅 AUTO-CHECK NG MGA ARAW NG TRABAHO (WORK DAYS)
        if (teacher.workDays) {
            const activeDays = Array.isArray(teacher.workDays) 
                ? teacher.workDays 
                : teacher.workDays.split(',').map(d => d.trim());

            const checkboxes = document.querySelectorAll('.day-checkbox');
            checkboxes.forEach(cb => {
                if (activeDays.includes(cb.value)) {
                    cb.checked = true;
                }
            });
        }

        console.log("🎉 UI Form elements fully rendered and populated successfully.");

    } catch (err) {
        console.error("💥 Critical error triggered inside the script lifecycle:", err);
        alert("API Error: Cannot read database context fields. Open your F12 browser console tab.");
    }
}

// Patakbuhin ang interface renderer routine loop
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTeacherProfile);
} else {
    loadTeacherProfile();
}

// 3️⃣ PAGpapadala NG INPUT DATA KAPAG PININDOT ANG SAVE CHANGES
document.getElementById('editTeacherForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedDays = [];
    document.querySelectorAll('.day-checkbox:checked').forEach(cb => {
        selectedDays.push(cb.value);
    });

    if (selectedDays.length === 0) {
        alert("Please pick at least one available day configuration.");
        return;
    }

    const startVal = document.getElementById('startTime').value.trim();
    const endVal = document.getElementById('endTime').value.trim();

    const updatedPayload = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        email: document.getElementById('email').value.trim(),
        subjects: document.getElementById('subjects').value.split(',').map(s => s.trim()).filter(s => s !== ""),
        targetGrade: document.getElementById('targetGrade').value.trim(),
        workDays: selectedDays,
        startTime: startVal,
        endTime: endVal,
        shift: `${startVal} - ${endVal}` // Double-compatibility format para sa 'shift' data grid matrix table natin
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

        const result = await response.json();

        if (response.ok) {
            alert("Teacher data node rewritten successfully!");
            window.location.href = "teacher-list.html";
        } else {
            alert("Database Rejected: " + (result.error || "Validation error block."));
        }
    } catch (err) {
        console.error("Network upload pipeline crashed:", err);
        alert("Transmission Failure: Server connection lost.");
    }
});