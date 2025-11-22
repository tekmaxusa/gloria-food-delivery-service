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
        const [statsRes, ordersRes] = await Promise.all([
            fetch(`${API_BASE}/api/dashboard/stats`, {
                headers: { 'x-session-id': sessionId || '' }
            }),
            fetch(`${API_BASE}/orders?limit=100`, {
                headers: { 'x-session-id': sessionId || '' }
            })
        ]);
        
        if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.success) {
                updateDashboardStats(statsData.stats);
            }
        }
        
        if (ordersRes.ok) {
            const ordersData = await ordersRes.json();
            if (ordersData.success !== false && (ordersData.orders || Array.isArray(ordersData))) {
                allOrders = ordersData.orders || ordersData || [];
                checkForNewOrders(allOrders);
            }
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
        const response = await fetch(`${API_BASE}/orders?limit=10`, {
            headers: { 'x-session-id': sessionId || '' }
        });
        
        if (response.ok) {
            const data = await response.json();
            const orders = data.orders || data || [];
            displayRecentOrders(orders);
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
            <td>${escapeHtml(order.customer_name || 'N/A')}</td>
            <td>${escapeHtml(order.delivery_address || 'N/A')}</td>
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
                    </tr>
                </thead>
                <tbody id="ordersTableBody">
                    <tr><td colspan="13" class="empty-state-cell"><div class="empty-state"><div class="empty-state-text">Loading...</div></div></td></tr>
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
        });
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

// Generate report
window.generateReport = function(type) {
    const reportContent = document.getElementById('reportContent');
    if (!reportContent) return;
    
    reportContent.innerHTML = `
        <div class="table-container">
            <div style="padding: 24px;">
                <h2 style="margin-bottom: 16px;">${type.charAt(0).toUpperCase() + type.slice(1)} Report</h2>
                <p style="color: #64748b; margin-bottom: 24px;">Report generated at ${new Date().toLocaleString()}</p>
                <div class="dashboard-grid">
                    <div class="dashboard-card">
                        <h3>Total ${type}</h3>
                        <div class="value">-</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>This Month</h3>
                        <div class="value">-</div>
                    </div>
                    <div class="dashboard-card">
                        <h3>Growth</h3>
                        <div class="value">-</div>
                    </div>
                </div>
                <p style="margin-top: 24px; color: #94a3b8; font-size: 14px;">Detailed ${type} report data will be displayed here.</p>
            </div>
        </div>
    `;
};

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
    
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    
    modal.querySelector('#newOrderForm').addEventListener('submit', (e) => {
        e.preventDefault();
        showNotification('Info', 'Order creation functionality - backend integration needed');
        modal.remove();
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
        
        const response = await fetch(url, {
            headers: { 'x-session-id': sessionId || '' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success !== false && (data.orders || Array.isArray(data))) {
            allOrders = data.orders || data || [];
            checkForNewOrders(allOrders);
            filterAndDisplayOrders();
        } else {
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
                <td colspan="13" class="empty-state-cell">
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
                <td colspan="13" class="empty-state-cell">
                    <div class="empty-state">
                        <div class="empty-state-text">Error displaying orders: ${error.message}</div>
                    </div>
                </td>
            </tr>
        `;
    }
}

// Create order table row
function createOrderRow(order) {
    if (!order) return '';
    
    const orderId = order.gloriafood_order_id || order.id || 'N/A';
    const status = (order.status || 'UNKNOWN').toUpperCase();
    const customerName = escapeHtml(order.customer_name || 'N/A');
    const customerAddress = escapeHtml(order.delivery_address || 'N/A');
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
        newOrders.forEach(order => {
            const orderId = order.gloriafood_order_id || order.id;
            showNotification(`New Order #${orderId}`, 
                `${order.customer_name || 'Customer'} - ${formatCurrency(order.total_price || 0, order.currency || 'USD')}`);
            
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
        if (sessionId) {
            loadOrders();
            loadDashboardData();
            loadDrivers();
            loadReviews();
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
