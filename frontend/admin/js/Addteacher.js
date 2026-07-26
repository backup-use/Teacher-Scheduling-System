// --- 1. Tab Navigation Logic ---
function showTab(tabId) {
    // Hide all sections with class 'tab-pane'
    document.querySelectorAll('.tab-pane').forEach(section => {
        section.style.display = 'none';
    });
    
    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show the selected section and highlight button
    const activeSection = document.getElementById(tabId + '-tab');
    if (activeSection) activeSection.style.display = 'block';
    
    const activeBtn = document.getElementById('btn-' + tabId);
    if (activeBtn) activeBtn.classList.add('active');
}

// --- 2. Teacher Registration ---
document.getElementById('teacher-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Fix: Using the correct selector based on your HTML structure
    const selectedDays = Array.from(document.querySelectorAll('input[name="days"]:checked')).map(cb => cb.value);

    const teacherData = {
        firstName: document.getElementById('t-firstname').value,
        lastName: document.getElementById('t-lastname').value,
        email: document.getElementById('t-email').value,
        subjects: document.getElementById('t-subjects').value.split(',').map(s => s.trim()),
        
        // CRITICAL CONFLICT LOGIC FIX: Captures the grade level preference for your 3-way check
        targetGrade: document.getElementById('t-targetgrade').value,
        
        workDays: selectedDays,
        startTime: document.getElementById('t-start').value,
        endTime: document.getElementById('t-end').value,
        availability: selectedDays.map(day => ({ 
            day, 
            from: document.getElementById('t-start').value, 
            to: document.getElementById('t-end').value 
        }))
    };

    const res = await fetch('/api/admin/teachers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(teacherData)
    });

    const result = await res.json();
    if (res.ok) {
        // Professional Alert replacing basic alert
        alert(`✅ Teacher Registered Successfully!\n\nUser: ${result.credentials.username}\nPass: ${result.credentials.password}`);
        location.reload(); 
    }
});

// --- 3. Master Schedule Generation ---
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
            renderMasterTable(data.masterSchedule);
        } else {
            alert("❌ Conflict Detected: " + data.error);
        }
    } catch (err) {
        console.error("System Error:", err);
    } finally {
        btn.innerHTML = "🚀 Run Optimization & Generate Master Schedule";
        btn.disabled = false;
    }
}

// --- 4. Professional Result Rendering ---
function renderMasterTable(schedule) {
    const container = document.getElementById('generation-results');
    
    if (!schedule || schedule.length === 0) {
        container.innerHTML = `<p style="color: #ff5f5f;">No data available to display.</p>`;
        return;
    }

    // Create a sleek table structure
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