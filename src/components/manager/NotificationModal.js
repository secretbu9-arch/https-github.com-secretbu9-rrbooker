// components/manager/NotificationModal.js
import React from 'react';

const NotificationModal = ({ 
  isOpen, 
  onClose, 
  type, 
  title, 
  message, 
  appointmentData,
  onConfirm,
  loading = false 
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'approve':
        return 'bi-check-circle-fill text-success';
      case 'reject':
        return 'bi-x-circle-fill text-danger';
      case 'warning':
        return 'bi-exclamation-triangle-fill text-warning';
      case 'info':
        return 'bi-info-circle-fill text-info';
      default:
        return 'bi-question-circle-fill text-secondary';
    }
  };

  const getButtonClass = () => {
    switch (type) {
      case 'approve':
        return 'btn-success';
      case 'reject':
        return 'btn-danger';
      case 'warning':
        return 'btn-warning';
      case 'info':
        return 'btn-primary';
      default:
        return 'btn-primary';
    }
  };

  const getButtonText = () => {
    switch (type) {
      case 'approve':
        return 'Approve Appointment';
      case 'reject':
        return 'Reject Appointment';
      case 'warning':
        return 'Continue';
      case 'info':
        return 'Confirm';
      default:
        return 'Confirm';
    }
  };

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title d-flex align-items-center">
              <i className={`bi ${getIcon()} me-2`}></i>
              {title}
            </h5>
            <button 
              type="button" 
              className="btn-close" 
              onClick={onClose}
              disabled={loading}
            ></button>
          </div>
          
          <div className="modal-body">
            <p className="mb-3">{message}</p>
            
            {appointmentData && (
              <div className="card bg-light">
                <div className="card-body">
                  <h6 className="card-title">Appointment Details</h6>
                  <div className="row">
                    <div className="col-6">
                      <small className="text-muted">Customer:</small>
                      <div className="fw-medium">{appointmentData.customer?.full_name || 'N/A'}</div>
                    </div>
                    <div className="col-6">
                      <small className="text-muted">Barber:</small>
                      <div className="fw-medium">{appointmentData.barber?.full_name || 'N/A'}</div>
                    </div>
                    <div className="col-6 mt-2">
                      <small className="text-muted">Date:</small>
                      <div className="fw-medium">{appointmentData.appointment_date || 'N/A'}</div>
                    </div>
                    <div className="col-6 mt-2">
                      <small className="text-muted">Time:</small>
                      <div className="fw-medium">{appointmentData.appointment_time || 'Queue-based'}</div>
                    </div>
                    {appointmentData.queue_position && (
                      <div className="col-12 mt-2">
                        <small className="text-muted">Queue Position:</small>
                        <div className="fw-medium">#{appointmentData.queue_position}</div>
                      </div>
                    )}
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
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className={`btn ${getButtonClass()}`}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Processing...
                </>
              ) : (
                <>
                  <i className={`bi ${type === 'approve' ? 'bi-check' : type === 'reject' ? 'bi-x' : 'bi-check'} me-1`}></i>
                  {getButtonText()}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;

