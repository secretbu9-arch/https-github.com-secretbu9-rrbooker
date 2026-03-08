// components/common/NotificationPermission.js
import React, { useState, useEffect } from 'react';
import { PushService } from '../../services/notifications/PushService';

const NotificationPermission = ({ onPermissionGranted }) => {
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    checkPermissionStatus();

    // Check if the device is iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    // Check if the app is currently running as a Home Screen app (PWA)
    const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);
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
      // Initialize push service which will request permissions natively or web
      await PushService.initialize(true);

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
    if (isIOS && !isStandalone) {
      return {
        type: 'info',
        title: 'Action Required for iOS',
        message: 'To receive notifications on iOS, please tap the "Share" button and select "Add to Home Screen". Then open the app from your home screen.',
        showButton: false
      };
    }

    switch (permissionStatus) {
      case 'granted':
        return {
          type: 'success',
          title: 'Notifications Enabled',
          message: 'Notifications are enabled! You\'ll receive updates about your appointments.',
          showButton: false
        };
      case 'denied':
        return {
          type: 'warning',
          title: 'Notifications Blocked',
          message: 'Notifications are blocked. Please enable them in your browser settings to receive appointment updates.',
          showButton: false
        };
      case 'not-supported':
        return {
          type: 'info',
          title: 'Not Supported',
          message: 'Your browser doesn\'t support notifications. Consider using a mobile app for the best experience.',
          showButton: false
        };
      case 'error':
        return {
          type: 'danger',
          title: 'Error',
          message: 'There was an error checking notification permissions.',
          showButton: true
        };
      default:
        return {
          type: 'primary',
          title: 'Enable Notifications',
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
            <i className="bi bi-bell-fill fs-5"></i>
          ) : permissionStatus === 'denied' ? (
            <i className="bi bi-bell-slash fs-5"></i>
          ) : (
            <i className="bi bi-bell fs-5"></i>
          )}
        </div>
        <div className="flex-grow-1">
          <div className="alert-heading fw-bold mb-1 small">
            {statusInfo.title}
          </div>
          <div className="mb-0 small">{statusInfo.message}</div>
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








