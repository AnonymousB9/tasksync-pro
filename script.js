// Hardcoded Supabase Credentials (users never need to configure anything)
const SUPABASE_URL = 'https://jakcecrvtwbwyhdaqqqf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impha2NlY3J2dHdid3loZGFxcXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNDY4MDUsImV4cCI6MjEwNzYyMjgwNX0.xGHT1b8kBCjFlijmoRXR2mHn5c7N5ZalXcrqZ0REAxg';

let supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let userProfile = null;
let allTasks = [];
let allAssignees = [];

// Helper function to map usernames to internal emails
function usernameToEmail(username) {
    return `${username.trim().toLowerCase()}@app.local`;
}

// Initialize App on load
window.addEventListener('DOMContentLoaded', () => {
    checkUserSession();
});

async function checkUserSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        await fetchUserProfile();
    } else {
        showAuthView();
    }
}

async function fetchUserProfile() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (data) {
        userProfile = data;
        updateSidebarUser();
        if (userProfile.role === 'manager') {
            showManagerDashboard();
        } else {
            showAssigneeDashboard();
        }
    } else {
        await supabaseClient.auth.signOut();
        showAuthView();
    }
}

function showAuthView() {
    document.getElementById('auth-view').classList.remove('hidden');
    document.getElementById('manager-view').classList.add('hidden');
    document.getElementById('assignee-view').classList.add('hidden');
}

function switchAuthTab(tab) {
    const btns = document.querySelectorAll('.tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    if (tab === 'login') {
        btns[0].classList.add('active');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
    } else {
        btns[1].classList.add('active');
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.remove('hidden');
    }
}

// Login Event Listener
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const email = usernameToEmail(username);
    const password = document.getElementById('login-password').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        showToast("Invalid username or password", 'error');
    } else {
        currentUser = data.user;
        showToast('Logged in successfully!', 'success');
        await fetchUserProfile();
    }
});

// Register Event Listener
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const email = usernameToEmail(username);
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;

    // Check if username already exists in profiles
    const { data: existingUser } = await supabaseClient
        .from('profiles')
        .select('username')
        .eq('username', username)
        .single();

    if (existingUser) {
        showToast('Username already taken. Choose another.', 'error');
        return;
    }

    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) {
        showToast(error.message, 'error');
        return;
    }

    if (data.user) {
        const { error: profileError } = await supabaseClient.from('profiles').insert([
            { id: data.user.id, username: username, role: role }
        ]);

        if (profileError) {
            showToast(profileError.message, 'error');
        } else {
            showToast('Account created successfully!', 'success');
            currentUser = data.user;
            await fetchUserProfile();
        }
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    currentUser = null;
    userProfile = null;
    showAuthView();
    showToast('Logged out', 'info');
});

function updateSidebarUser() {
    if (!userProfile) return;
    document.getElementById('user-display').textContent = `@${userProfile.username}`;
    document.getElementById('user-role-badge').textContent = userProfile.role.toUpperCase();
    document.getElementById('user-avatar').textContent = userProfile.username.charAt(0).toUpperCase();
}

async function showManagerDashboard() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('assignee-view').classList.add('hidden');
    document.getElementById('manager-view').classList.remove('hidden');
    await loadAssignees();
    await loadTasks();
}

async function loadAssignees() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('role', 'assignee');
    if (data) {
        allAssignees = data;
        const select = document.getElementById('task-assignee');
        select.innerHTML = data.map(a => `<option value="${a.id}">${a.username}</option>`).join('');
    }
}

async function loadTasks() {
    const { data, error } = await supabaseClient
        .from('tasks')
        .select('*, assignee:assignee_id(username), manager:manager_id(username)')
        .order('schedule_date', { ascending: true });

    if (data) {
        allTasks = data;
        if (userProfile.role === 'manager') {
            renderManagerTasks();
        } else {
            renderAssigneeTasks();
        }
    }
}

function renderManagerTasks() {
    const search = document.getElementById('mgr-search').value.toLowerCase();
    const filtered = allTasks.filter(t => t.title.toLowerCase().includes(search) || (t.assignee && t.assignee.username.toLowerCase().includes(search)));

    const tbody = document.getElementById('mgr-task-list');
    document.getElementById('mgr-total-tasks').textContent = allTasks.length;
    document.getElementById('mgr-completed-tasks').textContent = allTasks.filter(t => t.status === 'completed').length;
    document.getElementById('mgr-pending-tasks').textContent = allTasks.filter(t => t.status === 'pending').length;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">No tasks found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(t => `
        <tr>
            <td>
                <strong>${escapeHtml(t.title)}</strong>
                <div class="text-muted small">${escapeHtml(t.description || '')}</div>
            </td>
            <td>${t.schedule_date}</td>
            <td>@${t.assignee ? t.assignee.username : 'Unknown'}</td>
            <td>
                <span class="status-badge ${t.status}">${t.status.toUpperCase()}</span>
            </td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

async function showAssigneeDashboard() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('manager-view').classList.add('hidden');
    document.getElementById('assignee-view').classList.remove('hidden');
    await loadTasks();
}

function renderAssigneeTasks() {
    const myTasks = allTasks.filter(t => t.assignee_id === currentUser.id);
    const tbody = document.getElementById('asg-task-list');

    document.getElementById('asg-total-tasks').textContent = myTasks.length;
    document.getElementById('asg-completed-tasks').textContent = myTasks.filter(t => t.status === 'completed').length;

    if (myTasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center">No tasks assigned to you yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = myTasks.map(t => `
        <tr>
            <td>
                <strong>${escapeHtml(t.title)}</strong>
                <div class="text-muted small">${escapeHtml(t.description || '')}</div>
            </td>
            <td>${t.schedule_date}</td>
            <td>@${t.manager ? t.manager.username : 'Manager'}</td>
            <td>
                <span class="status-badge ${t.status}">${t.status.toUpperCase()}</span>
            </td>
            <td>
                ${t.status === 'pending' 
                    ? `<button class="btn btn-sm btn-success" onclick="toggleTaskStatus('${t.id}', 'completed')"><i class="fa-solid fa-check"></i> Mark Done</button>` 
                    : `<button class="btn btn-sm btn-outline" onclick="toggleTaskStatus('${t.id}', 'pending')"><i class="fa-solid fa-rotate-left"></i> Reopen</button>`}
            </td>
        </tr>
    `).join('');
}

async function toggleTaskStatus(taskId, newStatus) {
    const { error } = await supabaseClient
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);

    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast(`Task marked as ${newStatus}!`, 'success');
        await loadTasks();
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    const { error } = await supabaseClient.from('tasks').delete().eq('id', taskId);
    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('Task deleted', 'success');
        await loadTasks();
    }
}

function openNewTaskModal() {
    if (allAssignees.length === 0) {
        showToast('No assignees available in the system yet.', 'error');
        return;
    }
    document.getElementById('task-form').reset();
    document.getElementById('task-date').valueAsDate = new Date();
    document.getElementById('task-modal').style.display = 'flex';
}

function closeNewTaskModal() {
    document.getElementById('task-modal').style.display = 'none';
}

document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-desc').value;
    const schedule_date = document.getElementById('task-date').value;
    const assignee_id = document.getElementById('task-assignee').value;

    const { error } = await supabaseClient.from('tasks').insert([{
        title,
        description,
        schedule_date,
        assignee_id,
        manager_id: currentUser.id,
        status: 'pending'
    }]);

    if (error) {
        showToast(error.message, 'error');
    } else {
        showToast('Task assigned successfully!', 'success');
        closeNewTaskModal();
        await loadTasks();
    }
});

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}