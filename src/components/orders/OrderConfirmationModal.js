import React, { useState, useEffect } from 'react';

const OrderConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  order,
  action = 'confirm',
  isLoading = false
}) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isOpen) return null;

  const isConfirmAction = action === 'confirm';
  const styles = {
    overlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(8px)',
      zIndex: 1100,
      display: 'flex',
      alignItems: windowWidth < 576 ? 'flex-end' : 'center',
      justifyContent: 'center',
    },
    modal: {
      width: '100%',
      maxWidth: windowWidth < 576 ? '100%' : '440px',
      backgroundColor: '#fff',
      borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '28px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      overflow: 'hidden',
      animation: windowWidth < 576 ? 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)' : 'scaleIn 0.3s ease-out'
    },
    header: {
      padding: '1.5rem 1.5rem 1rem',
      textAlign: 'center'
    },
    body: {
      padding: '0 1.5rem 1.5rem',
      textAlign: 'center'
    },
    footer: {
      padding: '1.25rem 1.5rem',
      display: 'flex',
      gap: '12px',
      flexDirection: 'column'
    },
    iconCircle: {
      width: '64px',
      height: '64px',
      borderRadius: '50%',
      margin: '0 auto 1.25rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isConfirmAction ? '#E8F5E9' : '#FFEBEE',
      color: isConfirmAction ? '#2E7D32' : '#C62828',
      fontSize: '2rem'
    },
    primaryBtn: {
      backgroundColor: isConfirmAction ? '#1a1a1a' : '#C62828',
      color: '#fff',
      border: 'none',
      padding: '0.9rem',
      borderRadius: '16px',
      fontWeight: '800',
      width: '100%',
      transition: 'all 0.2s'
    },
    secondaryBtn: {
      backgroundColor: 'transparent',
      color: '#1a1a1a',
      border: 'none',
      padding: '0.8rem',
      borderRadius: '16px',
      fontWeight: '700',
      width: '100%',
      opacity: 0.6
    },
    detailsCard: {
      backgroundColor: '#f8f8f8',
      borderRadius: '20px',
      padding: '1rem',
      marginTop: '1.25rem',
      textAlign: 'left'
    }
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        {windowWidth < 576 && (
          <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '40px', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px' }}></div>
          </div>
        )}

        <div style={styles.header}>
          <div style={styles.iconCircle}>
            <i className={`bi bi-${isConfirmAction ? 'check2-circle' : 'exclamation-triangle'}`}></i>
          </div>
          <h4 style={{ fontWeight: '800', margin: 0 }}>{isConfirmAction ? 'Confirm Order' : 'Cancel Order'}</h4>
        </div>

        <div style={styles.body}>
          <p className="text-muted mb-0">
            {isConfirmAction 
              ? 'Are you ready to process and confirm this customer order?' 
              : 'Are you sure you want to cancel this order? This action may notify the customer.'}
          </p>

          <div style={styles.detailsCard}>
            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>Order Preview</div>
            <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>#{order?.order_number}</div>
            <div className="small text-muted">{order?.customer?.full_name || 'Guest Customer'}</div>
            <div style={{ fontWeight: '800', color: '#5D4037', marginTop: '4px' }}>₱{parseFloat(order?.total_amount || 0).toLocaleString()}</div>
          </div>

          {!isConfirmAction && (
            <div className="mt-3 text-start">
              <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#888', marginBottom: '4px' }}>REASON FOR CANCELLATION</label>
              <textarea 
                className="form-control rounded-4 border-0 bg-light" 
                rows="2"
                id="cancellationReason"
                placeholder="Optional reason..."
                style={{ fontSize: '0.9rem' }}
              ></textarea>
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button 
            style={styles.primaryBtn} 
            className="touch-btn"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="spinner-border spinner-border-sm"></span>
            ) : (
              isConfirmAction ? 'YES, CONFIRM ORDER' : 'YES, CANCEL ORDER'
            )}
          </button>
          <button 
            style={styles.secondaryBtn} 
            className="touch-btn"
            onClick={onClose}
            disabled={isLoading}
          >
            DISMISS
          </button>
        </div>
      </div>

      <style>{`
        .touch-btn:active { transform: scale(0.96); }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default OrderConfirmationModal;