import React from 'react';
import { formatPrice } from '../utils/helpers';

const OrderDetailsModal = ({ order, orderDetails, onClose, onStatusUpdate, onCancel }) => {
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

  const canCancel = order.status !== 'cancelled' && order.status !== 'picked_up';
  const canUpdateStatus = order.status !== 'cancelled' && order.status !== 'picked_up';

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl">
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
                      <strong>Order ID:</strong>
                      <br />
                      <code>{order.id}</code>
                    </div>
                    
                    <div className="mb-3">
                      <strong>Order Number:</strong>
                      <br />
                      {order.order_number || 'N/A'}
                    </div>
                    
                    <div className="mb-3">
                      <strong>Status:</strong>
                      <br />
                      <span className={`badge bg-${getStatusColor(order.status)}`}>
                        <i className={`bi ${getStatusIcon(order.status)} me-1`}></i>
                        {order.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="mb-3">
                      <strong>Total Amount:</strong>
                      <br />
                      <span className="h5 text-primary">{formatPrice(order.total_amount)}</span>
                    </div>
                    
                    <div className="mb-3">
                      <strong>Created:</strong>
                      <br />
                      {new Date(order.created_at).toLocaleString()}
                    </div>
                    
                    {order.updated_at && order.updated_at !== order.created_at && (
                      <div className="mb-3">
                        <strong>Last Updated:</strong>
                        <br />
                        {new Date(order.updated_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Customer Information */}
              <div className="col-md-6">
                <div className="card h-100">
                  <div className="card-header">
                    <h6 className="mb-0">
                      <i className="bi bi-person me-2"></i>
                      Customer Information
                    </h6>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <strong>Name:</strong>
                      <br />
                      {order.customer?.full_name || order.customer_name || 'N/A'}
                    </div>
                    
                    <div className="mb-3">
                      <strong>Email:</strong>
                      <br />
                      <a href={`mailto:${order.customer?.email || order.customer_email}`}>
                        {order.customer?.email || order.customer_email || 'N/A'}
                      </a>
                    </div>
                    
                    <div className="mb-3">
                      <strong>Phone:</strong>
                      <br />
                      <a href={`tel:${order.customer?.phone || order.customer_phone}`}>
                        {order.customer?.phone || order.customer_phone || 'N/A'}
                      </a>
                    </div>
                    
                    <div className="mb-3">
                      <strong>Customer ID:</strong>
                      <br />
                      <code>{order.customer_id}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pickup Information */}
            <div className="row mt-3">
              <div className="col-md-6">
                <div className="card">
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
                      {order.pickup_date ? new Date(order.pickup_date).toLocaleDateString() : 'N/A'}
                    </div>
                    
                    <div className="mb-3">
                      <strong>Pickup Time:</strong>
                      <br />
                      {order.pickup_time || 'N/A'}
                    </div>
                    
                    <div className="mb-3">
                      <strong>Pickup Location:</strong>
                      <br />
                      {order.pickup_location || 'R&R Barber Shop'}
                    </div>
                    
                    {order.notes && (
                      <div className="mb-3">
                        <strong>Notes:</strong>
                        <br />
                        <div className="bg-light p-2 rounded">
                          {order.notes}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="col-md-6">
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
                                    {(item.product?.image_url || item.product_image_url) && (
                                      <img
                                        src={item.product?.image_url || item.product_image_url}
                                        alt={item.product?.name || item.product_name || 'Product'}
                                        className="me-2"
                                        style={{ width: '30px', height: '30px', objectFit: 'cover' }}
                                        onError={(e) => {
                                          e.target.src = 'https://via.placeholder.com/30x30?text=No+Image';
                                        }}
                                      />
                                    )}
                                    <div>
                                      <strong>{item.product?.name || item.product_name || 'Unknown Product'}</strong>
                                      {(item.product?.description || item.product_description) && (
                                        <>
                                          <br />
                                          <small className="text-muted">{item.product?.description || item.product_description}</small>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className="badge bg-primary">{item.quantity}</span>
                                </td>
                                <td>{formatPrice(item.unit_price)}</td>
                                <td>
                                  <strong>{formatPrice(item.total_price)}</strong>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="table-active">
                              <td colSpan="3" className="text-end">
                                <strong>Order Total:</strong>
                              </td>
                              <td>
                                <strong className="text-success">{formatPrice(order.total_amount)}</strong>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-3">
                        <i className="bi bi-basket display-4 text-muted"></i>
                        <p className="text-muted mt-2">
                          {orderDetails ? 'No items found in this order' : 'Loading order items...'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Close
            </button>
            
            {canCancel && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => onCancel(order)}
              >
                <i className="bi bi-x-circle me-1"></i>
                Cancel Order
              </button>
            )}
            
            {canUpdateStatus && (
              <div className="btn-group">
                {order.status === 'pending' && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => onStatusUpdate(order.id, 'confirmed')}
                  >
                    <i className="bi bi-check-circle me-1"></i>
                    Confirm
                  </button>
                )}
                
                {order.status === 'confirmed' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onStatusUpdate(order.id, 'preparing')}
                  >
                    <i className="bi bi-gear me-1"></i>
                    Start Preparing
                  </button>
                )}
                
                {order.status === 'preparing' && (
                  <button
                    type="button"
                    className="btn btn-warning"
                    onClick={() => onStatusUpdate(order.id, 'ready_for_pickup')}
                  >
                    <i className="bi bi-box-seam me-1"></i>
                    Ready for Pickup
                  </button>
                )}
                
                {order.status === 'ready_for_pickup' && (
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => onStatusUpdate(order.id, 'picked_up')}
                  >
                    <i className="bi bi-check2-all me-1"></i>
                    Mark as Picked Up
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsModal;
