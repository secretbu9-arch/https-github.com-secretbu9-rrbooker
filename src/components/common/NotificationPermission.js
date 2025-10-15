// components/common/NotificationPermission.js
import React, { useState, useEffect } from 'react';
import { PushService } from '../../services/PushService';

const NotificationPermission = ({ onPermissionGranted }) => {
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [isRequesting, setIsRequesting] = useState(false);

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    try {
      // Check browser notification permission
      if ('Notification' in window) {
        setPermissionStatus(Notification.permission);
      } else {
        setPermissionStatus('not-supported');
      }
    } catch (error) {
      console.error('Error checking permission status:', error);
      setPermissionStatus('error');
    }
  };

  const requestPermission = async () => {
    setIsRequesting(true);
    try {
      // Initialize push service which will request permissions
      await PushService.initialize();
      
      // Check status after initialization
      await checkPermissionStatus();
      
      if (onPermissionGranted) {
        onPermissionGranted();
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  const getStatusMessage = () => {
    switch (permissionStatus) {
      case 'granted':
        return {
          type: 'success',
          message: 'Notifications are enabled! You\'ll receive updates about your appointments.',
          showButton: false
        };
      case 'denied':
        return {
          type: 'warning',
          message: 'Notifications are blocked. Please enable them in your browser settings to receive appointment updates.',
          showButton: false
        };
      case 'not-supported':
        return {
          type: 'info',
          message: 'Your browser doesn\'t support notifications. Consider using a mobile app for the best experience.',
          showButton: false
        };
      case 'error':
        return {
          type: 'danger',
          message: 'There was an error checking notification permissions.',
          showButton: true
        };
      default:
        return {
          type: 'primary',
          message: 'Enable notifications to receive real-time updates about your appointments, queue status, and booking confirmations.',
          showButton: true
        };
    }
  };

  const statusInfo = getStatusMessage();

  if (permissionStatus === 'granted') {
    return null; // Don't show anything if permission is already granted
  }

  return (
    <div className={`alert alert-${statusInfo.type} alert-dismissible fade show`} role="alert">
      <div className="d-flex align-items-center">
        <div className="me-3">
          {permissionStatus === 'granted' ? (
            <i className="bi bi-bell-fill fs-4"></i>
          ) : permissionStatus === 'denied' ? (
            <i className="bi bi-bell-slash fs-4"></i>
          ) : (
            <i className="bi bi-bell fs-4"></i>
          )}
        </div>
        <div className="flex-grow-1">
          <h6 className="alert-heading mb-1">
            {permissionStatus === 'granted' ? 'Notifications Enabled' : 
             permissionStatus === 'denied' ? 'Notifications Blocked' : 
             'Enable Notifications'}
          </h6>
          <p className="mb-0">{statusInfo.message}</p>
        </div>
        {statusInfo.showButton && (
          <div className="ms-3">
            <button
              className="btn btn-sm btn-outline-primary"
              onClick={requestPermission}
              disabled={isRequesting}
            >
              {isRequesting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  Enabling...
                </>
              ) : (
                <>
                  <i className="bi bi-bell me-1"></i>
                  Enable Notifications
                </>
              )}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn-close"
        data-bs-dismiss="alert"
        aria-label="Close"
        onClick={() => setPermissionStatus('dismissed')}
      ></button>
    </div>
  );
};

export default NotificationPermission;








