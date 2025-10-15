import React, { useState } from 'react';

const OrderCancellationModal = ({ order, onConfirm, onCancel, isLoading = false }) => {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const predefinedReasons = [
    'Customer requested cancellation',
    'Out of stock',
    'Customer did not show up',
    'Payment issue',
    'Fraud detected',
    'Other'
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const cancellationReason = reason === 'Other' ? customReason : reason;
    if (cancellationReason.trim()) {
      onConfirm(order.id, cancellationReason);
    }
  };

  if (!order) return null;

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header bg-danger text-white">
            <h5 className="modal-title">
              <i className="bi bi-exclamation-triangle me-2"></i>
              Cancel Order
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onCancel}
              disabled={isLoading}
            ></button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="alert alert-warning">
                <i className="bi bi-exclamation-triangle me-2"></i>
                <strong>Warning:</strong> This action cannot be undone. The customer will be notified of the cancellation.
              </div>

              <div className="mb-3">
                <strong>Order Details:</strong>
                <div className="bg-light p-3 rounded mt-2">
                  <div className="row">
                    <div className="col-md-6">
                      <strong>Order ID:</strong><br />
                      <code>{order.id}</code>
                    </div>
                    <div className="col-md-6">
                      <strong>Customer:</strong><br />
                      {order.customer_name || 'N/A'}
                    </div>
                  </div>
                  <div className="row mt-2">
                    <div className="col-md-6">
                      <strong>Total Amount:</strong><br />
                      <span className="text-primary">${order.total_amount}</span>
                    </div>
                    <div className="col-md-6">
                      <strong>Status:</strong><br />
                      <span className="badge bg-warning">{order.status}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label">
                  <strong>Reason for Cancellation *</strong>
                </label>
                <select
                  className="form-select"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  disabled={isLoading}
                >
                  <option value="">Select a reason...</option>
                  {predefinedReasons.map((predefinedReason) => (
                    <option key={predefinedReason} value={predefinedReason}>
                      {predefinedReason}
                    </option>
                  ))}
                </select>
              </div>

              {reason === 'Other' && (
                <div className="mb-3">
                  <label className="form-label">
                    <strong>Custom Reason *</strong>
                  </label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Please provide details for the cancellation..."
                    required
                    disabled={isLoading}
                  />
                </div>
              )}

              <div className="mb-3">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="notifyCustomer"
                    defaultChecked
                    disabled={isLoading}
                  />
                  <label className="form-check-label" htmlFor="notifyCustomer">
                    Notify customer via email and push notification
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={isLoading}
              >
                Keep Order
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={isLoading || !reason || (reason === 'Other' && !customReason.trim())}
              >
                {isLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Cancelling...
                  </>
                ) : (
                  <>
                    <i className="bi bi-x-circle me-1"></i>
                    Cancel Order
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default OrderCancellationModal;


