// components/products/ShoppingCart.js
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useProducts } from '../hooks/useProducts';
import { formatPrice } from '../utils/helpers';
import LoadingSpinner from '../common/LoadingSpinner';

const ShoppingCart = () => {
  const { 
    cart, 
    updateCartItem, 
    removeFromCart, 
    clearCart, 
    calculateCartTotal,
    loading
  } = useProducts();
  
  const navigate = useNavigate();
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState(null);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [shippingInfo, setShippingInfo] = useState({
    name: '',
    address: '',
    city: '',
    phone: '',
    notes: ''
  });

  const handleQuantityChange = (productId, newQuantity) => {
    if (newQuantity < 1) return;
    updateCartItem(productId, newQuantity);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setShippingInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    
    if (cart.length === 0) {
      setOrderError('Your cart is empty.');
      return;
    }
    
    try {
      setOrderLoading(true);
      setOrderError(null);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('You must be logged in to checkout.');
      }
      
      // Create order
      const orderData = {
        customer_id: user.id,
        total_amount: calculateCartTotal(),
        items: cart.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        })),
        shipping_info: shippingInfo,
        status: 'pending'
      };
      
      const { data, error } = await supabase
        .from('orders')
        .insert([orderData])
        .select()
        .single();
      
      if (error) throw error;
      
      // Log the order
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'order_created',
        details: {
          order_id: data.id,
          total_amount: calculateCartTotal(),
          item_count: cart.reduce((total, item) => total + item.quantity, 0)
        }
      });
      
      // Create notification
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: 'Order Placed',
        message: `Your order #${data.id.substring(0, 8)} has been placed successfully.`,
        type: 'system',
        data: {
          order_id: data.id,
          status: 'pending'
        }
      });
      
      // Clear cart and show success
      clearCart();
      setOrderSuccess(true);
      
      // Redirect to order confirmation after 3 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
      
    } catch (error) {
      console.error('Error creating order:', error);
      setOrderError(error.message || 'Failed to place order. Please try again.');
    } finally {
      setOrderLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (orderSuccess) {
    return (
      <div className="container py-5">
        <div className="card">
          <div className="card-body text-center py-5">
            <div className="display-1 text-success mb-4">
              <i className="bi bi-check-circle"></i>
            </div>
            <h2 className="mb-3">Order Placed Successfully!</h2>
            <p className="mb-4">Thank you for your order. We will process it shortly.</p>
            <div className="d-flex justify-content-center gap-3">
              <Link to="/dashboard" className="btn btn-primary">
                Go to Dashboard
              </Link>
              <Link to="/products" className="btn btn-outline-secondary">
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="container py-5">
        <div className="card">
          <div className="card-body text-center py-5">
            <div className="display-1 text-muted mb-4">
              <i className="bi bi-cart-x"></i>
            </div>
            <h2 className="mb-3">Your Cart is Empty</h2>
            <p className="mb-4">Add some products to your cart and come back.</p>
            <Link to="/products" className="btn btn-primary">
              Browse Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <h2 className="mb-4">Your Shopping Cart</h2>

      {orderError && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {orderError}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setOrderError(null)} 
            aria-label="Close"
          ></button>
        </div>
      )}

      <div className="row">
        {/* Cart Items */}
        <div className="col-lg-8 mb-4">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Cart Items ({cart.reduce((total, item) => total + item.quantity, 0)})</h5>
              <button 
                className="btn btn-sm btn-outline-danger"
                onClick={() => {
                  if (window.confirm('Are you sure you want to clear your cart?')) {
                    clearCart();
                  }
                }}
              >
                <i className="bi bi-trash me-1"></i>
                Clear Cart
              </button>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Product</th>
                      <th>Price</th>
                      <th>Quantity</th>
                      <th>Total</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.id}>
                        <td>
                          <div className="d-flex align-items-center">
                            {item.image_url ? (
                              <img 
                                src={item.image_url} 
                                alt={item.name} 
                                className="me-3"
                                style={{ width: '50px', height: '50px', objectFit: 'cover' }}
                              />
                            ) : (
                              <div 
                                className="bg-light d-flex align-items-center justify-content-center me-3"
                                style={{ width: '50px', height: '50px' }}
                              >
                                <i className="bi bi-image text-muted"></i>
                              </div>
                            )}
                            <div>
                              <h6 className="mb-0">{item.name}</h6>
                              {item.category && <small className="text-muted">{item.category}</small>}
                            </div>
                          </div>
                        </td>
                        <td>{formatPrice(item.price)}</td>
                        <td>
                          <div className="input-group input-group-sm" style={{ width: '120px' }}>
                            <button 
                              className="btn btn-outline-secondary" 
                              type="button"
                              onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                              disabled={item.quantity <= 1}
                            >
                              <i className="bi bi-dash"></i>
                            </button>
                            <input
                              type="number"
                              className="form-control text-center"
                              value={item.quantity}
                              onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 1)}
                              min="1"
                            />
                            <button 
                              className="btn btn-outline-secondary" 
                              type="button"
                              onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                            >
                              <i className="bi bi-plus"></i>
                            </button>
                          </div>
                        </td>
                        <td>{formatPrice(item.price * item.quantity)}</td>
                        <td>
                          <button 
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => removeFromCart(item.id)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card-footer">
              <div className="d-flex justify-content-between align-items-center">
                <Link to="/products" className="btn btn-outline-primary">
                  <i className="bi bi-arrow-left me-2"></i>
                  Continue Shopping
                </Link>
                <div className="text-end">
                  <div className="fs-5 mb-2">
                    Subtotal: <strong>{formatPrice(calculateCartTotal())}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Order Summary & Checkout */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">Order Summary</h5>
            </div>
            <div className="card-body">
              <form onSubmit={handleCheckout}>
                <div className="mb-3">
                  <label className="form-label">Shipping Information</label>
                  
                  <div className="mb-2">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Full Name"
                      name="name"
                      value={shippingInfo.name}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  
                  <div className="mb-2">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Delivery Address"
                      name="address"
                      value={shippingInfo.address}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  
                  <div className="mb-2">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="City"
                      name="city"
                      value={shippingInfo.city}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  
                  <div className="mb-2">
                    <input
                      type="tel"
                      className="form-control"
                      placeholder="Phone Number"
                      name="phone"
                      value={shippingInfo.phone}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  
                  <div className="mb-3">
                    <textarea
                      className="form-control"
                      placeholder="Order Notes (Optional)"
                      name="notes"
                      value={shippingInfo.notes}
                      onChange={handleInputChange}
                      rows="2"
                    ></textarea>
                  </div>
                </div>

                <div className="card bg-light mb-3">
                  <div className="card-body">
                    <h6>Order Details</h6>
                    
                    <div className="d-flex justify-content-between mb-2">
                      <span>Subtotal:</span>
                      <span>{formatPrice(calculateCartTotal())}</span>
                    </div>
                    
                    <div className="d-flex justify-content-between mb-2">
                      <span>Shipping:</span>
                      <span>Free</span>
                    </div>
                    
                    <hr />
                    
                    <div className="d-flex justify-content-between">
                      <span className="fw-bold">Total:</span>
                      <span className="fw-bold">{formatPrice(calculateCartTotal())}</span>
                    </div>
                  </div>
                </div>

                <div className="d-grid">
                  <button 
                    type="submit" 
                    className="btn btn-success"
                    disabled={orderLoading}
                  >
                    {orderLoading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Processing Order...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-credit-card me-2"></i>
                        Place Order
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShoppingCart;