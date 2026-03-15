import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import CustomerOrderDetailsModal from './CustomerOrderDetailsModal';
import CustomerOrderCancellationModal from './CustomerOrderCancellationModal';
import { useProducts } from '../hooks/useProducts';
import logoImage from '../../assets/images/raf-rok-logo.png';
import LoadingSpinner from '../common/LoadingSpinner';
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
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
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
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('Failed to load orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = (order) => {
    if (order.status === 'pending') {
      setOrderToCancel(order);
      setShowCancellationModal(true);
    }
  };

  const handleViewDetails = async (order) => {
    setSelectedOrder(order);
    try {
      const { data: orderItems, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:product_id (id, name, description, image_url, category)
        `)
        .eq('order_id', order.id);

      if (error) throw error;
      setOrderDetails({ items: orderItems || [] });
      setShowDetailsModal(true);
    } catch (err) {
      setError('Failed to load details.');
    }
  };

  const handleConfirmCancellation = async (orderId, reason) => {
    try {
      const { default: ordersService } = await import('../../services/booking/OrdersService');
      await ordersService.cancelOrder(orderId, reason, 'customer');
      await fetchOrders();
      setShowCancellationModal(false);
    } catch (error) {
      setError('Failed to cancel order.');
    }
  };

  const handleBuyAgain = async (order) => {
    try {
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('*')
        .in('id', order.order_items.map(item => item.product_id).filter(Boolean));

      if (productsError) throw productsError;

      const productMap = {};
      products.forEach(p => productMap[p.id] = p);

      let added = 0;
      for (const item of order.order_items) {
        const product = productMap[item.product_id];
        // Check availability logic directly since this is a direct supabase query
        if (product && product.is_active && Number(product.stock_quantity) > 0) {
          // addToCart is NOT an async function, but we are awaiting it here
          await addToCart(product, item.quantity);
          added++;
        }
      }
      if (added > 0) navigate('/products');
      else setError('Some or all items are no longer available.');
    } catch (err) {
        setError('Reorder failed.');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'pending': return 'bg-light text-dark border';
      case 'confirmed': return 'bg-dark text-white';
      case 'ready_for_pickup': return 'bg-success text-white';
      case 'picked_up': return 'bg-light text-muted';
      case 'cancelled': return 'bg-danger text-white';
      default: return 'bg-secondary text-white';
    }
  };

  const filteredOrders = orders.filter(order => {
    if (filter !== 'all' && order.status !== filter) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const num = (order.order_number || order.id.slice(0, 8)).toLowerCase();
      if (!num.includes(query)) return false;
    }
    return true;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="container-fluid py-4 min-vh-100" style={{ background: '#fdfdfd', color: '#1a1a1a', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap');
        :root {
          --premium-brown: #3d2c24;
          --border-subtle: rgba(0,0,0,0.06);
        }
        .order-card {
          background: #fff;
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          transition: all 0.3s ease;
          overflow: hidden;
        }
        .order-card:hover {
          box-shadow: 0 10px 30px rgba(0,0,0,0.05);
          border-color: var(--premium-brown);
        }
        .order-header {
          border-bottom: 1px solid var(--border-subtle);
          padding: 20px;
        }
        .animate-up { animation: fadeInUp 0.5s ease forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        .filter-chip {
          padding: 8px 20px;
          border-radius: 50px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid var(--border-subtle);
          background: #fff;
          color: #666;
          white-space: nowrap;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }
        .filter-chip:active {
          transform: scale(0.95);
        }
        .filter-chip.active {
          background: #1a1a1a;
          color: #fff;
          border-color: #1a1a1a;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .filter-chip:hover:not(.active) {
          border-color: #999;
          color: #1a1a1a;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { 
          -ms-overflow-style: none; 
          scrollbar-width: none; 
          -webkit-overflow-scrolling: touch; 
          scroll-behavior: smooth;
        }
      `}</style>

      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center mb-4 animate-up gap-3">
        <div className="d-flex align-items-center gap-3">
          <div className="bg-white rounded-circle p-2 d-flex align-items-center justify-content-center shadow-sm flex-shrink-0" style={{ width: '50px', height: '50px', border: '1px solid #eee' }}>
            <img src={logoImage} alt="Raf & Rox" style={{ width: '35px' }} />
          </div>
          <div className="flex-grow-1">
            <h3 className="mb-0 fw-bold fs-4 fs-md-3">Order History</h3>
            <p className="text-muted small mb-0">Track and manage your style essentials</p>
          </div>
        </div>
        <Link to="/products" className="btn btn-dark rounded-pill px-4 py-2 fw-bold small flex-shrink-0 mt-2 mt-sm-0" style={{ backgroundColor: '#1a1a1a', color: '#fff', whiteSpace: 'nowrap' }}>Shop More</Link>
      </div>

      {/* Search & Filters */}
      <div className="mb-4 d-flex flex-column gap-3 animate-up" style={{ animationDelay: '0.1s' }}>
        <div className="d-flex justify-content-between align-items-center">
          <div className="border rounded-pill px-3 py-2 bg-white d-flex align-items-center w-100" style={{ maxWidth: '400px' }}>
            <i className="bi bi-search text-muted me-2"></i>
            <input 
              type="text" 
              className="border-0 shadow-none bg-transparent w-100 small" 
              placeholder="Search order ID..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ outline: 'none' }}
            />
          </div>
        </div>

        <div className="d-flex gap-2 flex-nowrap overflow-auto scrollbar-hide pb-2 px-1" style={{ maxWidth: '100%' }}>
          {['all', 'pending', 'confirmed', 'ready_for_pickup', 'picked_up'].map(s => (
            <button 
              key={s} 
              className={`filter-chip flex-shrink-0 ${filter === s ? 'active' : ''}`}
              onClick={() => setFilter(s)}
            >
              {s === 'all' ? 'ALL ORDERS' : s.replace(/_/g, ' ').toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div className="row g-4 animate-up" style={{ animationDelay: '0.2s' }}>
        {filteredOrders.map(order => (
          <div key={order.id} className="col-12 col-md-6 col-lg-4 col-xl-4 d-flex align-items-stretch">
            <div className="order-card w-100 d-flex flex-column">
              <div className="order-header d-flex justify-content-between align-items-center">
                <div>
                  <span className="text-muted extra-small fw-bold uppercase">ORDER #{order.order_number || order.id.slice(0,8)}</span>
                  <h6 className="mb-0 mt-1 fw-bold">{new Date(order.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</h6>
                </div>
                <span className={`badge rounded-pill ${getStatusBadgeClass(order.status)} px-3 py-2 fw-bold`} style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                  {order.status.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              
              <div className="p-4 flex-grow-1">
                <div className="d-flex flex-column gap-3 mb-4">
                  {order.order_items.map(item => (
                    <div key={item.id} className="d-flex align-items-center gap-3">
                      <img src={item.product_image_url || 'https://via.placeholder.com/40x40'} alt={item.product_name} className="rounded-2" style={{ width: '45px', height: '45px', objectFit: 'cover' }} />
                      <div className="flex-grow-1">
                        <h6 className="small fw-bold mb-0">{item.product_name}</h6>
                        <span className="extra-small text-muted">{item.quantity} unit{item.quantity > 1 ? 's' : ''}</span>
                      </div>
                      <span className="fw-bold small">{Number(item.total_price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-4 bg-light bg-opacity-50 border border-white">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-muted small">Pickup Appointment</span>
                    <span className="fw-bold small">{order.pickup_date} at {order.pickup_time}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center pt-2 border-top">
                    <span className="fw-bold">Total Paid</span>
                    <span className="fw-bold fs-5 text-dark">₱{Number(order.total_amount).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-light bg-opacity-25 d-flex gap-2 justify-content-end flex-wrap">
                <button className="btn btn-white border rounded-pill px-3 py-2 py-md-1 btn-sm fw-bold flex-grow-1 flex-md-grow-0" onClick={() => handleViewDetails(order)}>Details</button>
                {order.status === 'pending' && (
                  <button className="btn btn-outline-danger rounded-pill px-3 py-2 py-md-1 btn-sm fw-bold flex-grow-1 flex-md-grow-0" onClick={() => handleCancelOrder(order)}>Cancel</button>
                )}
                {(order.status === 'picked_up' || order.status === 'cancelled') && (
                  <button className="btn btn-dark rounded-pill px-3 py-2 py-md-1 btn-sm fw-bold flex-grow-1 flex-md-grow-0" onClick={() => handleBuyAgain(order)} style={{ backgroundColor: '#1a1a1a', color: '#fff' }}>Buy Again</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredOrders.length === 0 && (
          <div className="col-12 text-center py-5">
            <i className="bi bi-inbox display-1 text-muted opacity-25"></i>
            <h5 className="mt-3 text-muted">No orders found</h5>
          </div>
        )}
      </div>

      {/* Modals */}
      {showDetailsModal && selectedOrder && (
        <CustomerOrderDetailsModal 
          show={showDetailsModal} 
          onClose={() => setShowDetailsModal(false)} 
          order={selectedOrder} 
          orderDetails={orderDetails}
        />
      )}
      {showCancellationModal && orderToCancel && (
        <CustomerOrderCancellationModal
          show={showCancellationModal}
          onCancel={() => setShowCancellationModal(false)}
          order={orderToCancel}
          onConfirm={handleConfirmCancellation}
        />
      )}
    </div>
  );
};

export default CustomerOrders;
