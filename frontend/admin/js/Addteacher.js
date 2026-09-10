let rawPartitions = { junior: [], grade11: [], grade12: [] };
let catalogSubjects = [];
let selectedSubjectsArray = [];
let existingTeachers = []; // Store existing teachers to check for duplicates

document.addEventListener('DOMContentLoaded', () => {
    // Replace time inputs with standard single 12-hour dropdowns
    replaceTimeInputsWithChoices();

    // Remove Saturday and Sunday checkboxes from DOM
    removeWeekendCheckboxes();

    // 1. Sidebar Navigation handlers
    document.querySelectorAll('.nav-links-wrapper .nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const href = btn.getAttribute('data-href');
            if (href) window.location.href = href;
        });
    });

    // 2. Fetch catalog subjects and existing teachers
    fetchCatalogSubjects();
    fetchExistingTeachers();
    setupSubjectCombobox();

    // 3. Listen for Grade Level selection changes to filter subjects
    const gradeSelect = document.getElementById('t-targetgrade');
    if (gradeSelect) {
        gradeSelect.addEventListener('change', handleGradeLevelChange);
    }

    // 4. Form Submit Listener
    const form = document.getElementById('teacher-form');
    if (form) form.addEventListener('submit', handleFormSubmit);

    // 5. Generator button listener
    const genBtn = document.getElementById('btn-run-generator');
    if (genBtn) genBtn.addEventListener('click', triggerAutoSchedule);
});

/**
 * Dynamically removes Saturday and Sunday checkboxes
 */
function removeWeekendCheckboxes() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const val = (cb.value || cb.id || '').toLowerCase();
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

/**
 * Format 24-hour HH:MM string to standard 12-hour string (e.g. "08:00 AM")
 */
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

/**
 * Dynamically replaces native time inputs with clean standard 12-hour <select> dropdowns
 */
function replaceTimeInputsWithChoices() {
    const startInput = document.getElementById('t-start');
    const endInput = document.getElementById('t-end');

    if (startInput) createSingleTimeSelect(startInput, 'start', '08:00');
    if (endInput) createSingleTimeSelect(endInput, 'end', '16:00');
}

function createSingleTimeSelect(originalInput, type, defaultValue) {
    const select = document.createElement('select');
    select.id = `t-${type}-select`;
    select.className = 'custom-time-select';

    for (let hour = 6; hour <= 22; hour++) {
        for (let min of [0, 30]) {
            if (hour === 22 && min === 30) break;

            const time24 = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const time12 = format12Hour(time24);

            const opt = new Option(time12, time24);
            if (time24 === defaultValue) opt.selected = true;
            select.add(opt);
        }
    }

    if (!document.getElementById('custom-time-select-style')) {
        const style = document.createElement('style');
        style.id = 'custom-time-select-style';
        style.textContent = `
            .custom-time-select {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                color: #00d2ff;
                font-weight: 600;
                font-size: 0.95rem;
                padding: 6px 12px;
                cursor: pointer;
                outline: none;
            }
            .custom-time-select option {
                background: #121420;
                color: #fff;
            }
        `;
        document.head.appendChild(style);
    }

    originalInput.parentNode.replaceChild(select, originalInput);
}

/**
 * Converts selected dropdown choice to 24-hour time format (HH:MM)
 */
function getSelected24HourTime(type) {
    const select = document.getElementById(`t-${type}-select`);
    if (select && select.value) {
        return select.value;
    }
    return type === 'start' ? '08:00' : '16:00';
}

// --- Fetch Existing Teachers to Check Duplicates ---
async function fetchExistingTeachers() {
    try {
        const res = await fetch('/api/admin/teachers', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
            existingTeachers = await res.json();
        }
    } catch (err) {
        console.error("Failed to fetch existing teachers list for validation:", err);
    }
}

// --- Subject Dynamic Grade Filtering Logic ---
async function fetchCatalogSubjects() {
    const listContainer = document.getElementById('subject-checkbox-list');
    if (!listContainer) return;

    try {
        const res = await fetch('/api/admin/subjects', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        rawPartitions = await res.json();

        // Default to loading all subjects into catalog until grade is selected
        updateCatalogByGrade('');

    } catch (err) {
        console.error("Failed to fetch subjects:", err);
        listContainer.innerHTML = `<div style="color: #ff5f5f; padding: 4px; font-size: 0.85rem;">Failed to load subjects list.</div>`;
    }
}

function handleGradeLevelChange(e) {
    const selectedGrade = e.target.value;

    // Reset current subject selections when target grade changes
    selectedSubjectsArray = [];
    const input = document.getElementById('t-subjects');
    if (input) input.value = '';

    // Filter catalog list based on grade group
    updateCatalogByGrade(selectedGrade);

    // Show top toast feedback
    showTopToast(`Subjects filtered for ${selectedGrade}`, 'success');
}

function updateCatalogByGrade(grade) {
    let rawList = [];

    if (['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].includes(grade)) {
        rawList = rawPartitions.junior || [];
    } else if (grade === 'Grade 11') {
        rawList = rawPartitions.grade11 || [];
    } else if (grade === 'Grade 12') {
        rawList = rawPartitions.grade12 || [];
    } else {
        // Fallback: Combine all subjects if no grade is selected yet
        rawList = [
            ...(rawPartitions.junior || []),
            ...(rawPartitions.grade11 || []),
            ...(rawPartitions.grade12 || [])
        ];
    }

    // Deduplicate array by subject name
    const uniqueMap = new Map();
    rawList.forEach(s => {
        if (s && s.name) {
            uniqueMap.set(s.name.toLowerCase().trim(), s.name);
        }
    });

    catalogSubjects = Array.from(uniqueMap.values());
    renderSubjectList(catalogSubjects);
}

// --- Subject Dropdown & Typing Logic ---
function setupSubjectCombobox() {
    const input = document.getElementById('t-subjects');
    const menu = document.getElementById('subject-checkbox-menu');
    const arrow = document.getElementById('dropdown-arrow');

    if (!input || !menu) return;

    const openMenu = () => {
        menu.style.display = 'block';
        renderSubjectList(catalogSubjects); 
    };

    const closeMenu = () => {
        menu.style.display = 'none';
    };

    if (arrow) {
        arrow.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.style.display === 'block') {
                closeMenu();
            } else {
                openMenu();
            }
        });
    }

    input.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu();
    });

    input.addEventListener('input', () => {
        menu.style.display = 'block';
        filterSubjectList(input.value);
    });

    document.addEventListener('click', (e) => {
        const parentGroup = input.closest('.input-group');
        if (parentGroup && !parentGroup.contains(e.target)) {
            closeMenu();
        }
    });

    menu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

function renderSubjectList(list) {
    const listContainer = document.getElementById('subject-checkbox-list');
    if (!listContainer) return;

    if (list.length === 0) {
        listContainer.innerHTML = `<div style="color: #a0a0c0; padding: 6px; font-size: 0.85rem;">No matching subjects found for this grade level.</div>`;
        return;
    }

    listContainer.innerHTML = list.map(name => {
        const isChecked = selectedSubjectsArray.includes(name) ? 'checked' : '';
        return `
            <label style="display: flex; align-items: center; gap: 10px; padding: 6px 8px; color: #fff; cursor: pointer; border-radius: 4px; font-size: 0.88rem;" onmouseover="this.style.background='rgba(0,210,255,0.1)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" value="${name}" ${isChecked} onchange="onSubjectChecked(this)" style="accent-color: #00d2ff; cursor: pointer;">
                <span>${name}</span>
            </label>
        `;
    }).join('');
}

function filterSubjectList(query) {
    const lastTerm = query.split(',').pop().trim().toLowerCase();
    
    if (!lastTerm) {
        renderSubjectList(catalogSubjects);
        return;
    }

    const filtered = catalogSubjects.filter(name => name.toLowerCase().includes(lastTerm));
    renderSubjectList(filtered);
}

function onSubjectChecked(checkbox) {
    if (checkbox.checked) {
        if (!selectedSubjectsArray.includes(checkbox.value)) {
            selectedSubjectsArray.push(checkbox.value);
        }
    } else {
        selectedSubjectsArray = selectedSubjectsArray.filter(item => item !== checkbox.value);
    }

    const input = document.getElementById('t-subjects');
    input.value = selectedSubjectsArray.join(', ');
}

// --- Registration Logic ---
async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]') || document.querySelector('button[type="submit"]');

    const firstName = document.getElementById('t-firstname').value.trim();
    const lastName = document.getElementById('t-lastname').value.trim();
    const email = document.getElementById('t-email').value.trim().toLowerCase();

    // ---------------- DUPLICATE NAME PREVENTING CHECK ONLY ----------------
    const formattedFullName = `${firstName} ${lastName}`.toLowerCase().replace(/\s+/g, ' ');

    const isDuplicateName = existingTeachers.some(t => {
        const fname = t.first_name || t.firstName || '';
        const lname = t.last_name || t.lastName || '';
        let existingName = `${fname} ${lname}`.trim();

        if (!existingName && t.name) {
            existingName = t.name;
        }

        return existingName.toLowerCase().replace(/\s+/g, ' ').trim() === formattedFullName;
    });

    if (isDuplicateName) {
        showTopToast(`Teacher "${firstName} ${lastName}" is already registered!`, "error");
        return;
    }
    // ---------------------------------------------------------------------

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "⏳ Saving...";
    }

    // Get and clean subjects
    const subjectsRaw = document.getElementById('t-subjects').value;
    const subjectsArray = subjectsRaw.split(',').map(s => s.trim()).filter(Boolean);

    if (subjectsArray.length === 0) {
        showTopToast("Please enter or select at least one subject!", "error");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "✨ ADD TEACHERS & CREATE ACCOUNT";
        }
        return;
    }

    // Get selected days
    const selectedDays = Array.from(document.querySelectorAll('input[name="days"]:checked')).map(cb => cb.value);
    if (selectedDays.length === 0) {
        showTopToast("Please select at least one working day!", "error");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "✨ ADD TEACHERS & CREATE ACCOUNT";
        }
        return;
    }

    // Extract time from the dynamic select choices
    const startTime = getSelected24HourTime('start');
    const endTime = getSelected24HourTime('end');

    const availability = selectedDays.map(day => ({
        day: day,
        from: startTime,
        to: endTime
    }));

    // Create teacher data object
    const teacherData = {
        firstName: firstName,
        lastName: lastName,
        email: email,
        subjects: subjectsArray,
        targetGrade: document.getElementById('t-targetgrade').value,
        workDays: selectedDays,
        startTime: startTime,
        endTime: endTime,
        availability: availability 
    };

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            showTopToast("Please login first!", "error");
            window.location.href = '/shared/login.html';
            return;
        }

        const res = await fetch('/api/admin/teachers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(teacherData)
        });

        const result = await res.json();

        if (res.ok) {
            showTopToast(`Teacher ${teacherData.firstName} ${teacherData.lastName} registered successfully!`, 'success');
            
            // Clear form inputs
            document.getElementById('teacher-form').reset();
            selectedSubjectsArray = [];
            const inputSubj = document.getElementById('t-subjects');
            if (inputSubj) inputSubj.value = '';

            fetchCatalogSubjects();
            fetchExistingTeachers();
            
            if (result.credentials) {
                showCredentialsModal(result.credentials);
                renderCreatedCredentials(result.credentials);
            }
        } else {
            showTopToast(result.error || "Failed to register teacher.", "error");
        }
    } catch (err) {
        console.error("Teacher registration error:", err);
        showTopToast("Network error. Could not register teacher.", "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = "✨ ADD TEACHERS & CREATE ACCOUNT";
        }
    }
}

// --- Dynamic Small Top Pop-Up Card for Admin Credentials ---
function showCredentialsModal(credentials) {
    let card = document.getElementById('cred-top-card');
    if (!card) {
        card = document.createElement('div');
        card.id = 'cred-top-card';
        card.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%) translateY(-20px);
            background: #121420; border: 1px solid #00d2ff; border-radius: 10px;
            padding: 14px 20px; color: #fff; z-index: 10000;
            box-shadow: 0 8px 24px rgba(0, 210, 255, 0.25); opacity: 0;
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55);
            min-width: 320px; max-width: 480px; display: flex; flex-direction: column; gap: 8px;
        `;
        document.body.appendChild(card);
    }

    card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: bold; color: #00d2ff; font-size: 0.95rem;">
                <span>🔑</span> Teacher Account Created
            </div>
            <button id="close-cred-card" style="background: none; border: none; color: #a0a0c0; font-size: 1.2rem; cursor: pointer; line-height: 1; padding: 0 4px;">&times;</button>
        </div>
        <div style="display: flex; gap: 16px; background: rgba(255,255,255,0.05); padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 0.88rem;">
            <div><span style="color: #a0a0c0;">Username:</span> <strong style="color: #00d2ff;">${credentials.username}</strong></div>
            <div><span style="color: #a0a0c0;">Password:</span> <strong style="color: #00d2ff;">${credentials.password}</strong></div>
        </div>
    `;

    setTimeout(() => {
        card.style.opacity = '1';
        card.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);

    const closeCard = () => {
        card.style.opacity = '0';
        card.style.transform = 'translateX(-50%) translateY(-20px)';
    };

    document.getElementById('close-cred-card').onclick = closeCard;
    setTimeout(closeCard, 8000);
}

function renderCreatedCredentials(credentials) {
    if (!credentials) return;

    let credCard = document.getElementById('credentials-display-card');
    if (!credCard) {
        credCard = document.createElement('div');
        credCard.id = 'credentials-display-card';
        credCard.className = 'card glass';
        credCard.style.marginTop = '1.5rem';
        credCard.style.border = '1px solid #00d2ff';
        credCard.style.background = 'rgba(0, 210, 255, 0.05)';
        
        const formCard = document.querySelector('.card.glass');
        if (formCard && formCard.parentNode) {
            formCard.parentNode.insertBefore(credCard, formCard.nextSibling);
        }
    }

    credCard.innerHTML = `
        <h3 style="color: #00d2ff; margin-bottom: 0.5rem; font-size: 1.1rem;">🎉 Account Created Successfully</h3>
        <p style="color: #a0a0c0; font-size: 0.88rem; margin-bottom: 0.8rem;">Save these credentials for the teacher's initial login:</p>
        <div style="display: flex; gap: 20px; font-family: monospace; background: rgba(0,0,0,0.4); padding: 10px 14px; border-radius: 6px; color: #fff;">
            <div><strong>Username:</strong> <span style="color: #00d2ff;">${credentials.username}</span></div>
            <div><strong>Password:</strong> <span style="color: #00d2ff;">${credentials.password}</span></div>
        </div>
    `;
}

// --- Schedule Generator Logic ---
async function triggerAutoSchedule() {
    const btn = document.getElementById('btn-run-generator');
    btn.innerHTML = "⚡ Optimizing Constraints...";
    btn.disabled = true;

    try {
        const response = await fetch('/api/admin/generate-master', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            showTopToast("Master schedule generated successfully!", "success");
            renderMasterTable(data.masterSchedule);
        } else {
            showTopToast("Conflict Detected: " + (data.error || "Generation failed"), "error");
        }
    } catch (err) {
        console.error("System Error:", err);
        showTopToast("System error during schedule generation.", "error");
    } finally {
        btn.innerHTML = "🚀 Run Optimization & Generate Master Schedule";
        btn.disabled = false;
    }
}

function renderMasterTable(schedule) {
    const container = document.getElementById('generation-results');
    
    if (!schedule || schedule.length === 0) {
        container.innerHTML = `<p style="color: #ff5f5f;">No data available to display.</p>`;
        return;
    }

    let tableHTML = `
        <div class="card glass" style="margin-top: 20px; overflow-x: auto;">
            <h3 style="color: #00d2ff; margin-bottom: 1rem;">Generated Master Timetable</h3>
            <table style="width: 100%; border-collapse: collapse; color: white; text-align: left;">
                <thead>
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <th style="padding: 12px;">Teacher</th>
                        <th style="padding: 12px;">Subject</th>
                        <th style="padding: 12px;">Day</th>
                        <th style="padding: 12px;">Time</th>
                        <th style="padding: 12px;">Room</th>
                    </tr>
                </thead>
                <tbody>
    `;

    schedule.forEach(item => {
        tableHTML += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.3s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 12px;">${item.teacherName}</td>
                <td style="padding: 12px;"><span style="background: rgba(0,210,255,0.1); padding: 4px 8px; border-radius: 6px; font-size: 0.85rem;">${item.subject}</span></td>
                <td style="padding: 12px;">${item.day}</td>
                <td style="padding: 12px;">${item.startTime} - ${item.endTime}</td>
                <td style="padding: 12px; font-weight: bold; color: #00d2ff;">${item.room}</td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table></div>`;
    container.innerHTML = tableHTML;
}

function showTopToast(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.fontWeight = '600';
        toast.style.fontSize = '0.9rem';
        toast.style.zIndex = '9999';
        toast.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
        toast.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55)';
        toast.style.textAlign = 'center';
        toast.style.pointerEvents = 'none';
        document.body.appendChild(toast);
    }

    toast.style.background = type === 'success' ? '#00d2ff' : '#ff5f5f';
    toast.style.color = type === 'success' ? '#000' : '#fff';
    toast.style.border = type === 'success' ? '1px solid #00d2ff' : '1px solid #ff5f5f';
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 3000);
}