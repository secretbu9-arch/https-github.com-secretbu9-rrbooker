// components/common/NotificationPermission.js
import React, { useState, useEffect } from 'react';
import { PushService } from '../../services/notifications/PushService';

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

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

  const getStatusMessage = () => {
    // Special case for iOS browser (not added to home screen)
    if (isIOS && !isStandalone) {
      return {
        type: 'info',
        message: 'To receive real-time notifications on iPhone, you must add this app to your Home Screen.',
        showButton: false,
        icon: 'bi-iphone'
      };
    }

    switch (permissionStatus) {
      case 'granted':
        return {
          type: 'success',
          message: 'Notifications are enabled! You\'ll receive updates about your appointments.',
          showButton: false,
          icon: 'bi-bell-fill'
        };
      case 'denied':
        return {
          type: 'warning',
          message: 'Notifications are blocked. Please enable them in your browser settings to receive appointment updates.',
          showButton: false,
          icon: 'bi-bell-slash'
        };
      case 'not-supported':
        return {
          type: 'info',
          message: 'Your browser doesn\'t support notifications. Consider using a mobile app for the best experience.',
          showButton: false,
          icon: 'bi-info-circle'
        };
      case 'error':
        return {
          type: 'danger',
          message: 'There was an error checking notification permissions.',
          showButton: true,
          icon: 'bi-exclamation-triangle'
        };
      default:
        return {
          type: 'primary',
          message: 'Enable notifications to receive real-time updates about your appointments, queue status, and booking confirmations.',
          showButton: true,
          icon: 'bi-bell'
        };
    }
  };

  const statusInfo = getStatusMessage();

  // On iOS, we only hide if granted AND standalone
  if (permissionStatus === 'granted' && (!isIOS || isStandalone)) {
    return null;
  }

  return (
    <div className={`alert alert-${statusInfo.type} alert-dismissible fade show border-0 shadow-sm`} role="alert" style={{ borderRadius: '12px' }}>
      <div className="d-flex align-items-center">
        <div className="me-3">
          <i className={`bi ${statusInfo.icon} fs-5 text-${statusInfo.type}`}></i>
        </div>
        <div className="flex-grow-1">
          <div className="alert-heading fw-bold mb-1 small">
            {isIOS && !isStandalone ? 'Action Required: Mobile Notifications' :
              permissionStatus === 'granted' ? 'Notifications Enabled' :
                permissionStatus === 'denied' ? 'Notifications Blocked' :
                  'Enable Notifications'}
          </div>
          <div className="mb-0 small" style={{ lineHeight: '1.4' }}>
            {isIOS && !isStandalone ? (
              <span>
                To get notifications on iPhone: <br />
                1. Tap the <strong>Share</strong> button <i className="bi bi-box-arrow-up mx-1"></i> (bottom of Safari) <br />
                2. Scroll down and tap <strong>"Add to Home Screen"</strong> <br />
                3. Open the app from your home screen and enable notifications there.
              </span>
            ) : statusInfo.message}
          </div>
        </div>
        {statusInfo.showButton && (
          <div className="ms-3">
            <button
              className="btn btn-sm btn-primary rounded-pill px-3"
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
                  Enable
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








