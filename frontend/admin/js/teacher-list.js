document.addEventListener('DOMContentLoaded', loadTeacherData);

async function loadTeacherData() {
    const tbody = document.getElementById('teacher-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:50px; color:#00d2ff;">SYNCHRONIZING...</td></tr>';

    try {
        const response = await fetch('/api/admin/teachers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const teachers = await response.json();

        if (!teachers || teachers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#a0a0c0;">No records found.</td></tr>';
            return;
        }

        tbody.innerHTML = teachers.map(teacher => {
            const teacherId = teacher.id || teacher._id;

            const gradeDisplay = teacher.targetGrade 
                ? `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: 500;">📌 ${teacher.targetGrade}</span>` 
                : `<span style="color: rgba(255,255,255,0.25); font-style: italic; font-size: 0.85rem;">-- Unassigned --</span>`;

            // Ligtas na pag-render ng Subjects array
            const subjectsList = Array.isArray(teacher.subjects) ? teacher.subjects : [];
            const subjectsHTML = subjectsList.map(sub => `<span class="subject-badge">${sub}</span>`).join('');

            // Ligtas na pag-render ng Work Days list
            const daysDisplay = Array.isArray(teacher.workDays) ? teacher.workDays.join(', ') : (teacher.workDays || '--');

            // 🕒 Ligtas na pagkuha ng shift string format
            let timeShiftDisplay = "08:00 - 16:00"; // Fallback default
            if (teacher.startTime && teacher.endTime) {
                timeShiftDisplay = `${teacher.startTime} - ${teacher.endTime}`;
            } else if (teacher.shift) {
                timeShiftDisplay = teacher.shift; // Direktang gamitin ang data field string format
            }

            return `
                <tr>
                    <td style="font-weight: 600; color: #fff;">${teacher.firstName || ''} ${teacher.lastName || ''}</td>
                    <td style="color: #a0a0c0;">${teacher.email || ''}</td>
                    <td>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                            ${subjectsHTML}
                        </div>
                    </td>
                    <td>${gradeDisplay}</td>
                    <td style="font-size: 0.85rem;">${daysDisplay}</td>
                    <td style="text-align: center;">
                        <span style="color: #00d2ff; font-family: monospace; font-size: 1.15rem; font-weight: 800; text-shadow: 0 0 8px rgba(0,210,255,0.3);">
                            ${timeShiftDisplay}
                        </span>
                    </td>
                    <td style="text-align: center;">
                        <a href="edit-teacher.html?id=${teacherId}" class="btn-edit-action" style="background: none; border: none; cursor: pointer; text-decoration: none; display: inline-block; margin-right: 8px; font-size: 1.1rem;" title="Edit Teacher"> ✏️ </a>
                        <button class="btn-delete" onclick="removeTeacher('${teacherId}', this)">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error("Fetch error:", error);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#ff5f5f;">⚠️ Connection Failed.</td></tr>';
    }
}

// Mananatili ang removeTeacher function sa ibaba...
async function removeTeacher(id, button) {
    if (!confirm("Are you sure? This will permanently delete the teacher from db.json.")) return;
    try {
        const response = await fetch(`/api/admin/teachers/${id}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });
        const result = await response.json();
        if (response.ok && result.success) {
            const row = button.closest('tr');
            row.style.opacity = '0';
            row.style.transform = 'translateX(20px)';
            row.style.transition = '0.4s';
            setTimeout(() => { row.remove(); }, 400);
        } else {
            alert("Server Error: " + (result.error || "Failed to delete from database."));
        }
    } catch (err) {
        console.error("Delete Error:", err);
        alert("System error: Could not reach the server.");
    }
}