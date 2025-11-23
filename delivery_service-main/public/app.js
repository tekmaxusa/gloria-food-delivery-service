// Configuration
const API_BASE = window.location.origin;
const REFRESH_INTERVAL = 5000; // 5 seconds
let autoRefreshInterval = null;
let lastOrderIds = new Set();
let allOrders = [];
let currentStatusFilter = '';
let searchQuery = '';
let currentUser = null;
let sessionId = null;

// TekMax Logo URL
const TEKMAX_LOGO_URL = 'https://media.licdn.com/dms/image/v2/D560BAQHPtxnF-6ws_w/company-logo_200_200/company-logo_200_200/0/1730509053465/hellotekmax_logo?e=2147483647&v=beta&t=1Ztf8UScfnTQjphAVDFVwr9Ket7fhIUFP2PSz43nyJE';

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupAuthForms();
    
    // Setup navigation links
    setupNavigation();
    
    // Start auto-refresh if authenticated
    if (sessionId) {
        startAutoRefresh();
    }
});

// Check authentication status
async function checkAuthStatus() {
    const storedSessionId = localStorage.getItem('sessionId');
    if (!storedSessionId) {
        showAuthContainer();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
            headers: {
                'x-session-id': storedSessionId
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                sessionId = storedSessionId;
                currentUser = data.user;
                // Fetch full user info for profile
                fetchUserInfo();
                showDashboard();
                loadDashboardData();
            } else {
                showAuthContainer();
            }
        } else {
            showAuthContainer();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showAuthContainer();
    }
}

// Setup authentication forms
function setupAuthForms() {
    // Login form
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            
            try {
                const response = await fetch(`${API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (data.success && data.sessionId) {
                    sessionId = data.sessionId;
                    localStorage.setItem('sessionId', sessionId);
                    currentUser = data.user;
                    // Fetch full user info for profile
                    fetchUserInfo();
                    showNotification('Success', 'Login successful!');
                    showDashboard();
                    loadDashboardData();
                    startAutoRefresh();
                } else {
                    showNotification('Error', data.error || 'Login failed', true);
                }
            } catch (error) {
                showNotification('Error', 'Failed to connect to server', true);
            }
        });
    }
    
    // Signup form
    const signupForm = document.getElementById('signupFormElement');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signupEmail').value;
            const password = document.getElementById('signupPassword').value;
            const fullName = document.getElementById('signupName').value;
            
            try {
                const response = await fetch(`${API_BASE}/api/auth/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, full_name: fullName })
                });
                
                const data = await response.json();
                
                if (data.success && data.sessionId) {
                    sessionId = data.sessionId;
                    localStorage.setItem('sessionId', sessionId);
                    currentUser = data.user;
                    // Fetch full user info for profile
                    fetchUserInfo();
                    showNotification('Success', 'Account created successfully!');
                    showDashboard();
                    loadDashboardData();
                    startAutoRefresh();
                } else {
                    showNotification('Error', data.error || 'Signup failed', true);
                }
            } catch (error) {
                showNotification('Error', 'Failed to connect to server', true);
            }
        });
    }
    
    // Switch between login and signup
    const showSignup = document.getElementById('showSignup');
    const showLogin = document.getElementById('showLogin');
    
    if (showSignup) {
        showSignup.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginForm').classList.remove('active');
            document.getElementById('signupForm').classList.add('active');
        });
    }
    
    if (showLogin) {
        showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('signupForm').classList.remove('active');
            document.getElementById('loginForm').classList.add('active');
        });
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch(`${API_BASE}/api/auth/logout`, {
                    method: 'POST',
                    headers: { 'x-session-id': sessionId || '' }
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
            
            sessionId = null;
            currentUser = null;
            localStorage.removeItem('sessionId');
            showAuthContainer();
            stopAutoRefresh();
        });
    }
    
    // Forgot password link
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            showForgotPasswordModal();
        });
    }
    
    // Setup profile functionality
    setupProfileModal();
    setupChangePasswordModal();
    setupForgotPasswordModal();
}

// Setup Profile Modal
function setupProfileModal() {
    const profileBtn = document.getElementById('profileBtn');
    const profileModal = document.getElementById('profileModal');
    const closeProfileModal = document.getElementById('closeProfileModal');
    
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            if (currentUser) {
                updateProfileInfo();
                profileModal.classList.remove('hidden');
            }
        });
    }
    
    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', () => {
            profileModal.classList.add('hidden');
        });
    }
    
    // Close modal when clicking outside
    if (profileModal) {
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) {
                profileModal.classList.add('hidden');
            }
        });
    }
}

// Update profile info display
function updateProfileInfo() {
    if (currentUser) {
        document.getElementById('profileFullName').textContent = currentUser.full_name || currentUser.fullName || 'N/A';
        document.getElementById('profileEmail').textContent = currentUser.email || 'N/A';
        document.getElementById('profileRole').textContent = currentUser.role || 'User';
    }
}

// Setup Change Password Modal
function setupChangePasswordModal() {
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    const changePasswordModal = document.getElementById('changePasswordModal');
    const closeChangePasswordModal = document.getElementById('closeChangePasswordModal');
    const changePasswordForm = document.getElementById('changePasswordForm');
    
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', () => {
            document.getElementById('profileModal').classList.add('hidden');
            changePasswordModal.classList.remove('hidden');
        });
    }
    
    if (closeChangePasswordModal) {
        closeChangePasswordModal.addEventListener('click', () => {
            changePasswordModal.classList.add('hidden');
            // Clear form
            if (changePasswordForm) {
                changePasswordForm.reset();
            }
        });
    }
    
    // Close modal when clicking outside
    if (changePasswordModal) {
        changePasswordModal.addEventListener('click', (e) => {
            if (e.target === changePasswordModal) {
                changePasswordModal.classList.add('hidden');
                if (changePasswordForm) {
                    changePasswordForm.reset();
                }
            }
        });
    }
    
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmNewPassword = document.getElementById('confirmNewPassword').value;
            
            if (newPassword !== confirmNewPassword) {
                showNotification('Error', 'New passwords do not match', true);
                return;
            }
            
            if (newPassword.length < 6) {
                showNotification('Error', 'Password must be at least 6 characters', true);
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/auth/change-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-session-id': sessionId || ''
                    },
                    body: JSON.stringify({
                        currentPassword,
                        newPassword
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Success', 'Password changed successfully!');
                    changePasswordModal.classList.add('hidden');
                    changePasswordForm.reset();
                } else {
                    showNotification('Error', data.error || 'Failed to change password', true);
                }
            } catch (error) {
                showNotification('Error', 'Failed to change password: ' + error.message, true);
            }
        });
    }
}

// Setup Forgot Password Modal
function setupForgotPasswordModal() {
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    const closeForgotPasswordModal = document.getElementById('closeForgotPasswordModal');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    
    if (closeForgotPasswordModal) {
        closeForgotPasswordModal.addEventListener('click', () => {
            forgotPasswordModal.classList.add('hidden');
            if (forgotPasswordForm) {
                forgotPasswordForm.reset();
            }
        });
    }
    
    // Close modal when clicking outside
    if (forgotPasswordModal) {
        forgotPasswordModal.addEventListener('click', (e) => {
            if (e.target === forgotPasswordModal) {
                forgotPasswordModal.classList.add('hidden');
                if (forgotPasswordForm) {
                    forgotPasswordForm.reset();
                }
            }
        });
    }
    
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('forgotPasswordEmail').value;
            
            try {
                const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showNotification('Success', 'Password reset link sent to your email!');
                    forgotPasswordModal.classList.add('hidden');
                    forgotPasswordForm.reset();
                } else {
                    showNotification('Error', data.error || 'Failed to send reset link', true);
                }
            } catch (error) {
                showNotification('Error', 'Failed to send reset link: ' + error.message, true);
            }
        });
    }
}

// Show Forgot Password Modal
function showForgotPasswordModal() {
    const forgotPasswordModal = document.getElementById('forgotPasswordModal');
    if (forgotPasswordModal) {
        forgotPasswordModal.classList.remove('hidden');
    }
}

// Fetch full user info from API
async function fetchUserInfo() {
    if (!sessionId) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
            headers: {
                'x-session-id': sessionId
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
                currentUser = data.user;
            }
        }
    } catch (error) {
        console.error('Error fetching user info:', error);
    }
}

// Show auth container
function showAuthContainer() {
    document.getElementById('authContainer').classList.remove('hidden');
    document.getElementById('dashboardContainer').classList.add('hidden');
}

// Show dashboard
function showDashboard() {
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('dashboardContainer').classList.remove('hidden');
    
    // Update logo
    const logos = document.querySelectorAll('.logo-img, .auth-logo');
    logos.forEach(logo => {
        if (logo) logo.src = TEKMAX_LOGO_URL;
    });
    
    // Show dashboard by default
    showDashboardPage();
}

// Setup navigation links
function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active class from all nav links
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            // Add active class to clicked link
            e.target.classList.add('active');
            
            // Handle navigation
            const page = e.target.dataset.page || e.target.textContent.trim().toLowerCase();
            navigateToPage(page);
        });
    });
}

// Navigate to different pages
function navigateToPage(page) {
    switch(page.toLowerCase()) {
        case 'dashboard':
            showDashboardPage();
            break;
        case 'orders':
            showOrdersPage();
            break;
        case 'drivers':
            showDriversPage();
            break;
        case 'reports':
            showReportsPage();
            break;
        case 'reviews':
            showReviewsPage();
            break;
        default:
            showDashboardPage();
    }
}

// Load dashboard data
async function loadDashboardData() {
    try {
        const headers = {};
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        const [statsRes, ordersRes] = await Promise.all([
            fetch(`${API_BASE}/api/dashboard/stats`, { headers }),
            fetch(`${API_BASE}/orders?limit=100`, { headers })
        ]);
        
        if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.success) {
                updateDashboardStats(statsData.stats);
            }
        } else {
            console.warn('Failed to load dashboard stats:', statsRes.status);
        }
        
        if (ordersRes.ok) {
            const ordersData = await ordersRes.json();
            if (ordersData.success !== false && (ordersData.orders || Array.isArray(ordersData))) {
                allOrders = ordersData.orders || ordersData || [];
                console.log(`Dashboard: Loaded ${allOrders.length} orders`);
                checkForNewOrders(allOrders);
            }
        } else {
            console.warn('Failed to load orders for dashboard:', ordersRes.status);
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// Update dashboard stats
function updateDashboardStats(stats) {
    const statsContainer = document.querySelector('.dashboard-stats');
    if (!statsContainer) return;
    
    statsContainer.innerHTML = `
        <div class="dashboard-card">
            <h3>Total Orders</h3>
            <div class="value">${stats.orders?.total || 0}</div>
            <div class="change">+${stats.orders?.recent_24h || 0} in last 24h</div>
        </div>
        <div class="dashboard-card">
            <h3>Active Orders</h3>
            <div class="value">${stats.orders?.active || 0}</div>
            <div class="change">In progress</div>
        </div>
        <div class="dashboard-card">
            <h3>Completed</h3>
            <div class="value">${stats.orders?.completed || 0}</div>
            <div class="change">Delivered</div>
        </div>
        <div class="dashboard-card">
            <h3>Total Revenue</h3>
            <div class="value">$${parseFloat(stats.revenue?.total || 0).toFixed(2)}</div>
            <div class="change">All time</div>
        </div>
        <div class="dashboard-card">
            <h3>Active Drivers</h3>
            <div class="value">${stats.drivers?.active || 0}</div>
            <div class="change">of ${stats.drivers?.total || 0} total</div>
        </div>
    `;
}

// Show Dashboard page
function showDashboardPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Dashboard</h1>
        </div>
        
        <div class="dashboard-stats dashboard-grid">
            <div class="dashboard-card">
                <h3>Loading...</h3>
            </div>
        </div>
        
        <div class="orders-header" style="margin-top: 32px;">
            <h2 class="page-title" style="font-size: 20px;">Recent Orders</h2>
        </div>
        
        <div class="table-container">
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Order No.</th>
                        <th>C. Name</th>
                        <th>C. Address</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Order placed</th>
                    </tr>
                </thead>
                <tbody id="dashboardOrdersTableBody">
                    <tr><td colspan="6" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">Loading...</div></div></td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    loadDashboardData();
    loadRecentOrders();
}

// Load recent orders for dashboard
async function loadRecentOrders() {
    try {
        const headers = {};
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        const response = await fetch(`${API_BASE}/orders?limit=10`, { headers });
        
        if (response.ok) {
            const data = await response.json();
            const orders = data.orders || data || [];
            console.log(`Loaded ${orders.length} recent orders for dashboard`);
            displayRecentOrders(orders);
        } else {
            console.error('Failed to load recent orders:', response.status);
        }
    } catch (error) {
        console.error('Error loading recent orders:', error);
    }
}

// Display recent orders
function displayRecentOrders(orders) {
    const tbody = document.getElementById('dashboardOrdersTableBody');
    if (!tbody) return;
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state-cell">
                    <div class="empty-state">
                        <div class="empty-state-text">No recent orders</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td><strong>#${order.gloriafood_order_id || order.id || 'N/A'}</strong></td>
            <td>${escapeHtml(extractCustomerName(order))}</td>
            <td>${escapeHtml(extractDeliveryAddress(order))}</td>
            <td>${formatCurrency(order.total_price || 0, order.currency || 'USD')}</td>
            <td><span class="status-badge status-${(order.status || 'UNKNOWN').toUpperCase()}">${escapeHtml(order.status || 'UNKNOWN')}</span></td>
            <td>${formatDate(order.fetched_at || order.created_at)}</td>
        </tr>
    `).join('');
}

// Show Orders page
function showOrdersPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Orders</h1>
            <div class="orders-controls">
                <div class="order-status-tabs">
                    <button class="status-tab active" data-status="current">Current</button>
                    <button class="status-tab" data-status="scheduled">Scheduled</button>
                    <button class="status-tab" data-status="completed">Completed</button>
                    <button class="status-tab" data-status="incomplete">Incomplete</button>
                    <button class="status-tab" data-status="history">History</button>
                </div>
                <div class="action-bar">
                    <div class="search-box">
                        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        <input type="text" id="searchInput" placeholder="Search" class="search-input">
                    </div>
                    <button class="btn-danger" id="deleteSelectedBtn" style="display: none;">🗑️ Delete Selected</button>
                    <button class="btn-primary" id="newOrderBtn">+ New order</button>
                </div>
            </div>
        </div>

        <div class="table-container">
            <table class="orders-table">
                <thead>
                    <tr>
                        <th class="checkbox-col">
                            <input type="checkbox" class="select-all-checkbox">
                        </th>
                        <th>Order No.</th>
                        <th>C. Name</th>
                        <th>C. Address</th>
                        <th>Amount</th>
                        <th>Distance</th>
                        <th>Order placed</th>
                        <th>Req. Pickup Time</th>
                        <th>Req. Delivery Time</th>
                        <th>Ready for pick-up</th>
                        <th>Driver</th>
                        <th>Status</th>
                        <th>Tracking</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="ordersTableBody">
                    <tr><td colspan="14" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">Loading...</div></div></td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    // Re-initialize event listeners
    initializeOrdersPage();
    loadOrders();
}

// Initialize Orders page event listeners
function initializeOrdersPage() {
    // Setup status tabs
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentStatusFilter = e.target.dataset.status;
            filterAndDisplayOrders();
        });
    });
    
    // Setup search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            filterAndDisplayOrders();
        });
    }
    
    // Setup select all checkbox
    const selectAllCheckbox = document.querySelector('.select-all-checkbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.order-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateDeleteSelectedButton();
        });
    }
    
    // Setup individual checkboxes to update delete button visibility
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('order-checkbox')) {
            updateDeleteSelectedButton();
        }
    });
    
    // Delete selected button
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    }
    
    // New order button
    const newOrderBtn = document.getElementById('newOrderBtn');
    if (newOrderBtn) {
        newOrderBtn.addEventListener('click', handleNewOrder);
    }
}

// Show Drivers page with map
function showDriversPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Drivers</h1>
            <div class="orders-controls">
                <div class="order-status-tabs">
                    <button class="status-tab active" data-view="list">Driver List</button>
                    <button class="status-tab" data-view="map">Map View</button>
                    <button class="status-tab" data-view="payment">Daily Payment</button>
                </div>
                <div class="action-bar">
                    <div class="search-box">
                        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        <input type="text" id="driverSearchInput" placeholder="Search drivers" class="search-input">
                    </div>
                    <button class="btn-primary" id="newDriverBtn">+ New Driver</button>
                </div>
            </div>
        </div>
        
        <div id="driversMapContainer" class="map-container" style="display: none;">
            <div class="map-placeholder">
                <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <div class="empty-state-text">Driver Map View</div>
                <div class="empty-state-text" style="font-size: 12px; margin-top: 8px;">Real-time driver locations will be displayed here</div>
            </div>
        </div>
        
        <div id="driversListContainer" class="table-container">
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Rating</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="driversTableBody">
                    <tr><td colspan="7" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">Loading...</div></div></td></tr>
                </tbody>
            </table>
        </div>
    `;
    
    // Setup tab switching
    document.querySelectorAll('.status-tab[data-view]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.status-tab[data-view]').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const view = e.target.dataset.view;
            
            if (view === 'map') {
                document.getElementById('driversMapContainer').style.display = 'flex';
                document.getElementById('driversListContainer').style.display = 'none';
            } else {
                document.getElementById('driversMapContainer').style.display = 'none';
                document.getElementById('driversListContainer').style.display = 'block';
            }
        });
    });
    
    // Setup new driver button
    const newDriverBtn = document.getElementById('newDriverBtn');
    if (newDriverBtn) {
        newDriverBtn.addEventListener('click', handleNewDriver);
    }
    
    loadDrivers();
}

// Load drivers
async function loadDrivers() {
    try {
        const response = await fetch(`${API_BASE}/api/drivers`, {
            headers: { 'x-session-id': sessionId || '' }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                displayDrivers(data.drivers || []);
            }
        }
    } catch (error) {
        console.error('Error loading drivers:', error);
        displayDrivers([]);
    }
}

// Display drivers
function displayDrivers(drivers) {
    const tbody = document.getElementById('driversTableBody');
    if (!tbody) return;
    
    if (!drivers || drivers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state-cell">
                    <div class="empty-state">
                        <div class="empty-state-text">No drivers found</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = drivers.map(driver => `
        <tr>
            <td><strong>${escapeHtml(driver.name || 'N/A')}</strong></td>
            <td>
                <div class="review-rating">
                    ${generateStars(driver.rating || 0)}
                </div>
            </td>
            <td>${escapeHtml(driver.phone || 'N/A')}</td>
            <td>${escapeHtml(driver.email || 'N/A')}</td>
            <td>${escapeHtml(driver.vehicle_type || 'N/A')} ${driver.vehicle_plate ? `(${escapeHtml(driver.vehicle_plate)})` : ''}</td>
            <td><span class="status-badge status-${(driver.status || 'active').toUpperCase()}">${escapeHtml(driver.status || 'active')}</span></td>
            <td>
                <button class="btn-icon" onclick="editDriver(${driver.id})" title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
}

// Generate stars for rating
function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '';
    
    for (let i = 0; i < 5; i++) {
        if (i < fullStars) {
            stars += '<span class="star">★</span>';
        } else if (i === fullStars && hasHalfStar) {
            stars += '<span class="star">☆</span>';
        } else {
            stars += '<span class="star empty">★</span>';
        }
    }
    
    return stars;
}

// Show Reports page
function showReportsPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Reports</h1>
        </div>
        
        <div class="reports-grid">
            <div class="report-card" onclick="generateReport('orders')">
                <div class="report-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"></line>
                        <line x1="8" y1="12" x2="21" y2="12"></line>
                        <line x1="8" y1="18" x2="21" y2="18"></line>
                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                    </svg>
                </div>
                <h3>Orders Report</h3>
                <p>View detailed order statistics, trends, and analytics</p>
            </div>
            
            <div class="report-card" onclick="generateReport('revenue')">
                <div class="report-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="2" x2="12" y2="22"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </div>
                <h3>Revenue Report</h3>
                <p>Analyze revenue trends, daily/weekly/monthly breakdowns</p>
            </div>
            
            <div class="report-card" onclick="generateReport('drivers')">
                <div class="report-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </div>
                <h3>Driver Performance</h3>
                <p>Track driver performance, delivery times, and ratings</p>
            </div>
            
            <div class="report-card" onclick="generateReport('customers')">
                <div class="report-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <h3>Customer Analytics</h3>
                <p>Understand customer behavior and preferences</p>
            </div>
        </div>
        
        <div id="reportContent" style="margin-top: 32px;"></div>
    `;
    
    loadReportsData();
}

// Load reports data
async function loadReportsData() {
    try {
        const response = await fetch(`${API_BASE}/api/dashboard/stats`, {
            headers: { 'x-session-id': sessionId || '' }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Reports data loaded
            }
        }
    } catch (error) {
        console.error('Error loading reports data:', error);
    }
}

// Generate report with actual data
window.generateReport = async function(type) {
    const reportContent = document.getElementById('reportContent');
    if (!reportContent) return;
    
    // Show loading state
    reportContent.innerHTML = `
        <div class="table-container">
            <div style="padding: 24px; text-align: center;">
                <div class="empty-state-text">Loading report data...</div>
            </div>
        </div>
    `;
    
    try {
        const headers = {};
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        // Fetch data based on report type
        let reportData = null;
        
        if (type === 'orders' || type === 'revenue') {
            const [statsRes, ordersRes] = await Promise.all([
                fetch(`${API_BASE}/api/dashboard/stats`, { headers }),
                fetch(`${API_BASE}/orders?limit=1000`, { headers })
            ]);
            
            if (statsRes.ok && ordersRes.ok) {
                const statsData = await statsRes.json();
                const ordersData = await ordersRes.json();
                const orders = ordersData.orders || ordersData || [];
                
                reportData = {
                    stats: statsData.success ? statsData.stats : null,
                    orders: orders
                };
            }
        } else if (type === 'drivers') {
            const [driversRes, statsRes] = await Promise.all([
                fetch(`${API_BASE}/api/drivers`, { headers }),
                fetch(`${API_BASE}/api/dashboard/stats`, { headers })
            ]);
            
            if (driversRes.ok && statsRes.ok) {
                const driversData = await driversRes.json();
                const statsData = await statsRes.json();
                
                reportData = {
                    drivers: driversData.success ? driversData.drivers : [],
                    stats: statsData.success ? statsData.stats : null
                };
            }
        } else if (type === 'customers') {
            const ordersRes = await fetch(`${API_BASE}/orders?limit=1000`, { headers });
            
            if (ordersRes.ok) {
                const ordersData = await ordersRes.json();
                const orders = ordersData.orders || ordersData || [];
                
                reportData = {
                    orders: orders
                };
            }
        }
        
        // Generate report HTML based on type
        const reportHtml = generateReportHTML(type, reportData);
        reportContent.innerHTML = reportHtml;
        
    } catch (error) {
        console.error('Error generating report:', error);
        reportContent.innerHTML = `
            <div class="table-container">
                <div style="padding: 24px;">
                    <h2 style="margin-bottom: 16px;">${type.charAt(0).toUpperCase() + type.slice(1)} Report</h2>
                    <div class="empty-state">
                        <div class="empty-state-text">Error loading report: ${error.message}</div>
                    </div>
                </div>
            </div>
        `;
    }
};

// Generate report HTML based on type and data
function generateReportHTML(type, data) {
    const reportDate = new Date();
    const currentMonth = reportDate.getMonth();
    const currentYear = reportDate.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    switch(type) {
        case 'orders':
            return generateOrdersReport(data, currentMonth, currentYear, lastMonth, lastMonthYear);
        case 'revenue':
            return generateRevenueReport(data, currentMonth, currentYear, lastMonth, lastMonthYear);
        case 'drivers':
            return generateDriversReport(data);
        case 'customers':
            return generateCustomersReport(data);
        default:
            return '<div>Unknown report type</div>';
    }
}

// Generate Orders Report
function generateOrdersReport(data, currentMonth, currentYear, lastMonth, lastMonthYear) {
    if (!data || !data.orders) {
        return '<div>No order data available</div>';
    }
    
    const orders = data.orders;
    const stats = data.stats;
    
    // Calculate monthly orders
    const currentMonthOrders = orders.filter(order => {
        const orderDate = new Date(order.fetched_at || order.created_at || order.updated_at);
        return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
    });
    
    const lastMonthOrders = orders.filter(order => {
        const orderDate = new Date(order.fetched_at || order.created_at || order.updated_at);
        return orderDate.getMonth() === lastMonth && orderDate.getFullYear() === lastMonthYear;
    });
    
    // Calculate orders by status
    const statusCounts = {};
    orders.forEach(order => {
        const status = (order.status || 'UNKNOWN').toUpperCase();
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    // Calculate growth
    const growth = lastMonthOrders.length > 0 
        ? (((currentMonthOrders.length - lastMonthOrders.length) / lastMonthOrders.length) * 100).toFixed(1)
        : currentMonthOrders.length > 0 ? '100' : '0';
    
    const statusRows = Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => `
            <tr>
                <td><span class="status-badge status-${status}">${escapeHtml(status)}</span></td>
                <td>${count}</td>
                <td>${((count / orders.length) * 100).toFixed(1)}%</td>
            </tr>
        `).join('');
    
    return `
        <div class="table-container">
            <div style="padding: 24px;">
                <h2 style="margin-bottom: 16px;">Orders Report</h2>
                <p style="color: #64748b; margin-bottom: 24px;">Report generated at ${new Date().toLocaleString()}</p>
                
                <div class="dashboard-grid" style="margin-bottom: 32px;">
                    <div class="dashboard-card">
                        <h3>Total Orders</h3>
                        <div class="value">${orders.length}</div>
                        <div class="change">All time</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>This Month</h3>
                        <div class="value">${currentMonthOrders.length}</div>
                        <div class="change">${new Date(currentYear, currentMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Growth</h3>
                        <div class="value ${parseFloat(growth) >= 0 ? '' : 'negative'}">${growth}%</div>
                        <div class="change">vs last month</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Active Orders</h3>
                        <div class="value">${stats?.orders?.active || 0}</div>
                        <div class="change">In progress</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Completed</h3>
                        <div class="value">${stats?.orders?.completed || 0}</div>
                        <div class="change">Delivered</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Cancelled</h3>
                        <div class="value">${stats?.orders?.cancelled || 0}</div>
                        <div class="change">Cancelled orders</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 32px; margin-bottom: 16px;">Orders by Status</h3>
                <table class="orders-table" style="margin-top: 16px;">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Count</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${statusRows || '<tr><td colspan="3" class="empty-state-cell"><div class="empty-state-text">No data</div></td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Generate Revenue Report
function generateRevenueReport(data, currentMonth, currentYear, lastMonth, lastMonthYear) {
    if (!data || !data.orders) {
        return '<div>No order data available</div>';
    }
    
    const orders = data.orders;
    const stats = data.stats;
    
    // Calculate revenue
    const totalRevenue = orders.reduce((sum, order) => sum + (parseFloat(order.total_price) || 0), 0);
    
    const currentMonthOrders = orders.filter(order => {
        const orderDate = new Date(order.fetched_at || order.created_at || order.updated_at);
        return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
    });
    
    const lastMonthOrders = orders.filter(order => {
        const orderDate = new Date(order.fetched_at || order.created_at || order.updated_at);
        return orderDate.getMonth() === lastMonth && orderDate.getFullYear() === lastMonthYear;
    });
    
    const currentMonthRevenue = currentMonthOrders.reduce((sum, order) => sum + (parseFloat(order.total_price) || 0), 0);
    const lastMonthRevenue = lastMonthOrders.reduce((sum, order) => sum + (parseFloat(order.total_price) || 0), 0);
    
    const revenueGrowth = lastMonthRevenue > 0 
        ? (((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
        : currentMonthRevenue > 0 ? '100' : '0';
    
    // Calculate average order value
    const avgOrderValue = orders.length > 0 ? (totalRevenue / orders.length) : 0;
    
    // Calculate revenue by status
    const revenueByStatus = {};
    orders.forEach(order => {
        const status = (order.status || 'UNKNOWN').toUpperCase();
        const price = parseFloat(order.total_price) || 0;
        revenueByStatus[status] = (revenueByStatus[status] || 0) + price;
    });
    
    const revenueRows = Object.entries(revenueByStatus)
        .sort((a, b) => b[1] - a[1])
        .map(([status, revenue]) => `
            <tr>
                <td><span class="status-badge status-${status}">${escapeHtml(status)}</span></td>
                <td>${formatCurrency(revenue, 'USD')}</td>
                <td>${((revenue / totalRevenue) * 100).toFixed(1)}%</td>
            </tr>
        `).join('');
    
    return `
        <div class="table-container">
            <div style="padding: 24px;">
                <h2 style="margin-bottom: 16px;">Revenue Report</h2>
                <p style="color: #64748b; margin-bottom: 24px;">Report generated at ${new Date().toLocaleString()}</p>
                
                <div class="dashboard-grid" style="margin-bottom: 32px;">
                    <div class="dashboard-card">
                        <h3>Total Revenue</h3>
                        <div class="value" style="color: #22c55e;">${formatCurrency(totalRevenue, 'USD')}</div>
                        <div class="change">All time</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>This Month</h3>
                        <div class="value" style="color: #3b82f6;">${formatCurrency(currentMonthRevenue, 'USD')}</div>
                        <div class="change">${new Date(currentYear, currentMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Growth</h3>
                        <div class="value ${parseFloat(revenueGrowth) >= 0 ? '' : 'negative'}" style="color: ${parseFloat(revenueGrowth) >= 0 ? '#22c55e' : '#ef4444'};">${revenueGrowth}%</div>
                        <div class="change">vs last month</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Average Order</h3>
                        <div class="value">${formatCurrency(avgOrderValue, 'USD')}</div>
                        <div class="change">Per order</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Total Orders</h3>
                        <div class="value">${orders.length}</div>
                        <div class="change">All orders</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Last Month</h3>
                        <div class="value">${formatCurrency(lastMonthRevenue, 'USD')}</div>
                        <div class="change">${new Date(lastMonthYear, lastMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 32px; margin-bottom: 16px;">Revenue by Status</h3>
                <table class="orders-table" style="margin-top: 16px;">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Revenue</th>
                            <th>Percentage</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${revenueRows || '<tr><td colspan="3" class="empty-state-cell"><div class="empty-state-text">No data</div></td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Generate Drivers Report
function generateDriversReport(data) {
    if (!data || !data.drivers) {
        return '<div>No driver data available</div>';
    }
    
    const drivers = data.drivers;
    const stats = data.stats;
    
    const activeDrivers = drivers.filter(d => (d.status || '').toLowerCase() === 'active');
    const inactiveDrivers = drivers.filter(d => (d.status || '').toLowerCase() !== 'active');
    
    // Calculate average rating
    const driversWithRating = drivers.filter(d => d.rating);
    const avgRating = driversWithRating.length > 0
        ? (driversWithRating.reduce((sum, d) => sum + (parseFloat(d.rating) || 0), 0) / driversWithRating.length).toFixed(1)
        : '0';
    
    const driverRows = drivers.map(driver => `
        <tr>
            <td><strong>${escapeHtml(driver.name || 'N/A')}</strong></td>
            <td>${escapeHtml(driver.phone || 'N/A')}</td>
            <td>${escapeHtml(driver.email || 'N/A')}</td>
            <td>${escapeHtml(driver.vehicle_type || 'N/A')} ${driver.vehicle_plate ? `(${escapeHtml(driver.vehicle_plate)})` : ''}</td>
            <td>
                <div class="review-rating">
                    ${generateStars(parseFloat(driver.rating) || 0)}
                </div>
            </td>
            <td><span class="status-badge status-${(driver.status || 'active').toUpperCase()}">${escapeHtml(driver.status || 'active')}</span></td>
        </tr>
    `).join('');
    
    return `
        <div class="table-container">
            <div style="padding: 24px;">
                <h2 style="margin-bottom: 16px;">Driver Performance Report</h2>
                <p style="color: #64748b; margin-bottom: 24px;">Report generated at ${new Date().toLocaleString()}</p>
                
                <div class="dashboard-grid" style="margin-bottom: 32px;">
                    <div class="dashboard-card">
                        <h3>Total Drivers</h3>
                        <div class="value">${drivers.length}</div>
                        <div class="change">All drivers</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Active Drivers</h3>
                        <div class="value">${activeDrivers.length}</div>
                        <div class="change">Currently active</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Inactive Drivers</h3>
                        <div class="value">${inactiveDrivers.length}</div>
                        <div class="change">Not active</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Average Rating</h3>
                        <div class="value">${avgRating}</div>
                        <div class="change">${driversWithRating.length} rated</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 32px; margin-bottom: 16px;">All Drivers</h3>
                <table class="orders-table" style="margin-top: 16px;">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Phone</th>
                            <th>Email</th>
                            <th>Vehicle</th>
                            <th>Rating</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${driverRows || '<tr><td colspan="6" class="empty-state-cell"><div class="empty-state-text">No drivers found</div></td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Generate Customers Report
function generateCustomersReport(data) {
    if (!data || !data.orders) {
        return '<div>No order data available</div>';
    }
    
    const orders = data.orders;
    
    // Group orders by customer
    const customerMap = {};
    orders.forEach(order => {
        const customerName = extractCustomerName(order);
        if (customerName && customerName !== 'N/A' && customerName !== 'Unknown') {
            if (!customerMap[customerName]) {
                customerMap[customerName] = {
                    name: customerName,
                    orders: [],
                    totalSpent: 0,
                    orderCount: 0
                };
            }
            customerMap[customerName].orders.push(order);
            customerMap[customerName].totalSpent += parseFloat(order.total_price) || 0;
            customerMap[customerName].orderCount += 1;
        }
    });
    
    const customers = Object.values(customerMap)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 50); // Top 50 customers
    
    const totalCustomers = Object.keys(customerMap).length;
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    const avgOrderValue = customers.length > 0 ? (totalRevenue / customers.reduce((sum, c) => sum + c.orderCount, 0)) : 0;
    
    const customerRows = customers.map(customer => `
        <tr>
            <td><strong>${escapeHtml(customer.name)}</strong></td>
            <td>${customer.orderCount}</td>
            <td>${formatCurrency(customer.totalSpent, 'USD')}</td>
            <td>${formatCurrency(customer.totalSpent / customer.orderCount, 'USD')}</td>
        </tr>
    `).join('');
    
    return `
        <div class="table-container">
            <div style="padding: 24px;">
                <h2 style="margin-bottom: 16px;">Customer Analytics Report</h2>
                <p style="color: #64748b; margin-bottom: 24px;">Report generated at ${new Date().toLocaleString()}</p>
                
                <div class="dashboard-grid" style="margin-bottom: 32px;">
                    <div class="dashboard-card">
                        <h3>Total Customers</h3>
                        <div class="value">${totalCustomers}</div>
                        <div class="change">Unique customers</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Total Revenue</h3>
                        <div class="value" style="color: #22c55e;">${formatCurrency(totalRevenue, 'USD')}</div>
                        <div class="change">From top customers</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Average Order</h3>
                        <div class="value">${formatCurrency(avgOrderValue, 'USD')}</div>
                        <div class="change">Per order</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 32px; margin-bottom: 16px;">Top Customers (by Revenue)</h3>
                <table class="orders-table" style="margin-top: 16px;">
                    <thead>
                        <tr>
                            <th>Customer Name</th>
                            <th>Orders</th>
                            <th>Total Spent</th>
                            <th>Avg Order Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${customerRows || '<tr><td colspan="4" class="empty-state-cell"><div class="empty-state-text">No customer data</div></td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Show Reviews page
function showReviewsPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Reviews</h1>
        </div>
        
        <div class="reviews-list" id="reviewsList">
            <div class="empty-state">
                <div class="empty-state-text">Loading reviews...</div>
            </div>
        </div>
    `;
    
    loadReviews();
}

// Load reviews
async function loadReviews() {
    try {
        const response = await fetch(`${API_BASE}/api/reviews`, {
            headers: { 'x-session-id': sessionId || '' }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                displayReviews(data.reviews || []);
            }
        }
    } catch (error) {
        console.error('Error loading reviews:', error);
        displayReviews([]);
    }
}

// Display reviews
function displayReviews(reviews) {
    const reviewsList = document.getElementById('reviewsList');
    if (!reviewsList) return;
    
    if (!reviews || reviews.length === 0) {
        reviewsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-text">No reviews available</div>
            </div>
        `;
        return;
    }
    
    reviewsList.innerHTML = reviews.map(review => `
        <div class="review-item">
            <div class="review-header">
                <div class="review-customer">${escapeHtml(review.customer_name || 'Anonymous')}</div>
                <div class="review-rating">
                    ${generateStars(review.rating || 0)}
                </div>
            </div>
            <div class="review-comment">${escapeHtml(review.comment || 'No comment provided')}</div>
            <div class="review-meta">
                Order #${review.order_number || review.order_id || 'N/A'} • ${formatDate(review.created_at)}
            </div>
        </div>
    `).join('');
}

// Handle New Order button
function handleNewOrder() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Create New Order</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <form id="newOrderForm">
                    <div class="form-group">
                        <label>Customer Name <span style="color: #ef4444;">*</span></label>
                        <input type="text" name="customerName" required placeholder="Enter customer name">
                    </div>
                    <div class="form-group">
                        <label>Customer Phone <span style="color: #ef4444;">*</span></label>
                        <input type="tel" name="customerPhone" required placeholder="Enter phone number">
                    </div>
                    <div class="form-group">
                        <label>Customer Email</label>
                        <input type="email" name="customerEmail" placeholder="Enter email (optional)">
                    </div>
                    <div class="form-group">
                        <label>Delivery Address <span style="color: #ef4444;">*</span></label>
                        <textarea name="deliveryAddress" required placeholder="Enter delivery address"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Total Amount <span style="color: #ef4444;">*</span></label>
                        <input type="number" name="totalAmount" step="0.01" required placeholder="0.00" min="0">
                    </div>
                    <div class="form-group">
                        <label>Order Type <span style="color: #ef4444;">*</span></label>
                        <select name="orderType" required>
                            <option value="delivery">Delivery</option>
                            <option value="pickup">Pickup</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Notes</label>
                        <textarea name="notes" placeholder="Additional notes or special instructions (optional)"></textarea>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                        <button type="submit" class="btn-primary">Create Order</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    modal.querySelector('#newOrderForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        
        const orderData = {
            customerName: formData.get('customerName'),
            customerPhone: formData.get('customerPhone'),
            customerEmail: formData.get('customerEmail') || '',
            deliveryAddress: formData.get('deliveryAddress'),
            totalAmount: parseFloat(formData.get('totalAmount')),
            orderType: formData.get('orderType'),
            currency: 'USD',
            items: [],
            notes: formData.get('notes') || ''
        };
        
        // Validate
        if (!orderData.customerName || !orderData.customerPhone || !orderData.totalAmount || !orderData.orderType) {
            showNotification('Error', 'Please fill in all required fields', true);
            return;
        }
        
        // Show loading
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';
        
        try {
            const headers = {
                'Content-Type': 'application/json'
            };
            if (sessionId) {
                headers['x-session-id'] = sessionId;
            }
            
            const response = await fetch(`${API_BASE}/orders`, {
                method: 'POST',
                headers,
                body: JSON.stringify(orderData)
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                showNotification('Success', `Order created successfully: #${data.order?.gloriafood_order_id || 'N/A'}`);
                modal.remove();
                // Reload orders to show the new order
                loadOrders();
            } else {
                showNotification('Error', data.error || 'Failed to create order', true);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        } catch (error) {
            console.error('Error creating order:', error);
            showNotification('Error', 'Failed to create order: ' + error.message, true);
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// Handle New Driver button
function handleNewDriver() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Add New Driver</h2>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <form id="newDriverForm">
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" name="name" required>
                    </div>
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="tel" name="phone" required>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" name="email">
                    </div>
                    <div class="form-group">
                        <label>Vehicle Type</label>
                        <input type="text" name="vehicleType" placeholder="e.g., Motorcycle, Car">
                    </div>
                    <div class="form-group">
                        <label>Vehicle Plate</label>
                        <input type="text" name="vehiclePlate">
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
                        <button type="submit" class="btn-primary">Add Driver</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    modal.querySelector('#newDriverForm').addEventListener('submit', (e) => {
        e.preventDefault();
        showNotification('Info', 'Driver creation functionality - backend integration needed');
        modal.remove();
    });
}

// Edit driver
window.editDriver = function(driverId) {
    showNotification('Info', `Edit driver #${driverId} - functionality coming soon`);
};

// Load orders
async function loadOrders() {
    try {
        const url = `${API_BASE}/orders?limit=100`;
        
        // Build headers - sessionId is optional for /orders endpoint
        const headers = {};
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        const response = await fetch(url, { headers });
        
        if (!response.ok) {
            console.error('Orders API error:', response.status, response.statusText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Orders API response:', { 
            success: data.success, 
            count: data.count || data.orders?.length || 0,
            hasOrders: !!(data.orders || Array.isArray(data))
        });
        
        if (data.success !== false && (data.orders || Array.isArray(data))) {
            allOrders = data.orders || data || [];
            console.log(`Loaded ${allOrders.length} orders`);
            checkForNewOrders(allOrders);
            filterAndDisplayOrders();
        } else {
            console.warn('No orders in response:', data);
            allOrders = [];
            filterAndDisplayOrders();
        }
    } catch (error) {
        console.error('Error loading orders:', error);
        showError('Error connecting to server: ' + error.message);
        allOrders = [];
        filterAndDisplayOrders();
    }
}

// Filter and display orders
// Check if order is ASAP (as soon as possible)
function isOrderASAP(order) {
    if (!order.raw_data) {
        // If no raw_data, check if there's no delivery time - likely ASAP
        const deliveryTime = extractRequiredDeliveryTime(order) || extractTime(order, 'delivery_time') || order.delivery_time;
        if (!deliveryTime) {
            return true; // No delivery time usually means ASAP
        }
        return false;
    }
    
    try {
        const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
        
        // Check if order is explicitly marked as "later" or "scheduled" - NOT ASAP
        if (rawData.scheduled === true || rawData.scheduled === 'true' || rawData.scheduled === 1) {
            return false;
        }
        if (rawData.delivery?.scheduled === true || rawData.delivery?.scheduled === 'true') {
            return false;
        }
        if (rawData.order?.scheduled === true || rawData.order?.scheduled === 'true') {
            return false;
        }
        if (rawData.later === true || rawData.later === 'true' || rawData.later === 1) {
            return false;
        }
        if (rawData.delivery?.later === true || rawData.delivery?.later === 'true') {
            return false;
        }
        if (rawData.order?.later === true || rawData.order?.later === 'true') {
            return false;
        }
        
        // Check ASAP field
        if (rawData.asap === true || rawData.asap === 'true' || rawData.asap === 1) {
            return true;
        }
        if (rawData.delivery?.asap === true || rawData.delivery?.asap === 'true') {
            return true;
        }
        if (rawData.order?.asap === true || rawData.order?.asap === 'true') {
            return true;
        }
        
        // Check if delivery time is very soon (within 30 minutes) - likely ASAP
        const deliveryTime = extractRequiredDeliveryTime(order) || extractTime(order, 'delivery_time') || order.delivery_time;
        if (deliveryTime) {
            const deliveryDate = new Date(deliveryTime);
            const now = new Date();
            const diffMinutes = (deliveryDate.getTime() - now.getTime()) / (1000 * 60);
            // If delivery time is within 30 minutes, it's likely ASAP
            if (diffMinutes <= 30 && diffMinutes >= -30) {
                return true;
            }
            // If delivery time is more than 30 minutes in the future, it's likely scheduled (NOT ASAP)
            if (diffMinutes > 30) {
                return false;
            }
        } else {
            // No delivery time specified - likely ASAP
            return true;
        }
        
        return false;
    } catch (e) {
        // If parsing fails, assume it might be ASAP if no delivery time
        const deliveryTime = extractRequiredDeliveryTime(order) || extractTime(order, 'delivery_time') || order.delivery_time;
        return !deliveryTime;
    }
}

// Check if order is scheduled (has future delivery time and not ASAP)
function isOrderScheduled(order) {
    // If it's completed, cancelled, or failed, it's not scheduled
    const status = (order.status || '').toUpperCase();
    if (['DELIVERED', 'CANCELLED', 'FAILED', 'COMPLETED'].includes(status)) {
        return false;
    }
    
    // Must NOT be ASAP
    if (isOrderASAP(order)) {
        return false;
    }
    
    // Check if order has a delivery time in the future
    const deliveryTime = extractRequiredDeliveryTime(order) || extractTime(order, 'delivery_time') || order.delivery_time;
    if (!deliveryTime) {
        return false;
    }
    
    try {
        const deliveryDate = new Date(deliveryTime);
        const now = new Date();
        
        // Must be in the future (more than 30 minutes from now)
        const diffMinutes = (deliveryDate.getTime() - now.getTime()) / (1000 * 60);
        if (diffMinutes > 30) {
            // Has future delivery time and is not ASAP - it's scheduled
            return true;
        }
    } catch (e) {
        return false;
    }
    
    return false;
}

function filterAndDisplayOrders() {
    let filtered = [...allOrders];
    
    // Apply status filter
    if (currentStatusFilter === 'current') {
        // Current: Only ASAP orders (soon as possible) that are active
        filtered = filtered.filter(order => {
            const status = (order.status || '').toUpperCase();
            // Must be active and ASAP
            return status && 
                   !['DELIVERED', 'CANCELLED', 'FAILED', 'COMPLETED'].includes(status) &&
                   isOrderASAP(order);
        });
    } else if (currentStatusFilter === 'scheduled') {
        // Scheduled: Orders with future delivery time that are not ASAP (later orders)
        filtered = filtered.filter(order => isOrderScheduled(order));
    } else if (currentStatusFilter === 'completed') {
        // Completed: Orders with DELIVERED or COMPLETED status
        filtered = filtered.filter(order => {
            const status = (order.status || '').toUpperCase();
            return ['DELIVERED', 'COMPLETED'].includes(status);
        });
    } else if (currentStatusFilter === 'incomplete') {
        // Incomplete: Cancelled, failed, or other incomplete statuses
        filtered = filtered.filter(order => {
            const status = (order.status || '').toUpperCase();
            return ['CANCELLED', 'FAILED'].includes(status) || 
                   (status && !['DELIVERED', 'COMPLETED', 'ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(status));
        });
    } else if (currentStatusFilter === 'history') {
        // History: All orders (no filter)
        filtered = filtered;
    }
    
    // Apply search filter
    if (searchQuery) {
        filtered = filtered.filter(order => {
            const searchableText = [
                order.gloriafood_order_id || order.id,
                extractCustomerName(order),
                order.customer_phone,
                order.customer_email,
                extractDeliveryAddress(order),
                order.status
            ].join(' ').toLowerCase();
            
            return searchableText.includes(searchQuery);
        });
    }
    
    displayOrders(filtered);
}

// Display orders in table
function displayOrders(orders) {
    const tbody = document.getElementById('ordersTableBody');
    
    if (!tbody) {
        console.error('Orders table body not found!');
        return;
    }
    
    if (!orders || orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="empty-state-cell">
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <line x1="8" y1="6" x2="21" y2="6"></line>
                                <line x1="8" y1="12" x2="21" y2="12"></line>
                                <line x1="8" y1="18" x2="21" y2="18"></line>
                                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                <line x1="3" y1="18" x2="3.01" y2="18"></line>
                            </svg>
                        </div>
                        <div class="empty-state-text">You currently have no orders</div>
                    </div>
                </td>
            </tr>
        `;
        updateDeleteSelectedButton();
        return;
    }
    
    try {
        const rows = orders.map(order => createOrderRow(order)).join('');
        tbody.innerHTML = rows;
        updateDeleteSelectedButton();
    } catch (error) {
        console.error('Error displaying orders:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="empty-state-cell">
                    <div class="empty-state">
                        <div class="empty-state-text">Error displaying orders: ${error.message}</div>
                    </div>
                </td>
            </tr>
        `;
        updateDeleteSelectedButton();
    }
}

// Extract delivery address from order data (including raw_data fallback)
function extractDeliveryAddress(order) {
    // If delivery_address exists and is not empty, use it
    if (order.delivery_address && order.delivery_address.trim() && order.delivery_address !== 'N/A') {
        return order.delivery_address;
    }
    
    // Try to extract from raw_data if available
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            
            // Try root level client_address first (GloriaFood format)
            if (rawData.client_address && String(rawData.client_address).trim()) {
                return String(rawData.client_address).trim();
            }
            
            // Try client_address_parts (GloriaFood structured format)
            if (rawData.client_address_parts) {
                const parts = rawData.client_address_parts;
                const addressParts = [
                    parts.street || parts.address_line_1 || parts.address,
                    parts.more_address || parts.address_line_2 || parts.apt || parts.apartment,
                    parts.city || parts.locality || parts.town,
                    parts.state || parts.province || parts.region,
                    parts.zip || parts.postal_code || parts.postcode,
                    parts.country || parts.country_code
                ].filter(Boolean).map(s => String(s).trim());
                if (addressParts.length > 0) {
                    return addressParts.join(', ');
                }
            }
            
            // Try delivery.address object
            if (rawData.delivery?.address) {
                const addr = rawData.delivery.address;
                const addressParts = [
                    addr.street || addr.address_line_1 || addr.address || addr.line1 || addr.line_1 || addr.street_address,
                    addr.address_line_2 || addr.line2 || addr.line_2 || addr.apt || addr.apartment || addr.unit,
                    addr.city || addr.locality || addr.town,
                    addr.state || addr.province || addr.region || addr.state_province,
                    addr.zip || addr.postal_code || addr.postcode || addr.zip_code || addr.postal,
                    addr.country || addr.country_code
                ].filter(Boolean).map(s => String(s).trim());
                if (addressParts.length > 0) {
                    return addressParts.join(', ');
                }
                // Try full_address field
                if (addr.full_address && String(addr.full_address).trim()) return String(addr.full_address).trim();
                if (addr.formatted_address && String(addr.formatted_address).trim()) return String(addr.formatted_address).trim();
            }
            
            // Try delivery object with direct fields
            if (rawData.delivery) {
                const addr = rawData.delivery;
                if (addr.street || addr.city || addr.address || addr.address_line_1) {
                    const addressParts = [
                        addr.street || addr.address || addr.address_line_1 || addr.street_address,
                        addr.address_line_2 || addr.line2 || addr.apt || addr.apartment,
                        addr.city || addr.town || addr.locality,
                        addr.state || addr.province || addr.region,
                        addr.zip || addr.postal_code || addr.postcode || addr.zip_code,
                        addr.country || addr.country_code
                    ].filter(Boolean).map(s => String(s).trim());
                    if (addressParts.length > 0) {
                        return addressParts.join(', ');
                    }
                }
                if (addr.full_address && String(addr.full_address).trim()) return String(addr.full_address).trim();
                if (addr.formatted_address && String(addr.formatted_address).trim()) return String(addr.formatted_address).trim();
            }
            
            // Try root level fields
            if (rawData.delivery_address && String(rawData.delivery_address).trim()) return String(rawData.delivery_address).trim();
            if (rawData.address && String(rawData.address).trim()) return String(rawData.address).trim();
            if (rawData.shipping_address && String(rawData.shipping_address).trim()) return String(rawData.shipping_address).trim();
            
            // Try nested in order object
            if (rawData.order?.delivery?.address) {
                const addr = rawData.order.delivery.address;
                const addressParts = [
                    addr.street || addr.address_line_1 || addr.address || addr.line1,
                    addr.city || addr.locality,
                    addr.state || addr.province,
                    addr.zip || addr.postal_code || addr.postcode,
                    addr.country
                ].filter(Boolean).map(s => String(s).trim());
                if (addressParts.length > 0) {
                    return addressParts.join(', ');
                }
            }
            if (rawData.order?.delivery_address && String(rawData.order.delivery_address).trim()) return String(rawData.order.delivery_address).trim();
        } catch (e) {
            console.warn('Error parsing raw_data for delivery address:', e);
        }
    }
    
    return order.delivery_address || 'N/A';
}

// Extract time information from order data
function extractTime(order, fieldName) {
    // Try direct field first
    if (order[fieldName]) {
        return order[fieldName];
    }
    
    // Try to extract from raw_data
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            
            // Try various field name variations
            const candidates = [
                rawData[fieldName],
                rawData[fieldName.replace(/_/g, '')],
                rawData[fieldName.replace(/_/g, '-')],
                rawData[fieldName.charAt(0).toUpperCase() + fieldName.slice(1)],
                rawData.delivery?.[fieldName],
                rawData.delivery?.[fieldName.replace(/_/g, '')],
                rawData.order?.[fieldName],
                rawData.order?.delivery?.[fieldName]
            ];
            
            for (const candidate of candidates) {
                if (candidate) {
                    return candidate;
                }
            }
        } catch (e) {
            console.warn(`Error parsing raw_data for ${fieldName}:`, e);
        }
    }
    
    return null;
}

// Extract required pickup time from order data
function extractRequiredPickupTime(order) {
    // Try direct fields first
    if (order.required_pickup_time) return order.required_pickup_time;
    if (order.req_pickup_time) return order.req_pickup_time;
    if (order.requested_pickup_time) return order.requested_pickup_time;
    if (order.scheduled_pickup_time) return order.scheduled_pickup_time;
    if (order.pickup_time) return order.pickup_time;
    if (order.pickup_datetime) return order.pickup_datetime;
    if (order.pickup_date) return order.pickup_date;
    if (order.scheduled_pickup_datetime) return order.scheduled_pickup_datetime;
    
    // Try to extract from raw_data
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            
            const candidates = [
                // Standard variations
                rawData.required_pickup_time,
                rawData.req_pickup_time,
                rawData.requested_pickup_time,
                rawData.pickup_time_required,
                rawData.scheduled_pickup_time,
                rawData.pickup_time,
                rawData.pickup_datetime,
                rawData.pickup_date,
                rawData.scheduled_pickup_datetime,
                rawData.pickup_scheduled_time,
                rawData.pickup_scheduled_datetime,
                // Nested in pickup object
                rawData.pickup?.time,
                rawData.pickup?.scheduled_time,
                rawData.pickup?.required_time,
                rawData.pickup?.datetime,
                rawData.pickup?.date,
                // Nested in delivery object
                rawData.delivery?.required_pickup_time,
                rawData.delivery?.req_pickup_time,
                rawData.delivery?.scheduled_pickup_time,
                rawData.delivery?.pickup_time,
                rawData.delivery?.pickup_datetime,
                rawData.delivery?.pickup?.time,
                // Nested in order object
                rawData.order?.required_pickup_time,
                rawData.order?.req_pickup_time,
                rawData.order?.pickup_time,
                rawData.order?.pickup_datetime,
                rawData.order?.delivery?.required_pickup_time,
                rawData.order?.delivery?.pickup_time,
                rawData.order?.pickup?.time,
                rawData.order?.pickup?.scheduled_time,
                rawData.order?.pickup?.datetime,
                // Additional variations
                rawData.scheduled_time,
                rawData.scheduled_datetime,
                rawData.estimated_pickup_time,
                rawData.estimated_pickup_datetime,
                rawData.order?.scheduled_time,
                rawData.order?.scheduled_datetime
            ];
            
            for (const candidate of candidates) {
                if (candidate && candidate !== null && candidate !== undefined && candidate !== '') {
                    console.log('Found required pickup time:', candidate, 'from order:', order.gloriafood_order_id || order.id);
                    return candidate;
                }
            }
            
            // Debug: log raw_data structure if no candidate found
            if (order.gloriafood_order_id || order.id) {
                console.log('No pickup time found for order:', order.gloriafood_order_id || order.id);
                console.log('Raw data keys:', Object.keys(rawData));
                if (rawData.pickup) console.log('Pickup object keys:', Object.keys(rawData.pickup));
                if (rawData.delivery) console.log('Delivery object keys:', Object.keys(rawData.delivery));
                if (rawData.order) console.log('Order object keys:', Object.keys(rawData.order));
            }
        } catch (e) {
            console.warn('Error parsing raw_data for required pickup time:', e);
        }
    }
    
    return null;
}

// Extract required delivery time from order data
function extractRequiredDeliveryTime(order) {
    // Try direct fields first
    if (order.required_delivery_time) return order.required_delivery_time;
    if (order.req_delivery_time) return order.req_delivery_time;
    if (order.requested_delivery_time) return order.requested_delivery_time;
    if (order.scheduled_delivery_time) return order.scheduled_delivery_time;
    if (order.delivery_time) return order.delivery_time;
    if (order.delivery_datetime) return order.delivery_datetime;
    if (order.delivery_date) return order.delivery_date;
    if (order.scheduled_delivery_datetime) return order.scheduled_delivery_datetime;
    
    // Try to extract from raw_data
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            
            const candidates = [
                // Standard variations
                rawData.required_delivery_time,
                rawData.req_delivery_time,
                rawData.requested_delivery_time,
                rawData.delivery_time_required,
                rawData.scheduled_delivery_time,
                rawData.delivery_time,
                rawData.delivery_datetime,
                rawData.delivery_date,
                rawData.scheduled_delivery_datetime,
                rawData.delivery_scheduled_time,
                rawData.delivery_scheduled_datetime,
                // Nested in delivery object
                rawData.delivery?.time,
                rawData.delivery?.scheduled_time,
                rawData.delivery?.required_time,
                rawData.delivery?.required_delivery_time,
                rawData.delivery?.req_delivery_time,
                rawData.delivery?.scheduled_delivery_time,
                rawData.delivery?.delivery_time,
                rawData.delivery?.delivery_datetime,
                rawData.delivery?.delivery_date,
                rawData.delivery?.datetime,
                rawData.delivery?.date,
                rawData.delivery?.scheduled_datetime,
                // Nested in order object
                rawData.order?.required_delivery_time,
                rawData.order?.req_delivery_time,
                rawData.order?.delivery_time,
                rawData.order?.delivery_datetime,
                rawData.order?.delivery_date,
                rawData.order?.delivery?.required_delivery_time,
                rawData.order?.delivery?.time,
                rawData.order?.delivery?.scheduled_time,
                rawData.order?.delivery?.delivery_time,
                rawData.order?.delivery?.delivery_datetime,
                rawData.order?.delivery?.datetime,
                // GloriaFood specific fields
                rawData.asap,
                rawData.delivery?.asap,
                rawData.order?.asap,
                // Additional variations
                rawData.scheduled_time,
                rawData.scheduled_datetime,
                rawData.estimated_delivery_time,
                rawData.estimated_delivery_datetime,
                rawData.order?.scheduled_time,
                rawData.order?.scheduled_datetime
            ];
            
            for (const candidate of candidates) {
                if (candidate && candidate !== null && candidate !== undefined && candidate !== '') {
                    // Debug: log what we found
                    console.log('Found delivery time:', candidate, 'from order:', order.gloriafood_order_id || order.id);
                    return candidate;
                }
            }
            
            // Try to extract from time fields that might be in different formats
            // Check for time strings that might need parsing
            const timeFields = [
                rawData.time,
                rawData.delivery?.time,
                rawData.order?.time,
                rawData.scheduled_time,
                rawData.order?.scheduled_time
            ];
            
            for (const timeField of timeFields) {
                if (timeField && timeField !== null && timeField !== undefined && timeField !== '') {
                    console.log('Found time field (potential delivery time):', timeField, 'from order:', order.gloriafood_order_id || order.id);
                    return timeField;
                }
            }
            
            // Debug: log raw_data structure if no candidate found
            if (order.gloriafood_order_id || order.id) {
                console.log('No delivery time found for order:', order.gloriafood_order_id || order.id);
                console.log('Raw data keys:', Object.keys(rawData));
                if (rawData.delivery) {
                    console.log('Delivery object keys:', Object.keys(rawData.delivery));
                    console.log('Delivery object:', JSON.stringify(rawData.delivery, null, 2));
                }
                if (rawData.order) {
                    console.log('Order object keys:', Object.keys(rawData.order));
                }
                // Log full raw_data for debugging (first 500 chars)
                console.log('Raw data sample:', JSON.stringify(rawData).substring(0, 500));
            }
        } catch (e) {
            console.warn('Error parsing raw_data for required delivery time:', e);
        }
    }
    
    return null;
}

// Extract DoorDash tracking URL
function extractDoorDashTrackingUrl(order) {
    // Try direct field first
    if (order.doordash_tracking_url) {
        return order.doordash_tracking_url;
    }
    
    // Try to extract from raw_data
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            
            const candidates = [
                rawData.doordash_tracking_url,
                rawData.tracking_url,
                rawData.tracking_link,
                rawData.delivery?.doordash_tracking_url,
                rawData.delivery?.tracking_url,
                rawData.delivery?.tracking_link,
                rawData.order?.doordash_tracking_url,
                rawData.order?.tracking_url
            ];
            
            for (const candidate of candidates) {
                if (candidate && String(candidate).includes('doordash')) {
                    return candidate;
                }
            }
            
            // If no doordash-specific URL, try any tracking URL
            for (const candidate of candidates) {
                if (candidate) {
                    return candidate;
                }
            }
        } catch (e) {
            console.warn('Error parsing raw_data for tracking URL:', e);
        }
    }
    
    return null;
}

// Extract distance from order data
function extractDistance(order) {
    // Try direct fields first
    if (order.distance !== null && order.distance !== undefined && order.distance !== '') {
        return parseFloat(order.distance) || order.distance;
    }
    
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            
            const candidates = [
                rawData.distance,
                rawData.distance_km,
                rawData.distance_miles,
                rawData.delivery?.distance,
                rawData.delivery?.distance_km,
                rawData.delivery?.distance_miles,
                rawData.delivery?.delivery_distance,
                rawData.order?.distance,
                rawData.order?.distance_km,
                rawData.order?.delivery?.distance,
                rawData.order?.delivery?.distance_km,
                rawData.order?.delivery?.delivery_distance,
                rawData.client?.distance,
                rawData.client?.distance_km,
                rawData.restaurant?.distance,
                rawData.restaurant?.distance_km,
                // DoorDash fields
                rawData.doordash?.distance,
                rawData.doordash?.distance_km,
                rawData.delivery?.doordash?.distance,
                // Calculate from coordinates if available
                rawData.delivery?.lat && rawData.delivery?.lng ? null : null, // Will calculate below
                rawData.order?.delivery?.lat && rawData.order?.delivery?.lng ? null : null
            ];
            
            for (const candidate of candidates) {
                if (candidate !== null && candidate !== undefined && candidate !== '') {
                    const numValue = parseFloat(candidate);
                    if (!isNaN(numValue)) {
                        console.log('Found distance:', numValue, 'from order:', order.gloriafood_order_id || order.id);
                        return numValue;
                    }
                }
            }
            
            // Try to calculate distance from coordinates if available
            const deliveryLat = rawData.delivery?.lat || rawData.order?.delivery?.lat || rawData.lat;
            const deliveryLng = rawData.delivery?.lng || rawData.order?.delivery?.lng || rawData.lng;
            const restaurantLat = rawData.restaurant?.lat || rawData.store?.lat;
            const restaurantLng = rawData.restaurant?.lng || rawData.store?.lng;
            
            if (deliveryLat && deliveryLng && restaurantLat && restaurantLng) {
                // Calculate distance using Haversine formula
                const distance = calculateDistance(
                    parseFloat(restaurantLat),
                    parseFloat(restaurantLng),
                    parseFloat(deliveryLat),
                    parseFloat(deliveryLng)
                );
                if (distance > 0) {
                    console.log('Calculated distance:', distance, 'from coordinates for order:', order.gloriafood_order_id || order.id);
                    return distance;
                }
            }
        } catch (e) {
            console.warn('Error parsing raw_data for distance:', e);
        }
    }
    
    return null;
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

// Extract driver name from order data
function extractDriverName(order) {
    if (order.driver_name) {
        return order.driver_name;
    }
    
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            
            const candidates = [
                rawData.driver_name,
                rawData.driver?.name,
                rawData.driver?.full_name,
                rawData.delivery?.driver_name,
                rawData.delivery?.driver?.name,
                rawData.order?.driver_name,
                rawData.order?.driver?.name
            ];
            
            for (const candidate of candidates) {
                if (candidate && String(candidate).trim()) {
                    return String(candidate).trim();
                }
            }
        } catch (e) {
            console.warn('Error parsing raw_data for driver name:', e);
        }
    }
    
    return null;
}

// Extract customer name from order data (including raw_data fallback)
function extractCustomerName(order) {
    // If customer_name exists and is not "Unknown", use it
    if (order.customer_name && order.customer_name !== 'Unknown' && order.customer_name.trim()) {
        return order.customer_name;
    }
    
    // Try to extract from raw_data if available
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            
            // Try root level client_* fields first (GloriaFood format)
            if (rawData.client_first_name || rawData.client_last_name) {
                const name = `${rawData.client_first_name || ''} ${rawData.client_last_name || ''}`.trim();
                if (name) return name;
            }
            if (rawData.client_name && String(rawData.client_name).trim()) return String(rawData.client_name).trim();
            
            // Try client object
            if (rawData.client) {
                if (rawData.client.first_name || rawData.client.last_name) {
                    const name = `${rawData.client.first_name || ''} ${rawData.client.last_name || ''}`.trim();
                    if (name) return name;
                }
                if (rawData.client.name) return String(rawData.client.name);
                if (rawData.client.full_name) return String(rawData.client.full_name);
            }
            
            // Try customer object
            if (rawData.customer) {
                if (rawData.customer.name) return String(rawData.customer.name);
                if (rawData.customer.first_name || rawData.customer.last_name) {
                    const name = `${rawData.customer.first_name || ''} ${rawData.customer.last_name || ''}`.trim();
                    if (name) return name;
                }
                if (rawData.customer.full_name) return String(rawData.customer.full_name);
            }
            
            // Try root level fields
            if (rawData.customer_name && String(rawData.customer_name).trim()) return String(rawData.customer_name).trim();
            if (rawData.name && String(rawData.name).trim()) return String(rawData.name).trim();
            
            // Try nested in order object
            if (rawData.order?.client?.first_name || rawData.order?.client?.last_name) {
                const name = `${rawData.order.client.first_name || ''} ${rawData.order.client.last_name || ''}`.trim();
                if (name) return name;
            }
            if (rawData.order?.customer?.name) return String(rawData.order.customer.name);
            if (rawData.order?.customer_name) return String(rawData.order.customer_name);
        } catch (e) {
            console.warn('Error parsing raw_data for customer name:', e);
        }
    }
    
    // Fallback to stored value or N/A
    return order.customer_name && order.customer_name !== 'Unknown' ? order.customer_name : 'N/A';
}

// Create order table row
function createOrderRow(order) {
    if (!order) return '';
    
    const orderId = order.gloriafood_order_id || order.id || 'N/A';
    const status = (order.status || 'UNKNOWN').toUpperCase();
    const customerName = escapeHtml(extractCustomerName(order));
    const customerAddress = escapeHtml(extractDeliveryAddress(order));
    const amount = formatCurrency(order.total_price || 0, order.currency || 'USD');
    const orderPlaced = formatDate(order.fetched_at || order.created_at || order.updated_at);
    
    // Extract required pickup time (always show if available)
    // Try required pickup time first, then fallback to any pickup time
    let reqPickupTimeValue = extractRequiredPickupTime(order);
    if (!reqPickupTimeValue) {
        // Fallback to regular pickup_time if required is not available
        reqPickupTimeValue = extractTime(order, 'pickup_time') || order.pickup_time;
    }
    // Also try created_at or order_date as last resort
    if (!reqPickupTimeValue) {
        reqPickupTimeValue = order.created_at || order.order_date || order.fetched_at;
    }
    const reqPickupTime = reqPickupTimeValue ? formatDate(reqPickupTimeValue) : 'N/A';
    
    // Extract required delivery time (always show if available)
    // Try required delivery time first, then fallback to any delivery time
    let reqDeliveryTimeValue = extractRequiredDeliveryTime(order);
    if (!reqDeliveryTimeValue) {
        // Fallback to regular delivery_time if required is not available
        reqDeliveryTimeValue = extractTime(order, 'delivery_time') || order.delivery_time;
    }
    // Also try pickup_time as fallback for delivery time if still not found
    if (!reqDeliveryTimeValue) {
        reqDeliveryTimeValue = extractTime(order, 'pickup_time') || order.pickup_time;
    }
    // Last resort: use created_at + estimated delivery time
    if (!reqDeliveryTimeValue && order.created_at) {
        const createdDate = new Date(order.created_at);
        createdDate.setMinutes(createdDate.getMinutes() + 45); // Default 45 min delivery
        reqDeliveryTimeValue = createdDate.toISOString();
    }
    const reqDeliveryTime = reqDeliveryTimeValue ? formatDate(reqDeliveryTimeValue) : 'N/A';
    
    // Extract ready for pickup status (check if order is ready)
    const readyForPickupValue = extractTime(order, 'ready_for_pickup') || order.ready_for_pickup;
    const isReadyForPickup = readyForPickupValue ? true : false;
    const readyForPickupDate = readyForPickupValue ? formatDate(readyForPickupValue) : null;
    
    // Extract distance (always show if available)
    const distanceValue = extractDistance(order);
    const distance = distanceValue !== null && distanceValue !== undefined && distanceValue !== '' 
        ? `${distanceValue} km` 
        : 'N/A';
    
    // Extract driver
    const driverValue = extractDriverName(order);
    const driver = driverValue ? escapeHtml(driverValue) : 'N/A';
    const hasDriver = driverValue ? true : false;
    
    // Extract DoorDash tracking URL
    const trackingUrl = extractDoorDashTrackingUrl(order);
    let tracking = 'N/A';
    if (trackingUrl) {
        tracking = `<a href="${escapeHtml(trackingUrl)}" target="_blank" style="color: #22c55e; text-decoration: underline;">Track</a>`;
    }
    
    // Create ready for pickup toggle switch (always clickable)
    const readyForPickupToggle = `
        <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
            <label class="toggle-switch" style="cursor: pointer;">
                <input type="checkbox" class="ready-pickup-toggle" 
                       data-order-id="${escapeHtml(String(orderId))}" 
                       ${isReadyForPickup ? 'checked' : ''}
                       onchange="toggleReadyForPickup('${escapeHtml(String(orderId))}', this.checked)"
                       style="cursor: pointer;">
                <span class="toggle-slider" style="cursor: pointer;"></span>
            </label>
            ${readyForPickupDate ? `<div style="font-size: 11px; color: #64748b;">${readyForPickupDate}</div>` : ''}
        </div>
    `;
    
    // Create driver cell with auto assign button
    const driverCell = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
            <div>${driver}</div>
            ${!hasDriver ? `
                <button class="btn-auto-assign" 
                        onclick="autoAssignDriver('${escapeHtml(String(orderId))}')" 
                        title="Auto Assign Driver"
                        style="padding: 4px 8px; font-size: 11px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    Auto Assign
                </button>
            ` : ''}
        </div>
    `;
    
    return `
        <tr data-order-id="${escapeHtml(String(orderId))}">
            <td>
                <input type="checkbox" class="order-checkbox" value="${escapeHtml(String(orderId))}">
            </td>
            <td><strong>#${escapeHtml(String(orderId))}</strong></td>
            <td>${customerName}</td>
            <td>${customerAddress}</td>
            <td>${amount}</td>
            <td>${distance}</td>
            <td>${orderPlaced}</td>
            <td>${reqPickupTime}</td>
            <td>${reqDeliveryTime}</td>
            <td>${readyForPickupToggle}</td>
            <td>${driverCell}</td>
            <td><span class="status-badge status-${status}">${escapeHtml(status)}</span></td>
            <td>${tracking}</td>
            <td>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <button class="btn-icon btn-details" onclick="showOrderDetails('${escapeHtml(String(orderId))}')" title="View order details">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteOrder('${escapeHtml(String(orderId))}')" title="Delete order">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Check for new orders and show notifications
function checkForNewOrders(orders) {
    const currentOrderIds = new Set(orders.map(o => o.gloriafood_order_id || o.id));
    
    // Find new orders
    const newOrders = orders.filter(order => {
        const orderId = order.gloriafood_order_id || order.id;
        return orderId && !lastOrderIds.has(orderId);
    });
    
    if (newOrders.length > 0) {
        newOrders.forEach(order => {
            const orderId = order.gloriafood_order_id || order.id;
            const customerName = extractCustomerName(order);
            showNotification(`New Order #${orderId}`, 
                `${customerName !== 'N/A' ? customerName : 'Customer'} - ${formatCurrency(order.total_price || 0, order.currency || 'USD')}`);
            
            showBrowserNotification(order);
        });
        
        lastOrderIds = currentOrderIds;
    }
}

// Show notification
function showNotification(title, message, isError = false) {
    let notification = document.getElementById('notification');
    
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification hidden';
        document.body.appendChild(notification);
    }
    
    notification.innerHTML = `<strong>${title}</strong>: ${message}`;
    notification.className = `notification ${isError ? 'error' : 'success'}`;
    notification.classList.remove('hidden');
    
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 5000);
}

// Show browser notification
function showBrowserNotification(order) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const orderId = order.gloriafood_order_id || order.id;
        const customerName = extractCustomerName(order);
        new Notification(`New Order #${orderId}`, {
            body: `${customerName !== 'N/A' ? customerName : 'Customer'} - ${formatCurrency(order.total_price || 0, order.currency || 'USD')}`,
            icon: '🍽️',
            badge: '🍽️',
            tag: `order-${orderId}`,
            requireInteraction: false
        });
    }
}

// Show error
function showError(message) {
    showNotification('Error', message, true);
}

// Start auto-refresh
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    console.log('🔄 Starting auto-refresh (every', REFRESH_INTERVAL / 1000, 'seconds)');
    
    autoRefreshInterval = setInterval(() => {
        if (sessionId || window.location.pathname === '/') {
            // Load orders even if not logged in (for public access)
            loadOrders();
            if (sessionId) {
                loadDashboardData();
                loadDrivers();
                loadReviews();
            }
        }
    }, REFRESH_INTERVAL);
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Format currency
function formatCurrency(amount, currency = 'USD') {
    if (!amount) return 'N/A';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return 'N/A';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD'
    }).format(numAmount);
}

// Format date
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    
    try {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    } catch (e) {
        return dateStr;
    }
}

// Escape HTML
function escapeHtml(text) {
    if (!text) return 'N/A';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Handle Notifications button
const notificationsBtn = document.getElementById('notificationsBtn');
if (notificationsBtn) {
    notificationsBtn.addEventListener('click', () => {
        showNotification('Notifications', 'You have no new notifications');
    });
}

// Debug function - check database status
window.checkDatabaseStatus = async function() {
    console.log('=== Database Status Check ===');
    console.log('API Base:', API_BASE);
    console.log('Session ID:', sessionId || 'Not logged in');
    
    try {
        // Check orders endpoint
        const ordersRes = await fetch(`${API_BASE}/orders?limit=5`);
        const ordersData = await ordersRes.json();
        console.log('Orders API Response:', ordersData);
        console.log('Orders Count:', ordersData.count || ordersData.orders?.length || 0);
        
        // Check stats endpoint
        const statsRes = await fetch(`${API_BASE}/stats`);
        const statsData = await statsRes.json();
        console.log('Stats API Response:', statsData);
        
        // Check health
        const healthRes = await fetch(`${API_BASE}/health`);
        const healthData = await healthRes.json();
        console.log('Health Check:', healthData);
        
        alert(`Database Status:\nOrders: ${ordersData.count || 0}\nTotal: ${statsData.total_orders || 0}\nCheck console for details`);
    } catch (error) {
        console.error('Database check error:', error);
        alert('Error checking database. See console for details.');
    }
};

// Debug function - inspect order data for delivery time
window.inspectOrderData = function(orderId) {
    const order = allOrders.find(o => (o.gloriafood_order_id || o.id) == orderId);
    if (!order) {
        console.error('Order not found:', orderId);
        return;
    }
    
    console.log('=== Order Data Inspection ===');
    console.log('Order ID:', orderId);
    console.log('Full Order:', order);
    
    if (order.raw_data) {
        try {
            const rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
            console.log('=== Raw Data ===');
            console.log('Raw Data:', rawData);
            console.log('Raw Data Keys:', Object.keys(rawData));
            
            // Check for delivery time fields
            console.log('=== Delivery Time Fields ===');
            console.log('delivery_time:', rawData.delivery_time);
            console.log('delivery_datetime:', rawData.delivery_datetime);
            console.log('delivery_date:', rawData.delivery_date);
            console.log('scheduled_delivery_time:', rawData.scheduled_delivery_time);
            console.log('required_delivery_time:', rawData.required_delivery_time);
            console.log('req_delivery_time:', rawData.req_delivery_time);
            
            if (rawData.delivery) {
                console.log('=== Delivery Object ===');
                console.log('delivery:', rawData.delivery);
                console.log('delivery keys:', Object.keys(rawData.delivery));
                console.log('delivery.time:', rawData.delivery.time);
                console.log('delivery.datetime:', rawData.delivery.datetime);
                console.log('delivery.delivery_time:', rawData.delivery.delivery_time);
            }
            
            if (rawData.order) {
                console.log('=== Order Object ===');
                console.log('order:', rawData.order);
                if (rawData.order.delivery) {
                    console.log('order.delivery:', rawData.order.delivery);
                    console.log('order.delivery keys:', Object.keys(rawData.order.delivery));
                }
            }
            
            // Test extraction
            const reqDeliveryTime = extractRequiredDeliveryTime(order);
            console.log('=== Extraction Result ===');
            console.log('extractRequiredDeliveryTime result:', reqDeliveryTime);
            
        } catch (e) {
            console.error('Error parsing raw_data:', e);
        }
    } else {
        console.log('No raw_data found in order');
    }
    
    return order;
};

// Update delete selected button visibility
function updateDeleteSelectedButton() {
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (!deleteSelectedBtn) return;
    
    const checkedBoxes = document.querySelectorAll('.order-checkbox:checked');
    if (checkedBoxes.length > 0) {
        deleteSelectedBtn.style.display = 'inline-block';
        deleteSelectedBtn.textContent = `🗑️ Delete Selected (${checkedBoxes.length})`;
    } else {
        deleteSelectedBtn.style.display = 'none';
    }
}

// Show order details modal
window.showOrderDetails = function(orderId) {
    // Find the order in allOrders
    const order = allOrders.find(o => (o.gloriafood_order_id || o.id) === orderId);
    
    if (!order) {
        showNotification('Error', 'Order not found', true);
        return;
    }
    
    // Parse raw_data if available
    let rawData = null;
    try {
        if (order.raw_data) {
            rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
        }
    } catch (e) {
        console.warn('Error parsing raw_data:', e);
    }
    
    // Parse items if available
    let items = [];
    try {
        if (order.items) {
            items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
        } else if (rawData?.items) {
            items = rawData.items;
        } else if (rawData?.order_items) {
            items = rawData.order_items;
        }
    } catch (e) {
        console.warn('Error parsing items:', e);
    }
    
    // Extract customer information
    const customerName = extractCustomerName(order);
    const customerPhone = order.customer_phone || rawData?.client_phone || rawData?.client?.phone || rawData?.customer?.phone || 'N/A';
    const customerEmail = order.customer_email || rawData?.client_email || rawData?.client?.email || rawData?.customer?.email || 'N/A';
    
    // Extract delivery address
    const deliveryAddress = extractDeliveryAddress(order);
    
    // Extract required pickup time (always show if available)
    // Try required pickup time first, then fallback to any pickup time
    let reqPickupTimeValue = extractRequiredPickupTime(order);
    if (!reqPickupTimeValue) {
        // Fallback to regular pickup_time if required is not available
        reqPickupTimeValue = extractTime(order, 'pickup_time') || order.pickup_time;
    }
    // Also try created_at or order_date as last resort
    if (!reqPickupTimeValue) {
        reqPickupTimeValue = order.created_at || order.order_date || order.fetched_at;
    }
    const reqPickupTime = reqPickupTimeValue ? formatDate(reqPickupTimeValue) : 'N/A';
    
    // Extract required delivery time (always show if available)
    // Try required delivery time first, then fallback to any delivery time
    let reqDeliveryTimeValue = extractRequiredDeliveryTime(order);
    if (!reqDeliveryTimeValue) {
        // Fallback to regular delivery_time if required is not available
        reqDeliveryTimeValue = extractTime(order, 'delivery_time') || order.delivery_time;
    }
    // Also try pickup_time as fallback for delivery time if still not found
    if (!reqDeliveryTimeValue) {
        reqDeliveryTimeValue = extractTime(order, 'pickup_time') || order.pickup_time;
    }
    // Last resort: use created_at + estimated delivery time
    if (!reqDeliveryTimeValue && order.created_at) {
        const createdDate = new Date(order.created_at);
        createdDate.setMinutes(createdDate.getMinutes() + 45); // Default 45 min delivery
        reqDeliveryTimeValue = createdDate.toISOString();
    }
    const reqDeliveryTime = reqDeliveryTimeValue ? formatDate(reqDeliveryTimeValue) : 'N/A';
    
    // Extract times
    const pickupTimeValue = extractTime(order, 'pickup_time') || order.pickup_time;
    const pickupTime = pickupTimeValue ? formatDate(pickupTimeValue) : 'N/A';
    
    const deliveryTimeValue = extractTime(order, 'delivery_time') || order.delivery_time;
    const deliveryTime = deliveryTimeValue ? formatDate(deliveryTimeValue) : 'N/A';
    
    const readyForPickupValue = extractTime(order, 'ready_for_pickup') || order.ready_for_pickup;
    const readyForPickup = readyForPickupValue ? formatDate(readyForPickupValue) : 'N/A';
    const isReadyForPickup = readyForPickupValue ? true : false;
    
    // Extract distance (always show if available)
    const distanceValue = extractDistance(order);
    const distance = distanceValue !== null && distanceValue !== undefined && distanceValue !== '' 
        ? `${distanceValue} km` 
        : 'N/A';
    
    // Extract driver
    const driverValue = extractDriverName(order);
    const driver = driverValue || 'N/A';
    
    // Extract DoorDash tracking URL
    const trackingUrl = extractDoorDashTrackingUrl(order);
    
    // Build items HTML
    let itemsHtml = '<div class="order-items-list">';
    if (items && items.length > 0) {
        items.forEach((item, index) => {
            const itemName = item.name || item.title || item.product_name || 'Unknown Item';
            const quantity = item.quantity || item.qty || 1;
            const price = item.price || item.unit_price || item.total_price || 0;
            const total = (quantity * price).toFixed(2);
            itemsHtml += `
                <div class="order-item">
                    <div class="order-item-name">${index + 1}. ${escapeHtml(itemName)}</div>
                    <div class="order-item-details">
                        <span>Qty: ${quantity}</span>
                        <span>Price: ${formatCurrency(price, order.currency || 'USD')}</span>
                        <span class="order-item-total">Total: ${formatCurrency(quantity * price, order.currency || 'USD')}</span>
                    </div>
                    ${item.special_instructions || item.notes || item.note ? `<div class="order-item-note">Note: ${escapeHtml(item.special_instructions || item.notes || item.note)}</div>` : ''}
                </div>
            `;
        });
    } else {
        itemsHtml += '<div class="order-item">No items found</div>';
    }
    itemsHtml += '</div>';
    
    // Build modal HTML
    const modalHtml = `
        <div class="modal-overlay" id="orderDetailsModal">
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h2>Order Details #${escapeHtml(String(orderId))}</h2>
                    <button class="modal-close" onclick="closeOrderDetails()">&times;</button>
                </div>
                <div class="modal-body order-details-body">
                    <div class="order-details-section">
                        <h3>📋 Order Information</h3>
                        <div class="order-details-grid">
                            <div class="detail-item">
                                <label>Order ID:</label>
                                <span>${escapeHtml(String(orderId))}</span>
                            </div>
                            <div class="detail-item">
                                <label>Status:</label>
                                <span><span class="status-badge status-${(order.status || 'UNKNOWN').toUpperCase()}">${escapeHtml(order.status || 'UNKNOWN')}</span></span>
                            </div>
                            <div class="detail-item">
                                <label>Type:</label>
                                <span>${escapeHtml(order.order_type || 'N/A')}</span>
                            </div>
                            <div class="detail-item">
                                <label>Store ID:</label>
                                <span>${escapeHtml(order.store_id || 'N/A')}</span>
                            </div>
                            <div class="detail-item">
                                <label>Total Amount:</label>
                                <span class="order-total-amount">${formatCurrency(order.total_price || 0, order.currency || 'USD')}</span>
                            </div>
                            <div class="detail-item">
                                <label>Currency:</label>
                                <span>${escapeHtml(order.currency || 'USD')}</span>
                            </div>
                            <div class="detail-item">
                                <label>Order Placed:</label>
                                <span>${formatDate(order.fetched_at || order.created_at || order.updated_at)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Req. Pickup Time:</label>
                                <span>${reqPickupTime}</span>
                            </div>
                            <div class="detail-item">
                                <label>Req. Delivery Time:</label>
                                <span>${reqDeliveryTime}</span>
                            </div>
                            <div class="detail-item">
                                <label>Pickup Time:</label>
                                <span>${pickupTime}</span>
                            </div>
                            <div class="detail-item">
                                <label>Delivery Time:</label>
                                <span>${deliveryTime}</span>
                            </div>
                            <div class="detail-item">
                                <label>Ready for Pickup:</label>
                                <span>
                                    <label class="toggle-switch" style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer;">
                                        <input type="checkbox" class="ready-pickup-toggle" 
                                               data-order-id="${escapeHtml(String(orderId))}" 
                                               ${isReadyForPickup ? 'checked' : ''}
                                               onchange="toggleReadyForPickup('${escapeHtml(String(orderId))}', this.checked)"
                                               style="cursor: pointer;">
                                        <span class="toggle-slider" style="cursor: pointer;"></span>
                                        ${readyForPickup !== 'N/A' ? `<span style="font-size: 12px; color: #64748b;">${readyForPickup}</span>` : ''}
                                    </label>
                                </span>
                            </div>
                            <div class="detail-item">
                                <label>Distance:</label>
                                <span>${distance}</span>
                            </div>
                            ${rawData?.order_number ? `<div class="detail-item"><label>Order Number:</label><span>${escapeHtml(rawData.order_number)}</span></div>` : ''}
                            ${rawData?.payment_method ? `<div class="detail-item"><label>Payment Method:</label><span>${escapeHtml(rawData.payment_method)}</span></div>` : ''}
                        </div>
                    </div>
                    
                    <div class="order-details-section">
                        <h3>👤 Customer Information</h3>
                        <div class="order-details-grid">
                            <div class="detail-item">
                                <label>Name:</label>
                                <span>${escapeHtml(customerName)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Phone:</label>
                                <span>${escapeHtml(customerPhone)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Email:</label>
                                <span>${escapeHtml(customerEmail)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="order-details-section">
                        <h3>📍 Delivery Information</h3>
                        <div class="order-details-grid">
                            <div class="detail-item full-width">
                                <label>Address:</label>
                                <span>${escapeHtml(deliveryAddress)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Driver:</label>
                                <span>${escapeHtml(driver)}</span>
                            </div>
                            <div class="detail-item">
                                <label>Distance:</label>
                                <span>${distance}</span>
                            </div>
                            ${trackingUrl ? `<div class="detail-item full-width"><label>Tracking:</label><span><a href="${escapeHtml(trackingUrl)}" target="_blank" style="color: #22c55e; text-decoration: underline;">View Tracking</a></span></div>` : ''}
                        </div>
                    </div>
                    
                    <div class="order-details-section">
                        <h3>🛒 Order Items</h3>
                        ${itemsHtml}
                    </div>
                    
                    ${rawData?.note || rawData?.notes || rawData?.customer_note ? `
                    <div class="order-details-section">
                        <h3>📝 Notes</h3>
                        <div class="order-notes">${escapeHtml(rawData.note || rawData.notes || rawData.customer_note)}</div>
                    </div>
                    ` : ''}
                </div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="closeOrderDetails()">Close</button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('orderDetailsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Close on overlay click
    const modal = document.getElementById('orderDetailsModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeOrderDetails();
            }
        });
    }
    
    // Close on Escape key
    document.addEventListener('keydown', function escapeHandler(e) {
        if (e.key === 'Escape' && document.getElementById('orderDetailsModal')) {
            closeOrderDetails();
            document.removeEventListener('keydown', escapeHandler);
        }
    });
};

// Close order details modal
window.closeOrderDetails = function() {
    const modal = document.getElementById('orderDetailsModal');
    if (modal) {
        modal.remove();
    }
};

// Delete single order
window.deleteOrder = async function(orderId) {
    if (!confirm(`Are you sure you want to delete order #${orderId}?`)) {
        return;
    }
    
    try {
        const headers = {};
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        const response = await fetch(`${API_BASE}/orders/${orderId}`, {
            method: 'DELETE',
            headers
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification('Success', `Order #${orderId} deleted successfully`);
            // Remove the row from the table
            const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
            if (row) {
                row.remove();
            }
            // Remove from allOrders array
            allOrders = allOrders.filter(o => (o.gloriafood_order_id || o.id) !== orderId);
            updateDeleteSelectedButton();
            // Reload orders to refresh the list
            loadOrders();
        } else {
            showNotification('Error', data.error || 'Failed to delete order', true);
        }
    } catch (error) {
        console.error('Error deleting order:', error);
        showNotification('Error', 'Failed to delete order: ' + error.message, true);
    }
};

// Toggle ready for pickup status
window.toggleReadyForPickup = async function(orderId, isReady) {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        const response = await fetch(`${API_BASE}/orders/${orderId}/ready-for-pickup`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ ready: isReady })
        });
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            throw new Error(`Server returned ${response.status}: ${response.statusText}. The endpoint may not be available yet.`);
        }
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification('Success', `Order #${orderId} ${isReady ? 'marked as ready' : 'unmarked'} for pickup`);
            // Reload orders to refresh the display
            loadOrders();
        } else {
            showNotification('Error', data.error || 'Failed to update ready for pickup status', true);
            // Revert the toggle
            const toggle = document.querySelector(`.ready-pickup-toggle[data-order-id="${orderId}"]`);
            if (toggle) {
                toggle.checked = !isReady;
            }
        }
    } catch (error) {
        console.error('Error toggling ready for pickup:', error);
        showNotification('Error', 'Failed to update ready for pickup: ' + error.message, true);
        // Revert the toggle
        const toggle = document.querySelector(`.ready-pickup-toggle[data-order-id="${orderId}"]`);
        if (toggle) {
            toggle.checked = !isReady;
        }
    }
};

// Auto assign driver to order
window.autoAssignDriver = async function(orderId) {
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        const response = await fetch(`${API_BASE}/orders/${orderId}/assign-driver`, {
            method: 'POST',
            headers
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification('Success', `Driver assigned to order #${orderId}`);
            // Reload orders to refresh the display
            loadOrders();
        } else {
            showNotification('Error', data.error || 'Failed to assign driver', true);
        }
    } catch (error) {
        console.error('Error assigning driver:', error);
        showNotification('Error', 'Failed to assign driver: ' + error.message, true);
    }
};

// Delete selected orders
async function handleDeleteSelected() {
    const checkedBoxes = document.querySelectorAll('.order-checkbox:checked');
    if (checkedBoxes.length === 0) {
        showNotification('Info', 'Please select at least one order to delete');
        return;
    }
    
    const orderIds = Array.from(checkedBoxes).map(cb => cb.value);
    const count = orderIds.length;
    
    if (!confirm(`Are you sure you want to delete ${count} order(s)? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (sessionId) {
            headers['x-session-id'] = sessionId;
        }
        
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ orderIds })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification('Success', `Deleted ${data.deletedCount || count} order(s) successfully`);
            // Remove selected rows from the table
            checkedBoxes.forEach(cb => {
                const orderId = cb.value;
                const row = document.querySelector(`tr[data-order-id="${orderId}"]`);
                if (row) {
                    row.remove();
                }
                // Remove from allOrders array
                allOrders = allOrders.filter(o => (o.gloriafood_order_id || o.id) !== orderId);
            });
            // Uncheck select all
            const selectAllCheckbox = document.querySelector('.select-all-checkbox');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
            }
            updateDeleteSelectedButton();
            // Reload orders to refresh the list
            loadOrders();
        } else {
            showNotification('Error', data.error || 'Failed to delete orders', true);
        }
    } catch (error) {
        console.error('Error deleting orders:', error);
        showNotification('Error', 'Failed to delete orders: ' + error.message, true);
    }
}

// Make it available globally
console.log('💡 Tip: Run checkDatabaseStatus() in console to debug database connection');
