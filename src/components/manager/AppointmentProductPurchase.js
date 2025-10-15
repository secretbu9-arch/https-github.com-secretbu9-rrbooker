import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
import ordersService from '../../services/OrdersService';
import LoadingSpinner from '../common/LoadingSpinner';

const AppointmentProductPurchase = ({ appointment, onClose, onSuccess }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [cart, setCart] = useState([]);
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

  const handlePurchase = async () => {
    if (cart.length === 0) {
      showNotificationMessage('Please add products to cart', 'warning');
      return;
    }

    try {
      setIsProcessing(true);

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
        pickupDate: appointment.appointment_date,
        pickupTime: appointment.appointment_time || 'After appointment',
        pickupLocation: 'R&R Barber Shop',
        notes: `Product purchase during appointment - Customer: ${appointment.customer?.full_name || 'Unknown'}`
      };

      const customerData = {
        id: appointment.customer_id,
        name: appointment.customer?.full_name || 'Customer',
        phone: appointment.customer?.phone || '',
        email: appointment.customer?.email || ''
      };

      // Create the order
      const order = await ordersService.createOrder(orderData, customerData);

      if (order) {
        showNotificationMessage('Purchase completed successfully!', 'success');
        
        // Clear cart
        setCart([]);

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
              Product Purchase - {appointment.customer?.full_name || 'Customer'}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              disabled={isProcessing}
            ></button>
          </div>

          <div className="modal-body">
            {/* Appointment Info */}
            <div className="alert alert-info mb-3">
              <div className="row">
                <div className="col-md-6">
                  <strong>Customer:</strong> {appointment.customer?.full_name || 'Unknown'}<br />
                  <strong>Appointment:</strong> {appointment.appointment_date} at {appointment.appointment_time || 'TBD'}
                </div>
                <div className="col-md-6">
                  <strong>Service:</strong> {appointment.service?.name || 'Unknown'}<br />
                  <strong>Status:</strong> <span className={`badge bg-${appointment.status === 'ongoing' ? 'primary' : 'secondary'}`}>
                    {appointment.status}
                  </span>
                </div>
              </div>
            </div>

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

              {/* Cart */}
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
                        <div className="mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
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
                              <i className="bi bi-credit-card me-2"></i>
                              Complete Purchase
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

export default AppointmentProductPurchase;


