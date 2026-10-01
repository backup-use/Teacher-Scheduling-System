document.addEventListener('DOMContentLoaded', () => {
    // ═══ Session Protection ═══
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName');

    if (!token || role !== 'teacher') {
        alert('Unauthorized access! Redirecting to login.');
        window.location.href = '/index.html';
        return;
    }

    let allStudents = [];
    let allSections = [];

    // ═══════════════════════════════════════════════════════
    // ═══ LOAD SECTIONS + STUDENTS ═══
    // ═══════════════════════════════════════════════════════
    async function loadSections() {
        const container = document.getElementById('sections-container');
        try {
            const response = await fetch('/api/teacher/students', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch sections.');

            const data = await response.json();
            allStudents = data.students || [];
            allSections = data.sections || [];

            renderSections();
            populateSectionDropdown();

        } catch (error) {
            console.error('Error loading sections:', error);
            container.innerHTML = `<p style="color: #ff5252;">⚠️ Failed to load sections.</p>`;
        }
    }

    // ═══════════════════════════════════════════════════════
    // ═══ RENDER SECTION CARDS ═══
    // ═══════════════════════════════════════════════════════
    function renderSections() {
        const container = document.getElementById('sections-container');
        container.innerHTML = '';

        if (allSections.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    <h3>No Sections Assigned</h3>
                    <p>You don't have any sections assigned yet. Please contact the admin.</p>
                </div>
            `;
            return;
        }

        const studentsBySection = {};
        allSections.forEach(section => {
            studentsBySection[section] = [];
        });
        allStudents.forEach(student => {
            if (!studentsBySection[student.section_name]) {
                studentsBySection[student.section_name] = [];
            }
            studentsBySection[student.section_name].push(student);
        });

        allSections.forEach(sectionName => {
            const students = studentsBySection[sectionName] || [];
            const activeCount = students.filter(s => s.status === 'active').length;
            const droppedCount = students.filter(s => s.status !== 'active').length;

            const card = document.createElement('div');
            card.className = 'section-card';
            card.innerHTML = `
                <div class="section-header">
                    <div class="section-title-row">
                        <h2 class="section-title">📁 ${escapeHtml(sectionName)}</h2>
                        <span class="section-badge">👥 ${activeCount} Active</span>
                        ${droppedCount > 0 ? `<span class="section-badge dropped">⚪ ${droppedCount} Dropped</span>` : ''}
                    </div>
                </div>
                <div class="section-body">
                    ${students.length === 0 ? `
                        <div class="no-students">
                            <p>No students in this section yet.</p>
                            <button class="btn-small btn-add-inline" onclick="window.openAddModal('${escapeHtml(sectionName)}')">➕ Add First Student</button>
                        </div>
                    ` : `
                        <div class="student-list">
                            ${students.map(student => renderStudentRow(student, sectionName)).join('')}
                        </div>
                    `}
                </div>
            `;
            container.appendChild(card);
        });
    }

    function renderStudentRow(student, sectionName) {
        const isActive = student.status === 'active';
        return `
            <div class="student-row ${isActive ? '' : 'student-dropped'}" data-student-id="${student.id}">
                <div class="student-info">
                    <div class="student-name">${escapeHtml(student.name)}</div>
                    <div class="student-meta">
                        ${student.student_id ? `🎓 ${escapeHtml(student.student_id)}` : '🎓 No ID'}
                        ${student.notes ? ` · 📝 ${escapeHtml(student.notes)}` : ''}
                    </div>
                </div>
                <div class="student-actions">
                    <span class="status-badge ${isActive ? 'active' : 'dropped'}">
                        ${isActive ? '✅ Active' : '⚪ Dropped'}
                    </span>
                    <button class="btn-icon" onclick="window.toggleStudentStatus(${student.id}, '${isActive ? 'dropped' : 'active'}')" title="${isActive ? 'Hide (Mark as Dropped)' : 'Show (Reactivate)'}">
                        ${isActive ? '👁️' : '🔙'}
                    </button>
                    <button class="btn-icon btn-danger" onclick="window.deleteStudent(${student.id}, '${escapeHtml(student.name)}')" title="Delete permanently">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════
    // ═══ ACTIONS ═══
    // ═══════════════════════════════════════════════════════
    window.toggleStudentStatus = async function(studentId, newStatus) {
        try {
            const response = await fetch(`/api/teacher/students/${studentId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (!response.ok) throw new Error('Update failed.');

            showToast(`✅ Student ${newStatus === 'active' ? 'reactivated' : 'marked as dropped'}`, 'success');
            loadSections();
        } catch (error) {
            console.error('Toggle error:', error);
            showToast('❌ Failed to update student', 'error');
        }
    };

    window.deleteStudent = async function(studentId, studentName) {
        if (!confirm(`Delete "${studentName}" permanently?\n\nIf student just transferred, use "Hide" instead.`)) return;

        try {
            const response = await fetch(`/api/teacher/students/${studentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Delete failed.');

            showToast(`🗑️ Student deleted`, 'success');
            loadSections();
        } catch (error) {
            console.error('Delete error:', error);
            showToast('❌ Failed to delete student', 'error');
        }
    };

    // ═══════════════════════════════════════════════════════
    // ═══ ADD STUDENT MODAL ═══
    // ═══════════════════════════════════════════════════════
    window.openAddModal = function(preselectedSection = null) {
        const modal = document.getElementById('add-student-modal');
        modal.classList.add('active');

        document.getElementById('add-student-name').value = '';
        document.getElementById('add-student-id').value = '';
        document.getElementById('add-student-notes').value = '';

        if (preselectedSection) {
            document.getElementById('add-student-section').value = preselectedSection;
        } else {
            document.getElementById('add-student-section').value = '';
        }

        document.getElementById('add-student-name').focus();
    };

    function closeAddModal() {
        document.getElementById('add-student-modal').classList.remove('active');
    }

    function populateSectionDropdown() {
        const select = document.getElementById('add-student-section');
        select.innerHTML = '<option value="">-- Select Section --</option>';
        allSections.forEach(section => {
            const opt = document.createElement('option');
            opt.value = section;
            opt.textContent = section;
            select.appendChild(opt);
        });
    }

    async function submitAddStudent() {
        const name = document.getElementById('add-student-name').value.trim();
        const section = document.getElementById('add-student-section').value.trim();
        const studentId = document.getElementById('add-student-id').value.trim();
        const notes = document.getElementById('add-student-notes').value.trim();

        if (!name || !section) {
            showToast('⚠️ Please fill in Student Name and Section', 'error');
            return;
        }

        const btn = document.getElementById('btn-confirm-add');
        btn.disabled = true;
        btn.textContent = 'Adding...';

        try {
            const response = await fetch('/api/teacher/students', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    section_name: section,
                    student_id: studentId || null,
                    notes: notes || null
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Add failed.');
            }

            showToast(`✅ Added ${name} to ${section}`, 'success');
            closeAddModal();
            loadSections();
        } catch (error) {
            console.error('Add error:', error);
            showToast(`❌ ${error.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Add Student';
        }
    }

    // ═══════════════════════════════════════════════════════
    // ═══ TOAST ═══
    // ═══════════════════════════════════════════════════════
    function showToast(message, type = 'success') {
        let toast = document.getElementById('cohort-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cohort-toast';
            toast.style.cssText = `
                position: fixed; bottom: 30px; right: 30px; padding: 14px 22px;
                border-radius: 10px; font-weight: 600; font-size: 0.9rem;
                z-index: 99999; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                transition: all 0.3s ease; max-width: 420px;
                font-family: 'Segoe UI', sans-serif;
            `;
            document.body.appendChild(toast);
        }
        toast.style.background = type === 'success' ? 'rgba(0, 188, 212, 0.95)' : 'rgba(255, 95, 95, 0.95)';
        toast.style.color = type === 'success' ? '#000' : '#fff';
        toast.textContent = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(30px)';
        }, 3000);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ═══════════════════════════════════════════════════════
    // ═══ EVENT LISTENERS ═══
    // ═══════════════════════════════════════════════════════
    document.getElementById('btn-add-student').addEventListener('click', () => window.openAddModal());
    document.getElementById('btn-close-add-modal').addEventListener('click', closeAddModal);
    document.getElementById('btn-cancel-add').addEventListener('click', closeAddModal);
    document.getElementById('btn-confirm-add').addEventListener('click', submitAddStudent);

    document.getElementById('add-student-modal').addEventListener('click', (e) => {
        if (e.target.id === 'add-student-modal') closeAddModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAddModal();
    });

    loadSections();
});