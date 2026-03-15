import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useProducts } from '../hooks/useProducts';
import { formatPrice } from '../utils/helpers';
import LoadingSpinner from '../common/LoadingSpinner';
import { apiService } from '../../services/core/ApiService';
import { useAuth } from '../hooks/useAuth';
import ordersService from '../../services/booking/OrdersService';
import logoImage from '../../assets/images/raf-rok-logo.png';

const IntegratedShop = () => {
  const {
    addToCart,
    cart,
    updateCartItem,
    removeFromCart,
    clearCart,
    calculateCartTotal,
    loading: cartLoading
  } = useProducts();

  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [priceRange, setPriceRange] = useState('all');
  const [stockStatus, setStockStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [showFilters, setShowFilters] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState('info');
  const [showMobileCart, setShowMobileCart] = useState(false);
  const [hasOngoingOrder, setHasOngoingOrder] = useState(false);

  const [pickupDetails, setPickupDetails] = useState({
    pickupDate: new Date().toISOString().split('T')[0],
    pickupTime: '',
    notes: '',
    customerName: '',
    customerPhone: '',
    customerEmail: ''
  });

  useEffect(() => {
    fetchProducts();
    autoFillCustomerDetails();
    checkOngoingOrders();
  }, [user]);

  const checkOngoingOrders = async () => {
    if (user) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, status')
          .eq('customer_id', user.id)
          .in('status', ['pending', 'confirmed', 'ready_for_pickup']);
        
        if (!error && data && data.length > 0) {
          setHasOngoingOrder(true);
        } else {
          setHasOngoingOrder(false);
        }
      } catch (err) {
        console.error("Error checking ongoing orders:", err);
      }
    }
  };

  const autoFillCustomerDetails = () => {
    const today = new Date().toISOString().split('T')[0];
    if (user) {
      setPickupDetails(prev => ({
        ...prev,
        pickupDate: prev.pickupDate || today,
        customerName: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        customerEmail: user.email || '',
        customerPhone: user.user_metadata?.phone || ''
      }));
    } else {
      setPickupDetails(prev => ({
        ...prev,
        pickupDate: prev.pickupDate || today
      }));
    }
  };

  const showNotification = (message, type = 'info') => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotificationModal(true);
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await apiService.getProducts();
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      setError('Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async (product) => {
    try {
      if (!product.is_available) {
        showNotification('This product is currently out of stock.', 'warning');
        return;
      }
      const currentCartItem = cart.find(item => item.id === product.id);
      const currentQuantity = currentCartItem ? currentCartItem.quantity : 0;
      if (currentQuantity >= product.stock_quantity) {
        showNotification(`Only ${product.stock_quantity} units available in stock.`, 'warning');
        return;
      }
      await addToCart(product, 1);
      showNotification(`${product.name} added to cart!`, 'success');
    } catch (error) {
      showNotification('Failed to add item to cart.', 'error');
    }
  };

  const handleQuantityChange = (productId, newQuantity) => {
    if (newQuantity < 1) return;
    const product = products.find(p => p.id === productId);
    if (product && newQuantity > product.stock_quantity) {
      showNotification(`Only ${product.stock_quantity} units available in stock.`, 'warning');
      return;
    }
    updateCartItem(productId, newQuantity);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'customerPhone') {
      let digits = value.replace(/\D/g, '');
      if (digits.length > 10) digits = digits.substring(0, 10);
      const formatted = digits.length > 0 ? `+63${digits}` : '';
      setPickupDetails(prev => ({ ...prev, [name]: formatted }));
    } else {
      setPickupDetails(prev => ({ ...prev, [name]: value }));
    }
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!pickupDetails.pickupDate || !pickupDetails.pickupTime) {
      setOrderError('Please select pickup date and time.');
      return;
    }
    try {
      setOrderLoading(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('User not authenticated');

      const orderData = {
        items: cart.map(item => ({
          productId: item.id,
          productName: item.name,
          unitPrice: item.price,
          quantity: item.quantity,
          totalPrice: item.price * item.quantity,
          productDescription: item.description || '',
          productImageUrl: item.image_url || ''
        })),
        totalAmount: calculateCartTotal(),
        pickupDate: pickupDetails.pickupDate,
        pickupTime: pickupDetails.pickupTime,
        pickupLocation: 'R&R Barber Shop',
        notes: pickupDetails.notes
      };

      const customerData = {
        id: currentUser.id,
        name: pickupDetails.customerName,
        phone: pickupDetails.customerPhone,
        email: pickupDetails.customerEmail
      };

      const order = await ordersService.createOrder(orderData, customerData);
      if (order) {
        clearCart();
        setOrderSuccess(true);
        setShowPickupModal(false);
        showNotification('Order placed successfully!', 'success');
        setTimeout(() => navigate('/orders'), 2000);
      }
    } catch (error) {
      setOrderError('Failed to create order.');
    } finally {
      setOrderLoading(false);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    let matchesPrice = true;
    if (priceRange !== 'all') {
      const price = parseFloat(product.price);
      if (priceRange === 'under-500') matchesPrice = price < 500;
      else if (priceRange === '500-1000') matchesPrice = price >= 500 && price <= 1000;
      else if (priceRange === '1000-2000') matchesPrice = price > 1000 && price <= 2000;
      else if (priceRange === 'over-2000') matchesPrice = price > 2000;
    }
    let matchesStock = true;
    if (stockStatus !== 'all') {
      if (stockStatus === 'in-stock') matchesStock = product.stock_quantity > 0;
      else if (stockStatus === 'low-stock') matchesStock = product.stock_quantity > 0 && product.stock_quantity <= 10;
      else if (stockStatus === 'out-of-stock') matchesStock = product.stock_quantity === 0;
    }
    return matchesSearch && matchesCategory && matchesPrice && matchesStock;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-low') return a.price - b.price;
    if (sortBy === 'price-high') return b.price - a.price;
    if (sortBy === 'newest') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    return a.name.localeCompare(b.name);
  });

  // Removed: Early return that blocks LCP element render during API fetch
  // if (loading) return <LoadingSpinner />;

  return (
    <div className="container-fluid py-4 min-vh-100" style={{ background: '#fdfdfd', color: '#1a1a1a', fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        :root {
          --premium-brown: #3d2c24;
          --premium-brown-light: #5d4a41;
          --bg-card: #ffffff;
          --border-subtle: rgba(0,0,0,0.06);
          --text-muted: #666666;
        }
        .shop-header { animation: fadeInDown 0.6s ease; }
        .product-card { 
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }
        .product-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 12px 30px rgba(0,0,0,0.08);
          border-color: var(--premium-brown);
        }
        .search-pill {
          background: #f5f5f5;
          border-radius: 50px;
          padding: 5px 20px;
          border: 1px solid transparent;
          transition: all 0.2s;
        }
        .search-pill:focus-within {
          background: #fff;
          border-color: var(--premium-brown);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .filter-chip {
          padding: 6px 16px;
          border-radius: 50px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid var(--border-subtle);
          background: #fff;
        }
        .filter-chip.active {
          background: var(--premium-brown);
          color: #fff;
          border-color: var(--premium-brown);
        }
        .cart-sticky {
          position: sticky;
          top: 20px;
          background: #fff;
          border: 1px solid var(--border-subtle);
          border-radius: 24px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.04);
        }
        .premium-btn {
          background: var(--premium-brown);
          color: #fff;
          border: none;
          border-radius: 12px;
          padding: 12px;
          font-weight: 600;
          transition: all 0.2s;
        }
        .premium-btn:hover:not(:disabled) {
          background: #000;
          transform: scale(1.02);
        }
        .badge-stock {
          padding: 4px 10px;
          border-radius: 50px;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        .animate-up { animation: fadeInUp 0.5s ease forwards; }
        .skeleton-box {
          background: linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%);
          background-size: 200% 100%;
          animation: skeleton-loading 1.5s infinite;
          border-radius: 12px;
        }
        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .no-anim { animation: none !important; opacity: 1 !important; transform: none !important; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <div className="shop-header d-flex justify-content-between align-items-center mb-5">
        <div className="d-flex align-items-center gap-3">
          <div className="bg-white rounded-circle p-2 d-flex align-items-center justify-content-center shadow-sm" style={{ width: '50px', height: '50px', border: '1px solid #eee' }}>
            <img 
              src={logoImage} 
              alt="Raf & Rox" 
              style={{ width: '35px' }} 
              fetchpriority="high"
              loading="eager"
            />
          </div>
          <div>
            <h3 className="mb-0 fw-bold">Style Shop</h3>
            <p className="text-muted small mb-0">Premium grooming essentials for your look</p>
          </div>
        </div>
        <Link to="/customer-dashboard" className="btn btn-outline-dark rounded-pill px-4 fw-bold small">Dashboard</Link>
      </div>

      <div className="row g-4">
        {/* Main Shop Area */}
        <div className="col-lg-8 col-xl-9">
          {/* Controls */}
          <div className="mb-4 d-flex flex-wrap gap-3 align-items-center">
            <div className="search-pill d-flex align-items-center flex-grow-1" style={{ maxWidth: '400px' }}>
              <i className="bi bi-search text-muted me-2"></i>
              <input
                type="text"
                className="form-control border-0 bg-transparent shadow-none p-0"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select className="form-select border-0 bg-light rounded-pill shadow-none px-4" style={{ width: 'auto' }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name">Sort by Name</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="newest">Newest First</option>
            </select>
          </div>

          {/* Categories */}
          <div className="d-flex gap-2 mb-4 overflow-auto pb-2 scrollbar-hide" style={{ whiteSpace: 'nowrap' }}>
            {['all', 'Hair Care', 'Styling', 'Tools', 'Beard Care'].map(cat => (
              <div
                key={cat}
                className={`filter-chip flex-shrink-0 ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'all' ? 'All Products' : cat}
              </div>
            ))}
          </div>

          {/* Product Grid - Improved for LCP: Show loading state here instead of blocking entire page */}
          <div className="row g-3 g-md-4">
            {loading ? (
              [1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="col-6 col-md-4 col-xl-3">
                  <div className="product-card h-100 p-3" style={{ opacity: 0.6 }}>
                    <div className="skeleton-box mb-3" style={{ height: '200px' }}></div>
                    <div className="skeleton-box mb-2" style={{ height: '20px', width: '80%' }}></div>
                    <div className="skeleton-box mb-3" style={{ height: '15px', width: '60%' }}></div>
                    <div className="d-flex justify-content-between">
                      <div className="skeleton-box" style={{ height: '25px', width: '40%' }}></div>
                      <div className="skeleton-box rounded-circle" style={{ height: '36px', width: '36px' }}></div>
                    </div>
                  </div>
                </div>
              ))
            ) : sortedProducts.length > 0 ? (
              sortedProducts.map((product, index) => (
                <div key={product.id} className={`col-6 col-md-4 col-xl-3 ${index < 4 ? 'no-anim' : 'animate-up'}`} style={{ animationDelay: `${(index - 4) * 0.1}s` }}>
                  <div className="product-card h-100 d-flex flex-column">
                    <div className="position-relative">
                      <img
                        src={product.image_url || 'https://via.placeholder.com/300x300?text=Product'}
                        className="w-100 object-fit-cover"
                        style={{ height: '220px' }}
                        alt={product.name}
                        loading={index < 4 ? "eager" : "lazy"}
                        fetchpriority={index < 4 ? "high" : "auto"}
                      />
                      <div className="position-absolute top-0 end-0 p-3">
                        <span className={`badge-stock ${product.stock_quantity > 0 ? 'bg-white text-dark shadow-sm' : 'bg-danger text-white'}`}>
                          {product.stock_quantity > 0 ? `${product.stock_quantity} IN STOCK` : 'OUT OF STOCK'}
                        </span>
                      </div>
                    </div>
                    <div className="p-3 flex-grow-1 d-flex flex-column">
                      <h6 className="fw-bold text-dark mb-1">{product.name}</h6>
                      <p className="text-muted extra-small mb-3 line-clamp-2">{product.description}</p>
                      <div className="mt-auto d-flex align-items-center justify-content-between">
                        <span className="fw-bold fs-5">{formatPrice(product.price)}</span>
                        <button
                          className="btn btn-dark rounded-circle p-0 d-flex align-items-center justify-content-center shadow-sm"
                          style={{ width: '36px', height: '36px' }}
                          onClick={() => handleAddToCart(product)}
                          disabled={!product.is_available}
                        >
                          <i className="bi bi-plus-lg"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-12 text-center py-5">
                <i className="bi bi-search display-1 text-muted opacity-25"></i>
                <h5 className="mt-3 text-muted">No products found for this criteria</h5>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Cart - Hidden on Mobile */}
        <div className="col-lg-4 col-xl-3 d-none d-lg-block">
          <div className="cart-sticky p-4 shadow-sm" style={{ position: 'sticky', top: '100px', zIndex: 10 }}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h5 className="mb-0 fw-bold">Your Bag</h5>
              <span className="badge rounded-pill bg-dark">{cart.length}</span>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-5">
                <i className="bi bi-cart3 display-4 text-muted opacity-25 mb-3"></i>
                <p className="text-muted small">Your cart is empty</p>
              </div>
            ) : (
              <>
                <div className="cart-items mb-4 overflow-auto" style={{ maxHeight: '400px' }}>
                  {cart.map(item => (
                    <div key={item.id} className="d-flex gap-3 align-items-center mb-3 pb-3 border-bottom border-light">
                      <img src={item.image_url || 'https://via.placeholder.com/50x50'} alt={item.name} className="rounded-3" style={{ width: '50px', height: '50px', objectFit: 'cover' }} />
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between">
                          <h6 className="small fw-bold mb-0 text-dark">{item.name}</h6>
                          <button className="btn btn-link p-0 text-danger" onClick={() => removeFromCart(item.id)}>
                            <i className="bi bi-x-circle"></i>
                          </button>
                        </div>
                        <div className="d-flex justify-content-between align-items-end">
                          <span className="extra-small text-muted">{item.quantity} × {formatPrice(item.price)}</span>
                          <div className="d-flex align-items-center gap-2">
                            <button className="btn btn-light btn-sm rounded-circle p-0" style={{ width: '20px', height: '20px' }} onClick={() => handleQuantityChange(item.id, item.quantity - 1)}>-</button>
                            <span className="small fw-bold">{item.quantity}</span>
                            <button className="btn btn-light btn-sm rounded-circle p-0" style={{ width: '20px', height: '20px' }} onClick={() => handleQuantityChange(item.id, item.quantity + 1)}>+</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2">
                  <div className="d-flex justify-content-between mb-4">
                    <span className="text-muted">Total Amount</span>
                    <span className="fw-bold fs-5">{formatPrice(calculateCartTotal())}</span>
                  </div>
                  <button className="premium-btn w-100 mb-2" onClick={() => {
                    if (hasOngoingOrder) {
                      showNotification('You have an ongoing order. Please wait until it is finished before placing a new one.', 'warning');
                    } else {
                      setShowPickupModal(true);
                    }
                  }}>Checkout</button>
                  <button className="btn btn-link w-100 text-muted extra-small" onClick={clearCart}>Clear All</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Spacer for bottom floating cart */}
      {cart.length > 0 && <div style={{ height: '90px' }} className="d-lg-none"></div>}

      {/* Mobile Floating Cart Button */}
      {cart.length > 0 && !showMobileCart && (
        <div className="position-fixed d-lg-none" style={{ bottom: '20px', left: '16px', right: '16px', zIndex: 1040, animation: 'fadeInUp 0.3s ease' }}>
          <button className="premium-btn w-100 d-flex justify-content-between align-items-center shadow-lg" onClick={() => setShowMobileCart(true)} style={{ padding: '16px 24px', borderRadius: '20px' }}>
            <div className="d-flex align-items-center gap-3">
              <div className="position-relative">
                <i className="bi bi-bag fs-5"></i>
                <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-2 border-dark" style={{ fontSize: '0.65rem' }}>{cart.length}</span>
              </div>
              <span className="fw-bold fs-6">View Bag</span>
            </div>
            <span className="fw-bold fs-5">{formatPrice(calculateCartTotal())}</span>
          </button>
        </div>
      )}

      {/* Mobile Cart Modal */}
      {showMobileCart && (
        <div className="modal show d-block d-lg-none" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1060 }} onClick={() => setShowMobileCart(false)}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable h-100 m-0" style={{ alignItems: 'flex-end' }}>
            <div className="modal-content border-0 w-100" style={{ borderRadius: '32px 32px 0 0', height: '85vh', animation: 'slideUp 0.3s ease-out' }} onClick={e => e.stopPropagation()}>
              <div className="p-4 bg-white d-flex flex-column h-100">
                <div className="d-flex justify-content-center mb-3">
                  <div style={{ width: '40px', height: '5px', backgroundColor: '#e0e0e0', borderRadius: '5px' }}></div>
                </div>
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h4 className="fw-bold mb-0">Your Bag</h4>
                  <button className="btn-close" onClick={() => setShowMobileCart(false)}></button>
                </div>

                {cart.length === 0 ? (
                  <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-muted">
                    <i className="bi bi-bag-x display-1 mb-3 opacity-25"></i>
                    <p>Your cart is empty.</p>
                  </div>
                ) : (
                  <div className="cart-items flex-grow-1 overflow-auto px-1">
                    {cart.map(item => (
                      <div key={item.id} className="d-flex gap-3 align-items-center mb-4 pb-3 border-bottom border-light">
                        <img src={item.image_url || 'https://via.placeholder.com/80x80'} alt={item.name} className="rounded-4" style={{ width: '70px', height: '70px', objectFit: 'cover' }} />
                        <div className="flex-grow-1 d-flex flex-column justify-content-center">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <h6 className="fw-bold mb-0 text-dark pe-3" style={{ fontSize: '0.95rem', lineHeight: '1.2' }}>{item.name}</h6>
                            <button className="btn btn-link p-0 text-danger ms-auto flex-shrink-0 d-flex align-items-center" onClick={() => removeFromCart(item.id)}>
                              <i className="bi bi-trash fs-5"></i>
                            </button>
                          </div>
                          <div className="d-flex justify-content-between align-items-center mt-1">
                            <div className="d-flex align-items-center gap-2 bg-light rounded-pill p-1 border">
                              <button className="btn btn-sm btn-white rounded-circle shadow-sm d-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px', padding: 0 }} onClick={() => handleQuantityChange(item.id, item.quantity - 1)}><i className="bi bi-dash"></i></button>
                              <span className="small fw-bold px-2">{item.quantity}</span>
                              <button className="btn btn-sm btn-white rounded-circle shadow-sm d-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px', padding: 0 }} onClick={() => handleQuantityChange(item.id, item.quantity + 1)}><i className="bi bi-plus"></i></button>
                            </div>
                            <span className="fw-bold text-dark fs-6">{formatPrice(item.price * item.quantity)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-3 pb-2 border-top mt-auto bg-white">
                  <div className="d-flex justify-content-between mb-3">
                    <span className="text-muted fw-bold">Total Amount</span>
                    <span className="fw-bold fs-4 text-dark">{formatPrice(calculateCartTotal())}</span>
                  </div>
                  <button className="premium-btn w-100 py-3 fs-6 rounded-4" disabled={cart.length === 0} onClick={() => { 
                    if (hasOngoingOrder) {
                      showNotification('You have an ongoing order. Please wait until it is picked up before placing a new one.', 'warning');
                    } else {
                      setShowMobileCart(false); 
                      setShowPickupModal(true); 
                    }
                  }}>Checkout Securely</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showPickupModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content border-0" style={{ borderRadius: '24px', overflow: 'hidden' }}>
              <div className="p-4 bg-white">
                <div className="d-flex justify-content-between align-items-center mb-4">
                  <h4 className="fw-bold mb-0">Confirm Order</h4>
                  <button className="btn-close" onClick={() => setShowPickupModal(false)}></button>
                </div>

                <form onSubmit={handlePlaceOrder}>
                  <div className="row g-4">
                    <div className="col-md-7">
                      <div className="p-4 bg-light rounded-4 h-100">
                        <h6 className="fw-bold mb-3 uppercase small text-muted">Pickup Information</h6>

                        <div className="row g-3">
                          <div className="col-6">
                            <label className="extra-small fw-bold text-muted mb-1">DATE</label>
                            <input type="date" className="form-control rounded-3" name="pickupDate" value={pickupDetails.pickupDate} onChange={handleInputChange} min={new Date().toISOString().split('T')[0]} required />
                          </div>
                          <div className="col-6">
                            <label className="extra-small fw-bold text-muted mb-1">TIME</label>
                            <select className="form-select rounded-3" name="pickupTime" value={pickupDetails.pickupTime} onChange={handleInputChange} required>
                              <option value="">Select</option>
                              {['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'].map(t => (
                                <option key={t} value={t}>{t > '12:00' ? `${parseInt(t) - 12}:00 PM` : `${t} AM`}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-12">
                            <label className="extra-small fw-bold text-muted mb-1">PHONE NUMBER</label>
                            <input type="tel" className="form-control rounded-3" name="customerPhone" value={pickupDetails.customerPhone} onChange={handleInputChange} placeholder="+63 9XX XXX XXXX" required />
                          </div>
                          <div className="col-12">
                            <label className="extra-small fw-bold text-muted mb-1">ORDER NOTES (OPTIONAL)</label>
                            <textarea
                              className="form-control rounded-3"
                              name="notes"
                              value={pickupDetails.notes}
                              onChange={handleInputChange}
                              placeholder="Any special requests or instructions..."
                              rows="2"
                            ></textarea>
                          </div>
                          <div className="col-12">
                            <label className="extra-small fw-bold text-muted mb-1">PICKUP LOCATION</label>
                            <div className="p-3 bg-white border rounded-3 small">
                              <i className="bi bi-geo-alt-fill text-danger me-2"></i>
                              <strong>R&R Barber Shop</strong> - Main Branch
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="col-md-5">
                      <div className="p-4 border rounded-4 d-flex flex-column h-100">
                        <h6 className="fw-bold mb-3 uppercase small text-muted">Order Details</h6>
                        <div className="flex-grow-1 overflow-auto mb-3" style={{ maxHeight: '200px' }}>
                          {cart.map(item => (
                            <div key={item.id} className="d-flex justify-content-between small mb-2">
                              <span>{item.quantity}x {item.name}</span>
                              <span className="fw-bold">{formatPrice(item.price * item.quantity)}</span>
                            </div>
                          ))}
                        </div>
                        <div className="border-top pt-3 mt-auto">
                          <div className="d-flex justify-content-between mb-3">
                            <span className="fw-bold">Total Amount</span>
                            <span className="fw-bold text-dark fs-5">{formatPrice(calculateCartTotal())}</span>
                          </div>
                          <button type="submit" className="premium-btn w-100" disabled={orderLoading}>
                            {orderLoading ? 'Processing...' : 'Complete Order'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Basic Notification Modal */}
      {showNotificationModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.4)', zIndex: 1100 }}>
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content border-0 text-center p-4" style={{ borderRadius: '24px' }}>
              <div className={`mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle`} style={{ width: '60px', height: '60px', background: notificationType === 'success' ? '#e7f5ea' : '#f8f9fa', color: notificationType === 'success' ? '#2d5a27' : '#1a1a1a' }}>
                <i className={`bi bi-${notificationType === 'success' ? 'check' : 'info'}-lg fs-2`}></i>
              </div>
              <h6 className="fw-bold mb-2">{notificationType === 'success' ? 'Great!' : 'Note'}</h6>
              <p className="text-muted small mb-4">{notificationMessage}</p>
              <button className="btn btn-dark w-100 rounded-3 py-2 fw-bold" onClick={() => setShowNotificationModal(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegratedShop;
