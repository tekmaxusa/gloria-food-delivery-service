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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
    
    // Setup navigation links
    setupNavigation();
    
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
    
    // Notifications button
    const notificationsBtn = document.querySelector('.icon-btn[title="Notifications"]');
    if (notificationsBtn) {
        notificationsBtn.addEventListener('click', handleNotifications);
    }
    
    // Help button
    const helpBtn = document.querySelector('.icon-btn[title="Help"]');
    if (helpBtn) {
        helpBtn.addEventListener('click', handleHelp);
    }
    
    // Start auto-refresh
    startAutoRefresh();
});

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
        case 'dispatch':
            showDispatchPage();
            break;
        case 'drivers':
            showDriversPage();
            break;
        case 'reviews':
            showReviewsPage();
            break;
        case 'reports':
            showReportsPage();
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
                    + New Order
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
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Rating</th>
                        <th class="sortable">
                            <span>Phone</span>
                            <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 5v14M5 12l7-7 7 7"/>
                            </svg>
                        </th>
                        <th>Email</th>
                        <th class="sortable">
                            <span>Vehicle</span>
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
                        <th></th>
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

// Show Reports page
function showReportsPage() {
    const mainContainer = document.querySelector('.main-container');
    mainContainer.innerHTML = `
        <div class="orders-header">
            <h1 class="page-title">Reports</h1>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin-top: 24px;">
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">📊</div>
                <h3>Sales</h3>
                <p>Key sales metrics revealing customer consumption patterns and preferences.</p>
            </div>
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">🚗</div>
                <h3>Drivers</h3>
                <p>Driver hours, payment and performance analysis for operational efficiency.</p>
            </div>
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">📈</div>
                <h3>Performance</h3>
                <p>Key operational metrics revealing delivery efficiency.</p>
            </div>
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">∞</div>
                <h3>Extended</h3>
                <p>Comprehensive overview providing detailed insights into all order-related metrics.</p>
            </div>
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">📊</div>
                <h3>Analytics</h3>
                <p>Time-based performance with charts for comprehensive insights into trends.</p>
            </div>
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">🗺️</div>
                <h3>Heatmap</h3>
                <p>Spatial order distribution on a map for quick trend visualization.</p>
            </div>
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">📦</div>
                <h3>Third party delivery services</h3>
                <p>Insights into third-party delivery operations and essential key metrics.</p>
            </div>
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">💰</div>
                <h3>Refund</h3>
                <p>Insights into refund request and other associated information.</p>
            </div>
            <div class="report-card">
                <div class="report-icon" style="background: #d1fae5; color: #065f46;">✅</div>
                <h3>Success Report <span style="font-size: 10px; background: #fbbf24; color: #1a202c; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Beta</span></h3>
                <p>Analysis of successful deliveries and factors contributing to fulfillment efficiency.</p>
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
        <p><strong>Reports:</strong> View analytics and reports</p>
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
        
        const response = await fetch(url);
        
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
    
    const escapeHtml = (text) => {
        if (!text) return 'N/A';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    };
    
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
    
    notification.textContent = `${title}: ${message}`;
    notification.className = `notification ${isError ? 'error' : ''}`;
    
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
        const response = await fetch(`${API_BASE}/orders/${orderId}`, {
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
