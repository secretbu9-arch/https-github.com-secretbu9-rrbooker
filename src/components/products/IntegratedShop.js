import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useProducts } from '../hooks/useProducts';
import { formatPrice } from '../utils/helpers';
import LoadingSpinner from '../common/LoadingSpinner';
import { apiService } from '../../services/ApiService';
import { useAuth } from '../hooks/useAuth';
import ordersService from '../../services/OrdersService';

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
  const [sortBy, setSortBy] = useState('name');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState('info'); // 'success', 'error', 'warning', 'info'
  
  // Pickup details form
  const [pickupDetails, setPickupDetails] = useState({
    pickupDate: '',
    pickupTime: '',
    notes: '',
    customerName: '',
    customerPhone: '',
    customerEmail: ''
  });

  useEffect(() => {
    fetchProducts();
    autoFillCustomerDetails();
  }, [user]);

  const autoFillCustomerDetails = () => {
    if (user) {
      setPickupDetails(prev => ({
        ...prev,
        customerName: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        customerEmail: user.email || '',
        customerPhone: user.user_metadata?.phone || ''
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
      setError('Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async (product) => {
    try {
      // Check if product is available
      if (!product.is_available) {
        showNotification('This product is currently out of stock.', 'warning');
        return;
      }

      // Check current cart quantity for this product
      const currentCartItem = cart.find(item => item.id === product.id);
      const currentQuantity = currentCartItem ? currentCartItem.quantity : 0;
      
      // Check if adding 1 more would exceed stock
      if (currentQuantity >= product.stock_quantity) {
        showNotification(`Only ${product.stock_quantity} units available in stock.`, 'warning');
        return;
      }

      await addToCart(product, 1);
      showNotification(`${product.name} added to cart!`, 'success');
    } catch (error) {
      console.error('Error adding to cart:', error);
      showNotification('Failed to add item to cart. Please try again.', 'error');
    }
  };

  const handleQuantityChange = (productId, newQuantity) => {
    if (newQuantity < 1) return;
    
    // Find the product to check stock
    const product = products.find(p => p.id === productId);
    if (product && newQuantity > product.stock_quantity) {
      showNotification(`Only ${product.stock_quantity} units available in stock.`, 'warning');
      return;
    }
    
    updateCartItem(productId, newQuantity);
  };

  const handleRemoveFromCart = (productId) => {
    removeFromCart(productId);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setPickupDetails(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCheckout = () => {
    if (cart.length === 0) {
      setOrderError('Your cart is empty.');
      return;
    }
    setOrderError(null);
    setShowPickupModal(true);
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    
    if (!pickupDetails.pickupDate || !pickupDetails.pickupTime) {
      setOrderError('Please select pickup date and time.');
      return;
    }

    if (!pickupDetails.customerName || !pickupDetails.customerPhone) {
      setOrderError('Please fill in your name and phone number.');
      return;
    }

    try {
      setOrderLoading(true);
      setOrderError(null);

      // Get current user
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      // Create order using OrdersService
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
        // Clear cart and show success
        clearCart();
        setOrderSuccess(true);
        setShowPickupModal(false);
        showNotification('Order placed successfully! You will receive a confirmation notification.', 'success');
        
        // Redirect to orders page after 2 seconds
        setTimeout(() => {
          navigate('/orders');
        }, 2000);
      } else {
        throw new Error('Order creation failed');
      }

    } catch (error) {
      console.error('Error creating order:', error);
      setOrderError(`Failed to create order: ${error.message || 'Please try again.'}`);
      showNotification('Failed to create order. Please try again.', 'error');
    } finally {
      setOrderLoading(false);
    }
  };

  const getCartQuantity = (productId) => {
    const cartItem = cart.find(item => item.id === productId);
    return cartItem ? cartItem.quantity : 0;
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'price-low':
        return a.price - b.price;
      case 'price-high':
        return b.price - a.price;
      case 'newest':
        return new Date(b.created_at) - new Date(a.created_at);
      default:
        return 0;
    }
  });

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="alert alert-danger">{error}</div>;

  return (
    <div className="container-fluid py-4">
      <div className="row">
        {/* Products Section */}
        <div className="col-lg-8">
          <div className="card shadow-sm">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">
                <i className="bi bi-shop me-2"></i>
                Shop Products
              </h4>
            </div>
            <div className="card-body">
              {/* Search and Filters */}
              <div className="row mb-4">
                <div className="col-md-6">
                  <div className="input-group">
                    <span className="input-group-text">
                      <i className="bi bi-search"></i>
                    </span>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="col-md-3">
                  <select
                    className="form-select"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    <option value="Hair Care">Hair Care</option>
                    <option value="Styling">Styling</option>
                    <option value="Tools">Tools</option>
                    <option value="Beard Care">Beard Care</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <select
                    className="form-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="name">Sort by Name</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="newest">Newest First</option>
                  </select>
                </div>
              </div>

              {/* Products Grid */}
              {sortedProducts.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-box display-1 text-muted"></i>
                  <h4 className="mt-3">No Products Found</h4>
                  <p className="text-muted">
                    {searchTerm || selectedCategory !== 'all' 
                      ? 'Try adjusting your search or filter criteria.'
                      : 'No products are available at the moment.'
                    }
                  </p>
                </div>
              ) : (
                <div className="row">
                  {sortedProducts.map((product) => (
                    <div key={product.id} className="col-md-6 col-lg-4 mb-4">
                      <div className="card h-100 shadow-sm">
                        <div className="position-relative">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              className="card-img-top"
                              alt={product.name}
                              style={{ height: '200px', objectFit: 'cover' }}
                              onError={(e) => {
                                e.target.src = 'https://via.placeholder.com/300x200?text=No+Image';
                              }}
                            />
                          ) : (
                            <div 
                              className="card-img-top d-flex align-items-center justify-content-center bg-light"
                              style={{ height: '200px' }}
                            >
                              <i className="bi bi-image display-4 text-muted"></i>
                            </div>
                          )}
                          <div className="position-absolute top-0 end-0 m-2">
                            <span className={`badge ${product.stock_quantity > 10 ? 'bg-success' : product.stock_quantity > 0 ? 'bg-warning' : 'bg-danger'}`}>
                              {product.stock_quantity} in stock
                            </span>
                          </div>
                        </div>
                        <div className="card-body d-flex flex-column">
                          <h5 className="card-title">{product.name}</h5>
                          <p className="card-text text-muted flex-grow-1">
                            {product.description}
                          </p>
                          <div className="mb-3">
                            <span className="h5 text-primary">
                              {formatPrice(product.price)}
                            </span>
                            {product.category && (
                              <span className="badge bg-secondary ms-2">
                                {product.category}
                              </span>
                            )}
                          </div>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-primary flex-fill"
                              onClick={() => handleAddToCart(product)}
                              disabled={!product.is_available}
                            >
                              <i className="bi bi-cart-plus me-1"></i>
                              Add to Cart
                            </button>
                          </div>
                          {getCartQuantity(product.id) > 0 && (
                            <div className="mt-2">
                              <small className="text-success">
                                <i className="bi bi-check-circle me-1"></i>
                                {getCartQuantity(product.id)} in cart
                              </small>
                            </div>
                          )}
                          {!product.is_available && (
                            <div className="mt-2">
                              <small className="text-danger">
                                <i className="bi bi-x-circle me-1"></i>
                                Out of stock
                              </small>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cart and Checkout Section */}
        <div className="col-lg-4">
          <div className="card shadow-sm sticky-top" style={{ top: '20px' }}>
            <div className="card-header bg-success text-white">
              <h5 className="mb-0">
                <i className="bi bi-cart me-2"></i>
                Shopping Cart ({cart.length} items)
              </h5>
            </div>
            <div className="card-body">
              {cart.length === 0 ? (
                <div className="text-center py-4">
                  <i className="bi bi-cart-x display-4 text-muted"></i>
                  <p className="text-muted mt-2">Your cart is empty</p>
                  <small className="text-muted">Add some products to get started!</small>
                </div>
              ) : (
                <>
                  {/* Cart Items */}
                  <div className="mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {cart.map((item) => (
                      <div key={item.id} className="d-flex align-items-center mb-3 p-2 border rounded">
                        <div className="me-3">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
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
                              <i className="bi bi-image text-muted"></i>
                            </div>
                          )}
                        </div>
                        <div className="flex-grow-1">
                          <h6 className="mb-1">{item.name}</h6>
                          <small className="text-muted">{formatPrice(item.price)} each</small>
                        </div>
                        <div className="d-flex align-items-center">
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                          >
                            <i className="bi bi-dash"></i>
                          </button>
                          <span className="mx-2">{item.quantity}</span>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                          >
                            <i className="bi bi-plus"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger ms-2"
                            onClick={() => handleRemoveFromCart(item.id)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Cart Total */}
                  <div className="border-top pt-3 mb-3">
                    <div className="d-flex justify-content-between">
                      <strong>Total:</strong>
                      <strong className="text-primary">{formatPrice(calculateCartTotal())}</strong>
                    </div>
                  </div>

                  {/* Checkout Button */}
                  <div className="d-grid gap-2">
                    <button
                      type="button"
                      className="btn btn-success btn-lg"
                      onClick={handleCheckout}
                      disabled={cart.length === 0}
                    >
                      <i className="bi bi-check-circle me-2"></i>
                      Proceed to Checkout
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={clearCart}
                      disabled={cart.length === 0}
                    >
                      <i className="bi bi-trash me-2"></i>
                      Clear Cart
                    </button>
                  </div>

                  {orderError && (
                    <div className="alert alert-danger mt-3">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      {orderError}
                    </div>
                  )}

                  {orderSuccess && (
                    <div className="alert alert-success mt-3">
                      <i className="bi bi-check-circle me-2"></i>
                      Order placed successfully! Redirecting to orders...
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pickup Details Modal */}
      {showPickupModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-calendar-check me-2"></i>
                  Complete Your Order
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPickupModal(false)}
                ></button>
              </div>
              <form onSubmit={handlePlaceOrder}>
                <div className="modal-body">
                  {/* Order Summary */}
                  <div className="card mb-4">
                    <div className="card-header">
                      <h6 className="mb-0">Order Summary</h6>
                    </div>
                    <div className="card-body">
                      {cart.map((item) => (
                        <div key={item.id} className="d-flex justify-content-between align-items-center mb-3">
                          <div className="d-flex align-items-center">
                            <div className="me-3">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className="rounded"
                                  style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                                  onError={(e) => {
                                    e.target.src = 'https://via.placeholder.com/40x40?text=No+Image';
                                  }}
                                />
                              ) : (
                                <div 
                                  className="rounded d-flex align-items-center justify-content-center bg-light"
                                  style={{ width: '40px', height: '40px' }}
                                >
                                  <i className="bi bi-image text-muted" style={{ fontSize: '12px' }}></i>
                                </div>
                              )}
                            </div>
                            <div>
                              <strong>{item.name}</strong>
                              <br />
                              <small className="text-muted">Qty: {item.quantity} × {formatPrice(item.price)}</small>
                            </div>
                          </div>
                          <span className="fw-bold">{formatPrice(item.price * item.quantity)}</span>
                        </div>
                      ))}
                      <hr />
                      <div className="d-flex justify-content-between">
                        <strong>Total:</strong>
                        <strong className="text-primary">{formatPrice(calculateCartTotal())}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Pickup Details Form */}
                  <h6 className="mb-3">
                    <i className="bi bi-geo-alt me-2"></i>
                    Pickup Details
                  </h6>
                  
                  <div className="row">
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">Pickup Date *</label>
                        <input
                          type="date"
                          className="form-control"
                          name="pickupDate"
                          value={pickupDetails.pickupDate}
                          onChange={handleInputChange}
                          min={new Date().toISOString().split('T')[0]}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">Pickup Time *</label>
                        <select
                          className="form-select"
                          name="pickupTime"
                          value={pickupDetails.pickupTime}
                          onChange={handleInputChange}
                          required
                        >
                          <option value="">Select time</option>
                          <option value="08:00">8:00 AM</option>
                          <option value="09:00">9:00 AM</option>
                          <option value="10:00">10:00 AM</option>
                          <option value="11:00">11:00 AM</option>
                          <option value="12:00">12:00 PM</option>
                          <option value="13:00">1:00 PM</option>
                          <option value="14:00">2:00 PM</option>
                          <option value="15:00">3:00 PM</option>
                          <option value="16:00">4:00 PM</option>
                          <option value="17:00">5:00 PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="row">
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">Your Name *</label>
                        <input
                          type="text"
                          className="form-control"
                          name="customerName"
                          value={pickupDetails.customerName}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="mb-3">
                        <label className="form-label">Phone Number *</label>
                        <input
                          type="tel"
                          className="form-control"
                          name="customerPhone"
                          value={pickupDetails.customerPhone}
                          onChange={handleInputChange}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Email (Optional)</label>
                    <input
                      type="email"
                      className="form-control"
                      name="customerEmail"
                      value={pickupDetails.customerEmail}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Special Notes</label>
                    <textarea
                      className="form-control"
                      name="notes"
                      value={pickupDetails.notes}
                      onChange={handleInputChange}
                      rows="3"
                      placeholder="Any special instructions or notes..."
                    />
                  </div>

                  {orderError && (
                    <div className="alert alert-danger">
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      {orderError}
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowPickupModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-success"
                    disabled={orderLoading}
                  >
                    {orderLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Processing...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-circle me-2"></i>
                        Place Order
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {showNotificationModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className={`modal-header border-0 ${notificationType === 'success' ? 'bg-success text-white' : notificationType === 'error' ? 'bg-danger text-white' : notificationType === 'warning' ? 'bg-warning text-dark' : 'bg-info text-white'}`}>
                <h5 className="modal-title d-flex align-items-center">
                  {notificationType === 'success' && <i className="bi bi-check-circle me-2"></i>}
                  {notificationType === 'error' && <i className="bi bi-exclamation-triangle me-2"></i>}
                  {notificationType === 'warning' && <i className="bi bi-exclamation-triangle me-2"></i>}
                  {notificationType === 'info' && <i className="bi bi-info-circle me-2"></i>}
                  {notificationType === 'success' ? 'Success' : notificationType === 'error' ? 'Error' : notificationType === 'warning' ? 'Warning' : 'Information'}
                </h5>
                <button
                  type="button"
                  className={`btn-close ${notificationType === 'success' || notificationType === 'error' || notificationType === 'info' ? 'btn-close-white' : ''}`}
                  onClick={() => setShowNotificationModal(false)}
                ></button>
              </div>
              <div className="modal-body text-center py-4">
                <p className="mb-0">{notificationMessage}</p>
              </div>
              <div className="modal-footer border-0 justify-content-center">
                <button
                  type="button"
                  className={`btn ${notificationType === 'success' ? 'btn-success' : notificationType === 'error' ? 'btn-danger' : notificationType === 'warning' ? 'btn-warning' : 'btn-info'}`}
                  onClick={() => setShowNotificationModal(false)}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegratedShop;
