import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import OrderConfirmationModal from './OrderConfirmationModal';
import CustomerOrderDetailsModal from './CustomerOrderDetailsModal';
import CustomerOrderCancellationModal from './CustomerOrderCancellationModal';
import { useProducts } from '../hooks/useProducts';

const CustomerOrders = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToCart } = useProducts();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customer_id(
            id,
            full_name, 
            email, 
            phone,
            profile_picture_url,
            role,
            created_at
          ),
          order_items(
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price,
            product_image_url
          )
        `)
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Auto-cancel orders that are past pickup date/time
      await autoCancelExpiredOrders(data || []);

      // Fetch orders again after auto-cancellation to get updated status
      const { data: updatedData, error: refreshError } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customer_id(
            id,
            full_name, 
            email, 
            phone,
            profile_picture_url,
            role,
            created_at
          ),
          order_items(
            id,
            product_id,
            product_name,
            quantity,
            unit_price,
            total_price,
            product_image_url
          )
        `)
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (refreshError) throw refreshError;
      setOrders(updatedData || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const autoCancelExpiredOrders = async (orders) => {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Only auto-cancel if current time is after 5:00 PM (17:00)
      if (currentHour < 17) {
        console.log('⏰ Auto-cancel skipped: Current time is before 5:00 PM');
        return;
      }

      console.log('🔍 Checking for expired orders to auto-cancel...', { today, currentTime });

      const ordersToCancel = orders.filter(order => {
        // Skip if already cancelled or picked up
        if (order.status === 'cancelled' || order.status === 'picked_up') {
          return false;
        }

        // Check if pickup date exists
        if (!order.pickup_date) {
          return false;
        }

        // Check if pickup date is in the past (before today)
        const pickupDate = new Date(order.pickup_date);
        const todayDate = new Date(today);
        pickupDate.setHours(0, 0, 0, 0);
        todayDate.setHours(0, 0, 0, 0);

        if (pickupDate < todayDate) {
          console.log(`📅 Order ${order.id} has past pickup date: ${order.pickup_date}`);
          return true;
        }

        // Check if pickup date is today and pickup time has passed
        if (order.pickup_date === today && order.pickup_time) {
          // Parse pickup time (HH:MM format)
          const [pickupHour, pickupMinute] = order.pickup_time.split(':').map(Number);
          const pickupTimeMinutes = pickupHour * 60 + pickupMinute;
          const currentTimeMinutes = currentHour * 60 + currentMinute;

          if (currentTimeMinutes >= pickupTimeMinutes) {
            console.log(`⏰ Order ${order.id} has passed pickup time: ${order.pickup_time} (current: ${currentTime})`);
            return true;
          }
        }

        return false;
      });

      console.log(`📋 Found ${ordersToCancel.length} orders to cancel`);

      // Cancel expired orders
      if (ordersToCancel.length > 0) {
        const { default: ordersService } = await import('../../services/booking/OrdersService');

        for (const order of ordersToCancel) {
          try {
            let reason;

            // Determine cancellation reason based on status and date
            const pickupDate = new Date(order.pickup_date);
            const todayDate = new Date(today);
            pickupDate.setHours(0, 0, 0, 0);
            todayDate.setHours(0, 0, 0, 0);

            if (order.status === 'pending') {
              // Pending orders that haven't been confirmed
              if (pickupDate < todayDate) {
                reason = 'Automatically cancelled: Pickup date has passed and order was not confirmed';
              } else {
                reason = 'Automatically cancelled: Pickup time has passed and order was not confirmed';
              }
            } else {
              // Other statuses (confirmed, ready_for_pickup)
              if (pickupDate < todayDate) {
                reason = 'Automatically cancelled: Pickup date has passed';
              } else {
                reason = 'Automatically cancelled: Pickup time has passed';
              }
            }

            console.log(`🔄 Cancelling order ${order.id} (${order.status}): ${reason}`);
            await ordersService.cancelOrder(order.id, reason, 'system');
            console.log(`✅ Auto-cancelled expired order: ${order.id} (status: ${order.status})`);
          } catch (err) {
            console.error(`❌ Error auto-cancelling order ${order.id}:`, err);
          }
        }
      } else {
        console.log('✅ No expired orders to cancel');
      }
    } catch (error) {
      console.error('❌ Error in auto-cancel expired orders:', error);
      // Don't throw - this is a background operation
    }
  };

  const handleCancelOrder = (order) => {
    // Only allow cancellation for pending orders
    if (order.status === 'pending') {
      setOrderToCancel(order);
      setShowCancellationModal(true);
    }
  };

  const handleViewDetails = async (order) => {
    setSelectedOrder(order);
    try {
      // Fetch order details (simplified for customers)
      const { data: orderItems, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:product_id (
            id,
            name,
            description,
            image_url,
            category
          )
        `)
        .eq('order_id', order.id);

      if (error) throw error;

      setOrderDetails({
        items: orderItems || [],
        fraudAnalysis: null // Customers don't see fraud analysis
      });
      setShowDetailsModal(true);
    } catch (err) {
      console.error('Error fetching order details:', err);
      setError('Failed to load order details.');
    }
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedOrder(null);
    setOrderDetails(null);
  };

  const handleConfirmCancellation = async (orderId, reason) => {
    try {
      const { default: ordersService } = await import('../../services/booking/OrdersService');
      await ordersService.cancelOrder(orderId, reason, 'customer');
      await fetchOrders();
      setShowCancellationModal(false);
      setOrderToCancel(null);
    } catch (error) {
      console.error('Error cancelling order:', error);
      setError('Failed to cancel order. Please try again.');
    }
  };

  const closeCancellationModal = () => {
    setShowCancellationModal(false);
    setOrderToCancel(null);
  };

  const handleBuyAgain = async (order) => {
    try {
      if (!order.order_items || order.order_items.length === 0) {
        setError('No items to reorder');
        return;
      }

      // Fetch product details for each item
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*')
        .in('id', order.order_items.map(item => item.product_id).filter(Boolean));

      if (productsError) throw productsError;

      // Create a map of product ID to product data
      const productMap = {};
      products.forEach(product => {
        productMap[product.id] = product;
      });

      // Add each item to cart
      let addedCount = 0;
      for (const item of order.order_items) {
        const product = productMap[item.product_id];
        if (product && product.is_available) {
          // Add the same quantity as before
          await addToCart(product, item.quantity);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        // Navigate to products page to checkout
        navigate('/products');
      } else {
        setError('Some items are no longer available');
      }
    } catch (err) {
      console.error('Error adding items to cart:', err);
      setError('Failed to add items to cart. Please try again.');
    }
  };

  const confirmCancelOrder = async () => {
    if (!orderToCancel) return;

    try {
      const { default: ordersService } = await import('../../services/booking/OrdersService');
      await ordersService.updateOrderStatus(orderToCancel.id, 'cancelled');
      await fetchOrders();
      setShowCancelModal(false);
      setOrderToCancel(null);
      alert('Order cancelled successfully!');
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert('Failed to cancel order. Please try again.');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'confirmed': return 'primary';
      case 'ready_for_pickup': return 'success';
      case 'picked_up': return 'success';
      case 'cancelled': return 'danger';
      default: return 'secondary';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending Confirmation';
      case 'confirmed': return 'Confirmed';
      case 'ready_for_pickup': return 'Ready for Pickup';
      case 'picked_up': return 'Picked Up';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  // Filter orders by date
  const filterOrdersByDate = (orders) => {
    if (dateFilter === 'all') return orders;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return orders.filter(order => {
      const orderDate = new Date(order.created_at);
      const orderDateOnly = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate());

      switch (dateFilter) {
        case 'today':
          return orderDateOnly.getTime() === today.getTime();
        case 'this_week':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          return orderDateOnly >= weekStart && orderDateOnly <= weekEnd;
        case 'this_month':
          return orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
        case 'custom':
          if (!customStartDate || !customEndDate) return true;
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
          const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          return orderDateOnly >= startOnly && orderDateOnly <= endOnly;
        default:
          return true;
      }
    });
  };

  const filteredOrders = filterOrdersByDate(orders.filter(order => {
    // Status filter
    if (filter !== 'all' && order.status !== filter) return false;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const orderNumber = order.order_number || order.id.slice(0, 8);
      const matchesSearch =
        orderNumber.toLowerCase().includes(query) ||
        (order.notes && order.notes.toLowerCase().includes(query)) ||
        order.total_amount?.toString().includes(query);

      if (!matchesSearch) return false;
    }

    return true;
  }));

  if (loading) {
    return (
      <div className="container py-4">
        <div className="d-flex justify-content-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-12">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-3 mb-md-4 gap-3">
            <div>
              <h2 className="h3 h4-md mb-1">My Orders</h2>
              <p className="text-muted mb-0 small">Track your product orders and pickup status</p>
            </div>
            <Link to="/products" className="btn btn-primary btn-sm btn-md-auto w-100 w-md-auto">
              <i className="bi bi-plus-circle me-2"></i>
              <span className="d-none d-sm-inline">New Order</span>
              <span className="d-sm-none">New</span>
            </Link>
          </div>

          {/* Enhanced Filters */}
          <div className="card mb-3 mb-md-4 border-0 shadow-sm">
            <div className="card-header bg-light border-0 py-2 py-md-3">
              <h6 className="mb-0 d-flex align-items-center small">
                <i className="bi bi-funnel me-2 text-primary"></i>
                <span className="d-none d-sm-inline">Filter & Search</span>
                <span className="d-sm-none">Filters</span>
              </h6>
            </div>
            <div className="card-body">
              {/* Search Bar */}
              <div className="row mb-3">
                <div className="col-12">
                  <label className="form-label fw-semibold small text-muted mb-1">
                    <i className="bi bi-search me-1"></i>
                    Search
                  </label>
                  <div className="input-group">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="bi bi-search text-muted"></i>
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0"
                      placeholder="Search by order number, amount..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        className="btn btn-outline-secondary border-start-0"
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                      >
                        <i className="bi bi-x-lg"></i>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Filter Controls */}
              <div className="row g-3">
                {/* Status Filter */}
                <div className="col-12 col-md-6 col-lg-4">
                  <label className="form-label fw-semibold small text-muted mb-1">
                    <i className="bi bi-funnel me-1"></i>
                    Status
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">All Orders</option>
                    <option value="pending">Pending Confirmation</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="ready_for_pickup">Ready for Pickup</option>
                    <option value="picked_up">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Date Filter */}
                <div className="col-12 col-md-6 col-lg-4">
                  <label className="form-label fw-semibold small text-muted mb-1">
                    <i className="bi bi-calendar-range me-1"></i>
                    Date Range
                  </label>
                  <select
                    className="form-select form-select-sm"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="this_week">This Week</option>
                    <option value="this_month">This Month</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                {/* Custom Date Range */}
                {dateFilter === 'custom' && (
                  <div className="col-12 col-md-6 col-lg-4">
                    <label className="form-label fw-semibold small text-muted mb-1">
                      <i className="bi bi-calendar2-week me-1"></i>
                      Custom Range
                    </label>
                    <div className="row g-2">
                      <div className="col-6">
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          placeholder="Start Date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                        />
                      </div>
                      <div className="col-6">
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          placeholder="End Date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Active Filters Summary */}
              {(filter !== 'all' || dateFilter !== 'all' || searchQuery) && (
                <div className="row mt-2">
                  <div className="col-12">
                    <div className="d-flex flex-wrap align-items-center gap-2 small">
                      <span className="text-muted">Active:</span>
                      {filter !== 'all' && (
                        <span className="badge bg-primary">
                          {filter === 'pending' ? 'Pending' :
                            filter === 'ready_for_pickup' ? 'Ready' :
                              filter === 'picked_up' ? 'Completed' :
                                filter === 'cancelled' ? 'Cancelled' : filter}
                          <button
                            type="button"
                            className="btn-close btn-close-white ms-1"
                            style={{ fontSize: '0.5em' }}
                            onClick={() => setFilter('all')}
                            aria-label="Remove filter"
                          ></button>
                        </span>
                      )}
                      {dateFilter !== 'all' && (
                        <span className="badge bg-success">
                          {dateFilter.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          <button
                            type="button"
                            className="btn-close btn-close-white ms-1"
                            style={{ fontSize: '0.5em' }}
                            onClick={() => setDateFilter('all')}
                            aria-label="Remove filter"
                          ></button>
                        </span>
                      )}
                      {searchQuery && (
                        <span className="badge bg-secondary">
                          "{searchQuery}"
                          <button
                            type="button"
                            className="btn-close btn-close-white ms-1"
                            style={{ fontSize: '0.5em' }}
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                          ></button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Results Count */}
              <div className="row mt-2">
                <div className="col-12">
                  <p className="text-muted small mb-0">
                    <i className="bi bi-list-ul me-1"></i>
                    Showing <strong>{filteredOrders.length}</strong> of <strong>{orders.length}</strong> orders
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Orders List */}
          {filteredOrders.length === 0 ? (
            <div className="card">
              <div className="card-body text-center py-5">
                <i className="bi bi-box display-1 text-muted"></i>
                <h4 className="mt-3">No Orders Found</h4>
                <p className="text-muted">
                  {filter === 'all'
                    ? "You haven't placed any orders yet."
                    : `No orders with status "${getStatusText(filter)}" found.`
                  }
                </p>
                {filter === 'all' && (
                  <Link to="/products" className="btn btn-primary">
                    <i className="bi bi-plus-circle me-2"></i>
                    Place Your First Order
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="row g-3 g-md-4">
              {filteredOrders.map((order) => (
                <div key={order.id} className="col-12">
                  <div className="card h-100 shadow-sm border-0">
                    {/* Header with Order Number and Status */}
                    <div className="card-header bg-white border-bottom d-flex justify-content-between align-items-center py-3">
                      <div className="d-flex align-items-center">
                        <i className="bi bi-receipt me-2 text-primary"></i>
                        <h6 className="mb-0 fw-semibold">Order #{order.order_number || order.id.slice(0, 8)}</h6>
                      </div>
                      <span
                        className={`badge ${order.status === 'completed' || order.status === 'picked_up' ? 'bg-success' :
                          order.status === 'cancelled' ? 'bg-danger' :
                            order.status === 'pending' ? 'bg-warning text-dark' :
                              order.status === 'ready_for_pickup' ? 'bg-success' :
                                order.status === 'confirmed' ? 'bg-primary' :
                                  'bg-secondary'
                          }`}
                      >
                        {getStatusText(order.status)}
                      </span>
                    </div>

                    <div className="card-body p-0">
                      {/* Order Items */}
                      {order.order_items && order.order_items.length > 0 ? (
                        order.order_items.map((item, index) => (
                          <div key={item.id || index} className="p-2 border-bottom">
                            <div className="d-flex align-items-center">
                              {/* Product Image */}
                              <div className="me-2 flex-shrink-0">
                                {item.product_image_url ? (
                                  <img
                                    src={item.product_image_url}
                                    alt={item.product_name}
                                    className="rounded"
                                    style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                                    onError={(e) => {
                                      e.target.src = 'https://via.placeholder.com/50x50?text=No+Image';
                                    }}
                                  />
                                ) : (
                                  <div
                                    className="rounded d-flex align-items-center justify-content-center bg-light"
                                    style={{ width: '50px', height: '50px' }}
                                  >
                                    <i className="bi bi-image text-muted" style={{ fontSize: '1rem' }}></i>
                                  </div>
                                )}
                              </div>

                              {/* Product Details */}
                              <div className="flex-grow-1">
                                <div className="mb-1">
                                  <span className="fw-semibold small" style={{ fontSize: '0.85rem' }}>
                                    {item.product_name}
                                  </span>
                                </div>
                                <div className="mb-1">
                                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>x{item.quantity}</span>
                                </div>
                              </div>

                              {/* Prices - Right Aligned */}
                              <div className="text-end flex-shrink-0">
                                <div className="mb-1">
                                  <span className="fw-semibold text-dark d-block" style={{ fontSize: '0.85rem' }}>
                                    ₱{Number(item.total_price || 0).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-2 text-center text-muted small">
                          <i className="bi bi-box-seam me-2"></i>
                          No items found
                        </div>
                      )}

                      {/* Total and Action Section */}
                      <div className="p-3 bg-light">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <span className="text-muted small">
                            Total {order.order_items?.length || 0} item{order.order_items?.length !== 1 ? 's' : ''}:
                          </span>
                          <span className="fw-bold fs-5 text-primary">
                            ₱{Number(order.total_amount || 0).toFixed(2)}
                          </span>
                        </div>

                        {/* Pickup Information */}
                        {order.pickup_date && (
                          <div className="mb-3 small text-muted">
                            <div className="mb-1">
                              <i className="bi bi-calendar-check me-1"></i>
                              Pickup: {new Date(order.pickup_date).toLocaleDateString()}
                              {order.pickup_time && ` at ${order.pickup_time}`}
                            </div>
                            <div>
                              <i className="bi bi-geo-alt me-1"></i>
                              {order.pickup_location || 'R&R Barber Shop'}
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {order.notes && order.notes.trim() !== '' && (
                          <div className="mb-3 small">
                            <strong>Notes:</strong> {order.notes}
                          </div>
                        )}

                        {/* Cancellation Reason */}
                        {order.cancellation_reason && (
                          <div className="mb-3 small text-danger">
                            <strong>Cancellation Reason:</strong> {order.cancellation_reason}
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="d-flex gap-2 justify-content-end">
                          <button
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => handleViewDetails(order)}
                          >
                            <i className="bi bi-eye me-1"></i>
                            View Details
                          </button>

                          {(order.status === 'picked_up' || order.status === 'completed' || order.status === 'cancelled') && (
                            <button
                              className="btn btn-sm"
                              style={{
                                borderColor: '#ff6b35',
                                color: '#ff6b35',
                                backgroundColor: 'transparent'
                              }}
                              onClick={() => handleBuyAgain(order)}
                            >
                              <i className="bi bi-arrow-clockwise me-1"></i>
                              Buy Again
                            </button>
                          )}

                          {order.status === 'pending' && (
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleCancelOrder(order)}
                            >
                              <i className="bi bi-x-circle me-1"></i>
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      <OrderConfirmationModal
        show={showCancelModal}
        onHide={() => {
          setShowCancelModal(false);
          setOrderToCancel(null);
        }}
        onConfirm={confirmCancelOrder}
        title="Cancel Order"
        message={`Are you sure you want to cancel order #${orderToCancel?.order_number || orderToCancel?.id?.slice(0, 8)}? This action cannot be undone.`}
        confirmText="Yes, Cancel Order"
        confirmVariant="danger"
        loading={false}
      />

      {/* Customer Order Details Modal */}
      {showDetailsModal && (
        <CustomerOrderDetailsModal
          order={selectedOrder}
          orderDetails={orderDetails}
          onClose={closeDetailsModal}
        />
      )}

      {/* Customer Order Cancellation Modal */}
      {showCancellationModal && (
        <CustomerOrderCancellationModal
          order={orderToCancel}
          onConfirm={handleConfirmCancellation}
          onCancel={closeCancellationModal}
        />
      )}
    </div>
  );
};

export default CustomerOrders;
