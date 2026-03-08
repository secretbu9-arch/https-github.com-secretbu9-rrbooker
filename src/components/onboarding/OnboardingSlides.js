// components/onboarding/OnboardingSlides.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PushService } from '../../services/notifications/PushService';
import './OnboardingSlides.css';

const OnboardingSlides = ({ onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState('unknown');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const navigate = useNavigate();

  const slides = [
    {
      title: "RAF & ROX",
      subtitle: "MASTER BARBERING",
      description: "Elevate your grooming experience with our traditional service and modern precision.",
      backgroundImage: "/assets/onboarding/welcome.png"
    },
    {
      title: "Expert Craft",
      subtitle: "PREMIUM SERVICES",
      description: "From classic fades to sharp beard trims, our artisans are dedicated to your style.",
      backgroundImage: "/assets/onboarding/services.png"
    },
    {
      title: "Seamless Flow",
      subtitle: "EFFORTLESS BOOKING",
      description: "Your time is valuable. Book your next appointment in seconds, anytime, anywhere.",
      backgroundImage: "/assets/onboarding/booking.png"
    },
    {
      title: "Stay Connected",
      subtitle: "REAL-TIME UPDATES",
      description: "Enable notifications to stay updated on your queue position and booking statuses.",
      backgroundImage: "/assets/onboarding/get_started.png",
      isNotificationSlide: true
    }
  ];

  useEffect(() => {
    // Check if notifications are already granted
    if (window.Notification && Notification.permission === 'granted') {
      setNotificationPermission('granted');
    }
  }, []);

  const handleNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentSlide(currentSlide + 1);
        setIsTransitioning(false);
      }, 50);
    } else {
      handleComplete();
    }
  };

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

  const handleRequestNotificationPermission = async () => {
    setIsRequestingPermission(true);
    try {
      await PushService.initialize(true);
      // Wait a moment for registration to complete
      await new Promise(resolve => setTimeout(resolve, 1500));
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

  const slide = slides[currentSlide];

  return (
    <div className="onboarding-container">
      {/* Background Images Layer */}
      <div
        className="onboarding-background"
        style={{ transform: `translateX(-${currentSlide * 25}%)` }}
      >
        {slides.map((s, idx) => (
          <div
            key={idx}
            className="onboarding-bg-slide"
            style={{ backgroundImage: `url(${s.backgroundImage})` }}
          />
        ))}
      </div>

      {/* Skip Button */}
      {currentSlide < slides.length - 1 && (
        <div className="skip-onboarding">
          <button className="skip-btn" onClick={handleSkip}>Skip</button>
        </div>
      )}

      {/* Content Area */}
      <div className="onboarding-content-wrapper">
        <div className={`content-glass-card slide-content-anim ${!isTransitioning ? 'active' : ''}`}>

          <div className="slide-text-content">
            <h3 className="onboarding-subtitle">{slide.subtitle}</h3>
            <h2 className="onboarding-title">{slide.title}</h2>

            {slide.isNotificationSlide && notificationPermission !== 'granted' && (
              <div className="notification-bell-anim">
                <i className="bi bi-bell-fill"></i>
              </div>
            )}

            <p className="onboarding-description">{slide.description}</p>
          </div>

          {/* Progress Indicators */}
          <div className="onboarding-indicators">
            {slides.map((_, index) => (
              <div
                key={index}
                className={`onboarding-dot ${currentSlide === index ? 'active' : ''}`}
                onClick={() => setCurrentSlide(index)}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="onboarding-nav">
            {slide.isNotificationSlide ? (
              <>
                {notificationPermission === 'granted' ? (
                  <button className="main-action-btn" onClick={handleComplete}>
                    <span>GET STARTED</span>
                    <i className="bi bi-arrow-right"></i>
                  </button>
                ) : (
                  <>
                    <button
                      className="main-action-btn"
                      onClick={handleRequestNotificationPermission}
                      disabled={isRequestingPermission}
                    >
                      {isRequestingPermission ? (
                        <>
                          <span className="spinner-border spinner-border-sm" role="status"></span>
                          <span>ENABLING...</span>
                        </>
                      ) : (
                        <>
                          <i className="bi bi-bell-fill"></i>
                          <span>ENABLE NOTIFICATIONS</span>
                        </>
                      )}
                    </button>
                    <button className="secondary-action-btn" onClick={handleSkipNotification}>
                      SKIP FOR NOW
                    </button>
                  </>
                )}
              </>
            ) : (
              <button className="main-action-btn" onClick={handleNextSlide}>
                <span>{currentSlide === slides.length - 2 ? "READY?" : "CONTINUE"}</span>
                <i className="bi bi-arrow-right"></i>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingSlides;
