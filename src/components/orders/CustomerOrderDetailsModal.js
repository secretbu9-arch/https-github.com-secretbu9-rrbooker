import React from 'react';
import { formatPrice } from '../utils/helpers';

const CustomerOrderDetailsModal = ({ order, orderDetails, onClose }) => {
  if (!order) return null;

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

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return 'bi-clock';
      case 'confirmed': return 'bi-check-circle';
      case 'preparing': return 'bi-gear';
      case 'ready_for_pickup': return 'bi-box-seam';
      case 'picked_up': return 'bi-check2-all';
      case 'cancelled': return 'bi-x-circle';
      default: return 'bi-question-circle';
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

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="bi bi-receipt me-2"></i>
              Order Details - #{order.order_number || order.id.slice(-8)}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>
          
          <div className="modal-body">
            {/* Order Status */}
            <div className="row mb-4">
              <div className="col-12">
                <div className="card">
                  <div className="card-body text-center">
                    <div className="mb-3">
                      <i className={`bi ${getStatusIcon(order.status)} display-4 text-${getStatusColor(order.status)}`}></i>
                    </div>
                    <h4 className={`text-${getStatusColor(order.status)}`}>
                      {getStatusText(order.status)}
                    </h4>
                    <p className="text-muted mb-0">
                      {order.status === 'pending' && 'Your order is waiting for confirmation'}
                      {order.status === 'confirmed' && 'Your order has been confirmed and will be prepared'}
                      {order.status === 'preparing' && 'Your order is being prepared'}
                      {order.status === 'ready_for_pickup' && 'Your order is ready for pickup!'}
                      {order.status === 'picked_up' && 'Thank you for your order!'}
                      {order.status === 'cancelled' && 'This order has been cancelled'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            <div className="row mb-3">
              <div className="col-12">
                <div className="card">
                  <div className="card-header">
                    <h6 className="mb-0">
                      <i className="bi bi-person-circle me-2"></i>
                      Customer Information
                    </h6>
                  </div>
                  <div className="card-body">
                    <div className="d-flex align-items-center">
                      {order.customer?.profile_picture_url ? (
                        <img
                          src={order.customer.profile_picture_url}
                          alt="Your Profile"
                          className="rounded-circle me-3"
                          style={{ width: '60px', height: '60px', objectFit: 'cover' }}
                          onError={(e) => {
                            e.target.src = 'https://via.placeholder.com/60x60?text=No+Photo';
                          }}
                        />
                      ) : (
                        <div 
                          className="rounded-circle me-3 d-flex align-items-center justify-content-center bg-light"
                          style={{ width: '60px', height: '60px' }}
                        >
                          <i className="bi bi-person-fill text-muted" style={{ fontSize: '24px' }}></i>
                        </div>
                      )}
                      <div className="flex-grow-1">
                        <h5 className="mb-1">{order.customer?.full_name || order.customer_name || 'Customer'}</h5>
                        <p className="text-muted mb-1">
                          <i className="bi bi-envelope me-1"></i>
                          {order.customer?.email || order.customer_email || 'No email'}
                        </p>
                        <p className="text-muted mb-0">
                          <i className="bi bi-telephone me-1"></i>
                          {order.customer?.phone || order.customer_phone || 'No phone'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="row">
              {/* Order Information */}
              <div className="col-md-6">
                <div className="card h-100">
                  <div className="card-header">
                    <h6 className="mb-0">
                      <i className="bi bi-info-circle me-2"></i>
                      Order Information
                    </h6>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <strong>Order Number:</strong>
                      <br />
                      #{order.order_number || order.id.slice(-8)}
                    </div>
                    
                    <div className="mb-3">
                      <strong>Total Amount:</strong>
                      <br />
                      <span className="h5 text-primary">{formatPrice(order.total_amount)}</span>
                    </div>
                    
                    <div className="mb-3">
                      <strong>Order Date:</strong>
                      <br />
                      {new Date(order.created_at).toLocaleDateString()}
                    </div>
                    
                    <div className="mb-3">
                      <strong>Order Time:</strong>
                      <br />
                      {new Date(order.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Pickup Information */}
              <div className="col-md-6">
                <div className="card h-100">
                  <div className="card-header">
                    <h6 className="mb-0">
                      <i className="bi bi-geo-alt me-2"></i>
                      Pickup Information
                    </h6>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <strong>Pickup Date:</strong>
                      <br />
                      {order.pickup_date ? new Date(order.pickup_date).toLocaleDateString() : 'Not set'}
                    </div>
                    
                    <div className="mb-3">
                      <strong>Pickup Time:</strong>
                      <br />
                      {order.pickup_time || 'Not set'}
                    </div>
                    
                    <div className="mb-3">
                      <strong>Pickup Location:</strong>
                      <br />
                      {order.pickup_location || 'R&R Barber Shop'}
                    </div>
                    
                    {order.notes && (
                      <div className="mb-3">
                        <strong>Special Instructions:</strong>
                        <br />
                        <div className="bg-light p-2 rounded mt-1">
                          {order.notes}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div className="row mt-3">
              <div className="col-12">
                <div className="card">
                  <div className="card-header">
                    <h6 className="mb-0">
                      <i className="bi bi-basket me-2"></i>
                      Order Items
                    </h6>
                  </div>
                  <div className="card-body">
                    {orderDetails && orderDetails.items ? (
                      <div className="table-responsive">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Qty</th>
                              <th>Price</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orderDetails.items.map((item, index) => (
                              <tr key={index}>
                                <td>
                                  <div className="d-flex align-items-center">
                                    {(item.product?.image_url || item.image_url || item.product_image_url) && (
                                      <img
                                        src={item.product?.image_url || item.image_url || item.product_image_url}
                                        alt={item.product?.name || item.name || item.product_name || 'Product'}
                                        className="me-2"
                                        style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                                        onError={(e) => {
                                          e.target.src = 'https://via.placeholder.com/40x40?text=No+Image';
                                        }}
                                      />
                                    )}
                                    <div>
                                      <strong>{item.product?.name || item.name || item.product_name || 'N/A'}</strong>
                                      {(item.product?.description || item.description || item.product_description) && (
                                        <>
                                          <br />
                                          <small className="text-muted">{item.product?.description || item.description || item.product_description}</small>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td>{item.quantity}</td>
                                <td>{formatPrice(item.unit_price || item.price)}</td>
                                <td>{formatPrice(item.total_price || item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="table-primary">
                              <th colSpan="3">Total</th>
                              <th>{formatPrice(order.total_amount)}</th>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <p className="text-muted">Loading order items...</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Cancellation Info */}
            {order.status === 'cancelled' && order.cancellation_reason && (
              <div className="row mt-3">
                <div className="col-12">
                  <div className="alert alert-danger">
                    <h6><i className="bi bi-x-circle me-2"></i>Order Cancelled</h6>
                    <p className="mb-0">
                      <strong>Reason:</strong> {order.cancellation_reason}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerOrderDetailsModal;
