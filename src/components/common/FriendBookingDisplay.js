import React from 'react';

const FriendBookingDisplay = ({ appointment, variant = 'default' }) => {
  // Check if this is a friend/child booking
  if (!appointment.is_double_booking || !appointment.double_booking_data) {
    return null;
  }

  const friendData = appointment.double_booking_data;

  // Responsive design variants
  const getStyles = () => {
    switch (variant) {
      case 'compact':
        return {
          className: 'mt-1 p-2 rounded-3 border-start border-4 border-primary',
          background: '#f0f7ff',
          titleColor: '#0056b3',
          iconSize: '24px'
        };
      case 'card':
        return {
          className: 'mt-2 p-3 rounded-4 shadow-sm border border-primary border-opacity-10',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
          titleColor: '#003e85',
          iconSize: '28px'
        };
      case 'inline':
        return {
          className: 'mt-1 p-1 px-2 bg-primary bg-opacity-10 rounded border-start border-2 border-primary',
          background: 'transparent',
          titleColor: '#0d6efd',
          iconSize: '20px'
        };
      default:
        return {
          className: 'mt-2 p-3 rounded-3 border-start border-4 border-primary shadow-sm',
          background: '#f8fbff',
          titleColor: '#0056b3',
          iconSize: '24px'
        };
    }
  };

  const styles = getStyles();

  return (
    <div className={styles.className} style={{ background: styles.background }}>
      <div className="d-flex align-items-center mb-2">
        <div
          className="bg-primary bg-opacity-25 rounded-circle me-2 d-flex align-items-center justify-content-center"
          style={{ width: styles.iconSize, height: styles.iconSize }}
        >
          <i className="bi bi-person-heart text-primary small"></i>
        </div>
        <strong className="text-uppercase letter-spacing-1" style={{ color: styles.titleColor, fontSize: '0.65rem', fontWeight: '800' }}>
          Child / Guest Booking
        </strong>
      </div>

      <div className={variant === 'card' ? 'ms-1' : 'small ms-1'}>
        <div className="d-flex align-items-center mb-1">
          <span className="text-muted me-2" style={{ minWidth: '40px', fontSize: '0.8em' }}>Name:</span>
          <span className="fw-bold text-dark">{friendData.friend_name || 'Not provided'}</span>
        </div>

        {friendData.friend_phone && (
          <div className="d-flex align-items-center mb-1">
            <span className="text-muted me-2" style={{ minWidth: '40px', fontSize: '0.8em' }}>Phone:</span>
            <a
              href={`tel:${friendData.friend_phone}`}
              className="text-decoration-none fw-bold text-primary d-flex align-items-center"
            >
              <i className="bi bi-telephone-fill me-1" style={{ fontSize: '0.7rem' }}></i>
              {friendData.friend_phone}
            </a>
          </div>
        )}

        <div className="d-flex align-items-center mt-2 pt-1 border-top border-dark border-opacity-10 opacity-75">
          <span className="text-muted me-2 extra-small">Guardian:</span>
          <span className="extra-small fw-medium text-dark">{friendData.booked_by || 'Primary Account'}</span>
        </div>
      </div>
    </div>
  );
};

export default FriendBookingDisplay;
