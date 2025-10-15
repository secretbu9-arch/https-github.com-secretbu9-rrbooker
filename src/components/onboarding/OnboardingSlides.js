// components/onboarding/OnboardingSlides.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PushService } from '../../services/PushService';
import './OnboardingSlides.css';

// Import our barbershop SVG illustrations
import { 
  HaircutIllustration, 
  BookingIllustration 
} from '../illustrations/BarberIllustrations';

// Logo Component using rrbooker-logo-3.png
const BarberShopLogo = () => (
  <div className="barber-logo">
    <div className="logo-image-container">
      <img 
        src="/rrbooker-logo-3.png" 
        alt="R&R Booker Logo" 
        className="logo-image"
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'block';
        }}
      />
      <span className="logo-fallback-text" style={{ display: 'none' }}>R&R</span>
    </div>
  </div>
);

const OnboardingSlides = ({ onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState('unknown');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (onComplete) {
        onComplete();
      }
    };
  }, [onComplete]);

  const handleComplete = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    
    if (onComplete) {
      onComplete();
    }
  };

  const handleSkip = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    
    if (onComplete) {
      onComplete();
    }
  };

  const handleNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleComplete();
    }
  };

  const handleRequestNotificationPermission = async () => {
    setIsRequestingPermission(true);
    try {
      await PushService.initialize();
      setNotificationPermission('granted');
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      setNotificationPermission('denied');
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleSkipNotification = () => {
    setNotificationPermission('skipped');
    handleNextSlide();
  };

  const slides = [
    {
      title: "R&R BOOKER",
      subtitle: "BARBERSHOP",
      description: "Experience the traditional barbershop service with a modern twist.",
      Illustration: BarberShopLogo
    },
    {
      title: "Premium Services",
      subtitle: "Expert Haircuts & Styling",
      description: "Our experienced barbers are dedicated to helping you look your best with precision cuts and styling.",
      Illustration: HaircutIllustration
    },
    {
      title: "Easy Booking",
      subtitle: "At Your Convenience",
      description: "Book appointments with your favorite barbers anytime, anywhere with just a few taps.",
      Illustration: BookingIllustration
    },
    {
      title: "Stay Updated",
      subtitle: "Enable Notifications",
      description: "Get real-time updates about your appointments, queue status, and booking confirmations.",
      isNotificationSlide: true
    }
  ];

  // Current slide data
  const slide = slides[currentSlide];
  const Illustration = slide.Illustration;

  return (
    <div className="dark-onboarding">
      <div className="dark-slide-card">
        {/* Top Image Section */}
        <div className="slide-illustration">
          {slide.isNotificationSlide ? (
            <div className="notification-icon">
              <i className="bi bi-bell fs-1"></i>
            </div>
          ) : (
            <Illustration />
          )}
        </div>

        {/* Title and Subtitle */}
        <h2 className="slide-title">
          {slide.title}
        </h2>
        <h3 className="slide-subtitle">
          {slide.subtitle}
        </h3>

        {/* Description */}
        <p className="slide-description">
          {slide.description}
        </p>

        {/* Indicators */}
        <div className="slide-indicators">
          {slides.map((_, index) => (
            <div 
              key={index} 
              className={`indicator ${currentSlide === index ? 'active' : ''}`}
              onClick={() => setCurrentSlide(index)}
            />
          ))}
        </div>

        {/* Action Button */}
        {slide.isNotificationSlide ? (
          <div className="notification-actions">
            {notificationPermission === 'granted' ? (
              <div className="text-center">
                <div className="text-success mb-3">
                  <i className="bi bi-check-circle fs-3"></i>
                  <p className="mt-2 mb-0">Notifications enabled!</p>
                </div>
                <button className="action-button" onClick={handleNextSlide}>
                  Continue
                </button>
              </div>
            ) : (
              <div className="d-flex flex-column gap-2">
                <button 
                  className="action-button" 
                  onClick={handleRequestNotificationPermission}
                  disabled={isRequestingPermission}
                >
                  {isRequestingPermission ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Enabling...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-bell me-2"></i>
                      Enable Notifications
                    </>
                  )}
                </button>
                <button 
                  className="btn btn-outline-secondary" 
                  onClick={handleSkipNotification}
                >
                  Skip for now
                </button>
              </div>
            )}
          </div>
        ) : currentSlide === slides.length - 1 ? (
          <button className="action-button" onClick={handleComplete}>
            Get Started
          </button>
        ) : (
          <button className="action-button" onClick={handleNextSlide}>
            Next
          </button>
        )}

        {/* Skip Link */}
        {currentSlide < slides.length - 1 && (
          <div className="skip-link">
            <span onClick={handleSkip}>Skip</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingSlides;