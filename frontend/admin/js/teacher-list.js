document.addEventListener('DOMContentLoaded', loadTeacherData);

// Helper function to convert 24-hour time string (e.g. "16:00") to 12-hour format (e.g. "04:00 PM")
function convertTo12Hour(timeStr) {
    if (!timeStr) return '';
    let [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(hours)) return timeStr;

    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; // Convert 0 -> 12 (Midnight) and 12 -> 12 (Noon)

    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = (minutes || 0).toString().padStart(2, '0');

    return `${formattedHours}:${formattedMinutes} ${period}`;
}

async function loadTeacherData() {
    const tbody = document.getElementById('teacher-table-body');
    if (!tbody) {
        console.error('Teacher table body not found');
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:50px; color:#00d2ff;">📚 LOADING TEACHERS...</td></tr>';

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No token found, redirecting to login...');
            window.location.href = '/shared/login.html';
            return;
        }

        // 🛠️ FIX 1: Primary at Fallback Routes kung sakaling iba ang API pattern sa Express backend
        const endpointsToTry = [
            '/api/admin/teachers',
            '/api/teachers',
            '/api/admin/teacher-list'
        ];

        let response = null;
        let lastStatus = 404;

        for (const endpoint of endpointsToTry) {
            try {
                const res = await fetch(endpoint, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (res.ok) {
                    response = res;
                    break; // Nahanap ang tamang endpoint!
                } else {
                    lastStatus = res.status;
                }
            } catch (err) {
                console.warn(`Attempt failed for ${endpoint}:`, err);
            }
        }

        if (!response) {
            throw new Error(`HTTP error! status: ${lastStatus} (Route Not Found)`);
        }

        const teachers = await response.json();
        console.log('Loaded teachers:', teachers);

        if (!teachers || teachers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:40px; color:#a0a0c0;">
                        <div style="font-size: 3rem; margin-bottom: 10px;">👨‍🏫</div>
                        <div>No teachers found. Click "Teachers" to add one.</div>
                    </td>
                </tr>
            `;
            return;
        }

        // Build table rows
        let tableHTML = '';
        teachers.forEach(teacher => {
            const teacherId = teacher.id || teacher.teacher_id || teacher._id || '';
            
            const firstName = teacher.first_name || teacher.firstName || '';
            const lastName = teacher.last_name || teacher.lastName || '';
            const fullName = `${firstName} ${lastName}`.trim() || teacher.name || 'Unknown Teacher';
            
            const email = teacher.email || 'No email';
            
            // Subjects array parsing
            let subjectsList = [];
            if (teacher.subjects) {
                if (Array.isArray(teacher.subjects)) {
                    subjectsList = teacher.subjects;
                } else if (typeof teacher.subjects === 'string') {
                    try {
                        subjectsList = JSON.parse(teacher.subjects);
                    } catch {
                        subjectsList = [teacher.subjects];
                    }
                }
            }
            
            // Grade parsing
            const targetGrade = teacher.target_grade || teacher.grade || '';
            const gradeDisplay = targetGrade 
                ? `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.2); padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 500;">📌 ${targetGrade}</span>` 
                : `<span style="color: rgba(255,255,255,0.3); font-style: italic; font-size: 0.85rem;">-- Unassigned --</span>`;
            
            // Work days parsing
            let workDays = [];
            if (teacher.work_days || teacher.workDays) {
                const daysData = teacher.work_days || teacher.workDays;
                if (Array.isArray(daysData)) {
                    workDays = daysData;
                } else if (typeof daysData === 'string') {
                    try {
                        workDays = JSON.parse(daysData);
                    } catch {
                        workDays = [daysData];
                    }
                }
            }
            const daysDisplay = workDays.length > 0 ? workDays.join(', ') : '--';
            
            // Time parsing & 12-hour AM/PM Conversion
            let startTime = teacher.start_time || teacher.startTime || '08:00';
            let endTime = teacher.end_time || teacher.endTime || '16:00';
            
            startTime = startTime.length > 5 ? startTime.substring(0, 5) : startTime;
            endTime = endTime.length > 5 ? endTime.substring(0, 5) : endTime;
            
            const timeShiftDisplay = `${convertTo12Hour(startTime)} - ${convertTo12Hour(endTime)}`;

            // Build subjects badges
            const subjectsHTML = subjectsList.length > 0 
                ? subjectsList.map(sub => `<span class="subject-badge" style="background: rgba(0, 210, 255, 0.1); color: #00d2ff; padding: 4px 10px; border-radius: 12px; font-size: 0.8rem; border: 1px solid rgba(0, 210, 255, 0.2); margin-right: 4px;">${sub}</span>`).join('')
                : `<span style="color: rgba(255,255,255,0.3); font-style: italic; font-size: 0.85rem;">No subjects</span>`;

            tableHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.3s;" 
                    onmouseover="this.style.background='rgba(255,255,255,0.03)'" 
                    onmouseout="this.style.background='transparent'">
                    <td style="padding: 14px 12px; font-weight: 600; color: #fff;">${fullName}</td>
                    <td style="padding: 14px 12px; color: #a0a0c0; font-size: 0.9rem;">${email}</td>
                    <td style="padding: 14px 12px;">
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            ${subjectsHTML}
                        </div>
                    </td>
                    <td style="padding: 14px 12px;">${gradeDisplay}</td>
                    <td style="padding: 14px 12px; font-size: 0.85rem; color: #a0a0c0;">${daysDisplay}</td>
                    <td style="padding: 14px 12px; text-align: center;">
                        <span style="color: #00d2ff; font-family: monospace; font-size: 0.85rem; font-weight: 600; background: rgba(0,210,255,0.1); padding: 4px 10px; border-radius: 12px; white-space: nowrap;">
                            ${timeShiftDisplay}
                        </span>
                    </td>
                    <td style="padding: 14px 12px; text-align: center;">
                        <button onclick="editTeacher('${teacherId}')" 
                                style="background: none; border: none; cursor: pointer; font-size: 1.1rem; margin-right: 8px; transition: transform 0.2s;"
                                onmouseover="this.style.transform='scale(1.2)'"
                                onmouseout="this.style.transform='scale(1)'"
                                title="Edit Teacher">
                            ✏️
                        </button>
                        <button onclick="removeTeacher('${teacherId}', this)" 
                                style="background: none; border: none; cursor: pointer; font-size: 1.1rem; transition: transform 0.2s;"
                                onmouseover="this.style.transform='scale(1.2)'"
                                onmouseout="this.style.transform='scale(1)'"
                                title="Delete Teacher">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = tableHTML;

    } catch (error) {
        console.error("Fetch error:", error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:40px; color:#ff5f5f;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">⚠️</div>
                    <div>Failed to load teachers. Please check backend routes.</div>
                    <div style="font-size: 0.8rem; margin-top: 8px; color: #a0a0c0;">${error.message}</div>
                </td>
            </tr>
        `;
    }
}

// Edit teacher function
async function editTeacher(id) {
    if (!id) {
        alert('Invalid teacher ID');
        return;
    }
    window.location.href = `edit-teacher.html?id=${id}`;
}

// Delete teacher function
async function removeTeacher(id, button) {
    if (!id) {
        alert('Invalid teacher ID');
        return;
    }
    
    if (!confirm("⚠️ Are you sure you want to delete this teacher?\nThis action cannot be undone!")) {
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('Please login first');
            window.location.href = '/shared/login.html';
            return;
        }

        const response = await fetch(`/api/admin/teachers/${id}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const row = button.closest('tr');
            if (row) {
                row.style.opacity = '0';
                row.style.transform = 'translateX(30px)';
                row.style.transition = 'all 0.4s ease';
                setTimeout(() => {
                    row.remove();
                    const tbody = document.getElementById('teacher-table-body');
                    if (tbody && tbody.children.length === 0) {
                        tbody.innerHTML = `
                            <tr>
                                <td colspan="7" style="text-align:center; padding:40px; color:#a0a0c0;">
                                    <div style="font-size: 3rem; margin-bottom: 10px;">👨‍🏫</div>
                                    <div>No teachers found. Click "Teachers" to add one.</div>
                                </td>
                            </tr>
                        `;
                    }
                }, 400);
                
                showToast('✅ Teacher deleted successfully!', 'success');
            }
        } else {
            alert("❌ Server Error: " + (result.error || "Failed to delete teacher."));
        }
    } catch (err) {
        console.error("Delete Error:", err);
        alert("❌ System error: Could not reach the server.\n\n" + err.message);
    }
}

// Toast notification function
function showToast(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.position = 'fixed';
        toast.style.bottom = '30px';
        toast.style.right = '30px';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.fontWeight = '500';
        toast.style.fontSize = '0.9rem';
        toast.style.zIndex = '9999';
        toast.style.boxShadow = '0 6px 24px rgba(0,0,0,0.5)';
        toast.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)';
        toast.style.background = type === 'success' ? 'rgba(0, 210, 255, 0.95)' : 'rgba(255, 95, 95, 0.95)';
        toast.style.color = type === 'success' ? '#000' : '#fff';
        toast.style.border = type === 'success' ? '1px solid #00d2ff' : '1px solid #ff5f5f';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(30px)';
    }, 3000);
}

// Logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/shared/login.html';
}

// Keyboard shortcut for refresh
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        loadTeacherData();
    }
});