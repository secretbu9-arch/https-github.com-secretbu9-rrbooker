import React from 'react';

const FriendBookingDisplay = ({ appointment, variant = 'default' }) => {
  // Check if this is a friend/child booking
  if (!appointment.is_double_booking || !appointment.double_booking_data) {
    return null;
  }

  const friendData = appointment.double_booking_data;
  
  // Responsive design variants
  const getVariantClasses = () => {
    switch (variant) {
      case 'compact':
        return 'friend-booking-compact mt-1 p-2 bg-info bg-opacity-10 rounded border-start border-2 border-info';
      case 'card':
        return 'friend-booking-card mt-2 p-3 bg-info bg-opacity-10 rounded border border-info shadow-sm';
      case 'inline':
        return 'friend-booking-inline mt-1 p-1 bg-info bg-opacity-10 rounded border-start border-2 border-info';
      default:
        return 'friend-booking-info mt-2 p-2 bg-info bg-opacity-10 rounded border-start border-3 border-info';
    }
  };

  const getHeaderClasses = () => {
    switch (variant) {
      case 'compact':
        return 'd-flex align-items-center mb-1';
      case 'card':
        return 'd-flex align-items-center mb-2';
      case 'inline':
        return 'd-flex align-items-center mb-1';
      default:
        return 'd-flex align-items-center mb-1';
    }
  };

  const getTextClasses = () => {
    switch (variant) {
      case 'compact':
        return 'small';
      case 'card':
        return '';
      case 'inline':
        return 'small';
      default:
        return 'small';
    }
  };

  const getIconSize = () => {
    switch (variant) {
      case 'card':
        return 'fs-5';
      case 'inline':
        return 'fs-6';
      default:
        return '';
    }
  };
  
  return (
    <div className={getVariantClasses()}>
      <div className={getHeaderClasses()}>
        <i className={`bi bi-person-plus text-info me-2 ${getIconSize()}`}></i>
        <strong className={`text-info ${variant === 'card' ? '' : 'small'}`}>
          Booked for Friend/Child
        </strong>
      </div>
      <div className={getTextClasses()}>
        <div className="mb-1">
          <strong>Name:</strong> 
          <span className="ms-1">{friendData.friend_name || 'Not provided'}</span>
        </div>
        {friendData.friend_phone && (
          <div className="mb-1">
            <strong>Phone:</strong> 
            <a 
              href={`tel:${friendData.friend_phone}`} 
              className="ms-1 text-decoration-none text-info fw-medium"
            >
              <i className="bi bi-telephone me-1"></i>
              {friendData.friend_phone}
            </a>
          </div>
        )}
        <div className="text-muted">
          <strong>Booked by:</strong> 
          <span className="ms-1">{friendData.booked_by || 'Unknown'}</span>
        </div>
      </div>
    </div>
  );
};

export default FriendBookingDisplay;
