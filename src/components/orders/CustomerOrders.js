import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import OrderConfirmationModal from './OrderConfirmationModal';
import CustomerOrderDetailsModal from './CustomerOrderDetailsModal';
import CustomerOrderCancellationModal from './CustomerOrderCancellationModal';

const CustomerOrders = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
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
          )
        `)
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
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
      const { default: ordersService } = await import('../../services/OrdersService');
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

  const confirmCancelOrder = async () => {
    if (!orderToCancel) return;

    try {
      const { default: ordersService } = await import('../../services/OrdersService');
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
      case 'confirmed': return 'info';
      case 'preparing': return 'primary';
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
      case 'preparing': return 'Preparing';
      case 'ready_for_pickup': return 'Ready for Pickup';
      case 'picked_up': return 'Picked Up';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

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
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2>My Orders</h2>
            <Link to="/products" className="btn btn-primary">
              <i className="bi bi-plus-circle me-2"></i>
              New Order
            </Link>
          </div>

          {/* Filter Tabs */}
          <div className="card mb-4">
            <div className="card-body">
              <ul className="nav nav-pills">
                <li className="nav-item">
                  <button
                    className={`nav-link ${filter === 'all' ? 'active' : ''}`}
                    onClick={() => setFilter('all')}
                  >
                    All Orders ({orders.length})
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${filter === 'pending' ? 'active' : ''}`}
                    onClick={() => setFilter('pending')}
                  >
                    Pending ({orders.filter(o => o.status === 'pending').length})
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${filter === 'preparing' ? 'active' : ''}`}
                    onClick={() => setFilter('preparing')}
                  >
                    Preparing ({orders.filter(o => o.status === 'preparing').length})
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${filter === 'ready_for_pickup' ? 'active' : ''}`}
                    onClick={() => setFilter('ready_for_pickup')}
                  >
                    Ready ({orders.filter(o => o.status === 'ready_for_pickup').length})
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${filter === 'picked_up' ? 'active' : ''}`}
                    onClick={() => setFilter('picked_up')}
                  >
                    Completed ({orders.filter(o => o.status === 'picked_up').length})
                  </button>
                </li>
              </ul>
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
            <div className="row">
              {filteredOrders.map((order) => (
                <div key={order.id} className="col-md-6 col-lg-4 mb-4">
                  <div className="card h-100">
                    <div className="card-header d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">
                        Order #{order.order_number || order.id.slice(0, 8)}
                      </h6>
                      <span className={`badge bg-${getStatusColor(order.status)}`}>
                        {getStatusText(order.status)}
                      </span>
                    </div>
                    <div className="card-body">
                      <div className="mb-3">
                        <h6>Order Details</h6>
                        <p className="text-muted mb-1">
                          <i className="bi bi-calendar me-2"></i>
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-muted mb-1">
                          <i className="bi bi-clock me-2"></i>
                          {new Date(order.created_at).toLocaleTimeString()}
                        </p>
                        <p className="text-muted">
                          <i className="bi bi-cash me-2"></i>
                          <span className="currency-amount">₱{Number(order.total_amount || 0).toFixed(2)}</span>
                        </p>
                      </div>

                      {order.pickup_date && (
                        <div className="mb-3">
                          <h6>Pickup Information</h6>
                          <p className="text-muted mb-1">
                            <i className="bi bi-calendar-check me-2"></i>
                            {new Date(order.pickup_date).toLocaleDateString()}
                          </p>
                          {order.pickup_time && (
                            <p className="text-muted mb-1">
                              <i className="bi bi-clock me-2"></i>
                              {order.pickup_time}
                            </p>
                          )}
                          <p className="text-muted">
                            <i className="bi bi-geo-alt me-2"></i>
                            {order.pickup_location || 'R&R Barber Shop'}
                          </p>
                        </div>
                      )}

                      {order.notes && (
                        <div className="mb-3">
                          <h6>Notes</h6>
                          <p className="text-muted">{order.notes}</p>
                        </div>
                      )}

                      {order.cancellation_reason && (
                        <div className="mb-3">
                          <h6>Cancellation Reason</h6>
                          <p className="text-danger">{order.cancellation_reason}</p>
                        </div>
                      )}
                    </div>
                    <div className="card-footer">
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => handleViewDetails(order)}
                        >
                          <i className="bi bi-eye me-1"></i>
                          View Details
                        </button>
                        
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
