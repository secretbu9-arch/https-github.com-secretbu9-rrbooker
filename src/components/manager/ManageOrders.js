// components/manager/ManageOrders.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import OrdersService from '../../services/booking/OrdersService';
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
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getTodayString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now - offset)).toISOString().split('T')[0];
    return localISOTime;
  };

  // Filters
  const [filters, setFilters] = useState({
    status: 'all',
    dateFrom: getTodayString(),
    dateTo: '',
    customerName: ''
  });

  const [activeTab, setActiveTab] = useState('today');

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

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [showWalkInProductModal, setShowWalkInProductModal] = useState(false);

  // Premium Styles
  const styles = {
    container: {
      padding: windowWidth < 576 ? '1.5rem 1rem' : '2rem 1.5rem',
      backgroundColor: '#fcfcfc',
      minHeight: '100vh',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    },
    headerCard: {
      background: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
      border: '1px solid #f0f0f0',
      marginBottom: '1.5rem',
      display: 'flex',
      flexDirection: windowWidth < 650 ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: windowWidth < 650 ? 'stretch' : 'center',
      gap: '1rem'
    },
    statCard: {
      backgroundColor: '#fff',
      padding: '1.5rem',
      borderRadius: '24px',
      border: '1px solid #eee',
      boxShadow: '0 4px 15px rgba(0,0,0,0.02)',
      height: '100%',
      transition: 'transform 0.3s ease'
    },
    filterCard: {
      backgroundColor: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      border: '1px solid #eee',
      marginBottom: '1.5rem',
      boxShadow: '0 4px 15px rgba(0,0,0,0.02)'
    },
    orderCard: {
      backgroundColor: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      border: '1px solid #eee',
      marginBottom: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden'
    },
    badge: (status) => {
      const colors = {
        pending: { bg: '#FFF3E0', text: '#E65100' },
        confirmed: { bg: '#E3F2FD', text: '#0D47A1' },
        ready_for_pickup: { bg: '#E8F5E9', text: '#1B5E20' },
        picked_up: { bg: '#F3E5F5', text: '#4A148C' },
        cancelled: { bg: '#FFEBEE', text: '#B71C1C' },
        refunded: { bg: '#ECEFF1', text: '#263238' }
      };
      const color = colors[status] || { bg: '#f5f5f5', text: '#666' };
      return {
        padding: '0.4rem 0.8rem',
        borderRadius: '10px',
        fontSize: '0.75rem',
        fontWeight: '700',
        backgroundColor: color.bg,
        color: color.text,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      };
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      fontWeight: '600',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.6rem',
      transition: 'all 0.3s'
    },
    modal: {
      backgroundColor: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(10px)',
      padding: '0',
      zIndex: 1050
    },
    modalContent: {
      borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '24px',
      border: windowWidth < 576 ? 'none' : '1px solid #eee',
      boxShadow: '0 20px 50px rgba(0,0,0,0.1)',
      marginTop: windowWidth < 576 ? 'auto' : '0'
    },
    tab: (active) => ({
      padding: '0.6rem 1.25rem',
      borderRadius: '14px',
      fontSize: '0.85rem',
      fontWeight: '700',
      cursor: 'pointer',
      transition: 'all 0.2s',
      backgroundColor: active ? '#1a1a1a' : 'transparent',
      color: active ? '#fff' : '#888',
      border: active ? 'none' : '1px solid transparent'
    })
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const today = getTodayString();
    
    switch (tab) {
      case 'today':
        setFilters(prev => ({ ...prev, dateFrom: today, dateTo: today }));
        break;
      case 'upcoming':
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        setFilters(prev => ({ ...prev, dateFrom: tomorrowStr, dateTo: '' }));
        break;
      case 'previous':
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        setFilters(prev => ({ ...prev, dateFrom: '', dateTo: yesterdayStr }));
        break;
      case 'all':
        setFilters(prev => ({ ...prev, dateFrom: '', dateTo: '' }));
        break;
      default:
        break;
    }
  };

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
      if (filters.customerName) filterParams.customerName = filters.customerName;

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

  const formatPrice = (price) => `₱${parseFloat(price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const formatDate = (dateString, style = 'short') => {
    const options = style === 'long' 
      ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  const formatTime = (timeString) => {
    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  };

  return (
    <div style={styles.container}>
      {/* Header Section */}
      <div style={styles.headerCard}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
            <i className="bi bi-bag-check me-2" style={{ color: '#5D4037' }}></i>
            Manage Orders
          </h2>
          <p className="text-muted small mb-0">Track and fulfill product sales</p>
        </div>
        <button 
          style={styles.primaryBtn} 
          className="touch-btn"
          onClick={() => setShowWalkInProductModal(true)}
        >
          <i className="bi bi-plus-lg"></i>
          WALK-IN PURCHASE
        </button>
      </div>

      {/* Quick Access Tabs */}
      <div className="d-flex gap-2 mb-4 overflow-auto pb-2" style={{ whiteSpace: 'nowrap' }}>
        <div style={styles.tab(activeTab === 'today')} onClick={() => handleTabChange('today')}>TODAY</div>
        <div style={styles.tab(activeTab === 'upcoming')} onClick={() => handleTabChange('upcoming')}>UPCOMING</div>
        <div style={styles.tab(activeTab === 'previous')} onClick={() => handleTabChange('previous')}>PREVIOUS</div>
        <div style={styles.tab(activeTab === 'all')} onClick={() => handleTabChange('all')}>VIEW ALL</div>
      </div>

      {error && (
        <div className="alert alert-danger rounded-4 border-0 shadow-sm d-flex align-items-center mb-4">
          <i className="bi bi-exclamation-circle-fill me-2"></i>
          <span className="small fw-bold">{error}</span>
          <button className="btn-close ms-auto" onClick={() => setError('')}></button>
        </div>
      )}

      {/* Stats Summary */}
      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-md-4">
            <div style={styles.statCard} className="hover-lift">
              <div className="text-muted small fw-bold text-uppercase mb-1">Total Sales</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#5D4037' }}>{formatPrice(stats.totalRevenue)}</div>
              <div className="small text-muted mt-1">From {stats.total} successful orders</div>
            </div>
          </div>
          <div className="col-md-4">
            <div style={styles.statCard} className="hover-lift">
              <div className="text-muted small fw-bold text-uppercase mb-1">Avg Ticket</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1a1a1a' }}>{formatPrice(stats.averageOrderValue)}</div>
              <div className="small text-muted mt-1">Value per transaction</div>
            </div>
          </div>
          <div className="col-md-4">
            <div style={styles.statCard} className="hover-lift">
              <div className="text-muted small fw-bold text-uppercase mb-1">Status Mix</div>
              <div className="d-flex gap-2 mt-2">
                <span className="badge rounded-pill bg-warning text-dark px-2 py-1" style={{ fontSize: '0.65rem' }}>{orders.filter(o => o.status === 'pending').length} PENDING</span>
                <span className="badge rounded-pill bg-success px-2 py-1" style={{ fontSize: '0.65rem' }}>{orders.filter(o => o.status === 'ready_for_pickup').length} READY</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Filters */}
      <div style={styles.filterCard}>
        <div className="row g-3 align-items-center">
          <div className="col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white border-end-0 rounded-start-4">
                <i className="bi bi-search text-muted"></i>
              </span>
              <input 
                type="text" 
                className="form-control border-start-0 rounded-end-4 bg-white" 
                placeholder="Search customer name..."
                value={filters.customerName}
                onChange={(e) => setFilters({ ...filters, customerName: e.target.value })}
              />
            </div>
          </div>
          <div className="col-md-3">
            <select 
              className="form-select form-select-sm rounded-4" 
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="ready_for_pickup">Ready for Pickup</option>
              <option value="picked_up">Picked Up</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="col-md-3">
            <input 
              type="date" 
              className="form-control form-control-sm rounded-4"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
          </div>
          <div className="col-md-2">
            <button 
              className="btn btn-light btn-sm w-100 rounded-4 fw-bold"
              onClick={() => setFilters({ status: 'all', dateFrom: '', dateTo: '', customerName: '' })}
            >
              RESET
            </button>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="orders-container">
        {loading ? (
          <div className="text-center py-5"><div className="spinner-border text-dark"></div></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-5 bg-white rounded-5 border">
            <i className="bi bi-bag-x fs-1 text-muted opacity-25"></i>
            <p className="text-muted mt-3 fw-bold">No orders found matching your criteria</p>
          </div>
        ) : (
          <div className="row g-3">
            {orders.map(order => (
              <div key={order.id} className="col-12">
                <div 
                  style={styles.orderCard} 
                  className="order-card-hover"
                >
                  <div className="row g-0 align-items-center">
                    <div className="col-12 col-md-9" onClick={() => handleViewDetails(order)} style={{ cursor: 'pointer' }}>
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <div>
                          <span className="text-muted small fw-bold">#{order.order_number}</span>
                          <h5 className="fw-800 m-0 mb-2">{order.customer?.full_name || 'Walk-in Guest'}</h5>
                          <div className="d-flex flex-column gap-1">
                            <span className="small text-muted" style={{ fontSize: '0.75rem' }}>
                              <i className="bi bi-calendar-plus me-1"></i>
                              Order Date: {formatDate(order.created_at, 'long')}
                            </span>
                            <span className="small fw-bold" style={{ color: '#5D4037', fontSize: '0.8rem' }}>
                              <i className="bi bi-calendar-check me-1"></i>
                              Pickup Date: {formatDate(order.pickup_date, 'long')} at {order.pickup_time ? formatTime(order.pickup_time) : 'TBD'}
                            </span>
                          </div>
                        </div>
                        <span style={styles.badge(order.status)}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between align-items-end pt-3 border-top">
                        <div>
                          <div className="small text-muted mb-1" style={{ fontSize: '0.7rem' }}>ITEMS</div>
                          <div className="d-flex gap-1 overflow-auto pb-1" style={{ maxWidth: '400px' }}>
                            {order.order_items?.map((item, idx) => (
                              <div key={idx} className="bg-light px-2 py-1 rounded-3 small fw-bold" style={{ fontSize: '0.75rem' }}>
                                {item.quantity}x {item.product?.name.split(' ')[0]}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="small text-muted" style={{ fontSize: '0.7rem' }}>TOTAL</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#5D4037' }}>{formatPrice(order.total_amount)}</div>
                        </div>
                      </div>
                    </div>

                    <div className="col-12 col-md-3 border-start-md ps-md-3 mt-3 mt-md-0">
                      <div className="d-flex flex-column gap-1">
                        <div className="text-muted fw-bold mb-1" style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>QUICK ACTION</div>
                        {order.status === 'pending' && (
                          <button 
                            className="btn btn-sm btn-primary rounded-3 fw-bold touch-btn"
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, 'confirmed'); }}
                            style={{ backgroundColor: '#0D47A1', border: 'none', padding: '0.4rem', fontSize: '0.75rem' }}
                          >
                            <i className="bi bi-check-circle me-1"></i> CONFIRM
                          </button>
                        )}
                        {order.status === 'confirmed' && (
                          <button 
                            className="btn btn-sm btn-success rounded-3 fw-bold touch-btn"
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, 'ready_for_pickup'); }}
                            style={{ backgroundColor: '#1B5E20', border: 'none', padding: '0.4rem', fontSize: '0.75rem' }}
                          >
                            <i className="bi bi-box-seam me-1"></i> READY
                          </button>
                        )}
                        {order.status === 'ready_for_pickup' && (
                          <button 
                            className="btn btn-sm btn-dark rounded-3 fw-bold touch-btn"
                            onClick={(e) => { e.stopPropagation(); handleStatusUpdate(order.id, 'picked_up'); }}
                            style={{ backgroundColor: '#4A148C', border: 'none', padding: '0.4rem', fontSize: '0.75rem' }}
                          >
                            <i className="bi bi-bag-check me-1"></i> PICKED UP
                          </button>
                        )}
                        <button 
                          className="btn btn-sm btn-light rounded-3 fw-bold touch-btn text-muted"
                          onClick={() => handleViewDetails(order)}
                          style={{ padding: '0.4rem', fontSize: '0.75rem' }}
                        >
                          <i className="bi bi-eye me-1"></i> DETAILS
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <OrderConfirmationModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        onConfirm={handleModalConfirm}
        order={modalState.order}
        action={modalState.action}
        isLoading={modalState.isLoading}
      />

      {showDetailsModal && (
        <OrderDetailsModal
          order={selectedOrder}
          orderDetails={orderDetails}
          onClose={closeDetailsModal}
          onStatusUpdate={handleStatusUpdate}
          onCancel={handleCancelOrderClick}
        />
      )}

      {showCancellationModal && (
        <OrderCancellationModal
          order={orderToCancel}
          onConfirm={confirmCancelOrder}
          onCancel={closeCancellationModal}
        />
      )}

      {showWalkInProductModal && (
        <WalkInProductPurchase
          onClose={() => setShowWalkInProductModal(false)}
          onSuccess={handleProductPurchaseSuccess}
        />
      )}

      <style>{`
        .order-card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0,0,0,0.06) !important;
          border-color: #5D403744 !important;
        }
        .order-card-hover:active {
          transform: scale(0.98);
        }
        .hover-lift:hover { transform: translateY(-3px); }
        .fw-800 { font-weight: 800; }
        .touch-btn:active { transform: scale(0.9); }
        @media (max-width: 575.98px) {
          .modal-dialog {
            display: flex !important;
            align-items: flex-end !important;
            margin: 0 !important;
            height: 100% !important;
          }
          .modal-content {
            border-radius: 32px 32px 0 0 !important;
            animation: slideUp 0.4s cubic-bezier(0, 0, 0.2, 1);
          }
        }
        @media (min-width: 768px) {
          .border-start-md {
            border-left: 1px solid #f0f0f0 !important;
          }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default ManageOrders;
