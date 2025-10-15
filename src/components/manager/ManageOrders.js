// components/manager/ManageOrders.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import OrdersService from '../../services/OrdersService';
import LoadingSpinner from '../common/LoadingSpinner';
import OrderConfirmationModal from '../orders/OrderConfirmationModal';
import OrderDetailsModal from '../orders/OrderDetailsModal';
import OrderCancellationModal from '../orders/OrderCancellationModal';
import WalkInProductPurchase from './WalkInProductPurchase';
import { useAuth } from '../hooks/useAuth';

const ManageOrders = () => {
  const { user, userRole } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    status: 'all',
    dateFrom: '',
    dateTo: '',
    customerId: ''
  });

  // Selected order for details
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);

  // Modal states
  const [modalState, setModalState] = useState({
    isOpen: false,
    action: null, // 'confirm' or 'cancel'
    order: null,
    isLoading: false
  });

  // New modal states
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [showWalkInProductModal, setShowWalkInProductModal] = useState(false);

  useEffect(() => {
    console.log('ManageOrders - User:', user);
    console.log('ManageOrders - UserRole:', userRole);
    
    // Check if user is a manager
    if (user && userRole && userRole !== 'manager') {
      console.log('Access denied - userRole is:', userRole);
      setError('Access denied. Only managers can manage orders.');
      setLoading(false);
      return;
    }
    
    if (user && userRole === 'manager') {
      console.log('Manager access granted');
      fetchOrders();
      fetchStats();
    }
  }, [filters, user, userRole]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError('');

      const filterParams = {};
      if (filters.status !== 'all') filterParams.status = filters.status;
      if (filters.dateFrom) filterParams.dateFrom = filters.dateFrom;
      if (filters.dateTo) filterParams.dateTo = filters.dateTo;
      if (filters.customerId) filterParams.customerId = filters.customerId;

      const data = await OrdersService.getAllOrders(filterParams);
      setOrders(data);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await OrdersService.getOrderStatistics();
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  // Modal functions
  const openModal = (action, order) => {
    setModalState({
      isOpen: true,
      action,
      order,
      isLoading: false
    });
  };

  const closeModal = () => {
    setModalState({
      isOpen: false,
      action: null,
      order: null,
      isLoading: false
    });
  };

  const handleModalConfirm = async () => {
    const { action, order } = modalState;
    
    setModalState(prev => ({ ...prev, isLoading: true }));
    
    try {
      if (action === 'confirm') {
        await handleStatusUpdate(order.id, 'confirmed');
      } else if (action === 'cancel') {
        const reason = document.getElementById('cancellationReason')?.value || '';
        await handleCancelOrder(order.id, reason);
      }
      
      closeModal();
    } catch (err) {
      console.error('Error in modal action:', err);
      setError(`Failed to ${action} order. Please try again.`);
      setModalState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleStatusUpdate = async (orderId, newStatus, additionalData = {}) => {
    try {
      await OrdersService.updateOrderStatus(orderId, newStatus, additionalData);
      fetchOrders(); // Refresh orders
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
    } catch (err) {
      console.error('Error updating order status:', err);
      setError('Failed to update order status. Please try again.');
    }
  };

  const handleCancelOrder = async (orderId, reason) => {
    try {
      await OrdersService.cancelOrder(orderId, reason, 'manager');
      fetchOrders(); // Refresh orders
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({ ...selectedOrder, status: 'cancelled' });
      }
    } catch (err) {
      console.error('Error cancelling order:', err);
      setError('Failed to cancel order. Please try again.');
    }
  };

  const handleViewDetails = async (order) => {
    setSelectedOrder(order);
    try {
      const details = await OrdersService.getOrderDetails(order.id);
      setOrderDetails(details);
      setShowDetailsModal(true);
    } catch (err) {
      console.error('Error fetching order details:', err);
      setError('Failed to load order details.');
    }
  };

  const handleCancelOrderClick = (order) => {
    setOrderToCancel(order);
    setShowCancellationModal(true);
  };

  const confirmCancelOrder = async (orderId, reason) => {
    try {
      await OrdersService.cancelOrder(orderId, reason, 'manager');
      fetchOrders(); // Refresh orders
      setShowCancellationModal(false);
      setOrderToCancel(null);
    } catch (err) {
      console.error('Error cancelling order:', err);
      setError('Failed to cancel order. Please try again.');
    }
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedOrder(null);
    setOrderDetails(null);
  };

  const closeCancellationModal = () => {
    setShowCancellationModal(false);
    setOrderToCancel(null);
  };

  // Walk-in product purchase handlers
  const handleWalkInProductPurchase = () => {
    setShowWalkInProductModal(true);
  };

  const closeWalkInProductModal = () => {
    setShowWalkInProductModal(false);
  };

  const handleProductPurchaseSuccess = (order) => {
    console.log('Product purchase completed:', order);
    // Refresh orders list
    fetchOrders();
    // Close modal
    setShowWalkInProductModal(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'confirmed': return 'info';
      case 'preparing': return 'primary';
      case 'ready_for_pickup': return 'success';
      case 'picked_up': return 'success';
      case 'cancelled': return 'danger';
      case 'refunded': return 'secondary';
      default: return 'secondary';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'confirmed': return 'Confirmed';
      case 'preparing': return 'Preparing';
      case 'ready_for_pickup': return 'Ready for Pickup';
      case 'picked_up': return 'Picked Up';
      case 'cancelled': return 'Cancelled';
      case 'refunded': return 'Refunded';
      default: return status;
    }
  };


  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (timeString) => {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading && !stats) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid py-4">
      <div className="row">
        <div className="col">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div>
              <h2 className="mb-1">
                <i className="bi bi-bag-check me-2"></i>
                Manage Orders
              </h2>
              <p className="text-muted mb-0">Monitor and manage product orders</p>
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-primary"
                onClick={handleWalkInProductPurchase}
              >
                <i className="bi bi-cart-plus me-2"></i>
                Walk-in Product Purchase
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-triangle me-2"></i>
              {error}
            </div>
          )}

          {/* Statistics Cards */}
          {stats && (
            <div className="row mb-4">
              <div className="col-md-3 mb-3">
                <div className="card bg-primary text-white">
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      <div>
                        <h6 className="card-title mb-1">Total Orders</h6>
                        <h3 className="mb-0">{stats.total}</h3>
                      </div>
                      <div className="ms-auto">
                        <i className="bi bi-bag display-6"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="col-md-3 mb-3">
                <div className="card bg-success text-white">
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      <div>
                        <h6 className="card-title mb-1">Total Revenue</h6>
                        <h3 className="mb-0">₱{stats.totalRevenue.toFixed(0)}</h3>
                      </div>
                      <div className="ms-auto">
                        <i className="bi bi-currency-dollar display-6"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="col-md-3 mb-3">
                <div className="card bg-info text-white">
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      <div>
                        <h6 className="card-title mb-1">Avg Order Value</h6>
                        <h3 className="mb-0">₱{stats.averageOrderValue.toFixed(0)}</h3>
                      </div>
                      <div className="ms-auto">
                        <i className="bi bi-graph-up display-6"></i>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
            </div>
          )}

          {/* Filters */}
          <div className="card mb-4">
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-2">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready_for_pickup">Ready for Pickup</option>
                    <option value="picked_up">Picked Up</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                
                
                <div className="col-md-2">
                  <label className="form-label">From Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  />
                </div>
                
                <div className="col-md-2">
                  <label className="form-label">To Date</label>
                  <input
                    type="date"
                    className="form-control"
                    value={filters.dateTo}
                    onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  />
                </div>
                
                <div className="col-md-2">
                  <label className="form-label">Customer ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Customer ID"
                    value={filters.customerId}
                    onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}
                  />
                </div>
                
                <div className="col-md-2 d-flex align-items-end">
                  <button
                    className="btn btn-outline-secondary w-100"
                    onClick={() => setFilters({
                      status: 'all',
                      dateFrom: '',
                      dateTo: '',
                      customerId: ''
                    })}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Orders ({orders.length})</h5>
            </div>
            <div className="card-body p-0">
              {loading ? (
                <div className="text-center py-4">
                  <LoadingSpinner />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-bag display-1 text-muted mb-3"></i>
                  <h5>No orders found</h5>
                  <p className="text-muted">No orders match your current filters.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Pickup</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id}>
                          <td>
                            <div>
                              <div className="fw-bold">#{order.order_number}</div>
                              <small className="text-muted">
                                {formatDate(order.created_at)}
                              </small>
                            </div>
                          </td>
                          <td>
                            <div>
                              <div className="fw-bold">{order.customer?.full_name || 'Unknown'}</div>
                              <small className="text-muted">{order.customer?.email}</small>
                            </div>
                          </td>
                          <td>
                            <span className="badge bg-light text-dark">
                              {order.order_items?.length || 0} items
                            </span>
                          </td>
                          <td>
                            <span className="fw-bold">₱{parseFloat(order.total_amount).toFixed(2)}</span>
                          </td>
                          <td>
                            <div>
                              <div className="small">{formatDate(order.pickup_date)}</div>
                              <div className="small text-muted">{formatTime(order.pickup_time)}</div>
                            </div>
                          </td>
                          <td>
                            <span className={`badge bg-${getStatusColor(order.status)}`}>
                              {getStatusText(order.status)}
                            </span>
                          </td>
                          <td>
                            <div className="btn-group btn-group-sm">
                              <button
                                className="btn btn-outline-primary"
                                onClick={() => handleViewDetails(order)}
                                title="View Details"
                              >
                                <i className="bi bi-eye"></i>
                              </button>
                              
                              {order.status === 'pending' && (
                                <button
                                  className="btn btn-outline-success"
                                  onClick={() => openModal('confirm', order)}
                                  title="Confirm Order"
                                >
                                  <i className="bi bi-check"></i>
                                </button>
                              )}
                              
                              {order.status === 'confirmed' && (
                                <button
                                  className="btn btn-outline-info"
                                  onClick={() => handleStatusUpdate(order.id, 'preparing')}
                                  title="Start Preparing"
                                >
                                  <i className="bi bi-gear"></i>
                                </button>
                              )}
                              
                              {order.status === 'preparing' && (
                                <button
                                  className="btn btn-outline-success"
                                  onClick={() => handleStatusUpdate(order.id, 'ready_for_pickup')}
                                  title="Mark Ready"
                                >
                                  <i className="bi bi-bag-check"></i>
                                </button>
                              )}
                              
                              {order.status === 'ready_for_pickup' && (
                                <button
                                  className="btn btn-outline-success"
                                  onClick={() => handleStatusUpdate(order.id, 'picked_up')}
                                  title="Mark Picked Up"
                                >
                                  <i className="bi bi-check2-all"></i>
                                </button>
                              )}
                              
                              {!['picked_up', 'cancelled', 'refunded'].includes(order.status) && (
                                <button
                                  className="btn btn-outline-danger"
                                  onClick={() => openModal('cancel', order)}
                                  title="Cancel Order"
                                >
                                  <i className="bi bi-x"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && orderDetails && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  Order #{selectedOrder.order_number} - {orderDetails.order.customer?.full_name || orderDetails.order.customer_name || 'Unknown Customer'}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => {
                    setSelectedOrder(null);
                    setOrderDetails(null);
                  }}
                ></button>
              </div>
              <div className="modal-body">
                <div className="row">
                  {/* Order Information */}
                  <div className="col-md-6">
                    <h6>Order Information</h6>
                    <table className="table table-sm">
                      <tbody>
                        <tr>
                          <td><strong>Order Number:</strong></td>
                          <td>#{orderDetails.order.order_number}</td>
                        </tr>
                        <tr>
                          <td><strong>Status:</strong></td>
                          <td>
                            <span className={`badge bg-${getStatusColor(orderDetails.order.status)}`}>
                              {getStatusText(orderDetails.order.status)}
                            </span>
                          </td>
                        </tr>
                        <tr>
                          <td><strong>Total Amount:</strong></td>
                          <td>₱{parseFloat(orderDetails.order.total_amount).toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td><strong>Pickup Date:</strong></td>
                          <td>{formatDate(orderDetails.order.pickup_date)}</td>
                        </tr>
                        <tr>
                          <td><strong>Pickup Time:</strong></td>
                          <td>{formatTime(orderDetails.order.pickup_time)}</td>
                        </tr>
                        <tr>
                          <td><strong>Pickup Location:</strong></td>
                          <td>{orderDetails.order.pickup_location}</td>
                        </tr>
                        <tr>
                          <td><strong>Created:</strong></td>
                          <td>{new Date(orderDetails.order.created_at).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Customer Information */}
                  <div className="col-md-6">
                    <h6>Customer Information</h6>
                    <div className="d-flex align-items-center mb-3">
                      {orderDetails.order.customer?.profile_picture_url ? (
                        <img
                          src={orderDetails.order.customer.profile_picture_url}
                          alt="Customer Profile"
                          className="rounded-circle me-3"
                          style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                          onError={(e) => {
                            e.target.src = 'https://via.placeholder.com/50x50?text=No+Photo';
                          }}
                        />
                      ) : (
                        <div 
                          className="rounded-circle me-3 d-flex align-items-center justify-content-center bg-light"
                          style={{ width: '50px', height: '50px' }}
                        >
                          <i className="bi bi-person-fill text-muted"></i>
                        </div>
                      )}
                      <div>
                        <h6 className="mb-0">{orderDetails.order.customer?.full_name || 'Unknown Customer'}</h6>
                        <small className="text-muted">
                          {orderDetails.order.customer?.role || 'Customer'}
                        </small>
                      </div>
                    </div>
                    <table className="table table-sm">
                      <tbody>
                        <tr>
                          <td><strong>Name:</strong></td>
                          <td>{orderDetails.order.customer?.full_name || orderDetails.order.customer_name || 'Unknown'}</td>
                        </tr>
                        <tr>
                          <td><strong>Email:</strong></td>
                          <td>{orderDetails.order.customer?.email || orderDetails.order.customer_email || 'N/A'}</td>
                        </tr>
                        <tr>
                          <td><strong>Phone:</strong></td>
                          <td>{orderDetails.order.customer?.phone || orderDetails.order.customer_phone || 'N/A'}</td>
                        </tr>
                        <tr>
                          <td><strong>Customer Since:</strong></td>
                          <td>
                            {orderDetails.order.customer?.created_at 
                              ? new Date(orderDetails.order.customer.created_at).toLocaleDateString()
                              : 'N/A'
                            }
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Order Items */}
                <div className="mt-4">
                  <h6>Order Items</h6>
                  <div className="table-responsive">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Quantity</th>
                          <th>Unit Price</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderDetails.order.order_items?.map((item, index) => (
                          <tr key={index}>
                            <td>
                              <div className="d-flex align-items-center">
                                {(item.product?.image_url || item.product_image_url) && (
                                  <img
                                    src={item.product?.image_url || item.product_image_url}
                                    alt={item.product?.name || item.product_name || 'Product'}
                                    className="me-2"
                                    style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                                    onError={(e) => {
                                      e.target.src = 'https://via.placeholder.com/40x40?text=No+Image';
                                    }}
                                  />
                                )}
                                <div>
                                  <div className="fw-bold">{item.product?.name || item.product_name || 'N/A'}</div>
                                  {(item.product?.description || item.product_description) && (
                                    <small className="text-muted">{item.product?.description || item.product_description}</small>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>{item.quantity}</td>
                            <td>₱{parseFloat(item.unit_price).toFixed(2)}</td>
                            <td>₱{parseFloat(item.total_price).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>


                {/* Notes */}
                {orderDetails.order.notes && (
                  <div className="mt-4">
                    <h6>Special Instructions</h6>
                    <div className="card">
                      <div className="card-body">
                        <p className="mb-0">{orderDetails.order.notes}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSelectedOrder(null);
                    setOrderDetails(null);
                  }}
                >
                  Close
                </button>
                
                {/* Status Update Buttons */}
                {selectedOrder.status === 'pending' && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => {
                      handleStatusUpdate(selectedOrder.id, 'confirmed');
                      setSelectedOrder({ ...selectedOrder, status: 'confirmed' });
                    }}
                  >
                    Confirm Order
                  </button>
                )}
                
                {selectedOrder.status === 'confirmed' && (
                  <button
                    type="button"
                    className="btn btn-info"
                    onClick={() => {
                      handleStatusUpdate(selectedOrder.id, 'preparing');
                      setSelectedOrder({ ...selectedOrder, status: 'preparing' });
                    }}
                  >
                    Start Preparing
                  </button>
                )}
                
                {selectedOrder.status === 'preparing' && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => {
                      handleStatusUpdate(selectedOrder.id, 'ready_for_pickup');
                      setSelectedOrder({ ...selectedOrder, status: 'ready_for_pickup' });
                    }}
                  >
                    Mark Ready
                  </button>
                )}
                
                {selectedOrder.status === 'ready_for_pickup' && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => {
                      handleStatusUpdate(selectedOrder.id, 'picked_up');
                      setSelectedOrder({ ...selectedOrder, status: 'picked_up' });
                    }}
                  >
                    Mark Picked Up
                  </button>
                )}
                
                {!['picked_up', 'cancelled', 'refunded'].includes(selectedOrder.status) && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => openModal('cancel', selectedOrder)}
                  >
                    Cancel Order
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <OrderConfirmationModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        onConfirm={handleModalConfirm}
        order={modalState.order}
        action={modalState.action}
        isLoading={modalState.isLoading}
      />

      {/* Order Details Modal */}
      {showDetailsModal && (
        <OrderDetailsModal
          order={selectedOrder}
          orderDetails={orderDetails}
          onClose={closeDetailsModal}
          onStatusUpdate={handleStatusUpdate}
          onCancel={handleCancelOrderClick}
        />
      )}

      {/* Order Cancellation Modal */}
      {showCancellationModal && (
        <OrderCancellationModal
          order={orderToCancel}
          onConfirm={confirmCancelOrder}
          onCancel={closeCancellationModal}
        />
      )}

      {/* Walk-in Product Purchase Modal */}
      {showWalkInProductModal && (
        <WalkInProductPurchase
          onClose={closeWalkInProductModal}
          onSuccess={handleProductPurchaseSuccess}
        />
      )}
    </div>
  );
};

export default ManageOrders;