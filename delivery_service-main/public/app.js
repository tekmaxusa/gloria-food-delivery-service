// Configuration
const API_BASE = window.location.origin;
const REFRESH_INTERVAL = 5000; // 5 seconds
let autoRefreshInterval = null;
let lastOrderIds = new Set();
let allOrders = [];
let currentStatusFilter = '';
let searchQuery = '';

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Authentication state
let currentUser = null;
let sessionId = null;

// Get session ID from localStorage
function getSessionId() {
    return localStorage.getItem('sessionId');
}

// Save session ID to localStorage
function saveSessionId(sessionId) {
    if (sessionId) {
        localStorage.setItem('sessionId', sessionId);
    } else {
        localStorage.removeItem('sessionId');
    }
}

// Helper function for authenticated fetch requests
function authenticatedFetch(url, options = {}) {
    const sessionId = getSessionId();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };
    
    if (sessionId) {
        headers['X-Session-Id'] = sessionId;
    }
    
    return fetch(url, {
        ...options,
        headers: headers,
        credentials: 'include'
    });
}

// Check authentication on page load
async function checkAuth() {
    const savedSessionId = getSessionId();
    if (!savedSessionId) {
        showLogin();
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/auth/me`, {
            method: 'GET',
            headers: {
                'X-Session-Id': savedSessionId
            },
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.user) {
                currentUser = data.user;
                sessionId = savedSessionId;
                showDashboard();
                return true;
            }
        }
    } catch (error) {
        console.log('Not authenticated:', error);
    }
    
    // Clear invalid session
    saveSessionId(null);
    showLogin();
    return false;
}

// Show login screen
function showLogin() {
    const authContainer = document.getElementById('authContainer');
    const dashboardContainer = document.getElementById('dashboardContainer');
    
    if (authContainer) authContainer.classList.remove('hidden');
    if (dashboardContainer) dashboardContainer.classList.add('hidden');
}

// Show dashboard
function showDashboard() {
    const authContainer = document.getElementById('authContainer');
    const dashboardContainer = document.getElementById('dashboardContainer');
    
    if (authContainer) authContainer.classList.add('hidden');
    if (dashboardContainer) dashboardContainer.classList.remove('hidden');
    
    // Show dashboard page by default
    showDashboardPage();
    
    // Start auto-refresh only when authenticated
    startAutoRefresh();
}

// Setup dashboard UI elements
function setupDashboardUI() {
    // Setup status tabs
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active class from all tabs
            document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            e.target.classList.add('active');
            
            const status = e.target.dataset.status;
            currentStatusFilter = status;
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
        });
    }
    
    // New order button
    const newOrderBtn = document.getElementById('newOrderBtn');
    if (newOrderBtn) {
        newOrderBtn.addEventListener('click', handleNewOrder);
    }
    
    // Help button
    const helpBtn = document.querySelector('.icon-btn[title="Help"]');
    if (helpBtn) {
        helpBtn.addEventListener('click', handleHelp);
    }
    
    // Re-setup header buttons to ensure they're clickable
    setupHeaderButtons();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Setup authentication handlers first
    setupAuth();
    
    // Setup navigation links
    setupNavigation();
    
    // Setup header buttons (always available)
    setupHeaderButtons();
    
    // Check authentication - this will show login or dashboard
    checkAuth();
});

// Setup header buttons (profile, notifications, logout)
function setupHeaderButtons() {
    // Profile button
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        // Remove existing listeners
        const newProfileBtn = profileBtn.cloneNode(true);
        profileBtn.parentNode.replaceChild(newProfileBtn, profileBtn);
        newProfileBtn.addEventListener('click', handleProfile);
    }
    
    // Notifications button
    const notificationsBtn = document.getElementById('notificationsBtn');
    if (notificationsBtn) {
        // Remove existing listeners
        const newNotificationsBtn = notificationsBtn.cloneNode(true);
        notificationsBtn.parentNode.replaceChild(newNotificationsBtn, notificationsBtn);
        newNotificationsBtn.addEventListener('click', handleNotifications);
    }
    
    // Logout button (already in setupAuth, but ensure it's set up)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && !logoutBtn.hasAttribute('data-listener-attached')) {
        logoutBtn.setAttribute('data-listener-attached', 'true');
        logoutBtn.addEventListener('click', async () => {
            // Show confirmation dialog
            const confirmed = confirm('Are you sure you want to log out?');
            if (!confirmed) {
                return;
            }
            
            try {
                await authenticatedFetch(`${API_BASE}/api/auth/logout`, {
                    method: 'POST'
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
            
            currentUser = null;
            sessionId = null;
            saveSessionId(null);
            showLogin();
        });
    }
}

// Setup authentication handlers
function setupAuth() {
    // Setup password toggle buttons
    setupPasswordToggles();
    
    // Login form
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail')?.value;
            const password = document.getElementById('loginPassword')?.value;
            const errorDiv = document.getElementById('loginError');
            
            // Hide previous errors
            if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
            }
            
            if (!email || !password) {
                const errorMsg = 'Please enter email and password';
                if (errorDiv) {
                    errorDiv.textContent = errorMsg;
                    errorDiv.style.display = 'block';
                }
                showError(errorMsg);
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (data.success && data.user) {
                    currentUser = data.user;
                    sessionId = data.sessionId;
                    saveSessionId(data.sessionId);
                    showNotification('Success', 'Login successful!');
                    showDashboard();
                } else {
                    const errorMsg = data.error || 'Invalid email or password';
                    if (errorDiv) {
                        errorDiv.textContent = errorMsg;
                        errorDiv.style.display = 'block';
                    }
                    showError(errorMsg);
                }
            } catch (error) {
                console.error('Login error:', error);
                const errorMsg = 'Error connecting to server: ' + error.message;
                if (errorDiv) {
                    errorDiv.textContent = errorMsg;
                    errorDiv.style.display = 'block';
                }
                showError(errorMsg);
            }
        });
    }
    
    // Signup form
    const signupForm = document.getElementById('signupFormElement');
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signupName')?.value;
            const email = document.getElementById('signupEmail')?.value;
            const password = document.getElementById('signupPassword')?.value;
            const errorDiv = document.getElementById('signupError');
            
            // Hide previous errors
            if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
            }
            
            if (!name || !email || !password) {
                const errorMsg = 'Please fill in all fields';
                if (errorDiv) {
                    errorDiv.textContent = errorMsg;
                    errorDiv.style.display = 'block';
                }
                showError(errorMsg);
                return;
            }
            
            if (password.length < 6) {
                const errorMsg = 'Password must be at least 6 characters';
                if (errorDiv) {
                    errorDiv.textContent = errorMsg;
                    errorDiv.style.display = 'block';
                }
                showError(errorMsg);
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/auth/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, fullName: name })
                });
                
                const data = await response.json();
                
                if (data.success && data.user) {
                    currentUser = data.user;
                    sessionId = data.sessionId;
                    saveSessionId(data.sessionId);
                    showNotification('Success', 'Account created successfully!');
                    showDashboard();
                } else {
                    const errorMsg = data.error || 'Failed to create account';
                    if (errorDiv) {
                        errorDiv.textContent = errorMsg;
                        errorDiv.style.display = 'block';
                    }
                    showError(errorMsg);
                }
            } catch (error) {
                console.error('Signup error:', error);
                const errorMsg = 'Error connecting to server: ' + error.message;
                if (errorDiv) {
                    errorDiv.textContent = errorMsg;
                    errorDiv.style.display = 'block';
                }
                showError(errorMsg);
            }
        });
    }
    
    // Show signup form
    const showSignupLink = document.getElementById('showSignup');
    if (showSignupLink) {
        showSignupLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('loginForm')?.classList.remove('active');
            document.getElementById('signupForm')?.classList.add('active');
        });
    }
    
    // Show login form
    const showLoginLink = document.getElementById('showLogin');
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('signupForm')?.classList.remove('active');
            document.getElementById('loginForm')?.classList.add('active');
        });
    }
    
    // Logout button is handled in setupHeaderButtons()
}

// Setup password toggle functionality
function setupPasswordToggles() {
    // Login password toggle
    const toggleLoginPassword = document.getElementById('toggleLoginPassword');
    const loginPassword = document.getElementById('loginPassword');
    
    if (toggleLoginPassword && loginPassword) {
        toggleLoginPassword.addEventListener('click', () => {
            const type = loginPassword.getAttribute('type') === 'password' ? 'text' : 'password';
            loginPassword.setAttribute('type', type);
            
            // Toggle eye icons
            const eyeOpen = toggleLoginPassword.querySelector('.eye-open');
            const eyeClosed = toggleLoginPassword.querySelector('.eye-closed');
            if (type === 'text') {
                eyeOpen.style.display = 'none';
                eyeClosed.style.display = 'block';
            } else {
                eyeOpen.style.display = 'block';
                eyeClosed.style.display = 'none';
            }
        });
    }
    
    // Signup password toggle
    const toggleSignupPassword = document.getElementById('toggleSignupPassword');
    const signupPassword = document.getElementById('signupPassword');
    
    if (toggleSignupPassword && signupPassword) {
        toggleSignupPassword.addEventListener('click', () => {
            const type = signupPassword.getAttribute('type') === 'password' ? 'text' : 'password';
            signupPassword.setAttribute('type', type);
            
            // Toggle eye icons
            const eyeOpen = toggleSignupPassword.querySelector('.eye-open');
            const eyeClosed = toggleSignupPassword.querySelector('.eye-closed');
            if (type === 'text') {
                eyeOpen.style.display = 'none';
                eyeClosed.style.display = 'block';
            } else {
                eyeOpen.style.display = 'block';
                eyeClosed.style.display = 'none';
            }
        });
    }
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
            const page = e.target.textContent.trim();
            navigateToPage(page);
        });
    });
}

// Navigate to different pages
function navigateToPage(page) {
    const mainContainer = document.querySelector('.main-container');
    
    switch(page.toLowerCase()) {
        case 'dashboard':
            showDashboardPage();
            break;
        case 'orders':
            showOrdersPage();
            break;
        case 'merchants':
            showMerchantsPage();
            break;
        case 'dispatch':
            showDispatchPage();
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
            showOrdersPage();
    }
    
    // Ensure header buttons are always clickable after navigation
    setupHeaderButtons();
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
                    <button class="btn-secondary" id="exportOrdersBtn" style="display: flex; align-items: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        Export to Excel
                    </button>
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
                        <th class="sortable">
                            <span>Order No.</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>C. Name</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Merchant</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>C. Address</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Amount</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Distance</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Order placed</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Req. Pickup Time</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Req. Delivery Time</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Ready for pick-up</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Driver</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Status</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Tracking</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="ordersTableBody">
                    <!-- Orders will be inserted here by JavaScript -->
                </tbody>
            </table>
        </div>
    `;
    
    // Re-initialize event listeners
    initializeOrdersPage();
    filterAndDisplayOrders();
}

// Initialize Orders page event listeners
function initializeOrdersPage() {
    // Setup status tabs
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            // Remove active class from all tabs
            document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            e.target.classList.add('active');
            
            // Get status from data attribute or text content
            const status = e.target.dataset.status || e.target.textContent.trim().toLowerCase();
            currentStatusFilter = status;
            
            // Filter and display orders
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
        });
    }
    
    // New order button
    const newOrderBtn = document.getElementById('newOrderBtn');
    if (newOrderBtn) {
        newOrderBtn.addEventListener('click', handleNewOrder);
    }
    
    // Export orders button
    const exportOrdersBtn = document.getElementById('exportOrdersBtn');
    if (exportOrdersBtn) {
        exportOrdersBtn.addEventListener('click', exportOrdersToExcel);
    }
}

// Show Dispatch page
function showDispatchPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Dispatch</h1>
                </div>
        <div class="table-container" style="min-height: 400px; display: flex; align-items: center; justify-content: center;">
            <div class="empty-state">
                <div class="empty-state-icon" style="width: 80px; height: 80px; background: #f7fafc; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #a0aec0; margin-bottom: 20px;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M9 11l3 3L22 4"></path>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
                        </svg>
                    </div>
                <div class="empty-state-text" style="font-size: 18px; margin-bottom: 20px;">There is no order to dispatch</div>
                <button class="btn-primary" style="width: 200px; height: 48px; font-size: 16px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                    New Order
                </button>
            </div>
        </div>
    `;
}

// Show Drivers page
function showDriversPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Drivers</h1>
            <div class="orders-controls">
                <div class="order-status-tabs">
                    <button class="status-tab active">Driver List</button>
                    <button class="status-tab">Daily Payment</button>
        </div>
                <div class="action-bar">
                    <div class="search-box">
                        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                    </svg>
                        <input type="text" placeholder="Search" class="search-input">
                </div>
                    <button class="btn-primary" id="newDriverBtn">+ New Driver</button>
                </div>
            </div>
                </div>
        <div class="table-container">
            <table class="orders-table" style="table-layout: fixed; width: 100%;">
                    <thead>
                        <tr>
                        <th style="width: 18%;">Name</th>
                        <th style="width: 12%;">Rating</th>
                        <th class="sortable" style="width: 15%;">
                            <span>Phone</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th style="width: 20%;">Email</th>
                        <th class="sortable" style="width: 15%;">
                            <span>Vehicle</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable" style="width: 12%;">
                            <span>Status</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th style="width: 8%;"></th>
                        </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td colspan="7" class="empty-state-cell">
                            <div class="empty-state">
                                <div class="empty-state-text">No drivers found</div>
                </div>
            </td>
        </tr>
                    </tbody>
                </table>
        </div>
    `;
    
    // Setup new driver button
    const newDriverBtn = document.getElementById('newDriverBtn');
    if (newDriverBtn) {
        newDriverBtn.addEventListener('click', () => {
            showNotification('Info', 'New driver functionality coming soon!');
        });
    }
}

// Show Merchants page
function showMerchantsPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Merchants</h1>
            <div class="orders-controls">
                <div class="action-bar">
                    <button class="btn-primary" id="newMerchantBtn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add New Merchant
                    </button>
                </div>
            </div>
        </div>
        <div class="table-container">
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Store ID</th>
                        <th>Merchant Name</th>
                        <th>API URL</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="merchantsTableBody">
                    <tr>
                        <td colspan="5" class="empty-state-cell">
                            <div class="empty-state">
                                <div class="empty-state-text">Loading merchants...</div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        
        <!-- Merchant Modal -->
        <div id="merchantModal" class="modal hidden">
            <div class="modal-content merchant-modal-content">
                <div class="modal-header">
                    <h2 id="merchantModalTitle">Add New Merchant</h2>
                    <button class="modal-close" id="closeMerchantModal">&times;</button>
                </div>
                <form id="merchantForm" class="modal-body">
                    <div class="form-group">
                        <label>Store ID <span style="color: red;">*</span></label>
                        <input type="text" id="merchantStoreId" required placeholder="Enter Store ID" 
                               pattern="[A-Za-z0-9_-]+" title="Store ID should contain only letters, numbers, hyphens, and underscores">
                    </div>
                    <div class="form-group">
                        <label>Merchant Name <span style="color: red;">*</span></label>
                        <input type="text" id="merchantName" required placeholder="Enter Merchant Name">
                    </div>
                    <div class="form-group">
                        <label>API Key</label>
                        <input type="password" id="merchantApiKey" placeholder="Enter API Key">
                        <small style="color: #666; font-size: 12px;">Leave empty to keep existing API key when editing</small>
                    </div>
                    <div class="form-group">
                        <label>API URL</label>
                        <input type="url" id="merchantApiUrl" placeholder="https://api.example.com">
                        <small style="color: #666; font-size: 12px;">Optional: Custom API URL for this merchant</small>
                    </div>
                    <div class="form-group">
                        <label>Master Key</label>
                        <input type="password" id="merchantMasterKey" placeholder="Enter Master Key">
                        <small style="color: #666; font-size: 12px;">Optional: Master key for API authentication</small>
                    </div>
                    <div class="form-group checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="merchantIsActive" checked> Active
                        </label>
                        <small style="color: #666; font-size: 12px; display: block; margin-top: 4px;">Inactive merchants will not be polled for orders</small>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" id="cancelMerchantBtn">Cancel</button>
                        <button type="submit" class="btn-primary">Save Merchant</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Initialize event listeners
    initializeMerchantsPage();
    loadMerchants();
}

// Initialize Merchants page
function initializeMerchantsPage() {
    // New merchant button
    const newMerchantBtn = document.getElementById('newMerchantBtn');
    if (newMerchantBtn) {
        newMerchantBtn.addEventListener('click', () => {
            openMerchantModal();
        });
    }
    
    // Modal close buttons
    const closeModal = document.getElementById('closeMerchantModal');
    const cancelBtn = document.getElementById('cancelMerchantBtn');
    if (closeModal) closeModal.addEventListener('click', closeMerchantModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeMerchantModal);
    
    // Form submission
    const merchantForm = document.getElementById('merchantForm');
    if (merchantForm) {
        merchantForm.addEventListener('submit', handleMerchantSubmit);
    }
    
    // Close modal on outside click
    const modal = document.getElementById('merchantModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeMerchantModal();
            }
        });
    }
}

// Load merchants from API
async function loadMerchants() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/merchants`);
        const data = await response.json();
        
        if (data.success) {
            displayMerchants(data.merchants || []);
        } else {
            showError('Failed to load merchants: ' + (data.error || 'Unknown error'));
            displayMerchants([]);
        }
    } catch (error) {
        console.error('Error loading merchants:', error);
        showError('Error connecting to server: ' + error.message);
        displayMerchants([]);
    }
}

// Display merchants in table
function displayMerchants(merchants) {
    const tbody = document.getElementById('merchantsTableBody');
    if (!tbody) return;
    
    if (merchants.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state-cell">
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <path d="M20 7h-4m0 0V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2m0 0H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"></path>
                            </svg>
                        </div>
                        <div class="empty-state-text">No merchants found</div>
                        <button class="btn-primary" onclick="document.getElementById('newMerchantBtn')?.click()">
                            Add Your First Merchant
                        </button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = merchants.map(merchant => `
        <tr data-store-id="${escapeHtml(merchant.store_id)}">
            <td><strong>${escapeHtml(merchant.store_id)}</strong></td>
            <td>${escapeHtml(merchant.merchant_name)}</td>
            <td>${escapeHtml(merchant.api_url || 'Default')}</td>
            <td>
                <span class="status-badge status-${merchant.is_active ? 'active' : 'inactive'}">
                    ${merchant.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td>
                <button class="btn-icon" onclick="editMerchant('${escapeHtml(merchant.store_id)}')" title="Edit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="btn-icon" onclick="deleteMerchant('${escapeHtml(merchant.store_id)}', '${escapeHtml(merchant.merchant_name)}')" title="Delete" style="color: #ef4444;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
}

// Open merchant modal for adding new merchant
function openMerchantModal(merchant = null) {
    const modal = document.getElementById('merchantModal');
    const form = document.getElementById('merchantForm');
    const title = document.getElementById('merchantModalTitle');
    
    if (!modal || !form || !title) return;
    
    // Set title
    title.textContent = merchant ? 'Edit Merchant' : 'Add New Merchant';
    
    // Reset form
    form.reset();
    
    // Populate form if editing
    if (merchant) {
        document.getElementById('merchantStoreId').value = merchant.store_id;
        document.getElementById('merchantStoreId').disabled = true; // Can't change store_id
        document.getElementById('merchantName').value = merchant.merchant_name || '';
        document.getElementById('merchantApiUrl').value = merchant.api_url || '';
        document.getElementById('merchantIsActive').checked = merchant.is_active !== false;
        // Don't populate API key and master key for security
    } else {
        document.getElementById('merchantStoreId').disabled = false;
        document.getElementById('merchantIsActive').checked = true;
    }
    
    // Store current merchant for form submission
    form.dataset.editingStoreId = merchant ? merchant.store_id : '';
    
    // Show modal
    modal.classList.remove('hidden');
}

// Close merchant modal
function closeMerchantModal() {
    const modal = document.getElementById('merchantModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Handle merchant form submission
async function handleMerchantSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const storeId = document.getElementById('merchantStoreId').value.trim();
    const merchantName = document.getElementById('merchantName').value.trim();
    const apiKey = document.getElementById('merchantApiKey').value.trim();
    const apiUrl = document.getElementById('merchantApiUrl').value.trim();
    const masterKey = document.getElementById('merchantMasterKey').value.trim();
    const isActive = document.getElementById('merchantIsActive').checked;
    
    if (!storeId || !merchantName) {
        showError('Store ID and Merchant Name are required');
        return;
    }
    
    const editingStoreId = form.dataset.editingStoreId;
    const merchantData = {
        store_id: storeId,
        merchant_name: merchantName,
        api_url: apiUrl || undefined,
        is_active: isActive
    };
    
    // Only include API key and master key if provided (for security)
    if (apiKey) merchantData.api_key = apiKey;
    if (masterKey) merchantData.master_key = masterKey;
    
    try {
        let response;
        if (editingStoreId) {
            // Update existing merchant
            response = await authenticatedFetch(`${API_BASE}/merchants/${editingStoreId}`, {
                method: 'PUT',
                body: JSON.stringify(merchantData)
            });
        } else {
            // Create new merchant
            if (!apiKey) {
                showError('API Key is required when creating a new merchant');
                return;
            }
            response = await authenticatedFetch(`${API_BASE}/merchants`, {
                method: 'POST',
                body: JSON.stringify(merchantData)
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', editingStoreId ? 'Merchant updated successfully' : 'Merchant added successfully');
            closeMerchantModal();
            loadMerchants();
        } else {
            showError(data.error || 'Failed to save merchant');
        }
    } catch (error) {
        console.error('Error saving merchant:', error);
        showError('Error saving merchant: ' + error.message);
    }
}

// Edit merchant
async function editMerchant(storeId) {
    try {
        const response = await authenticatedFetch(`${API_BASE}/merchants/${storeId}`);
        const data = await response.json();
        
        if (data.success && data.merchant) {
            openMerchantModal(data.merchant);
        } else {
            showError('Failed to load merchant: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error loading merchant:', error);
        showError('Error loading merchant: ' + error.message);
    }
}

// Delete merchant
async function deleteMerchant(storeId, merchantName) {
    if (!confirm(`Are you sure you want to delete merchant "${merchantName}" (${storeId})?\n\nThis action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await authenticatedFetch(`${API_BASE}/merchants/${storeId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', 'Merchant deleted successfully');
            loadMerchants();
        } else {
            showError(data.error || 'Failed to delete merchant');
        }
    } catch (error) {
        console.error('Error deleting merchant:', error);
        showError('Error deleting merchant: ' + error.message);
    }
}

// Make functions available globally
window.editMerchant = editMerchant;
window.deleteMerchant = deleteMerchant;

// Show Dashboard page
function showDashboardPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Dashboard</h1>
        </div>
        
        <div class="dashboard-grid">
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Orders</h3>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <path d="M20 8v6M23 11h-6"></path>
                    </svg>
                </div>
                <div class="dashboard-card-value" id="totalOrders">0</div>
                <div class="dashboard-card-change">All time</div>
            </div>
            
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Active Orders</h3>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                </div>
                <div class="dashboard-card-value" id="activeOrders">0</div>
                <div class="dashboard-card-change">In progress</div>
            </div>
            
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Completed Orders</h3>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <div class="dashboard-card-value" id="completedOrders">0</div>
                <div class="dashboard-card-change">Delivered</div>
            </div>
            
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Revenue</h3>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </div>
                <div class="dashboard-card-value" id="totalRevenue">$0.00</div>
                <div class="dashboard-card-change">All time</div>
            </div>
        </div>
        
        <div class="table-container" style="margin-top: 24px;">
            <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: 600; color: #0f172a;">Recent Orders</h2>
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Order No.</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody id="dashboardOrdersTableBody">
                    <tr>
                        <td colspan="5" class="empty-state-cell">
                            <div class="empty-state">
                                <div class="empty-state-text">Loading...</div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    
    // Load dashboard data
    loadDashboardData();
}

// Load dashboard data
async function loadDashboardData() {
    try {
        // Load stats
        const statsResponse = await authenticatedFetch(`${API_BASE}/api/dashboard/stats`);
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            if (statsData.success) {
                const stats = statsData.stats;
                document.getElementById('totalOrders').textContent = stats.orders?.total || 0;
                document.getElementById('activeOrders').textContent = stats.orders?.active || 0;
                document.getElementById('completedOrders').textContent = stats.orders?.completed || 0;
                document.getElementById('totalRevenue').textContent = formatCurrency(stats.revenue?.total || 0, 'USD');
            }
        }
        
        // Load recent orders
        const ordersResponse = await authenticatedFetch(`${API_BASE}/orders?limit=10`);
        if (ordersResponse.ok) {
            const ordersData = await ordersResponse.json();
            if (ordersData.success && ordersData.orders) {
                displayDashboardOrders(ordersData.orders.slice(0, 10));
            }
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// Display dashboard orders
function displayDashboardOrders(orders) {
    const tbody = document.getElementById('dashboardOrdersTableBody');
    if (!tbody) return;
    
    if (orders.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state-cell">
                    <div class="empty-state">
                        <div class="empty-state-text">No orders found</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>#${order.gloriafood_order_id || order.id}</td>
            <td>${order.customer_name || 'N/A'}</td>
            <td>${formatCurrency(order.total_price || 0, order.currency || 'USD')}</td>
            <td><span class="status-badge status-${(order.status || '').toLowerCase()}">${order.status || 'N/A'}</span></td>
            <td>${formatDate(order.created_at || order.fetched_at)}</td>
        </tr>
    `).join('');
}

// Show Reports page
function showReportsPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Reports</h1>
        </div>
        
        <div class="reports-grid">
            <div class="report-card" onclick="generateReport('sales')">
                <div class="report-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </div>
                <h3>Sales Report</h3>
                <p>View detailed sales reports by date range, merchant, and order status. Export to CSV or PDF.</p>
            </div>
            
            <div class="report-card" onclick="generateReport('orders')">
                <div class="report-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <path d="M20 8v6M23 11h-6"></path>
                    </svg>
                </div>
                <h3>Orders Report</h3>
                <p>Comprehensive order analysis including order volume, completion rates, and customer trends.</p>
            </div>
            
            <div class="report-card" onclick="generateReport('revenue')">
                <div class="report-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                </div>
                <h3>Revenue Report</h3>
                <p>Track revenue trends, daily/weekly/monthly breakdowns, and revenue by merchant or driver.</p>
            </div>
            
            <div class="report-card" onclick="generateReport('drivers')">
                <div class="report-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v1"></path>
                        <path d="M12 12h.01M17 12h.01M7 12h.01"></path>
                        <path d="M19 17h1a2 2 0 0 0 2-2v-1"></path>
                        <path d="M2 22h20"></path>
                    </svg>
                </div>
                <h3>Driver Performance</h3>
                <p>Analyze driver performance metrics including delivery times, ratings, and completion rates.</p>
            </div>
            
            <div class="report-card" onclick="generateReport('customers')">
                <div class="report-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <h3>Customer Analytics</h3>
                <p>Customer insights including order frequency, average order value, and customer retention metrics.</p>
            </div>
            
            <div class="report-card" onclick="generateReport('merchants')">
                <div class="report-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                </div>
                <h3>Merchant Reports</h3>
                <p>Merchant-specific reports showing order volume, revenue, and performance comparisons.</p>
            </div>
        </div>
    `;
}

// Generate report - show actual report data
window.generateReport = function(type) {
    showReportView(type);
};

// Show report view with actual data
async function showReportView(reportType) {
    const mainContainer = document.querySelector('.main-container');
    
    // Show loading state
    mainContainer.innerHTML = `
        <div class="orders-header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h1 class="page-title">${getReportTitle(reportType)}</h1>
                <button class="btn-secondary" onclick="showReportsPage()" style="display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 19l-7-7 7-7"></path>
                    </svg>
                    Back to Reports
                </button>
            </div>
        </div>
        <div style="text-align: center; padding: 40px;">
            <div class="empty-state-text">Loading report data...</div>
        </div>
    `;
    
    try {
        let reportData = null;
        let reportHTML = '';
        
        switch(reportType) {
            case 'sales':
                reportData = await fetchSalesReport();
                reportHTML = renderSalesReport(reportData);
                break;
            case 'orders':
                reportData = await fetchOrdersReport();
                reportHTML = renderOrdersReport(reportData);
                break;
            case 'revenue':
                reportData = await fetchRevenueReport();
                reportHTML = renderRevenueReport(reportData);
                break;
            case 'drivers':
                reportData = await fetchDriversReport();
                reportHTML = renderDriversReport(reportData);
                break;
            case 'customers':
                reportData = await fetchCustomersReport();
                reportHTML = renderCustomersReport(reportData);
                break;
            case 'merchants':
                reportData = await fetchMerchantsReport();
                reportHTML = renderMerchantsReport(reportData);
                break;
            default:
                reportHTML = '<div class="empty-state-text">Invalid report type</div>';
        }
        
        mainContainer.innerHTML = `
            <div class="orders-header">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h1 class="page-title">${getReportTitle(reportType)}</h1>
                    <div style="display: flex; gap: 12px;">
                        <button class="btn-secondary" onclick="exportReport('${reportType}')" style="display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export
                        </button>
                        <button class="btn-secondary" onclick="showReportsPage()" style="display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M19 12H5M12 19l-7-7 7-7"></path>
                            </svg>
                            Back to Reports
                        </button>
                    </div>
                </div>
            </div>
            ${reportHTML}
        `;
    } catch (error) {
        console.error('Error loading report:', error);
        mainContainer.innerHTML = `
            <div class="orders-header">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h1 class="page-title">${getReportTitle(reportType)}</h1>
                    <button class="btn-secondary" onclick="showReportsPage()">Back to Reports</button>
                </div>
            </div>
            <div style="text-align: center; padding: 40px;">
                <div class="empty-state-text" style="color: #ef4444;">Error loading report: ${error.message}</div>
            </div>
        `;
    }
}

// Get report title
function getReportTitle(type) {
    const titles = {
        'sales': 'Sales Report',
        'orders': 'Orders Report',
        'revenue': 'Revenue Report',
        'drivers': 'Driver Performance Report',
        'customers': 'Customer Analytics Report',
        'merchants': 'Merchant Reports'
    };
    return titles[type] || 'Report';
}

// Fetch sales report data
async function fetchSalesReport() {
    const response = await authenticatedFetch(`${API_BASE}/orders?limit=1000`);
    const data = await response.json();
    return data.orders || data || [];
}

// Fetch orders report data
async function fetchOrdersReport() {
    const response = await authenticatedFetch(`${API_BASE}/orders?limit=1000`);
    const data = await response.json();
    return data.orders || data || [];
}

// Fetch revenue report data
async function fetchRevenueReport() {
    const [ordersResponse, statsResponse] = await Promise.all([
        authenticatedFetch(`${API_BASE}/orders?limit=1000`),
        authenticatedFetch(`${API_BASE}/api/dashboard/stats`)
    ]);
    const ordersData = await ordersResponse.json();
    const statsData = await statsResponse.json();
    return {
        orders: ordersData.orders || ordersData || [],
        stats: statsData.stats || {}
    };
}

// Fetch drivers report data
async function fetchDriversReport() {
    const response = await authenticatedFetch(`${API_BASE}/api/drivers`);
    const data = await response.json();
    return data.drivers || [];
}

// Fetch customers report data
async function fetchCustomersReport() {
    const response = await authenticatedFetch(`${API_BASE}/orders?limit=1000`);
    const data = await response.json();
    return data.orders || data || [];
}

// Fetch merchants report data
async function fetchMerchantsReport() {
    const response = await authenticatedFetch(`${API_BASE}/merchants`);
    const data = await response.json();
    return data.merchants || [];
}

// Render sales report
function renderSalesReport(orders) {
    const totalSales = orders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
    const completedOrders = orders.filter(o => o.status === 'DELIVERED' || o.status === 'COMPLETED').length;
    const pendingOrders = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
    
    return `
        <div class="dashboard-grid" style="margin-bottom: 24px;">
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Sales</h3>
                </div>
                <div class="dashboard-card-value">${formatCurrency(totalSales, 'USD')}</div>
                <div class="dashboard-card-change">All time</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Completed Orders</h3>
                </div>
                <div class="dashboard-card-value">${completedOrders}</div>
                <div class="dashboard-card-change">Delivered</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Pending Orders</h3>
                </div>
                <div class="dashboard-card-value">${pendingOrders}</div>
                <div class="dashboard-card-change">In progress</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Orders</h3>
                </div>
                <div class="dashboard-card-value">${orders.length}</div>
                <div class="dashboard-card-change">All orders</div>
            </div>
        </div>
        <div class="table-container">
            <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: 600; color: #0f172a;">Sales Details</h2>
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Order No.</th>
                        <th>Customer</th>
                        <th>Merchant</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${orders.length === 0 ? '<tr><td colspan="6" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">No sales data available</div></div></td></tr>' : 
                      orders.slice(0, 100).map(order => `
                        <tr>
                            <td>#${order.gloriafood_order_id || order.id}</td>
                            <td>${order.customer_name || 'N/A'}</td>
                            <td>${order.merchant_name || 'N/A'}</td>
                            <td>${formatCurrency(order.total_price || 0, order.currency || 'USD')}</td>
                            <td><span class="status-badge status-${(order.status || '').toLowerCase()}">${order.status || 'N/A'}</span></td>
                            <td>${formatDate(order.created_at || order.fetched_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Render orders report
function renderOrdersReport(orders) {
    const statusCounts = {};
    orders.forEach(order => {
        const status = order.status || 'UNKNOWN';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    return `
        <div class="dashboard-grid" style="margin-bottom: 24px;">
            ${Object.entries(statusCounts).map(([status, count]) => `
                <div class="dashboard-card">
                    <div class="dashboard-card-header">
                        <h3>${status}</h3>
                    </div>
                    <div class="dashboard-card-value">${count}</div>
                    <div class="dashboard-card-change">Orders</div>
                </div>
            `).join('')}
        </div>
        <div class="table-container">
            <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: 600; color: #0f172a;">All Orders</h2>
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Order No.</th>
                        <th>Customer</th>
                        <th>Merchant</th>
                        <th>Address</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${orders.length === 0 ? '<tr><td colspan="7" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">No orders available</div></div></td></tr>' : 
                      orders.slice(0, 100).map(order => `
                        <tr>
                            <td>#${order.gloriafood_order_id || order.id}</td>
                            <td>${order.customer_name || 'N/A'}</td>
                            <td>${order.merchant_name || 'N/A'}</td>
                            <td>${(order.delivery_address || order.customer_address || 'N/A').substring(0, 50)}${(order.delivery_address || order.customer_address || '').length > 50 ? '...' : ''}</td>
                            <td>${formatCurrency(order.total_price || 0, order.currency || 'USD')}</td>
                            <td><span class="status-badge status-${(order.status || '').toLowerCase()}">${order.status || 'N/A'}</span></td>
                            <td>${formatDate(order.created_at || order.fetched_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Render revenue report
function renderRevenueReport(data) {
    const { orders, stats } = data;
    const totalRevenue = stats.revenue?.total || orders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
    
    // Group by date
    const revenueByDate = {};
    orders.forEach(order => {
        const date = new Date(order.created_at || order.fetched_at).toLocaleDateString();
        revenueByDate[date] = (revenueByDate[date] || 0) + (parseFloat(order.total_price) || 0);
    });
    
    return `
        <div class="dashboard-grid" style="margin-bottom: 24px;">
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Revenue</h3>
                </div>
                <div class="dashboard-card-value">${formatCurrency(totalRevenue, 'USD')}</div>
                <div class="dashboard-card-change">All time</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Orders</h3>
                </div>
                <div class="dashboard-card-value">${orders.length}</div>
                <div class="dashboard-card-change">Orders</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Average Order Value</h3>
                </div>
                <div class="dashboard-card-value">${formatCurrency(orders.length > 0 ? totalRevenue / orders.length : 0, 'USD')}</div>
                <div class="dashboard-card-change">Per order</div>
            </div>
        </div>
        <div class="table-container">
            <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: 600; color: #0f172a;">Revenue by Date</h2>
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Revenue</th>
                        <th>Orders</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.keys(revenueByDate).length === 0 ? '<tr><td colspan="3" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">No revenue data available</div></div></td></tr>' : 
                      Object.entries(revenueByDate).sort((a, b) => new Date(b[0]) - new Date(a[0])).slice(0, 50).map(([date, revenue]) => {
                          const dateOrders = orders.filter(o => new Date(o.created_at || o.fetched_at).toLocaleDateString() === date);
                          return `
                            <tr>
                                <td>${date}</td>
                                <td>${formatCurrency(revenue, 'USD')}</td>
                                <td>${dateOrders.length}</td>
                            </tr>
                        `;
                      }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Render drivers report
function renderDriversReport(drivers) {
    return `
        <div class="dashboard-grid" style="margin-bottom: 24px;">
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Drivers</h3>
                </div>
                <div class="dashboard-card-value">${drivers.length}</div>
                <div class="dashboard-card-change">All drivers</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Active Drivers</h3>
                </div>
                <div class="dashboard-card-value">${drivers.filter(d => d.status === 'active').length}</div>
                <div class="dashboard-card-change">Active</div>
            </div>
        </div>
        <div class="table-container">
            <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: 600; color: #0f172a;">Driver Performance</h2>
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Rating</th>
                    </tr>
                </thead>
                <tbody>
                    ${drivers.length === 0 ? '<tr><td colspan="6" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">No drivers available</div></div></td></tr>' : 
                      drivers.map(driver => `
                        <tr>
                            <td>${driver.name || driver.full_name || 'N/A'}</td>
                            <td>${driver.phone || 'N/A'}</td>
                            <td>${driver.email || 'N/A'}</td>
                            <td>${driver.vehicle || 'N/A'}</td>
                            <td><span class="status-badge status-${(driver.status || 'inactive').toLowerCase()}">${driver.status || 'Inactive'}</span></td>
                            <td>${driver.rating ? '⭐'.repeat(Math.round(driver.rating)) : 'N/A'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Render customers report
function renderCustomersReport(orders) {
    // Group by customer
    const customerData = {};
    orders.forEach(order => {
        const email = order.customer_email || order.customer_name || 'Unknown';
        if (!customerData[email]) {
            customerData[email] = {
                name: order.customer_name || 'Unknown',
                email: order.customer_email || '',
                phone: order.customer_phone || '',
                orders: 0,
                totalSpent: 0
            };
        }
        customerData[email].orders++;
        customerData[email].totalSpent += parseFloat(order.total_price) || 0;
    });
    
    const customers = Object.values(customerData).sort((a, b) => b.totalSpent - a.totalSpent);
    
    return `
        <div class="dashboard-grid" style="margin-bottom: 24px;">
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Customers</h3>
                </div>
                <div class="dashboard-card-value">${customers.length}</div>
                <div class="dashboard-card-change">Unique customers</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Orders</h3>
                </div>
                <div class="dashboard-card-value">${orders.length}</div>
                <div class="dashboard-card-change">All orders</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Average Orders per Customer</h3>
                </div>
                <div class="dashboard-card-value">${customers.length > 0 ? (orders.length / customers.length).toFixed(1) : 0}</div>
                <div class="dashboard-card-change">Orders</div>
            </div>
        </div>
        <div class="table-container">
            <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: 600; color: #0f172a;">Customer Analytics</h2>
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Customer Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Total Orders</th>
                        <th>Total Spent</th>
                        <th>Average Order Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${customers.length === 0 ? '<tr><td colspan="6" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">No customer data available</div></div></td></tr>' : 
                      customers.slice(0, 100).map(customer => `
                        <tr>
                            <td>${customer.name}</td>
                            <td>${customer.email || 'N/A'}</td>
                            <td>${customer.phone || 'N/A'}</td>
                            <td>${customer.orders}</td>
                            <td>${formatCurrency(customer.totalSpent, 'USD')}</td>
                            <td>${formatCurrency(customer.orders > 0 ? customer.totalSpent / customer.orders : 0, 'USD')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Render merchants report
function renderMerchantsReport(merchants) {
    return `
        <div class="dashboard-grid" style="margin-bottom: 24px;">
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Total Merchants</h3>
                </div>
                <div class="dashboard-card-value">${merchants.length}</div>
                <div class="dashboard-card-change">All merchants</div>
            </div>
            <div class="dashboard-card">
                <div class="dashboard-card-header">
                    <h3>Active Merchants</h3>
                </div>
                <div class="dashboard-card-value">${merchants.filter(m => m.is_active).length}</div>
                <div class="dashboard-card-change">Active</div>
            </div>
        </div>
        <div class="table-container">
            <h2 style="margin-bottom: 16px; font-size: 20px; font-weight: 600; color: #0f172a;">Merchant Reports</h2>
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Store ID</th>
                        <th>Merchant Name</th>
                        <th>API URL</th>
                        <th>Status</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
                    ${merchants.length === 0 ? '<tr><td colspan="5" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">No merchants available</div></div></td></tr>' : 
                      merchants.map(merchant => `
                        <tr>
                            <td>${merchant.store_id || 'N/A'}</td>
                            <td>${merchant.merchant_name || 'N/A'}</td>
                            <td>${merchant.api_url || 'N/A'}</td>
                            <td><span class="status-badge ${merchant.is_active ? 'status-active' : 'status-inactive'}">${merchant.is_active ? 'Active' : 'Inactive'}</span></td>
                            <td>${formatDate(merchant.created_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Export orders to Excel
function exportOrdersToExcel() {
    try {
        // Get currently displayed orders (filtered)
        const displayedOrders = getFilteredOrders();
        
        if (displayedOrders.length === 0) {
            showNotification('Info', 'No orders to export', 'info');
            return;
        }
        
        // Prepare CSV data
        const headers = [
            'Order No.',
            'Customer Name',
            'Merchant',
            'Customer Address',
            'Amount',
            'Currency',
            'Distance',
            'Order Placed',
            'Req. Pickup Time',
            'Req. Delivery Time',
            'Ready for Pick-up',
            'Driver',
            'Status',
            'Tracking URL',
            'Customer Phone',
            'Customer Email',
            'Order Type'
        ];
        
        const rows = displayedOrders.map(order => {
            // Extract fields same way as createOrderRow
            const orderId = order.gloriafood_order_id || order.id || 'N/A';
            const customerName = order.customer_name || 'N/A';
            const customerAddress = order.delivery_address || order.customer_address || 'N/A';
            const amount = order.total_price || 0;
            const currency = order.currency || 'USD';
            const orderPlaced = order.fetched_at || order.created_at || order.updated_at || 'N/A';
            const status = order.status || 'N/A';
            const orderType = order.order_type || 'N/A';
            const customerPhone = order.customer_phone || 'N/A';
            const customerEmail = order.customer_email || 'N/A';
            const trackingUrl = order.doordash_tracking_url || 'N/A';
            
            // Extract from raw_data
            let rawData = {};
            try {
                if (order.raw_data) {
                    rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
                }
            } catch (e) {
                // Ignore parsing errors
            }
            
            // Get merchant name (same logic as createOrderRow)
            let merchantName = order.merchant_name;
            if (!merchantName && rawData) {
                merchantName = rawData.merchant_name || 
                              rawData.merchantName ||
                              rawData.restaurant_name ||
                              rawData.restaurantName ||
                              (rawData.restaurant && rawData.restaurant.name) ||
                              (rawData.restaurant && rawData.restaurant.restaurant_name) ||
                              (rawData.merchant && rawData.merchant.name) ||
                              null;
            }
            if (!merchantName) {
                merchantName = order.store_id ? `Store ${order.store_id}` : 'N/A';
            }
            
            // Get distance (same logic as createOrderRow)
            const distance = order.distance || 
                            rawData.distance || 
                            rawData.delivery_distance ||
                            rawData.distance_km ||
                            rawData.distance_miles ||
                            (rawData.delivery && rawData.delivery.distance) ||
                            (rawData.delivery && rawData.delivery.delivery_distance) ||
                            (rawData.delivery && rawData.delivery.distance_km) ||
                            (rawData.location && rawData.location.distance) ||
                            (rawData.restaurant && rawData.restaurant.distance) ||
                            null;
            let formattedDistance = 'N/A';
            if (distance) {
                if (typeof distance === 'number') {
                    formattedDistance = distance.toFixed(2) + ' km';
                } else if (typeof distance === 'string') {
                    if (distance.includes('km') || distance.includes('miles') || distance.includes('mi')) {
                        formattedDistance = distance;
                    } else {
                        const num = parseFloat(distance);
                        if (!isNaN(num)) {
                            formattedDistance = num.toFixed(2) + ' km';
                        } else {
                            formattedDistance = distance;
                        }
                    }
                } else {
                    formattedDistance = String(distance);
                }
            }
            
            // Get pickup time (same logic as createOrderRow)
            const pickupTime = order.pickup_time || 
                              order.pickupTime || 
                              rawData.pickup_time || 
                              rawData.pickupTime || 
                              rawData.requested_pickup_time ||
                              rawData.requestedPickupTime ||
                              rawData.scheduled_pickup_time ||
                              rawData.scheduledPickupTime ||
                              rawData.pickup_at ||
                              rawData.pickupAt ||
                              rawData.pickup_datetime ||
                              rawData.pickupDateTime ||
                              rawData.requested_pickup_datetime ||
                              (rawData.delivery && rawData.delivery.pickup_time) ||
                              (rawData.delivery && rawData.delivery.requested_pickup_time) ||
                              (rawData.delivery && rawData.delivery.pickup_at) ||
                              (rawData.schedule && rawData.schedule.pickup_time) ||
                              (rawData.schedule && rawData.schedule.requested_pickup_time) ||
                              (rawData.time && rawData.time.pickup) ||
                              (rawData.times && rawData.times.pickup) ||
                              null;
            let formattedPickupTime = 'N/A';
            if (pickupTime) {
                try {
                    formattedPickupTime = formatDate(pickupTime);
                } catch (e) {
                    formattedPickupTime = typeof pickupTime === 'string' ? pickupTime : new Date(pickupTime).toISOString();
                }
            }
            
            // Get delivery time (same logic as createOrderRow)
            const deliveryTime = order.delivery_time || 
                                order.deliveryTime || 
                                rawData.delivery_time || 
                                rawData.deliveryTime || 
                                rawData.requested_delivery_time ||
                                rawData.requestedDeliveryTime ||
                                rawData.scheduled_delivery_time ||
                                rawData.scheduledDeliveryTime ||
                                rawData.delivery_at ||
                                rawData.deliveryAt ||
                                rawData.delivery_datetime ||
                                rawData.deliveryDateTime ||
                                rawData.requested_delivery_datetime ||
                                (rawData.delivery && rawData.delivery.delivery_time) ||
                                (rawData.delivery && rawData.delivery.requested_delivery_time) ||
                                (rawData.delivery && rawData.delivery.scheduled_delivery_time) ||
                                (rawData.delivery && rawData.delivery.delivery_at) ||
                                (rawData.schedule && rawData.schedule.delivery_time) ||
                                (rawData.schedule && rawData.schedule.requested_delivery_time) ||
                                (rawData.time && rawData.time.delivery) ||
                                (rawData.times && rawData.times.delivery) ||
                                null;
            let formattedDeliveryTime = 'N/A';
            if (deliveryTime) {
                try {
                    formattedDeliveryTime = formatDate(deliveryTime);
                } catch (e) {
                    formattedDeliveryTime = typeof deliveryTime === 'string' ? deliveryTime : new Date(deliveryTime).toISOString();
                }
            }
            
            // Get ready for pickup
            const readyForPickup = order.ready_for_pickup || 
                                   order.readyForPickup || 
                                   rawData.ready_for_pickup || 
                                   rawData.readyForPickup ||
                                   rawData.ready_for_pick_up ||
                                   rawData.readyForPickUp ||
                                   rawData.ready_time ||
                                   rawData.readyTime ||
                                   rawData.ready_at ||
                                   rawData.readyAt ||
                                   rawData.prepared_at ||
                                   rawData.preparedAt ||
                                   (rawData.status && rawData.status.ready_time) ||
                                   (rawData.delivery && rawData.delivery.ready_for_pickup) ||
                                   null;
            const formattedReadyForPickup = readyForPickup ? (typeof readyForPickup === 'string' ? readyForPickup : new Date(readyForPickup).toISOString()) : 'N/A';
            
            // Get driver
            const driver = order.driver_name || 
                          order.driverName || 
                          order.driver || 
                          rawData.driver_name || 
                          rawData.driverName || 
                          rawData.driver ||
                          rawData.assigned_driver ||
                          rawData.assignedDriver ||
                          rawData.driver_id ||
                          rawData.driverId ||
                          (rawData.delivery && rawData.delivery.driver_name) ||
                          (rawData.delivery && rawData.delivery.driver) ||
                          (rawData.delivery && rawData.delivery.assigned_driver) ||
                          (rawData.driver && rawData.driver.name) ||
                          (rawData.driver && rawData.driver.full_name) ||
                          'N/A';
            
            // Format order placed date
            let formattedOrderPlaced = 'N/A';
            if (orderPlaced && orderPlaced !== 'N/A') {
                try {
                    formattedOrderPlaced = formatDate(orderPlaced);
                } catch (e) {
                    formattedOrderPlaced = orderPlaced;
                }
            }
            
            // Escape CSV values (handle commas, quotes, newlines)
            const escapeCSV = (value) => {
                if (value === null || value === undefined) return '';
                const str = String(value);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            };
            
            return [
                escapeCSV(orderId),
                escapeCSV(customerName),
                escapeCSV(merchantName),
                escapeCSV(customerAddress),
                escapeCSV(amount),
                escapeCSV(currency),
                escapeCSV(formattedDistance),
                escapeCSV(formattedOrderPlaced),
                escapeCSV(formattedPickupTime),
                escapeCSV(formattedDeliveryTime),
                escapeCSV(formattedReadyForPickup),
                escapeCSV(driver),
                escapeCSV(status),
                escapeCSV(trackingUrl),
                escapeCSV(customerPhone),
                escapeCSV(customerEmail),
                escapeCSV(orderType)
            ];
        });
        
        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
        
        // Add BOM for Excel UTF-8 support
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // Create download link
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        
        // Generate filename with current date
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        const statusFilter = currentStatusFilter || 'all';
        link.download = `orders_${statusFilter}_${dateStr}_${timeStr}.csv`;
        
        // Ensure download works
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Trigger download
        setTimeout(() => {
            link.click();
            // Clean up after a delay
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);
        }, 10);
        
        showNotification('Success', `Exported ${displayedOrders.length} orders to Excel`, 'success');
    } catch (error) {
        console.error('Error exporting orders:', error);
        showNotification('Error', 'Failed to export orders: ' + error.message, 'error');
    }
}

// Get filtered orders (currently displayed)
function getFilteredOrders() {
    if (!allOrders || allOrders.length === 0) {
        return [];
    }
    
    let filtered = [...allOrders];
    
    // Apply status filter
    if (currentStatusFilter && currentStatusFilter !== 'current') {
        filtered = filtered.filter(order => {
            const category = getOrderCategory(order);
            return category === currentStatusFilter;
        });
    } else if (currentStatusFilter === 'current') {
        filtered = filtered.filter(order => {
            const category = getOrderCategory(order);
            return category === 'current';
        });
    }
    
    // Apply search filter
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(order => {
            const orderId = (order.gloriafood_order_id || order.id || '').toString().toLowerCase();
            const customerName = (order.customer_name || '').toLowerCase();
            const merchantName = (order.merchant_name || order.store_id || '').toLowerCase();
            const address = (order.delivery_address || order.customer_address || '').toLowerCase();
            const status = (order.status || '').toLowerCase();
            
            return orderId.includes(query) ||
                   customerName.includes(query) ||
                   merchantName.includes(query) ||
                   address.includes(query) ||
                   status.includes(query);
        });
    }
    
    return filtered;
}

// Export report (placeholder)
window.exportReport = function(type) {
    addNotification('Info', `Exporting ${getReportTitle(type)}...`, 'info');
    // Add actual export functionality here (CSV, PDF, etc.)
};

// Show Reviews page
function showReviewsPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Reviews</h1>
        </div>
        <div class="table-container" style="min-height: 400px; display: flex; align-items: center; justify-content: center;">
            <div class="empty-state">
                <div class="empty-state-text">No reviews available</div>
            </div>
        </div>
    `;
}


// Handle New Order button
function handleNewOrder() {
    // Create a modal or form for new order
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
                        <label>Customer Name</label>
                        <input type="text" name="customerName" required>
                    </div>
                    <div class="form-group">
                        <label>Customer Phone</label>
                        <input type="tel" name="customerPhone" required>
                    </div>
                    <div class="form-group">
                        <label>Delivery Address</label>
                        <textarea name="deliveryAddress" required></textarea>
                    </div>
                    <div class="form-group">
                        <label>Total Amount</label>
                        <input type="number" name="totalAmount" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Order Type</label>
                        <select name="orderType" required>
                            <option value="delivery">Delivery</option>
                            <option value="pickup">Pickup</option>
                        </select>
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
    
    // Close modal on X button
    modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.remove();
    });
    
    // Close modal on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Handle form submission
    modal.querySelector('#newOrderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const orderData = Object.fromEntries(formData);
        
        showNotification('Success', 'Order created successfully! (This is a demo - order not actually saved)');
                modal.remove();
        
        // Refresh orders if on orders page
        if (document.querySelector('.page-title')?.textContent === 'Orders') {
                loadOrders();
        }
    });
}

// Notification storage
let notifications = [];

// Handle Profile button
function handleProfile() {
    const panel = document.getElementById('profilePanel');
    if (panel) {
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    } else {
        createProfilePanel();
    }
}

// Handle Notifications button
function handleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    if (panel) {
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    } else {
        createNotificationsPanel();
    }
}

// Create profile panel
function createProfilePanel() {
    // Remove existing panel if any
    const existing = document.getElementById('profilePanel');
    if (existing) {
        existing.remove();
    }
    
    const panel = document.createElement('div');
    panel.id = 'profilePanel';
    panel.className = 'profile-panel';
    
    // Get current user profile picture from localStorage
    const profilePicture = localStorage.getItem('profilePicture') || '';
    const userName = currentUser?.full_name || currentUser?.email || 'User';
    const userEmail = currentUser?.email || '';
    
    panel.innerHTML = `
        <div class="profile-header">
            <h3>Profile</h3>
            <button class="close-profile-btn" id="closeProfilePanel">×</button>
        </div>
        <div class="profile-content">
            <div class="profile-picture-section">
                <div class="profile-picture-container">
                    <img id="profilePicturePreview" src="${profilePicture || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e2e8f0%22/%3E%3Ctext x=%2250%22 y=%2255%22 font-size=%2230%22 text-anchor=%22middle%22 fill=%22%2364748b%22%3E${userName.charAt(0).toUpperCase()}%3C/text%3E%3C/svg%3E'}" alt="Profile Picture" class="profile-picture">
                    <label for="profilePictureInput" class="upload-label">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        Upload Photo
                    </label>
                    <input type="file" id="profilePictureInput" accept="image/*" style="display: none;">
                </div>
            </div>
            <div class="profile-info">
                <div class="profile-field">
                    <label>Name</label>
                    <div class="profile-value">${userName}</div>
                </div>
                <div class="profile-field">
                    <label>Email</label>
                    <div class="profile-value">${userEmail}</div>
                </div>
                <div class="profile-field">
                    <label>Role</label>
                    <div class="profile-value">${currentUser?.role || 'User'}</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Setup event listeners
    document.getElementById('closeProfilePanel')?.addEventListener('click', () => {
        panel.classList.add('hidden');
    });
    
    // Handle profile picture upload
    const fileInput = document.getElementById('profilePictureInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleProfilePictureUpload);
    }
    
    // Close when clicking outside
    document.addEventListener('click', function closeOnOutsideClick(e) {
        if (!panel.contains(e.target) && !e.target.closest('#profileBtn')) {
            panel.classList.add('hidden');
            document.removeEventListener('click', closeOnOutsideClick);
        }
    });
}

// Handle profile picture upload
function handleProfilePictureUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        addNotification('Error', 'Please select an image file', 'error');
        return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        addNotification('Error', 'Image size must be less than 5MB', 'error');
        return;
    }
    
    // Read file as data URL
    const reader = new FileReader();
    reader.onload = function(event) {
        const dataUrl = event.target.result;
        
        // Save to localStorage
        localStorage.setItem('profilePicture', dataUrl);
        
        // Update preview
        const preview = document.getElementById('profilePicturePreview');
        if (preview) {
            preview.src = dataUrl;
        }
        
        addNotification('Success', 'Profile picture updated successfully', 'success');
    };
    
    reader.onerror = function() {
        addNotification('Error', 'Error reading image file', 'error');
    };
    
    reader.readAsDataURL(file);
}

// Create notifications panel
function createNotificationsPanel() {
    // Remove existing panel if any
    const existing = document.getElementById('notificationsPanel');
    if (existing) {
        existing.remove();
    }
    
    const panel = document.createElement('div');
    panel.id = 'notificationsPanel';
    panel.className = 'notifications-panel';
    
    panel.innerHTML = `
        <div class="notifications-header">
            <h3>Notifications</h3>
            <div class="notifications-actions">
                <button class="clear-all-btn" id="clearAllNotifications">Clear All</button>
                <button class="close-notifications-btn" id="closeNotificationsPanel">×</button>
            </div>
        </div>
        <div class="notifications-list" id="notificationsList">
            ${notifications.length === 0 ? '<div class="no-notifications">No notifications</div>' : ''}
        </div>
    `;
    
    document.body.appendChild(panel);
    
    // Render notifications
    renderNotifications();
    
    // Setup event listeners
    document.getElementById('clearAllNotifications')?.addEventListener('click', clearAllNotifications);
    document.getElementById('closeNotificationsPanel')?.addEventListener('click', () => {
        panel.classList.add('hidden');
    });
    
    // Close when clicking outside
    document.addEventListener('click', function closeOnOutsideClick(e) {
        if (!panel.contains(e.target) && !e.target.closest('#notificationsBtn')) {
            panel.classList.add('hidden');
            document.removeEventListener('click', closeOnOutsideClick);
        }
    });
}

// Add notification to list
function addNotification(title, message, type = 'info', orderId = null) {
    const notification = {
        id: Date.now(),
        title,
        message,
        type,
        orderId,
        timestamp: new Date()
    };
    
    notifications.unshift(notification); // Add to beginning
    
    // Keep only last 50 notifications
    if (notifications.length > 50) {
        notifications = notifications.slice(0, 50);
    }
    
    // Update panel if it exists
    const panel = document.getElementById('notificationsPanel');
    if (panel && !panel.classList.contains('hidden')) {
        renderNotifications();
    }
    
    // Update notification badge
    updateNotificationBadge();
}

// Render notifications in panel
function renderNotifications() {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    
    if (notifications.length === 0) {
        list.innerHTML = '<div class="no-notifications">No notifications</div>';
        return;
    }
    
    list.innerHTML = notifications.map(notif => `
        <div class="notification-item ${notif.type}" data-id="${notif.id}">
            <div class="notification-content">
                <div class="notification-title">${notif.title}</div>
                <div class="notification-message">${notif.message}</div>
                <div class="notification-time">${formatNotificationTime(notif.timestamp)}</div>
            </div>
            <button class="remove-notification-btn" onclick="removeNotification(${notif.id})">×</button>
        </div>
    `).join('');
}

// Remove single notification
window.removeNotification = function(id) {
    notifications = notifications.filter(n => n.id !== id);
    renderNotifications();
    updateNotificationBadge();
};

// Clear all notifications
function clearAllNotifications() {
    notifications = [];
    renderNotifications();
    updateNotificationBadge();
    // Don't show notification when clearing (would create a new notification)
}

// Format notification time
function formatNotificationTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return time.toLocaleDateString();
}

// Update notification badge
function updateNotificationBadge() {
    const btn = document.getElementById('notificationsBtn');
    if (!btn) return;
    
    const count = notifications.length;
    let badge = btn.querySelector('.notification-badge');
    
    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'notification-badge';
            btn.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : count;
    } else if (badge) {
        badge.remove();
    }
}

// Handle Help button
function handleHelp() {
    const helpContent = `
        <h3>Help & Support</h3>
        <p><strong>Orders:</strong> View and manage all your orders</p>
        <p><strong>Dispatch:</strong> Assign orders to drivers</p>
        <p><strong>Drivers:</strong> Manage your delivery drivers</p>
        <p><strong>Search:</strong> Use the search bar to find specific orders</p>
        <p><strong>Status Tabs:</strong> Filter orders by status (Current, Scheduled, Completed, etc.)</p>
        <p style="margin-top: 20px;"><strong>Need more help?</strong> Contact support at support@tekmax.com</p>
    `;
    showNotification('Help', helpContent);
}

// Load orders
async function loadOrders() {
    try {
        const url = `${API_BASE}/orders?limit=100`;
        
        console.log('Fetching orders from:', url);
        
        const response = await authenticatedFetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API response:', data);
        
        if (data.success !== false && (data.orders || Array.isArray(data))) {
            allOrders = data.orders || data || [];
            console.log('Loaded orders:', allOrders.length);
            
            // Check for new orders
            checkForNewOrders(allOrders);
            
            // Filter and display
            filterAndDisplayOrders();
        } else {
            console.error('API returned error:', data);
            showError('Failed to load orders: ' + (data.error || 'Unknown error'));
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

// Helper function to check if order has scheduled delivery time
function hasScheduledDeliveryTime(order) {
    let rawData = {};
    try {
        if (order.raw_data) {
            rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
        }
    } catch (e) {
        // Ignore parsing errors
    }
    
    // Check for scheduled delivery time in various possible fields
    const scheduledTime = order.scheduled_delivery_time || 
                         order.scheduledDeliveryTime ||
                         order.delivery_time ||
                         order.deliveryTime ||
                         rawData.scheduled_delivery_time ||
                         rawData.scheduledDeliveryTime ||
                         rawData.delivery_time ||
                         rawData.deliveryTime ||
                         rawData.requested_delivery_time ||
                         rawData.requestedDeliveryTime ||
                         null;
    
    if (!scheduledTime) return false;
    
    // Check if scheduled time is in the future (not "as soon as possible")
    try {
        const scheduledDate = new Date(scheduledTime);
        const orderDate = new Date(order.created_at || order.fetched_at || Date.now());
        const now = new Date();
        
        // If scheduled time is more than 30 minutes in the future from order time, it's scheduled
        // If scheduled time is in the past or very close (less than 30 min), it's "as soon as possible"
        const timeDiff = scheduledDate.getTime() - orderDate.getTime();
        const minutesDiff = timeDiff / (1000 * 60);
        
        // Scheduled if: time is in the future AND more than 30 minutes from order time
        return scheduledDate > now && minutesDiff > 30;
    } catch (e) {
        return false;
    }
}

// Helper function to get order category
function getOrderCategory(order) {
    const status = (order.status || '').toUpperCase();
    const isCompleted = ['DELIVERED', 'COMPLETED', 'FULFILLED'].includes(status);
    const isIncomplete = ['CANCELLED', 'FAILED', 'REJECTED', 'CANCELED'].includes(status);
    const isScheduled = hasScheduledDeliveryTime(order) && !isCompleted && !isIncomplete;
    
    if (isCompleted) return 'completed';
    if (isIncomplete) return 'incomplete';
    if (isScheduled) return 'scheduled';
    return 'current';
}

// Filter and display orders
function filterAndDisplayOrders() {
    let filtered = [...allOrders];
    
    // Apply status filter
    if (currentStatusFilter && currentStatusFilter !== 'current') {
        if (currentStatusFilter === 'scheduled') {
            // Scheduled = orders with scheduled delivery time that are not completed/incomplete
            filtered = filtered.filter(order => {
                const category = getOrderCategory(order);
                return category === 'scheduled';
            });
        } else if (currentStatusFilter === 'completed') {
            // Completed = delivered, completed, fulfilled orders
            filtered = filtered.filter(order => {
                const status = (order.status || '').toUpperCase();
                return ['DELIVERED', 'COMPLETED', 'FULFILLED'].includes(status);
            });
        } else if (currentStatusFilter === 'incomplete') {
            // Incomplete = cancelled, failed, rejected orders
            filtered = filtered.filter(order => {
                const status = (order.status || '').toUpperCase();
                return ['CANCELLED', 'FAILED', 'REJECTED', 'CANCELED'].includes(status);
            });
        } else if (currentStatusFilter === 'history') {
            // History = all completed and incomplete orders (old orders)
            filtered = filtered.filter(order => {
                const status = (order.status || '').toUpperCase();
                return ['DELIVERED', 'COMPLETED', 'FULFILLED', 'CANCELLED', 'CANCELED', 'FAILED', 'REJECTED'].includes(status);
            });
        }
    } else if (currentStatusFilter === 'current') {
        // Current = all active orders (not delivered, completed, or cancelled) AND not scheduled
        filtered = filtered.filter(order => {
            const status = (order.status || '').toUpperCase();
            const isActive = status && !['DELIVERED', 'COMPLETED', 'CANCELLED', 'CANCELED', 'FAILED', 'REJECTED'].includes(status);
            const isScheduled = hasScheduledDeliveryTime(order);
            // Current = active orders that are NOT scheduled
            return isActive && !isScheduled;
        });
    }
    
    // Apply search filter
    if (searchQuery) {
        filtered = filtered.filter(order => {
            const searchableText = [
                order.gloriafood_order_id || order.id,
                order.customer_name,
                order.customer_phone,
                order.customer_email,
                order.delivery_address,
                order.status,
                order.merchant_name || order.store_id
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
                <td colspan="15" class="empty-state-cell">
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
        return;
    }
    
    try {
        const rows = orders.map(order => createOrderRow(order)).join('');
        tbody.innerHTML = rows;
    } catch (error) {
        console.error('Error displaying orders:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="15" class="empty-state-cell">
                    <div class="empty-state">
                        <div class="empty-state-text">Error displaying orders: ${error.message}</div>
                    </div>
                </td>
            </tr>
        `;
    }
}

// Escape HTML helper function (global)
function escapeHtml(text) {
    if (!text) return 'N/A';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Create order table row
function createOrderRow(order) {
    if (!order) return '';
    
    const orderId = order.gloriafood_order_id || order.id || 'N/A';
    const status = (order.status || 'UNKNOWN').toUpperCase();
    const customerName = escapeHtml(order.customer_name || 'N/A');
    const customerAddress = escapeHtml(order.delivery_address || order.customer_address || 'N/A');
    // Use merchant_name from backend (already enriched), fallback to store_id only if not available
    // Also check raw_data for merchant/restaurant name
    let merchantName = order.merchant_name;
    if (!merchantName && rawData) {
        merchantName = rawData.merchant_name || 
                      rawData.merchantName ||
                      rawData.restaurant_name ||
                      rawData.restaurantName ||
                      (rawData.restaurant && rawData.restaurant.name) ||
                      (rawData.restaurant && rawData.restaurant.restaurant_name) ||
                      (rawData.merchant && rawData.merchant.name) ||
                      null;
    }
    // Final fallback
    if (!merchantName) {
        merchantName = order.store_id ? `Store ${order.store_id}` : 'N/A';
    }
    merchantName = escapeHtml(merchantName);
    const amount = formatCurrency(order.total_price || 0, order.currency || 'USD');
    const orderPlaced = formatDate(order.fetched_at || order.created_at || order.updated_at);
    
    // Extract fields from raw_data if available
    let rawData = {};
    try {
        if (order.raw_data) {
            rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
        }
    } catch (e) {
        console.error('Error parsing raw_data:', e);
    }
    
    // Get distance from various possible fields (more comprehensive)
    const distance = order.distance || 
                    rawData.distance || 
                    rawData.delivery_distance ||
                    rawData.distance_km ||
                    rawData.distance_miles ||
                    (rawData.delivery && rawData.delivery.distance) ||
                    (rawData.delivery && rawData.delivery.delivery_distance) ||
                    (rawData.delivery && rawData.delivery.distance_km) ||
                    (rawData.location && rawData.location.distance) ||
                    (rawData.restaurant && rawData.restaurant.distance) ||
                    null;
    let formattedDistance = 'N/A';
    if (distance) {
        if (typeof distance === 'number') {
            formattedDistance = distance.toFixed(2) + ' km';
        } else if (typeof distance === 'string') {
            // Check if already has unit
            if (distance.includes('km') || distance.includes('miles') || distance.includes('mi')) {
                formattedDistance = distance;
            } else {
                // Try to parse as number
                const num = parseFloat(distance);
                if (!isNaN(num)) {
                    formattedDistance = num.toFixed(2) + ' km';
                } else {
                    formattedDistance = distance;
                }
            }
        } else {
            formattedDistance = String(distance);
        }
    }
    
    // Get pickup time from various possible fields (comprehensive search)
    const pickupTime = order.pickup_time || 
                      order.pickupTime || 
                      rawData.pickup_time || 
                      rawData.pickupTime || 
                      rawData.requested_pickup_time ||
                      rawData.requestedPickupTime ||
                      rawData.scheduled_pickup_time ||
                      rawData.scheduledPickupTime ||
                      rawData.pickup_at ||
                      rawData.pickupAt ||
                      rawData.pickup_datetime ||
                      rawData.pickupDateTime ||
                      rawData.requested_pickup_datetime ||
                      (rawData.delivery && rawData.delivery.pickup_time) ||
                      (rawData.delivery && rawData.delivery.requested_pickup_time) ||
                      (rawData.delivery && rawData.delivery.pickup_at) ||
                      (rawData.schedule && rawData.schedule.pickup_time) ||
                      (rawData.schedule && rawData.schedule.requested_pickup_time) ||
                      (rawData.time && rawData.time.pickup) ||
                      (rawData.times && rawData.times.pickup) ||
                      null;
    
    // Get delivery time from various possible fields (comprehensive search)
    const deliveryTime = order.delivery_time || 
                        order.deliveryTime || 
                        rawData.delivery_time || 
                        rawData.deliveryTime || 
                        rawData.requested_delivery_time ||
                        rawData.requestedDeliveryTime ||
                        rawData.scheduled_delivery_time ||
                        rawData.scheduledDeliveryTime ||
                        rawData.delivery_at ||
                        rawData.deliveryAt ||
                        rawData.delivery_datetime ||
                        rawData.deliveryDateTime ||
                        rawData.requested_delivery_datetime ||
                        (rawData.delivery && rawData.delivery.delivery_time) ||
                        (rawData.delivery && rawData.delivery.requested_delivery_time) ||
                        (rawData.delivery && rawData.delivery.scheduled_delivery_time) ||
                        (rawData.delivery && rawData.delivery.delivery_at) ||
                        (rawData.schedule && rawData.schedule.delivery_time) ||
                        (rawData.schedule && rawData.schedule.requested_delivery_time) ||
                        (rawData.time && rawData.time.delivery) ||
                        (rawData.times && rawData.times.delivery) ||
                        null;
    
    // Get ready for pickup time (comprehensive search)
    const readyForPickup = order.ready_for_pickup || 
                           order.readyForPickup || 
                           rawData.ready_for_pickup || 
                           rawData.readyForPickup ||
                           rawData.ready_for_pick_up ||
                           rawData.readyForPickUp ||
                           rawData.ready_time ||
                           rawData.readyTime ||
                           rawData.ready_at ||
                           rawData.readyAt ||
                           rawData.prepared_at ||
                           rawData.preparedAt ||
                           (rawData.status && rawData.status.ready_time) ||
                           (rawData.delivery && rawData.delivery.ready_for_pickup) ||
                           null;
    
    // Get driver name from various possible fields (comprehensive search)
    const driver = order.driver_name || 
                  order.driverName || 
                  order.driver || 
                  rawData.driver_name || 
                  rawData.driverName || 
                  rawData.driver ||
                  rawData.assigned_driver ||
                  rawData.assignedDriver ||
                  rawData.driver_id ||
                  rawData.driverId ||
                  (rawData.delivery && rawData.delivery.driver_name) ||
                  (rawData.delivery && rawData.delivery.driver) ||
                  (rawData.delivery && rawData.delivery.assigned_driver) ||
                  (rawData.driver && rawData.driver.name) ||
                  (rawData.driver && rawData.driver.full_name) ||
                  null;
    
    // Format times - try to format, if invalid date, show raw value
    let formattedPickupTime = 'N/A';
    if (pickupTime) {
        try {
            formattedPickupTime = formatDate(pickupTime);
        } catch (e) {
            formattedPickupTime = String(pickupTime);
        }
    }
    
    let formattedDeliveryTime = 'N/A';
    if (deliveryTime) {
        try {
            formattedDeliveryTime = formatDate(deliveryTime);
        } catch (e) {
            formattedDeliveryTime = String(deliveryTime);
        }
    }
    
    let formattedReadyForPickup = 'N/A';
    if (readyForPickup) {
        try {
            formattedReadyForPickup = formatDate(readyForPickup);
        } catch (e) {
            formattedReadyForPickup = String(readyForPickup);
        }
    }
    
    const formattedDriver = driver ? escapeHtml(String(driver)) : 'N/A';
    
    const tracking = order.doordash_tracking_url 
        ? `<a href="${escapeHtml(order.doordash_tracking_url)}" target="_blank" style="color: #22c55e; text-decoration: underline;">Track</a>`
        : 'N/A';
    
    return `
        <tr data-order-id="${escapeHtml(String(orderId))}">
            <td>
                <input type="checkbox" class="order-checkbox" value="${escapeHtml(String(orderId))}">
            </td>
            <td><strong>#${escapeHtml(String(orderId))}</strong></td>
            <td>${customerName}</td>
            <td><span style="color: #3b82f6; font-weight: 500;">${merchantName}</span></td>
            <td>${customerAddress}</td>
            <td>${amount}</td>
            <td>${formattedDistance}</td>
            <td>${orderPlaced}</td>
            <td>${formattedPickupTime}</td>
            <td>${formattedDeliveryTime}</td>
            <td>${formattedReadyForPickup}</td>
            <td>${formattedDriver}</td>
            <td><span class="status-badge status-${status.toLowerCase()}">${escapeHtml(status)}</span></td>
            <td>${tracking}</td>
            <td>
                <button class="btn-icon" onclick="deleteOrder('${escapeHtml(String(orderId))}')" title="Delete" style="color: #ef4444;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
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
        // Add notification for each new order
        newOrders.forEach(order => {
            const orderId = order.gloriafood_order_id || order.id;
            const message = `${order.customer_name || 'Customer'} - ${formatCurrency(order.total_price || 0, order.currency || 'USD')}`;
            
            // Add to notification panel only (no pop-up)
            addNotification(`New Order #${orderId}`, message, 'info', orderId);
            
            // Show browser notification (optional - system notification)
            showBrowserNotification(order);
        });
        
        // Update last order IDs
        lastOrderIds = currentOrderIds;
    }
}

// Show notification (now only adds to notification panel, no pop-up)
function showNotification(title, message, isError = false) {
    // Add to notification panel instead of showing pop-up
    const type = isError ? 'error' : 'success';
    addNotification(title, message, type);
}

// Show browser notification
function showBrowserNotification(order) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const orderId = order.gloriafood_order_id || order.id;
        new Notification(`New Order #${orderId}`, {
            body: `${order.customer_name || 'Customer'} - ${formatCurrency(order.total_price || 0, order.currency || 'USD')}`,
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
    
    autoRefreshInterval = setInterval(() => {
            loadOrders();
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

// Delete order
async function deleteOrder(orderId) {
    if (!confirm(`Are you sure you want to delete Order #${orderId}?`)) {
        return;
    }
    
    try {
        const response = await authenticatedFetch(`${API_BASE}/orders/${orderId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', `Order #${orderId} deleted successfully`);
            // Reload orders
            loadOrders();
        } else {
            showError(data.error || 'Failed to delete order');
        }
    } catch (error) {
        console.error('Error deleting order:', error);
        showError('Error deleting order');
    }
}
// Make deleteOrder available globally
window.deleteOrder = deleteOrder;

