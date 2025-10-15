// components/common/CaptchaVerification.js
import React, { useState, useEffect, useRef } from 'react';

const CaptchaVerification = ({ onVerify, onError, siteKey, theme = 'light' }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState('');
  const captchaRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    // Load Google reCAPTCHA script
    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setIsLoaded(true);
    };
    script.onerror = () => {
      setError('Failed to load CAPTCHA. Please refresh the page.');
      onError && onError('Failed to load CAPTCHA');
    };
    
    document.head.appendChild(script);

    return () => {
      // Cleanup
      if (widgetIdRef.current && window.grecaptcha) {
        window.grecaptcha.reset(widgetIdRef.current);
      }
    };
  }, [onError]);

  const handleCaptchaCallback = (token) => {
    setIsVerified(true);
    setError('');
    onVerify && onVerify(token);
  };

  const handleCaptchaExpired = () => {
    setIsVerified(false);
    onVerify && onVerify(null);
  };

  const handleCaptchaError = () => {
    setError('CAPTCHA verification failed. Please try again.');
    setIsVerified(false);
    onError && onError('CAPTCHA verification failed');
  };

  const resetCaptcha = () => {
    if (widgetIdRef.current && window.grecaptcha) {
      window.grecaptcha.reset(widgetIdRef.current);
      setIsVerified(false);
      setError('');
    }
  };

  if (!isLoaded) {
    return (
      <div className="captcha-loading">
        <div className="spinner-border spinner-border-sm me-2" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        Loading CAPTCHA...
      </div>
    );
  }

  return (
    <div className="captcha-container">
      <div 
        className="g-recaptcha"
        data-sitekey={siteKey}
        data-callback={handleCaptchaCallback}
        data-expired-callback={handleCaptchaExpired}
        data-error-callback={handleCaptchaError}
        data-theme={theme}
        ref={captchaRef}
      />
      
      {error && (
        <div className="alert alert-danger mt-2" role="alert">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}
      
      {isVerified && (
        <div className="alert alert-success mt-2" role="alert">
          <i className="bi bi-check-circle me-2"></i>
          CAPTCHA verified successfully
        </div>
      )}
      
      <div className="mt-2">
        <small className="text-muted">
          <i className="bi bi-shield-check me-1"></i>
          This site is protected by reCAPTCHA and the Google 
          <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer"> Privacy Policy</a> and 
          <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer"> Terms of Service</a> apply.
        </small>
      </div>
    </div>
  );
};

export default CaptchaVerification;
