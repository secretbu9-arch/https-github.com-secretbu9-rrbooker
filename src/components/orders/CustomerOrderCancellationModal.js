import React, { useState } from 'react';

const CustomerOrderCancellationModal = ({ order, onConfirm, onCancel, isLoading = false }) => {
  const [reason, setReason] = useState('');

  const predefinedReasons = [
    'Changed my mind',
    'Found a better option',
    'No longer needed',
    'Scheduling conflict',
    'Other'
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (reason.trim()) {
      onConfirm(order.id, reason);
    }
  };

  if (!order) return null;

  return (
    <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header bg-warning text-dark">
            <h5 className="modal-title">
              <i className="bi bi-exclamation-triangle me-2"></i>
              Cancel Order
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onCancel}
              disabled={isLoading}
            ></button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="alert alert-info">
                <i className="bi bi-info-circle me-2"></i>
                <strong>Note:</strong> You can only cancel orders that are still pending confirmation.
              </div>

              <div className="mb-3">
                <strong>Order Details:</strong>
                <div className="bg-light p-3 rounded mt-2">
                  <div className="row">
                    <div className="col-md-6">
                      <strong>Order #:</strong><br />
                      #{order.order_number || order.id.slice(-8)}
                    </div>
                    <div className="col-md-6">
                      <strong>Total:</strong><br />
                      <span className="text-primary">₱{order.total_amount}</span>
                    </div>
                  </div>
                  <div className="row mt-2">
                    <div className="col-md-6">
                      <strong>Status:</strong><br />
                      <span className="badge bg-warning">Pending Confirmation</span>
                    </div>
                    <div className="col-md-6">
                      <strong>Pickup Date:</strong><br />
                      {order.pickup_date ? new Date(order.pickup_date).toLocaleDateString() : 'Not set'}
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

              <div className="mb-3">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="confirmCancellation"
                    required
                    disabled={isLoading}
                  />
                  <label className="form-check-label" htmlFor="confirmCancellation">
                    I understand that this action cannot be undone
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
                className="btn btn-warning"
                disabled={isLoading || !reason}
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

export default CustomerOrderCancellationModal;


