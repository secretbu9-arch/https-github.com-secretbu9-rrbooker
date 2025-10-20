// components/customer/UnifiedBookingComponent.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import UnifiedSlotBookingService from '../../services/UnifiedSlotBookingService';
import { PushService } from '../../services/PushService';

const UnifiedBookingComponent = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [user, setUser] = useState(null);

  // Booking data
  const [bookingData, setBookingData] = useState({
    selectedDate: '',
    selectedBarber: '',
    selectedServices: [],
    selectedAddOns: [],
    selectedSlot: null,
    specialRequests: ''
  });

  // Available data
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [addOns, setAddOns] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [alternativeBarbers, setAlternativeBarbers] = useState([]);

  // UI states
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedBarberSlots, setSelectedBarberSlots] = useState([]);

  useEffect(() => {
    loadInitialData();
    getCurrentUser();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Load barbers, services, and add-ons
      const [barbersResult, servicesResult, addOnsResult] = await Promise.all([
        supabase.from('users').select('*').eq('role', 'barber'),
        supabase.from('services').select('*').order('name'),
        supabase.from('add_ons').select('*').order('name')
      ]);

      if (barbersResult.error) throw barbersResult.error;
      if (servicesResult.error) throw servicesResult.error;
      if (addOnsResult.error) throw addOnsResult.error;

      setBarbers(barbersResult.data || []);
      setServices(servicesResult.data || []);
      setAddOns(addOnsResult.data || []);
      
    } catch (error) {
      console.error('Error loading initial data:', error);
      setError('Failed to load booking data. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  };

  const handleDateChange = async (date) => {
    setBookingData(prev => ({ ...prev, selectedDate: date }));
    
    if (bookingData.selectedBarber) {
      await loadBarberSlots(bookingData.selectedBarber, date);
    }
  };

  const handleBarberChange = async (barberId) => {
    setBookingData(prev => ({ ...prev, selectedBarber: barberId }));
    
    if (bookingData.selectedDate) {
      await loadBarberSlots(barberId, bookingData.selectedDate);
    }
  };

  const loadBarberSlots = async (barberId, date) => {
    try {
      setLoading(true);
      
      const totalDuration = calculateTotalDuration();
      const slots = await UnifiedSlotBookingService.getUnifiedSlots(barberId, date, totalDuration);
      
      setSelectedBarberSlots(slots);
      
      // Check if barber has any available slots
      const availableSlots = slots.filter(slot => slot.canBook);
      if (availableSlots.length === 0) {
        // Load alternative barbers
        await loadAlternativeBarbers(date, totalDuration, barberId);
        setShowAlternatives(true);
      } else {
        setShowAlternatives(false);
      }
      
    } catch (error) {
      console.error('Error loading barber slots:', error);
      setError('Failed to load available slots. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadAlternativeBarbers = async (date, serviceDuration, excludeBarberId) => {
    try {
      const alternatives = await UnifiedSlotBookingService.getAlternativeBarbers(
        date, 
        serviceDuration, 
        excludeBarberId, 
        barbers
      );
      setAlternativeBarbers(alternatives);
    } catch (error) {
      console.error('Error loading alternative barbers:', error);
    }
  };

  const calculateTotalDuration = () => {
    let total = 0;
    
    // Add service durations
    bookingData.selectedServices.forEach(serviceId => {
      const service = services.find(s => s.id === serviceId);
      if (service) total += service.duration || 30;
    });
    
    // Add add-on durations
    bookingData.selectedAddOns.forEach(addOnId => {
      const addOn = addOns.find(a => a.id === addOnId);
      if (addOn) total += addOn.duration || 15;
    });
    
    return total || 30; // Default 30 minutes
  };

  const handleSlotSelect = (slot) => {
    setBookingData(prev => ({ ...prev, selectedSlot: slot }));
  };

  const handleServiceToggle = (serviceId) => {
    setBookingData(prev => ({
      ...prev,
      selectedServices: prev.selectedServices.includes(serviceId)
        ? prev.selectedServices.filter(id => id !== serviceId)
        : [...prev.selectedServices, serviceId]
    }));
  };

  const handleAddOnToggle = (addOnId) => {
    setBookingData(prev => ({
      ...prev,
      selectedAddOns: prev.selectedAddOns.includes(addOnId)
        ? prev.selectedAddOns.filter(id => id !== addOnId)
        : [...prev.selectedAddOns, addOnId]
    }));
  };

  const handleBookingSubmit = async () => {
    try {
      setLoading(true);
      setError('');

      // Validation
      if (!user) throw new Error('Please log in to book an appointment');
      if (!bookingData.selectedDate) throw new Error('Please select a date');
      if (!bookingData.selectedBarber) throw new Error('Please select a barber');
      if (!bookingData.selectedSlot) throw new Error('Please select a time slot');
      if (bookingData.selectedServices.length === 0) throw new Error('Please select at least one service');

      const totalDuration = calculateTotalDuration();
      
      const bookingResult = await UnifiedSlotBookingService.bookSlot({
        barberId: bookingData.selectedBarber,
        date: bookingData.selectedDate,
        timeSlot: bookingData.selectedSlot.time,
        serviceDuration: totalDuration,
        customerId: user.id,
        services: bookingData.selectedServices,
        addOns: bookingData.selectedAddOns
      });

      if (!bookingResult.success) {
        throw new Error(bookingResult.error);
      }

      // Send notifications
      await sendBookingNotifications(bookingResult.appointment, bookingResult.bookingType);

      setSuccess(`Appointment ${bookingResult.bookingType} successfully! ${bookingResult.message}`);
      
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);

    } catch (error) {
      console.error('Booking error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const sendBookingNotifications = async (appointment, bookingType) => {
    try {
      // Send notification to barber
      await PushService.sendNotificationToUser(
        appointment.barber_id,
        'New Appointment Request',
        `You have a new ${bookingType} appointment request from ${user.email}`,
        {
          type: 'appointment_request',
          appointment_id: appointment.id,
          booking_type: bookingType
        }
      );

      // Email confirmation removed - using push notifications only
      
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  };

  const renderSlotGrid = () => {
    if (!selectedBarberSlots.length) return null;

    return (
      <div className="slot-grid">
        <h5>Available Time Slots</h5>
        <div className="row g-2">
          {selectedBarberSlots.map((slot, index) => (
            <div key={index} className="col-6 col-md-4 col-lg-3">
              <button
                className={`btn w-100 ${
                  slot.type === 'available' && slot.canBook
                    ? 'btn-outline-primary'
                    : slot.type === 'scheduled'
                    ? 'btn-outline-secondary'
                    : slot.type === 'queue'
                    ? 'btn-outline-warning'
                    : slot.type === 'lunch'
                    ? 'btn-outline-dark'
                    : 'btn-outline-danger'
                } ${
                  bookingData.selectedSlot?.time === slot.time ? 'active' : ''
                }`}
                onClick={() => slot.canBook && handleSlotSelect(slot)}
                disabled={!slot.canBook}
                title={slot.reason}
              >
                <div className="small">
                  {UnifiedSlotBookingService.convertTo12Hour(slot.time)}
                </div>
                <div className="small text-muted">
                  {slot.type === 'available' && 'Available'}
                  {slot.type === 'scheduled' && 'Booked'}
                  {slot.type === 'queue' && `Queue #${slot.queuePosition}`}
                  {slot.type === 'lunch' && 'Lunch'}
                  {slot.type === 'full' && 'Full'}
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAlternativeBarbers = () => {
    if (!showAlternatives || !alternativeBarbers.length) return null;

    return (
      <div className="alternative-barbers mt-4">
        <div className="alert alert-info">
          <h6>Selected barber is fully booked. Here are alternatives:</h6>
        </div>
        <div className="row g-3">
          {alternativeBarbers.map((alt, index) => (
            <div key={index} className="col-md-6">
              <div className="card">
                <div className="card-body">
                  <h6 className="card-title">{alt.barber.full_name}</h6>
                  <p className="card-text small">
                    <strong>Next Available:</strong> {alt.nextAvailableDisplay}<br/>
                    <strong>Available Slots:</strong> {alt.availableSlots}<br/>
                    <strong>Queue Length:</strong> {alt.queueLength}<br/>
                    <strong>Rating:</strong> ⭐ {alt.rating.toFixed(1)}<br/>
                    <strong>Status:</strong> {alt.recommendation}
                  </p>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      handleBarberChange(alt.barber.id);
                      setShowAlternatives(false);
                    }}
                  >
                    Book with {alt.barber.full_name}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!user) {
    return (
      <div className="container py-4">
        <div className="alert alert-warning">
          Please log in to book an appointment.
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      <div className="row justify-content-center">
        <div className="col-lg-10">
          <div className="card">
            <div className="card-header">
              <h4 className="mb-0">Book Appointment</h4>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger">
                  {error}
                </div>
              )}
              
              {success && (
                <div className="alert alert-success">
                  {success}
                </div>
              )}

              {/* Step 1: Date and Barber Selection */}
              <div className="mb-4">
                <h5>Step 1: Select Date and Barber</h5>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={bookingData.selectedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      max={new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Barber</label>
                    <select
                      className="form-select"
                      value={bookingData.selectedBarber}
                      onChange={(e) => handleBarberChange(e.target.value)}
                    >
                      <option value="">Select a barber</option>
                      {barbers.map(barber => (
                        <option key={barber.id} value={barber.id}>
                          {barber.full_name}{barber.skills ? ` - ${barber.skills.split(',').slice(0, 2).join(', ')}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 2: Services and Add-ons */}
              <div className="mb-4">
                <h5>Step 2: Select Services</h5>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Services</label>
                    {services.map(service => (
                      <div key={service.id} className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`service-${service.id}`}
                          checked={bookingData.selectedServices.includes(service.id)}
                          onChange={() => handleServiceToggle(service.id)}
                        />
                        <label className="form-check-label" htmlFor={`service-${service.id}`}>
                          {service.name} - ${service.price} ({service.duration} min)
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="col-md-6">
                    <label className="form-label">Add-ons</label>
                    {addOns.map(addOn => (
                      <div key={addOn.id} className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`addon-${addOn.id}`}
                          checked={bookingData.selectedAddOns.includes(addOn.id)}
                          onChange={() => handleAddOnToggle(addOn.id)}
                        />
                        <label className="form-check-label" htmlFor={`addon-${addOn.id}`}>
                          {addOn.name} - ${addOn.price} ({addOn.duration} min)
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 3: Time Slot Selection */}
              {bookingData.selectedDate && bookingData.selectedBarber && (
                <div className="mb-4">
                  <h5>Step 3: Select Time Slot</h5>
                  {loading ? (
                    <div className="text-center">
                      <div className="spinner-border" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {renderSlotGrid()}
                      {renderAlternativeBarbers()}
                    </>
                  )}
                </div>
              )}

              {/* Submit Button */}
              {bookingData.selectedSlot && (
                <div className="d-grid">
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleBookingSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Booking...
                      </>
                    ) : (
                      `Book ${bookingData.selectedSlot.type === 'available' ? 'Scheduled' : 'Queue'} Appointment`
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedBookingComponent;
