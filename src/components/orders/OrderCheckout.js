// components/orders/OrderCheckout.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import OrdersService from '../../services/OrdersService';
import LoadingSpinner from '../common/LoadingSpinner';

const OrderCheckout = () => {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form data
  const [formData, setFormData] = useState({
    pickupDate: '',
    pickupTime: '',
    pickupLocation: 'R&R Barber Shop',
    notes: '',
    customerPhone: '',
    customerEmail: ''
  });

  // Fraud prevention states
  const [fraudAnalysis, setFraudAnalysis] = useState(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);

  useEffect(() => {
    loadCart();
    getCurrentUser();
  }, []);

  const loadCart = () => {
    const savedCart = localStorage.getItem('rnrbooker_cart');
    if (savedCart) {
      setCart(JSON.parse(savedCart));
    }
  };

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    
    if (user) {
      setFormData(prev => ({
        ...prev,
        customerPhone: user.user_metadata?.phone || '',
        customerEmail: user.email || ''
      }));
    }
  };

  const calculateTotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = () => {
    if (!formData.pickupDate) {
      setError('Please select a pickup date');
      return false;
    }

    if (!formData.pickupTime) {
      setError('Please select a pickup time');
      return false;
    }

    if (!formData.customerPhone) {
      setError('Please provide your phone number');
      return false;
    }

    if (!formData.customerEmail) {
      setError('Please provide your email address');
      return false;
    }

    // Check if pickup date is not in the past
    const pickupDateTime = new Date(`${formData.pickupDate}T${formData.pickupTime}`);
    if (pickupDateTime < new Date()) {
      setError('Pickup date and time must be in the future');
      return false;
    }

    return true;
  };

  const handlePlaceOrder = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Prepare order data
      const orderData = {
        totalAmount: calculateTotal(),
        pickupDate: formData.pickupDate,
        pickupTime: formData.pickupTime,
        pickupLocation: formData.pickupLocation,
        notes: formData.notes,
        items: cart.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity,
          productName: item.name,
          productDescription: item.description,
          productImageUrl: item.image_url,
          category: item.category
        }))
      };

      // Prepare customer data
      const customerData = {
        id: user.id,
        email: formData.customerEmail,
        phone: formData.customerPhone,
        full_name: user.user_metadata?.full_name || user.email,
        deviceFingerprint: localStorage.getItem('device_fingerprint') || 'unknown',
        ipAddress: 'unknown' // Would be set by backend in real implementation
      };

      // Create order with fraud analysis
      const result = await OrdersService.createOrder(orderData, customerData);

      setFraudAnalysis(result.fraudAnalysis);
      setVerificationRequired(result.requiresVerification);

      if (result.requiresVerification) {
        setVerificationSent(true);
        setSuccess('Order created! Please check your phone for verification code.');
      } else {
        setSuccess('Order created successfully! You will receive a confirmation shortly.');
        // Clear cart and redirect
        localStorage.removeItem('rnrbooker_cart');
        setTimeout(() => {
          navigate('/orders');
        }, 2000);
      }

    } catch (error) {
      console.error('Error placing order:', error);
      setError(error.message || 'Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerification = async () => {
    if (!verificationCode) {
      setError('Please enter the verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Get the latest order for this user
      const orders = await OrdersService.getCustomerOrders(user.id, { limit: 1 });
      const latestOrder = orders[0];

      if (!latestOrder) {
        throw new Error('No order found to verify');
      }

      const verified = await OrdersService.verifyOrder(latestOrder.id, verificationCode);

      if (verified) {
        setSuccess('Order verified successfully! You will receive a confirmation shortly.');
        // Clear cart and redirect
        localStorage.removeItem('rnrbooker_cart');
        setTimeout(() => {
          navigate('/orders');
        }, 2000);
      } else {
        setError('Invalid verification code. Please try again.');
      }

    } catch (error) {
      console.error('Error verifying order:', error);
      setError(error.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getRiskLevelColor = (score) => {
    if (score < 30) return 'success';
    if (score < 60) return 'warning';
    if (score < 80) return 'danger';
    return 'dark';
  };

  const getRiskLevelText = (score) => {
    if (score < 30) return 'Low Risk';
    if (score < 60) return 'Medium Risk';
    if (score < 80) return 'High Risk';
    return 'Critical Risk';
  };

  if (cart.length === 0) {
    return (
      <div className="container py-5">
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="card text-center">
              <div className="card-body py-5">
                <i className="bi bi-cart-x display-1 text-muted mb-3"></i>
                <h4>Your cart is empty</h4>
                <p className="text-muted">Add some products to your cart before checkout.</p>
                <button 
                  className="btn btn-primary"
                  onClick={() => navigate('/products')}
                >
                  Browse Products
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h4 className="mb-0">
                <i className="bi bi-cart-check me-2"></i>
                Order Checkout
              </h4>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger" role="alert">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {error}
                </div>
              )}

              {success && (
                <div className="alert alert-success" role="alert">
                  <i className="bi bi-check-circle me-2"></i>
                  {success}
                </div>
              )}

              {/* Fraud Analysis Display */}
              {fraudAnalysis && (
                <div className={`alert alert-${getRiskLevelColor(fraudAnalysis.riskScore)} mb-4`}>
                  <div className="d-flex align-items-center">
                    <i className="bi bi-shield-check me-2"></i>
                    <div>
                      <strong>Security Analysis: {getRiskLevelText(fraudAnalysis.riskScore)}</strong>
                      <div className="small">
                        Risk Score: {fraudAnalysis.riskScore}/100
                        {fraudAnalysis.fraudFlags.length > 0 && (
                          <span className="ms-2">
                            Flags: {fraudAnalysis.fraudFlags.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Verification Section */}
              {verificationRequired && verificationSent && (
                <div className="card border-warning mb-4">
                  <div className="card-header bg-warning text-dark">
                    <h6 className="mb-0">
                      <i className="bi bi-shield-lock me-2"></i>
                      Phone Verification Required
                    </h6>
                  </div>
                  <div className="card-body">
                    <p className="mb-3">
                      For security purposes, please verify your phone number. 
                      A verification code has been sent to your phone.
                    </p>
                    <div className="row">
                      <div className="col-md-6">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Enter 6-digit code"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                          maxLength="6"
                        />
                      </div>
                      <div className="col-md-6">
                        <button
                          className="btn btn-warning"
                          onClick={handleVerification}
                          disabled={loading}
                        >
                          {loading ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2"></span>
                              Verifying...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-check-circle me-2"></i>
                              Verify Order
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pickup Information */}
              <div className="row mb-4">
                <div className="col-md-6">
                  <label className="form-label">Pickup Date *</label>
                  <input
                    type="date"
                    className="form-control"
                    name="pickupDate"
                    value={formData.pickupDate}
                    onChange={handleInputChange}
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Pickup Time *</label>
                  <input
                    type="time"
                    className="form-control"
                    name="pickupTime"
                    value={formData.pickupTime}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-md-6">
                  <label className="form-label">Phone Number *</label>
                  <input
                    type="tel"
                    className="form-control"
                    name="customerPhone"
                    value={formData.customerPhone}
                    onChange={handleInputChange}
                    placeholder="+63 912 345 6789"
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    name="customerEmail"
                    value={formData.customerEmail}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="form-label">Special Instructions</label>
                <textarea
                  className="form-control"
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Any special instructions for your order..."
                />
              </div>

              {/* Order Items */}
              <div className="mb-4">
                <h6>Order Items</h6>
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Quantity</th>
                        <th>Price</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="d-flex align-items-center">
                              {item.image_url && (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className="me-2"
                                  style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                                />
                              )}
                              <div>
                                <div className="fw-bold">{item.name}</div>
                                <small className="text-muted">{item.category}</small>
                              </div>
                            </div>
                          </td>
                          <td>{item.quantity}</td>
                          <td>₱{item.price.toFixed(2)}</td>
                          <td>₱{(item.price * item.quantity).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {!verificationRequired && (
                <div className="d-grid">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handlePlaceOrder}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Processing Order...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-cart-check me-2"></i>
                        Place Order - ₱{calculateTotal().toFixed(2)}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h6 className="mb-0">Order Summary</h6>
            </div>
            <div className="card-body">
              <div className="d-flex justify-content-between mb-2">
                <span>Items ({cart.length})</span>
                <span>₱{calculateTotal().toFixed(2)}</span>
              </div>
              <div className="d-flex justify-content-between mb-2">
                <span>Pickup Fee</span>
                <span className="text-success">FREE</span>
              </div>
              <hr />
              <div className="d-flex justify-content-between fw-bold">
                <span>Total</span>
                <span>₱{calculateTotal().toFixed(2)}</span>
              </div>
              
              <div className="mt-4">
                <h6 className="text-muted">Pickup Information</h6>
                <p className="small mb-1">
                  <i className="bi bi-calendar me-1"></i>
                  {formData.pickupDate || 'Select date'}
                </p>
                <p className="small mb-1">
                  <i className="bi bi-clock me-1"></i>
                  {formData.pickupTime || 'Select time'}
                </p>
                <p className="small mb-0">
                  <i className="bi bi-geo-alt me-1"></i>
                  {formData.pickupLocation}
                </p>
              </div>

              <div className="mt-4">
                <div className="alert alert-info py-2">
                  <small>
                    <i className="bi bi-info-circle me-1"></i>
                    Orders are typically ready within 2-4 hours. You'll receive a notification when ready for pickup.
                  </small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderCheckout;