// components/common/LoadingSpinner.js
import React from 'react';

const LoadingSpinner = ({ size = 'medium', text = 'Loading...' }) => {
  // Size classes
  const sizeClasses = {
    small: 'spinner-border-sm',
    medium: '',
    large: 'spinner-border-lg'
  };

  return (
    <div className="d-flex flex-column justify-content-center align-items-center min-vh-50 py-5">
      <div className={`spinner-border text-primary ${sizeClasses[size]}`} role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
      {text && <p className="mt-3 text-muted">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;