import React, { useState, useEffect } from 'react';
import { formatPrice } from '../utils/helpers';

const OrderDetailsModal = ({ order, orderDetails, onClose, onStatusUpdate, onCancel }) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      zIndex: 1060,
      display: 'flex',
      alignItems: windowWidth < 576 ? 'flex-end' : 'center',
      justifyContent: 'center',
    },
    modal: {
      width: '100%',
      maxWidth: windowWidth < 576 ? '100%' : '800px',
      backgroundColor: '#fff',
      borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '28px',
      boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
      maxHeight: windowWidth < 576 ? '92vh' : '90vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: windowWidth < 576 ? 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)' : 'scaleIn 0.3s ease-out'
    },
    header: {
      padding: '1.5rem',
      borderBottom: '1px solid #f0f0f0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    content: {
      padding: '1.5rem',
      overflowY: 'auto',
      flex: 1
    },
    footer: {
      padding: '1.25rem 1.5rem',
      borderTop: '1px solid #f0f0f0',
      display: 'flex',
      gap: '12px',
      flexDirection: windowWidth < 450 ? 'column' : 'row'
    },
    sectionTitle: {
      fontSize: '0.85rem',
      fontWeight: '800',
      color: '#888',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      marginBottom: '1rem'
    },
    infoRow: {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '0.75rem',
      fontSize: '0.95rem'
    },
    badge: (status) => {
      const colors = {
        pending: { bg: '#FFF3E0', text: '#E65100' },
        confirmed: { bg: '#E3F2FD', text: '#0D47A1' },
        ready_for_pickup: { bg: '#E8F5E9', text: '#1B5E20' },
        picked_up: { bg: '#F3E5F5', text: '#4A148C' },
        cancelled: { bg: '#FFEBEE', text: '#B71C1C' },
      };
      const color = colors[status] || { bg: '#f5f5f5', text: '#666' };
      return {
        padding: '0.3rem 0.6rem',
        borderRadius: '8px',
        fontSize: '0.7rem',
        fontWeight: '700',
        backgroundColor: color.bg,
        color: color.text,
        textTransform: 'uppercase'
      };
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      fontWeight: '700',
      flex: 1,
      transition: 'all 0.2s'
    },
    secondaryBtn: {
      backgroundColor: '#f5f5f5',
      color: '#1a1a1a',
      border: 'none',
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      fontWeight: '700',
      flex: 1,
      transition: 'all 0.2s'
    },
    dangerBtn: {
      backgroundColor: 'transparent',
      color: '#dc3545',
      border: '1px solid #ff000022',
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      fontWeight: '700',
      flex: 1,
      transition: 'all 0.2s'
    }
  };

  const getNextAction = () => {
    if (order.status === 'pending') return { text: 'CONFIRM ORDER', action: 'confirmed', icon: 'check-circle' };
    if (order.status === 'confirmed') return { text: 'READY FOR PICKUP', action: 'ready_for_pickup', icon: 'box-seam' };
    if (order.status === 'ready_for_pickup') return { text: 'MARK AS PICKED UP', action: 'picked_up', icon: 'bag-check' };
    return null;
  };

  const nextAction = getNextAction();
  const canCancel = !['picked_up', 'cancelled', 'refunded'].includes(order.status);

  const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    try {
      return new Date(`2000-01-01T${timeString}`).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch (e) {
      return timeString;
    }
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        {/* Mobile Drag Indicator */}
        {windowWidth < 576 && (
          <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: '40px', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px' }}></div>
          </div>
        )}

        <div style={styles.header}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#888' }}>ORDER #{order.order_number}</span>
            <h5 style={{ margin: 0, fontWeight: '800' }}>Order Details</h5>
          </div>
          <button className="btn-close" onClick={onClose} style={{ transform: 'scale(0.8)' }}></button>
        </div>

        <div style={styles.content} className="premium-scroll">
          <div className="row g-4">
            <div className="col-md-6 border-end-sm">
              <div style={styles.sectionTitle}>Customer</div>
              <div className="d-flex align-items-center mb-3">
                <div style={{ width: '48px', height: '48px', backgroundColor: '#f0f0f0', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '1rem' }}>
                  <i className="bi bi-person text-muted" style={{ fontSize: '1.5rem' }}></i>
                </div>
                <div>
                  <div style={{ fontWeight: '700' }}>{order.customer?.full_name || order.customer_name || 'Guest User'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>{order.customer?.phone || order.customer_phone || 'No Phone'}</div>
                </div>
              </div>

              <div style={styles.sectionTitle}>Fulfillment</div>
              <div style={styles.infoRow}>
                <span className="text-muted">Status</span>
                <span style={styles.badge(order.status)}>{order.status.replace(/_/g, ' ')}</span>
              </div>
              <div style={styles.infoRow}>
                <span className="text-muted">Pickup Date</span>
                <span style={{ fontWeight: '600' }}>{order.pickup_date ? new Date(order.pickup_date).toLocaleDateString() : 'N/A'}</span>
              </div>
              <div style={styles.infoRow}>
                <span className="text-muted">Pickup Time</span>
                <span style={{ fontWeight: '600' }}>{formatTime(order.pickup_time)}</span>
              </div>
            </div>

            <div className="col-md-6">
              <div style={styles.sectionTitle}>Items Summary</div>
              {orderDetails?.items?.map((item, idx) => (
                <div key={idx} className="d-flex justify-content-between mb-3 align-items-center">
                  <div className="d-flex align-items-center">
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '0.75rem', overflow: 'hidden' }}>
                      {(item.product?.image_url || item.product_image_url) ? (
                        <img src={item.product?.image_url || item.product_image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <i className="bi bi-box text-muted"></i>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', lineHeight: 1.2 }}>{item.product?.name || item.product_name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#888' }}>{item.quantity} x {formatPrice(item.unit_price)}</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{formatPrice(item.total_price)}</div>
                </div>
              ))}
              
              <div className="border-top pt-3 mt-3">
                <div className="d-flex justify-content-between align-items-center">
                  <span style={{ fontWeight: '800' }}>Total Amount</span>
                  <span style={{ fontWeight: '800', fontSize: '1.25rem', color: '#5D4037' }}>{formatPrice(order.total_amount)}</span>
                </div>
              </div>
            </div>

            <div className="col-12">
              <div style={styles.sectionTitle}>Update Status</div>
              <div className="d-flex flex-column gap-2">
                {order.status === 'pending' && (
                  <button 
                    style={{ ...styles.primaryBtn, backgroundColor: '#E3F2FD', color: '#0D47A1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    className="touch-btn"
                    onClick={() => onStatusUpdate(order.id, 'confirmed')}
                  >
                    <i className="bi bi-check-circle me-2"></i> Confirm Order
                  </button>
                )}
                
                {order.status === 'confirmed' && (
                  <button 
                    style={{ ...styles.primaryBtn, backgroundColor: '#E8F5E9', color: '#1B5E20', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    className="touch-btn"
                    onClick={() => onStatusUpdate(order.id, 'ready_for_pickup')}
                  >
                    <i className="bi bi-box-seam me-2"></i> Ready for Pickup
                  </button>
                )}

                {order.status === 'ready_for_pickup' && (
                  <button 
                    style={{ ...styles.primaryBtn, backgroundColor: '#F3E5F5', color: '#4A148C', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    className="touch-btn"
                    onClick={() => onStatusUpdate(order.id, 'picked_up')}
                  >
                    <i className="bi bi-bag-check me-2"></i> Mark as Picked Up
                  </button>
                )}

                {canCancel && (
                  <button 
                    style={{ ...styles.dangerBtn, border: 'none', backgroundColor: '#FFEBEE', color: '#B71C1C', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.8rem' }}
                    className="touch-btn"
                    onClick={() => onCancel(order)}
                  >
                    <i className="bi bi-x-circle me-2"></i> Cancel Order
                  </button>
                )}
              </div>
            </div>

            {order.notes && (
              <div className="col-12">
                <div style={styles.sectionTitle}>Instructions</div>
                <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '16px', fontSize: '0.9rem', color: '#444' }}>
                  {order.notes}
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ ...styles.footer, justifyContent: 'center' }}>
          <button style={{ ...styles.secondaryBtn, maxWidth: '200px' }} className="touch-btn" onClick={onClose}>
            CLOSE DETAILS
          </button>
        </div>
      </div>

      <style>{`
        .touch-btn:active { transform: scale(0.96); }
        .premium-scroll::-webkit-scrollbar { width: 4px; }
        .premium-scroll::-webkit-scrollbar-thumb { background: #eee; border-radius: 10px; }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @media (min-width: 768px) {
          .border-end-sm { border-right: 1px solid #f0f0f0; }
        }
      `}</style>
    </div>
  );
};

export default OrderDetailsModal;
