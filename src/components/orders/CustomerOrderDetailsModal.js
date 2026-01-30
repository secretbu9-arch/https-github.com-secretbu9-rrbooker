import React from 'react';
import { formatPrice } from '../utils/helpers';

const CustomerOrderDetailsModal = ({ order, orderDetails, onClose }) => {
  if (!order) return null;

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'confirmed': return 'info';
      case 'ready_for_pickup': return 'info';
      case 'picked_up': return 'success';
      case 'completed': return 'success';
      case 'cancelled': return 'danger';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return 'bi-clock';
      case 'confirmed': return 'bi-check-circle';
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
                      <i 
                        className={`bi ${getStatusIcon(order.status)} display-4 text-${getStatusColor(order.status)}`}
                        style={{
                          color: (order.status === 'picked_up' || order.status === 'completed') ? '#ff6b35' : undefined
                        }}
                      ></i>
                    </div>
                    <h4 
                      className={`text-${getStatusColor(order.status)}`}
                      style={{
                        color: (order.status === 'picked_up' || order.status === 'completed') ? '#ff6b35' : undefined
                      }}
                    >
                      {getStatusText(order.status)}
                    </h4>
                    <p className="text-muted mb-0">
                      {order.status === 'pending' && 'Your order is waiting for confirmation'}
                      {order.status === 'confirmed' && 'Your order has been confirmed and will be prepared'}
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
                      <div className="d-flex justify-content-between align-items-center">
                        <strong>Total Amount:</strong>
                        <span className="h5 text-primary mb-0">{formatPrice(order.total_amount)}</span>
                      </div>
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
                    
                    <div className="mb-3">
                      <strong>Special Instructions:</strong>
                      <br />
                      <div className="bg-light p-2 rounded mt-1">
                        {order.notes && order.notes.trim() !== '' ? (
                          order.notes
                        ) : (
                          <span style={{ 
                            color: '#ff8c00', 
                            fontStyle: 'italic',
                            fontWeight: '500'
                          }}>
                            No additional order request
                          </span>
                        )}
                      </div>
                    </div>
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
                        <table className="table table-sm table-hover">
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th className="text-center">Qty</th>
                              <th className="text-end">Price</th>
                              <th className="text-end">Total</th>
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
                                        className="me-2 flex-shrink-0"
                                        style={{ width: '40px', height: '40px', objectFit: 'cover' }}
                                        onError={(e) => {
                                          e.target.src = 'https://via.placeholder.com/40x40?text=No+Image';
                                        }}
                                      />
                                    )}
                                    <div className="flex-grow-1">
                                      <strong className="d-block">{item.product?.name || item.name || item.product_name || 'N/A'}</strong>
                                    </div>
                                  </div>
                                </td>
                                <td className="text-center">{item.quantity}</td>
                                <td className="text-end">{formatPrice(item.unit_price || item.price)}</td>
                                <td className="text-end fw-semibold">{formatPrice(item.total_price || item.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="table-primary">
                              <th colSpan="3" className="text-end">Total Amount:</th>
                              <th className="text-end">{formatPrice(order.total_amount)}</th>
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
