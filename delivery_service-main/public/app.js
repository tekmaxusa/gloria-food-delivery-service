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
    
    // Setup UI elements when dashboard is shown
    setupDashboardUI();
    
    // Load orders when dashboard is shown
    loadOrders();
    
    // Start auto-refresh only when authenticated
    startAutoRefresh();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Setup authentication handlers first
    setupAuth();
    
    // Setup navigation links
    setupNavigation();
    
    // Check authentication - this will show login or dashboard
    checkAuth();
});

// Setup authentication handlers
function setupAuth() {
    // Login form
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail')?.value;
            const password = document.getElementById('loginPassword')?.value;
            
            if (!email || !password) {
                showError('Please enter email and password');
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
                    showError(data.error || 'Invalid email or password');
                }
            } catch (error) {
                console.error('Login error:', error);
                showError('Error connecting to server: ' + error.message);
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
            
            if (!name || !email || !password) {
                showError('Please fill in all fields');
                return;
            }
            
            if (password.length < 6) {
                showError('Password must be at least 6 characters');
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
                    showError(data.error || 'Failed to create account');
                }
            } catch (error) {
                console.error('Signup error:', error);
                showError('Error connecting to server: ' + error.message);
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
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
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
        case 'reviews':
            showReviewsPage();
            break;
        default:
            showOrdersPage();
    }
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
        });
    }
    
    // New order button
    const newOrderBtn = document.getElementById('newOrderBtn');
    if (newOrderBtn) {
        newOrderBtn.addEventListener('click', handleNewOrder);
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
                    <button class="btn-secondary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                        Get the app
                    </button>
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
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 id="merchantModalTitle">Add New Merchant</h2>
                    <button class="modal-close" id="closeMerchantModal">&times;</button>
                </div>
                <form id="merchantForm">
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
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="merchantIsActive" checked> Active
                        </label>
                        <small style="color: #666; font-size: 12px;">Inactive merchants will not be polled for orders</small>
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

// Handle Notifications button
function handleNotifications() {
    showNotification('Notifications', 'You have no new notifications');
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
    
    alert(helpContent);
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

// Filter and display orders
function filterAndDisplayOrders() {
    let filtered = [...allOrders];
    
    // Apply status filter
    if (currentStatusFilter && currentStatusFilter !== 'current') {
        const statusMap = {
            'scheduled': ['SCHEDULED'],
            'completed': ['DELIVERED'],
            'incomplete': ['CANCELLED', 'FAILED'],
            'history': ['DELIVERED', 'CANCELLED']
        };
        
        if (statusMap[currentStatusFilter]) {
            filtered = filtered.filter(order => 
                statusMap[currentStatusFilter].includes(order.status?.toUpperCase())
            );
        }
    } else if (currentStatusFilter === 'current') {
        // Current = all active orders (not delivered or cancelled)
        filtered = filtered.filter(order => {
            const status = order.status?.toUpperCase();
            return status && !['DELIVERED', 'CANCELLED'].includes(status);
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
    const customerAddress = escapeHtml(order.delivery_address || 'N/A');
    const merchantName = escapeHtml(order.merchant_name || order.store_id || 'N/A');
    const amount = formatCurrency(order.total_price || 0, order.currency || 'USD');
    const orderPlaced = formatDate(order.fetched_at || order.created_at || order.updated_at);
    const pickupTime = order.pickup_time ? formatDate(order.pickup_time) : 'N/A';
    const deliveryTime = order.delivery_time ? formatDate(order.delivery_time) : 'N/A';
    const readyForPickup = order.ready_for_pickup ? formatDate(order.ready_for_pickup) : 'N/A';
    const driver = order.driver_name || 'N/A';
    const tracking = order.doordash_tracking_url 
        ? `<a href="${escapeHtml(order.doordash_tracking_url)}" target="_blank" style="color: #22c55e; text-decoration: underline;">Track</a>`
        : 'N/A';
    
    return `
        <tr data-order-id="${escapeHtml(String(orderId))}">
            <td>
                <input type="checkbox" class="order-checkbox" value="${escapeHtml(String(orderId))}">
            </td>
            <td><strong>#${escapeHtml(String(orderId))}</strong></td>
            <td><span style="color: #3b82f6; font-weight: 500;">${merchantName}</span></td>
            <td>${customerName}</td>
            <td>${customerAddress}</td>
            <td>${amount}</td>
            <td>${order.distance ? order.distance + ' km' : 'N/A'}</td>
            <td>${orderPlaced}</td>
            <td>${pickupTime}</td>
            <td>${deliveryTime}</td>
            <td>${readyForPickup}</td>
            <td>${escapeHtml(driver)}</td>
            <td><span class="status-badge status-${status}">${escapeHtml(status)}</span></td>
            <td>${tracking}</td>
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
        // Show notification for each new order
        newOrders.forEach(order => {
            const orderId = order.gloriafood_order_id || order.id;
            showNotification(`New Order #${orderId}`, 
                `${order.customer_name || 'Customer'} - ${formatCurrency(order.total_price || 0, order.currency || 'USD')}`);
            
            // Show browser notification
            showBrowserNotification(order);
        });
        
        // Update last order IDs
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

