import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/core/ApiService';
import './LandingPage.css';

// Using actual assets
import heroImg from '../../assets/images/hero.png';
import serviceImg from '../../assets/images/service.png';
import productsImg from '../../assets/images/products.png';
import logoImg from '../../assets/images/logo-white.png';
import locationVideo from '../../assets/video/RRBOOKERPIN.mp4';



const LandingPage = () => {
  const [scrolled, setScrolled] = useState(false);
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [addOns, setAddOns] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [locationMode, setLocationMode] = useState('3d'); // '3d' or 'simple'


  useEffect(() => {
    const fetchData = async () => {
      try {
        const [servicesData, productsData, addOnsData] = await Promise.all([
          apiService.getServices(),
          apiService.getProducts(),
          apiService.getAddOns()
        ]);
        setServices(servicesData || []);
        setProducts(productsData || []);
        setAddOns(addOnsData || []);

      } catch (err) {
        console.error('Failed to fetch landing data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 80);
    };

    window.addEventListener('scroll', handleScroll);

    // Modern Intersection Observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.15 });

    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    revealElements.forEach(el => observer.observe(el));

    return () => {
      window.removeEventListener('scroll', handleScroll);
      revealElements.forEach(el => observer.unobserve(el));
    };
  }, [loading]);

  const scrollToSection = (e, id) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      window.scrollTo({
        top: element.offsetTop - 100,
        behavior: 'smooth'
      });
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="landing-page">
      {/* NAVIGATION */}
      <nav className={`landing-navbar ${scrolled ? 'scrolled' : ''}`}>
        <Link to="/" className="landing-logo">
          <img src={logoImg} alt="RAF & ROX" className="logo-main" />
        </Link>

        <div className="nav-links">
          <a href="#services" onClick={(e) => scrollToSection(e, 'services')}>Services</a>
          <a href="#about" onClick={(e) => scrollToSection(e, 'about')}>About</a>
          <a href="#shop" onClick={(e) => scrollToSection(e, 'shop')}>Shop</a>
          <a href="#location" onClick={(e) => scrollToSection(e, 'location')}>Location</a>
          <a href="#download" onClick={(e) => scrollToSection(e, 'download')}>App</a>

          <Link to="/login" className="btn-login">Login</Link>
        </div>

        <div className="mobile-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          <i className={mobileMenuOpen ? "bi bi-x" : "bi bi-list"}></i>
        </div>
      </nav>

      {/* MOBILE MENU */}
      <div className={`mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-menu-close" onClick={() => setMobileMenuOpen(false)}>
          <i className="bi bi-x"></i>
        </div>
        <nav className="mobile-menu-links">
          <a href="#services" onClick={(e) => scrollToSection(e, 'services')}>Services</a>
          <a href="#about" onClick={(e) => scrollToSection(e, 'about')}>About</a>
          <a href="#shop" onClick={(e) => scrollToSection(e, 'shop')}>Shop</a>
          <a href="#location" onClick={(e) => scrollToSection(e, 'location')}>Location</a>
          <Link to="/login" onClick={() => setMobileMenuOpen(false)}>Login</Link>

          <Link to="/register" className="btn-login" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
        </nav>
      </div>

      {/* HERO SECTION */}
      <header className="hero-section">
        <div className="hero-content reveal">
          <span className="hero-subtitle">Raf & Rox at its best</span>
          <h1 className="hero-title">Your Hair,<br />Your Style.</h1>
          <p className="hero-description">
            Raf & Rox is where elite craftsmanship meets modern style.
            We provide a sanctuary for the modern man to refine his aesthetic.
          </p>
          <div className="hero-cta">
            <Link to="/register" className="btn-primary-landing">Reserve Now</Link>
            <Link to="/products" className="btn-secondary-landing">Shop Store</Link>
          </div>
        </div>
        <div className="hero-image-vessel reveal-right">
          <img src={heroImg} alt="Raf & Rox Experience" />
          <div className="bg-shape"></div>
          <div className="floating-badge">
            <i className="bi bi-star-fill"></i>
            <span>Est. 2023</span>
          </div>
        </div>
        <div className="hero-decorative-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>


      </header>

      {/* STATS SECTION */}
      <section className="stats-section reveal">
        <div className="stats-container">
          <div className="stat-item">
            <i className="bi bi-people"></i>
            <div className="stat-info">
              <h2>5k+</h2>
              <p>Loyal Clients</p>
            </div>
          </div>
          <div className="stat-item">
            <i className="bi bi-star-fill"></i>
            <div className="stat-info">
              <h2>5.0</h2>
              <p>Expert Rating</p>
            </div>
          </div>
          <div className="stat-item">
            <i className="bi bi-scissors"></i>
            <div className="stat-info">
              <h2>4</h2>
              <p>Master Barbers</p>
            </div>
          </div>
          <div className="stat-item">
            <i className="bi bi-clock-fill"></i>
            <div className="stat-info">
              <h2 style={{ fontSize: '2.2rem' }}>8am - 5pm</h2>
              <p>Daily Hours</p>
            </div>
          </div>

        </div>
      </section>





      {/* SERVICES */}
      <section id="services" className="features-section">
        <div className="section-header reveal">
          <span className="section-subtitle">The Craft</span>
          <h2 className="section-title">Services That We Offer</h2>
        </div>
        <div className="features-grid">
          {loading ? (
            <div className="text-center w-100">Loading master services...</div>
          ) : services.length > 0 ? (
            services.slice(0, 3).map((service, index) => (
              <div className="feature-card reveal" key={service.id} style={{ transitionDelay: `${index * 0.2}s` }}>
                <div className="feature-icon">
                  <i className={index === 0 ? "bi bi-scissors" : index === 1 ? "bi bi-brush" : "bi bi-stars"}></i>
                </div>
                <h3>{service.name}</h3>
                <p>{service.description || `Specialized ${service.name} designed to enhance your natural features.`}</p>
                <div className="service-meta">
                  <span className="service-duration">{service.duration} MINS</span>
                </div>

              </div>
            ))
          ) : (
            <div className="text-center w-100">Services catalog coming soon.</div>
          )}
        </div>

        {services.length > 3 && (
          <div className="additional-services-container reveal">
            <h3 className="additional-title">Standard Menu</h3>
            <div className="additional-grid">
              {services.slice(3).map((service) => (
                <div className="additional-item" key={service.id}>
                  <div className="item-main">
                    <h4>{service.name}</h4>
                    <span className="item-dots"></span>
                    <span className="item-duration">{service.duration} MINS</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {addOns.length > 0 && (
          <div className="additional-services-container reveal" style={{ marginTop: '6rem' }}>
            <h3 className="additional-title">Additional Services</h3>
            <div className="additional-grid">
              {addOns.map((addon) => (
                <div className="additional-item" key={addon.id}>
                  <div className="item-main">
                    <h4>{addon.name}</h4>
                    <span className="item-dots"></span>
                    <span className="item-duration">{addon.duration} MINS</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}


      </section>

      {/* ABOUT */}
      <section id="about" className="info-section">
        <div className="info-image reveal-left">
          <div className="image-stack">
            <img src={serviceImg} alt="Our Philosophy" className="main-info-img" />
            <div className="experience-badge">
              <strong>1+</strong>
              <span>Year of Excellence</span>
            </div>
          </div>
        </div>

        <div className="info-content reveal-right">
          <span className="section-subtitle">The RR Journey</span>
          <h2>From Mr. D to Raf & Rox.</h2>
          <p>
            Raf and Rox Barbershop was originally established by Dr. Eugenio Pipo in May 2023
            under the name <strong>Mr. D Barbershop</strong>. Originally launching with three
            barbers and three staff members, the studio featured a dedicated VIP room,
            setting a new standard for high-quality grooming in Vigan City.
          </p>
          <p>
            In 2024, we underwent a significant evolution. Rebranded as <strong>Raf and Rox Barbershop</strong>
            in honor of the owner's two children, the studio was renovated to expand our craft.
            The VIP room was transformed into two additional barber spaces, allowing us to serve more
            clients with the same uncompromising precision.
          </p>

          <div className="about-features-grid">

            <div className="about-feature">
              <div className="feature-icon-mini">
                <i className="bi bi-person-check-fill"></i>
              </div>
              <div className="feature-info">
                <h4>Signature Cuts</h4>
                <p>Tailored consultations for your head shape and hair type.</p>
              </div>
            </div>

            <div className="about-feature">
              <div className="feature-icon-mini">
                <i className="bi bi-shield-lock-fill"></i>
              </div>
              <div className="feature-info">
                <h4>Premium Rituals</h4>
                <p>Hot towels and straight razor finishes in every service.</p>
              </div>
            </div>




          </div>

          <Link to="/login" className="btn-premium-action">
            BOOK AN APPOINTMENT
          </Link>
        </div>
      </section>


      {/* SHOP */}
      <section id="shop" className="products-section">
        <div className="section-header reveal">
          <span className="section-subtitle">Exclusives</span>
          <h2 className="section-title">The Grooming Kit</h2>
        </div>
        <div className="shop-spotlight reveal">
          <div className="spotlight-image">
            <img src={productsImg} alt="Raf & Rox Grooming Essentials" />
            <div className="spotlight-overlay">
              <div className="spotlight-badge">Signature Collection</div>
            </div>
          </div>
          <div className="spotlight-text">
            <h3>Elite Grooming Essentials</h3>
            <p>Elevate your daily ritual with our curated selection of premium pomades, oils, and artisanal tools used by our master barbers.</p>
            <Link to="/products" className="btn-premium-action">SHOP THE COLLECTION</Link>
          </div>
        </div>

        <div className="products-grid">

          {loading ? (
            <div className="text-center w-100">Loading products...</div>
          ) : (
            products.slice(0, 4).map((product, index) => (
              <Link to={`/products/${product.id}`} className="product-card-landing reveal" key={product.id} style={{ transitionDelay: `${index * 0.15}s` }}>
                <div className="product-badge">{index % 2 === 0 ? 'Elite Pick' : 'Limited'}</div>
                <div className="product-image">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} />
                  ) : (
                    <div className="placeholder-icon">
                      <i className="bi bi-box-seam"></i>
                    </div>
                  )}
                  <div className="product-action-overlay">
                    <span className="action-btn">Detail View</span>
                  </div>
                </div>
                <div className="product-info">
                  <h4>{product.name}</h4>
                  <div className="product-price">₱{product.price}</div>
                </div>
              </Link>
            ))
          )}
        </div>
        <div className="text-center">
          <Link to="/products" className="btn-secondary-landing">View All Products</Link>
        </div>
      </section>

      {/* DOWNLOAD */}
      <section id="download" className="download-section">
        <div className="download-container">
          <div className="download-content reveal-left">
            <span className="section-subtitle">On The Go</span>
            <h2 className="hero-title" style={{ fontSize: '3.5rem' }}>Your Barber in Your Pocket.</h2>
            <p className="hero-description">
              Get priority booking, exclusive offers, and manage your grooming
              schedule from anywhere with our mobile companion.
            </p>
            <div className="download-actions">
              <a href="/raf-n-rox.apk" className="btn-apk-download" download>
                <div className="apk-icon"><i className="bi bi-android2"></i></div>
                <div className="apk-text">
                  <span>Android Platform</span>
                  <strong>Download APK</strong>
                </div>
              </a>
            </div>
          </div>
          <div className="download-mockup reveal-right">
            <div className="phone-frame iphone-17-pro">
              <div className="dynamic-island"></div>
              <div className="phone-screen">
                <div className="mockup-header-status">
                  <i className="bi bi-arrow-clockwise"></i> Estimate updated at 5:06:30 PM
                </div>
                <div className="mockup-content">
                  <div className="badge-confirmation">
                    <i className="bi bi-shield-check"></i> Final Confirmation
                  </div>
                  <h3 className="mockup-title">Review Your Booking</h3>
                  <p className="mockup-subtitle">Almost there! Double-check your appointment details below.</p>

                  <div className="position-circle-vessel">
                    <div className="position-circle">
                      <span>1</span>
                    </div>
                    <span className="position-label">POSITION</span>
                  </div>

                  <div className="reservation-info">
                    <h4 className="res-title">Queue Reservation</h4>
                    <p className="res-subtitle">with Archiel Flor Dela Cruz</p>
                  </div>

                  <div className="mockup-time-cards">
                    <div className="m-time-card">
                      <span className="m-card-label">WAITING TIME</span>
                      <span className="m-card-value">0m</span>
                    </div>
                    <div className="m-time-card">
                      <span className="m-card-label">ARRIVAL TIME</span>
                      <span className="m-card-value">8:00 AM</span>
                    </div>
                  </div>

                  <div className="mockup-priority-vessel">
                    <span className="priority-text">Urgent Priority (+₱100)</span>
                    <div className="mock-toggle"></div>
                  </div>
                </div>
              </div>
              <div className="app-floating-card card-1">
                <i className="bi bi-check2-circle"></i>
                <div>
                  <strong>Booking Confirmed</strong>
                  <span>#1 Queue at 8AM </span>
                </div>
              </div>
              <div className="app-floating-card card-2">
                <div className="avatar-stack">
                  <div className="avatar-dot"></div>
                  <div className="avatar-dot"></div>
                </div>
                <span>Barber is Available!</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* LOCATION */}
      <section id="location" className="location-section">
        <div className="section-header reveal">
          <span className="section-subtitle">Location</span>
          <h2 className="section-title">Visit Our Shop</h2>
          <p className="section-description-mini">Step into a place where grooming feels relaxed, personal, and made for today’s man. It’s more than just a haircut—it’s time to unwind, refresh your look, and leave feeling confident.</p>
        </div>

        <div className="location-toggle-mobile reveal">
          <button
            className={`toggle-btn ${locationMode === '3d' ? 'active' : ''}`}
            onClick={() => setLocationMode('3d')}
          >
            <i className="bi bi-camera-video"></i> 3D Tour
          </button>
          <button
            className={`toggle-btn ${locationMode === 'simple' ? 'active' : ''}`}
            onClick={() => setLocationMode('simple')}
          >
            <i className="bi bi-geo-alt"></i> Interactive Map
          </button>
        </div>

        <div className={`location-grid-vessel mode-${locationMode}`}>
          <div className="location-info-card reveal-left">
            <div className="info-header">
              <div className="info-badge">NOW OPEN</div>
              <h3>Raf & Rox Vigan</h3>
            </div>

            <div className="info-details">
              <div className="detail-item">
                <div className="detail-icon"><i className="bi bi-geo-alt"></i></div>
                <div className="detail-text">
                  <strong>Arrival Point</strong>
                  <p>75 Gen. Luna St, Vigan City, 2700 Ilocos Sur, Philippines</p>
                </div>
              </div>

              <div className="detail-item">
                <div className="detail-icon"><i className="bi bi-clock"></i></div>
                <div className="detail-text">
                  <strong>Service Hours</strong>
                  <p>Daily: 8:00 AM - 5:00 PM</p>
                </div>
              </div>

              <div className="detail-item">
                <div className="detail-icon"><i className="bi bi-telephone"></i></div>
                <div className="detail-text">
                  <strong>Contact Info</strong>
                  <p>+63 936 980 7218</p>
                </div>
              </div>
            </div>

            <div className="info-actions">
              <a
                href="https://www.google.com/maps/dir/?api=1&destination=RAF+%26+ROX+BARBERSHOP+Vigan+City"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-directions"
              >
                <i className="bi bi-cursor-fill"></i> Get Directions
              </a>
              <a href="tel:+639451234567" className="btn-call-mini">
                <i className="bi bi-telephone-fill"></i> Call Now
              </a>
            </div>
          </div>

          <div className="location-visual-card reveal-right">
            <div className={`visual-container tour-view ${locationMode === '3d' ? 'active' : ''}`}>
              <video
                src={locationVideo}
                autoPlay
                muted
                loop
                playsInline
                className="location-video-bg"
              />
              <div className="video-overlay-gradient"></div>
              <div className="visual-caption">
                <span className="view-indicator">
                  <span className="icon-360">360°</span> VIRTUAL TOUR
                </span>
                <h4>Raf & Rox Barbershop</h4>
                <p className="studio-subtext">Explore our shop in full 360° view</p>
              </div>
            </div>

            <div className={`visual-container map-view ${locationMode === 'simple' ? 'active' : ''}`}>
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d950.9035592202486!2d120.38652605486456!3d17.573543789772646!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x338e6574408b5605%3A0xe4088069c491b48a!2sRAF%20%26%20ROX%20BARBERSHOP!5e0!3m2!1sen!2sph!4v1773554717322!5m2!1sen!2sph"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Raf & Rox Location"
                className="google-map-iframe"
              ></iframe>
            </div>
          </div>
        </div>
      </section>


      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-top-wave"></div>
        <div className="footer-container">
          <div className="footer-main-content">
            <div className="footer-brand">
              <img src={logoImg} alt="RAF & ROX" className="footer-logo" />
              <p className="footer-tagline">
                The definitive grooming experience. <br />
                Redefining precision since 2021.
              </p>
              <div className="footer-social">
                <a href="https://www.facebook.com/profile.php?id=100092652179973" className="social-link" aria-label="Facebook" target="_blank" rel="noopener noreferrer"><i className="bi bi-facebook"></i></a>
              </div>
            </div>

            <div className="footer-nav-groups">
              <div className="nav-group">
                <h4 className="group-title">Explore</h4>
                <ul className="group-list">
                  <li><a href="#services" onClick={(e) => scrollToSection(e, 'services')}>Services</a></li>
                  <li><a href="#about" onClick={(e) => scrollToSection(e, 'about')}>Our Story</a></li>
                  <li><a href="#location" onClick={(e) => scrollToSection(e, 'location')}>Find Us</a></li>
                  <li><Link to="/products">Shop Catalog</Link></li>
                </ul>
              </div>

              <div className="nav-group">
                <h4 className="group-title">Support</h4>
                <ul className="group-list">
                  <li><a href="#">Privacy Policy</a></li>
                  <li><a href="#">Terms of Use</a></li>
                  <li><a href="#">Book Help</a></li>
                  <li><a href="#">FAQ</a></li>
                </ul>
              </div>

              <div className="nav-group contact-group">
                <h4 className="group-title">Visit Us</h4>
                <div className="contact-details">
                  <div className="contact-item-mini">
                    <i className="bi bi-geo-alt"></i>
                    <span>75 Gen. Luna St, Vigan City</span>
                  </div>
                  <div className="contact-item-mini">
                    <i className="bi bi-clock"></i>
                    <span>Daily: 8:00 AM - 5:00 PM</span>
                  </div>
                  <div className="contact-item-mini">
                    <i className="bi bi-telephone"></i>
                    <span>+63 936 980 7218</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <div className="footer-bottom-content">
              <p className="copyright">&copy; 2024 RAF & ROX BARBERSHOP. ALL RIGHTS RESERVED.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
