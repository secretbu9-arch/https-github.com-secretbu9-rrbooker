import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
import ordersService from '../../services/OrdersService';
import LoadingSpinner from '../common/LoadingSpinner';

const WalkInProductPurchase = ({ onClose, onSuccess }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
  const [customerInfo, setCustomerInfo] = useState({
    name: 'Walk-in Customer',
    phone: '',
    email: '',
    isWalkIn: true
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const productsData = await apiService.getProducts();
      setProducts(productsData || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory && product.is_active && product.stock_quantity > 0;
  });

  const addToCart = (product) => {
    if (product.stock_quantity <= 0) {
      showNotificationMessage('Product is out of stock', 'warning');
      return;
    }

    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock_quantity) {
        showNotificationMessage(`Only ${product.stock_quantity} units available`, 'warning');
        return;
      }
      setCart(cart.map(item => 
        item.id === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        stock_quantity: product.stock_quantity,
        image_url: product.image_url,
        description: product.description
      }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const product = products.find(p => p.id === productId);
    if (product && newQuantity > product.stock_quantity) {
      showNotificationMessage(`Only ${product.stock_quantity} units available`, 'warning');
      return;
    }

    setCart(cart.map(item => 
      item.id === productId 
        ? { ...item, quantity: newQuantity }
        : item
    ));
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const showNotificationMessage = (message, type) => {
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCustomerInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePurchase = async () => {
    if (cart.length === 0) {
      showNotificationMessage('Please add products to cart', 'warning');
      return;
    }

    if (!customerInfo.name.trim()) {
      showNotificationMessage('Customer name is required', 'warning');
      return;
    }

    if (!customerInfo.phone.trim()) {
      showNotificationMessage('Customer phone is required', 'warning');
      return;
    }

    try {
      setIsProcessing(true);

      // For walk-in purchases, we don't need to create user records
      // We'll create the order directly with customer information

      // Create order data
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
        totalAmount: calculateTotal(),
        pickupDate: new Date().toISOString().split('T')[0], // Today
        pickupTime: new Date().toLocaleTimeString('en-US', { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        pickupLocation: 'R&R Barber Shop',
        notes: 'Walk-in purchase - immediate pickup'
      };

      // Create the order directly without requiring a user record
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: null, // No customer user record needed for walk-ins
          total_amount: calculateTotal(),
          pickup_date: new Date().toISOString().split('T')[0], // Today
          pickup_time: new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          pickup_location: 'R&R Barber Shop',
          notes: 'Walk-in purchase - customer present, immediate pickup',
          customer_phone: customerInfo.phone || 'N/A',
          customer_email: customerInfo.email || 'N/A',
          status: 'picked_up' // Auto-complete since customer is present
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = cart.map(item => ({
        order_id: order.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.price * item.quantity,
        product_name: item.name,
        product_description: item.description || '',
        product_image_url: item.image_url || ''
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      if (order) {
        showNotificationMessage('Walk-in purchase completed! Order marked as picked up since customer is present.', 'success');
        
        // Clear cart and form
        setCart([]);
        setCustomerInfo({
          name: 'Walk-in Customer',
          phone: '',
          email: '',
          isWalkIn: true
        });

        // Notify parent component
        if (onSuccess) {
          onSuccess(order);
        }

        // Close modal after delay
        setTimeout(() => {
          if (onClose) onClose();
        }, 2000);
      }

    } catch (error) {
      console.error('Error processing purchase:', error);
      showNotificationMessage(`Purchase failed: ${error.message}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const categories = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-cart-plus me-2"></i>
              Walk-in Product Purchase
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              disabled={isProcessing}
            ></button>
          </div>

          <div className="modal-body">
            {error && (
              <div className="alert alert-danger">
                <i className="bi bi-exclamation-triangle me-2"></i>
                {error}
              </div>
            )}

            <div className="row">
              {/* Product Selection */}
              <div className="col-md-8">
                <div className="card h-100">
                  <div className="card-header">
                    <h6 className="mb-0">
                      <i className="bi bi-box-seam me-2"></i>
                      Select Products
                    </h6>
                  </div>
                  <div className="card-body">
                    {/* Search and Filter */}
                    <div className="row mb-3">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search products..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="col-md-6">
                        <select
                          className="form-select"
                          value={selectedCategory}
                          onChange={(e) => setSelectedCategory(e.target.value)}
                        >
                          {categories.map(category => (
                            <option key={category} value={category}>
                              {category === 'all' ? 'All Categories' : category}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Products Grid */}
                    <div className="row">
                      {filteredProducts.map((product) => (
                        <div key={product.id} className="col-md-6 col-lg-4 mb-3">
                          <div className="card h-100">
                            <div className="position-relative">
                              {product.image_url ? (
                                <img
                                  src={product.image_url}
                                  className="card-img-top"
                                  alt={product.name}
                                  style={{ height: '150px', objectFit: 'cover' }}
                                  onError={(e) => {
                                    e.target.src = 'https://via.placeholder.com/150x150?text=No+Image';
                                  }}
                                />
                              ) : (
                                <div
                                  className="card-img-top d-flex align-items-center justify-content-center bg-light"
                                  style={{ height: '150px' }}
                                >
                                  <i className="bi bi-image display-6 text-muted"></i>
                                </div>
                              )}
                              <div className="position-absolute top-0 end-0 m-2">
                                <span className={`badge ${product.stock_quantity > 10 ? 'bg-success' : product.stock_quantity > 0 ? 'bg-warning' : 'bg-danger'}`}>
                                  {product.stock_quantity} in stock
                                </span>
                              </div>
                            </div>
                            <div className="card-body d-flex flex-column">
                              <h6 className="card-title">{product.name}</h6>
                              <p className="card-text text-muted small flex-grow-1">
                                {product.description}
                              </p>
                              <div className="d-flex justify-content-between align-items-center">
                                <span className="h6 text-primary mb-0">
                                  ₱{product.price.toFixed(2)}
                                </span>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => addToCart(product)}
                                  disabled={product.stock_quantity <= 0}
                                >
                                  <i className="bi bi-plus"></i> Add
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {filteredProducts.length === 0 && (
                      <div className="text-center py-4">
                        <i className="bi bi-search display-4 text-muted"></i>
                        <p className="text-muted mt-2">No products found</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Cart and Customer Info */}
              <div className="col-md-4">
                <div className="card h-100">
                  <div className="card-header">
                    <h6 className="mb-0">
                      <i className="bi bi-cart me-2"></i>
                      Cart ({cart.length} items)
                    </h6>
                  </div>
                  <div className="card-body">
                    {cart.length === 0 ? (
                      <div className="text-center py-4">
                        <i className="bi bi-cart-x display-4 text-muted"></i>
                        <p className="text-muted mt-2">Cart is empty</p>
                      </div>
                    ) : (
                      <>
                        {/* Cart Items */}
                        <div className="mb-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          {cart.map((item) => (
                            <div key={item.id} className="d-flex align-items-center mb-2 p-2 border rounded">
                              <div className="me-2">
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
                                    <i className="bi bi-image text-muted"></i>
                                  </div>
                                )}
                              </div>
                              <div className="flex-grow-1">
                                <h6 className="mb-1 small">{item.name}</h6>
                                <div className="d-flex align-items-center">
                                  <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                  >
                                    <i className="bi bi-dash"></i>
                                  </button>
                                  <span className="mx-2">{item.quantity}</span>
                                  <button
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                  >
                                    <i className="bi bi-plus"></i>
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-danger ms-2"
                                    onClick={() => removeFromCart(item.id)}
                                  >
                                    <i className="bi bi-trash"></i>
                                  </button>
                                </div>
                              </div>
                              <div className="text-end">
                                <div className="small text-primary">
                                  ₱{(item.price * item.quantity).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Total */}
                        <div className="border-top pt-2 mb-3">
                          <div className="d-flex justify-content-between">
                            <strong>Total:</strong>
                            <strong className="text-primary">₱{calculateTotal().toFixed(2)}</strong>
                          </div>
                        </div>

                        {/* Customer Information (Optional) */}
                        <div className="mb-3">
                          <h6 className="mb-2">
                            <i className="bi bi-person me-1"></i>
                            Customer Information (Optional)
                          </h6>
                          <div className="mb-2">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              name="name"
                              placeholder="Customer Name (optional)"
                              value={customerInfo.name}
                              onChange={handleInputChange}
                            />
                          </div>
                          <div className="mb-2">
                            <input
                              type="tel"
                              className="form-control form-control-sm"
                              name="phone"
                              placeholder="Phone Number (optional)"
                              value={customerInfo.phone}
                              onChange={handleInputChange}
                            />
                          </div>
                          <div className="mb-2">
                            <input
                              type="email"
                              className="form-control form-control-sm"
                              name="email"
                              placeholder="Email (optional)"
                              value={customerInfo.email}
                              onChange={handleInputChange}
                            />
                          </div>
                          <small className="text-muted">
                            <i className="bi bi-info-circle me-1"></i>
                            Customer information is optional for walk-in purchases. Order will be automatically marked as "picked up" since customer is present.
                          </small>
                        </div>

                        {/* Purchase Button */}
                        <button
                          className="btn btn-success w-100"
                          onClick={handlePurchase}
                          disabled={isProcessing || cart.length === 0}
                        >
                          {isProcessing ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                              Processing...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-check-circle me-2"></i>
                              Complete Walk-in Purchase
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notification */}
          {showNotification && (
            <div className="position-fixed top-0 end-0 p-3" style={{ zIndex: 9999 }}>
              <div className={`alert alert-${notificationType === 'success' ? 'success' : notificationType === 'warning' ? 'warning' : 'danger'} alert-dismissible fade show`}>
                <i className={`bi ${notificationType === 'success' ? 'bi-check-circle' : notificationType === 'warning' ? 'bi-exclamation-triangle' : 'bi-x-circle'} me-2`}></i>
                {notificationMessage}
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowNotification(false)}
                ></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalkInProductPurchase;
