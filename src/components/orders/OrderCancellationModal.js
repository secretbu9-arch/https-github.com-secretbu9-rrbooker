import React, { useState, useEffect } from 'react';

const OrderCancellationModal = ({ order, onConfirm, onCancel, isLoading = false }) => {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      maxWidth: windowWidth < 576 ? '100%' : '480px',
      backgroundColor: '#fff',
      borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '28px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      overflow: 'hidden',
      animation: windowWidth < 576 ? 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)' : 'scaleIn 0.3s ease-out'
    },
    header: {
      padding: '1.75rem 1.5rem 1rem',
      textAlign: 'center'
    },
    body: {
      padding: '0 1.5rem 1.5rem',
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
      backgroundColor: '#FFEBEE',
      color: '#C62828',
      fontSize: '2rem'
    },
    primaryBtn: {
      backgroundColor: '#C62828',
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
    input: {
      backgroundColor: '#f8f8f8',
      border: 'none',
      borderRadius: '16px',
      padding: '0.8rem 1rem',
      fontSize: '0.95rem',
      width: '100%',
      marginBottom: '1rem'
    }
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={styles.modal}>
        {windowWidth < 576 && (
          <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '40px', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px' }}></div>
          </div>
        )}

        <div style={styles.header}>
          <div style={styles.iconCircle}>
            <i className="bi bi-x-circle"></i>
          </div>
          <h4 style={{ fontWeight: '800', margin: 0 }}>Cancel Order</h4>
          <p className="text-muted small mt-2">This will notify {order.customer_name || 'the customer'} about the cancellation.</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.body}>
          <label style={{ fontSize: '0.75rem', fontWeight: '800', color: '#888', marginBottom: '8px', display: 'block' }}>REASON FOR CANCELLATION</label>
          <select
            style={styles.input}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            disabled={isLoading}
          >
            <option value="">Select a reason...</option>
            {predefinedReasons.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {reason === 'Other' && (
            <textarea
              style={styles.input}
              rows="3"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Tell us why..."
              required
              disabled={isLoading}
            />
          )}

          <div style={styles.footer}>
            <button 
              type="submit"
              style={styles.primaryBtn} 
              className="touch-btn"
              disabled={isLoading || !reason || (reason === 'Other' && !customReason.trim())}
            >
              {isLoading ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                'YES, CANCEL ORDER'
              )}
            </button>
            <button 
              type="button"
              style={styles.secondaryBtn} 
              className="touch-btn"
              onClick={onCancel}
              disabled={isLoading}
            >
              KEEP ORDER
            </button>
          </div>
        </form>

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
    </div>
  );
};

export default OrderCancellationModal;
