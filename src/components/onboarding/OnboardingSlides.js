// components/onboarding/OnboardingSlides.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PushService } from '../../services/PushService';
import './OnboardingSlides.css';

// Inline barbershop SVG illustrations (merged from BarberIllustrations.js)
const HaircutIllustration = () => (
  <svg
    width="200"
    height="200"
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="100" cy="100" r="90" fill="#F2F2F2" />
    <circle cx="100" cy="80" r="40" fill="#6B4226" />
    <path
      d="M70 110C70 110 80 150 100 150C120 150 130 110 130 110"
      fill="#A0522D"
    />
    <circle cx="100" cy="75" r="30" fill="#D4B068" />
    <path
      d="M85 65C85 65 90 60 100 60C110 60 115 65 115 65"
      stroke="#6B4226"
      strokeWidth="2"
    />
    <circle cx="90" cy="75" r="3" fill="#6B4226" />
    <circle cx="110" cy="75" r="3" fill="#6B4226" />
    <path
      d="M90 90C90 90 95 95 100 95C105 95 110 90 110 90"
      stroke="#6B4226"
      strokeWidth="2"
    />
    <path d="M70 130L60 140" stroke="#6B4226" strokeWidth="3" />
    <path d="M130 130L140 140" stroke="#6B4226" strokeWidth="3" />
    <path d="M150 60C150 60 160 70 150 80" stroke="#6B4226" strokeWidth="3" />
    <path d="M50 60C50 60 40 70 50 80" stroke="#6B4226" strokeWidth="3" />
    <circle cx="150" cy="75" r="10" fill="#D4B068" />
    <circle cx="50" cy="75" r="10" fill="#D4B068" />
    <path d="M145 70L155 80" stroke="#6B4226" strokeWidth="2" />
    <path d="M155 70L145 80" stroke="#6B4226" strokeWidth="2" />
    <path d="M45 70L55 80" stroke="#6B4226" strokeWidth="2" />
    <path d="M55 70L45 80" stroke="#6B4226" strokeWidth="2" />
  </svg>
);

const BookingIllustration = () => (
  <svg
    width="200"
    height="200"
    viewBox="0 0 200 200"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="100" cy="100" r="90" fill="#F2F2F2" />
    <rect x="60" y="60" width="80" height="100" rx="5" fill="#6B4226" />
    <rect x="65" y="65" width="70" height="90" rx="3" fill="#D4B068" />
    <rect x="70" y="75" width="60" height="10" rx="2" fill="#6B4226" />
    <rect x="70" y="95" width="60" height="10" rx="2" fill="#6B4226" />
    <rect x="70" y="115" width="60" height="10" rx="2" fill="#6B4226" />
    <rect x="70" y="135" width="30" height="10" rx="2" fill="#6B4226" />
    <circle cx="140" cy="70" r="20" fill="#A0522D" />
    <text x="135" y="75" fontSize="20" fill="#D4B068">
      ✓
    </text>
    <circle cx="85" cy="145" r="5" fill="#A0522D" />
    <circle cx="100" cy="145" r="5" fill="#A0522D" />
    <circle cx="115" cy="145" r="5" fill="#A0522D" />
  </svg>
);

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