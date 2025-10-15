import React from 'react';

const OrderConfirmationModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  order, 
  action = 'confirm',
  isLoading = false 
}) => {
  if (!isOpen) return null;

  const isConfirmAction = action === 'confirm';
  const isCancelAction = action === 'cancel';

  const getModalContent = () => {
    if (isConfirmAction) {
      return {
        title: 'Confirm Order',
        icon: 'bi-check-circle-fill',
        iconColor: 'text-success',
        message: `Are you sure you want to confirm this order?`,
        details: [
          `Order #${order?.order_number}`,
          `Customer: ${order?.customer?.full_name || 'Unknown'}`,
          `Total: $${order?.total_amount || '0.00'}`,
          `Pickup: ${order?.pickup_date} at ${order?.pickup_time}`
        ],
        confirmText: 'Confirm Order',
        confirmClass: 'btn-success',
        cancelText: 'Cancel'
      };
    } else if (isCancelAction) {
      return {
        title: 'Cancel Order',
        icon: 'bi-x-circle-fill',
        iconColor: 'text-danger',
        message: `Are you sure you want to cancel this order?`,
        details: [
          `Order #${order?.order_number}`,
          `Customer: ${order?.customer?.full_name || 'Unknown'}`,
          `Total: $${order?.total_amount || '0.00'}`,
          `Status: ${order?.status}`
        ],
        confirmText: 'Cancel Order',
        confirmClass: 'btn-danger',
        cancelText: 'Keep Order'
      };
    }
    return null;
  };

  const content = getModalContent();
  if (!content) return null;

  return (
    <div className="modal fade show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header border-0 pb-0">
            <h5 className="modal-title d-flex align-items-center">
              <i className={`bi ${content.icon} ${content.iconColor} me-2`}></i>
              {content.title}
            </h5>
            <button 
              type="button" 
              className="btn-close" 
              onClick={onClose}
              disabled={isLoading}
            ></button>
          </div>
          
          <div className="modal-body">
            <div className="alert alert-warning d-flex align-items-center mb-3">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              <span className="fw-medium">{content.message}</span>
            </div>
            
            <div className="card bg-light">
              <div className="card-body">
                <h6 className="card-title text-muted mb-3">Order Details</h6>
                <ul className="list-unstyled mb-0">
                  {content.details.map((detail, index) => (
                    <li key={index} className="mb-2">
                      <i className="bi bi-dot text-muted me-2"></i>
                      <span className="text-dark">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {isCancelAction && (
              <div className="mt-3">
                <label htmlFor="cancellationReason" className="form-label fw-medium">
                  Cancellation Reason (Optional)
                </label>
                <textarea
                  id="cancellationReason"
                  className="form-control"
                  rows="3"
                  placeholder="Enter reason for cancellation..."
                  ref={(el) => {
                    if (el) {
                      el.value = order?.cancellation_reason || '';
                    }
                  }}
                />
              </div>
            )}
          </div>
          
          <div className="modal-footer border-0 pt-0">
            <button 
              type="button" 
              className="btn btn-outline-secondary" 
              onClick={onClose}
              disabled={isLoading}
            >
              {content.cancelText}
            </button>
            <button 
              type="button" 
              className={`btn ${content.confirmClass}`}
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Processing...
                </>
              ) : (
                <>
                  <i className={`bi ${content.icon} me-2`}></i>
                  {content.confirmText}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationModal;