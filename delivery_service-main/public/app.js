// Configuration
const API_BASE = window.location.origin;
const REFRESH_INTERVAL = 5000; // 5 seconds
let autoRefreshInterval = null;
let lastOrderIds = new Set();
let allOrders = [];
let currentStatusFilter = '';
let searchQuery = '';
let currentReportData = null;
let currentReportType = null;

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
        // Check if it's a connection error
        if (error.message && error.message.includes('fetch')) {
            console.warn('Server might not be running. Please start the server.');
            // Show a helpful message in the login form
            const errorDiv = document.getElementById('loginError');
            if (errorDiv) {
                errorDiv.textContent = 'Cannot connect to server. Please make sure the server is running.';
                errorDiv.style.display = 'block';
            }
        }
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
    
    // Make sure login form is active
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    if (loginForm) loginForm.classList.add('active');
    if (signupForm) signupForm.classList.remove('active');
}

// Show dashboard
function showDashboard() {
    // Hide login/signup container
    const authContainer = document.getElementById('authContainer');
    if (authContainer) {
        authContainer.classList.add('hidden');
    }
    
    // Show dashboard container
    const dashboardContainer = document.getElementById('dashboardContainer');
    if (dashboardContainer) {
        dashboardContainer.classList.remove('hidden');
        
        // Show dashboard page by default
        showDashboardPage();
        
        // Start auto-refresh only when authenticated
        startAutoRefresh();
    }
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
    // Ensure login form is active on page load
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    if (loginForm) loginForm.classList.add('active');
    if (signupForm) signupForm.classList.remove('active');
    
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
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMsg = errorData.error || `Server error: ${response.status}`;
                    if (errorDiv) {
                        errorDiv.textContent = errorMsg;
                        errorDiv.style.display = 'block';
                    }
                    return;
                }
                
                const data = await response.json();
                
                if (data.success && data.user) {
                    currentUser = data.user;
                    sessionId = data.sessionId;
                    saveSessionId(data.sessionId);
                    showNotification('Success', 'Login successful!');
                    
                    // Redirect to dashboard
                    showDashboard();
                } else {
                    const errorMsg = data.error || 'Invalid email or password';
                    if (errorDiv) {
                        errorDiv.textContent = errorMsg;
                        errorDiv.style.display = 'block';
                    }
                }
            } catch (error) {
                console.error('Login error:', error);
                const errorMsg = 'Error connecting to server: ' + (error.message || 'Please check if the server is running');
                if (errorDiv) {
                    errorDiv.textContent = errorMsg;
                    errorDiv.style.display = 'block';
                }
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
                return;
            }
            
            if (password.length < 6) {
                const errorMsg = 'Password must be at least 6 characters';
                if (errorDiv) {
                    errorDiv.textContent = errorMsg;
                    errorDiv.style.display = 'block';
                }
                return;
            }
            
            try {
                const response = await fetch(`${API_BASE}/api/auth/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, fullName: name })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    const errorMsg = errorData.error || `Server error: ${response.status}`;
                    if (errorDiv) {
                        errorDiv.textContent = errorMsg;
                        errorDiv.style.display = 'block';
                    }
                    return;
                }
                
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
                }
            } catch (error) {
                console.error('Signup error:', error);
                const errorMsg = 'Error connecting to server: ' + (error.message || 'Please check if the server is running');
                if (errorDiv) {
                    errorDiv.textContent = errorMsg;
                    errorDiv.style.display = 'block';
                }
            }
        });
    }
    
    // Show signup form
    const showSignupLink = document.getElementById('showSignup');
    if (showSignupLink) {
        showSignupLink.addEventListener('click', (e) => {
            e.preventDefault();
            const loginForm = document.getElementById('loginForm');
            const signupForm = document.getElementById('signupForm');
            
            if (loginForm) loginForm.classList.remove('active');
            if (signupForm) signupForm.classList.add('active');
            
            // Clear any error messages
            const loginError = document.getElementById('loginError');
            if (loginError) {
                loginError.style.display = 'none';
                loginError.textContent = '';
            }
        });
    }
    
    // Show login form
    const showLoginLink = document.getElementById('showLogin');
    if (showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            const loginForm = document.getElementById('loginForm');
            const signupForm = document.getElementById('signupForm');
            
            if (signupForm) signupForm.classList.remove('active');
            if (loginForm) loginForm.classList.add('active');
            
            // Clear any error messages
            const signupError = document.getElementById('signupError');
            if (signupError) {
                signupError.style.display = 'none';
                signupError.textContent = '';
            }
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
                    <button class="btn-danger" id="deleteSelectedBtn" style="display: flex; align-items: center; gap: 8px; background-color: #ef4444; color: white;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Delete Selected
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
                            <span>Placement Time</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Est. Delivery Time</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Elapsed Time</span>
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
                        <th></th>
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
    
    // Delete selected orders button
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', deleteSelectedOrders);
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
                    <tbody id="driversTableBody">
                        <tr>
                            <td colspan="7" class="empty-state-cell">
                                <div class="empty-state">
                                    <div class="empty-state-text">Loading drivers...</div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
        </div>
        
        <!-- Driver Modal -->
        <div id="driverModal" class="modal hidden">
            <div class="modal-content merchant-modal-content">
                <div class="modal-header">
                    <h2 id="driverModalTitle">Add New Driver</h2>
                    <button class="modal-close" id="closeDriverModal">&times;</button>
                </div>
                <form id="driverForm" class="modal-body">
                    <div class="form-group">
                        <label>Driver Name <span style="color: red;">*</span></label>
                        <input type="text" id="driverName" required placeholder="Enter Driver Name">
                    </div>
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="tel" id="driverPhone" placeholder="Enter Phone Number">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="driverEmail" placeholder="Enter Email Address">
                    </div>
                    <div class="form-group">
                        <label>Vehicle Type</label>
                        <input type="text" id="driverVehicleType" placeholder="e.g., Car, Motorcycle, Bike">
                    </div>
                    <div class="form-group">
                        <label>Vehicle Plate</label>
                        <input type="text" id="driverVehiclePlate" placeholder="Enter Vehicle Plate Number">
                    </div>
                    <div id="driverError" class="error-message" style="display: none; color: #ef4444; margin-top: 12px; padding: 8px; background: #fee2e2; border-radius: 4px; font-size: 14px;"></div>
                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" id="cancelDriverBtn">Cancel</button>
                        <button type="submit" class="btn-primary">Add Driver</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    // Initialize drivers page
    initializeDriversPage();
    loadDrivers();
}

// Initialize Drivers page
function initializeDriversPage() {
    // Setup new driver button
    const newDriverBtn = document.getElementById('newDriverBtn');
    if (newDriverBtn) {
        newDriverBtn.addEventListener('click', () => {
            openDriverModal();
        });
    }
    
    // Modal close buttons
    const closeModal = document.getElementById('closeDriverModal');
    const cancelBtn = document.getElementById('cancelDriverBtn');
    if (closeModal) closeModal.addEventListener('click', closeDriverModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeDriverModal);
    
    // Form submission
    const driverForm = document.getElementById('driverForm');
    if (driverForm) {
        driverForm.addEventListener('submit', handleDriverSubmit);
    }
    
    // Close modal on outside click
    const modal = document.getElementById('driverModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeDriverModal();
            }
        });
    }
}

// Open driver modal
function openDriverModal() {
    const modal = document.getElementById('driverModal');
    const form = document.getElementById('driverForm');
    const title = document.getElementById('driverModalTitle');
    const errorDiv = document.getElementById('driverError');
    
    if (!modal || !form || !title) return;
    
    title.textContent = 'Add New Driver';
    form.reset();
    form.dataset.editingDriverId = '';
    
    if (errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
    }
    
    modal.classList.remove('hidden');
}

// Close driver modal
function closeDriverModal() {
    const modal = document.getElementById('driverModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Handle driver form submission
async function handleDriverSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const name = document.getElementById('driverName').value.trim();
    const phone = document.getElementById('driverPhone').value.trim();
    const email = document.getElementById('driverEmail').value.trim();
    const vehicleType = document.getElementById('driverVehicleType').value.trim();
    const vehiclePlate = document.getElementById('driverVehiclePlate').value.trim();
    const errorDiv = document.getElementById('driverError');
    
    if (!name) {
        if (errorDiv) {
            errorDiv.textContent = 'Driver name is required';
            errorDiv.style.display = 'block';
        }
        return;
    }
    
    try {
        const response = await authenticatedFetch(`${API_BASE}/api/drivers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                phone: phone || undefined,
                email: email || undefined,
                vehicle_type: vehicleType || undefined,
                vehicle_plate: vehiclePlate || undefined
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', 'Driver added successfully!');
            closeDriverModal();
            loadDrivers();
        } else {
            const errorMsg = data.error || 'Failed to add driver';
            if (errorDiv) {
                errorDiv.textContent = errorMsg;
                errorDiv.style.display = 'block';
            }
            showError(errorMsg);
        }
    } catch (error) {
        console.error('Error adding driver:', error);
        const errorMsg = 'Error connecting to server: ' + (error.message || 'Please check if the server is running');
        if (errorDiv) {
            errorDiv.textContent = errorMsg;
            errorDiv.style.display = 'block';
        }
        showError(errorMsg);
    }
}

// Load drivers
async function loadDrivers() {
    try {
        const response = await authenticatedFetch(`${API_BASE}/api/drivers`);
        const data = await response.json();
        
        if (data.success && data.drivers) {
            displayDrivers(data.drivers);
        } else {
            displayDrivers([]);
        }
    } catch (error) {
        console.error('Error loading drivers:', error);
        displayDrivers([]);
    }
}

// Display drivers in table
function displayDrivers(drivers) {
    const tbody = document.getElementById('driversTableBody');
    
    if (!tbody) return;
    
    if (drivers.length === 0) {
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
            <td>${escapeHtml(driver.name || 'N/A')}</td>
            <td>${driver.rating ? parseFloat(driver.rating).toFixed(1) : '0.0'}</td>
            <td>${escapeHtml(driver.phone || 'N/A')}</td>
            <td>${escapeHtml(driver.email || 'N/A')}</td>
            <td>${escapeHtml((driver.vehicle_type || 'N/A') + (driver.vehicle_plate ? ' - ' + driver.vehicle_plate : ''))}</td>
            <td><span class="status-badge status-${(driver.status || 'active').toLowerCase()}">${escapeHtml((driver.status || 'active').toUpperCase())}</span></td>
            <td>
                <button class="btn-icon" onclick="deleteDriver(${driver.id})" title="Delete" style="color: #ef4444;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </td>
        </tr>
    `).join('');
}

// Delete driver
async function deleteDriver(driverId) {
    if (!confirm(`Are you sure you want to delete this driver?`)) {
        return;
    }
    
    try {
        const response = await authenticatedFetch(`${API_BASE}/api/drivers/${driverId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', 'Driver deleted successfully!');
            loadDrivers();
        } else {
            showError(data.error || 'Failed to delete driver');
        }
    } catch (error) {
        console.error('Error deleting driver:', error);
        showError('Error deleting driver: ' + error.message);
    }
}

// Make deleteDriver available globally
window.deleteDriver = deleteDriver;

// Show Merchants page
function showMerchantsPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Merchants</h1>
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
        
        <!-- Merchant Modal (for editing only) -->
        <div id="merchantModal" class="modal hidden">
            <div class="modal-content merchant-modal-content">
                <div class="modal-header">
                    <h2 id="merchantModalTitle">Edit Merchant</h2>
                    <button class="modal-close" id="closeMerchantModal">&times;</button>
                </div>
                <form id="merchantForm" class="modal-body">
                    <div class="form-group">
                        <label>Store ID <span style="color: red;">*</span></label>
                        <input type="text" id="merchantStoreId" required placeholder="Enter Store ID" 
                               pattern="[A-Za-z0-9_-]+" title="Store ID should contain only letters, numbers, hyphens, and underscores" disabled>
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

// Open merchant modal for editing merchant (adding new merchants is disabled)
function openMerchantModal(merchant) {
    if (!merchant) {
        showError('Merchant data is required');
        return;
    }
    
    const modal = document.getElementById('merchantModal');
    const form = document.getElementById('merchantForm');
    const title = document.getElementById('merchantModalTitle');
    
    if (!modal || !form || !title) return;
    
    // Set title (only editing is allowed)
    title.textContent = 'Edit Merchant';
    
    // Reset form
    form.reset();
    
    // Populate form for editing
    document.getElementById('merchantStoreId').value = merchant.store_id;
    document.getElementById('merchantStoreId').disabled = true; // Can't change store_id
    document.getElementById('merchantName').value = merchant.merchant_name || '';
    document.getElementById('merchantApiUrl').value = merchant.api_url || '';
    document.getElementById('merchantIsActive').checked = merchant.is_active !== false;
    // Don't populate API key and master key for security
    
    // Store current merchant for form submission
    form.dataset.editingStoreId = merchant.store_id;
    
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
            // Adding new merchants is disabled
            showError('Adding new merchants is not allowed through the UI');
            return;
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
async function showDashboardPage() {
    const mainContainer = document.querySelector('.main-container');
    if (!mainContainer) {
        console.error('Main container not found');
        return;
    }
    
    // Get merchant name
    let merchantName = 'Dashboard';
    try {
        const response = await authenticatedFetch(`${API_BASE}/merchants`);
        const data = await response.json();
        if (data.success && data.merchants && data.merchants.length > 0) {
            const merchant = data.merchants.find(m => m.is_active) || data.merchants[0];
            merchantName = merchant.merchant_name || 'Dashboard';
        }
    } catch (error) {
        console.error('Error fetching merchant:', error);
    }
    
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">${escapeHtml(merchantName)}</h1>
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
        
        // Store current report data and type for export
        currentReportType = reportType;
        
        switch(reportType) {
            case 'sales':
                reportData = await fetchSalesReport();
                currentReportData = reportData;
                reportHTML = renderSalesReport(reportData);
                break;
            case 'orders':
                reportData = await fetchOrdersReport();
                currentReportData = reportData;
                reportHTML = renderOrdersReport(reportData);
                break;
            case 'revenue':
                reportData = await fetchRevenueReport();
                currentReportData = reportData;
                reportHTML = renderRevenueReport(reportData);
                break;
            case 'drivers':
                reportData = await fetchDriversReport();
                currentReportData = reportData;
                reportHTML = renderDriversReport(reportData);
                break;
            case 'customers':
                reportData = await fetchCustomersReport();
                currentReportData = reportData;
                reportHTML = renderCustomersReport(reportData);
                break;
            case 'merchants':
                reportData = await fetchMerchantsReport();
                currentReportData = reportData;
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

// Export report to Excel
window.exportReport = function(type) {
    try {
        if (!currentReportData || currentReportType !== type) {
            showNotification('Error', 'No report data available. Please reload the report.', 'error');
            return;
        }
        
        let headers = [];
        let rows = [];
        let filename = '';
        
        switch(type) {
            case 'sales':
                headers = ['Order No.', 'Customer', 'Merchant', 'Amount', 'Currency', 'Status', 'Date'];
                rows = currentReportData.map(order => {
                    const escapeCSV = (val) => {
                        const str = String(val || 'N/A');
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return '"' + str.replace(/"/g, '""') + '"';
                        }
                        return str;
                    };
                    return [
                        escapeCSV(order.gloriafood_order_id || order.id),
                        escapeCSV(order.customer_name),
                        escapeCSV(order.merchant_name),
                        escapeCSV(order.total_price || 0),
                        escapeCSV(order.currency || 'USD'),
                        escapeCSV(order.status),
                        escapeCSV(formatDate(order.created_at || order.fetched_at))
                    ];
                });
                filename = `sales_report_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            case 'orders':
                headers = ['Order No.', 'Customer', 'Merchant', 'Address', 'Amount', 'Currency', 'Status', 'Date'];
                rows = currentReportData.map(order => {
                    const escapeCSV = (val) => {
                        const str = String(val || 'N/A');
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return '"' + str.replace(/"/g, '""') + '"';
                        }
                        return str;
                    };
                    return [
                        escapeCSV(order.gloriafood_order_id || order.id),
                        escapeCSV(order.customer_name),
                        escapeCSV(order.merchant_name),
                        escapeCSV(order.delivery_address || order.customer_address),
                        escapeCSV(order.total_price || 0),
                        escapeCSV(order.currency || 'USD'),
                        escapeCSV(order.status),
                        escapeCSV(formatDate(order.created_at || order.fetched_at))
                    ];
                });
                filename = `orders_report_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            case 'revenue':
                // Group by date - handle both {orders, stats} structure and array structure
                const revenueOrders = currentReportData.orders || currentReportData || [];
                const revenueByDate = {};
                revenueOrders.forEach(order => {
                    const date = new Date(order.created_at || order.fetched_at).toLocaleDateString();
                    revenueByDate[date] = revenueByDate[date] || { revenue: 0, orders: 0 };
                    revenueByDate[date].revenue += parseFloat(order.total_price) || 0;
                    revenueByDate[date].orders++;
                });
                
                headers = ['Date', 'Revenue', 'Orders', 'Average Order Value'];
                rows = Object.entries(revenueByDate)
                    .sort((a, b) => new Date(b[0]) - new Date(a[0]))
                    .map(([date, data]) => {
                        const escapeCSV = (val) => {
                            const str = String(val || 'N/A');
                            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                                return '"' + str.replace(/"/g, '""') + '"';
                            }
                            return str;
                        };
                        const avgOrder = data.orders > 0 ? (data.revenue / data.orders).toFixed(2) : '0.00';
                        return [
                            escapeCSV(date),
                            escapeCSV(data.revenue.toFixed(2)),
                            escapeCSV(data.orders),
                            escapeCSV(avgOrder)
                        ];
                    });
                filename = `revenue_report_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            case 'drivers':
                headers = ['Name', 'Phone', 'Email', 'Vehicle', 'Status', 'Rating'];
                rows = currentReportData.map(driver => {
                    const escapeCSV = (val) => {
                        const str = String(val || 'N/A');
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return '"' + str.replace(/"/g, '""') + '"';
                        }
                        return str;
                    };
                    return [
                        escapeCSV(driver.name || driver.full_name),
                        escapeCSV(driver.phone),
                        escapeCSV(driver.email),
                        escapeCSV(driver.vehicle),
                        escapeCSV(driver.status || 'inactive'),
                        escapeCSV(driver.rating ? driver.rating.toFixed(1) : 'N/A')
                    ];
                });
                filename = `drivers_report_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            case 'customers':
                // Group by customer (same logic as renderCustomersReport)
                const customerData = {};
                currentReportData.forEach(order => {
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
                
                headers = ['Customer Name', 'Email', 'Phone', 'Total Orders', 'Total Spent', 'Average Order Value'];
                rows = customers.map(customer => {
                    const escapeCSV = (val) => {
                        const str = String(val || 'N/A');
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return '"' + str.replace(/"/g, '""') + '"';
                        }
                        return str;
                    };
                    const avgOrder = customer.orders > 0 ? (customer.totalSpent / customer.orders).toFixed(2) : '0.00';
                    return [
                        escapeCSV(customer.name),
                        escapeCSV(customer.email),
                        escapeCSV(customer.phone),
                        escapeCSV(customer.orders),
                        escapeCSV(customer.totalSpent.toFixed(2)),
                        escapeCSV(avgOrder)
                    ];
                });
                filename = `customers_report_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            case 'merchants':
                headers = ['Store ID', 'Merchant Name', 'API URL', 'Status', 'Created At'];
                rows = currentReportData.map(merchant => {
                    const escapeCSV = (val) => {
                        const str = String(val || 'N/A');
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return '"' + str.replace(/"/g, '""') + '"';
                        }
                        return str;
                    };
                    return [
                        escapeCSV(merchant.store_id),
                        escapeCSV(merchant.merchant_name),
                        escapeCSV(merchant.api_url),
                        escapeCSV(merchant.is_active ? 'Active' : 'Inactive'),
                        escapeCSV(formatDate(merchant.created_at))
                    ];
                });
                filename = `merchants_report_${new Date().toISOString().split('T')[0]}.csv`;
                break;
                
            default:
                showNotification('Error', 'Unknown report type', 'error');
                return;
        }
        
        if (rows.length === 0) {
            showNotification('Info', 'No data to export', 'info');
            return;
        }
        
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
        link.download = filename;
        
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
        
        showNotification('Success', `Exported ${rows.length} records to Excel`, 'success');
    } catch (error) {
        console.error('Error exporting report:', error);
        showNotification('Error', 'Failed to export report: ' + error.message, 'error');
    }
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
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) {
        // Close all other dropdowns
        document.querySelectorAll('.profile-dropdown').forEach(d => {
            if (d.id !== 'profileDropdown') {
                d.classList.add('hidden');
            }
        });
        // Toggle current dropdown
        dropdown.classList.toggle('hidden');
    } else {
        createProfileDropdown();
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('#profileBtn') && !e.target.closest('.profile-dropdown')) {
        document.querySelectorAll('.profile-dropdown').forEach(dropdown => {
            dropdown.classList.add('hidden');
        });
    }
});

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

// Create profile dropdown menu
function createProfileDropdown() {
    // Remove existing dropdown if any
    const existing = document.getElementById('profileDropdown');
    if (existing) {
        existing.remove();
    }
    
    const dropdown = document.createElement('div');
    dropdown.id = 'profileDropdown';
    dropdown.className = 'profile-dropdown';
    
    dropdown.innerHTML = `
        <div class="profile-dropdown-item" id="myAccountItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>My Account</span>
        </div>
        <div class="profile-dropdown-item" id="settingsItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m21 12h-6m-6 0H1m16-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm-8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"></path>
            </svg>
            <span>Settings</span>
        </div>
        <div class="profile-dropdown-item" id="logoutItem">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Log Out</span>
        </div>
    `;
    
    // Position dropdown near profile button
    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) {
        const rect = profileBtn.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${rect.bottom + 8}px`;
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
    }
    
    document.body.appendChild(dropdown);
    
    // Handle My Account click
    document.getElementById('myAccountItem')?.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        showMyAccountPage();
    });
    
    // Handle Settings click
    document.getElementById('settingsItem')?.addEventListener('click', () => {
        dropdown.classList.add('hidden');
        showSettingsPage();
    });
    
    // Handle Log Out click
    document.getElementById('logoutItem')?.addEventListener('click', async () => {
        dropdown.classList.add('hidden');
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

// Show My Account page
async function showMyAccountPage() {
    const mainContainer = document.querySelector('.main-container');
    if (!mainContainer) return;
    
    const userName = currentUser?.full_name || currentUser?.email || 'User';
    const userEmail = currentUser?.email || '';
    const userPhone = currentUser?.phone || '';
    
    // Get restaurant API key from merchants
    let restaurantApiKey = 'Not configured';
    try {
        const response = await authenticatedFetch(`${API_BASE}/merchants`);
        const data = await response.json();
        if (data.success && data.merchants && data.merchants.length > 0) {
            // Get first active merchant's API key
            const activeMerchant = data.merchants.find(m => m.is_active) || data.merchants[0];
            restaurantApiKey = activeMerchant.api_key ? '********' : 'Not configured';
        }
    } catch (error) {
        console.error('Error fetching merchants:', error);
    }
    
    mainContainer.innerHTML = `
        <div class="profile-page-container">
            <div class="profile-page-header">
                <h1 class="page-title">Profile</h1>
            </div>
            
            <!-- Profile Section -->
            <div class="profile-section">
                <h2 class="section-title">Profile</h2>
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Account owner name</div>
                        <div class="profile-field-value" id="accountOwnerName">${escapeHtml(userName)}</div>
                    </div>
                    <button class="btn-change" onclick="editField('accountOwnerName', 'Account owner name', 'text')">Change</button>
                </div>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Phone number</div>
                        <div class="profile-field-value" id="phoneNumber">${escapeHtml(userPhone || 'Not set')}</div>
                    </div>
                    <button class="btn-change" onclick="editField('phoneNumber', 'Phone number', 'tel')">Change</button>
                </div>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Email</div>
                        <div class="profile-field-value" id="email">${escapeHtml(userEmail)}</div>
                    </div>
                    <button class="btn-change" onclick="editField('email', 'Email', 'email')">Change</button>
                </div>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Api Key</div>
                        <div class="profile-field-value" id="apiKey">${escapeHtml(restaurantApiKey)}</div>
                    </div>
                    <button class="btn-show" onclick="toggleApiKey()" id="apiKeyToggle">Show</button>
                </div>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Password</div>
                        <div class="profile-field-value">********</div>
                    </div>
                    <button class="btn-change" onclick="editPassword()">Change</button>
                </div>
            </div>
            
            <!-- Billing Contact Details Section -->
            <div class="profile-section">
                <h2 class="section-title">Billing contact details</h2>
                <p class="section-subtitle">Billing contact details</p>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Company name</div>
                        <div class="profile-field-value" id="companyName">${escapeHtml(userName || 'Not set')}</div>
                    </div>
                    <button class="btn-change" onclick="editField('companyName', 'Company name', 'text')">Change</button>
                </div>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Email</div>
                        <div class="profile-field-value" id="billingEmail">${escapeHtml(userEmail)}</div>
                    </div>
                    <button class="btn-change" onclick="editField('billingEmail', 'Billing Email', 'email')">Change</button>
                </div>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Billing address</div>
                        <div class="profile-field-value" id="billingAddress">Not set</div>
                    </div>
                    <button class="btn-change" onclick="editField('billingAddress', 'Billing address', 'text')">Change</button>
                </div>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Contact Name</div>
                        <div class="profile-field-value" id="contactName">${escapeHtml(userName)}</div>
                    </div>
                    <button class="btn-change" onclick="editField('contactName', 'Contact Name', 'text')">Change</button>
                </div>
                
                <div class="profile-field-card">
                    <div class="profile-field-content">
                        <div class="profile-field-label">Contact Phone</div>
                        <div class="profile-field-value" id="contactPhone">${escapeHtml(userPhone || 'Not set')}</div>
                    </div>
                    <button class="btn-change" onclick="editField('contactPhone', 'Contact Phone', 'tel')">Change</button>
                </div>
            </div>
        </div>
    `;
    
    // Store original API key for toggle
    window._originalApiKey = restaurantApiKey;
}

// Edit field function
function editField(fieldId, fieldLabel, fieldType) {
    const fieldElement = document.getElementById(fieldId);
    if (!fieldElement) return;
    
    const currentValue = fieldElement.textContent;
    const newValue = prompt(`Enter new ${fieldLabel}:`, currentValue);
    
    if (newValue !== null && newValue.trim() !== '') {
        // Update the field
        fieldElement.textContent = newValue.trim();
        
        // TODO: Save to backend API
        showNotification('Success', `${fieldLabel} updated successfully`, 'success');
    }
}

// Toggle API Key visibility
async function toggleApiKey() {
    const apiKeyElement = document.getElementById('apiKey');
    const toggleBtn = document.getElementById('apiKeyToggle');
    
    if (!apiKeyElement || !toggleBtn) return;
    
    if (apiKeyElement.textContent === '********') {
        // Show API key
        try {
            const response = await authenticatedFetch(`${API_BASE}/merchants`);
            const data = await response.json();
            if (data.success && data.merchants && data.merchants.length > 0) {
                const activeMerchant = data.merchants.find(m => m.is_active) || data.merchants[0];
                if (activeMerchant.api_key) {
                    apiKeyElement.textContent = activeMerchant.api_key;
                    toggleBtn.textContent = 'Hide';
                } else {
                    showNotification('Info', 'API Key not configured', 'info');
                }
            }
        } catch (error) {
            console.error('Error fetching API key:', error);
            showNotification('Error', 'Failed to fetch API key', 'error');
        }
    } else {
        // Hide API key
        apiKeyElement.textContent = '********';
        toggleBtn.textContent = 'Show';
    }
}

// Edit password function
function editPassword() {
    const newPassword = prompt('Enter new password:');
    if (newPassword !== null && newPassword.trim() !== '') {
        if (newPassword.length < 6) {
            showNotification('Error', 'Password must be at least 6 characters', 'error');
            return;
        }
        
        // TODO: Save to backend API
        showNotification('Success', 'Password updated successfully', 'success');
    }
}

// Make functions globally available
window.editField = editField;
window.toggleApiKey = toggleApiKey;
window.editPassword = editPassword;

// Show Settings page
function showSettingsPage() {
    const mainContainer = document.querySelector('.main-container');
    if (!mainContainer) return;
    
    // Default selected item
    let selectedItem = localStorage.getItem('settingsSelectedItem') || 'business-settings';
    
    mainContainer.innerHTML = `
        <div class="settings-page-container">
            <div class="settings-sidebar">
                <h2 class="settings-sidebar-title">Settings</h2>
                <div class="settings-menu">
                    <div class="settings-menu-item ${selectedItem === 'business-settings' ? 'active' : ''}" onclick="selectSettingsItem('business-settings')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                            <line x1="12" y1="22.08" x2="12" y2="12"></line>
                        </svg>
                        <span>Business settings</span>
                    </div>
                    
                    <div class="settings-menu-item ${selectedItem === 'dispatch-settings' ? 'active' : ''}" onclick="selectSettingsItem('dispatch-settings')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 3h7v7H3z"></path>
                            <path d="M14 3h7v7h-7z"></path>
                            <path d="M14 14h7v7h-7z"></path>
                            <path d="M3 14h7v7H3z"></path>
                        </svg>
                        <span>Dispatch settings</span>
                    </div>
                    
                    <div class="settings-menu-item ${selectedItem === 'driver-settings' ? 'active' : ''}" onclick="selectSettingsItem('driver-settings')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"></path>
                            <polygon points="12 15 17 21 7 21 12 15"></polygon>
                        </svg>
                        <span>Driver settings</span>
                    </div>
                    
                    <div class="settings-menu-item ${selectedItem === 'third-party-delivery' ? 'active' : ''}" onclick="selectSettingsItem('third-party-delivery')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <span>Third-Party delivery</span>
                    </div>
                    
                    <div class="settings-menu-item ${selectedItem === 'customer-notification' ? 'active' : ''}" onclick="selectSettingsItem('customer-notification')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <span>Customer notification</span>
                    </div>
                    
                    <div class="settings-menu-item ${selectedItem === 'users' ? 'active' : ''}" onclick="selectSettingsItem('users')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>Users</span>
                    </div>
                    
                    <div class="settings-menu-item ${selectedItem === 'location' ? 'active' : ''}" onclick="selectSettingsItem('location')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="10" r="3"></circle>
                            <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"></path>
                        </svg>
                        <span>Location</span>
                    </div>
                </div>
            </div>
            
            <div class="settings-content">
                <div id="settingsContentArea">
                    Loading...
                </div>
            </div>
        </div>
    `;
    
    // Load content asynchronously
    loadSettingsContent(selectedItem);
}

// Load settings content asynchronously
async function loadSettingsContent(itemId) {
    const contentArea = document.getElementById('settingsContentArea');
    if (!contentArea) return;
    
    try {
        let content = '';
        if (itemId === 'business-settings') {
            content = await getBusinessSettingsContent();
        } else if (itemId === 'driver-settings') {
            content = await getDriverSettingsContent();
        } else if (itemId === 'third-party-delivery') {
            content = await getThirdPartyDeliveryContent();
        } else if (itemId === 'customer-notification') {
            content = await getCustomerNotificationContent();
        } else if (itemId === 'users') {
            content = await getUsersContent();
        } else if (itemId === 'location') {
            content = await getLocationContent();
        } else if (itemId === 'dispatch-settings') {
            content = await getDispatchSettingsContent();
        } else {
            content = await getSettingsContent(itemId);
        }
        contentArea.innerHTML = content;
    } catch (error) {
        console.error('Error loading settings content:', error);
        contentArea.innerHTML = '<p>Error loading settings content</p>';
    }
}

// Select settings menu item
function selectSettingsItem(itemId) {
    localStorage.setItem('settingsSelectedItem', itemId);
    showSettingsPage();
}

// Get Business Settings content with actual merchant data
async function getBusinessSettingsContent() {
    // Get merchant data
    let merchant = null;
    let merchantPhone = '';
    let merchantAddress = '';
    
    try {
        const response = await authenticatedFetch(`${API_BASE}/merchants`);
        const data = await response.json();
        if (data.success && data.merchants && data.merchants.length > 0) {
            merchant = data.merchants.find(m => m.is_active) || data.merchants[0];
            
            // Try to get phone and address from recent orders
            try {
                const ordersResponse = await authenticatedFetch(`${API_BASE}/orders?limit=1`);
                const ordersData = await ordersResponse.json();
                if (ordersData.success && ordersData.orders && ordersData.orders.length > 0) {
                    const order = ordersData.orders[0];
                    // Try to extract phone and address from order data
                    let rawData = {};
                    try {
                        if (order.raw_data) {
                            rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
                        }
                    } catch (e) {}
                    
                    merchantPhone = rawData.phone || rawData.merchant_phone || rawData.store_phone || order.phone || '';
                    merchantAddress = rawData.address || rawData.store_address || rawData.restaurant_address || order.store_address || order.delivery_address || '';
                }
            } catch (e) {
                console.error('Error fetching order data:', e);
            }
        }
    } catch (error) {
        console.error('Error fetching merchant:', error);
    }
    
    const businessName = merchant?.merchant_name || 'Not set';
    const businessType = localStorage.getItem('businessType') || 'merchant';
    const activeTab = localStorage.getItem('businessSettingsTab') || 'merchant';
    const useDriverFleet = localStorage.getItem('useDriverFleet') === 'true';
    const acceptTakeoutOrders = localStorage.getItem('acceptTakeoutOrders') === 'true';
    const maxDeliveryTime = localStorage.getItem('maxDeliveryTime') || '60';
    const orderPrepTime = localStorage.getItem('orderPrepTime') || '60';
    
    return `
        <h1 class="settings-content-title">Business settings</h1>
        
        <div class="business-type-tabs">
            <button class="business-type-tab ${activeTab === 'merchant' ? 'active' : ''}" onclick="switchBusinessTab('merchant')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>Merchant</span>
            </button>
            <button class="business-type-tab ${activeTab === 'delivery-company' ? 'active' : ''}" onclick="switchBusinessTab('delivery-company')">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 3h15v13H1z"></path>
                    <path d="M16 8h4l3 3v5h-7V8z"></path>
                    <circle cx="5.5" cy="18.5" r="2.5"></circle>
                    <circle cx="18.5" cy="18.5" r="2.5"></circle>
                </svg>
                <span>Delivery company</span>
            </button>
        </div>
        
        <div id="businessSettingsContent">
            ${activeTab === 'merchant' ? `
                <!-- Business Details Section -->
                <div class="business-settings-section">
                    <h3 class="settings-section-subtitle">Set your business details</h3>
                    
                    <div class="business-detail-field">
                        <div class="business-detail-label">Business name</div>
                        <div class="business-detail-value-container">
                            <div class="business-detail-value" id="businessNameValue">${escapeHtml(businessName)}</div>
                            <button class="btn-edit-icon" onclick="editBusinessName()">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="business-detail-field">
                        <div class="business-detail-label">Business logo</div>
                        <div class="business-detail-value-container">
                            <div class="business-logo-placeholder" id="businessLogoPlaceholder">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                            </div>
                            <button class="btn-edit-icon" onclick="editBusinessLogo()">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Contact and Address Information -->
                <div class="business-settings-section">
                    <div class="business-input-field">
                        <label class="business-input-label">Merchant phone number</label>
                        <input type="tel" class="business-input" id="merchantPhone" value="${escapeHtml(merchantPhone)}" placeholder="Enter phone number">
                    </div>
                    
                    <div class="business-input-field">
                        <label class="business-input-label">Merchant store address</label>
                        <input type="text" class="business-input" id="merchantAddress" value="${escapeHtml(merchantAddress)}" placeholder="Enter store address">
                    </div>
                </div>
                
                <!-- Operational Settings Toggles -->
                <div class="business-settings-section">
                    <div class="business-toggle-field">
                        <div class="business-toggle-content">
                            <label class="business-toggle-label">I will use my own driver fleet for delivery</label>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="driverFleetToggle" ${useDriverFleet ? 'checked' : ''} onchange="toggleDriverFleet(this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="business-toggle-field">
                        <div class="business-toggle-content">
                            <label class="business-toggle-label">Accept takeout orders from integrations</label>
                            <p class="business-toggle-description">Seamlessly accept and manage takeout orders from integrated delivery platforms in one centralized hub.</p>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="takeoutOrdersToggle" ${acceptTakeoutOrders ? 'checked' : ''} onchange="toggleTakeoutOrders(this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
                
                <!-- Service Times Section -->
                <div class="business-settings-section">
                    <h3 class="settings-section-subtitle">Set your service times</h3>
                    
                    <div class="business-detail-field">
                        <div class="business-detail-label">Maximum time allowed for delivery (on-demand)</div>
                        <div class="business-detail-value-container">
                            <div class="business-detail-value" id="maxDeliveryTimeValue">${maxDeliveryTime} Minutes</div>
                            <button class="btn-edit-icon" onclick="editMaxDeliveryTime()">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="business-detail-field">
                        <div class="business-detail-label">Order preparation time</div>
                        <div class="business-detail-value-container">
                            <div class="business-detail-value" id="orderPrepTimeValue">${orderPrepTime} Minutes</div>
                            <button class="btn-edit-icon" onclick="editOrderPrepTime()">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            ` : `
                <!-- Delivery Company - Service Times Section -->
                <div class="business-settings-section">
                    <h3 class="settings-section-subtitle">Service times</h3>
                    <p class="settings-instruction-text">Set your service times</p>
                    
                    <div class="business-detail-field">
                        <div class="business-detail-label">Maximum time allowed for delivery (on-demand)</div>
                        <div class="business-detail-value-container">
                            <div class="business-detail-value" id="maxDeliveryTimeValueDC">${maxDeliveryTime} Minutes</div>
                            <button class="btn-edit-icon" onclick="editMaxDeliveryTimeDC()">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="business-detail-field">
                        <div class="business-detail-label">Order preparation time</div>
                        <div class="business-detail-value-container">
                            <div class="business-detail-value" id="orderPrepTimeValueDC">${orderPrepTime} Minutes</div>
                            <button class="btn-edit-icon" onclick="editOrderPrepTimeDC()">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
                    <button class="btn-secondary" onclick="cancelBusinessSettings()">Cancel</button>
                    <button class="btn-primary" onclick="saveBusinessSettings()">Save</button>
                </div>
            `}
        </div>
    `;
}

// Get Dispatch Settings content
async function getDispatchSettingsContent() {
    const autoAssign = localStorage.getItem('dispatchAutoAssign') === 'true';
    const dispatchTimeWindow = localStorage.getItem('dispatchTimeWindow') || '1';
    
    return `
        <h1 class="settings-content-title">Dispatch settings</h1>
        
        <!-- Auto-assign Section -->
        <div class="driver-settings-section">
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Auto-assign</div>
                    <p class="driver-setting-description">Any incoming delivery order will be assigned to the best drivers.</p>
                </div>
                <label class="switch">
                    <input type="checkbox" ${autoAssign ? 'checked' : ''} onchange="toggleDispatchSetting('autoAssign', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        
        <!-- Dispatch time window Section -->
        <div class="driver-settings-section">
            <h3 class="settings-section-subtitle">Dispatch time window</h3>
            <p class="settings-instruction-text">This time is used to indicate when a scheduled order will be put in the current order tab for dispatch. If this time is 1 hours, it means when the required delivery time is within 1 hours window, this order will be moved to the current order tab for dispatch.</p>
            
            <div class="driver-time-input">
                <input type="number" class="business-input" id="dispatchTimeWindowInput" value="${dispatchTimeWindow}" min="0.5" max="24" step="0.5" style="width: 100px; display: inline-block;">
                <span style="margin-left: 8px; color: #475569;">hours</span>
                <button class="btn-primary" onclick="saveDispatchTimeWindow()" style="margin-left: 16px; padding: 8px 16px;">Save</button>
            </div>
        </div>
    `;
}

// Get Driver Settings content
async function getDriverSettingsContent() {
    const dispatchOnlineOnly = localStorage.getItem('dispatchOnlineOnly') === 'true';
    const autoAccept = localStorage.getItem('autoAccept') === 'true';
    const showItemPrice = localStorage.getItem('showItemPrice') === 'true';
    const showEarningInfo = localStorage.getItem('showEarningInfo') === 'true';
    const showDriverPhone = localStorage.getItem('showDriverPhone') === 'true';
    const showCustomerDetails = localStorage.getItem('showCustomerDetails') === 'true';
    const itemCheckPickup = localStorage.getItem('itemCheckPickup') === 'true';
    const requirePOD = localStorage.getItem('requirePOD') === 'true';
    const requireIDScanning = localStorage.getItem('requireIDScanning') === 'true';
    const reoptimizeRoute = localStorage.getItem('reoptimizeRoute') === 'true';
    const geofencing = localStorage.getItem('geofencing') === 'true';
    const driverResponseTime = localStorage.getItem('driverResponseTime') || '10';
    const fixPayPerDelivery = localStorage.getItem('fixPayPerDelivery') === 'true';
    const fixPayAmount = localStorage.getItem('fixPayAmount') || '5';
    const percentageOrderTotal = localStorage.getItem('percentageOrderTotal') === 'true';
    const perDistance = localStorage.getItem('perDistance') === 'true';
    const percentageDeliveryFee = localStorage.getItem('percentageDeliveryFee') === 'true';
    const percentageDeliveryFeeValue = localStorage.getItem('percentageDeliveryFeeValue') || '100';
    const percentageTips = localStorage.getItem('percentageTips') === 'true';
    const percentageTipsValue = localStorage.getItem('percentageTipsValue') || '100';
    const payPerHoursOnline = localStorage.getItem('payPerHoursOnline') === 'true';
    
    return `
        <h1 class="settings-content-title">Driver settings</h1>
        
        <!-- Driver App Section -->
        <div class="driver-settings-section">
            <h3 class="settings-section-subtitle">Driver app</h3>
            <p class="settings-instruction-text">Custom settings to manage drivers</p>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Dispatch to online drivers only</div>
                    <p class="driver-setting-description">This is only show drivers active now on the driver page</p>
                </div>
                <label class="switch">
                    <input type="checkbox" ${dispatchOnlineOnly ? 'checked' : ''} onchange="toggleDriverSetting('dispatchOnlineOnly', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Drivers will always accept assigned orders (auto-accept)</div>
                    <p class="driver-setting-description">No accept/reject option for the driver</p>
                </div>
                <label class="switch">
                    <input type="checkbox" ${autoAccept ? 'checked' : ''} onchange="toggleDriverSetting('autoAccept', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Show order item price to driver/customer</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${showItemPrice ? 'checked' : ''} onchange="toggleDriverSetting('showItemPrice', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Show earning info to drivers before they accept the order</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${showEarningInfo ? 'checked' : ''} onchange="toggleDriverSetting('showEarningInfo', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Show driver phone number to customers</div>
                    <p class="driver-setting-description">Customers will be able to call drivers directly</p>
                </div>
                <label class="switch">
                    <input type="checkbox" ${showDriverPhone ? 'checked' : ''} onchange="toggleDriverSetting('showDriverPhone', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Show sensitive customer details (Customer name & phone number) to the driver</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${showCustomerDetails ? 'checked' : ''} onchange="toggleDriverSetting('showCustomerDetails', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Item check on pick-up</div>
                    <p class="driver-setting-description">Drivers have to confirm items on pick-up</p>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <label class="switch">
                        <input type="checkbox" ${itemCheckPickup ? 'checked' : ''} onchange="toggleDriverSetting('itemCheckPickup', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Require Proof of Delivery</div>
                    <p class="driver-setting-description">Drivers must take proof of delivery (Only Picture) to complete an order</p>
                </div>
                <label class="switch">
                    <input type="checkbox" ${requirePOD ? 'checked' : ''} onchange="toggleDriverSetting('requirePOD', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Requires ID scanning</div>
                    <p class="driver-setting-description">Drivers must do id scanning</p>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <label class="switch">
                        <input type="checkbox" ${requireIDScanning ? 'checked' : ''} onchange="toggleDriverSetting('requireIDScanning', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Drivers can re-optimize the route from their App</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${reoptimizeRoute ? 'checked' : ''} onchange="toggleDriverSetting('reoptimizeRoute', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-setting-item">
                <div class="driver-setting-content">
                    <div class="driver-setting-label">Geofencing for pick-up & drop-off</div>
                    <p class="driver-setting-description">Set geofencing for pick-up and drop-off</p>
                </div>
                <label class="switch">
                    <input type="checkbox" ${geofencing ? 'checked' : ''} onchange="toggleDriverSetting('geofencing', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        
        <!-- Driver Response Time Section -->
        <div class="driver-settings-section">
            <h3 class="settings-section-subtitle">Driver response time</h3>
            <p class="settings-instruction-text">This is the maximum time allowed for a driver to send her feedback for an assigned order with 'Accept' or 'Reject'. If the driver does not respond within the time specified here, it comes back to dispatch dashboard for dispatching to others</p>
            
            <div class="driver-time-input">
                <input type="number" class="business-input" id="driverResponseTimeInput" value="${driverResponseTime}" min="1" max="60" style="width: 100px; display: inline-block;">
                <span style="margin-left: 8px; color: #475569;">mins</span>
                <button class="btn-primary" onclick="saveDriverResponseTime()" style="margin-left: 16px; padding: 8px 16px;">Save</button>
            </div>
        </div>
        
        <!-- Driver Payment Section -->
        <div class="driver-settings-section">
            <h3 class="settings-section-subtitle">Driver payment ($)</h3>
            <p class="settings-instruction-text">This is to show how much money driver will be paid per delivery for calculating the end of the day due.</p>
            
            <div class="driver-payment-item">
                <div class="driver-payment-content">
                    <div class="driver-setting-label">Fix pay per delivery</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <label class="switch">
                        <input type="checkbox" ${fixPayPerDelivery ? 'checked' : ''} onchange="toggleDriverPayment('fixPayPerDelivery', this.checked)">
                        <span class="slider"></span>
                    </label>
                    ${fixPayPerDelivery ? `<input type="number" class="business-input" id="fixPayAmount" value="${fixPayAmount}" style="width: 80px; display: inline-block;" onchange="updateDriverPayment('fixPayAmount', this.value)"> <span style="color: #475569;">/Order</span>` : ''}
                </div>
            </div>
            
            <div class="driver-payment-item">
                <div class="driver-payment-content">
                    <div class="driver-setting-label">Percentage of order total</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${percentageOrderTotal ? 'checked' : ''} onchange="toggleDriverPayment('percentageOrderTotal', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-payment-item">
                <div class="driver-payment-content">
                    <div class="driver-setting-label">Per distance</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${perDistance ? 'checked' : ''} onchange="toggleDriverPayment('perDistance', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-payment-item">
                <div class="driver-payment-content">
                    <div class="driver-setting-label">% of delivery fee charged to the end customer</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <label class="switch">
                        <input type="checkbox" ${percentageDeliveryFee ? 'checked' : ''} onchange="toggleDriverPayment('percentageDeliveryFee', this.checked)">
                        <span class="slider"></span>
                    </label>
                    ${percentageDeliveryFee ? `<input type="number" class="business-input" id="percentageDeliveryFeeValue" value="${percentageDeliveryFeeValue}" style="width: 80px; display: inline-block;" onchange="updateDriverPayment('percentageDeliveryFeeValue', this.value)"> <span style="color: #475569;">%</span>` : ''}
                </div>
            </div>
            
            <div class="driver-payment-item">
                <div class="driver-payment-content">
                    <div class="driver-setting-label">% of Tips given by the end customer</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <label class="switch">
                        <input type="checkbox" ${percentageTips ? 'checked' : ''} onchange="toggleDriverPayment('percentageTips', this.checked)">
                        <span class="slider"></span>
                    </label>
                    ${percentageTips ? `<input type="number" class="business-input" id="percentageTipsValue" value="${percentageTipsValue}" style="width: 80px; display: inline-block;" onchange="updateDriverPayment('percentageTipsValue', this.value)"> <span style="color: #475569;">%</span>` : ''}
                </div>
            </div>
            
            <div class="driver-payment-item">
                <div class="driver-payment-content">
                    <div class="driver-setting-label">Pay per hours online</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${payPerHoursOnline ? 'checked' : ''} onchange="toggleDriverPayment('payPerHoursOnline', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="driver-payment-summary" id="paymentSummary">
                ${calculatePaymentSummary()}
            </div>
        </div>
    `;
}

// Get Third-Party Delivery content
async function getThirdPartyDeliveryContent() {
    const activeTab = localStorage.getItem('thirdPartyTab') || 'services';
    const doordashEnabled = localStorage.getItem('doordashEnabled') === 'true';
    const uberEnabled = localStorage.getItem('uberEnabled') === 'true';
    const autoAssignOrders = localStorage.getItem('autoAssignOrders') === 'true';
    const thirdPartyPickupInstructions = localStorage.getItem('thirdPartyPickupInstructions') === 'true';
    
    return `
        <h1 class="settings-content-title">Third Party Delivery Services</h1>
        
        <div class="third-party-tabs">
            <button class="third-party-tab ${activeTab === 'services' ? 'active' : ''}" onclick="switchThirdPartyTab('services')">Third-party Services</button>
            <button class="third-party-tab ${activeTab === 'settings' ? 'active' : ''}" onclick="switchThirdPartyTab('settings')">Third-party Settings</button>
        </div>
        
        <div id="thirdPartyContent">
            ${activeTab === 'services' ? `
                <!-- National & Regional Services -->
                <div class="third-party-section">
                    <h3 class="settings-section-subtitle">National & Regional Services</h3>
                    <h4 style="font-size: 16px; font-weight: 600; color: #0f172a; margin: 16px 0 8px 0;">On Demand Delivery</h4>
                    
                    <div class="third-party-service-card">
                        <div class="service-card-content">
                            <div class="service-name">DoorDash</div>
                            <p class="service-description">On-demand short distance food delivery, grocery delivery, convenience delivery, pet items and other small retail deliveries.</p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <label class="switch">
                                <input type="checkbox" ${doordashEnabled ? 'checked' : ''} onchange="toggleThirdPartyService('doordash', this.checked)">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="third-party-service-card">
                        <div class="service-card-content">
                            <div class="service-name">Uber</div>
                            <p class="service-description">On-demand short distance food delivery.</p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <label class="switch">
                                <input type="checkbox" ${uberEnabled ? 'checked' : ''} onchange="toggleThirdPartyService('uber', this.checked)">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                    
                </div>
                
                <!-- Local Services -->
                <div class="third-party-section">
                    <h3 class="settings-section-subtitle">Local Services</h3>
                    <p class="settings-instruction-text">Invite a local delivery company to deliver for you. TekMaxLLC allows you to easily send orders to local 3rd party delivery services on TekMaxLLC platform.</p>
                    <button class="btn-primary" onclick="inviteLocalDelivery()" style="margin-top: 16px;">Invite a local delivery company</button>
                </div>
            ` : `
                <!-- Third-party Settings -->
                <div class="third-party-section">
                    <div class="driver-setting-item">
                        <div class="driver-setting-content">
                            <div class="driver-setting-label">Automatically assign orders</div>
                            <p class="driver-setting-description">Any incoming delivery request will be assigned to the best driver</p>
                        </div>
                        <label class="switch">
                            <input type="checkbox" ${autoAssignOrders ? 'checked' : ''} onchange="toggleThirdPartySetting('autoAssignOrders', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                    
                    <div class="driver-setting-item" style="border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 20px;">
                        <div class="driver-setting-content">
                            <div class="driver-setting-label">Third-Party Driver Pickup Instructions</div>
                            <p class="driver-setting-description">These instructions will appear for orders assigned to third-party drivers</p>
                        </div>
                        <label class="switch">
                            <input type="checkbox" ${thirdPartyPickupInstructions ? 'checked' : ''} onchange="toggleThirdPartySetting('thirdPartyPickupInstructions', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            `}
        </div>
    `;
}

// Get Users content
async function getUsersContent() {
    // Get users from API or use current user
    let users = [];
    try {
        // TODO: Implement users API endpoint
        // For now, use current user if available
        if (currentUser) {
            users = [currentUser];
        }
    } catch (error) {
        console.error('Error fetching users:', error);
    }
    
    return `
        <h1 class="settings-content-title">Users</h1>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div></div>
            <button class="btn-primary" onclick="inviteUser()">Invite user</button>
        </div>
        
        <div class="users-search-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input type="text" id="usersSearchInput" placeholder="Search" class="search-input" oninput="filterUsers()">
        </div>
        
        <div class="table-container" style="margin-top: 16px;">
            <table class="orders-table">
                <thead>
                    <tr>
                        <th class="sortable">
                            <span>Name</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th class="sortable">
                            <span>Email</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th>Role</th>
                    </tr>
                </thead>
                <tbody id="usersTableBody">
                    ${users.length > 0 ? users.map(user => `
                        <tr>
                            <td>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div class="user-avatar" style="width: 32px; height: 32px; border-radius: 50%; background: #22c55e; color: white; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">
                                        ${(user.full_name || user.email || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <span>${escapeHtml(user.full_name || user.email || 'User')}</span>
                                </div>
                            </td>
                            <td>${escapeHtml(user.email || 'N/A')}</td>
                            <td><span class="status-badge status-active">${escapeHtml(user.role || 'User')}</span></td>
                        </tr>
                    `).join('') : `
                        <tr>
                            <td colspan="3" class="empty-state-cell">
                                <div class="empty-state">
                                    <div class="empty-state-text">No users found</div>
                                </div>
                            </td>
                        </tr>
                    `}
                </tbody>
            </table>
        </div>
    `;
}

// Get Location content
async function getLocationContent() {
    const country = localStorage.getItem('country') || 'United States';
    const city = localStorage.getItem('city') || '';
    const currency = localStorage.getItem('currency') || 'USD';
    const timezoneAuto = localStorage.getItem('timezoneAuto') === 'true';
    const timezone = localStorage.getItem('timezone') || 'UTC-06:00';
    const distanceUnit = localStorage.getItem('distanceUnit') || 'mile';
    
    // Get current local time
    const now = new Date();
    const localTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    return `
        <h1 class="settings-content-title">Location</h1>
        
        <!-- Geographical Location Settings -->
        <div class="driver-settings-section">
            <div class="location-field">
                <label class="business-input-label">Country</label>
                <div class="location-value">${escapeHtml(country)}</div>
            </div>
            
            <div class="location-field">
                <label class="business-input-label">City</label>
                <input type="text" class="business-input" id="cityInput" value="${escapeHtml(city)}" placeholder="Enter city" onchange="updateLocation('city', this.value)">
            </div>
            
            <div class="location-field">
                <label class="business-input-label">Currency</label>
                <select class="business-input" id="currencySelect" onchange="updateLocation('currency', this.value)">
                    <option value="USD" ${currency === 'USD' ? 'selected' : ''}>United States dollar ($)</option>
                    <option value="EUR" ${currency === 'EUR' ? 'selected' : ''}>Euro (€)</option>
                    <option value="GBP" ${currency === 'GBP' ? 'selected' : ''}>British pound (£)</option>
                    <option value="PHP" ${currency === 'PHP' ? 'selected' : ''}>Philippine peso (₱)</option>
                </select>
            </div>
        </div>
        
        <!-- Time Zone Settings -->
        <div class="driver-settings-section" style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
            <h3 class="settings-section-subtitle">TimeZone</h3>
            
            <div class="location-field">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="checkbox" ${timezoneAuto ? 'checked' : ''} onchange="toggleTimezoneAuto(this.checked)">
                    <span class="business-input-label" style="margin: 0;">Automatic setup</span>
                </label>
            </div>
            
            <div class="location-field">
                <select class="business-input" id="timezoneSelect" ${timezoneAuto ? 'disabled' : ''} onchange="updateLocation('timezone', this.value)">
                    <option value="UTC-12:00" ${timezone === 'UTC-12:00' ? 'selected' : ''}>UTC-12:00</option>
                    <option value="UTC-11:00" ${timezone === 'UTC-11:00' ? 'selected' : ''}>UTC-11:00</option>
                    <option value="UTC-10:00" ${timezone === 'UTC-10:00' ? 'selected' : ''}>UTC-10:00</option>
                    <option value="UTC-09:00" ${timezone === 'UTC-09:00' ? 'selected' : ''}>UTC-09:00</option>
                    <option value="UTC-08:00" ${timezone === 'UTC-08:00' ? 'selected' : ''}>UTC-08:00</option>
                    <option value="UTC-07:00" ${timezone === 'UTC-07:00' ? 'selected' : ''}>UTC-07:00</option>
                    <option value="UTC-06:00" ${timezone === 'UTC-06:00' ? 'selected' : ''}>UTC-06:00</option>
                    <option value="UTC-05:00" ${timezone === 'UTC-05:00' ? 'selected' : ''}>UTC-05:00</option>
                    <option value="UTC-04:00" ${timezone === 'UTC-04:00' ? 'selected' : ''}>UTC-04:00</option>
                    <option value="UTC-03:00" ${timezone === 'UTC-03:00' ? 'selected' : ''}>UTC-03:00</option>
                    <option value="UTC-02:00" ${timezone === 'UTC-02:00' ? 'selected' : ''}>UTC-02:00</option>
                    <option value="UTC-01:00" ${timezone === 'UTC-01:00' ? 'selected' : ''}>UTC-01:00</option>
                    <option value="UTC+00:00" ${timezone === 'UTC+00:00' ? 'selected' : ''}>UTC+00:00</option>
                    <option value="UTC+01:00" ${timezone === 'UTC+01:00' ? 'selected' : ''}>UTC+01:00</option>
                    <option value="UTC+02:00" ${timezone === 'UTC+02:00' ? 'selected' : ''}>UTC+02:00</option>
                    <option value="UTC+03:00" ${timezone === 'UTC+03:00' ? 'selected' : ''}>UTC+03:00</option>
                    <option value="UTC+04:00" ${timezone === 'UTC+04:00' ? 'selected' : ''}>UTC+04:00</option>
                    <option value="UTC+05:00" ${timezone === 'UTC+05:00' ? 'selected' : ''}>UTC+05:00</option>
                    <option value="UTC+06:00" ${timezone === 'UTC+06:00' ? 'selected' : ''}>UTC+06:00</option>
                    <option value="UTC+07:00" ${timezone === 'UTC+07:00' ? 'selected' : ''}>UTC+07:00</option>
                    <option value="UTC+08:00" ${timezone === 'UTC+08:00' ? 'selected' : ''}>UTC+08:00</option>
                    <option value="UTC+09:00" ${timezone === 'UTC+09:00' ? 'selected' : ''}>UTC+09:00</option>
                    <option value="UTC+10:00" ${timezone === 'UTC+10:00' ? 'selected' : ''}>UTC+10:00</option>
                    <option value="UTC+11:00" ${timezone === 'UTC+11:00' ? 'selected' : ''}>UTC+11:00</option>
                    <option value="UTC+12:00" ${timezone === 'UTC+12:00' ? 'selected' : ''}>UTC+12:00</option>
                </select>
            </div>
            
            <div class="location-field">
                <p style="color: #475569; margin: 0;">Account local time is <span style="color: #ef4444; font-weight: 600;">${localTime}</span>.</p>
            </div>
        </div>
        
        <!-- Distance Unit Settings -->
        <div class="driver-settings-section" style="border-top: 1px solid #e2e8f0; padding-top: 24px;">
            <h3 class="settings-section-subtitle">Distance Unit</h3>
            <p class="settings-instruction-text">Distance in mile or km</p>
            
            <div class="distance-unit-selector">
                <button class="distance-unit-btn ${distanceUnit === 'mile' ? 'active' : ''}" onclick="selectDistanceUnit('mile')">Mile</button>
                <button class="distance-unit-btn ${distanceUnit === 'km' ? 'active' : ''}" onclick="selectDistanceUnit('km')">Km</button>
            </div>
        </div>
    `;
}

// Get Customer Notification content
async function getCustomerNotificationContent() {
    const etaEmail = localStorage.getItem('etaEmail') === 'true';
    const etaSMS = localStorage.getItem('etaSMS') === 'true';
    const trackingNotification = localStorage.getItem('trackingNotification') || 'order-accepted';
    const allowEditInstructions = localStorage.getItem('allowEditInstructions') === 'true';
    const deliveryReceiptEmail = localStorage.getItem('deliveryReceiptEmail') === 'true';
    const deliveryFeedbackEmail = localStorage.getItem('deliveryFeedbackEmail') === 'true';
    
    return `
        <h1 class="settings-content-title">Customer notification</h1>
        
        <!-- Customer ETA sharing Section -->
        <div class="driver-settings-section">
            <h3 class="settings-section-subtitle">Customer ETA sharing</h3>
            <p class="settings-instruction-text">Turning on customer tracking will send customers a real time delivery tracking page with live ETA by mins. It will also show the driver name, profile picture and phone number to call or text the driver</p>
            
            <div class="notification-toggle-item">
                <div class="notification-toggle-content">
                    <div class="driver-setting-label">Email</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${etaEmail ? 'checked' : ''} onchange="toggleNotificationSetting('etaEmail', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div class="notification-toggle-item">
                <div class="notification-toggle-content">
                    <div class="driver-setting-label">SMS</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${etaSMS ? 'checked' : ''} onchange="toggleNotificationSetting('etaSMS', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            
            <div style="margin-top: 24px;">
                <div class="driver-setting-label" style="margin-bottom: 8px;">Send tracking notification as soon as</div>
                <select class="business-input" id="trackingNotificationSelect" onchange="updateTrackingNotification(this.value)" style="max-width: 400px;">
                    <option value="order-placed" ${trackingNotification === 'order-placed' ? 'selected' : ''}>The order is placed</option>
                    <option value="order-accepted" ${trackingNotification === 'order-accepted' ? 'selected' : ''}>The order is accepted by a driver</option>
                    <option value="driver-assigned" ${trackingNotification === 'driver-assigned' ? 'selected' : ''}>A driver is assigned</option>
                    <option value="pickup-started" ${trackingNotification === 'pickup-started' ? 'selected' : ''}>Pickup is started</option>
                </select>
            </div>
            
            <div class="notification-toggle-item" style="margin-top: 24px;">
                <div class="notification-toggle-content">
                    <div class="driver-setting-label">Allow Editing Delivery Instructions on Tracking Link</div>
                    <p class="driver-setting-description" style="margin-top: 8px;">Allow Customers to change delivery instructions directly from the tracking link</p>
                </div>
                <label class="switch">
                    <input type="checkbox" ${allowEditInstructions ? 'checked' : ''} onchange="toggleNotificationSetting('allowEditInstructions', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        
        <!-- Delivery receipt Section -->
        <div class="driver-settings-section">
            <h3 class="settings-section-subtitle">Delivery receipt</h3>
            <p class="settings-instruction-text">This will send a notification to the customer with delivery details and proof of delivery after the delivery is complete</p>
            
            <div class="notification-toggle-item">
                <div class="notification-toggle-content">
                    <div class="driver-setting-label">Email</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${deliveryReceiptEmail ? 'checked' : ''} onchange="toggleNotificationSetting('deliveryReceiptEmail', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
        
        <!-- Delivery feedback Section -->
        <div class="driver-settings-section">
            <h3 class="settings-section-subtitle">Delivery feedback</h3>
            <p class="settings-instruction-text">This will send a reminder notification within 24 hours to share feedback/rating of their delivery service</p>
            
            <div class="notification-toggle-item">
                <div class="notification-toggle-content">
                    <div class="driver-setting-label">Email</div>
                </div>
                <label class="switch">
                    <input type="checkbox" ${deliveryFeedbackEmail ? 'checked' : ''} onchange="toggleNotificationSetting('deliveryFeedbackEmail', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    `;
}

// Get settings content based on selected item
async function getSettingsContent(itemId) {
    if (itemId === 'business-settings') {
        return await getBusinessSettingsContent();
    }
    
    if (itemId === 'dispatch-settings') {
        return await getDispatchSettingsContent();
    }
    
    return '<p>Settings content not found</p>';
}

// Business settings helper functions
function editBusinessName() {
    const valueElement = document.getElementById('businessNameValue');
    if (!valueElement) return;
    
    const currentValue = valueElement.textContent;
    const newValue = prompt('Enter business name:', currentValue);
    
    if (newValue !== null && newValue.trim() !== '') {
        valueElement.textContent = newValue.trim();
        // TODO: Save to backend
        showNotification('Success', 'Business name updated', 'success');
    }
}

function editBusinessLogo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const logoPlaceholder = document.getElementById('businessLogoPlaceholder');
                if (logoPlaceholder) {
                    logoPlaceholder.innerHTML = `<img src="${event.target.result}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">`;
                }
                // TODO: Save to backend
                showNotification('Success', 'Business logo updated', 'success');
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

function selectBusinessType(type) {
    localStorage.setItem('businessType', type);
    // Update UI
    document.querySelectorAll('.business-type-card').forEach(card => {
        card.classList.remove('active');
    });
    event.target.closest('.business-type-card')?.classList.add('active');
    showNotification('Success', 'Business type updated', 'success');
}

function switchBusinessTab(tab) {
    localStorage.setItem('businessSettingsTab', tab);
    loadSettingsContent('business-settings');
}

function editMaxDeliveryTimeDC() {
    const valueElement = document.getElementById('maxDeliveryTimeValueDC');
    if (!valueElement) return;
    
    const currentValue = valueElement.textContent.replace(' Minutes', '');
    const newValue = prompt('Enter maximum delivery time (minutes):', currentValue);
    
    if (newValue !== null && newValue.trim() !== '') {
        const minutes = parseInt(newValue.trim());
        if (!isNaN(minutes) && minutes > 0) {
            valueElement.textContent = `${minutes} Minutes`;
            localStorage.setItem('maxDeliveryTime', minutes.toString());
            showNotification('Success', 'Maximum delivery time updated', 'success');
        } else {
            showNotification('Error', 'Please enter a valid number', 'error');
        }
    }
}

function editOrderPrepTimeDC() {
    const valueElement = document.getElementById('orderPrepTimeValueDC');
    if (!valueElement) return;
    
    const currentValue = valueElement.textContent.replace(' Minutes', '');
    const newValue = prompt('Enter order preparation time (minutes):', currentValue);
    
    if (newValue !== null && newValue.trim() !== '') {
        const minutes = parseInt(newValue.trim());
        if (!isNaN(minutes) && minutes > 0) {
            valueElement.textContent = `${minutes} Minutes`;
            localStorage.setItem('orderPrepTime', minutes.toString());
            showNotification('Success', 'Order preparation time updated', 'success');
        } else {
            showNotification('Error', 'Please enter a valid number', 'error');
        }
    }
}

function cancelBusinessSettings() {
    // Reload to reset any unsaved changes
    loadSettingsContent('business-settings');
    showNotification('Info', 'Changes cancelled', 'info');
}

function saveBusinessSettings() {
    // Save all settings
    const maxDeliveryTime = document.getElementById('maxDeliveryTimeValueDC')?.textContent.replace(' Minutes', '') || localStorage.getItem('maxDeliveryTime') || '60';
    const orderPrepTime = document.getElementById('orderPrepTimeValueDC')?.textContent.replace(' Minutes', '') || localStorage.getItem('orderPrepTime') || '60';
    
    localStorage.setItem('maxDeliveryTime', maxDeliveryTime);
    localStorage.setItem('orderPrepTime', orderPrepTime);
    
    // TODO: Save to backend API
    showNotification('Success', 'Settings saved successfully', 'success');
}

function toggleDriverFleet(enabled) {
    localStorage.setItem('useDriverFleet', enabled);
    showNotification('Success', `Driver fleet ${enabled ? 'enabled' : 'disabled'}`, 'success');
}

function toggleTakeoutOrders(enabled) {
    localStorage.setItem('acceptTakeoutOrders', enabled);
    showNotification('Success', `Takeout orders ${enabled ? 'enabled' : 'disabled'}`, 'success');
}

function editMaxDeliveryTime() {
    const valueElement = document.getElementById('maxDeliveryTimeValue');
    if (!valueElement) return;
    
    const currentValue = valueElement.textContent.replace(' Minutes', '');
    const newValue = prompt('Enter maximum delivery time (minutes):', currentValue);
    
    if (newValue !== null && newValue.trim() !== '') {
        const minutes = parseInt(newValue.trim());
        if (!isNaN(minutes) && minutes > 0) {
            valueElement.textContent = `${minutes} Minutes`;
            localStorage.setItem('maxDeliveryTime', minutes.toString());
            // TODO: Save to backend
            showNotification('Success', 'Maximum delivery time updated', 'success');
        } else {
            showNotification('Error', 'Please enter a valid number', 'error');
        }
    }
}

function editOrderPrepTime() {
    const valueElement = document.getElementById('orderPrepTimeValue');
    if (!valueElement) return;
    
    const currentValue = valueElement.textContent.replace(' Minutes', '');
    const newValue = prompt('Enter order preparation time (minutes):', currentValue);
    
    if (newValue !== null && newValue.trim() !== '') {
        const minutes = parseInt(newValue.trim());
        if (!isNaN(minutes) && minutes > 0) {
            valueElement.textContent = `${minutes} Minutes`;
            localStorage.setItem('orderPrepTime', minutes.toString());
            // TODO: Save to backend
            showNotification('Success', 'Order preparation time updated', 'success');
        } else {
            showNotification('Error', 'Please enter a valid number', 'error');
        }
    }
}

// Driver settings helper functions
function toggleDriverSetting(setting, enabled) {
    localStorage.setItem(setting, enabled);
    showNotification('Success', 'Setting updated', 'success');
}

function saveDriverResponseTime() {
    const input = document.getElementById('driverResponseTimeInput');
    if (input) {
        const value = parseInt(input.value);
        if (!isNaN(value) && value > 0 && value <= 60) {
            localStorage.setItem('driverResponseTime', value.toString());
            showNotification('Success', 'Driver response time updated', 'success');
        } else {
            showNotification('Error', 'Please enter a valid number (1-60)', 'error');
        }
    }
}

function toggleDriverPayment(setting, enabled) {
    localStorage.setItem(setting, enabled);
    // Reload content to show/hide input fields
    loadSettingsContent('driver-settings');
    showNotification('Success', 'Payment setting updated', 'success');
}

function updateDriverPayment(setting, value) {
    localStorage.setItem(setting, value);
    // Update payment summary
    const summary = document.getElementById('paymentSummary');
    if (summary) {
        summary.innerHTML = calculatePaymentSummary();
    }
}

function calculatePaymentSummary() {
    const fixPay = localStorage.getItem('fixPayPerDelivery') === 'true';
    const fixPayAmount = localStorage.getItem('fixPayAmount') || '0';
    const percentageDeliveryFee = localStorage.getItem('percentageDeliveryFee') === 'true';
    const percentageDeliveryFeeValue = localStorage.getItem('percentageDeliveryFeeValue') || '0';
    const percentageTips = localStorage.getItem('percentageTips') === 'true';
    const percentageTipsValue = localStorage.getItem('percentageTipsValue') || '0';
    
    let parts = [];
    if (fixPay) {
        parts.push(`$${fixPayAmount}/Order`);
    }
    if (percentageDeliveryFee) {
        parts.push(`${percentageDeliveryFeeValue}% of delivery fees`);
    }
    if (percentageTips) {
        parts.push(`${percentageTipsValue}% of tips`);
    }
    
    return parts.length > 0 ? `<p style="margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; color: #0f172a; font-weight: 500;">Total pay = ${parts.join(' + ')}</p>` : '';
}

// Third-party delivery helper functions
function switchThirdPartyTab(tab) {
    localStorage.setItem('thirdPartyTab', tab);
    loadSettingsContent('third-party-delivery');
}

function toggleThirdPartyService(service, enabled) {
    localStorage.setItem(`${service}Enabled`, enabled);
    showNotification('Success', `${service} ${enabled ? 'enabled' : 'disabled'}`, 'success');
}

function inviteLocalDelivery() {
    showNotification('Info', 'Invite local delivery company functionality coming soon', 'info');
}

function toggleThirdPartySetting(setting, enabled) {
    localStorage.setItem(setting, enabled);
    showNotification('Success', 'Third-party setting updated', 'success');
}

// Customer notification helper functions
function toggleNotificationSetting(setting, enabled) {
    localStorage.setItem(setting, enabled);
    showNotification('Success', 'Notification setting updated', 'success');
}

function updateTrackingNotification(value) {
    localStorage.setItem('trackingNotification', value);
    showNotification('Success', 'Tracking notification setting updated', 'success');
}

// Users helper functions
function inviteUser() {
    showNotification('Info', 'Invite user functionality coming soon', 'info');
}

function filterUsers() {
    const searchInput = document.getElementById('usersSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    // TODO: Implement user filtering
}

function editUser(email) {
    showNotification('Info', 'Edit user functionality coming soon', 'info');
}

function deleteUser(email) {
    if (confirm(`Are you sure you want to delete user ${email}?`)) {
        // TODO: Implement user deletion
        showNotification('Success', 'User deleted successfully', 'success');
        loadSettingsContent('users');
    }
}

// Location helper functions
function updateLocation(setting, value) {
    localStorage.setItem(setting, value);
    showNotification('Success', 'Location setting updated', 'success');
}

function toggleTimezoneAuto(enabled) {
    localStorage.setItem('timezoneAuto', enabled);
    const timezoneSelect = document.getElementById('timezoneSelect');
    if (timezoneSelect) {
        timezoneSelect.disabled = enabled;
    }
    showNotification('Success', `Timezone ${enabled ? 'auto' : 'manual'} setup`, 'success');
}

function selectDistanceUnit(unit) {
    localStorage.setItem('distanceUnit', unit);
    // Update UI
    document.querySelectorAll('.distance-unit-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    showNotification('Success', `Distance unit set to ${unit}`, 'success');
}

// Make functions globally available
window.selectSettingsItem = selectSettingsItem;
window.editBusinessName = editBusinessName;
window.editBusinessLogo = editBusinessLogo;
window.selectBusinessType = selectBusinessType;
window.switchBusinessTab = switchBusinessTab;
window.editMaxDeliveryTimeDC = editMaxDeliveryTimeDC;
window.editOrderPrepTimeDC = editOrderPrepTimeDC;
window.cancelBusinessSettings = cancelBusinessSettings;
window.saveBusinessSettings = saveBusinessSettings;
window.toggleDriverFleet = toggleDriverFleet;
window.toggleTakeoutOrders = toggleTakeoutOrders;
window.editMaxDeliveryTime = editMaxDeliveryTime;
window.editOrderPrepTime = editOrderPrepTime;
window.toggleDriverSetting = toggleDriverSetting;
window.saveDriverResponseTime = saveDriverResponseTime;
window.toggleDriverPayment = toggleDriverPayment;
window.updateDriverPayment = updateDriverPayment;
window.switchThirdPartyTab = switchThirdPartyTab;
window.toggleThirdPartyService = toggleThirdPartyService;
window.inviteLocalDelivery = inviteLocalDelivery;
window.toggleThirdPartySetting = toggleThirdPartySetting;
window.toggleNotificationSetting = toggleNotificationSetting;
window.updateTrackingNotification = updateTrackingNotification;
window.inviteUser = inviteUser;
window.filterUsers = filterUsers;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.updateLocation = updateLocation;
window.toggleTimezoneAuto = toggleTimezoneAuto;
window.selectDistanceUnit = selectDistanceUnit;

// Dispatch settings helper functions
function toggleDispatchSetting(setting, enabled) {
    localStorage.setItem(`dispatch${setting.charAt(0).toUpperCase() + setting.slice(1)}`, enabled);
    showNotification('Success', 'Dispatch setting updated', 'success');
}

function saveDispatchTimeWindow() {
    const input = document.getElementById('dispatchTimeWindowInput');
    if (input) {
        const value = parseFloat(input.value);
        if (!isNaN(value) && value >= 0.5 && value <= 24) {
            localStorage.setItem('dispatchTimeWindow', value.toString());
            showNotification('Success', 'Dispatch time window updated', 'success');
        } else {
            showNotification('Error', 'Please enter a valid number (0.5-24)', 'error');
        }
    }
}

window.toggleDispatchSetting = toggleDispatchSetting;
window.saveDispatchTimeWindow = saveDispatchTimeWindow;

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
    
    // Debug: Log order data to help diagnose scheduled detection (only first time)
    const orderId = order.gloriafood_order_id || order.id;
    if (orderId && Object.keys(rawData).length > 0) {
        if (!window._scheduledCheckLogged) {
            window._scheduledCheckLogged = new Set();
        }
        if (!window._scheduledCheckLogged.has(orderId)) {
            console.log(`[DEBUG] Checking scheduled for order ${orderId}:`, {
                delivery_type: rawData.delivery_type,
                delivery_option: rawData.delivery_option,
                available_time: rawData.available_time,
                delivery_time: rawData.delivery_time,
                requested_delivery_time: rawData.requested_delivery_time,
                scheduled_delivery_time: rawData.scheduled_delivery_time,
                delivery_date: rawData.delivery_date,
                delivery_time_only: rawData.delivery_time_only,
                asap: rawData.asap,
                all_keys: Object.keys(rawData).slice(0, 20) // First 20 keys
            });
            window._scheduledCheckLogged.add(orderId);
        }
    }
    
    // Check if "Later" option is selected (GloriaFood sends delivery_type or delivery_option)
    // Also check for "asap" vs "later" indicators
    const deliveryType = (rawData.delivery_type || rawData.deliveryOption || rawData.delivery_option || rawData.deliveryType || rawData.delivery_time_type || '').toLowerCase();
    const deliveryOption = (rawData.delivery_option || rawData.deliveryOption || rawData.available_time || rawData.availableTime || rawData.time_option || '').toLowerCase();
    const asapOption = (rawData.asap || rawData.as_soon_as_possible || rawData.asSoonAsPossible || '').toLowerCase();
    
    // If delivery type/option indicates "later" or "scheduled", it's scheduled
    if (deliveryType === 'later' || deliveryType === 'scheduled' || deliveryOption === 'later' || deliveryOption === 'scheduled') {
        return true;
    }
    
    // If NOT "asap" and has delivery time, it's likely scheduled
    if (asapOption !== 'true' && asapOption !== '1' && asapOption !== 'yes' && (rawData.delivery_time || rawData.requested_delivery_time || rawData.scheduled_delivery_time)) {
        // Check if the delivery time is in the future
        const checkTime = rawData.delivery_time || rawData.requested_delivery_time || rawData.scheduled_delivery_time;
        if (checkTime) {
            try {
                const checkDate = new Date(checkTime);
                if (checkDate > new Date()) {
                    return true;
                }
            } catch (e) {
                // Ignore
            }
        }
    }
    
    // Check for scheduled delivery time in various possible fields
    // Also check nested delivery object and schedule object
    const deliveryObj = rawData.delivery || order.delivery || {};
    const scheduleObj = rawData.schedule || order.schedule || {};
    const timeObj = rawData.time || order.time || rawData.times || order.times || {};
    
    // Check for date and time separately (GloriaFood might send delivery_date and delivery_time separately)
    let scheduledTime = order.scheduled_delivery_time || 
                         order.scheduledDeliveryTime ||
                         order.delivery_time ||
                         order.deliveryTime ||
                         order.delivery_datetime ||
                         order.deliveryDateTime ||
                         order.estimated_delivery_time ||
                         order.estimatedDeliveryTime ||
                         order.preferred_delivery_time ||
                         order.preferredDeliveryTime ||
                         order.scheduled_at ||
                         order.scheduledAt ||
                         rawData.scheduled_delivery_time ||
                         rawData.scheduledDeliveryTime ||
                         rawData.delivery_time ||
                         rawData.deliveryTime ||
                         rawData.delivery_datetime ||
                         rawData.deliveryDateTime ||
                         rawData.estimated_delivery_time ||
                         rawData.estimatedDeliveryTime ||
                         rawData.requested_delivery_time ||
                         rawData.requestedDeliveryTime ||
                         rawData.preferred_delivery_time ||
                         rawData.preferredDeliveryTime ||
                         rawData.scheduled_at ||
                         rawData.scheduledAt ||
                         rawData.schedule_time ||
                         rawData.scheduleTime ||
                         deliveryObj.delivery_time ||
                         deliveryObj.deliveryTime ||
                         deliveryObj.scheduled_delivery_time ||
                         deliveryObj.scheduledDeliveryTime ||
                         deliveryObj.estimated_delivery_time ||
                         deliveryObj.estimatedDeliveryTime ||
                         deliveryObj.requested_delivery_time ||
                         deliveryObj.requestedDeliveryTime ||
                         scheduleObj.delivery_time ||
                         scheduleObj.deliveryTime ||
                         scheduleObj.scheduled_delivery_time ||
                         scheduleObj.scheduledDeliveryTime ||
                         scheduleObj.requested_delivery_time ||
                         scheduleObj.requestedDeliveryTime ||
                         timeObj.delivery ||
                         timeObj.delivery_time ||
                         timeObj.scheduled_delivery ||
                         null;
    
    // If date and time are separate, combine them
    if (!scheduledTime) {
        const deliveryDate = rawData.delivery_date || rawData.deliveryDate || deliveryObj.delivery_date || scheduleObj.delivery_date;
        const deliveryTimeOnly = rawData.delivery_time_only || rawData.deliveryTimeOnly || deliveryObj.delivery_time_only || scheduleObj.delivery_time_only;
        
        if (deliveryDate && deliveryTimeOnly) {
            scheduledTime = `${deliveryDate} ${deliveryTimeOnly}`;
        } else if (deliveryDate) {
            scheduledTime = deliveryDate;
        }
    }
    
    // Check if scheduled time is in the future (any future time means it's scheduled)
    if (scheduledTime) {
        try {
            const scheduledDate = new Date(scheduledTime);
            const now = new Date();
            
            // If scheduled time is in the future (even 1 minute), it's scheduled
            // This will catch orders scheduled for tomorrow, specific times, etc.
            if (scheduledDate > now) {
                console.log(`[DEBUG] Order ${orderId || 'unknown'} is scheduled - scheduledTime found: ${scheduledTime}, date: ${scheduledDate}`);
                return true;
            }
            // Also check if it's today but more than 1 hour in the future
            const hoursDiff = (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60);
            if (hoursDiff > 1) {
                console.log(`[DEBUG] Order ${orderId || 'unknown'} is scheduled - more than 1 hour in future`);
                return true;
            }
        } catch (e) {
            // If can't parse, but we have a scheduledTime value, still consider it scheduled
            // (might be a different format)
            console.log(`[DEBUG] Order ${orderId || 'unknown'} has scheduledTime but can't parse: ${scheduledTime}`);
            // Don't return true here - let it check delivery time instead
        }
    }
    
    // Also check delivery time if scheduled time not found - use same comprehensive extraction
    const deliveryTime = order.delivery_time || 
                        order.deliveryTime || 
                        order.delivery_at ||
                        order.deliveryAt ||
                        order.delivery_datetime ||
                        order.deliveryDateTime ||
                        order.scheduled_delivery_time ||
                        order.scheduledDeliveryTime ||
                        rawData.delivery_time ||
                        rawData.deliveryTime ||
                        rawData.delivery_at ||
                        rawData.deliveryAt ||
                        rawData.delivery_datetime ||
                        rawData.deliveryDateTime ||
                        rawData.requested_delivery_time ||
                        rawData.requestedDeliveryTime ||
                        rawData.scheduled_delivery_time ||
                        rawData.scheduledDeliveryTime ||
                        rawData.preferred_delivery_time ||
                        rawData.preferredDeliveryTime ||
                        rawData.delivery_date ||
                        rawData.deliveryDate ||
                        deliveryObj.delivery_time ||
                        deliveryObj.deliveryTime ||
                        deliveryObj.scheduled_delivery_time ||
                        deliveryObj.requested_delivery_time ||
                        deliveryObj.delivery_at ||
                        deliveryObj.delivery_date ||
                        scheduleObj.delivery_time ||
                        scheduleObj.scheduled_delivery_time ||
                        scheduleObj.requested_delivery_time ||
                        scheduleObj.delivery_date ||
                        timeObj.delivery ||
                        timeObj.delivery_time ||
                        null;
    
    if (deliveryTime) {
        try {
            const deliveryDate = new Date(deliveryTime);
            const now = new Date();
            
            // If delivery time is in the future, it's scheduled
            // Be more lenient - any future time means scheduled (for tomorrow, specific times, etc.)
            if (deliveryDate > now) {
                console.log(`[DEBUG] Order ${orderId || 'unknown'} delivery time is in future: ${deliveryTime} -> ${deliveryDate}`);
                
                // If delivery time is in the future (even 1 minute), it's scheduled
                // This catches orders with specific date/time (Later option)
                const timeDiff = deliveryDate.getTime() - now.getTime();
                const minutesDiff = timeDiff / (1000 * 60);
                
                // If more than 1 minute in the future, it's scheduled
                if (minutesDiff > 1) {
                    console.log(`[DEBUG] Order ${orderId || 'unknown'} is SCHEDULED (${minutesDiff} min in future)`);
                    return true;
                }
                
                // Also check if it's a different day (tomorrow or later)
                const deliveryDay = deliveryDate.toDateString();
                const today = now.toDateString();
                if (deliveryDay !== today) {
                    console.log(`[DEBUG] Order ${orderId || 'unknown'} is SCHEDULED (different day)`);
                    return true; // Different day = scheduled
                }
            } else {
                console.log(`[DEBUG] Order ${orderId || 'unknown'} delivery time is NOT in future: ${deliveryTime} -> ${deliveryDate}, now: ${now}`);
            }
        } catch (e) {
            // Ignore parsing errors
        }
    }
    
    // Debug: Log if order is NOT scheduled (only log once per order to avoid spam)
    // orderId is already declared at the top of this function
    if (orderId && !window._scheduledDebugLogged) {
        window._scheduledDebugLogged = new Set();
    }
    if (orderId && window._scheduledDebugLogged && !window._scheduledDebugLogged.has(orderId)) {
        console.log(`[DEBUG] Order ${orderId} is NOT scheduled - checking raw_data keys:`, Object.keys(rawData || {}));
        window._scheduledDebugLogged.add(orderId);
    }
    
    return false;
}

// Helper function to get order category
function getOrderCategory(order) {
    const status = (order.status || '').toUpperCase();
    const isCompleted = ['DELIVERED', 'COMPLETED', 'FULFILLED'].includes(status);
    const isIncomplete = ['CANCELLED', 'FAILED', 'REJECTED', 'CANCELED'].includes(status);
    
    // Check if scheduled BEFORE checking completed/incomplete
    // This ensures scheduled orders are categorized correctly even if status changes
    const isScheduled = hasScheduledDeliveryTime(order);
    
    // Debug logging
    const orderId = order.gloriafood_order_id || order.id;
    if (isScheduled && orderId) {
        console.log(`[DEBUG] Order ${orderId} categorized as SCHEDULED`);
    }
    
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
        // Current = all active orders (not delivered, completed, or cancelled)
        // INCLUDING scheduled orders (scheduled orders appear in both Current and Scheduled)
        filtered = filtered.filter(order => {
            const status = (order.status || '').toUpperCase();
            const isActive = status && !['DELIVERED', 'COMPLETED', 'CANCELLED', 'CANCELED', 'FAILED', 'REJECTED'].includes(status);
            // Current = all active orders (including scheduled ones)
            return isActive;
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
        return;
    }
    
    try {
        const rows = orders.map(order => createOrderRow(order)).join('');
        tbody.innerHTML = rows;
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
    
    // Extract fields from raw_data if available (MUST be done before using rawData)
    let rawData = {};
    try {
        if (order.raw_data) {
            rawData = typeof order.raw_data === 'string' ? JSON.parse(order.raw_data) : order.raw_data;
        }
    } catch (e) {
        console.error('Error parsing raw_data:', e);
    }
    
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
    // Final fallback - only show store_id number if no merchant name found
    if (!merchantName) {
        merchantName = order.store_id ? `Store ${order.store_id}` : 'N/A';
    }
    merchantName = escapeHtml(merchantName);
    const amount = formatCurrency(order.total_price || 0, order.currency || 'USD');
    const orderPlaced = formatDateShipday(order.fetched_at || order.created_at || order.updated_at);
    const elapsedTime = calculateElapsedTime(order.fetched_at || order.created_at || order.updated_at);
    
    // Check if order is scheduled
    const isScheduled = hasScheduledDeliveryTime(order);
    
    // Get distance from various possible fields (more comprehensive)
    const deliveryObj = rawData.delivery || {};
    const locationObj = rawData.location || {};
    const restaurantObj = rawData.restaurant || rawData.store || {};
    
    let distance = order.distance || 
                    rawData.distance || 
                    rawData.delivery_distance ||
                    rawData.distance_km ||
                    rawData.distance_miles ||
                    rawData.distanceKm ||
                    rawData.distanceMiles ||
                    rawData.deliveryDistance ||
                    deliveryObj.distance ||
                    deliveryObj.delivery_distance ||
                    deliveryObj.distance_km ||
                    deliveryObj.distanceKm ||
                    locationObj.distance ||
                    restaurantObj.distance ||
                    null;
    
    // If no distance found, try to calculate from coordinates if available
    // Check multiple possible locations for coordinates
    const customerLat = rawData.latitude || rawData.lat || (rawData.delivery && rawData.delivery.latitude) || (rawData.delivery && rawData.delivery.lat) || (rawData.customer && rawData.customer.latitude) || (rawData.customer && rawData.customer.lat);
    const customerLon = rawData.longitude || rawData.lng || rawData.lon || (rawData.delivery && rawData.delivery.longitude) || (rawData.delivery && rawData.delivery.lng) || (rawData.delivery && rawData.delivery.lon) || (rawData.customer && rawData.customer.longitude) || (rawData.customer && rawData.customer.lng);
    const restaurantLat = restaurantObj.latitude || restaurantObj.lat || rawData.restaurant_latitude || rawData.restaurantLat;
    const restaurantLon = restaurantObj.longitude || restaurantObj.lng || restaurantObj.lon || rawData.restaurant_longitude || rawData.restaurantLng;
    
    if (!distance && customerLat && customerLon && restaurantLat && restaurantLon) {
        try {
            // Haversine formula to calculate distance
            const R = 6371; // Earth's radius in km
            const dLat = (parseFloat(customerLat) - parseFloat(restaurantLat)) * Math.PI / 180;
            const dLon = (parseFloat(customerLon) - parseFloat(restaurantLon)) * Math.PI / 180;
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(parseFloat(restaurantLat) * Math.PI / 180) * Math.cos(parseFloat(customerLat) * Math.PI / 180) *
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            distance = R * c;
        } catch (e) {
            // Ignore calculation errors
        }
    }
    let formattedDistance = 'N/A';
    if (distance) {
        if (typeof distance === 'number') {
            // Convert km to miles if needed (assuming distance is in km)
            const miles = distance * 0.621371;
            formattedDistance = miles.toFixed(2) + ' miles';
        } else if (typeof distance === 'string') {
            // Check if already has unit
            if (distance.includes('miles') || distance.includes('mi')) {
                formattedDistance = distance;
            } else if (distance.includes('km')) {
                // Convert km to miles
                const num = parseFloat(distance);
                if (!isNaN(num)) {
                    const miles = num * 0.621371;
                    formattedDistance = miles.toFixed(2) + ' miles';
                } else {
                    formattedDistance = distance;
                }
            } else {
                // Try to parse as number (assume km, convert to miles)
                const num = parseFloat(distance);
                if (!isNaN(num)) {
                    const miles = num * 0.621371;
                    formattedDistance = miles.toFixed(2) + ' miles';
                } else {
                    formattedDistance = distance;
                }
            }
        } else {
            formattedDistance = String(distance);
        }
    }
    
    // Get pickup time from various possible fields (comprehensive search)
    const scheduleObj = rawData.schedule || {};
    const timeObj = rawData.time || rawData.times || {};
    
    let pickupTime = order.pickup_time || 
                      order.pickupTime || 
                      order.pickup_at ||
                      order.pickupAt ||
                      order.pickup_datetime ||
                      order.pickupDateTime ||
                      order.requested_pickup_time ||
                      order.requestedPickupTime ||
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
                      rawData.estimated_pickup_time ||
                      rawData.estimatedPickupTime ||
                      rawData.pickup_time_iso ||
                      deliveryObj.pickup_time ||
                      deliveryObj.pickupTime ||
                      deliveryObj.requested_pickup_time ||
                      deliveryObj.requestedPickupTime ||
                      deliveryObj.pickup_at ||
                      deliveryObj.pickupAt ||
                      deliveryObj.pickup_datetime ||
                      scheduleObj.pickup_time ||
                      scheduleObj.pickupTime ||
                      scheduleObj.requested_pickup_time ||
                      scheduleObj.requestedPickupTime ||
                      scheduleObj.scheduled_pickup_time ||
                      timeObj.pickup ||
                      timeObj.pickup_time ||
                      (rawData.restaurant && rawData.restaurant.pickup_time) ||
                      null;
    
    // If date and time are separate for pickup, combine them
    if (!pickupTime) {
        const pickupDate = rawData.pickup_date || rawData.pickupDate || deliveryObj.pickup_date || scheduleObj.pickup_date || rawData.requested_pickup_date;
        const pickupTimeOnly = rawData.pickup_time_only || rawData.pickupTimeOnly || deliveryObj.pickup_time_only || scheduleObj.pickup_time_only || rawData.requested_pickup_time_only;
        
        if (pickupDate && pickupTimeOnly) {
            pickupTime = `${pickupDate} ${pickupTimeOnly}`;
        } else if (pickupDate) {
            pickupTime = pickupDate;
        } else if (pickupTimeOnly) {
            // If only time, use today's date
            const today = new Date().toISOString().split('T')[0];
            pickupTime = `${today} ${pickupTimeOnly}`;
        }
    }
    
    // Also check if pickup time is in raw_data at root level with different names
    if (!pickupTime) {
        pickupTime = rawData.pickup || rawData.pickup_datetime || rawData.pickupDateTime || 
                     rawData.collection_time || rawData.collectionTime ||
                     (rawData.times && rawData.times.pickup) ||
                     (rawData.time && rawData.time.pickup) ||
                     null;
    }
    
    // Get delivery time from various possible fields (comprehensive search)
    // Also check for separate date and time fields (GloriaFood "Later" option)
    let deliveryTime = order.delivery_time || 
                        order.deliveryTime || 
                        order.delivery_at ||
                        order.deliveryAt ||
                        order.delivery_datetime ||
                        order.deliveryDateTime ||
                        order.scheduled_delivery_time ||
                        order.scheduledDeliveryTime ||
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
                        rawData.estimated_delivery_time ||
                        rawData.estimatedDeliveryTime ||
                        rawData.preferred_delivery_time ||
                        rawData.preferredDeliveryTime ||
                        deliveryObj.delivery_time ||
                        deliveryObj.deliveryTime ||
                        deliveryObj.requested_delivery_time ||
                        deliveryObj.requestedDeliveryTime ||
                        deliveryObj.scheduled_delivery_time ||
                        deliveryObj.scheduledDeliveryTime ||
                        deliveryObj.delivery_at ||
                        deliveryObj.deliveryAt ||
                        scheduleObj.delivery_time ||
                        scheduleObj.deliveryTime ||
                        scheduleObj.requested_delivery_time ||
                        scheduleObj.requestedDeliveryTime ||
                        scheduleObj.scheduled_delivery_time ||
                        timeObj.delivery ||
                        timeObj.delivery_time ||
                        null;
    
    // If date and time are separate, combine them (for "Later" option)
    if (!deliveryTime) {
        const deliveryDate = rawData.delivery_date || rawData.deliveryDate || deliveryObj.delivery_date || scheduleObj.delivery_date || rawData.scheduled_date || scheduleObj.scheduled_date || rawData.requested_delivery_date;
        const deliveryTimeOnly = rawData.delivery_time_only || rawData.deliveryTimeOnly || deliveryObj.delivery_time_only || scheduleObj.delivery_time_only || rawData.scheduled_time || scheduleObj.scheduled_time || rawData.requested_delivery_time_only;
        
        if (deliveryDate && deliveryTimeOnly) {
            deliveryTime = `${deliveryDate} ${deliveryTimeOnly}`;
        } else if (deliveryDate) {
            // If only date, use date with default time
            deliveryTime = deliveryDate;
        } else if (deliveryTimeOnly) {
            // If only time, use today's date
            const today = new Date().toISOString().split('T')[0];
            deliveryTime = `${today} ${deliveryTimeOnly}`;
        }
    }
    
    // Also check if delivery time is in raw_data at root level with different names
    if (!deliveryTime) {
        deliveryTime = rawData.delivery || rawData.delivery_datetime || rawData.deliveryDateTime ||
                       rawData.requested_time || rawData.requestedTime ||
                       rawData.preferred_time || rawData.preferredTime ||
                       (rawData.times && rawData.times.delivery) ||
                       (rawData.time && rawData.time.delivery) ||
                       null;
    }
    
    // Get ready for pickup time (comprehensive search)
    const readyForPickup = order.ready_for_pickup || 
                           order.readyForPickup || 
                           order.ready_time ||
                           order.readyTime ||
                           order.ready_at ||
                           order.readyAt ||
                           order.prepared_at ||
                           order.preparedAt ||
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
                           rawData.estimated_ready_time ||
                           rawData.estimatedReadyTime ||
                           (rawData.status && rawData.status.ready_time) ||
                           (rawData.status && rawData.status.ready_at) ||
                           (rawData.status && rawData.status.prepared_at) ||
                           deliveryObj.ready_for_pickup ||
                           deliveryObj.ready_time ||
                           deliveryObj.ready_at ||
                           (rawData.restaurant && rawData.restaurant.ready_time) ||
                           (rawData.store && rawData.store.ready_time) ||
                           null;
    
    // Get driver name from various possible fields (comprehensive search)
    const driverObj = rawData.driver || {};
    const driver = order.driver_name || 
                  order.driverName || 
                  order.driver || 
                  order.assigned_driver ||
                  order.assignedDriver ||
                  rawData.driver_name || 
                  rawData.driverName || 
                  rawData.driver ||
                  rawData.assigned_driver ||
                  rawData.assignedDriver ||
                  rawData.driver_id ||
                  rawData.driverId ||
                  rawData.courier_name ||
                  rawData.courierName ||
                  rawData.courier ||
                  deliveryObj.driver_name ||
                  deliveryObj.driverName ||
                  deliveryObj.driver ||
                  deliveryObj.assigned_driver ||
                  deliveryObj.assignedDriver ||
                  deliveryObj.courier_name ||
                  deliveryObj.courier ||
                  driverObj.name ||
                  driverObj.full_name ||
                  (driverObj.first_name && driverObj.last_name ? driverObj.first_name + ' ' + driverObj.last_name : null) ||
                  (driverObj.first_name ? driverObj.first_name : null) ||
                  (rawData.courier && rawData.courier.name) ||
                  (rawData.courier && rawData.courier.full_name) ||
                  null;
    
    // Format times - try to format, if invalid date, show raw value or formatted string
    let formattedPickupTime = 'N/A';
    if (pickupTime) {
        try {
            const date = new Date(pickupTime);
            if (!isNaN(date.getTime())) {
                formattedPickupTime = formatDate(pickupTime);
            } else {
                // If can't parse as date, show as string (might be time-only format)
                formattedPickupTime = String(pickupTime);
            }
        } catch (e) {
            // Show raw value if formatting fails
            formattedPickupTime = String(pickupTime);
        }
    }
    
    let formattedDeliveryTime = 'N/A';
    if (deliveryTime) {
        try {
            const date = new Date(deliveryTime);
            if (!isNaN(date.getTime())) {
                formattedDeliveryTime = formatDateShipday(deliveryTime);
            } else {
                // If can't parse as date, show as string (might be time-only format)
                formattedDeliveryTime = String(deliveryTime);
            }
        } catch (e) {
            // Show raw value if formatting fails
            formattedDeliveryTime = String(deliveryTime);
        }
    }
    
    // Debug: Log if we found times
    if (orderId && (pickupTime || deliveryTime)) {
        if (!window._timeDebugLogged) {
            window._timeDebugLogged = new Set();
        }
        if (!window._timeDebugLogged.has(orderId)) {
            console.log(`[DEBUG] Order ${orderId} times:`, {
                pickupTime: pickupTime,
                deliveryTime: deliveryTime,
                formattedPickup: formattedPickupTime,
                formattedDelivery: formattedDeliveryTime
            });
            window._timeDebugLogged.add(orderId);
        }
    }
    
    // Ready for pickup - show as switch/toggle based on status or time
    // First check localStorage for user-set status
    const readyStatusKey = `order_ready_${orderId}`;
    let isReadyForPickup = localStorage.getItem(readyStatusKey) === 'true';
    
    // If not set in localStorage, determine from order data
    if (localStorage.getItem(readyStatusKey) === null) {
        const statusLower = (order.status || '').toLowerCase();
        if (readyForPickup) {
            try {
                const readyDate = new Date(readyForPickup);
                const now = new Date();
                isReadyForPickup = readyDate <= now; // Ready if time has passed
            } catch (e) {
                // If can't parse date, check if it's a boolean or status
                isReadyForPickup = readyForPickup === true || readyForPickup === 'true' || readyForPickup === 'ready';
            }
        }
        // Also check status - orders with "ready", "prepared", "out_for_delivery" are ready
        if (!isReadyForPickup && (statusLower.includes('ready') || statusLower.includes('prepared') || statusLower.includes('out_for_delivery'))) {
            isReadyForPickup = true;
        }
    }
    
    // Make switch clickable - use order ID for identification
    const switchId = `ready-switch-${orderId}`;
    const formattedReadyForPickup = isReadyForPickup 
        ? `<label class="switch"><input type="checkbox" id="${switchId}" checked data-order-id="${escapeHtml(String(orderId))}" onchange="toggleReadyForPickup('${escapeHtml(String(orderId))}', this.checked)"><span class="slider"></span></label>`
        : `<label class="switch"><input type="checkbox" id="${switchId}" data-order-id="${escapeHtml(String(orderId))}" onchange="toggleReadyForPickup('${escapeHtml(String(orderId))}', this.checked)"><span class="slider"></span></label>`;
    
    // Format driver - show "+ Assign" or "+ Pre-assigned" button
    const formattedDriver = driver 
        ? `<button class="btn-assign" style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; color: #374151;">+ Pre-assigned</button>`
        : `<button class="btn-assign" onclick="assignDriver('${escapeHtml(String(orderId))}')" style="background: #f3f4f6; border: 1px solid #d1d5db; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; color: #374151;">+ Assign</button>`;
    
    // Get tracking information
    let tracking = order.doordash_tracking_url || 
                   order.tracking_url ||
                   order.trackingUrl ||
                   rawData.tracking_url ||
                   rawData.trackingUrl ||
                   rawData.doordash_tracking_url ||
                   rawData.doordashTrackingUrl ||
                   (rawData.delivery && rawData.delivery.tracking_url) ||
                   (rawData.delivery && rawData.delivery.trackingUrl) ||
                   null;
    
    if (tracking) {
        tracking = `<a href="${escapeHtml(tracking)}" target="_blank" style="color: #22c55e; text-decoration: underline;">Track</a>`;
    } else if (order.doordash_order_id || rawData.doordash_order_id || rawData.doordashOrderId) {
        tracking = 'Pending';
    } else {
        tracking = 'N/A';
    }
    
    // Clock icon for scheduled orders
    const clockIcon = isScheduled ? `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-left: 4px; color: #22c55e;">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
    ` : '';
    
    // Three dots menu
    const moreMenu = `
        <div class="dropdown" style="position: relative; display: inline-block;">
            <button class="btn-icon" onclick="toggleOrderMenu('${escapeHtml(String(orderId))}'); event.stopPropagation();" style="color: #6b7280; position: relative; z-index: 10;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="12" cy="5" r="1"></circle>
                    <circle cx="12" cy="19" r="1"></circle>
                </svg>
            </button>
            <div id="menu-${escapeHtml(String(orderId))}" class="dropdown-menu" style="display: none; position: absolute; right: 0; top: 100%; background: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 10000; min-width: 150px; margin-top: 4px;">
                <button class="dropdown-item" onclick="viewOrderDetails('${escapeHtml(String(orderId))}')" style="width: 100%; text-align: left; padding: 8px 12px; border: none; background: none; cursor: pointer; font-size: 14px; transition: background 0.2s;">View Details</button>
                <button class="dropdown-item" onclick="editOrder('${escapeHtml(String(orderId))}')" style="width: 100%; text-align: left; padding: 8px 12px; border: none; background: none; cursor: pointer; font-size: 14px; transition: background 0.2s;">Edit</button>
                <button class="dropdown-item" onclick="deleteOrder('${escapeHtml(String(orderId))}')" style="width: 100%; text-align: left; padding: 8px 12px; border: none; background: none; cursor: pointer; font-size: 14px; color: #ef4444; transition: background 0.2s;">Delete</button>
            </div>
        </div>
    `;
    
    return `
        <tr data-order-id="${escapeHtml(String(orderId))}">
            <td>
                <input type="checkbox" class="order-checkbox" value="${escapeHtml(String(orderId))}">
            </td>
            <td>
                ${clockIcon}
                <strong>#${escapeHtml(String(orderId))}</strong>
            </td>
            <td>${customerName}</td>
            <td>${customerAddress}</td>
            <td>${amount}</td>
            <td>${formattedDistance}</td>
            <td>${orderPlaced}</td>
            <td>${formattedDeliveryTime}</td>
            <td>${elapsedTime}</td>
            <td>${formattedReadyForPickup}</td>
            <td>${formattedDriver}</td>
            <td><span class="status-badge status-${status.toLowerCase()}">${escapeHtml(status)}</span></td>
            <td>${tracking}</td>
            <td>${moreMenu}</td>
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
        if (isNaN(date.getTime())) {
            // Invalid date, return as string
            return String(dateStr);
        }
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).format(date);
    } catch (e) {
        // If formatting fails, return the string as-is
        return String(dateStr);
    }
}

// Format date similar to Shipday: "Jan 01, 2026 3:30 p.m."
function formatDateShipday(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return String(dateStr);
        }
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`;
    } catch (e) {
        return String(dateStr);
    }
}

// Calculate elapsed time in human-readable format (e.g., "3 mins.", "1 hour", "2 days")
function calculateElapsedTime(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
            return 'N/A';
        }
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 1) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins} ${diffMins === 1 ? 'min.' : 'mins.'}`;
        } else if (diffHours < 24) {
            return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'}`;
        } else {
            return `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
        }
    } catch (e) {
        return 'N/A';
    }
}

// Toggle order menu dropdown
function toggleOrderMenu(orderId) {
    const menu = document.getElementById(`menu-${orderId}`);
    if (!menu) return;
    
    // Close all other menus
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m.id !== `menu-${orderId}`) {
            m.style.display = 'none';
            m.classList.remove('show');
        }
    });
    
    // Toggle current menu
    if (menu.style.display === 'none' || !menu.style.display) {
        menu.style.display = 'block';
        menu.classList.add('show');
    } else {
        menu.style.display = 'none';
        menu.classList.remove('show');
    }
}

// Close dropdown menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.style.display = 'none';
            menu.classList.remove('show');
        });
    }
});

// Assign driver to order
async function assignDriver(orderId) {
    // Load drivers and show selection modal
    try {
        const response = await authenticatedFetch(`${API_BASE}/api/drivers`);
        const data = await response.json();
        
        if (data.success && data.drivers && data.drivers.length > 0) {
            // Show driver selection modal
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.display = 'block';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h2>Assign Driver</h2>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <select id="driverSelect" style="width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #d1d5db; border-radius: 4px;">
                            <option value="">Select a driver...</option>
                            ${data.drivers.map(driver => `
                                <option value="${driver.id}">${escapeHtml(driver.name || 'Unknown')} ${driver.phone ? `(${escapeHtml(driver.phone)})` : ''}</option>
                            `).join('')}
                        </select>
                        <div class="modal-actions">
                            <button type="button" class="btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
                            <button type="button" class="btn-primary" onclick="confirmAssignDriver('${orderId}')">Assign</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            showNotification('Info', 'No drivers available. Please add drivers first.', 'info');
        }
    } catch (error) {
        console.error('Error loading drivers:', error);
        showError('Error loading drivers: ' + error.message);
    }
}

// Confirm driver assignment (sends order to DoorDash which automatically assigns driver)
async function confirmAssignDriver(orderId) {
    try {
        const response = await authenticatedFetch(`${API_BASE}/api/orders/${orderId}/assign-driver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Success', data.message || 'Order sent to DoorDash. Driver will be automatically assigned.', 'success');
            const modal = document.querySelector('.modal');
            if (modal) modal.remove();
            loadOrders();
        } else {
            showError(data.error || 'Failed to assign driver');
        }
    } catch (error) {
        console.error('Error assigning driver:', error);
        showError('Error assigning driver: ' + error.message);
    }
}

// View order details
function viewOrderDetails(orderId) {
    // TODO: Implement order details view
    showNotification('Info', 'Order details view coming soon', 'info');
}

// Edit order
function editOrder(orderId) {
    // TODO: Implement order edit functionality
    showNotification('Info', 'Order edit functionality coming soon', 'info');
}

// Make functions globally available
window.toggleOrderMenu = toggleOrderMenu;
window.assignDriver = assignDriver;
window.confirmAssignDriver = confirmAssignDriver;
window.viewOrderDetails = viewOrderDetails;
window.editOrder = editOrder;

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

// Toggle ready for pickup status
async function toggleReadyForPickup(orderId, isReady) {
    try {
        // Store in localStorage for persistence
        const readyStatusKey = `order_ready_${orderId}`;
        localStorage.setItem(readyStatusKey, isReady ? 'true' : 'false');
        
        // Update the order in the current display
        const orderRow = document.querySelector(`tr[data-order-id="${orderId}"]`);
        if (orderRow) {
            // Visual feedback
            showNotification('Success', `Order #${orderId} marked as ${isReady ? 'ready' : 'not ready'} for pickup`);
        }
        
        // Try to update via API if endpoint exists
        try {
            const response = await authenticatedFetch(`${API_BASE}/orders/${orderId}`, {
                method: 'PUT',
                body: JSON.stringify({ ready_for_pickup: isReady })
            });
            
            const data = await response.json();
            if (data.success) {
                // Success - reload orders
                loadOrders();
            }
        } catch (apiError) {
            // API update failed, but local state is updated
            console.log('API update not available, using local state only');
        }
    } catch (error) {
        console.error('Error toggling ready for pickup:', error);
        showError('Error updating ready status: ' + error.message);
        // Revert checkbox state
        const checkbox = document.getElementById(`ready-switch-${orderId}`);
        if (checkbox) {
            checkbox.checked = !isReady;
        }
    }
}

// Make toggleReadyForPickup available globally
window.toggleReadyForPickup = toggleReadyForPickup;

// Delete selected orders
async function deleteSelectedOrders() {
    const checkboxes = document.querySelectorAll('.order-checkbox:checked');
    
    if (checkboxes.length === 0) {
        showNotification('Info', 'Please select at least one order to delete', 'info');
        return;
    }
    
    const orderIds = Array.from(checkboxes).map(cb => cb.value);
    const count = orderIds.length;
    
    if (!confirm(`Are you sure you want to delete ${count} order(s)? This action cannot be undone.`)) {
        return;
    }
    
    try {
        let successCount = 0;
        let failCount = 0;
        
        // Delete orders one by one
        for (const orderId of orderIds) {
            try {
                const response = await authenticatedFetch(`${API_BASE}/orders/${orderId}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (data.success) {
                    successCount++;
                } else {
                    failCount++;
                    console.error(`Failed to delete order ${orderId}:`, data.error);
                }
            } catch (error) {
                failCount++;
                console.error(`Error deleting order ${orderId}:`, error);
            }
        }
        
        if (successCount > 0) {
            showNotification('Success', `Successfully deleted ${successCount} order(s)${failCount > 0 ? `. ${failCount} failed.` : ''}`);
            // Reload orders
            loadOrders();
        } else {
            showError(`Failed to delete all orders. ${failCount} order(s) failed.`);
        }
    } catch (error) {
        console.error('Error deleting selected orders:', error);
        showError('Error deleting selected orders: ' + error.message);
    }
}

