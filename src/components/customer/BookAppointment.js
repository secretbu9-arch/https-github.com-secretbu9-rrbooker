// components/customer/BookAppointment.js - Step-by-Step Booking Flow
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
// REMOVED: PushService import - use only CentralizedNotificationService
import { barberRecommendationService } from '../../services/BarberRecommendationService';
import addOnsService from '../../services/AddOnsService';
import CapacityService from '../../services/CapacityService';
import OverbookingPreventionService from '../../services/OverbookingPreventionService';
import QueueSchedulingAlgorithm from '../../services/QueueSchedulingAlgorithm';
import UnifiedSlotBookingService from '../../services/UnifiedSlotBookingService';
import AdvancedHybridQueueService from '../../services/AdvancedHybridQueueService';
import { 
  BOOKING_STATUS, 
  APPOINTMENT_FIELDS, 
  PRIORITY_LEVELS 
} from '../../constants/booking.constants';
import logoImage from '../../assets/images/raf-rok-logo.png';

// Helper function to convert 24-hour format to 12-hour format (accessible by all components)
const convertTo12Hour = (time24) => {
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${ampm}`;
};

// Get intelligent queue slot suggestions
const getIntelligentQueueSlots = async (barberId, date, serviceDuration) => {
  try {
    console.log('🧠 Getting intelligent queue slots for:', { barberId, date, serviceDuration });
    
    // Check if AdvancedHybridQueueService is available
    if (!AdvancedHybridQueueService || typeof AdvancedHybridQueueService.getIntelligentQueueSlots !== 'function') {
      console.warn('AdvancedHybridQueueService.getIntelligentQueueSlots not available, returning empty array');
      return [];
    }
    
    const suggestions = await AdvancedHybridQueueService.getIntelligentQueueSlots(barberId, date, serviceDuration);
    
    // Ensure suggestions is an array
    if (!Array.isArray(suggestions)) {
      console.warn('getIntelligentQueueSlots returned non-array:', suggestions);
      return [];
    }
    
    // Convert suggestions to slot format for display
    const intelligentSlots = suggestions.map(suggestion => ({
      time: suggestion.time,
      display: suggestion.time ? convertTo12Hour(suggestion.time) : 'Queue Position',
      duration: serviceDuration,
      endTime: suggestion.end_time ? convertTo12Hour(suggestion.end_time) : 'TBD',
      type: suggestion.type,
      description: suggestion.description,
      priority: suggestion.priority,
      efficiency: suggestion.efficiency,
      beforeAppointment: suggestion.before_appointment,
      afterAppointment: suggestion.after_appointment,
      gapDuration: suggestion.gap_duration,
      position: suggestion.position,
      estimatedWait: suggestion.estimated_wait
    }));
    
    console.log('🎯 Intelligent slots generated:', intelligentSlots);
    return intelligentSlots;
  } catch (error) {
    console.error('Error getting intelligent queue slots:', error);
    return [];
  }
};

// Intelligent Queue Slots Component
const IntelligentQueueSlotsComponent = ({ barberId, date, serviceDuration, onSlotSelect }) => {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadSlots = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout loading intelligent slots')), 10000)
        );
        
        const slotsPromise = getIntelligentQueueSlots(barberId, date, serviceDuration);
        
        const intelligentSlots = await Promise.race([slotsPromise, timeoutPromise]);
        setSlots(intelligentSlots || []);
      } catch (err) {
        console.error('Error loading intelligent queue slots:', err);
        setError('Failed to load intelligent slot suggestions. Using standard queue options.');
        setSlots([]); // Set empty array instead of leaving in loading state
      } finally {
        setLoading(false);
      }
    };

    if (barberId && date && serviceDuration) {
      loadSlots();
    } else {
      setLoading(false);
    }
  }, [barberId, date, serviceDuration]);

  if (loading) {
    return (
      <div className="row mb-4">
        <div className="col-12">
          <div className="card border">
            <div className="card-body text-center">
              <div className="spinner-border spinner-border-sm me-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <span className="text-muted">Loading available slots...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="row mb-4">
        <div className="col-12">
          <div className="alert alert-warning border">
            <i className="bi bi-exclamation-triangle me-2"></i>
            {error}
            <div className="mt-2">
              <small className="text-muted">
                You can still proceed with standard booking.
              </small>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return null;
  }

  return (
    <div className="row mb-4">
      <div className="col-12">
        <div className="card border">
          <div className="card-header bg-light border-bottom">
            <h6 className="mb-0 text-dark">
              <i className="bi bi-clock me-2"></i>
              Available Time Slots
            </h6>
            <small className="text-muted">
              Best options for your {serviceDuration}-minute service
            </small>
          </div>
          <div className="card-body">
            <div className="row g-3">
              {slots.map((slot, index) => (
                <div key={index} className="col-md-6 col-lg-4">
                  <div 
                    className={`card h-100 border ${slot.type === 'intelligent_gap' ? 'cursor-pointer' : ''}`}
                    style={{ cursor: slot.type === 'intelligent_gap' ? 'pointer' : 'default' }}
                    onClick={() => slot.type === 'intelligent_gap' && onSlotSelect(slot)}
                  >
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h6 className="mb-0 text-dark">
                          {slot.type === 'intelligent_gap' ? (
                            <>
                              <i className="bi bi-clock me-1"></i>
                              {slot.display}
                            </>
                          ) : (
                            <>
                              <i className="bi bi-people me-1"></i>
                              Queue #{slot.position}
                            </>
                          )}
                        </h6>
                        {slot.priority === 'high' && (
                          <span className="badge bg-success">Recommended</span>
                        )}
                      </div>
                      
                      {slot.type === 'intelligent_gap' ? (
                        <>
                          <p className="mb-3 small text-muted">
                            {slot.description}
                          </p>
                          <div className="mb-3">
                            <div className="row g-2 small">
                              <div className="col-6">
                                <div className="text-muted">Before:</div>
                                <div className="fw-medium">{slot.beforeAppointment}</div>
                            </div>
                              <div className="col-6">
                                <div className="text-muted">After:</div>
                                <div className="fw-medium">{slot.afterAppointment}</div>
                            </div>
                            </div>
                          </div>
                            <button 
                            className="btn btn-primary btn-sm w-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSlotSelect(slot);
                              }}
                            >
                              Book This Time
                            </button>
                        </>
                      ) : (
                        <>
                          <p className="mb-3 small text-muted">
                            Estimated wait: {slot.estimatedWait} minutes
                          </p>
                            <button 
                            className="btn btn-outline-primary btn-sm w-100"
                              onClick={() => onSlotSelect(slot)}
                            >
                              Join Queue
                            </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-3">
              <small className="text-muted">
                <i className="bi bi-info-circle me-1"></i>
                Select a time slot to optimize your appointment timing.
              </small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function for estimated arrival time based on service durations
const getEstimatedArrivalTime = async (barberId, barberQueues, timeSlots, selectedDate = null) => {
  const queue = barberQueues[barberId];
  if (!queue) return 'N/A';
  
  try {
    const queueCount = queue.queueCount || 0;
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5);
    const today = now.toISOString().split('T')[0];
    
    // Use selectedDate if provided, otherwise default to today
    const targetDate = selectedDate || today;
    const isTargetToday = targetDate === today;
    
    console.log('🕐 Calculating estimated arrival time...');
    console.log('  - Barber ID:', barberId);
    console.log('  - Target Date:', targetDate);
    console.log('  - Queue Count:', queueCount);
    console.log('  - Current Time:', currentTime);
    
    // Test case: If this is the specific barber and date from your example
    if (barberId === 'f5c19b20-d74c-4afc-8e0e-4848f2f29049' && targetDate === '2025-10-04') {
      console.log('🎯 TEST CASE: Processing your specific scenario');
      console.log('  - Expected: 8:00 AM + 45 minutes = 8:45 AM');
      console.log('  - Database should show: total_duration = 45');
    }
    
    // Get all appointments for the target date (both queue and scheduled)
    const { data: allAppointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select(`
        id,
        appointment_time,
        appointment_type,
        status,
        total_duration,
        queue_position,
        service_id,
        add_ons_data,
        service:service_id(duration)
      `)
      .eq('barber_id', barberId)
      .eq('appointment_date', targetDate)
      .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending'])
      .order('appointment_time', { ascending: true });
    
    console.log('🔍 Database query results:');
    console.log('  - Query error:', appointmentsError);
    console.log('  - Appointments found:', allAppointments?.length || 0);
    if (allAppointments && allAppointments.length > 0) {
      console.log('  - First appointment:', allAppointments[0]);
    }
    
    if (appointmentsError) {
      console.error('Error fetching appointments:', appointmentsError);
      return 'N/A';
    }
    
    // Define working hours
    const workingHours = {
      start: '08:00:00', // 8:00 AM - Start of morning session
      end: '17:00:00'    // 5:00 PM - End of afternoon session
    };
    
    // Convert time string to minutes for easier calculation
    const timeToMinutes = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    // Local minutesToTime function for this scope
    const minutesToTime = (minutes) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };
    
    // Convert time to 12-hour format for display
    const convertTo12Hour = (time24) => {
      const [hours, minutes] = time24.split(':').map(Number);
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      return `${hour12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    };
    
    // Calculate add-ons duration (same logic as in BookAppointment)
    const calculateAddOnsDuration = (addOnsData) => {
      try {
        if (!addOnsData) return 0;
        
        let addOnItems;
        if (Array.isArray(addOnsData)) {
          addOnItems = addOnsData;
        } else {
          addOnItems = JSON.parse(addOnsData);
        }
        
        if (!Array.isArray(addOnItems) || addOnItems.length === 0) return 0;
        
        const legacyDurationMapping = {
          'addon1': 20, 'addon2':20, 'addon3': 10, 'addon4': 30, 'addon5': 60,
        };
        
        let totalDuration = 0;
        addOnItems.forEach(item => {
          if (legacyDurationMapping[item]) {
            totalDuration += legacyDurationMapping[item];
          }
        });
        
        return totalDuration;
      } catch (error) {
        console.error('Error calculating add-ons duration:', error);
        return 0;
      }
    };
    
    // Start from working hours or current time (whichever is later)
    let currentTimeMinutes = timeToMinutes(workingHours.start);
    if (isTargetToday) {
      const currentTimeMinutesToday = timeToMinutes(currentTime);
      currentTimeMinutes = Math.max(currentTimeMinutes, currentTimeMinutesToday);
    }
    
    const lunchStartMinutes = timeToMinutes('12:00:00');
    const lunchEndMinutes = timeToMinutes('13:00:00');
    
    console.log('📅 Processing appointments...');
    console.log('  - Total appointments:', allAppointments?.length || 0);
    console.log('  - Starting time:', minutesToTime(currentTimeMinutes));
    console.log('  - Raw appointments data:', allAppointments);
    
    // If no appointments, return the start time
    if (!allAppointments || allAppointments.length === 0) {
      console.log('  - No appointments found, returning start time:', minutesToTime(currentTimeMinutes));
      const estimatedArrivalTime24 = minutesToTime(currentTimeMinutes);
      const estimatedArrivalTime12 = convertTo12Hour(estimatedArrivalTime24);
      return estimatedArrivalTime12;
    }
    
    // Process all appointments in chronological order
    for (const appointment of allAppointments) {
      if (!appointment.appointment_time) {
        console.log('  - Skipping appointment without time:', appointment.id);
        continue;
      }
      
      const appointmentStartMinutes = timeToMinutes(appointment.appointment_time);
      
      // Calculate appointment duration
      console.log(`  - Raw appointment data:`, {
        id: appointment.id,
        appointment_time: appointment.appointment_time,
        total_duration: appointment.total_duration,
        service_duration: appointment.service?.duration,
        add_ons_data: appointment.add_ons_data
      });
      
      // Handle both string and number duration values
      let appointmentDuration = parseInt(appointment.total_duration) || 30; // Default 30 minutes
      
      // Special test case for your scenario
      if (barberId === 'f5c19b20-d74c-4afc-8e0e-4848f2f29049' && targetDate === '2025-10-04') {
        console.log(`🎯 TEST CASE - Appointment ${appointment.id}:`);
        console.log(`  - Raw total_duration: "${appointment.total_duration}" (type: ${typeof appointment.total_duration})`);
        console.log(`  - Parsed duration: ${appointmentDuration}`);
        console.log(`  - Should be 45 minutes for 8:00 AM appointment`);
      }
      
      if (!appointment.total_duration || appointment.total_duration === 0 || appointmentDuration === 0) {
        // Fallback calculation
        const serviceDuration = appointment.service?.duration || 30;
        const addOnsDuration = calculateAddOnsDuration(appointment.add_ons_data);
        appointmentDuration = serviceDuration + addOnsDuration;
        console.log(`  - Fallback calculation: service=${serviceDuration}min, addons=${addOnsDuration}min, total=${appointmentDuration}min`);
    } else {
        console.log(`  - Using database duration: ${appointmentDuration}min`);
      }
      
      const appointmentEndMinutes = appointmentStartMinutes + appointmentDuration;
      
      console.log(`  - Processing appointment: ${appointment.appointment_time} (${appointmentDuration}min) - ends at ${minutesToTime(appointmentEndMinutes)}`);
      console.log(`  - Current time before: ${minutesToTime(currentTimeMinutes)}`);
      
      // Special test case for your scenario
      if (barberId === 'f5c19b20-d74c-4afc-8e0e-4848f2f29049' && targetDate === '2025-10-04' && appointment.appointment_time === '08:00:00') {
        console.log(`🎯 TEST CASE - 8:00 AM appointment calculation:`);
        console.log(`  - Start time: ${appointment.appointment_time} = ${appointmentStartMinutes} minutes`);
        console.log(`  - Duration: ${appointmentDuration} minutes`);
        console.log(`  - End time: ${appointmentStartMinutes} + ${appointmentDuration} = ${appointmentEndMinutes} minutes`);
        console.log(`  - End time (formatted): ${minutesToTime(appointmentEndMinutes)}`);
        console.log(`  - Expected: 8:00 AM + 45 minutes = 8:45 AM`);
      }
      
      // If this appointment starts after current time, update current time
      if (appointmentStartMinutes > currentTimeMinutes) {
        console.log(`  - Appointment starts after current time, updating to: ${minutesToTime(appointmentStartMinutes)}`);
        currentTimeMinutes = appointmentStartMinutes;
      }
      
      // Move current time to after this appointment
      currentTimeMinutes = appointmentEndMinutes;
      console.log(`  - Current time after: ${minutesToTime(currentTimeMinutes)}`);
      
      // Check if we need to account for lunch break
      if (currentTimeMinutes < lunchEndMinutes && currentTimeMinutes > lunchStartMinutes) {
        console.log(`  - Current time crosses lunch break, moving to: ${minutesToTime(lunchEndMinutes)}`);
        currentTimeMinutes = lunchEndMinutes;
      }
    }
    
    // Calculate estimated arrival time for the new customer
    const estimatedArrivalMinutes = currentTimeMinutes;
    const estimatedArrivalTime24 = minutesToTime(estimatedArrivalMinutes);
    const estimatedArrivalTime12 = convertTo12Hour(estimatedArrivalTime24);
    
    console.log('✅ Final calculation:');
    console.log('  - Current time minutes:', currentTimeMinutes);
    console.log('  - Estimated arrival (24h):', estimatedArrivalTime24);
    console.log('  - Estimated arrival (12h):', estimatedArrivalTime12);
    console.log('  - Working hours start:', workingHours.start);
    console.log('  - Working hours end:', workingHours.end);
    
    // Add date indicator if not today
    if (targetDate !== today) {
      const targetDateObj = new Date(targetDate);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      if (targetDate === tomorrow) {
        return `${estimatedArrivalTime12} (Tomorrow)`;
      } else {
      const dayName = targetDateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const monthDay = targetDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${estimatedArrivalTime12} (${dayName}, ${monthDay})`;
      }
    }
    
    return estimatedArrivalTime12;
    
  } catch (error) {
    console.error('Error calculating estimated arrival time:', error);
    return 'N/A';
  }
};

const BookAppointment = () => {
  // Step management
  const [currentStep, setCurrentStep] = useState(1);
  const [bookingData, setBookingData] = useState({
    selectedDate: '',
    appointmentType: 'queue',
    selectedTimeSlot: '',
    selectedBarber: '',
    selectedServices: [],
    selectedAddOns: [],
    specialRequests: '',
    totalPrice: 0,
    bookForFriend: false,
    friendName: '',
    friendPhone: '',
    friendEmail: ''
  });

  // Data states
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [addOns, setAddOns] = useState([]);
  const [barberQueues, setBarberQueues] = useState({});
  const [barberRecommendations, setBarberRecommendations] = useState([]);
  const [showRecommendations, setShowRecommendations] = useState(false);
  
  // UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [user, setUser] = useState(null);
  const [animateForm, setAnimateForm] = useState(false);
  
  // Rebooking states
  const [isRebooking, setIsRebooking] = useState(false);
  const [rebookingAppointment, setRebookingAppointment] = useState(null);
  
  // Additional states
  const [existingAppointment, setExistingAppointment] = useState(null);
  const [bookedTimeSlots, setBookedTimeSlots] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Alternative times modal states
  const [alternativeTimes, setAlternativeTimes] = useState([]);
  const [showAlternativeTimesModal, setShowAlternativeTimesModal] = useState(false);
  
  const navigate = useNavigate();

  // Function to show alternative times modal
  const openAlternativeTimesModal = () => {
    setShowAlternativeTimesModal(true);
  };

  // Debug function to test booking data
  const debugBookingData = () => {
    console.log('🔍 DEBUGGING BOOKING DATA:');
    console.log('User:', user);
    console.log('Booking Data:', bookingData);
    console.log('Barbers:', barbers);
    console.log('Services:', services);
    console.log('Add-ons:', addOns);
    console.log('Barber Queues:', barberQueues);
    console.log('Is Rebooking:', isRebooking);
    console.log('Rebooking Appointment:', rebookingAppointment);
    
    // Test validation
    const validationErrors = [];
    if (!user) validationErrors.push('No user logged in');
    if (!bookingData.selectedBarber) validationErrors.push('No barber selected');
    if (!bookingData.selectedDate) validationErrors.push('No date selected');
    if (bookingData.appointmentType === 'scheduled' && !bookingData.selectedTimeSlot) {
      validationErrors.push('No time slot selected for scheduled appointment');
    }
    if (bookingData.selectedServices.length === 0) validationErrors.push('No services selected');
    
    console.log('Validation Errors:', validationErrors);
    return validationErrors;
  };

  // Handle URL parameters for re-appointment
  useEffect(() => {
      const urlParams = new URLSearchParams(window.location.search);
      const rebookId = urlParams.get('rebook');
    const barberId = urlParams.get('barber');
    const serviceId = urlParams.get('service');
    const servicesData = urlParams.get('services');
    const addonsData = urlParams.get('addons');
    const notes = urlParams.get('notes');

      if (rebookId) {
      // Handle rebooking existing appointment
      handleRebookAppointment(rebookId);
    } else if (barberId || serviceId || servicesData || addonsData || notes) {
      // Handle cloning appointment with pre-filled data
      handleCloneAppointment({
        barber_id: barberId,
        service_id: serviceId,
        services_data: servicesData,
        add_ons_data: addonsData,
        notes: notes
      });
    }
  }, []);

  // Step navigation functions
  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (step) => {
    setCurrentStep(step);
  };

  const updateBookingData = (updates) => {
    setBookingData(prev => ({ ...prev, ...updates }));
  };

  // Handle rebooking existing appointment
  const handleRebookAppointment = async (appointmentId) => {
    try {
      console.log('🔄 Loading appointment for rebooking:', appointmentId);
      setLoading(true);
      
      const { data: appointment, error } = await supabase
        .from('appointments')
        .select(`
          *,
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('id', appointmentId)
        .single();

      if (error) throw error;

      if (!appointment) {
        setError('Appointment not found');
        return;
      }

      // Set rebooking state
      setIsRebooking(true);
      setRebookingAppointment(appointment);

      // Pre-fill booking data
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      updateBookingData({
        selectedDate: tomorrow, // Default to tomorrow for rebooking
        appointmentType: appointment.appointment_type || 'queue',
        selectedTimeSlot: appointment.appointment_time || '',
        selectedBarber: appointment.barber_id,
        selectedServices: appointment.services || [],
        selectedAddOns: appointment.add_ons || [],
        specialRequests: appointment.notes || '',
        totalPrice: appointment.total_price || 0
      });

      setSuccess(`Re-booking appointment with ${appointment.barber?.full_name || 'your barber'}`);
      console.log('✅ Rebooking data loaded:', appointment);
      
    } catch (error) {
      console.error('❌ Error loading appointment for rebooking:', error);
      setError('Failed to load appointment for rebooking');
    } finally {
      setLoading(false);
    }
  };

  // Handle cloning appointment with pre-filled data
  const handleCloneAppointment = (appointmentData) => {
    try {
      console.log('🔄 Cloning appointment with data:', appointmentData);
      
      // Pre-fill booking data
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      let selectedServices = [];
      let selectedAddOns = [];
      
      // Parse services data
      if (appointmentData.services_data) {
        try {
          const servicesData = JSON.parse(appointmentData.services_data);
          // If it's an array of names, find the corresponding IDs
          if (Array.isArray(servicesData)) {
            selectedServices = servicesData.map(serviceName => {
              const service = services.find(s => s.name === serviceName);
              return service ? service.id : null;
            }).filter(Boolean);
          } else {
            selectedServices = [];
          }
        } catch (e) {
          selectedServices = [appointmentData.service_id].filter(Boolean);
        }
      } else if (appointmentData.service_id) {
        selectedServices = [appointmentData.service_id];
      }
      
      // Parse add-ons data
      if (appointmentData.add_ons_data) {
        try {
          const addOnsData = JSON.parse(appointmentData.add_ons_data);
          // If it's an array of names, find the corresponding IDs
          if (Array.isArray(addOnsData)) {
            selectedAddOns = addOnsData.map(addonName => {
              const addon = addOns.find(a => a.name === addonName);
              return addon ? addon.id : null;
            }).filter(Boolean);
          } else {
            selectedAddOns = [];
          }
        } catch (e) {
          selectedAddOns = [];
        }
      }
      
      updateBookingData({
        selectedDate: tomorrow, // Default to tomorrow for new appointment
        appointmentType: 'queue', // Default to queue
        selectedTimeSlot: '',
        selectedBarber: appointmentData.barber_id || '',
        selectedServices: selectedServices,
        selectedAddOns: selectedAddOns,
        specialRequests: appointmentData.notes || '',
        totalPrice: 0 // Will be calculated based on services
      });

      setSuccess('Appointment data pre-filled. Please review and confirm your booking.');
      console.log('✅ Clone appointment data loaded');
      
    } catch (error) {
      console.error('❌ Error cloning appointment:', error);
      setError('Failed to pre-fill appointment data');
    }
  };

  // Generate time slots
  const generateTimeSlots = () => {
    const slots = [];
    const startHour = 8;
    const endHour = 16;
    // Use actual service duration instead of fixed 30-minute slots
    const slotDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns) || 30;

    for (let hour = startHour; hour <= endHour; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        if (hour === endHour && minute >= 30) break; // Stop at 4:30 PM
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeString);
      }
    }
    return slots;
  };

  // Check for existing appointment
  const checkExistingAppointment = async (date) => {
    if (!user) {
      console.log('❌ No user found for checkExistingAppointment');
      return;
    }

    if (!date) {
      console.log('❌ No date provided for checkExistingAppointment');
      return;
    }

    // Validate date format (should be YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      console.error('❌ Invalid date format:', date, 'Expected YYYY-MM-DD');
      return;
    }

    console.log('🔍 Checking existing appointment for:', { userId: user.id, date });

    try {
      const { data: existing, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('customer_id', user.id)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'pending']);

      if (error) {
        console.error('❌ Supabase error in checkExistingAppointment:', error);
        throw error;
      }

      console.log('✅ Existing appointment check result:', { found: existing?.length || 0, appointments: existing });

      if (existing && existing.length > 0) {
        setExistingAppointment(existing[0]);
        return true;
      }
      setExistingAppointment(null);
      return false;
    } catch (error) {
      console.error('Error checking existing appointment:', error);
      return false;
    }
  };

  // Get booked time slots for a specific date and barber (with duration-based blocking)
  const getBookedTimeSlots = async (date, barberId) => {
    try {
      console.log('🔍 Fetching booked time slots with duration blocking for:', date, 'barber:', barberId);
      
      // Get ALL appointments for this barber on this date with duration info
      const { data: booked, error } = await supabase
        .from('appointments')
        .select('appointment_time, appointment_type, status, queue_position, total_duration, services_data, add_ons_data, estimated_wait_time')
        .eq('appointment_date', date)
        .eq('barber_id', barberId)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending']);

      if (error) throw error;
      
      console.log('📅 Raw appointment data:', booked);
      
      // Generate all possible time slots
      const allTimeSlots = generateTimeSlotsWithIntervals();
      const blockedSlots = new Set();
      
      // Separate scheduled and queue appointments
      const scheduledAppointments = (booked || []).filter(apt => 
        apt.appointment_type === 'scheduled' && apt.appointment_time
      );
      const queueAppointments = (booked || []).filter(apt => 
        apt.appointment_type === 'queue'
      );

      console.log('📅 Scheduled appointments:', scheduledAppointments.length);
      console.log('📅 Queue appointments:', queueAppointments.length);

      // Process scheduled appointments and block slots based on duration
      for (const apt of scheduledAppointments) {
        const startTime = apt.appointment_time?.slice(0, 5); // Convert '08:00:00' to '08:00'
        if (!startTime) continue;
        
        // Calculate service duration
        let duration = apt.total_duration || 30; // Default 30 minutes
        
        // If no total_duration, calculate from services and add-ons
        if (!apt.total_duration && (apt.services_data || apt.add_ons_data)) {
          try {
            const services = apt.services_data ? JSON.parse(apt.services_data) : [];
            const addons = apt.add_ons_data ? JSON.parse(apt.add_ons_data) : [];
            
            // Get service durations from database
            const serviceIds = services.map(s => s.id || s);
            const addonIds = addons.map(a => a.id || a);
            
            if (serviceIds.length > 0 || addonIds.length > 0) {
              const { data: serviceData } = await supabase
                .from('services')
                .select('duration')
                .in('id', serviceIds);
              
              const { data: addonData } = await supabase
                .from('add_ons')
                .select('duration')
                .in('id', addonIds);
              
              const serviceDuration = serviceData?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0;
              const addonDuration = addonData?.reduce((sum, a) => sum + (a.duration || 0), 0) || 0;
              duration = serviceDuration + addonDuration || 30;
            }
          } catch (e) {
            console.warn('Error calculating duration for appointment:', e);
            duration = 30; // Fallback to 30 minutes
          }
        }
        
        console.log(`🕐 Processing ${apt.appointment_type} appointment: ${startTime} for ${duration} minutes`);
        
        // Calculate which time slots to block based on duration
        const startHour = parseInt(startTime.split(':')[0]);
        const startMinute = parseInt(startTime.split(':')[1]);
        const startMinutes = startHour * 60 + startMinute;
        const endMinutes = startMinutes + duration;
        
        console.log(`🕐 Time calculation: ${startTime} = ${startMinutes} minutes, duration = ${duration} minutes, end = ${endMinutes} minutes`);
        
        // Block all time slots that overlap with this appointment
        // Check each available time slot to see if it conflicts with this appointment
        for (const slot of allTimeSlots) {
          const slotTime = slot.value; // e.g., "08:00", "08:30", "09:00"
          const slotHour = parseInt(slotTime.split(':')[0]);
          const slotMinute = parseInt(slotTime.split(':')[1]);
          const slotMinutes = slotHour * 60 + slotMinute;
          const slotEndMinutes = slotMinutes + 30; // Each slot is 30 minutes
          
          // Check if this slot overlaps with the appointment
          // Slot overlaps if: slot starts before appointment ends AND slot ends after appointment starts
          const overlaps = slotMinutes < endMinutes && slotEndMinutes > startMinutes;
          
          if (overlaps) {
            blockedSlots.add(slotTime);
            console.log(`🔴 Blocking slot: ${slotTime} (overlaps with ${startTime} - ${Math.floor(endMinutes/60).toString().padStart(2, '0')}:${(endMinutes%60).toString().padStart(2, '0')})`);
          } else {
            console.log(`✅ Slot ${slotTime} is available (no overlap with ${startTime})`);
          }
        }
      }

      // Process queue appointments and calculate their timeline positions
      if (queueAppointments.length > 0) {
        console.log('🔄 Processing queue appointments for timeline...');
        
        // Sort scheduled appointments by time
        const sortedScheduled = [...scheduledAppointments].sort((a, b) => {
          const timeA = a.appointment_time?.slice(0, 5) || '00:00';
          const timeB = b.appointment_time?.slice(0, 5) || '00:00';
          return timeA.localeCompare(timeB);
        });

        // Sort queue appointments by priority and position
        const sortedQueue = [...queueAppointments].sort((a, b) => {
          // Priority first (urgent = 0, normal = 1, low = 2)
          const priorityA = a.is_urgent ? 0 : 1;
          const priorityB = b.is_urgent ? 0 : 1;
          if (priorityA !== priorityB) return priorityA - priorityB;
          
          // Then by queue position
          const posA = a.queue_position || 999;
          const posB = b.queue_position || 999;
          return posA - posB;
        });

        let currentTime = 8 * 60; // Start at 8:00 AM in minutes
        const workEnd = 17 * 60; // End at 5:00 PM in minutes
        const lunchStart = 12 * 60; // 12:00 PM
        const lunchEnd = 13 * 60; // 1:00 PM

        // Process scheduled appointments and insert queue appointments in gaps
        for (const scheduledApt of sortedScheduled) {
          const scheduledTime = timeToMinutes(scheduledApt.appointment_time?.slice(0, 5) || '08:00');
          const scheduledDuration = scheduledApt.total_duration || 30;

          // Try to fit queue appointments before this scheduled appointment
          while (sortedQueue.length > 0 && currentTime < scheduledTime) {
            // Check for lunch break
            if (currentTime >= lunchStart && currentTime < lunchEnd) {
              currentTime = lunchEnd;
              continue;
            }

            const queueApt = sortedQueue[0];
            const queueDuration = queueApt.total_duration || 30;

            // Check if queue appointment fits before scheduled appointment
            if (currentTime + queueDuration + 5 <= scheduledTime) { // 5 min buffer
              // Calculate which time slots this queue appointment would occupy
              const queueStartTime = minutesToTime(currentTime);
              const queueEndTime = minutesToTime(currentTime + queueDuration);
              
              console.log(`📅 Queue appointment would occupy: ${queueStartTime} - ${queueEndTime}`);
              
              // Block time slots that this queue appointment would occupy
              for (const slot of allTimeSlots) {
                const slotTime = slot.value;
                const slotHour = parseInt(slotTime.split(':')[0]);
                const slotMinute = parseInt(slotTime.split(':')[1]);
                const slotMinutes = slotHour * 60 + slotMinute;
                const slotEndMinutes = slotMinutes + 30; // Each slot is 30 minutes
                
                const queueStartMinutes = currentTime;
                const queueEndMinutes = currentTime + queueDuration;
                
                // Check if this slot overlaps with the queue appointment
                if (slotMinutes < queueEndMinutes && slotEndMinutes > queueStartMinutes) {
                  blockedSlots.add(slotTime);
                  console.log(`🔴 Blocking slot: ${slotTime} (occupied by queue appointment ${queueStartTime} - ${queueEndTime})`);
                }
              }
              
              currentTime += queueDuration + 5; // Move to next position
              sortedQueue.shift(); // Remove processed queue appointment
            } else {
              break; // Can't fit, move to after scheduled
            }
          }

          // Move current time past the scheduled appointment
          currentTime = Math.max(currentTime, scheduledTime + scheduledDuration + 5);
        }

        // Process remaining queue appointments after all scheduled appointments
        while (sortedQueue.length > 0 && currentTime < workEnd) {
          // Check for lunch break
          if (currentTime >= lunchStart && currentTime < lunchEnd) {
            currentTime = lunchEnd;
            continue;
          }

          const queueApt = sortedQueue[0];
          const queueDuration = queueApt.total_duration || 30;

          if (currentTime + queueDuration <= workEnd) {
            // Calculate which time slots this queue appointment would occupy
            const queueStartTime = minutesToTime(currentTime);
            const queueEndTime = minutesToTime(currentTime + queueDuration);
            
            console.log(`📅 Queue appointment would occupy: ${queueStartTime} - ${queueEndTime}`);
            
            // Block time slots that this queue appointment would occupy
            for (const slot of allTimeSlots) {
              const slotTime = slot.value;
              const slotHour = parseInt(slotTime.split(':')[0]);
              const slotMinute = parseInt(slotTime.split(':')[1]);
              const slotMinutes = slotHour * 60 + slotMinute;
              const slotEndMinutes = slotMinutes + 30; // Each slot is 30 minutes
              
              const queueStartMinutes = currentTime;
              const queueEndMinutes = currentTime + queueDuration;
              
              // Check if this slot overlaps with the queue appointment
              if (slotMinutes < queueEndMinutes && slotEndMinutes > queueStartMinutes) {
                blockedSlots.add(slotTime);
                console.log(`🔴 Blocking slot: ${slotTime} (occupied by queue appointment ${queueStartTime} - ${queueEndTime})`);
              }
            }
            
            currentTime += queueDuration + 5; // Move to next position
            sortedQueue.shift(); // Remove processed queue appointment
          } else {
            break; // Can't fit today
          }
        }
      }
      
      const allBookedSlots = Array.from(blockedSlots);
      
      // Create detailed slot information
      const detailedSlots = {};
      allBookedSlots.forEach(slot => {
        detailedSlots[slot] = {
          time: slot,
          type: 'blocked', // Will be enhanced to show 'scheduled' or 'queue'
          reason: 'Occupied'
        };
      });
      
      console.log('⏰ Blocked slots based on duration:', allBookedSlots);
      console.log('📋 Total blocked slots:', allBookedSlots.length);
      console.log('📋 Detailed slot info:', detailedSlots);
      
      setBookedTimeSlots(allBookedSlots);
      return allBookedSlots;
    } catch (error) {
      console.error('❌ Error fetching booked time slots:', error);
      setBookedTimeSlots([]);
      return [];
    }
  };

  // Helper functions for time conversion
  const timeToMinutes = (time) => {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Centralized time conversion function
  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
  };

  // Get appointment details for a specific time slot
  const getAppointmentAtTime = (timeSlot) => {
    if (!bookedTimeSlots.includes(timeSlot)) return null;
    
    // Try to find appointment data from the barber queues
    const barberQueue = barberQueues[bookingData.selectedBarber];
    if (barberQueue && barberQueue.appointments) {
      // First, look for scheduled appointments with exact time match
      const scheduledAppointment = barberQueue.appointments.find(apt => 
        apt.appointment_time && apt.appointment_time.slice(0, 5) === timeSlot
      );
      
      if (scheduledAppointment) {
        return {
          time: timeSlot,
          type: scheduledAppointment.appointment_type || 'scheduled',
          appointment: scheduledAppointment
        };
      }
      
      // If no scheduled appointment found, check if there are any queue appointments
      const queueAppointments = barberQueue.appointments.filter(apt => 
        apt.appointment_type === 'queue' && apt.status !== 'cancelled'
      );
      
      if (queueAppointments.length > 0) {
        // If there are queue appointments and this slot is blocked but not by a scheduled appointment,
        // it's likely blocked by a queue appointment
        return {
          time: timeSlot,
          type: 'queue',
          appointment: queueAppointments[0] // Use first queue appointment as representative
        };
      }
    }
    
    // Fallback: assume it's a scheduled appointment if we can't determine
    return {
      time: timeSlot,
      type: 'scheduled', // Default to scheduled for booked slots
      appointment: null
    };
  };

  // Find alternative time suggestions when a slot conflicts
  const findAlternativeTimes = (conflictTime, serviceDuration) => {
    const conflictMinutes = timeToMinutes(conflictTime);
    const serviceMinutes = serviceDuration;
    const suggestions = [];
    
    // Look for available slots before the conflict
    for (let i = 30; i <= 120; i += 30) { // Check 30, 60, 90, 120 minutes before
      const suggestedTime = conflictMinutes - i;
      if (suggestedTime >= 8 * 60) { // Not before 8:00 AM
        const suggestedTimeStr = minutesToTime(suggestedTime);
        if (!bookedTimeSlots.includes(suggestedTimeStr)) {
          suggestions.push({
            time: suggestedTimeStr,
            display: convertTo12Hour(suggestedTimeStr),
            reason: `${i} minutes earlier`,
            type: 'before'
          });
        }
      }
    }
    
    // Look for available slots after the conflict
    for (let i = 30; i <= 120; i += 30) { // Check 30, 60, 90, 120 minutes after
      const suggestedTime = conflictMinutes + i;
      if (suggestedTime <= 17 * 60) { // Not after 5:00 PM
        const suggestedTimeStr = minutesToTime(suggestedTime);
        if (!bookedTimeSlots.includes(suggestedTimeStr)) {
          suggestions.push({
            time: suggestedTimeStr,
            display: convertTo12Hour(suggestedTimeStr),
            reason: `${i} minutes later`,
            type: 'after'
          });
        }
      }
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
  };

  // Helper function to get step title
  const getStepTitle = (step) => {
    switch (step) {
      case 1: return 'Date, Type & Barber';
      case 2: return 'Services & Add-ons';
      case 3: return 'Queue Summary';
      default: return '';
    }
  };

  const getStepDescription = (step) => {
    switch (step) {
      case 1: return 'Choose your date, type and barber';
      case 2: return 'Pick services and add-ons';
      case 3: return 'Review and confirm booking';
      default: return '';
    }
  };

  // Calculate service duration in minutes
  const calculateServiceDuration = async (selectedServices, selectedAddOns = [], servicesList = [], addOnsList = []) => {
    if (!selectedServices || selectedServices.length === 0) return 30; // Default 30 minutes
    
    // Calculate service duration
    const serviceDuration = selectedServices.reduce((total, serviceId) => {
      const service = servicesList.find(s => s.id === serviceId);
      return total + (service?.duration_minutes || 30);
    }, 0);
    
    // Calculate add-ons duration
    let addOnsDuration = 0;
    if (selectedAddOns && selectedAddOns.length > 0) {
      const addOnsData = JSON.stringify(selectedAddOns);
      addOnsDuration = await addOnsService.calculateAddOnsDuration(addOnsData);
    }
    
    const totalDuration = serviceDuration + addOnsDuration;
    return totalDuration || 30; // Default to 30 minutes if no duration found
  };

  // Generate time slots for 8AM-11:30AM and 1PM-4:30PM in 12-hour format
  const generateTimeSlotsWithIntervals = () => {
    const slots = [];
    
    // Morning slots: 8:00 AM - 11:30 AM
    for (let hour = 8; hour <= 11; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === 11 && minute > 30) break; // Stop after 11:30 AM
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayTime = convertTo12Hour(timeString);
        slots.push({ value: timeString, display: displayTime });
      }
    }
    
    // Afternoon slots: 1:00 PM - 4:30 PM
    for (let hour = 13; hour <= 16; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === 16 && minute > 30) break; // Stop at 4:30 PM
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayTime = convertTo12Hour(timeString);
        slots.push({ value: timeString, display: displayTime });
      }
    }
    
    console.log('🕐 Generated time slots:', slots.map(s => s.value));
    console.log('🕐 Total slots count:', slots.length);
    console.log('🕐 11:30 AM included:', slots.some(s => s.value === '11:30'));
    return slots;
  };


  // Queue management logic - handle how queue appointments interact with scheduled slots
  const manageQueueAndScheduledSlots = async (barberId, date) => {
    try {
      console.log('🔄 Managing queue and scheduled slots for barber:', barberId, 'date:', date);
      
      // Get all appointments for this barber on this date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending'])
        .order('queue_position', { ascending: true });

      if (error) throw error;

      console.log('📋 All appointments:', appointments);

      // Separate queue and scheduled appointments
      const queueAppointments = appointments?.filter(apt => apt.appointment_type === 'queue') || [];
      const scheduledAppointments = appointments?.filter(apt => apt.appointment_type === 'scheduled') || [];

      console.log('👥 Queue appointments:', queueAppointments);
      console.log('📅 Scheduled appointments:', scheduledAppointments);

      // Create a time slot occupancy map
      const timeSlotOccupancy = new Map();
      
      // Mark scheduled appointments as occupied
      scheduledAppointments.forEach(apt => {
        if (apt.appointment_time) {
          timeSlotOccupancy.set(apt.appointment_time, {
            type: 'scheduled',
            appointment: apt,
            endTime: null // Will calculate based on service duration
          });
        }
      });

      // Calculate end times for scheduled appointments based on actual service duration
      for (const [timeSlot, occupancy] of timeSlotOccupancy.entries()) {
        if (occupancy.type === 'scheduled') {
          let serviceDuration = occupancy.appointment.total_duration || 30; // Use actual duration
          
          // If no total_duration, calculate from services and add-ons
          if (!occupancy.appointment.total_duration && (occupancy.appointment.services_data || occupancy.appointment.add_ons_data)) {
            try {
              const services = occupancy.appointment.services_data ? JSON.parse(occupancy.appointment.services_data) : [];
              const addons = occupancy.appointment.add_ons_data ? JSON.parse(occupancy.appointment.add_ons_data) : [];
              
              // Get service durations from database
              const serviceIds = services.map(s => s.id || s);
              const addonIds = addons.map(a => a.id || a);
              
              if (serviceIds.length > 0 || addonIds.length > 0) {
                const { data: serviceData } = await supabase
                  .from('services')
                  .select('duration')
                  .in('id', serviceIds);
                
                const { data: addonData } = await supabase
                  .from('add_ons')
                  .select('duration')
                  .in('id', addonIds);
                
                const serviceDurationSum = serviceData?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0;
                const addonDurationSum = addonData?.reduce((sum, a) => sum + (a.duration || 0), 0) || 0;
                serviceDuration = serviceDurationSum + addonDurationSum || 30;
              }
            } catch (e) {
              console.warn('Error calculating duration for scheduled appointment:', e);
              serviceDuration = 30; // Fallback to 30 minutes
            }
          }
          
          const startTime = new Date(`${date} ${timeSlot}`);
          const endTime = new Date(startTime.getTime() + serviceDuration * 60000);
          const endTimeString = endTime.toTimeString().slice(0, 5);
          occupancy.endTime = endTimeString;
          
          console.log(`📅 Scheduled appointment ${occupancy.appointment.id}: ${timeSlot} - ${endTimeString} (${serviceDuration} min)`);
        }
      }

      // Find available time slots for queue appointments with enhanced conflict detection
      const availableSlots = [];
      const allTimeSlots = generateTimeSlotsWithIntervals();
      
      // Create a comprehensive blocked slots map
      const blockedSlots = new Set();
      
      // Block all slots that are occupied by scheduled appointments
      for (const [timeSlot, occupancy] of timeSlotOccupancy.entries()) {
        if (occupancy.type === 'scheduled' && occupancy.endTime) {
          // Block all 30-minute slots that overlap with this scheduled appointment
          const startHour = parseInt(timeSlot.split(':')[0]);
          const startMinute = parseInt(timeSlot.split(':')[1]);
          const startMinutes = startHour * 60 + startMinute;
          
          const endHour = parseInt(occupancy.endTime.split(':')[0]);
          const endMinute = parseInt(occupancy.endTime.split(':')[1]);
          const endMinutes = endHour * 60 + endMinute;
          
          for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
            const hour = Math.floor(minutes / 60);
            const minute = minutes % 60;
            const slotString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            blockedSlots.add(slotString);
          }
        }
      }
      
      // Find available slots
      for (let i = 0; i < allTimeSlots.length; i++) {
        const slot = allTimeSlots[i].value;
        
        if (!blockedSlots.has(slot)) {
            availableSlots.push(slot);
        }
      }

      console.log('⏰ Available time slots for queue:', availableSlots);
      console.log('🚫 Blocked slots by scheduled appointments:', Array.from(blockedSlots));
      console.log('📊 Queue management summary:');
      console.log(`   - Total time slots: ${allTimeSlots.length}`);
      console.log(`   - Blocked by scheduled: ${blockedSlots.size}`);
      console.log(`   - Available for queue: ${availableSlots.length}`);
      console.log(`   - Queue appointments to assign: ${queueAppointments.filter(apt => !apt.appointment_time).length}`);
      
      // Debug: Show all time slots and their status
      console.log('🔍 All time slots status:');
      allTimeSlots.forEach(slot => {
        const isBlocked = blockedSlots.has(slot.value);
        console.log(`   ${slot.display} (${slot.value}): ${isBlocked ? '🚫 BLOCKED' : '✅ AVAILABLE'}`);
      });
      
      // Debug: Show which appointments are blocking which slots
      console.log('🔍 Blocking analysis:');
      for (const apt of appointments || []) {
        if (apt.appointment_time) {
          const startTime = apt.appointment_time?.slice(0, 5);
          const duration = apt.total_duration || 30;
          console.log(`   ${apt.appointment_type} at ${startTime} for ${duration} min blocks: ${Array.from(blockedSlots).filter(slot => {
            const slotHour = parseInt(slot.split(':')[0]);
            const slotMinute = parseInt(slot.split(':')[1]);
            const slotMinutes = slotHour * 60 + slotMinute;
            
            const startHour = parseInt(startTime.split(':')[0]);
            const startMinute = parseInt(startTime.split(':')[1]);
            const startMinutes = startHour * 60 + startMinute;
            const endMinutes = startMinutes + duration;
            
            return slotMinutes >= startMinutes && slotMinutes < endMinutes;
          }).join(', ')}`);
        }
      }

      // Process queue appointments with smart slot assignment and conflict prevention
      const updates = [];
      const assignedSlots = new Set(); // Track assigned slots to prevent conflicts
      let currentSlotIndex = 0;

      // Sort queue appointments by queue number to maintain order
      const sortedQueueAppointments = queueAppointments.sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));
      
      console.log('🔄 Processing queue appointments with conflict management...');
      console.log(`📋 Queue appointments to process: ${sortedQueueAppointments.length}`);
      console.log(`⏰ Available slots: ${availableSlots.length}`);

      for (let i = 0; i < sortedQueueAppointments.length; i++) {
        const queueAppointment = sortedQueueAppointments[i];
        
        // If queue appointment doesn't have a time slot yet
        if (!queueAppointment.appointment_time) {
          // Find the next available slot that doesn't conflict
          let assignedSlot = null;
          
          // Try to find a slot that doesn't conflict with existing assignments
          for (let j = currentSlotIndex; j < availableSlots.length; j++) {
            const candidateSlot = availableSlots[j];
            
            if (!assignedSlots.has(candidateSlot)) {
              // Check if this slot would conflict with any existing scheduled appointments
              let hasConflict = false;
              
              // Calculate duration for this queue appointment
              let queueDuration = queueAppointment.total_duration || 30;
              
              if (!queueAppointment.total_duration && (queueAppointment.services_data || queueAppointment.add_ons_data)) {
                try {
                  const services = queueAppointment.services_data ? JSON.parse(queueAppointment.services_data) : [];
                  const addons = queueAppointment.add_ons_data ? JSON.parse(queueAppointment.add_ons_data) : [];
                  
                  const serviceIds = services.map(s => s.id || s);
                  const addonIds = addons.map(a => a.id || a);
                  
                  if (serviceIds.length > 0 || addonIds.length > 0) {
                    const { data: serviceData } = await supabase
                      .from('services')
                      .select('duration')
                      .in('id', serviceIds);
                    
                    const { data: addonData } = await supabase
                      .from('add_ons')
                      .select('duration')
                      .in('id', addonIds);
                    
                    const serviceDurationSum = serviceData?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0;
                    const addonDurationSum = addonData?.reduce((sum, a) => sum + (a.duration || 0), 0) || 0;
                    queueDuration = serviceDurationSum + addonDurationSum || 30;
                  }
                } catch (e) {
                  console.warn('Error calculating duration for queue appointment:', e);
                  queueDuration = 30;
                }
              }
              
              // Check if this slot would conflict with scheduled appointments
              const startHour = parseInt(candidateSlot.split(':')[0]);
              const startMinute = parseInt(candidateSlot.split(':')[1]);
              const startMinutes = startHour * 60 + startMinute;
              const endMinutes = startMinutes + queueDuration;
              
              for (const [occupiedSlot, occupancy] of timeSlotOccupancy.entries()) {
                if (occupancy.type === 'scheduled' && occupancy.endTime) {
                  const occupiedStartHour = parseInt(occupiedSlot.split(':')[0]);
                  const occupiedStartMinute = parseInt(occupiedSlot.split(':')[1]);
                  const occupiedStartMinutes = occupiedStartHour * 60 + occupiedStartMinute;
                  
                  const occupiedEndHour = parseInt(occupancy.endTime.split(':')[0]);
                  const occupiedEndMinute = parseInt(occupancy.endTime.split(':')[1]);
                  const occupiedEndMinutes = occupiedEndHour * 60 + occupiedEndMinute;
                  
                  // Check for overlap
                  if (startMinutes < occupiedEndMinutes && endMinutes > occupiedStartMinutes) {
                    hasConflict = true;
                    console.log(`⚠️ Conflict detected: Queue slot ${candidateSlot} (${startMinutes}-${endMinutes}) overlaps with scheduled ${occupiedSlot} (${occupiedStartMinutes}-${occupiedEndMinutes})`);
                    break;
                  }
                  
                  // Check for gap management - ensure there's enough buffer time
                  const gapBefore = occupiedStartMinutes - endMinutes;
                  const gapAfter = startMinutes - occupiedEndMinutes;
                  
                  // If there's a small gap (less than 15 minutes), it might cause issues
                  if (gapBefore >= 0 && gapBefore < 15) {
                    console.log(`⚠️ Small gap before scheduled appointment: ${gapBefore} minutes between queue end and scheduled start`);
                  }
                  if (gapAfter >= 0 && gapAfter < 15) {
                    console.log(`⚠️ Small gap after scheduled appointment: ${gapAfter} minutes between scheduled end and queue start`);
                  }
                }
              }
              
              if (!hasConflict) {
                assignedSlot = candidateSlot;
                currentSlotIndex = j + 1; // Move to next slot for next appointment
                console.log(`✅ Queue appointment assigned to ${candidateSlot} (no conflicts detected)`);
                break;
              } else {
                console.log(`❌ Queue appointment cannot use ${candidateSlot} (conflict with scheduled appointment)`);
              }
            }
          }
          
          if (assignedSlot) {
            console.log(`🎯 Assigning slot ${assignedSlot} to queue appointment ${queueAppointment.id} (position ${queueAppointment.queue_position})`);
            
            updates.push({
              id: queueAppointment.id,
              appointment_time: assignedSlot,
              status: 'scheduled' // Change status to scheduled when assigned a slot
            });
            
            // Mark this slot as assigned
            assignedSlots.add(assignedSlot);
            
            // Calculate and log the end time
            let queueDuration = queueAppointment.total_duration || 30;
            const startTime = new Date(`${date} ${assignedSlot}`);
            const endTime = new Date(startTime.getTime() + queueDuration * 60000);
            const endTimeString = endTime.toTimeString().slice(0, 5);
            
            console.log(`⏰ Queue appointment ${queueAppointment.id}: ${assignedSlot} - ${endTimeString} (${queueDuration} min)`);
          } else {
            console.log(`⚠️ No available slots for queue appointment ${queueAppointment.id} (position ${queueAppointment.queue_position}) - conflicts with scheduled appointments`);
            // Keep as queue appointment if no slots available
            break;
          }
        }
      }

      // Update appointments with assigned time slots
      if (updates.length > 0) {
        console.log('📝 Updating appointments with assigned slots:', updates);
        
        for (const update of updates) {
          const { error: updateError } = await supabase
        .from('appointments')
            .update({
              appointment_time: update.appointment_time,
              status: update.status
            })
            .eq('id', update.id);

          if (updateError) {
            console.error('❌ Error updating appointment:', updateError);
          }
        }
      }

      // Refresh the booked time slots after updates
      await getBookedTimeSlots(date, barberId);
      
      // Refresh queue data to show updated information
      await fetchBarberQueues([{ id: barberId }], date);
      
    } catch (error) {
      console.error('❌ Error managing queue and scheduled slots:', error);
    }
  };

  // Enhanced unified queue management functions
  const createUnifiedQueue = (appointments) => {
    const unifiedQueue = [];
    const currentTime = new Date();
    const currentTimeString = currentTime.toTimeString().slice(0, 5);
    
    // Process scheduled appointments first
    const scheduledAppointments = appointments
      .filter(apt => apt.appointment_type === 'scheduled' && apt.appointment_time)
      .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
    
    // Process queue appointments
    const queueAppointments = appointments
      .filter(apt => apt.appointment_type === 'queue' && apt.status === 'pending')
      .sort((a, b) => (a.queue_position || 0) - (b.queue_position || 0));
    
    // Create timeline
    let timeline = [];
    
    // Add scheduled appointments to timeline
    scheduledAppointments.forEach(apt => {
      timeline.push({
        ...apt,
        type: 'scheduled',
        startTime: apt.appointment_time,
        endTime: calculateEndTime(apt.appointment_time, apt.total_duration || 30),
        position: null // Will be calculated based on timeline
      });
    });
    
    // Add queue appointments to timeline
    queueAppointments.forEach(apt => {
      timeline.push({
        ...apt,
        type: 'queue',
        startTime: null, // Will be calculated based on availability
        endTime: null,
        position: apt.queue_position || 0
      });
    });
    
    // Sort timeline by time and position
    timeline.sort((a, b) => {
      if (a.type === 'scheduled' && b.type === 'scheduled') {
        return a.startTime.localeCompare(b.startTime);
      }
      if (a.type === 'queue' && b.type === 'queue') {
        return (a.position || 0) - (b.position || 0);
      }
      if (a.type === 'scheduled' && b.type === 'queue') {
        return -1; // Scheduled appointments come first
      }
      return 1;
    });
    
    // Calculate actual positions and start times
    let currentPosition = 1;
    let lastEndTime = '08:00'; // Start of working day
    
    timeline.forEach((apt, index) => {
      if (apt.type === 'scheduled') {
        apt.position = currentPosition++;
        lastEndTime = apt.endTime;
      } else if (apt.type === 'queue') {
        apt.position = currentPosition++;
        apt.startTime = lastEndTime;
        apt.endTime = calculateEndTime(apt.startTime, apt.total_duration || 30);
        lastEndTime = apt.endTime;
      }
    });
    
    return timeline;
  };

  // Helper function to calculate end time
  const calculateEndTime = (startTime, duration) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + duration;
    const endHours = Math.floor(endMinutes / 60);
    const endMins = endMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  };

  // Helper function to get current position
  const getCurrentPosition = (appointments) => {
    const currentTime = new Date();
    const currentTimeString = currentTime.toTimeString().slice(0, 5);
    
    // Find the appointment that should be currently active
    const activeAppointment = appointments.find(apt => 
      apt.status === 'ongoing' || 
      (apt.appointment_time && apt.appointment_time <= currentTimeString)
    );
    
    return activeAppointment ? activeAppointment.queue_position || 1 : 1;
  };

  // Helper function to calculate unified wait time
  const calculateUnifiedWaitTime = (unifiedQueue) => {
    const currentTime = new Date();
    const currentTimeString = currentTime.toTimeString().slice(0, 5);
    
    // Find current position in queue
    const currentPosition = getCurrentPosition(unifiedQueue);
    const remainingAppointments = unifiedQueue.filter(apt => 
      (apt.position || 0) >= currentPosition
    );
    
    // Calculate total wait time
    const totalWaitTime = remainingAppointments.reduce((total, apt) => {
      return total + (apt.total_duration || 30);
    }, 0);
    
    return totalWaitTime;
  };

  // Fetch data on component mount
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };

    fetchUser();
    fetchBarbersAndServices();
    setTimeSlots(generateTimeSlotsWithIntervals());
    
    // Check for recommended haircut request from HaircutRecommender
    const recommendedHaircutRequest = sessionStorage.getItem('recommendedHaircutRequest');
    const recommendedHaircutName = sessionStorage.getItem('recommendedHaircutName');
    
    if (recommendedHaircutRequest) {
      setBookingData(prev => ({
        ...prev,
        specialRequests: recommendedHaircutRequest
      }));
      
      // Clear the sessionStorage after using it
      sessionStorage.removeItem('recommendedHaircutRequest');
      sessionStorage.removeItem('recommendedHaircutName');
      
      console.log('✅ Applied recommended haircut request:', recommendedHaircutName);
    }
    
    setTimeout(() => {
      setAnimateForm(true);
    }, 300);
  }, []);

  // Fetch barbers and services
  const fetchBarbersAndServices = async () => {
    try {
      // Fetch barbers
      const { data: barbersData, error: barbersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, barber_status, average_rating, total_ratings')
        .eq('role', 'barber')
        .order('full_name');

      if (barbersError) throw barbersError;
      setBarbers(Array.isArray(barbersData) ? barbersData : []);

      // Fetch services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (servicesError) throw servicesError;
      setServices(Array.isArray(servicesData) ? servicesData : []);

      // Fetch add-ons
      const { data: addOnsData, error: addOnsError } = await supabase
        .from('add_ons')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (addOnsError) throw addOnsError;
      setAddOns(Array.isArray(addOnsData) ? addOnsData : []);

      // Fetch barber queues after barbers are loaded
      if (barbersData && barbersData.length > 0) {
        await fetchBarberQueues(barbersData, bookingData.selectedDate);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load booking data. Please try again.');
    }
  };

  // Check if barber can accommodate a specific service duration
  const canBarberAccommodateService = useCallback((queue, serviceDuration = 30) => {
    if (!queue) return false;
    
    const minServiceDuration = serviceDuration || 30;
    const maxQueueSize = 15;
    
    // Check if queue is at maximum capacity
    if (queue.queueCount >= maxQueueSize) return false;
    
    // Check if there's enough remaining time for the service
    if (queue.remainingTime < minServiceDuration) return false;
    
    // Check if adding this service would exceed working hours
    const totalQueueTime = queue.appointments
      ?.filter(apt => apt.appointment_type === 'queue')
      ?.reduce((total, apt) => total + (apt.total_duration || 30), 0) || 0;
    
    const estimatedEndTime = totalQueueTime + minServiceDuration;
    const workingHours = 9 * 60; // 9 hours in minutes (8 AM to 5 PM)
    
    return estimatedEndTime <= workingHours;
  }, []);

  // Fetch barber queues
  const fetchBarberQueues = useCallback(async (barbersList = [], selectedDate = null) => {
    try {
      const dateToFetch = selectedDate || new Date().toISOString().split('T')[0];
      
      console.log('🔄 fetchBarberQueues called with:', { barbersList, selectedDate, dateToFetch });
      
      const { data: queueData, error } = await supabase
        .from('appointments')
        .select('barber_id, status, queue_position, appointment_type, appointment_time, appointment_date, is_urgent, total_duration, services_data, add_ons_data, service_id')
        .eq('appointment_date', dateToFetch)
        .in('status', ['scheduled', 'ongoing', 'pending', 'confirmed']);

      if (error) throw error;

      console.log('📊 Raw queue data from database:', queueData);
      
      // Debug: Check what duration data is available
      if (queueData && queueData.length > 0) {
        console.log('🔍 Duration data analysis:');
        queueData.forEach((apt, idx) => {
          console.log(`  Appointment ${idx + 1}:`, {
            id: apt.id,
            total_duration: apt.total_duration,
            services_data: apt.services_data,
            add_ons_data: apt.add_ons_data,
            service_id: apt.service_id,
            appointment_type: apt.appointment_type
          });
        });
      }

      const queues = {};
      const barbersToProcess = barbersList.length > 0 ? barbersList : barbers;
      
      console.log('👥 Barbers to process:', barbersToProcess);
      
      // Process barbers sequentially to handle async operations
      for (const barber of barbersToProcess) {
        const barberAppointments = queueData?.filter(apt => apt.barber_id === barber.id) || [];
        
        console.log(`📋 Appointments for barber ${barber.id}:`, barberAppointments);
        
        // Separate queue and scheduled appointments
        const queueAppointments = barberAppointments.filter(apt => apt.appointment_type === 'queue');
        const scheduledAppointments = barberAppointments.filter(apt => apt.appointment_type === 'scheduled');
        
        // Debug: Log appointment statuses
        console.log(`🔍 Appointment statuses for barber ${barber.id}:`, {
          queueAppointments: queueAppointments.map(apt => ({ id: apt.id, status: apt.status, type: apt.appointment_type })),
          scheduledAppointments: scheduledAppointments.map(apt => ({ id: apt.id, status: apt.status, type: apt.appointment_type }))
        });
        
        // Filter queue appointments by correct status (confirmed, ongoing, pending, scheduled)
        const activeQueueAppointments = queueAppointments.filter(apt => 
          ['confirmed', 'ongoing', 'pending', 'scheduled'].includes(apt.status)
        );
        
        // Count queue appointments (excluding ongoing - that's the current customer being served)
        const queueCount = activeQueueAppointments.filter(apt => apt.status !== 'ongoing').length;
        const pendingCount = barberAppointments.filter(apt => apt.status === 'pending').length;
        const currentAppointment = barberAppointments.find(apt => apt.status === 'ongoing');
        
        console.log(`📊 Queue calculation for barber ${barber.id}:`, {
          totalAppointments: barberAppointments.length,
          queueAppointments: queueAppointments.length,
          activeQueueAppointments: activeQueueAppointments.length,
          queueCount,
          scheduledCount: scheduledAppointments.length,
          currentAppointment: currentAppointment?.id || 'none'
        });
        
        // Calculate estimated wait time based on actual service durations
        const estimatedWait = await calculateEstimatedWaitTime(activeQueueAppointments, currentAppointment);
        
        // Calculate total time used based on service durations (in 30-minute slots)
        // Calculate capacity based on working hours (8am-5pm = 9 hours = 540 minutes)
        const workingHours = {
          start: '08:00:00',
          end: '17:00:00'
        };
        
        const timeToMinutes = (timeStr) => {
          if (!timeStr) return 0;
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };
        
        const workingStartMinutes = timeToMinutes(workingHours.start);
        const workingEndMinutes = timeToMinutes(workingHours.end);
        const totalWorkingMinutes = workingEndMinutes - workingStartMinutes; // 540 minutes
        
        // Calculate time used by scheduled appointments only
        const scheduledAppts = barberAppointments.filter(apt => apt.appointment_type === 'scheduled');
        const totalTimeUsed = scheduledAppts.reduce((total, apt) => {
          const duration = apt.total_duration || 30;
          return total + duration;
        }, 0);
        
        // Calculate remaining time for queue appointments
        const remainingTime = totalWorkingMinutes - totalTimeUsed;
        
        // Use a more realistic average service duration for capacity calculation
        // This should ideally be based on the most common service duration
        const averageServiceDuration = 40; // 40 minutes average service duration
        const maxQueueCapacity = Math.floor(remainingTime / averageServiceDuration);
        
        // Don't enforce minimum capacity - respect actual time constraints
        const finalQueueCapacity = Math.max(0, maxQueueCapacity);
        const timeBasedAvailableSlots = Math.max(0, finalQueueCapacity - queueAppointments.length);
        
        // Check if barber is fully scheduled (no available time slots)
        // A barber is fully scheduled if:
        // 1. No remaining time in working hours, OR
        // 2. Remaining time is less than minimum service duration (30 minutes), OR
        // 3. Queue is at maximum capacity (15 appointments)
        const minServiceDuration = 30; // Minimum service duration
        const maxQueueSize = 15; // Maximum queue size
        const isFullyScheduled = remainingTime < minServiceDuration || queueAppointments.length >= maxQueueSize;
        
        // Check if barber is at full capacity (queue full OR fully scheduled)
        const isFullCapacity = isFullyScheduled || (remainingTime < minServiceDuration && queueAppointments.length > 0);
        
        const queueInfo = {
          queueCount,
          scheduledCount: scheduledAppointments.length,
          estimatedWait,
          appointments: barberAppointments,
          pendingCount,
          current: currentAppointment,
          isFullCapacity, // Consider full when queue reaches capacity OR fully scheduled
          isFullyScheduled, // Specifically track if fully scheduled
          date: dateToFetch,
          totalTimeUsed, // Total time used in 30-minute slots
          timeBasedAvailableSlots, // Available slots based on actual service time
          remainingTime // Remaining time in minutes
        };
        
        queues[barber.id] = queueInfo;
        console.log(`✅ Queue info for barber ${barber.id}:`, {
          ...queueInfo,
          debug: {
            totalWorkingMinutes,
            totalTimeUsed,
            remainingTime,
            averageServiceDuration,
            maxQueueCapacity,
            finalQueueCapacity,
            timeBasedAvailableSlots,
            isFullyScheduled,
            isFullCapacity
          }
        });
      }

      console.log('📊 Final queues object:', queues);
      setBarberQueues(queues);
    } catch (error) {
      console.error('❌ Error fetching barber queues:', error);
    }
  }, [barbers]);

  // Calculate estimated wait time based on actual service durations
  const calculateEstimatedWaitTime = async (queueAppointments, currentAppointment) => {
    try {
      let totalWaitTime = 0;
      
      // If there's a current appointment, add its remaining time
      if (currentAppointment) {
        const currentServiceDuration = currentAppointment.service?.duration || 30;
        const currentAddOnsDuration = await calculateAddOnsDuration(currentAppointment.add_ons_data);
        totalWaitTime += (currentServiceDuration + currentAddOnsDuration);
      }
      
      // Add wait time for each person in queue
      for (const appointment of queueAppointments) {
        if (appointment.status === 'ongoing') continue; // Skip current appointment (already counted)
        
        const serviceDuration = appointment.service?.duration || 30;
        const addOnsDuration = await calculateAddOnsDuration(appointment.add_ons_data);
        totalWaitTime += (serviceDuration + addOnsDuration);
      }
      
      return Math.max(0, totalWaitTime); // Return 0 if negative
    } catch (error) {
      console.error('Error calculating estimated wait time:', error);
      return queueAppointments.length * 30; // Fallback to 30 minutes per person
    }
  };

  // Calculate add-ons duration
  const calculateAddOnsDuration = async (addOnsData) => {
    try {
      if (!addOnsData) return 0;
      
      // Handle both array format (new) and JSON string format (old)
      let addOnItems;
      if (Array.isArray(addOnsData)) {
        addOnItems = addOnsData;
      } else {
        addOnItems = JSON.parse(addOnsData);
      }
      
      if (!Array.isArray(addOnItems) || addOnItems.length === 0) return 0;
      
      // Legacy mapping for addon durations
      const legacyDurationMapping = {
        'addon1': 15, // Beard Trim
        'addon2': 10, // Hot Towel Treatment
        'addon3': 20, // Scalp Massage
        'addon4': 15, // Hair Wash
        'addon5': 10, // Styling
        'addon6': 15, // Hair Wax Application
        'addon7': 10, // Eyebrow Trim
        'addon8': 10, // Mustache Trim
        'addon9': 15, // Face Mask
        'addon10': 20  // Hair Treatment
      };
      
      let totalDuration = 0;
      addOnItems.forEach(item => {
        if (legacyDurationMapping[item]) {
          totalDuration += legacyDurationMapping[item];
        }
      });
      
      return totalDuration;
    } catch (error) {
      console.error('Error calculating add-ons duration:', error);
      return 0;
    }
  };

  // Calculate estimated wait time for a specific appointment
  const calculateEstimatedWaitTimeForAppointment = async (appointmentId, barberId, appointmentDate) => {
    try {
      // Get all appointments in queue for this barber on this date
      const { data: queueAppointments, error } = await supabase
        .from('appointments')
        .select(`
          id,
          service_id,
          add_ons_data,
          total_duration,
          status,
          queue_position,
          service:service_id(duration)
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .eq('appointment_type', 'queue')
        .in('status', ['confirmed', 'ongoing', 'pending'])
        .order('queue_position', { ascending: true });

      if (error) throw error;

      let totalWaitTime = 0;
      let foundCurrentAppointment = false;

      for (const appointment of queueAppointments || []) {
        // If this is the current appointment, we're done
        if (appointment.id === appointmentId) {
          foundCurrentAppointment = true;
          break;
        }

        // Add duration for appointments before this one
        if (appointment.total_duration) {
          totalWaitTime += appointment.total_duration;
        } else {
          // Fallback calculation
          const serviceDuration = appointment.service?.duration || 30;
          const addOnsDuration = await calculateAddOnsDuration(appointment.add_ons_data);
          totalWaitTime += serviceDuration + addOnsDuration;
        }
      }

      return foundCurrentAppointment ? totalWaitTime : 0;
    } catch (error) {
      console.error('Error calculating estimated wait time for appointment:', error);
      return 0;
    }
  };

  // Calculate next available time slot based on service duration
  const calculateNextAvailableTimeSlot = async (barberId, appointmentDate, serviceDuration) => {
    try {
      console.log('🕐 Calculating next available time slot...');
      console.log('  - Barber ID:', barberId);
      console.log('  - Date:', appointmentDate);
      console.log('  - Service Duration:', serviceDuration, 'minutes');

      // Get all existing appointments for this barber on this date
      const { data: existingAppointments, error } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_time,
          total_duration,
          status,
          appointment_type
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .in('status', ['confirmed', 'ongoing', 'pending', 'scheduled'])
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      // Define working hours (8:00 AM to 5:00 PM)
      const workingHours = {
        start: '08:00:00', // 8:00 AM - Start of morning session
        end: '17:00:00'    // 5:00 PM - End of afternoon session
      };

      // Convert time string to minutes for easier calculation
      const timeToMinutes = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };

      // Local minutesToTime function for this scope
      const minutesToTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
      };

      const startMinutes = timeToMinutes(workingHours.start);
      const endMinutes = timeToMinutes(workingHours.end);
      const lunchStartMinutes = timeToMinutes('12:00:00');
      const lunchEndMinutes = timeToMinutes('13:00:00');

      // Create a list of occupied time slots
      const occupiedSlots = [];
      
      for (const appointment of existingAppointments || []) {
        if (appointment.appointment_time) {
          const appointmentStart = timeToMinutes(appointment.appointment_time);
          const appointmentDuration = appointment.total_duration || 30; // Default 30 minutes
          const appointmentEnd = appointmentStart + appointmentDuration;
          
          occupiedSlots.push({
            start: appointmentStart,
            end: appointmentEnd,
            duration: appointmentDuration
          });
        }
      }

      // Sort occupied slots by start time
      occupiedSlots.sort((a, b) => a.start - b.start);

      console.log('📅 Occupied slots:', occupiedSlots);

      // Find the next available slot
      let currentTime = startMinutes;
      
      for (const slot of occupiedSlots) {
        // Check if there's enough time between current time and next appointment
        const availableTime = slot.start - currentTime;
        
        if (availableTime >= serviceDuration) {
          // Check if this slot crosses lunch break
          const slotEnd = currentTime + serviceDuration;
          if (currentTime < lunchEndMinutes && slotEnd > lunchStartMinutes) {
            // This slot crosses lunch break, move to after lunch
            currentTime = lunchEndMinutes;
            continue;
          }
          
          console.log('✅ Found available slot:', minutesToTime(currentTime));
          return minutesToTime(currentTime);
        }
        
        // Move to after this appointment
        currentTime = slot.end;
      }

      // Check if there's time at the end of the day
      const remainingTime = endMinutes - currentTime;
      if (remainingTime >= serviceDuration) {
        // Check if this slot crosses lunch break
        const slotEnd = currentTime + serviceDuration;
        if (currentTime < lunchEndMinutes && slotEnd > lunchStartMinutes) {
          // This slot crosses lunch break, move to after lunch
          currentTime = lunchEndMinutes;
          const finalRemainingTime = endMinutes - currentTime;
          if (finalRemainingTime >= serviceDuration) {
            console.log('✅ Found available slot after lunch:', minutesToTime(currentTime));
            return minutesToTime(currentTime);
          }
        } else {
          console.log('✅ Found available slot at end of day:', minutesToTime(currentTime));
          return minutesToTime(currentTime);
        }
      }

      // If no slot found, return null for queue appointments (they don't need specific times)
      console.log('⚠️ No available slot found for queue appointment');
      return null;

    } catch (error) {
      console.error('Error calculating next available time slot:', error);
      // For queue appointments, return null instead of defaulting to 8:00 AM
      return null;
    }
  };

  // Helper functions for enhanced queue summary
  const getQueuePosition = (barberId, selectedDate = null) => {
    const queue = barberQueues[barberId];
    if (!queue) return 'N/A';
    
    // Get all appointments for this barber on the selected date
    const appointments = queue.appointments || [];
    const dateToCheck = selectedDate || new Date().toISOString().split('T')[0];
    
    // Filter appointments for the selected date
    const dateAppointments = appointments.filter(apt => 
      apt.appointment_date === dateToCheck
    );
    
    // Count all active appointments (both queue and scheduled)
    const activeAppointments = dateAppointments.filter(apt => 
      ['pending', 'scheduled', 'confirmed', 'ongoing'].includes(apt.status)
    );
    
    // Get the highest queue position from existing appointments
    const maxQueuePosition = Math.max(0, ...activeAppointments.map(apt => apt.queue_position || 0));
    
    // Next position is the highest existing position + 1
    const totalPosition = maxQueuePosition + 1;
    
    console.log('🔢 Queue position calculation:', {
      barberId,
      selectedDate: dateToCheck,
      activeAppointments: activeAppointments.length,
      maxQueuePosition,
      totalPosition
    });
    
    return totalPosition;
  };

  const getNextSlotRange = async (barberId, selectedDate = null) => {
    console.log('🔍 getNextSlotRange called with:', { barberId, selectedDate });
    const queue = barberQueues[barberId];
    if (!queue || !timeSlots) {
      console.log('🔍 getNextSlotRange - No queue or timeSlots, returning N/A');
      return 'N/A';
    }
    
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Use selectedDate if provided, otherwise default to today
      const targetDate = selectedDate || today;
      const isTargetTomorrow = targetDate === tomorrow;
      const isTargetFuture = targetDate > tomorrow;
      
      // Use the unified function to get next available slot
      const nextAvailable = await getNextAvailableSlot(barberId, targetDate);
      
      // Add appropriate date indicator
      let result;
      if (isTargetTomorrow) {
        result = `${nextAvailable} (Tomorrow)`;
      } else if (isTargetFuture) {
        const targetDateObj = new Date(targetDate);
        const dayName = targetDateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const monthDay = targetDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        result = `${nextAvailable} (${dayName}, ${monthDay})`;
      } else {
        result = nextAvailable;
      }
      
      console.log('🔍 getNextSlotRange - Final result:', result);
      return result;
      
    } catch (error) {
      console.error('Error calculating next slot:', error);
      return 'N/A';
    }
  };

  const calculateTotalDuration = (selectedServices, selectedAddOns, servicesList, addOnsList) => {
    const servicesDuration = selectedServices.reduce((total, serviceId) => {
      const service = servicesList.find(s => s.id === serviceId);
      return total + (service?.duration || 30); // Fixed: use 'duration' not 'duration_minutes'
    }, 0);
    
    // Use the same add-ons duration calculation as queue calculation
    const addOnsDuration = selectedAddOns.reduce((total, addonId) => {
      const addon = addOnsList.find(a => a.id === addonId);
      if (addon) {
        return total + (addon.duration || 15);
      }
      
      // Legacy mapping for addon durations (same as queue calculation)
      const legacyDurationMapping = {
        'addon1': 15, // Beard Trim
        'addon2': 10, // Hot Towel Treatment
        'addon3': 20, // Scalp Massage
        'addon4': 15, // Hair Wash
        'addon5': 10, // Styling
        'addon6': 15, // Hair Wax Application
        'addon7': 10, // Eyebrow Trim
        'addon8': 10, // Mustache Trim
        'addon9': 15, // Face Mask
        'addon10': 20  // Hair Treatment
      };
      
      return total + (legacyDurationMapping[addonId] || 15);
    }, 0);

    return servicesDuration + addOnsDuration;
  };

  // Check if a service would cross the lunch break (12:00 PM - 1:00 PM)
  const wouldCrossLunchBreak = (startTime, duration) => {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + duration;
    
    // Lunch break is 12:00 PM (720 minutes) to 1:00 PM (780 minutes)
    const lunchStart = 12 * 60; // 720 minutes
    const lunchEnd = 13 * 60;   // 780 minutes
    
    // Check if service crosses lunch break
    return startMinutes < lunchEnd && endMinutes > lunchStart;
  };

  // Enhanced gap management for 40-minute services
  const checkServiceGapConflicts = (slotTime, duration) => {
    if (!duration || duration <= 0) return false;
    
    const [startHour, startMinute] = slotTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + duration;
    
    // Check if this service would create inefficient gaps
    // For 40-minute services, we want to avoid creating 20-minute gaps
    const nextSlot = startMinutes + 30; // Next 30-minute slot
    const hasGapAfter = !bookedTimeSlots.includes(minutesToTime(nextSlot)) && 
                       nextSlot < endMinutes;
    
    // Check if there's a gap before this slot that would be inefficient
    const prevSlot = startMinutes - 30;
    const hasGapBefore = prevSlot >= 0 && 
                        !bookedTimeSlots.includes(minutesToTime(prevSlot)) &&
                        prevSlot + duration <= 16 * 60; // Within business hours
    
    return hasGapAfter || hasGapBefore;
  };

  // Find gap-optimized time slots for better scheduling
  const findGapOptimizedTimes = (preferredTime, duration) => {
    const optimizedTimes = [];
    const [prefHour, prefMinute] = preferredTime.split(':').map(Number);
    const prefMinutes = prefHour * 60 + prefMinute;
    
    // Look for slots that would fill gaps efficiently
    const timeSlots = [
      '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
    ];
    
    timeSlots.forEach(slot => {
      const [hour, minute] = slot.split(':').map(Number);
      const slotMinutes = hour * 60 + minute;
      
      // Skip if this slot is already booked
      if (bookedTimeSlots.includes(slot)) return;
      
      // Skip if this would cross lunch break
      if (wouldCrossLunchBreak(slot, duration)) return;
      
      // Check if this slot would fill a gap efficiently
      const wouldFillGap = checkIfFillsGap(slot, duration);
      
      if (wouldFillGap) {
        optimizedTimes.push({
          time: slot,
          display: convertTo12Hour(slot),
          reason: 'Fills scheduling gap efficiently',
          priority: Math.abs(slotMinutes - prefMinutes) < 60 ? 'high' : 'medium'
        });
      }
    });
    
    // Sort by priority and proximity to preferred time
    return optimizedTimes.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === 'high' ? -1 : 1;
      }
      const aMinutes = timeToMinutes(a.time);
      const bMinutes = timeToMinutes(b.time);
      return Math.abs(aMinutes - prefMinutes) - Math.abs(bMinutes - prefMinutes);
    });
  };

  // Check if a slot would fill a scheduling gap efficiently
  const checkIfFillsGap = (slotTime, duration) => {
    const [hour, minute] = slotTime.split(':').map(Number);
    const startMinutes = hour * 60 + minute;
    const endMinutes = startMinutes + duration;
    
    // Check if this slot would fill a gap between existing appointments
    const prevSlot = minutesToTime(startMinutes - 30);
    const nextSlot = minutesToTime(endMinutes);
    
    const hasAppointmentBefore = bookedTimeSlots.includes(prevSlot);
    const hasAppointmentAfter = bookedTimeSlots.includes(nextSlot);
    
    // This slot fills a gap if there are appointments before and after
    return hasAppointmentBefore && hasAppointmentAfter;
  };

  // Check if a time slot + duration would conflict with existing appointments
  const wouldSlotConflictWithExistingAppointments = (slotTime, duration, bookedSlots) => {
    if (!duration || duration <= 0) return false;
    
    const [startHour, startMinute] = slotTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + duration;
    
    console.log(`🔍 Checking conflict for slot ${slotTime} with ${duration} minutes (${startMinutes} - ${endMinutes})`);
    
    // Check if this slot + duration would overlap with any existing appointment
    // We need to check against the actual appointment data, not just the booked slots list
    // This is a simplified check - in a real implementation, you'd want to check against
    // the actual appointment durations from the database
    
    // For now, we'll check if any of the slots that would be occupied by this appointment
    // are already in the booked slots list
    const slotsToCheck = [];
    for (let time = startMinutes; time < endMinutes; time += 30) {
      const hour = Math.floor(time / 60);
      const minute = time % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slotsToCheck.push(timeString);
    }
    
    const hasConflict = slotsToCheck.some(slot => bookedSlots.includes(slot));
    
    if (hasConflict) {
      console.log(`🔴 Conflict detected: Slot ${slotTime} with ${duration} minutes would overlap with existing appointments`);
    } else {
      console.log(`✅ No conflict: Slot ${slotTime} with ${duration} minutes is available`);
    }
    
    return hasConflict;
  };

  const getEstimatedStartTime = async (barberId, selectedDate = null) => {
    const queue = barberQueues[barberId];
    if (!queue || !timeSlots) return 'N/A';
    
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const today = now.toISOString().split('T')[0];
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Use selectedDate if provided, otherwise default to today
      const targetDate = selectedDate || today;
      const isTargetToday = targetDate === today;
      const isTargetTomorrow = targetDate === tomorrow;
      const isTargetFuture = targetDate > tomorrow;
      
      // Check if this is a scheduled appointment
      if (bookingData.appointmentType === 'scheduled' && bookingData.selectedTimeSlot) {
        // For scheduled appointments, use the selected time slot
        const selectedSlot = timeSlots.find(slot => slot.value === bookingData.selectedTimeSlot);
        if (selectedSlot) {
          // Add appropriate date indicator
          if (isTargetTomorrow) {
            return `${selectedSlot.display} (Tomorrow)`;
          } else if (isTargetFuture) {
            const targetDateObj = new Date(targetDate);
            const dayName = targetDateObj.toLocaleDateString('en-US', { weekday: 'long' });
            const monthDay = targetDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${selectedSlot.display} (${dayName}, ${monthDay})`;
          }
          return selectedSlot.display;
        }
        return 'N/A';
      }
      
      // For queue appointments, calculate based on queue position
      const queueCount = queue.queueCount || 0;
      
      // Get scheduled appointments for the target date
      const { data: targetAppointments, error: targetError } = await supabase
        .from('appointments')
        .select('appointment_time, appointment_type, status')
        .eq('barber_id', barberId)
        .eq('appointment_date', targetDate)
        .eq('appointment_type', 'scheduled')
        .in('status', ['scheduled', 'confirmed', 'ongoing']);
      
      if (targetError) {
        console.error('Error fetching appointments:', targetError);
        return 'N/A';
      }
      
      // Get booked time slots for the target date
      const targetBookedSlots = targetAppointments?.map(apt => apt.appointment_time).filter(Boolean) || [];
      
      // Find available slots for the target date
      let availableSlots;
      if (isTargetToday) {
        // For today, only future slots are available
        availableSlots = timeSlots.filter(slot => 
          slot.value > currentTime && !targetBookedSlots.includes(slot.value)
        );
      } else {
        // For tomorrow or future dates, all slots are available (no time restriction)
        availableSlots = timeSlots.filter(slot => 
          !targetBookedSlots.includes(slot.value)
        );
      }
      
      if (availableSlots.length === 0) {
        return 'No slots available';
      }
      
      // Calculate customer's estimated slot based on queue position
      const customerSlotIndex = Math.min(queueCount, availableSlots.length - 1);
      const customerSlot = availableSlots[customerSlotIndex];
      
      // Add appropriate date indicator
      if (isTargetTomorrow) {
        return `${customerSlot.display} (Tomorrow)`;
      } else if (isTargetFuture) {
        const targetDateObj = new Date(targetDate);
        const dayName = targetDateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const monthDay = targetDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${customerSlot.display} (${dayName}, ${monthDay})`;
      }
      
      return customerSlot.display;
      
    } catch (error) {
      console.error('Error calculating estimated start time:', error);
      return 'N/A';
    }
  };

  const getEstimatedEndTime = async (barberId, selectedServices, selectedAddOns, servicesList, addOnsList, selectedDate = null) => {
    const startTime = await getEstimatedStartTime(barberId, selectedDate);
    if (startTime === 'N/A' || startTime === 'No slots available') return 'N/A';
    
    const totalDuration = calculateTotalDuration(selectedServices, selectedAddOns, servicesList, addOnsList);
    
    // Extract date indicator and clean start time
    let dateIndicator = '';
    let cleanStartTime = startTime;
    
    if (startTime.includes('(Tomorrow)')) {
      dateIndicator = ' (Tomorrow)';
      cleanStartTime = startTime.replace(' (Tomorrow)', '');
    } else if (startTime.includes('(') && startTime.includes(')')) {
      // Extract future date indicator like "(Wednesday, Dec 25)"
      const match = startTime.match(/\(([^)]+)\)$/);
      if (match) {
        dateIndicator = ` (${match[1]})`;
        cleanStartTime = startTime.replace(dateIndicator, '');
      }
    }
    
    // For scheduled appointments, use the selected time slot directly
    let startTime24;
    if (bookingData.appointmentType === 'scheduled' && bookingData.selectedTimeSlot) {
      startTime24 = bookingData.selectedTimeSlot;
    } else {
      // For queue appointments, find the time slot object
      const startTimeObj = timeSlots.find(slot => slot.display === cleanStartTime);
      if (!startTimeObj) {
        console.warn('Start time slot not found:', cleanStartTime);
        return 'N/A';
      }
      startTime24 = startTimeObj.value;
    }
    
    const [hours, minutes] = startTime24.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    
    const endDate = new Date(startDate.getTime() + totalDuration * 60000);
    const endTime24 = endDate.toTimeString().slice(0, 5);
    
    // Find the closest time slot for the end time
    const endTimeSlot = timeSlots.find(slot => slot.value === endTime24);
    let endTimeDisplay;
    
    if (endTimeSlot) {
      endTimeDisplay = endTimeSlot.display;
    } else {
      // If exact time slot not found, create a custom time display
      // This handles cases like 12:00 PM which falls in the lunch break gap
      const [hours, minutes] = endTime24.split(':').map(Number);
      const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const minutesStr = minutes.toString().padStart(2, '0');
      endTimeDisplay = `${hour12}:${minutesStr} ${ampm}`;
    }
    
    // Add date indicator if present
    if (dateIndicator) {
      return `${endTimeDisplay}${dateIndicator}`;
    }
    
    return endTimeDisplay;
  };

  // Load barber recommendations when step 1 is reached
  useEffect(() => {
    if (currentStep === 1 && user && bookingData.selectedDate) {
      loadBarberRecommendations();
    }
  }, [currentStep, user, bookingData.selectedDate]);

  // Also load recommendations when barbers are loaded
  useEffect(() => {
    if (barbers.length > 0 && user && bookingData.selectedDate && currentStep === 1) {
      loadBarberRecommendations();
    }
  }, [barbers, user, bookingData.selectedDate, currentStep]);

  // Always load recommendations when barbers are available (fallback)
  useEffect(() => {
    if (barbers.length > 0 && currentStep === 1 && (!barberRecommendations || barberRecommendations.length === 0)) {
      console.log('🔄 Loading fallback recommendations...');
      
      // Filter out barbers with full slots based on service duration
      const serviceDuration = bookingData.selectedServices.length > 0 
        ? calculateTotalDuration(
            bookingData.selectedServices, 
            bookingData.selectedAddOns, 
            services, 
            addOns
          )
        : 30; // Default 30 minutes if no services selected yet
      
      // Filter to only include available barbers for recommendations
      const availableBarbers = barbers.filter(barber => {
        const queue = barberQueues[barber.id];
        const canAccommodate = canBarberAccommodateService ? canBarberAccommodateService(queue, serviceDuration) : false;
        const isFullSlot = queue && (!canAccommodate || queue.isFullCapacity);
        return !isFullSlot; // Only include barbers who can accommodate the service
      });
      
      console.log(`📊 Filtered barbers: ${availableBarbers.length} available out of ${barbers.length} total`);
      
      // Sort barbers by rating (highest first)
      const sortedBarbers = [...availableBarbers].sort((a, b) => {
        const ratingA = a.average_rating || 0;
        const ratingB = b.average_rating || 0;
        const reviewCountA = a.total_ratings || 0;
        const reviewCountB = b.total_ratings || 0;
        
        // Primary sort by rating, secondary by review count
        if (ratingA !== ratingB) {
          return ratingB - ratingA;
        }
        return reviewCountB - reviewCountA;
      });
      
      // Generate more recommendations to ensure we have enough available ones
      const fallbackRecommendations = sortedBarbers.slice(0, 6).map((barber, index) => {
        const rating = barber.average_rating || 0;
        const reviewCount = barber.total_ratings || 0;
        
        // All barbers in this list are available (already filtered)
        
        // Calculate score based on rating and review count
        let score = Math.round(rating * 20); // Convert 5-star rating to percentage (0-100)
        if (reviewCount > 10) score += 10; // Bonus for experienced barbers
        if (reviewCount > 50) score += 5; // Extra bonus for highly reviewed barbers
        
        // Cap at 100%
        score = Math.min(score, 100);
        
        return {
          barber: barber,
          score: score,
          reasons: [
            `${rating.toFixed(1)}/5 rating`,
            `${reviewCount} reviews`,
            reviewCount > 10 ? 'Experienced barber' : 'New barber'
          ],
          queueCount: index,
          isRecommended: true,
          priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low'
        };
      });
      
      setBarberRecommendations(fallbackRecommendations);
      setShowRecommendations(true);
    }
  }, [barbers, currentStep, barberRecommendations, barberQueues, bookingData.selectedServices, bookingData.selectedAddOns, services, addOns, canBarberAccommodateService]);

  // Refresh queue data when selected date changes
  useEffect(() => {
    if (barbers.length > 0 && bookingData.selectedDate) {
      fetchBarberQueues(barbers, bookingData.selectedDate);
    }
  }, [bookingData.selectedDate, barbers]);

  // Load time slots when appointment type changes to scheduled
  useEffect(() => {
      if (bookingData.appointmentType === 'scheduled' && bookingData.selectedDate && bookingData.selectedBarber) {
        console.log('🕐 Auto-loading time slots for scheduled appointment...');
      getBookedTimeSlots(bookingData.selectedDate, bookingData.selectedBarber);
    }
  }, [bookingData.appointmentType, bookingData.selectedDate, bookingData.selectedBarber]);

  // Real-time refresh for time slots when appointments are booked
  useEffect(() => {
    const handleAppointmentChange = (event) => {
      const { barberId, appointmentDate } = event.detail;
      
      // Refresh time slots if it's for the same barber and date
      if (barberId === bookingData.selectedBarber && appointmentDate === bookingData.selectedDate) {
        console.log('🔄 Refreshing time slots due to appointment change');
        getBookedTimeSlots(bookingData.selectedDate, bookingData.selectedBarber);
      }
    };

    // Listen for appointment changes
    window.addEventListener('appointmentStatusChanged', handleAppointmentChange);
    
    // Also refresh every 30 seconds to ensure accuracy
    const refreshInterval = setInterval(() => {
      if (bookingData.appointmentType === 'scheduled' && bookingData.selectedDate && bookingData.selectedBarber) {
        console.log('🔄 Periodic time slot refresh');
        getBookedTimeSlots(bookingData.selectedDate, bookingData.selectedBarber);
      }
    }, 30000);

    return () => {
      window.removeEventListener('appointmentStatusChanged', handleAppointmentChange);
      clearInterval(refreshInterval);
    };
  }, [bookingData.selectedBarber, bookingData.selectedDate, bookingData.appointmentType]);

  // Test function to verify queue blocking (can be called from browser console)
  window.testQueueBlocking = async () => {
    console.log('🧪 Testing queue blocking...');
    if (bookingData.selectedDate && bookingData.selectedBarber) {
      try {
        const bookedSlots = await getBookedTimeSlots(bookingData.selectedDate, bookingData.selectedBarber);
        console.log('📋 Current booked slots:', bookedSlots);
        console.log('🕐 Current time slots:', timeSlots);
        console.log('✅ Test completed successfully!');
        return { bookedSlots, timeSlots };
      } catch (error) {
        console.error('❌ Error in test:', error);
        return null;
      }
    } else {
      console.log('❌ Please select a date and barber first');
      console.log('Current booking data:', { selectedDate: bookingData.selectedDate, selectedBarber: bookingData.selectedBarber });
      return null;
    }
  };

  // Test function with parameters
  window.testQueueBlockingWithParams = async (date, barberId) => {
    console.log('🧪 Testing queue blocking with parameters...', { date, barberId });
    try {
      const bookedSlots = await getBookedTimeSlots(date, barberId);
      console.log('📋 Booked slots result:', bookedSlots);
      return bookedSlots;
    } catch (error) {
      console.error('❌ Error in test:', error);
      return null;
    }
  };

  // Direct database test function
  window.testDatabaseQuery = async (date, barberId) => {
    console.log('🔍 Testing direct database query...', { date, barberId });
    try {
      const { data: allAppointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, appointment_type, status, queue_position, total_duration, services_data, add_ons_data')
        .eq('appointment_date', date)
        .eq('barber_id', barberId)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending']);

      if (error) {
        console.error('❌ Database error:', error);
        return null;
      }

      console.log('📅 Raw appointments from database:', allAppointments);
      
      const scheduledSlots = allAppointments
        ?.filter(apt => apt.appointment_type === 'scheduled' && apt.appointment_time)
        ?.map(apt => apt.appointment_time?.slice(0, 5))
        ?.filter(Boolean) || [];
      
      const queueSlots = allAppointments
        ?.filter(apt => apt.appointment_type === 'queue' && apt.appointment_time)
        ?.map(apt => apt.appointment_time?.slice(0, 5))
        ?.filter(Boolean) || [];

      console.log('⏰ Scheduled slots found:', scheduledSlots);
      console.log('👥 Queue slots found:', queueSlots);
      console.log('📋 Total blocked slots:', [...scheduledSlots, ...queueSlots]);

      return { scheduledSlots, queueSlots, allAppointments };
        } catch (error) {
      console.error('❌ Error in database test:', error);
      return null;
    }
  };

  // Test function for 90-minute duration blocking
  window.test90MinuteBlocking = async (date, barberId) => {
    console.log('🧪 Testing 90-minute duration blocking...', { date, barberId });
    
    // Create a test appointment with 90 minutes duration
    const testAppointment = {
      appointment_time: '08:00:00',
      appointment_type: 'scheduled',
      status: 'pending',
      total_duration: 90
    };
    
    console.log('📝 Test appointment:', testAppointment);
    
    // Simulate the blocking logic
    const startTime = testAppointment.appointment_time?.slice(0, 5); // '08:00'
    const duration = testAppointment.total_duration; // 90
    
    const startHour = parseInt(startTime.split(':')[0]); // 8
    const startMinute = parseInt(startTime.split(':')[1]); // 0
    const startMinutes = startHour * 60 + startMinute; // 480
    const endMinutes = startMinutes + duration; // 570
    
    console.log(`🕐 Time calculation: ${startTime} = ${startMinutes} minutes, duration = ${duration} minutes, end = ${endMinutes} minutes`);
    
    const blockedSlots = [];
    for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      blockedSlots.push(timeString);
      console.log(`🔴 Should block slot: ${timeString} (${minutes} minutes)`);
    }
    
    console.log('📋 Expected blocked slots for 90-minute service:', blockedSlots);
    return blockedSlots;
  };

  // Debug function to check all appointments for a specific date/barber
  window.debugAllAppointments = async (date, barberId) => {
    console.log('🔍 Debugging all appointments...', { date, barberId });
    
    try {
      const { data: allAppointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('appointment_date', date)
        .eq('barber_id', barberId);

      if (error) {
        console.error('❌ Database error:', error);
        return null;
      }

      console.log('📅 ALL appointments for this barber on this date:', allAppointments);
      
      // Check each appointment's blocking effect
      for (const apt of allAppointments || []) {
        if (apt.appointment_time) {
          const startTime = apt.appointment_time?.slice(0, 5);
          const duration = apt.total_duration || 30;
          
          console.log(`\n📝 Appointment ${apt.id}:`);
          console.log(`   Time: ${startTime}`);
          console.log(`   Duration: ${duration} minutes`);
          console.log(`   Type: ${apt.appointment_type}`);
          console.log(`   Status: ${apt.status}`);
          
          // Calculate blocked slots
          const startHour = parseInt(startTime.split(':')[0]);
          const startMinute = parseInt(startTime.split(':')[1]);
          const startMinutes = startHour * 60 + startMinute;
          const endMinutes = startMinutes + duration;
          
          const blockedSlots = [];
          for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
            const hour = Math.floor(minutes / 60);
            const minute = minutes % 60;
            const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            blockedSlots.push(timeString);
          }
          
          console.log(`   Blocks slots: ${blockedSlots.join(', ')}`);
        }
      }
      
      return allAppointments;
    } catch (error) {
      console.error('❌ Error in debug:', error);
      return null;
    }
  };

  // Make manageQueueAndScheduledSlots available globally for testing
  window.manageQueueAndScheduledSlots = manageQueueAndScheduledSlots;

  // Real-time queue status updates
  const [queueStatus, setQueueStatus] = useState({});

  // Unified slot system state
  const [unifiedSlots, setUnifiedSlots] = useState([]);
  const [alternativeBarbers, setAlternativeBarbers] = useState([]);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [isBarberFullyScheduled, setIsBarberFullyScheduled] = useState(false);

  // Unified slot system functions
  const loadUnifiedSlots = async (barberId, date, serviceDuration) => {
    try {
      console.log('🔄 Loading unified slots for:', { barberId, date, serviceDuration });
      const slots = await UnifiedSlotBookingService.getUnifiedSlots(barberId, date, serviceDuration);
      setUnifiedSlots(slots);
      console.log('✅ Unified slots loaded:', slots.length);
      return slots;
    } catch (error) {
      console.error('❌ Error loading unified slots:', error);
      setUnifiedSlots([]);
      return [];
    }
  };

  const loadAlternativeBarbers = async (date, serviceDuration, excludeBarberId) => {
    try {
      console.log('🔄 Loading alternative barbers...');
      const alternatives = await UnifiedSlotBookingService.getAlternativeBarbers(
        date, 
        serviceDuration, 
        excludeBarberId, 
        barbers
      );
      setAlternativeBarbers(alternatives);
      setShowAlternatives(alternatives.length > 0);
      console.log('✅ Alternative barbers loaded:', alternatives.length);
      return alternatives;
    } catch (error) {
      console.error('❌ Error loading alternative barbers:', error);
      setAlternativeBarbers([]);
      setShowAlternatives(false);
      return [];
    }
  };

  const handleUnifiedSlotSelect = (slot) => {
    console.log('🎯 Selected unified slot:', slot);
    
    // Determine appointment type based on slot availability and time
    let appointmentType = 'queue'; // Default to queue
    
    if (slot.type === 'available' && slot.canBook && slot.time) {
      appointmentType = 'scheduled'; // Has specific time = scheduled
    } else if (slot.type === 'queue_position') {
      appointmentType = 'queue'; // No specific time = queue
    }
    
    console.log('🎯 Determined appointment type:', appointmentType, 'for slot:', slot);
    
    updateBookingData({
      selectedTimeSlot: slot.time || null,
      selectedSlot: slot,
      appointmentType: appointmentType
    });
  };

  const handleAlternativeBarberSelect = (barberId) => {
    console.log('🎯 Selected alternative barber:', barberId);
    updateBookingData({ selectedBarber: barberId });
    setShowAlternatives(false);
    // Reload slots for the new barber
    if (bookingData.selectedDate && bookingData.selectedServices.length > 0) {
      const serviceDuration = calculateTotalDuration(
        bookingData.selectedServices, 
        bookingData.selectedAddOns, 
        services, 
        addOns
      );
      loadUnifiedSlots(barberId, bookingData.selectedDate, serviceDuration);
    }
  };

  // Validate barber scheduled availability before booking
  const validateBarberScheduledAvailability = async (barberId, date, selectedTimeSlot) => {
    try {
      console.log('🔍 Validating barber scheduled availability for booking...');
      
      const serviceDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
      const slots = await UnifiedSlotBookingService.getUnifiedSlots(barberId, date, serviceDuration);
      const availableSlots = slots.filter(slot => slot.canBook && slot.type === 'available');
      
      console.log('📊 Booking validation - Barber slot analysis:', {
        totalSlots: slots.length,
        availableSlots: availableSlots.length,
        selectedTimeSlot,
        serviceDuration
      });
      
      // If no available slots, barber is fully scheduled
      if (availableSlots.length === 0) {
        throw new Error('This barber is fully scheduled and has no available time slots. Please select a different barber or date.');
      }
      
      // Check if the selected time slot is actually available
      if (selectedTimeSlot) {
        const selectedSlot = slots.find(slot => slot.time === selectedTimeSlot);
        if (!selectedSlot || !selectedSlot.canBook || selectedSlot.type !== 'available') {
          throw new Error(`The selected time slot ${selectedTimeSlot} is no longer available. Please select a different time slot.`);
        }
      }
      
      console.log('✅ Barber scheduled availability validation passed');
      return true;
      
    } catch (error) {
      console.error('❌ Barber scheduled availability validation failed:', error);
      throw error;
    }
  };

  // Validate barber queue availability before booking
  const validateBarberQueueAvailability = async (barberId, date) => {
    try {
      console.log('🔍 Validating barber queue availability for booking...');
      
      const serviceDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
      const slots = await UnifiedSlotBookingService.getUnifiedSlots(barberId, date, serviceDuration);
      const availableSlots = slots.filter(slot => slot.canBook && slot.type === 'available');
      const queueSlots = slots.filter(slot => slot.type === 'queue');
      
      console.log('📊 Queue booking validation - Barber slot analysis:', {
        totalSlots: slots.length,
        availableSlots: availableSlots.length,
        queueSlots: queueSlots.length,
        serviceDuration
      });
      
      // If no available slots AND no queue capacity, barber is completely full
      if (availableSlots.length === 0 && queueSlots.length >= 15) { // Assuming max queue size of 15
        throw new Error('This barber is completely full - no available time slots and queue is at maximum capacity. Please select a different barber or date.');
      }
      
      // If no available slots but queue has capacity, allow queue booking
      if (availableSlots.length === 0) {
        console.log('⚠️ Barber has no available time slots, but queue booking is allowed');
      }
      
      console.log('✅ Barber queue availability validation passed');
      return true;
      
    } catch (error) {
      console.error('❌ Barber queue availability validation failed:', error);
      throw error;
    }
  };

  // Real-time status calculation functions
  const calculateCurrentQueueStatus = async (barberId, date) => {
    try {
      console.log('🔄 Calculating current queue status for:', { barberId, date });
      
      // Get current appointments for this barber on this date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_time,
          total_duration,
          status,
          appointment_type,
          queue_position,
          created_at
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing'])
        .order('queue_position', { ascending: true });

      if (error) throw error;

      const queueAppointments = appointments?.filter(apt => apt.appointment_type === 'queue') || [];
      const scheduledAppointments = appointments?.filter(apt => apt.appointment_type === 'scheduled') || [];
      
      // Calculate current queue position for new appointment
      const nextQueuePosition = queueAppointments.length + 1;
      
      // Calculate estimated wait time based on current queue
      const totalQueueDuration = queueAppointments.reduce((total, apt) => {
        return total + (apt.total_duration || 30);
      }, 0);
      
      // Add buffer time for service transitions (5 minutes per appointment)
      const bufferTime = queueAppointments.length * 5;
      const totalWaitTime = totalQueueDuration + bufferTime;
      
      // Calculate current time and business hours
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const businessStart = '08:00';
      const businessEnd = '17:00';
      
      // Determine if barber is currently working
      const isBusinessHours = currentTime >= businessStart && currentTime <= businessEnd;
      
      // Calculate barber's current status
      let barberStatus = 'available';
      if (!isBusinessHours) {
        barberStatus = 'closed';
      } else {
        // Check if barber is currently with a scheduled appointment
        const currentScheduled = scheduledAppointments.find(apt => {
          if (!apt.appointment_time) return false;
          const aptStart = apt.appointment_time.slice(0, 5);
          const aptEnd = new Date(`2000-01-01 ${aptStart}`);
          aptEnd.setMinutes(aptEnd.getMinutes() + (apt.total_duration || 30));
          const aptEndTime = aptEnd.toTimeString().slice(0, 5);
          return currentTime >= aptStart && currentTime <= aptEndTime;
        });
        
        if (currentScheduled) {
          barberStatus = 'busy';
        } else if (queueAppointments.length > 0) {
          // If there are queue appointments, barber is available but working
          barberStatus = 'available';
        }
      }
      
      const result = {
        queueLength: queueAppointments.length,
        nextQueuePosition,
        estimatedWaitTime: totalWaitTime,
        barberStatus,
        isBusinessHours,
        currentTime,
        scheduledAppointments: scheduledAppointments.length,
        queueAppointments: queueAppointments.length,
        totalAppointments: appointments?.length || 0
      };
      
      console.log('📊 Queue Status Result:', result);
      return result;
      
    } catch (error) {
      console.error('❌ Error calculating queue status:', error);
      return {
        queueLength: 0,
        nextQueuePosition: 1,
        estimatedWaitTime: 0,
        barberStatus: 'unknown',
        isBusinessHours: false,
        currentTime: new Date().toTimeString().slice(0, 5),
        scheduledAppointments: 0,
        queueAppointments: 0,
        totalAppointments: 0
      };
    }
  };

  // Calculate real-time availability for a barber - ESLint fix
  const calculateRealTimeAvailability = async (barberId, date, serviceDuration) => {
    try {
      console.log('🔄 Calculating real-time availability for:', { barberId, date, serviceDuration });
      
      // Get current appointments to calculate actual capacity
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_time,
          total_duration,
          status,
          appointment_type,
          queue_position
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing'])
        .order('queue_position', { ascending: true });

      if (error) throw error;

      const queueAppointments = appointments?.filter(apt => apt.appointment_type === 'queue') || [];
      const scheduledAppointments = appointments?.filter(apt => apt.appointment_type === 'scheduled') || [];
      
      // Calculate capacity based on working hours (8am-5pm = 9 hours = 540 minutes)
      const workingHours = {
        start: '08:00:00',
        end: '17:00:00'
      };
      
      const timeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };
      
      const workingStartMinutes = timeToMinutes(workingHours.start);
      const workingEndMinutes = timeToMinutes(workingHours.end);
      const totalWorkingMinutes = workingEndMinutes - workingStartMinutes; // 540 minutes
      
      // Calculate time used by scheduled appointments only
      const totalTimeUsed = scheduledAppointments.reduce((total, apt) => {
        const duration = apt.total_duration || 30;
        return total + duration;
      }, 0);
      
      // Calculate remaining time for queue appointments
      const remainingTime = totalWorkingMinutes - totalTimeUsed;
      const averageServiceDuration = 40; // 40 minutes average service duration
      const maxQueueCapacity = Math.floor(remainingTime / averageServiceDuration);
      
      // Don't enforce minimum capacity - respect actual time constraints
      const finalQueueCapacity = Math.max(0, maxQueueCapacity);
      const timeBasedAvailableSlots = Math.max(0, finalQueueCapacity - queueAppointments.length);
      
      // Check if adding another appointment would exceed working hours
      const totalQueueTime = queueAppointments.reduce((total, apt) => {
        return total + (apt.total_duration || 30);
      }, 0);
      
      // Add the customer's service duration to check if it would exceed working hours
      const customerServiceDuration = serviceDuration || 40; // Use provided service duration or default
      const estimatedEndTime = workingStartMinutes + totalQueueTime + customerServiceDuration;
      const wouldExceedWorkingHours = estimatedEndTime > workingEndMinutes;
      
      // Calculate next available time
      let nextAvailableTime = null;
      if (timeBasedAvailableSlots > 0) {
        // Calculate next available time based on current queue
        const totalQueueTime = queueAppointments.reduce((total, apt) => {
          return total + (apt.total_duration || 30);
        }, 0);
        
        const nextAvailableMinutes = workingStartMinutes + totalQueueTime;
        if (nextAvailableMinutes < workingEndMinutes) {
          const hours = Math.floor(nextAvailableMinutes / 60);
          const minutes = nextAvailableMinutes % 60;
          nextAvailableTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
      }
      
      // Calculate queue position and wait time
      const queuePosition = queueAppointments.length + 1;
      const estimatedWaitTime = queueAppointments.reduce((total, apt) => {
        return total + (apt.total_duration || 30);
      }, 0);
      
      const isAtCapacity = queueAppointments.length >= finalQueueCapacity || wouldExceedWorkingHours;
      
      return {
        availableSlots: isAtCapacity ? 0 : timeBasedAvailableSlots,
        queueSlots: queueAppointments.length,
        scheduledSlots: scheduledAppointments.length,
        nextAvailableTime: isAtCapacity ? null : nextAvailableTime,
        queuePosition,
        estimatedWaitTime,
        totalSlots: finalQueueCapacity + scheduledAppointments.length,
        canBookNow: !isAtCapacity && timeBasedAvailableSlots > 0 && !wouldExceedWorkingHours,
        canJoinQueue: !isAtCapacity && !wouldExceedWorkingHours,
        isAtCapacity,
        wouldExceedWorkingHours
      };
      
    } catch (error) {
      console.error('❌ Error calculating real-time availability:', error);
      return {
        availableSlots: 0,
        queueSlots: 0,
        scheduledSlots: 0,
        nextAvailableTime: null,
        queuePosition: null,
        estimatedWaitTime: 0,
        totalSlots: 0,
        canBookNow: false,
        canJoinQueue: false,
        isAtCapacity: true,
        wouldExceedWorkingHours: true
      };
    }
  };

  // Real-time queue status update function
  const updateQueueStatus = async (barberId, date) => {
    try {
      setIsRefreshing(true);
      console.log('🔄 Updating real-time queue status...', { barberId, date });
      console.log('🔍 Using barber ID for real-time status:', barberId);
      console.log('🔍 Real-time queue status - Date:', date, 'Type:', typeof date);
      
      // Get current appointments for this barber
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending'])
        .order('queue_position', { ascending: true });

      if (error) throw error;

      // Find currently serving appointment
      const currentServing = appointments?.find(apt => apt.status === 'ongoing') || null;
      
      // Calculate queue position for pending appointments
      const pendingAppointments = appointments?.filter(apt => apt.status === 'pending' && apt.appointment_type === 'queue') || [];
      const queuePosition = pendingAppointments.length > 0 ? pendingAppointments[0].queue_position : null;
      
      // Calculate estimated wait time based on actual appointment durations
      let estimatedWait = 0;
      
      // Add remaining time for currently serving appointment (including add-ons)
      if (currentServing) {
        let currentDuration = currentServing.total_duration || 30;
        
        // Calculate actual duration including add-ons
        if (!currentServing.total_duration && (currentServing.services_data || currentServing.add_ons_data)) {
          try {
            const services = currentServing.services_data ? JSON.parse(currentServing.services_data) : [];
            const addons = currentServing.add_ons_data ? JSON.parse(currentServing.add_ons_data) : [];
            
            const serviceIds = services.map(s => s.id || s);
            const addonIds = addons.map(a => a.id || a);
            
            if (serviceIds.length > 0 || addonIds.length > 0) {
              const { data: serviceData } = await supabase
                .from('services')
                .select('duration')
                .in('id', serviceIds);
              
              const { data: addonData } = await supabase
                .from('add_ons')
                .select('duration')
                .in('id', addonIds);
              
              const serviceDuration = serviceData?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0;
              const addonDuration = addonData?.reduce((sum, a) => sum + (a.duration || 0), 0) || 0;
              currentDuration = serviceDuration + addonDuration || 30;
            }
          } catch (e) {
            console.warn('Error calculating current serving duration:', e);
            currentDuration = 30;
          }
        }
        
        const startTime = currentServing.appointment_time?.slice(0, 5);
        
        if (startTime) {
          const startHour = parseInt(startTime.split(':')[0]);
          const startMinute = parseInt(startTime.split(':')[1]);
          const startMinutes = startHour * 60 + startMinute;
          const endMinutes = startMinutes + currentDuration;
          
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const currentMinutes = currentHour * 60 + currentMinute;
          
          // Calculate remaining time for current appointment
          const remainingTime = Math.max(0, endMinutes - currentMinutes);
          estimatedWait += remainingTime;
          
          console.log(`⏰ Current serving: ${startTime} for ${currentDuration} min, remaining: ${remainingTime} min`);
        } else {
          estimatedWait += currentDuration;
        }
      }
      
      // Add wait time for queue appointments (pending appointments without time slots)
      const queueAppointments = appointments?.filter(apt => 
        apt.appointment_type === 'queue' && 
        apt.status === 'pending' && 
        !apt.appointment_time &&
        (!queuePosition || apt.queue_position < queuePosition)
      ) || [];
      
      for (const apt of queueAppointments) {
        let duration = apt.total_duration || 30;
        
        // Calculate duration including add-ons for queue appointments
        if (!apt.total_duration && (apt.services_data || apt.add_ons_data)) {
          try {
            const services = apt.services_data ? JSON.parse(apt.services_data) : [];
            const addons = apt.add_ons_data ? JSON.parse(apt.add_ons_data) : [];
            
            const serviceIds = services.map(s => s.id || s);
            const addonIds = addons.map(a => a.id || a);
            
            if (serviceIds.length > 0 || addonIds.length > 0) {
              const { data: serviceData } = await supabase
                .from('services')
                .select('duration')
                .in('id', serviceIds);
              
              const { data: addonData } = await supabase
                .from('add_ons')
                .select('duration')
                .in('id', addonIds);
              
              const serviceDuration = serviceData?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0;
              const addonDuration = addonData?.reduce((sum, a) => sum + (a.duration || 0), 0) || 0;
              duration = serviceDuration + addonDuration || 30;
            }
          } catch (e) {
            console.warn('Error calculating queue appointment duration:', e);
            duration = 30;
          }
        }
        
        estimatedWait += duration;
      }
      
      // Add wait time for scheduled appointments that haven't started yet (including add-ons)
      const futureScheduledAppointments = appointments?.filter(apt => 
        apt.appointment_type === 'scheduled' && 
        apt.status === 'pending' && 
        apt.appointment_time
      ) || [];
      
      for (const apt of futureScheduledAppointments) {
        const startTime = apt.appointment_time?.slice(0, 5);
        if (startTime) {
          let duration = apt.total_duration || 30;
          
          // Calculate duration including add-ons for future scheduled appointments
          if (!apt.total_duration && (apt.services_data || apt.add_ons_data)) {
            try {
              const services = apt.services_data ? JSON.parse(apt.services_data) : [];
              const addons = apt.add_ons_data ? JSON.parse(apt.add_ons_data) : [];
              
              const serviceIds = services.map(s => s.id || s);
              const addonIds = addons.map(a => a.id || a);
              
              if (serviceIds.length > 0 || addonIds.length > 0) {
                const { data: serviceData } = await supabase
                  .from('services')
                  .select('duration')
                  .in('id', serviceIds);
                
                const { data: addonData } = await supabase
                  .from('add_ons')
                  .select('duration')
                  .in('id', addonIds);
                
                const serviceDuration = serviceData?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0;
                const addonDuration = addonData?.reduce((sum, a) => sum + (a.duration || 0), 0) || 0;
                duration = serviceDuration + addonDuration || 30;
              }
            } catch (e) {
              console.warn('Error calculating future scheduled duration:', e);
              duration = 30;
            }
          }
          
          const startHour = parseInt(startTime.split(':')[0]);
          const startMinute = parseInt(startTime.split(':')[1]);
          const startMinutes = startHour * 60 + startMinute;
          
          const now = new Date();
          const currentHour = now.getHours();
          const currentMinute = now.getMinutes();
          const currentMinutes = currentHour * 60 + currentMinute;
          
          // If this scheduled appointment is in the future, add its duration to wait time
          if (startMinutes > currentMinutes) {
            estimatedWait += duration;
          }
        }
      }
      
      // Use the unified function to get next available slot
      const nextAvailable = await getNextAvailableSlot(barberId, date);
      
      const newStatus = {
        currentServing: currentServing ? {
          queueNumber: currentServing.queue_position,
          customerName: currentServing.customer?.full_name || 'Customer',
          startTime: currentServing.appointment_time,
          duration: currentServing.total_duration || 30
        } : null,
        queuePosition,
        estimatedWait: estimatedWait > 0 ? `${estimatedWait} minutes` : 'No wait',
        nextAvailable,
        lastUpdated: new Date().toLocaleTimeString()
      };
      
      setQueueStatus(prev => ({
        ...prev,
        [barberId]: newStatus
      }));
      console.log('📊 Real-time queue status updated:', newStatus);
      console.log('🔍 Real-time queue status - Next Available:', nextAvailable);
      
      return newStatus;
    } catch (error) {
      console.error('❌ Error updating queue status:', error);
      return null;
    }
  };

  // Make updateQueueStatus available globally
  window.updateQueueStatus = updateQueueStatus;

  // Hybrid Appointment System - Convert between queue and scheduled
  const convertToHybrid = async (appointmentId, targetType) => {
    try {
      console.log(`🔄 Converting appointment ${appointmentId} to ${targetType}...`);
      
      const updates = {};
      
      if (targetType === 'scheduled') {
        // Convert queue to scheduled - assign time slot
        const { data: appointment, error: fetchError } = await supabase
          .from('appointments')
          .select('*')
          .eq('id', appointmentId)
          .single();
          
        if (fetchError) throw fetchError;
        
        // Find next available slot
        const { data: allAppointments } = await supabase
          .from('appointments')
          .select('appointment_time, total_duration')
          .eq('barber_id', appointment.barber_id)
          .eq('appointment_date', appointment.appointment_date)
          .in('status', ['scheduled', 'confirmed', 'ongoing']);
          
        const allTimeSlots = generateTimeSlotsWithIntervals();
        const blockedSlots = new Set();
        
        // Block existing appointments
        for (const apt of allAppointments || []) {
          if (apt.appointment_time) {
            const startTime = apt.appointment_time?.slice(0, 5);
            const duration = apt.total_duration || 30;
            
            const startHour = parseInt(startTime.split(':')[0]);
            const startMinute = parseInt(startTime.split(':')[1]);
            const startMinutes = startHour * 60 + startMinute;
            const endMinutes = startMinutes + duration;
            
            // Block all time slots that overlap with this appointment
            for (const slot of allTimeSlots) {
              const slotTime = slot.value;
              const slotHour = parseInt(slotTime.split(':')[0]);
              const slotMinute = parseInt(slotTime.split(':')[1]);
              const slotMinutes = slotHour * 60 + slotMinute;
              const slotEndMinutes = slotMinutes + 30; // Each slot is 30 minutes
              
              // Check if this slot overlaps with the appointment
              const overlaps = slotMinutes < endMinutes && slotEndMinutes > startMinutes;
              
              if (overlaps) {
                blockedSlots.add(slotTime);
              }
            }
          }
        }
        
        const nextAvailable = allTimeSlots.find(slot => !blockedSlots.has(slot.value));
        
        if (nextAvailable) {
          updates.appointment_time = nextAvailable.value + ':00';
          updates.appointment_type = 'scheduled';
          updates.status = 'scheduled';
        } else {
          throw new Error('No available time slots');
        }
        
      } else if (targetType === 'queue') {
        // Convert scheduled to queue - remove time slot, assign queue number
        const { data: appointment, error: fetchError } = await supabase
          .from('appointments')
          .select('barber_id, appointment_date')
          .eq('id', appointmentId)
          .single();
          
        if (fetchError) throw fetchError;
        
        const queueCount = barberQueues[appointment.barber_id]?.queueCount || 0;
        
        updates.appointment_time = null;
        updates.appointment_type = 'queue';
        updates.status = 'pending';
        updates.queue_position = queueCount + 1;
      }
      
      const { error: updateError } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', appointmentId);
        
      if (updateError) throw updateError;
      
      console.log(`✅ Successfully converted appointment to ${targetType}`);
      
      // Refresh data
      await fetchBarberQueues();
      
      // Get appointment details for status update
      const { data: updatedAppointment } = await supabase
        .from('appointments')
        .select('barber_id, appointment_date')
        .eq('id', appointmentId)
        .single();
        
      if (updatedAppointment) {
        await updateQueueStatus(updatedAppointment.barber_id, updatedAppointment.appointment_date);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error converting appointment:', error);
      return false;
    }
  };

  // Make convertToHybrid available globally
  window.convertToHybrid = convertToHybrid;

  // Make getNextSlotRange available globally for testing
  window.getNextSlotRange = getNextSlotRange;
  
  // Unified function to get next available slot (used by both functions)
  const getNextAvailableSlot = async (barberId, date, serviceDuration = 30) => {
    try {
      console.log('🔍 getNextAvailableSlot called with:', { barberId, date, serviceDuration });
      
      // Get current appointments to calculate proper next available time
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('barber_id', barberId)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending'])
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      // Calculate next available time based on actual service durations
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      
      // Find the latest appointment end time
      let latestEndTime = currentTime;
      
      for (const apt of appointments || []) {
        if (apt.appointment_time) {
          const [hour, minute] = apt.appointment_time.split(':').map(Number);
          const startMinutes = hour * 60 + minute;
          const duration = apt.total_duration || 30;
          const endMinutes = startMinutes + duration;
          
          if (endMinutes > latestEndTime) {
            latestEndTime = endMinutes;
          }
        }
      }
      
      // Calculate next available slot considering service duration
      const nextAvailableMinutes = latestEndTime;
      const nextAvailableTime = minutesToTime(nextAvailableMinutes);
        
        // Convert to display format
        const timeSlots = generateTimeSlotsWithIntervals();
      const matchingSlot = timeSlots.find(ts => ts.value === nextAvailableTime);
        
      const result = matchingSlot ? matchingSlot.display : nextAvailableTime;
      console.log(`🔍 getNextAvailableSlot - Next available: ${result} (${serviceDuration} min service)`);
      
      return result;
      
    } catch (error) {
      console.error('Error in getNextAvailableSlot:', error);
      return 'N/A';
    }
  };
  
  // Make it available globally
  window.getNextAvailableSlot = getNextAvailableSlot;

  
  
  // Test function for getNextSlotRange debugging
  window.testGetNextSlotRange = async (barberId, date) => {
    console.log('🧪 Testing getNextSlotRange...', { barberId, date });
    const result = await getNextSlotRange(barberId, date);
    console.log('📋 getNextSlotRange result:', result);
    return result;
  };
  
  

  // Test function for queue vs scheduled conflict scenario
  window.testQueueScheduledConflict = async (date, barberId) => {
    console.log('🧪 Testing Queue vs Scheduled Conflict Scenario...', { date, barberId });
    
    // Create test scenario: Queue at 8:00 AM, Scheduled at 9:30 AM
    const testScenario = {
      queueAppointment: {
        appointment_time: '08:00:00',
        appointment_type: 'queue',
        status: 'pending',
        total_duration: 45, // 45 minutes
        queue_position: 1
      },
      scheduledAppointment: {
        appointment_time: '09:30:00',
        appointment_type: 'scheduled',
        status: 'pending',
        total_duration: 45, // 45 minutes
        queue_position: null
      }
    };
    
    console.log('📝 Test Scenario:');
    console.log(`   Queue: 8:00 AM - 8:45 AM (45 min)`);
    console.log(`   Scheduled: 9:30 AM - 10:15 AM (45 min)`);
    console.log(`   Gap: 8:45 AM - 9:30 AM (45 minutes free)`);
    
    // Calculate time slots
    const allTimeSlots = generateTimeSlotsWithIntervals();
    const blockedSlots = new Set();
    
    // Block slots for queue appointment
    const queueStart = 8 * 60; // 8:00 AM = 480 minutes
    const queueEnd = queueStart + 45; // 8:45 AM = 525 minutes
    
    for (let minutes = queueStart; minutes < queueEnd; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      blockedSlots.add(timeString);
    }
    
    // Block slots for scheduled appointment
    const scheduledStart = 9 * 60 + 30; // 9:30 AM = 570 minutes
    const scheduledEnd = scheduledStart + 45; // 10:15 AM = 615 minutes
    
    for (let minutes = scheduledStart; minutes < scheduledEnd; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      blockedSlots.add(timeString);
    }
    
    console.log('🚫 Blocked slots:', Array.from(blockedSlots));
    
    // Find available slots
    const availableSlots = allTimeSlots
      .map(slot => slot.value)
      .filter(slot => !blockedSlots.has(slot));
    
    console.log('✅ Available slots:', availableSlots);
    
    // Show the gap analysis
    const gapStart = 8 * 60 + 45; // 8:45 AM
    const gapEnd = 9 * 60 + 30;   // 9:30 AM
    const gapMinutes = gapEnd - gapStart;
    
    console.log(`📊 Gap Analysis:`);
    console.log(`   Gap duration: ${gapMinutes} minutes`);
    console.log(`   Gap time: 8:45 AM - 9:30 AM`);
    console.log(`   Can fit another appointment: ${gapMinutes >= 30 ? 'Yes' : 'No'}`);
    
    return {
      blockedSlots: Array.from(blockedSlots),
      availableSlots,
      gapMinutes,
      canFitAnother: gapMinutes >= 30
    };
  };

  // Test function for queue assignment with scheduled appointment scenario
  window.testQueueAssignmentWithScheduled = async (date, barberId) => {
    console.log('🧪 Testing Queue Assignment with Scheduled Appointment...', { date, barberId });
    
    console.log('📝 Scenario:');
    console.log(`   Scheduled: 9:30 AM - 10:15 AM (45 min)`);
    console.log(`   Queue customer wants appointment`);
    console.log(`   Question: Should queue get 8:00 AM slot?`);
    
    // Simulate the queue management logic
    const allTimeSlots = generateTimeSlotsWithIntervals();
    const blockedSlots = new Set();
    
    // Block only the scheduled appointment (9:30 AM - 10:15 AM)
    const scheduledStart = 9 * 60 + 30; // 9:30 AM = 570 minutes
    const scheduledEnd = scheduledStart + 45; // 10:15 AM = 615 minutes
    
    for (let minutes = scheduledStart; minutes < scheduledEnd; minutes += 30) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      blockedSlots.add(timeString);
    }
    
    console.log('🚫 Blocked by scheduled appointment:', Array.from(blockedSlots));
    
    // Find available slots for queue
    const availableSlots = allTimeSlots
      .map(slot => slot.value)
      .filter(slot => !blockedSlots.has(slot));
    
    console.log('✅ Available slots for queue:', availableSlots);
    
    // Check if 8:00 AM is available
    const slot800 = '08:00';
    const is800Available = availableSlots.includes(slot800);
    
    console.log(`🎯 8:00 AM slot available: ${is800Available ? 'YES' : 'NO'}`);
    
    if (is800Available) {
      console.log('✅ Queue customer should be assigned to 8:00 AM');
      console.log('📅 Timeline:');
      console.log('   8:00 AM - 8:45 AM: Queue customer (45 min)');
      console.log('   8:45 AM - 9:30 AM: 45-minute gap');
      console.log('   9:30 AM - 10:15 AM: Scheduled customer (45 min)');
    } else {
      console.log('❌ 8:00 AM slot is not available');
    }
    
    return {
      blockedSlots: Array.from(blockedSlots),
      availableSlots,
      is800Available,
      nextAvailableSlot: availableSlots[0] || 'None'
    };
  };

  // Send hybrid system queue update notification to customer
  const sendHybridQueueUpdateNotification = async (queueStatus, payload) => {
    try {
      const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
      
      let notificationTitle = '';
      let notificationMessage = '';
      let notificationType = 'queue_update';
      
      // Determine notification content based on the change
      if (payload.eventType === 'INSERT') {
        notificationTitle = 'New Customer in Queue';
        notificationMessage = `A new customer joined the queue. Your position may have changed.`;
      } else if (payload.eventType === 'UPDATE') {
        const oldStatus = payload.old?.status;
        const newStatus = payload.new?.status;
        
        if (oldStatus === 'pending' && newStatus === 'ongoing') {
          notificationTitle = 'Queue Moving';
          notificationMessage = `A customer is now being served. Your estimated wait time has been updated.`;
        } else if (oldStatus === 'ongoing' && newStatus === 'done') {
          notificationTitle = 'Queue Progress';
          notificationMessage = `A customer has finished. You're one step closer to your turn!`;
        } else if (payload.new?.queue_position !== payload.old?.queue_position) {
          notificationTitle = 'Queue Position Update';
          notificationMessage = `Your queue position has changed to #${payload.new.queue_position}.`;
        }
      } else if (payload.eventType === 'DELETE') {
        notificationTitle = 'Queue Update';
        notificationMessage = `A customer left the queue. Your position may have improved.`;
      }
      
      // Only send notification if there's meaningful content
      if (notificationTitle && notificationMessage) {
        await centralizedNotificationService.createNotification({
          userId: user.id,
          title: notificationTitle,
          message: notificationMessage,
          type: notificationType,
          category: 'queue_update',
          priority: 'normal',
          channels: ['app', 'push'],
          data: {
            barber_id: bookingData.selectedBarber,
            appointment_date: bookingData.selectedDate,
            queue_position: queueStatus.queuePosition,
            estimated_wait: queueStatus.estimatedWait,
            next_available: queueStatus.nextAvailable
          }
        });
        
        console.log('✅ Hybrid queue update notification sent to customer');
      }
    } catch (error) {
      console.error('Error sending hybrid queue update notification:', error);
    }
  };

  // Load queue data when barber is selected
  useEffect(() => {
    if (bookingData.selectedBarber) {
      // Load queue data for the selected barber
      updateQueueStatus(bookingData.selectedBarber, bookingData.selectedDate || new Date().toISOString().split('T')[0]);
    }
  }, [bookingData.selectedBarber]);

  // Real-time queue status updates with debouncing
  useEffect(() => {
    if (bookingData.selectedBarber && bookingData.selectedDate) {
      // Initial update
      updateQueueStatus(bookingData.selectedBarber, bookingData.selectedDate);
      
      // Debounce timer for rapid updates
      let debounceTimer = null;
      
      // Set up real-time subscription for appointments table
      const subscription = supabase
        .channel('appointments-changes')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'appointments',
            filter: `barber_id=eq.${bookingData.selectedBarber}`
          }, 
          async (payload) => {
            console.log('🔄 Real-time appointment change detected:', payload);
            
            // Skip notifications for the current user's own appointment changes to prevent duplicates
            if (payload.new?.user_id === user?.id) {
              console.log('🔄 Skipping notification for current user\'s own appointment change');
              return;
            }
            
            // Debounce rapid updates - only refresh after 500ms of no changes
            if (debounceTimer) {
              clearTimeout(debounceTimer);
            }
            
            debounceTimer = setTimeout(async () => {
              console.log('⚡ Debounced refresh triggered');
              const newStatus = await updateQueueStatus(bookingData.selectedBarber, bookingData.selectedDate);
              
              // Send hybrid system queue update notification to customer
              // Only for other users' appointment changes
              if (newStatus && user) {
                await sendHybridQueueUpdateNotification(newStatus, payload);
              }
            }, 500); // 500ms debounce
          }
        )
        .subscribe();
      
      // Fallback: Set up auto-refresh every 2 seconds as backup
      const interval = setInterval(() => {
        updateQueueStatus(bookingData.selectedBarber, bookingData.selectedDate);
      }, 2000); // Backup refresh every 2 seconds
      
      return () => {
        clearInterval(interval);
        if (debounceTimer) clearTimeout(debounceTimer);
        subscription.unsubscribe();
      };
    }
  }, [bookingData.selectedBarber, bookingData.selectedDate]);

  const loadBarberRecommendations = async () => {
    try {
      console.log('🔄 Loading hybrid barber recommendations with real slots...', { 
        userId: user?.id, 
        date: bookingData.selectedDate,
        services: bookingData.selectedServices 
      });
      
      if (!bookingData.selectedDate || bookingData.selectedServices.length === 0) {
        console.log('⚠️ Missing date or services for recommendations');
        return;
      }
      
      const serviceDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
      const recommendations = [];
      
      // Import UnifiedSlotBookingService for hybrid scheduling
      const { default: UnifiedSlotBookingService } = await import('../../services/UnifiedSlotBookingService');
      
      for (const barber of barbers) {
        try {
          // Get unified slots (scheduled + queue) for this barber
          const unifiedSlots = await UnifiedSlotBookingService.getUnifiedSlots(
            barber.id, 
            bookingData.selectedDate, 
          serviceDuration
        );
        
          // Filter for available slots and queue slots
          const availableSlots = unifiedSlots.filter(slot => 
            slot.type === 'available' && slot.canBook
          );
          const queueSlots = unifiedSlots.filter(slot => 
            slot.type === 'queue'
          );
          
          // Calculate hybrid availability score
          const hybridScore = calculateHybridBarberScore(barber, availableSlots, queueSlots, serviceDuration);
          
          // Get next available time (scheduled or queue)
          const nextAvailableTime = availableSlots.length > 0 
            ? availableSlots[0].time 
            : queueSlots.length > 0 
              ? `Queue position ${queueSlots.length + 1}` 
              : null;
          
          // Calculate estimated wait time for queue
          const estimatedWaitTime = queueSlots.length > 0 
            ? queueSlots.length * serviceDuration 
            : 0;
          
          recommendations.push({
            barber: barber,
            score: hybridScore,
            reasons: generateHybridRecommendationReasons(barber, availableSlots, queueSlots, hybridScore),
            queueCount: queueSlots.length,
            isRecommended: true,
            priority: hybridScore > 80 ? 'high' : hybridScore > 60 ? 'medium' : 'low',
            availableSlots: availableSlots.length,
            nextAvailableTime: nextAvailableTime,
            canAccommodateService: availableSlots.length > 0 || queueSlots.length < 10, // Allow queue if not full
            estimatedWaitTime: estimatedWaitTime,
            hybridInfo: {
              scheduledSlots: availableSlots.length,
              queueLength: queueSlots.length,
              nextScheduledSlot: availableSlots[0]?.time || null,
              queuePosition: queueSlots.length + 1,
              totalCapacity: availableSlots.length + (10 - queueSlots.length) // Max 10 queue
            }
          });
          
        } catch (error) {
          console.error(`Error getting slots for barber ${barber.full_name}:`, error);
          // Still include barber but with limited info
          recommendations.push({
            barber: barber,
            score: 50,
            reasons: ['Available for queue'],
            queueCount: 0,
            isRecommended: true,
            priority: 'low',
            availableSlots: 0,
            nextAvailableTime: 'Queue available',
            canAccommodateService: true,
            estimatedWaitTime: 30,
            hybridInfo: {
              scheduledSlots: 0,
              queueLength: 0,
              nextScheduledSlot: null,
              queuePosition: 1,
              totalCapacity: 10
            }
          });
        }
      }
      
      // Sort by hybrid score (scheduled slots + queue availability)
      recommendations.sort((a, b) => {
        // Primary sort by hybrid score
        if (a.score !== b.score) {
          return b.score - a.score;
        }
        // Secondary sort by total capacity
        return b.hybridInfo.totalCapacity - a.hybridInfo.totalCapacity;
      });
      
      console.log('✅ Hybrid barber recommendations loaded:', recommendations);
      setBarberRecommendations(recommendations);
      setShowRecommendations(true);
      
    } catch (error) {
      console.error('❌ Error loading hybrid barber recommendations:', error);
      setBarberRecommendations([]);
      setShowRecommendations(false);
    }
  };

  // Helper function to calculate available slots considering service duration
  const calculateAvailableSlotsWithDuration = (appointments, serviceDuration) => {
    const workingHours = { start: 8, end: 16, breakStart: 12, breakEnd: 13 };
    const availableSlots = [];
    
    // Helper functions for time conversion
    const timeToMinutes = (timeStr) => {
      if (!timeStr) return 0;
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    const minutesToTime = (minutes) => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    };
    
    // Create a timeline of occupied slots
    const occupiedSlots = new Map();
    
    appointments.forEach(apt => {
      if (apt.appointment_time) {
        const startTime = apt.appointment_time;
        const duration = apt.total_duration || 30;
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = startMinutes + duration;
        
        // Mark all minutes as occupied
        for (let minutes = startMinutes; minutes < endMinutes; minutes += 15) {
          const timeSlot = minutesToTime(minutes);
          occupiedSlots.set(timeSlot, true);
        }
      }
    });
    
    // Find available slots that can accommodate the service duration
    for (let hour = workingHours.start; hour < workingHours.end; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        // Skip lunch break
        if (hour >= workingHours.breakStart && hour < workingHours.breakEnd) continue;
        
        const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const startMinutes = timeToMinutes(timeSlot);
        const endMinutes = startMinutes + serviceDuration;
        
        // Check if this slot can accommodate the service
        let canAccommodate = true;
        for (let minutes = startMinutes; minutes < endMinutes; minutes += 15) {
          const checkTime = minutesToTime(minutes);
          if (occupiedSlots.has(checkTime)) {
            canAccommodate = false;
            break;
          }
        }
        
        if (canAccommodate) {
          availableSlots.push({
            time: timeSlot,
            display: convertTo12Hour(timeSlot),
            duration: serviceDuration,
            endTime: minutesToTime(endMinutes)
          });
        }
      }
    }
    
    return availableSlots;
  };




  const calculateHybridBarberScore = (barber, availableSlots, queueSlots, serviceDuration) => {
    let score = 0;
    
    // Base score from barber rating (0-5 scale, weighted 25%)
    score += (barber.average_rating || 0) * 5; // 0-25 points
    
    // Scheduled slots availability (up to 35 points)
    if (availableSlots.length > 0) {
      score += Math.min(availableSlots.length * 3, 35);
    }
    
    // Queue availability (up to 25 points)
    if (queueSlots.length < 10) { // Max queue size
      score += Math.max(0, 25 - (queueSlots.length * 2.5));
    }
    
    // Service compatibility score (15 points)
    if (barber.specialties && Array.isArray(barber.specialties) && bookingData.selectedServices.length > 0) {
      const serviceMatch = bookingData.selectedServices.some(serviceId => 
        barber.specialties.includes(serviceId)
      );
      if (serviceMatch) score += 15;
    }
    
    return Math.min(100, Math.round(score));
  };

  const calculateBarberScore = (barber, availableSlots, serviceDuration) => {
    let score = 0;
    
    // Base score from barber rating (0-5 scale, weighted 30%)
    score += (barber.average_rating || 0) * 0.3;
    
    // Availability score (up to 50% bonus)
    if (availableSlots.length > 0) {
      score += Math.min(availableSlots.length * 0.1, 0.5);
    }
    
    // Service compatibility score (20% bonus)
    if (barber.specialties && Array.isArray(barber.specialties) && bookingData.selectedServices.length > 0) {
      const serviceMatch = bookingData.selectedServices.some(serviceId => 
        barber.specialties.includes(serviceId)
      );
      if (serviceMatch) score += 0.2;
    }
    
    // Convert normalized score (0-2 range) to percentage (0-100)
    return Math.min(100, Math.round(score * 50));
  };

  const generateHybridRecommendationReasons = (barber, availableSlots, queueSlots, score) => {
    const reasons = [];
    
    if (barber.average_rating > 4.5) {
      reasons.push('Highly rated barber');
    }
    
    if (availableSlots.length > 0) {
      reasons.push(`${availableSlots.length} scheduled slots available`);
    }
    
    if (queueSlots.length < 5) {
      reasons.push(`Queue position ${queueSlots.length + 1} available`);
    } else if (queueSlots.length < 10) {
      reasons.push('Queue available (moderate wait)');
    }
    
    if (score > 80) {
      reasons.push('Perfect match for your needs');
    } else if (score > 60) {
      reasons.push('Good availability');
    }
    
    return reasons;
  };


  const calculateEstimatedWaitTimeForBarber = (barberId, date, serviceDuration) => {
    // This would be enhanced with actual queue data
    return Math.floor(Math.random() * 60) + 15; // Mock wait time
  };

  // CRITICAL: Validate barber capacity and working hours boundaries
  const validateBarberCapacityAndBoundaries = async (barberId, appointmentDate, appointmentType, selectedTimeSlot) => {
    console.log('🔍 Validating barber capacity and boundaries...', {
      barberId,
      appointmentDate,
      appointmentType,
      selectedTimeSlot
    });

    try {
      // Get all existing appointments for this barber on this date
      const { data: existingAppointments, error } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_time,
          total_duration,
          status,
          appointment_type,
          queue_position
        `)
        .eq('barber_id', barberId)
        .eq('appointment_date', appointmentDate)
        .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending'])
        .order('appointment_time', { ascending: true });

      if (error) throw error;

      // Define working hours (8:00 AM to 5:00 PM)
      const workingHours = {
        start: '08:00:00',
        end: '17:00:00'
      };

      // Convert time to minutes for easier calculation
      const timeToMinutes = (timeStr) => {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };

      const minutesToTime = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
      };

      const workingStartMinutes = timeToMinutes(workingHours.start);
      const workingEndMinutes = timeToMinutes(workingHours.end);
      const totalWorkingMinutes = workingEndMinutes - workingStartMinutes; // 9 hours = 540 minutes

      // Calculate total time used by existing appointments
      let totalTimeUsed = 0;
      const scheduledAppointments = existingAppointments?.filter(apt => apt.appointment_type === 'scheduled') || [];
      const queueAppointments = existingAppointments?.filter(apt => apt.appointment_type === 'queue') || [];

      // Add time for scheduled appointments
      for (const apt of scheduledAppointments) {
        if (apt.appointment_time) {
          const aptStartMinutes = timeToMinutes(apt.appointment_time);
          const aptDuration = apt.total_duration || 30;
          
          // Check if appointment is within working hours
          if (aptStartMinutes < workingStartMinutes || (aptStartMinutes + aptDuration) > workingEndMinutes) {
            throw new Error(`Existing scheduled appointment at ${apt.appointment_time} is outside working hours (8:00 AM - 5:00 PM). Please contact support.`);
          }
          
          totalTimeUsed += aptDuration;
        }
      }

      // Calculate queue capacity based on remaining time and customer's service duration
      const remainingTime = totalWorkingMinutes - totalTimeUsed;
      const customerServiceDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
      
      // Calculate how many appointments can fit in remaining time based on customer's service duration
      const maxQueueCapacity = Math.floor(remainingTime / customerServiceDuration);
      
      // Don't enforce minimum capacity - respect actual time constraints
      const finalQueueCapacity = Math.max(0, maxQueueCapacity);

      console.log('📊 Capacity Analysis:', {
        totalWorkingMinutes,
        totalTimeUsed,
        remainingTime,
        customerServiceDuration,
        maxQueueCapacity,
        finalQueueCapacity,
        currentQueueLength: queueAppointments.length,
        scheduledAppointments: scheduledAppointments.length
      });

      // For queue appointments, check if there's capacity
      if (appointmentType === 'queue') {
        if (queueAppointments.length >= finalQueueCapacity) {
          throw new Error(`Barber is at full capacity for queue appointments. Maximum queue capacity: ${finalQueueCapacity} appointments. Current queue: ${queueAppointments.length}. Please try a different barber or date.`);
        }

        // Check if adding this appointment would exceed working hours
        // Queue appointments start from the beginning of working hours (8:00 AM)
        // Calculate actual wait time based on existing queue appointments' service durations
        const actualQueueWait = queueAppointments.reduce((total, apt) => {
          return total + (apt.total_duration || 30);
        }, 0);
        const estimatedEndTime = workingStartMinutes + actualQueueWait + customerServiceDuration;

        if (estimatedEndTime > workingEndMinutes) {
          const estimatedEndTimeFormatted = minutesToTime(estimatedEndTime);
          throw new Error(`Adding this queue appointment would exceed working hours (5:00 PM). Estimated completion time: ${convertTo12Hour(estimatedEndTimeFormatted)}. Please try a different barber or date.`);
        }
      }

      // For scheduled appointments, check if time slot is within working hours
      if (appointmentType === 'scheduled' && selectedTimeSlot) {
        const slotStartMinutes = timeToMinutes(selectedTimeSlot);
        const slotEndMinutes = slotStartMinutes + customerServiceDuration;

        if (slotStartMinutes < workingStartMinutes) {
          throw new Error(`Selected time slot ${convertTo12Hour(selectedTimeSlot)} is before working hours (8:00 AM). Please select a time between 8:00 AM and 5:00 PM.`);
        }

        if (slotEndMinutes > workingEndMinutes) {
          const slotEndTimeFormatted = minutesToTime(slotEndMinutes);
          throw new Error(`Selected time slot ${convertTo12Hour(selectedTimeSlot)} with service duration (${customerServiceDuration} minutes) would exceed working hours (5:00 PM). Estimated end time: ${convertTo12Hour(slotEndTimeFormatted)}. Please select an earlier time or reduce service duration.`);
        }

        // Check for overlaps with existing scheduled appointments
        for (const apt of scheduledAppointments) {
          if (apt.appointment_time) {
            const aptStartMinutes = timeToMinutes(apt.appointment_time);
            const aptEndMinutes = aptStartMinutes + (apt.total_duration || 30);

            // Check for overlap
            if (
              (slotStartMinutes >= aptStartMinutes && slotStartMinutes < aptEndMinutes) ||
              (slotEndMinutes > aptStartMinutes && slotEndMinutes <= aptEndMinutes) ||
              (slotStartMinutes <= aptStartMinutes && slotEndMinutes >= aptEndMinutes)
                 ) {
                   throw new Error(`Selected time slot ${convertTo12Hour(selectedTimeSlot)} overlaps with existing appointment at ${convertTo12Hour(apt.appointment_time)}. Please select a different time.`);
                 }
          }
        }
      }

      console.log('✅ Capacity and boundary validation passed');
      return true;

    } catch (error) {
      console.error('❌ Capacity validation failed:', error);
      // Provide more user-friendly error messages
      if (error.message.includes('exceed working hours')) {
        throw new Error(`⏰ ${error.message}`);
      } else if (error.message.includes('overlaps with existing')) {
        throw new Error(`🔄 ${error.message}`);
      } else if (error.message.includes('before working hours')) {
        throw new Error(`🌅 ${error.message}`);
      } else if (error.message.includes('at full capacity')) {
        throw new Error(`🚫 ${error.message}`);
      } else {
        throw error;
      }
    }
  };

  // Handle booking submission with Advanced Hybrid Queue System
  const handleBookingSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      console.log('🚀 Starting Advanced Hybrid Queue booking process...', {
        isRebooking,
        bookingData,
        user: user?.id
      });

      // Validation checks
      if (!user) {
        throw new Error('User not logged in');
      }

      if (!bookingData.selectedBarber) {
        throw new Error('No barber selected');
      }

      if (!bookingData.selectedDate) {
        throw new Error('No date selected');
      }

      // Validate that the selected date is not in the past
      const selectedDateObj = new Date(bookingData.selectedDate);
      const today = new Date();
      selectedDateObj.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      if (selectedDateObj < today) {
        throw new Error('Cannot book appointments for past dates. Please select today or a future date.');
      }

      // Check if booking today after 4:30 PM cutoff
      if (selectedDateObj.toDateString() === today.toDateString()) {
        const currentTime = new Date();
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const cutoffTime = 16 * 60 + 30; // 4:30 PM in minutes
        
        if (currentTimeInMinutes >= cutoffTime) {
          throw new Error('Cannot book appointments for today after 4:30 PM. Please select tomorrow or a future date.');
        }
      }

      if (bookingData.appointmentType === 'scheduled' && !bookingData.selectedTimeSlot) {
        throw new Error('No time slot selected for scheduled appointment');
      }

      if (bookingData.selectedServices.length === 0) {
        throw new Error('No services selected');
      }

      // Check for lunch break conflict for scheduled appointments
      if (bookingData.appointmentType === 'scheduled' && bookingData.selectedTimeSlot) {
        const totalDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
        if (wouldCrossLunchBreak(bookingData.selectedTimeSlot, totalDuration)) {
          throw new Error('Selected time slot would cross the lunch break period (12:00 PM - 1:00 PM). Please choose a different time or reduce service duration.');
        }
      }

      console.log('✅ Validation passed, proceeding with Advanced Hybrid Queue booking...');

      // Determine appointment type based on time slot selection
      const appointmentType = bookingData.selectedTimeSlot ? 'scheduled' : 'queue';
      
      // Validate appointment type consistency
      if (appointmentType === 'scheduled' && !bookingData.selectedTimeSlot) {
        throw new Error('Scheduled appointments must have a time slot');
      }
      
      if (appointmentType === 'queue' && bookingData.selectedTimeSlot) {
        throw new Error('Queue appointments should not have a time slot');
      }

      // Check for time slot conflicts for scheduled appointments
      if (appointmentType === 'scheduled') {
        const { data: existingAppointments } = await supabase
          .from('appointments')
          .select('id')
          .eq('barber_id', bookingData.selectedBarber)
          .eq('appointment_date', bookingData.selectedDate)
          .eq('appointment_time', bookingData.selectedTimeSlot)
          .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending']);
          
        if (existingAppointments && existingAppointments.length > 0) {
          throw new Error('Time slot is already booked. Please select a different time.');
        }
      }

      // CRITICAL: Check barber capacity and working hours boundaries
      await validateBarberCapacityAndBoundaries(bookingData.selectedBarber, bookingData.selectedDate, appointmentType, bookingData.selectedTimeSlot);

      // CRITICAL: Check if barber is fully scheduled (no available time slots)
      if (appointmentType === 'scheduled') {
        await validateBarberScheduledAvailability(bookingData.selectedBarber, bookingData.selectedDate, bookingData.selectedTimeSlot);
      } else if (appointmentType === 'queue') {
        // For queue appointments, also check if barber has any availability at all
        await validateBarberQueueAvailability(bookingData.selectedBarber, bookingData.selectedDate);
      }

      console.log('🎯 Final appointment type:', appointmentType, 'Time slot:', bookingData.selectedTimeSlot);

      // Prepare appointment data using standardized field names
      const appointmentData = {
        [APPOINTMENT_FIELDS.CUSTOMER_ID]: user.id,
        [APPOINTMENT_FIELDS.BARBER_ID]: bookingData.selectedBarber,
        [APPOINTMENT_FIELDS.SERVICE_ID]: bookingData.selectedServices[0],
        [APPOINTMENT_FIELDS.SERVICES_DATA]: bookingData.selectedServices,
        [APPOINTMENT_FIELDS.ADD_ONS_DATA]: bookingData.selectedAddOns.map(addonId => {
          const addon = addOns.find(a => a.id === addonId);
          // Map UUID to legacy format (addon1, addon2, etc.)
          const legacyMapping = {
            'addon1': 'addon1',
            'addon2': 'addon2', 
            'addon3': 'addon3',
            'addon4': 'addon4',
            'addon5': 'addon5',
            'addon6': 'addon6',
            'addon7': 'addon7',
            'addon8': 'addon8',
            'addon9': 'addon9',
            'addon10': 'addon10'
          };
          
          // If it's already a legacy ID, return as is
          if (legacyMapping[addonId]) {
            return addonId;
          }
          
          // If it's a UUID, map to legacy format based on addon name
          if (addon) {
            const nameToLegacy = {
              'Beard Trim': 'addon1',
              'Hot Towel Treatment': 'addon2',
              'Scalp Massage': 'addon3',
              'Hair Wash': 'addon4',
              'Styling': 'addon5',
              'Hair Wax Application': 'addon6',
              'Eyebrow Trim': 'addon7',
              'Mustache Trim': 'addon8',
              'Face Mask': 'addon9',
              'Hair Treatment': 'addon10'
            };
            return nameToLegacy[addon.name] || addonId;
          }
          
          return addonId;
        }).filter(Boolean),
        [APPOINTMENT_FIELDS.APPOINTMENT_DATE]: bookingData.selectedDate,
        [APPOINTMENT_FIELDS.APPOINTMENT_TIME]: appointmentType === 'scheduled' ? bookingData.selectedTimeSlot : null,
        [APPOINTMENT_FIELDS.APPOINTMENT_TYPE]: appointmentType,
        [APPOINTMENT_FIELDS.PRIORITY_LEVEL]: bookingData.isUrgent ? PRIORITY_LEVELS.URGENT : PRIORITY_LEVELS.NORMAL,
        [APPOINTMENT_FIELDS.STATUS]: BOOKING_STATUS.PENDING, // ALL appointments start as pending and require manager/barber confirmation
        [APPOINTMENT_FIELDS.TOTAL_PRICE]: bookingData.totalPrice,
        [APPOINTMENT_FIELDS.TOTAL_DURATION]: calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns),
        [APPOINTMENT_FIELDS.NOTES]: bookingData.specialRequests,
        [APPOINTMENT_FIELDS.IS_URGENT]: bookingData.isUrgent || false,
        [APPOINTMENT_FIELDS.BOOK_FOR_FRIEND]: bookingData.bookForFriend,
        [APPOINTMENT_FIELDS.FRIEND_NAME]: bookingData.friendName,
        [APPOINTMENT_FIELDS.FRIEND_PHONE]: bookingData.friendPhone,
        // Friend booking fields
        is_double_booking: bookingData.bookForFriend || false,
        primary_customer_id: bookingData.bookForFriend ? user.id : null,
        double_booking_data: bookingData.bookForFriend ? {
          book_for_friend: true,
          friend_name: bookingData.friendName,
          friend_phone: bookingData.friendPhone,
          friend_email: bookingData.friendEmail,
          booked_by: user.user_metadata?.full_name || user.email
        } : null
      };

      console.log('📤 Booking with Advanced Hybrid System:', appointmentData);

      // Use Advanced Hybrid Queue Service for intelligent appointment insertion
      const result = await AdvancedHybridQueueService.smartInsertAppointment(appointmentData);

      if (result.success) {
        // Show success message with position and estimated time (skip for friend bookings)
        if (!bookingData.bookForFriend) {
        const successMessage = `✅ Appointment request submitted successfully!\n` +
          `Your Position: #${result.position}\n` +
          `Estimated time: ${result.estimated_time || 'TBD'}\n` +
          `⏳ Status: Pending confirmation by barber/manager`;
        
        setSuccess(successMessage);
        }

        // Email confirmation removed - using push notifications only

        // Create database notification using centralized service
        try {
          const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
          await centralizedNotificationService.createBookingConfirmationNotification({
            userId: user.id,
            appointmentId: result.appointment_id,
            queuePosition: result.position,
            estimatedTime: result.estimated_time,
            appointmentType: bookingData.appointmentType,
            appointmentTime: bookingData.selectedTimeSlot
          });
          console.log('✅ Database notification created for booking confirmation');
        } catch (dbError) {
          console.error('Error creating database notification:', dbError);
        }

        // Push notification is now handled by CentralizedNotificationService

        // Navigate after 2 seconds
        setTimeout(() => {
          navigate('/appointments');
        }, 2000);

        console.log('✅ Advanced Hybrid Queue booking completed successfully');
        
        // Clear haircut recommendation data from localStorage after successful booking
        localStorage.removeItem('specialRequest');
        localStorage.removeItem('selectedHaircutStyle');
      } else {
        // Show error and suggest alternatives if available
        setError(result.error);
        
        if (result.suggested_times && result.suggested_times.length > 0) {
          setAlternativeTimes(result.suggested_times);
          openAlternativeTimesModal();
        }
      }

    } catch (error) {
      console.error('❌ Advanced Hybrid Queue booking error:', error);
      
      // Provide more user-friendly error messages
      let errorMessage = `Failed to book appointment: ${error.message}`;
      
      if (error.message.includes('exceed working hours')) {
        errorMessage = `⏰ ${error.message}`;
      } else if (error.message.includes('overlaps with existing')) {
        errorMessage = `🔄 ${error.message}`;
      } else if (error.message.includes('before working hours')) {
        errorMessage = `🌅 ${error.message}`;
      } else if (error.message.includes('at full capacity')) {
        errorMessage = `🚫 ${error.message}`;
      } else if (error.message.includes('fully scheduled')) {
        errorMessage = `📅 ${error.message}`;
      } else if (error.message.includes('No services selected')) {
        errorMessage = `✂️ Please select at least one service before booking.`;
      } else if (error.message.includes('No barber selected')) {
        errorMessage = `👨‍💼 Please select a barber before booking.`;
      } else if (error.message.includes('No date selected')) {
        errorMessage = `📅 Please select a date before booking.`;
      } else if (error.message.includes('past dates')) {
        errorMessage = `📅 ${error.message}`;
      } else if (error.message.includes('4:30 PM cutoff')) {
        errorMessage = `⏰ ${error.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="container py-4">
        <div className="text-center">
          <h3>Please log in to book an appointment</h3>
          <button className="btn btn-primary" onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="container-fluid px-2 px-md-4 py-3 py-md-5">
      <div className="container-fluid">
      {/* Enhanced Gray Header - Mobile Responsive */}
      <div className="row mb-4 mb-lg-5">
        <div className="col">
          <div className="card border-0 shadow-lg" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' }}>
            <div className="card-body py-4 py-lg-5">
              {/* Mobile Layout */}
              <div className="d-block d-md-none">
                <div className="text-center mb-3">
                  <div className="bg-white rounded-circle p-2 d-inline-block shadow-sm mb-2">
                    <img 
                      src={logoImage} 
                      alt="Raf & Rok" 
                      height="35"
                      className="rounded-circle"
                    />
                  </div>
                  <h5 className="mb-1 text-dark fw-bold">
                    {isRebooking ? 'Reschedule Appointment' : 'Book Appointment'}
                  </h5>
                  <small className="text-secondary fw-medium">
                    Step {currentStep} of 3: {getStepTitle(currentStep)}
                  </small>
                </div>
                <div className="d-flex justify-content-center">
                  <div className="bg-white rounded-pill px-3 py-2 shadow-sm" style={{ width: '100%', maxWidth: '250px' }}>
                    <div className="progress" style={{ height: '8px' }}>
                      <div 
                        className="progress-bar bg-gradient-primary" 
                        style={{ 
                          width: `${(currentStep / 3) * 100}%`,
                          background: 'linear-gradient(90deg, #6c757d 0%, #495057 100%)'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Desktop Layout */}
              <div className="d-none d-md-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center">
                  <div className="bg-white rounded-circle p-3 me-4 shadow-sm">
                    <img 
                      src={logoImage} 
                      alt="Raf & Rok" 
                      height="50"
                      className="rounded-circle"
                    />
                  </div>
                  <div>
                    <h3 className="mb-2 text-dark fw-bold">
                      {isRebooking ? 'Reschedule Appointment' : 'Book Appointment'}
                    </h3>
                    <p className="text-secondary fw-medium mb-0 fs-5">
                      Step {currentStep} of 3: {getStepTitle(currentStep)}
                    </p>
                  </div>
                </div>
                
                <div className="d-flex align-items-center gap-4">
                  <div className="bg-white rounded-pill px-4 py-3 shadow-sm">
                    <div className="progress" style={{ width: '250px', height: '12px' }}>
                      <div 
                        className="progress-bar bg-gradient-primary" 
                        style={{ 
                          width: `${(currentStep / 3) * 100}%`,
                          background: 'linear-gradient(90deg, #6c757d 0%, #495057 100%)'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row justify-content-center">
        <div className="col-12 col-xl-12">
          <div className={`card border-0 shadow-lg ${animateForm ? 'form-animated' : ''}`}>
            {/* Alerts */}
            {error && (
              <div className="alert alert-danger alert-dismissible m-3 mb-0 fade show" role="alert">
                <div className="d-flex align-items-center">
                  <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
                  <div>{error}</div>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setError('')}
                ></button>
              </div>
            )}

            {success && (
              <div className="alert alert-success alert-dismissible m-3 mb-0 fade show" role="alert">
                <div className="d-flex align-items-center">
                  <i className="bi bi-check-circle-fill me-2 fs-4"></i>
                  <div>{success}</div>
                </div>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setSuccess('')}
                ></button>
              </div>
            )}


            {/* Step Content */}
            <>
              {currentStep === 1 && <Step1DateTypeAndBarber 
                bookingData={bookingData} 
                updateBookingData={updateBookingData}
                onNext={nextStep}
                existingAppointment={existingAppointment}
                checkExistingAppointment={checkExistingAppointment}
                user={user}
                setError={setError}
                barbers={barbers}
                services={services}
                addOns={addOns}
                barberQueues={barberQueues}
                barberRecommendations={barberRecommendations}
                setBarberRecommendations={setBarberRecommendations}
                showRecommendations={showRecommendations}
                setShowRecommendations={setShowRecommendations}
                getBookedTimeSlots={getBookedTimeSlots}
                bookedTimeSlots={bookedTimeSlots}
                timeSlots={timeSlots}
                manageQueueAndScheduledSlots={manageQueueAndScheduledSlots}
                fetchBarberQueues={fetchBarberQueues}
                queueStatus={queueStatus}
                updateQueueStatus={updateQueueStatus}
                calculateTotalDuration={calculateTotalDuration}
                wouldCrossLunchBreak={wouldCrossLunchBreak}
                wouldSlotConflictWithExistingAppointments={wouldSlotConflictWithExistingAppointments}
                // Enhanced time slot system props
                getAppointmentAtTime={getAppointmentAtTime}
                findAlternativeTimes={findAlternativeTimes}
                setAlternativeTimes={setAlternativeTimes}
                setShowAlternativeTimesModal={setShowAlternativeTimesModal}
                // Unified slot system props
                unifiedSlots={unifiedSlots}
                alternativeBarbers={alternativeBarbers}
                showAlternatives={showAlternatives}
                isBarberFullyScheduled={isBarberFullyScheduled}
                setIsBarberFullyScheduled={setIsBarberFullyScheduled}
                loadUnifiedSlots={loadUnifiedSlots}
                loadAlternativeBarbers={loadAlternativeBarbers}
                handleUnifiedSlotSelect={handleUnifiedSlotSelect}
                handleAlternativeBarberSelect={handleAlternativeBarberSelect}
                // Real-time status calculation functions
                calculateCurrentQueueStatus={calculateCurrentQueueStatus}
                calculateRealTimeAvailability={calculateRealTimeAvailability}
                canBarberAccommodateService={canBarberAccommodateService}
              />}
              
              {currentStep === 2 && <Step2ServicesAndAddons 
                bookingData={bookingData} 
                updateBookingData={updateBookingData}
                onNext={nextStep}
                onPrev={prevStep}
                services={services}
                addOns={addOns}
              />}
              
            </>
            </div>
          </div>
        </div>
      </div>
      
      {currentStep === 3 && <Step3QueueSummary 
        bookingData={bookingData} 
        updateBookingData={updateBookingData}
        onPrev={prevStep}
        onEdit={goToStep}
        barbers={barbers}
        services={services}
        addOns={addOns}
        barberQueues={barberQueues}
        user={user}
        isRebooking={isRebooking}
        rebookingAppointment={rebookingAppointment}
        onSubmit={handleBookingSubmit}
        loading={loading}
        timeSlots={timeSlots}
        getQueuePosition={getQueuePosition}
        getNextSlotRange={getNextSlotRange}
        calculateTotalDuration={calculateTotalDuration}
        getEstimatedStartTime={getEstimatedStartTime}
        getEstimatedEndTime={getEstimatedEndTime}
        wouldCrossLunchBreak={wouldCrossLunchBreak}
        isRefreshing={isRefreshing}
        setIsRefreshing={setIsRefreshing}
        updateQueueStatus={updateQueueStatus}
        queueStatus={queueStatus}
        // Real-time status calculation functions
        calculateCurrentQueueStatus={calculateCurrentQueueStatus}
        calculateRealTimeAvailability={calculateRealTimeAvailability}
        canBarberAccommodateService={canBarberAccommodateService}
        unifiedSlots={unifiedSlots}
        alternativeBarbers={alternativeBarbers}
      />}

      {/* Alternative Times Modal */}
      {showAlternativeTimesModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-clock me-2"></i>
                  Alternative Time Options
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowAlternativeTimesModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info">
                  <i className="bi bi-info-circle me-2"></i>
                  The selected time slot is not available. Here are some alternative options:
                </div>
                
                <div className="row g-3">
                  {alternativeTimes.map((option, index) => (
                    <div key={index} className="col-12">
                      <div className="card">
                        <div className="card-body">
                          {option.type === 'queue_position' ? (
                            <div>
                              <h6 className="card-title">
                                <i className="bi bi-people me-2"></i>
                                Join Queue (Position #{option.position})
                              </h6>
                              <p className="card-text">
                                <strong>Estimated Wait:</strong> {Math.floor(option.estimated_wait / 60)} hours {option.estimated_wait % 60} minutes
                              </p>
                              <p className="text-muted small">
                                You'll be served after all scheduled appointments and current queue customers.
                              </p>
                            </div>
                          ) : (
                            <div>
                              <h6 className="card-title">
                                <i className="bi bi-calendar-check me-2"></i>
                                {option.time} - {option.end_time}
                              </h6>
                              <p className="card-text">
                                {option.type === 'gap_before_scheduled' && (
                                  <span className="text-info">
                                    <i className="bi bi-info-circle me-1"></i>
                                    Available slot before {option.before_appointment}
                                  </span>
                                )}
                                {option.type === 'after_scheduled' && (
                                  <span className="text-success">
                                    <i className="bi bi-check-circle me-1"></i>
                                    Available after all scheduled appointments
                                  </span>
                                )}
                              </p>
                            </div>
                          )}
                          
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              if (option.type === 'queue_position') {
                                // Join queue
                                setBookingData(prev => ({
                                  ...prev,
                                  appointmentType: 'queue'
                                }));
                                setShowAlternativeTimesModal(false);
                                handleBookingSubmit();
                              } else {
                                // Use specific time
                                setBookingData(prev => ({
                                  ...prev,
                                  appointmentType: 'scheduled',
                                  selectedTimeSlot: option.time
                                }));
                                setShowAlternativeTimesModal(false);
                                handleBookingSubmit();
                              }
                            }}
                          >
                            {option.type === 'queue_position' ? 'Join Queue' : 'Select This Time'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAlternativeTimesModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Step 1: Date, Type and Barber Selection (Merged)
const Step1DateTypeAndBarber = ({ 
  bookingData, 
  updateBookingData, 
  onNext, 
  existingAppointment,
  checkExistingAppointment, 
  user,
  setError,
  barbers,
  services,
  addOns,
  barberQueues,
  barberRecommendations,
  setBarberRecommendations,
  showRecommendations,
  setShowRecommendations,
  getBookedTimeSlots,
  bookedTimeSlots,
  timeSlots,
  manageQueueAndScheduledSlots,
  fetchBarberQueues,
  queueStatus,
  updateQueueStatus,
  calculateTotalDuration,
  wouldCrossLunchBreak,
  wouldSlotConflictWithExistingAppointments,
  // Enhanced time slot system props
  getAppointmentAtTime,
  findAlternativeTimes,
  setAlternativeTimes,
  setShowAlternativeTimesModal,
  // Unified slot system props
  unifiedSlots,
  alternativeBarbers,
  showAlternatives,
  isBarberFullyScheduled,
  setIsBarberFullyScheduled,
  loadUnifiedSlots,
  loadAlternativeBarbers,
  handleUnifiedSlotSelect,
  handleAlternativeBarberSelect,
  // Real-time status calculation functions
  calculateCurrentQueueStatus,
  calculateRealTimeAvailability,
  canBarberAccommodateService
}) => {
  const [selectedDate, setSelectedDate] = useState(bookingData.selectedDate || '');
  const [appointmentType, setAppointmentType] = useState(bookingData.appointmentType || 'queue');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(bookingData.selectedTimeSlot || '');
  const [selectedBarber, setSelectedBarber] = useState(bookingData.selectedBarber || '');
  const [bookForFriend, setBookForFriend] = useState(bookingData.bookForFriend || false);
  const [friendName, setFriendName] = useState(bookingData.friendName || '');
  const [friendPhone, setFriendPhone] = useState(bookingData.friendPhone || '');
  const [friendEmail, setFriendEmail] = useState(bookingData.friendEmail || '');
  const [checkingAppointment, setCheckingAppointment] = useState(false);
  const [showQueueDetails, setShowQueueDetails] = useState({});
  const [showAvailability, setShowAvailability] = useState(true);
  const [dateValidationMessage, setDateValidationMessage] = useState('');
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState('Loading...');

  // Load estimated arrival time when barber is selected
  useEffect(() => {
    const loadEstimatedArrivalTime = async () => {
      if (selectedBarber && barberQueues && timeSlots && selectedDate) {
        try {
          // For queue appointments, show queue position and wait time
          if (appointmentType === 'queue') {
            const queueInfo = barberQueues[selectedBarber];
            if (queueInfo) {
              const queuePosition = queueInfo.queueCount + 1; // Next position
              const waitTime = queueInfo.estimatedWait || 0;
              
              if (queuePosition === 1) {
                setEstimatedArrivalTime('Next in line');
              } else {
                setEstimatedArrivalTime(`Position #${queuePosition} (${waitTime} min wait)`);
              }
            } else {
              setEstimatedArrivalTime('Position #1');
            }
          } else {
            // For scheduled appointments, use the original logic
          const result = await getEstimatedArrivalTime(selectedBarber, barberQueues, timeSlots, selectedDate);
          setEstimatedArrivalTime(result);
          }
        } catch (error) {
          console.error('Error loading estimated arrival time:', error);
          setEstimatedArrivalTime('N/A');
        }
      }
    };

    loadEstimatedArrivalTime();
  }, [selectedBarber, barberQueues, timeSlots, selectedDate, appointmentType]);

  // Real-time queue status updates
  useEffect(() => {
    if (bookingData.selectedBarber && bookingData.selectedDate && bookingData.appointmentType === 'queue') {
      const updateQueueStatus = async () => {
        try {
          await manageQueueAndScheduledSlots(bookingData.selectedBarber, bookingData.selectedDate);
        } catch (error) {
          console.error('Error updating queue status:', error);
        }
      };

      // Initial update
      updateQueueStatus();

      // Set up interval for live updates
      const interval = setInterval(updateQueueStatus, 30000); // Update every 30 seconds

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [bookingData.selectedBarber, bookingData.selectedDate, bookingData.appointmentType]);

  // Load queue data for all recommended barbers to show slot availability
  useEffect(() => {
    const loadQueueDataForRecommendations = async () => {
      if (barberRecommendations && barberRecommendations.length > 0 && selectedDate && fetchBarberQueues) {
        console.log('🔄 Loading queue data for recommended barbers...');
        try {
          const barberObjects = barberRecommendations.map(rec => rec.barber).filter(Boolean);
          await fetchBarberQueues(barberObjects, selectedDate);
        } catch (error) {
          console.error('❌ Error loading queue data for recommendations:', error);
        }
      }
    };
    loadQueueDataForRecommendations();
  }, [barberRecommendations, selectedDate, fetchBarberQueues]);

  // Auto-load queue data when barber is selected
  useEffect(() => {
    console.log('🔄 useEffect triggered:', { selectedBarber, selectedDate, barbersLength: barbers?.length });
    
    if (selectedBarber && selectedDate && barbers && barbers.length > 0) {
      console.log('🔄 Auto-loading queue data for selected barber:', selectedBarber);
      const selectedBarberObj = barbers.find(b => b.id === selectedBarber);
      console.log('🔍 Found barber object:', selectedBarberObj);
      
      if (selectedBarberObj) {
        fetchBarberQueues([selectedBarberObj], selectedDate);
                              } else {
        console.warn('⚠️ Barber not found in barbers array:', selectedBarber);
      }
    } else {
      console.log('❌ Missing requirements:', { 
        hasSelectedBarber: !!selectedBarber, 
        hasSelectedDate: !!selectedDate, 
        hasBarbers: !!(barbers && barbers.length > 0) 
      });
    }
  }, [selectedBarber, selectedDate, barbers, fetchBarberQueues]);

  // Load unified slots when barber, date, and services are selected
  useEffect(() => {
    if (selectedBarber && selectedDate && bookingData.selectedServices.length > 0) {
      const serviceDuration = calculateTotalDuration(
        bookingData.selectedServices, 
        bookingData.selectedAddOns, 
        services, 
        addOns
      );
      
      console.log('🔄 Loading unified slots for:', { selectedBarber, selectedDate, serviceDuration });
      
      // Load unified slots
      loadUnifiedSlots(selectedBarber, selectedDate, serviceDuration);
      
      // Load alternative barbers
      loadAlternativeBarbers(selectedDate, serviceDuration, selectedBarber);
    }
  }, [selectedBarber, selectedDate, bookingData.selectedServices, bookingData.selectedAddOns]);

  // Auto-load alternative barbers when barber is at full capacity or fully scheduled
  useEffect(() => {
    if (selectedBarber && selectedDate && barberQueues[selectedBarber] && bookingData.selectedServices.length > 0) {
      const queue = barberQueues[selectedBarber];
      const isFull = queue.isFullCapacity;
      
      console.log('🔍 Checking barber capacity:', { 
        barberId: selectedBarber, 
        isFull, 
        queueCount: queue.queueCount,
        scheduledCount: queue.scheduledCount 
      });
      
      const serviceDuration = calculateTotalDuration(
        bookingData.selectedServices, 
        bookingData.selectedAddOns, 
        services, 
        addOns
      );
      
      // Check if barber is at full capacity OR fully scheduled
      if (isFull) {
        console.log('🚨 Barber is at full capacity, loading alternatives...');
        loadAlternativeBarbers(selectedDate, serviceDuration, selectedBarber);
      } else {
        // Check if barber is fully scheduled (no available slots)
        checkBarberScheduledAvailability(selectedBarber, selectedDate, serviceDuration);
      }
    }
  }, [selectedBarber, selectedDate, barberQueues, bookingData.selectedServices, bookingData.selectedAddOns]);


  // Check if barber is fully scheduled and load alternatives if needed
  const checkBarberScheduledAvailability = async (barberId, date, serviceDuration) => {
    try {
      console.log('🔍 Checking if barber is fully scheduled...');
      
      // First check real-time availability to get accurate capacity information
      const realTimeAvailability = await calculateRealTimeAvailability(barberId, date, serviceDuration);
      
      // Also get unified slots for scheduled appointments
      const slots = await UnifiedSlotBookingService.getUnifiedSlots(barberId, date, serviceDuration);
      const availableSlots = slots.filter(slot => slot.canBook && slot.type === 'available');
      
      console.log('📊 Barber slot analysis:', {
        totalSlots: slots.length,
        availableSlots: availableSlots.length,
        scheduledSlots: slots.filter(slot => slot.type === 'scheduled').length,
        queueSlots: slots.filter(slot => slot.type === 'queue').length,
        realTimeAvailableSlots: realTimeAvailability.availableSlots,
        isAtCapacity: realTimeAvailability.isAtCapacity
      });
      
      // Update warning message
      const warningElement = document.getElementById('barber-schedule-warning');
      if (warningElement) {
        // Check if barber is at capacity (no available slots AND no queue capacity)
        const isFullyBooked = realTimeAvailability.isAtCapacity || (availableSlots.length === 0 && realTimeAvailability.availableSlots === 0);
        
        if (isFullyBooked) {
          warningElement.className = 'alert alert-warning border';
          warningElement.innerHTML = `
            <div className="d-flex align-items-center">
              <i className="bi bi-exclamation-triangle me-2"></i>
              <div>
                <strong>Fully Booked:</strong> This barber has no available time slots and is at full capacity. Alternative barbers are being loaded...
              </div>
            </div>
          `;
        } else if (availableSlots.length === 0) {
          warningElement.className = 'alert alert-info border';
          warningElement.innerHTML = `
            <div className="d-flex align-items-center">
              <i className="bi bi-info-circle me-2"></i>
              <div>
                <strong>Queue Only:</strong> This barber has no scheduled slots available, but you can join the queue.
              </div>
            </div>
          `;
        } else {
          warningElement.className = 'alert alert-success border';
          warningElement.innerHTML = `
            <div className="d-flex align-items-center">
              <i className="bi bi-check-circle me-2"></i>
              <div>
                <strong>Available:</strong> This barber has ${availableSlots.length} available time slots for your selected services.
              </div>
            </div>
          `;
        }
      }
      
      // If no available slots AND at capacity, barber is fully booked
      const isFullyBooked = realTimeAvailability.isAtCapacity || (availableSlots.length === 0 && realTimeAvailability.availableSlots === 0);
      if (isFullyBooked) {
        console.log('🚨 Barber is fully booked, loading alternatives...');
        setIsBarberFullyScheduled(true);
        loadAlternativeBarbers(date, serviceDuration, barberId);
      } else {
        setIsBarberFullyScheduled(false);
      }
    } catch (error) {
      console.error('❌ Error checking barber scheduled availability:', error);
    }
  };

  // Additional fallback: retry loading queue data if it's still loading after 2 seconds
  useEffect(() => {
    if (selectedBarber && selectedDate && barbers && barbers.length > 0) {
      const timer = setTimeout(() => {
        if (!barberQueues || !barberQueues[selectedBarber]) {
          console.log('🔄 Retrying queue data load after timeout...');
          const selectedBarberObj = barbers.find(b => b.id === selectedBarber);
          if (selectedBarberObj) {
            fetchBarberQueues([selectedBarberObj], selectedDate);
          }
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [selectedBarber, selectedDate, barbers, barberQueues, fetchBarberQueues]);

  const handleDateChange = async (date) => {
    // Clear any previous validation messages
    setDateValidationMessage('');
    
    // Check if the selected date is in the past
    const today = new Date();
    const selectedDateObj = new Date(date);
    const currentTime = new Date();
    
    // Check if date is disabled (past dates or today after 4:30 PM)
    if (isDateDisabled(date)) {
      const todayStr = today.toISOString().split('T')[0];
      setSelectedDate(todayStr);
      setDateValidationMessage('⚠️ Cannot book on past dates or today after 4:30 PM. Date has been reset to today.');
      return;
    }
    
    setSelectedDate(date);
    setCheckingAppointment(true);
    
    // Check for existing appointment
    const hasExisting = await checkExistingAppointment(date);
    setCheckingAppointment(false);
    
    if (hasExisting) {
      // Reset time slot if there's an existing appointment
      setSelectedTimeSlot('');
    }
  };

  // Helper function to check if date is disabled
  const isDateDisabled = (date) => {
    if (!date) return false;
    
    const selectedDateObj = new Date(date);
    const today = new Date();
    const currentTime = new Date();
    
    // Block past dates
    selectedDateObj.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    if (selectedDateObj < today) return true;
    
    // Block today if current time is after 4:30 PM
    if (selectedDateObj.toDateString() === today.toDateString()) {
      const currentHour = currentTime.getHours();
      const currentMinute = currentTime.getMinutes();
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      const cutoffTime = 16 * 60 + 30; // 4:30 PM in minutes
      
      return currentTimeInMinutes >= cutoffTime;
    }
    
    return false;
  };

  const handleNext = () => {
    // Validate selected date is not in the past
    if (selectedDate) {
      const selectedDateObj = new Date(selectedDate);
      const today = new Date();
      selectedDateObj.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      if (selectedDateObj < today) {
        setError('Cannot book appointments for past dates. Please select today or a future date.');
        return;
      }

      // Check if booking today after 4:30 PM cutoff
      if (selectedDateObj.toDateString() === today.toDateString()) {
        const currentTime = new Date();
        const currentHour = currentTime.getHours();
        const currentMinute = currentTime.getMinutes();
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const cutoffTime = 16 * 60 + 30; // 4:30 PM in minutes
        
        if (currentTimeInMinutes >= cutoffTime) {
          setError('Cannot book appointments for today after 4:30 PM. Please select tomorrow or a future date.');
          return;
        }
      }
    }

    // Check for existing appointment before proceeding
    if (existingAppointment && !bookForFriend) {
      setError('You already have an appointment on this date. Please choose a different date or book for a friend.');
      return;
    }

    // Check if barber is selected
    if (!selectedBarber) {
      setError('Please select a barber before proceeding.');
      return;
    }

    // Check if time slot is selected for scheduled appointments
    if (appointmentType === 'scheduled' && !selectedTimeSlot) {
      setError('Please select a time slot for scheduled appointments.');
      return;
    }

    // Check for lunch break conflict for scheduled appointments
    if (appointmentType === 'scheduled' && selectedTimeSlot) {
      const totalDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
      if (wouldCrossLunchBreak(selectedTimeSlot, totalDuration)) {
        setError('Selected time slot would cross the lunch break period (12:00 PM - 1:00 PM). Please choose a different time or reduce service duration.');
        return;
      }
    }

    updateBookingData({
      selectedDate,
      appointmentType,
      selectedTimeSlot,
      selectedBarber,
      bookForFriend,
      friendName,
      friendPhone,
      friendEmail
    });
    onNext();
  };

  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  // Barber selection functions
  const handleBarberSelect = async (barberId) => {
    setSelectedBarber(barberId);
    setShowRecommendations(false);
    
    console.log('🎯 Barber selected:', barberId, 'Date:', selectedDate);
    
    // Load queue data for this barber and date
    if (selectedDate) {
      console.log('📊 Loading queue data for barber:', barberId, 'date:', selectedDate);
      try {
        // Find the full barber object
        const selectedBarberObj = barbers.find(b => b.id === barberId);
        if (selectedBarberObj) {
          await fetchBarberQueues([selectedBarberObj], selectedDate);
                              } else {
          console.warn('⚠️ Barber not found in barbers list:', barberId);
          // Fallback: try with just the ID
          await fetchBarberQueues([{ id: barberId }], selectedDate);
        }
      } catch (error) {
        console.error('❌ Error loading queue data:', error);
      }
    }
    
    // Manage queue and scheduled slots first
    if (selectedDate) {
      try {
        await manageQueueAndScheduledSlots(barberId, selectedDate);
      } catch (error) {
        console.error('❌ Error managing queue slots:', error);
      }
    }
    
    // Load booked time slots for scheduled appointments
    if (appointmentType === 'scheduled' && selectedDate) {
      console.log('🕐 Loading time slots for scheduled appointment...');
      try {
        await getBookedTimeSlots(selectedDate, barberId);
      } catch (error) {
        console.error('❌ Error loading time slots:', error);
      }
    }
  };

  const toggleQueueDetails = (barberId) => {
    setShowQueueDetails(prev => ({
      ...prev,
      [barberId]: !prev[barberId]
    }));
  };


  const getBarberStatusInfo = (barber) => {
    if (!barber) return { text: 'Unknown', class: 'text-muted', icon: 'bi-question-circle' };
    
    switch (barber.barber_status) {
      case 'available':
        return { text: 'Available', class: 'text-success', icon: 'bi-check-circle' };
      case 'busy':
        return { text: 'Busy', class: 'text-warning', icon: 'bi-clock' };
      case 'offline':
        return { text: 'Offline', class: 'text-danger', icon: 'bi-x-circle' };
      default:
        return { text: 'Unknown', class: 'text-muted', icon: 'bi-question-circle' };
    }
  };

  return (
    <div className="card-body p-4">
      <h4 className="mb-4">
        <i className="bi bi-calendar3 me-2 text-primary"></i>
        Select Date, Type & Barber
      </h4>

      {/* Existing Appointment Alert */}
      {existingAppointment && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="alert alert-warning">
              <i className="bi bi-exclamation-triangle me-2"></i>
              <strong>Existing Appointment Found:</strong> You already have an appointment on {selectedDate} at {existingAppointment.appointment_time || 'Queue #' + (existingAppointment.queue_position || 1)} with {existingAppointment.barber?.full_name || 'your barber'}.
                  </div>
                </div>
              </div>
            )}

                <div className="row">
        <div className="col-md-6 mb-4">
          <label htmlFor="appointmentDate" className="form-label fw-bold">
            <i className="bi bi-calendar-date me-2 text-primary"></i>
                        Select Date
                      </label>
                      <input
                        type="date"
            className="form-control"
            id="appointmentDate"
                        value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            onBlur={(e) => handleDateChange(e.target.value)}
            min={today}
            max={maxDateStr}
            step="1"
            style={{ cursor: 'pointer' }}
                        required
                      />
                      <div className="form-text">
                        <i className="bi bi-info-circle me-1"></i>
            Select your preferred appointment date (today or future dates only)
            <br />
            <small className="text-muted">
              <i className="bi bi-calendar3 me-1"></i>
              Click on the month (MM) or year (YYYY) to change them quickly
            </small>
            {checkingAppointment && <span className="text-warning ms-2">Checking for existing appointments...</span>}
                          </div>
                      {dateValidationMessage && (
                        <div className="alert alert-warning mt-2 mb-0">
                          <i className="bi bi-exclamation-triangle me-2"></i>
                          {dateValidationMessage}
                        </div>
                      )}
                    </div>

        <div className="col-md-6 mb-4">
                      <label className="form-label fw-bold">
                        <i className="bi bi-clock me-2 text-primary"></i>
                        Appointment Type
                      </label>
          <div className="row g-2">
            <div className="col-6">
              <div className={`card ${appointmentType === 'queue' ? 'border-primary bg-primary bg-opacity-10' : 'border-secondary'}`} 
                   style={{ cursor: 'pointer' }}
                   onClick={() => setAppointmentType('queue')}>
                <div className="card-body p-3 text-center">
                  <i className="bi bi-people fs-4 text-primary mb-2"></i>
                  <h6 className="mb-1">Queue</h6>
                  <small className="text-muted">Join the line</small>
                                  </div>
                                  </div>
                              </div>
            <div className="col-6">
              <div className={`card ${appointmentType === 'scheduled' ? 'border-primary bg-primary bg-opacity-10' : 'border-secondary'}`} 
                   style={{ cursor: 'pointer' }}
                   onClick={() => setAppointmentType('scheduled')}>
                <div className="card-body p-3 text-center">
                  <i className="bi bi-calendar-check fs-4 text-primary mb-2"></i>
                  <h6 className="mb-1">Scheduled</h6>
                  <small className="text-muted">Book time slot</small>
                            </div>
                          </div>
                        </div>
                                  </div>
          <div className="form-text">
            <i className="bi bi-info-circle me-1"></i>
            Queue: Join the line. Scheduled: Book a specific time slot.
                        </div>
                      </div>
                    </div>



      {/* Book for Friend/Child */}
      <div className="row mb-4">
        <div className="col-12">
                              <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
              id="bookForFriend"
              checked={bookForFriend}
              onChange={(e) => setBookForFriend(e.target.checked)}
            />
            <label className="form-check-label fw-bold" htmlFor="bookForFriend">
              <i className="bi bi-person-plus me-2 text-primary"></i>
              Book for a Friend or Child
                        </label>
                              </div>
                      </div>
                    </div>

      {/* Friend/Child Details */}
      {bookForFriend && (
        <div className="row mb-4">
          <div className="col-md-6">
            <label htmlFor="friendName" className="form-label fw-bold">
              <i className="bi bi-person me-2 text-primary"></i>
              Friend/Child Name
            </label>
            <input
              type="text"
              className="form-control"
              id="friendName"
              value={friendName}
              onChange={(e) => setFriendName(e.target.value)}
              placeholder="Enter name"
              required={bookForFriend}
            />
          </div>
          <div className="col-md-6">
            <label htmlFor="friendPhone" className="form-label fw-bold">
              <i className="bi bi-telephone me-2 text-primary"></i>
              Contact Number
            </label>
            <input
              type="tel"
              className="form-control"
              id="friendPhone"
              value={friendPhone}
              onChange={(e) => setFriendPhone(e.target.value)}
              placeholder="Enter phone number"
              required={bookForFriend}
            />
          </div>
        </div>
      )}
      
      {/* Friend Email */}
      {bookForFriend && (
        <div className="row mb-4">
          <div className="col-md-12">
            <label htmlFor="friendEmail" className="form-label fw-bold">
              <i className="bi bi-envelope me-2 text-primary"></i>
              Email Address (Optional)
            </label>
            <input
              type="email"
              className="form-control"
              id="friendEmail"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="Enter email address (optional)"
            />
          </div>
        </div>
      )}

      {/* Double Booking Check */}
      {selectedDate && !existingAppointment && !bookForFriend && (
        <div className="row mb-4">
          <div className="col-12">
                        <div className="alert alert-info">
              <i className="bi bi-shield-check me-2"></i>
              <strong>Double Booking Protection:</strong> You can only book one appointment per day to ensure fair access for all customers.
                        </div>
                        </div>
                      </div>
                    )}

      {/* Barber Selection */}
      {selectedDate && (
        <>
          {/* Top 3 Barber Recommendations - Always Show */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="alert alert-warning">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="mb-0">
                    <i className="bi bi-star-fill me-2"></i>
                    Top 3 Recommended Barbers
                  </h6>
                  <button
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setShowRecommendations(!showRecommendations)}
                  >
                    {showRecommendations ? <i className="bi bi-eye-slash"></i> : <i className="bi bi-eye"></i>}
                  </button>
                </div>
                {showRecommendations && (
                  <div className="row g-2">
                    {barberRecommendations && barberRecommendations.length > 0 ? (
                      (() => {
                        // Calculate service duration for accurate capacity checking
                        const serviceDuration = bookingData.selectedServices.length > 0 
                          ? calculateTotalDuration(
                              bookingData.selectedServices, 
                              bookingData.selectedAddOns, 
                              services, 
                              addOns
                            )
                          : 30; // Default 30 minutes if no services selected yet
                        
                        // Filter to show only available barbers in recommendations
                        const availableRecommendations = barberRecommendations.filter(rec => {
                          if (!rec || !rec.barber) return false;
                          
                          // Check if barber can accommodate the specific service duration
                          const queue = barberQueues[rec.barber.id];
                          const canAccommodate = canBarberAccommodateService ? canBarberAccommodateService(queue, serviceDuration) : false;
                          const isFullSlot = queue && (!canAccommodate || queue.isFullCapacity);
                          
                          console.log(`🔍 Recommendation filter for ${rec.barber.full_name}:`, {
                            serviceDuration,
                            canAccommodate,
                            isFullSlot,
                            queueCapacity: queue?.isFullCapacity
                          });
                          
                          // Only include barbers who are NOT full
                          return !isFullSlot;
                        });
                        
                        const recommendationsToShow = availableRecommendations.slice(0, 3);
                        
                        console.log(`📊 Total recommendations: ${recommendationsToShow.length}`);
                        
                        // Add a message if we have fewer than 3 recommendations
                        if (recommendationsToShow.length < 3 && recommendationsToShow.length > 0) {
                          console.log(`⚠️ Only ${recommendationsToShow.length} barbers available for recommendations`);
                        }
                        
                        
                        return recommendationsToShow
                        .map((rec, index) => {
                            
                            return (
                          <div key={rec.barber.id} className="col-md-4">
                            <div className={`card border-${index === 0 ? 'success' : index === 1 ? 'warning' : 'secondary'} h-100`}>
                              <div className="card-body p-3">
                                <div className="d-flex justify-content-between align-items-start mb-2">
                                  <h6 className="card-title mb-0">{rec.barber.full_name}</h6>
                                  <span className={`badge bg-${index === 0 ? 'success' : index === 1 ? 'warning' : 'secondary'}`}>
                                    #{index + 1}
                                  </span>
                                </div>
                                
                                <div className="mb-2">
                                  <div className="d-flex align-items-center">
                                    <i className="bi bi-star-fill text-warning me-1"></i>
                                    <span className="fw-bold">{rec.barber.total_ratings > 0 ? (rec.barber.average_rating?.toFixed(1) || '0.0') : '0.0'}/5</span>
                                    <span className="text-muted ms-1">({rec.barber.total_ratings || 0} reviews)</span>
                                  </div>
                                </div>
                                
                                
                                <div className="d-flex justify-content-between align-items-center">
                                  <small className="text-success fw-bold">
                                    {rec.score ? rec.score : '0'}%
                                        </small>
                                  <button
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => handleBarberSelect(rec.barber.id)}
                                  >
                                    Choose
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()
                    ) : (
                      <div className="col-12 text-center">
                        <p className="text-muted mb-0">Loading recommendations...</p>
                      </div>
                    )}
                    
                    {/* Show message if fewer than 3 recommendations */}
                    {barberRecommendations && barberRecommendations.length > 0 && (() => {
                      const serviceDuration = bookingData.selectedServices.length > 0 
                        ? calculateTotalDuration(
                            bookingData.selectedServices, 
                            bookingData.selectedAddOns, 
                            services, 
                            addOns
                          )
                        : 30;
                      
                      const availableCount = barberRecommendations.filter(rec => {
                        if (!rec || !rec.barber) return false;
                        const queue = barberQueues[rec.barber.id];
                        const canAccommodate = canBarberAccommodateService ? canBarberAccommodateService(queue, serviceDuration) : false;
                        const isFullSlot = queue && (!canAccommodate || queue.isFullCapacity);
                        return !isFullSlot;
                      }).length;
                      
                      if (availableCount < 3 && availableCount > 0) {
                        return (
                          <div className="col-12 mt-2">
                            <div className="alert alert-info py-2">
                              <small>
                                <i className="bi bi-info-circle me-1"></i>
                                Only {availableCount} barber{availableCount !== 1 ? 's' : ''} available for your selected service duration. 
                                Other barbers may have full schedules.
                              </small>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {/* Warning for fully scheduled barbers */}
                {selectedBarber && selectedDate && bookingData.selectedServices.length > 0 && (
                  <div className="row mt-3">
                    <div className="col-12">
                      <div id="barber-schedule-warning" className="alert alert-info border">
                        <div className="d-flex align-items-center">
                          <i className="bi bi-info-circle me-2"></i>
                          <div>
                            <strong>Schedule Check:</strong> Checking availability for your selected services...
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                                  </div>
                                </div>
                              </div>

                    {/* Time Slot Selection for Scheduled Appointments */}
          {appointmentType === 'scheduled' && selectedDate && selectedBarber && (
            <div className="row mb-4">
              <div className="col-12">
                <label className="form-label fw-bold mb-3">
                  <i className="bi bi-clock me-2 text-primary"></i>
                  Select Time Slot
                </label>
                
                <div className="d-flex flex-wrap gap-2">
                  {timeSlots.map((slot) => {
                    const isBooked = bookedTimeSlots.includes(slot.value);
                    const isSelected = selectedTimeSlot === slot.value;
                    const isPastTime = new Date(`${selectedDate} ${slot.value}`) < new Date();
                    
                    // Check if this slot would cause lunch break conflict
                    const totalDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
                    const wouldCrossLunch = wouldCrossLunchBreak(slot.value, totalDuration);
                    
                    // Determine if this is a queue or scheduled appointment
                    const appointmentAtSlot = getAppointmentAtTime(slot.value);
                    const isQueueSlot = appointmentAtSlot?.type === 'queue';
                    const isScheduledSlot = appointmentAtSlot?.type === 'scheduled';
                    
                    // Check if selecting this slot would conflict with existing appointments
                    // This checks if the slot + duration would overlap with any existing appointment
                    const wouldConflict = isBooked || wouldSlotConflictWithExistingAppointments(slot.value, totalDuration, bookedTimeSlots);
                    const alternativeTimes = wouldConflict ? findAlternativeTimes(slot.value, totalDuration) : [];
                    
                    // Enhanced gap management for 40-minute services (temporarily disabled)
                    const hasGapConflict = false; // checkServiceGapConflicts(slot.value, totalDuration);
                    const suggestedGapTimes = []; // hasGapConflict ? findGapOptimizedTimes(slot.value, totalDuration) : [];
                    
                    return (
                      <div key={slot.value} className="position-relative">
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            isBooked 
                              ? (isQueueSlot ? 'btn-outline-warning' : 'btn-outline-danger')
                              : isPastTime 
                              ? 'btn-outline-secondary' 
                              : wouldCrossLunch
                              ? 'btn-outline-warning'
                              : wouldConflict
                              ? 'btn-outline-danger'
                              : hasGapConflict
                              ? 'btn-outline-info'
                              : isSelected 
                              ? 'btn-primary' 
                              : 'btn-outline-success'
                          }`}
                          disabled={isBooked || isPastTime || wouldCrossLunch || wouldConflict}
                          onClick={() => {
                            if ((isBooked || wouldConflict) && alternativeTimes.length > 0) {
                              // Show alternative times modal
                              setAlternativeTimes(alternativeTimes);
                              setShowAlternativeTimesModal(true);
                            } else if (!isBooked && !isPastTime && !wouldCrossLunch && !wouldConflict) {
                              setSelectedTimeSlot(slot.value);
                            }
                          }}
                          style={{ minWidth: '80px' }}
                          title={
                            wouldCrossLunch 
                              ? `Service would cross lunch break (12:00 PM - 1:00 PM)` 
                              : wouldConflict 
                              ? `Slot conflicts with existing appointment (${totalDuration} min service)` 
                              : hasGapConflict
                              ? `Creates scheduling gap - consider alternative times for better efficiency`
                              : isBooked 
                              ? (isQueueSlot ? `Queue appointment at this time` : `Already booked`)
                              : isPastTime 
                              ? `Time has passed`
                              : `Available - ${slot.display}`
                          }
                        >
                          <div className="d-flex flex-column align-items-center">
                            <span className="fw-bold">{slot.display}</span>
                            <small className={`${
                              isBooked 
                                ? (isQueueSlot ? 'text-warning' : 'text-danger')
                                : isPastTime ? 'text-muted' 
                                : wouldCrossLunch ? 'text-warning'
                                : wouldConflict ? 'text-danger'
                                : hasGapConflict ? 'text-info'
                                : 'text-muted'
                            }`}>
                              {isBooked 
                                ? (isQueueSlot ? 'QUEUE' : 'BOOKED')
                                : isPastTime ? 'Past' 
                                : wouldCrossLunch ? 'Lunch Break'
                                : wouldConflict ? 'CONFLICT'
                                : hasGapConflict ? 'GAP'
                                : 'Available'}
                            </small>
                          </div>
                        </button>
                        
                        {/* Show suggestion indicator if there are alternatives */}
                        {wouldConflict && alternativeTimes.length > 0 && (
                          <div className="position-absolute top-0 end-0 translate-middle">
                            <span className="badge bg-info rounded-pill" style={{ fontSize: '0.6rem' }}>
                              <i className="bi bi-lightbulb"></i>
                            </span>
                          </div>
                        )}
                        
                        {/* Show gap optimization indicator */}
                        {hasGapConflict && suggestedGapTimes.length > 0 && (
                          <div className="position-absolute top-0 start-0 translate-middle">
                            <span className="badge bg-warning rounded-pill" style={{ fontSize: '0.6rem' }}>
                              <i className="bi bi-clock-history"></i>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Lunch Break Warning */}
                {(() => {
                  const totalDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
                  const hasLunchConflict = timeSlots.some(slot => wouldCrossLunchBreak(slot.value, totalDuration));
                  
                  if (hasLunchConflict && totalDuration > 0) {
                    return (
                      <div className="alert alert-warning mt-3 mb-3">
                        <i className="bi bi-exclamation-triangle me-2"></i>
                        <strong>Lunch Break Notice:</strong> Your selected services ({totalDuration} minutes) would cross the lunch break period (12:00 PM - 1:00 PM). 
                        Please choose a different time slot or reduce your service duration to avoid conflicts.
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="mt-3 d-flex justify-content-between align-items-center">
                  <button 
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => getBookedTimeSlots(selectedDate, selectedBarber)}
                  >
                    <i className="bi bi-arrow-clockwise me-1"></i>
                    Refresh
                  </button>
                  
                </div>

                {/* Enhanced Unified Slot System */}
                {unifiedSlots.length > 0 && (
                  <div className="mt-4">
                    <div className="alert alert-info">
                      <h6 className="alert-heading">
                        <i className="bi bi-magic me-2"></i>
                        Enhanced Slot System
                        <span className="badge bg-success ms-2">NEW</span>
                      </h6>
                      <p className="mb-3">Smart slot management with real-time availability and alternative recommendations.</p>
                      
                      <div className="row g-2">
                        {unifiedSlots.slice(0, 8).map((slot, index) => (
                          <div key={index} className="col-6 col-md-3">
                            <button
                              type="button"
                              className={`btn w-100 ${
                                slot.type === 'available' && slot.canBook
                                  ? selectedTimeSlot === slot.time
                                    ? 'btn-primary'
                                    : 'btn-outline-success'
                                  : slot.type === 'scheduled'
                                  ? 'btn-outline-secondary'
                                  : slot.type === 'queue'
                                  ? 'btn-outline-warning'
                                  : slot.type === 'lunch'
                                  ? 'btn-outline-dark'
                                  : 'btn-outline-danger'
                              }`}
                              onClick={() => slot.canBook && handleUnifiedSlotSelect(slot)}
                              disabled={!slot.canBook}
                              title={slot.reason}
                            >
                              <div className="small fw-bold">
                                {convertTo12Hour(slot.time)}
                              </div>
                              <div className="small">
                                {slot.type === 'available' && '✅ Available'}
                                {slot.type === 'scheduled' && '❌ Booked'}
                                {slot.type === 'queue' && `⚠️ Queue #${slot.queuePosition}`}
                                {slot.type === 'lunch' && '🍽️ Lunch'}
                                {slot.type === 'full' && '🔴 Full'}
                              </div>
                              {slot.estimatedWaitTime > 0 && (
                                <div className="small text-muted">
                                  ~{slot.estimatedWaitTime}min wait
                                </div>
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                      
                      {/* Manual trigger for alternative barbers */}
                      {selectedBarber && selectedDate && bookingData.selectedServices.length > 0 && !showAlternatives && (
                        <div className="mt-3 text-center">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => {
                              const serviceDuration = calculateTotalDuration(
                                bookingData.selectedServices, 
                                bookingData.selectedAddOns, 
                                services, 
                                addOns
                              );
                              loadAlternativeBarbers(selectedDate, serviceDuration, selectedBarber);
                            }}
                          >
                            <i className="bi bi-search me-1"></i>
                            Find Alternative Barbers
                          </button>
                        </div>
                      )}

                      {/* Alternative Barbers - Show when current barber is full or alternatives are available */}
                      {(showAlternatives && alternativeBarbers.length > 0) || (selectedBarber && barberQueues[selectedBarber]?.isFullCapacity) ? (
                        <div className="mt-3">
                          <h6 className="text-success">
                            <i className="bi bi-lightbulb me-2"></i>
                            {barberQueues[selectedBarber]?.isFullCapacity 
                              ? 'Alternative Barbers (Current Barber Full)' 
                              : alternativeBarbers.length > 0 && alternativeBarbers[0].reason === 'fully_scheduled'
                                ? 'Alternative Barbers (Current Barber Fully Scheduled)'
                                : 'Alternative Barbers Available'
                            }
                          </h6>
                          <div className="row g-2">
                            {alternativeBarbers.length > 0 ? (
                              alternativeBarbers.slice(0, 2).map((alt, index) => (
                              <div key={index} className="col-12">
                                <div className="card border-success">
                                  <div className="card-body p-2">
                                    <div className="d-flex justify-content-between align-items-center">
                                      <div>
                                          <strong>{alt.barber.full_name}</strong>
                                        <br />
                                        <small className="text-muted">
                                            Next: {alt.nextAvailableDisplay} • {alt.availableSlots} slots
                                          </small>
                                          <br />
                                          <small className="text-success">
                                            {alt.recommendation}
                                        </small>
                                      </div>
                                      <button
                                        type="button"
                                        className="btn btn-success btn-sm"
                                          onClick={() => handleAlternativeBarberSelect(alt.barber.id)}
                                      >
                                        Switch
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              ))
                            ) : (
                              <div className="col-12">
                                <div className="alert alert-warning">
                                  <i className="bi bi-exclamation-triangle me-2"></i>
                                  No alternative barbers available for this date. Please try a different date or contact us for assistance.
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
                      </div>
                    )}

                    {/* Barber Selection */}
          <div className="row mb-4">
            <div className="col-12">
              <label className="form-label fw-bold">
                <i className="bi bi-person me-2 text-primary"></i>
                Choose Your Barber
                      </label>
              
              {barbers && barbers.length > 0 ? (
                <div className="row g-3">
                        {barbers.map((barber) => {
                          const queue = barberQueues[barber.id];
                    const isSelected = selectedBarber === barber.id;
                    const showDetails = showQueueDetails[barber.id];
                    
                    // Calculate service duration for accurate capacity checking
                    const serviceDuration = bookingData.selectedServices.length > 0 
                      ? calculateTotalDuration(
                          bookingData.selectedServices, 
                          bookingData.selectedAddOns, 
                          services, 
                          addOns
                        )
                      : 30; // Default 30 minutes if no services selected yet
                    
                    // Check if barber can accommodate the specific service duration
                    const canAccommodate = canBarberAccommodateService ? canBarberAccommodateService(queue, serviceDuration) : false;
                    
                    // Check if barber has full slots
                    const isFullSlot = queue && (!canAccommodate || queue.isFullCapacity);
                    const hasAvailableSlots = queue && canAccommodate && !queue.isFullCapacity;
                    const isFullyScheduled = queue && queue.isFullyScheduled;
                    const isQueueFull = queue && queue.queueCount >= 15; // Assuming max queue size
                    
                    // Debug logging for capacity issues
                    if (queue && queue.timeBasedAvailableSlots > 0 && queue.isFullCapacity) {
                      console.log('🚨 Capacity Logic Issue for barber:', barber.full_name, {
                        timeBasedAvailableSlots: queue.timeBasedAvailableSlots,
                        isFullCapacity: queue.isFullCapacity,
                        isFullyScheduled: queue.isFullyScheduled,
                        remainingTime: queue.remainingTime,
                        queueCount: queue.queueCount,
                        scheduledCount: queue.scheduledCount,
                        serviceDuration,
                        canAccommodate
                      });
                    }
                    
                          return (
                      <div key={barber.id} className="col-md-6 col-lg-4">
                        <div className={`card barber-card h-100 ${isSelected ? 'border-primary bg-primary bg-opacity-10' : ''} ${isFullSlot ? 'border-secondary bg-light opacity-75' : ''}`}>
                          <div className="card-body p-3">
                            <div className="d-flex justify-content-between align-items-start mb-2">
                              <h6 className="card-title mb-0">{barber.full_name}</h6>
                              <div className="d-flex flex-column align-items-end gap-1">
                                <span className={`badge ${barber.barber_status === 'available' ? 'bg-success' : barber.barber_status === 'busy' ? 'bg-warning' : 'bg-secondary'}`}>
                                  {barber.barber_status}
                                </span>
                                {isFullSlot && (
                                  <span className="badge bg-secondary" title={
                                    isFullyScheduled ? 'No available time slots' : 
                                    isQueueFull ? 'Queue is full' : 
                                    'No available slots'
                                  }>
                                    <i className="bi bi-clock me-1"></i>
                                    {isFullyScheduled ? 'Fully Scheduled' : 
                                     isQueueFull ? 'Queue Full' : 
                                     'Full Slot'}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="mb-2">
                              <div className="d-flex align-items-center">
                                <i className="bi bi-star-fill text-warning me-1"></i>
                                <span className="fw-bold">{barber.total_ratings > 0 ? (barber.average_rating?.toFixed(1) || '0.0') : '0.0'}/5</span>
                                <span className="text-muted ms-1">({barber.total_ratings || 0} reviews)</span>
                              </div>
                            </div>
                            
                            <div className="d-flex gap-2">
                              <button
                                className={`btn btn-sm ${isSelected ? 'btn-primary' : isFullSlot ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
                                onClick={() => handleBarberSelect(barber.id)}
                                disabled={isFullSlot}
                                title={isFullSlot ? 'This barber has no available slots' : ''}
                              >
                                {isSelected ? 'Selected' : 
                                 isFullyScheduled ? 'Fully Scheduled' : 
                                 isQueueFull ? 'Queue Full' : 
                                 isFullSlot ? 'Full Slot' : 'Select'}
                              </button>
                              <button
                                className="btn btn-sm btn-outline-info"
                                onClick={() => toggleQueueDetails(barber.id)}
                              >
                                <i className="bi bi-eye"></i>
                              </button>
                            </div>
                            
                            {/* Queue Details */}
                            {showDetails && queue && (
                              <div className="mt-3 pt-3 border-top">
                                <h6 className="small mb-2">
                                  <i className="bi bi-list-ol me-1"></i>
                                  Queue Details:
                                </h6>
                                {queue.appointments && queue.appointments.length > 0 ? (
                                  <div className="small">
                                    {/* Sort appointments by queue number and status */}
                                    {queue.appointments
                                      .sort((a, b) => {
                                        // First sort by appointment_type (queue first, then scheduled)
                                        if (a.appointment_type !== b.appointment_type) {
                                          return a.appointment_type === 'queue' ? -1 : 1;
                                        }
                                        // Then sort by queue_position for queue appointments
                                        if (a.appointment_type === 'queue' && b.appointment_type === 'queue') {
                                          return (a.queue_position || 0) - (b.queue_position || 0);
                                        }
                                        // For scheduled appointments, sort by appointment_time
                                        if (a.appointment_type === 'scheduled' && b.appointment_type === 'scheduled') {
                                          return (a.appointment_time || '').localeCompare(b.appointment_time || '');
                                        }
                                        return 0;
                                      })
                                      .map((apt, idx) => {
                                        const isQueue = apt.appointment_type === 'queue';
                                        const isScheduled = apt.appointment_type === 'scheduled';
                                        const isOngoing = apt.status === 'ongoing';
                                        const isPending = apt.status === 'pending';
                                        
                                        // Calculate service duration for display
                                        let serviceDuration = apt.total_duration;
                                        
                                        // Debug logging
                                        console.log(`🔍 Duration calculation for appointment ${apt.id}:`, {
                                          total_duration: apt.total_duration,
                                          services_data: apt.services_data,
                                          add_ons_data: apt.add_ons_data,
                                          service_id: apt.service_id,
                                          appointment_type: apt.appointment_type
                                        });
                                        
                                        // If total_duration is not available, try to calculate from services_data
                                        if (!serviceDuration && apt.services_data) {
                                          try {
                                            const servicesData = typeof apt.services_data === 'string' 
                                              ? JSON.parse(apt.services_data) 
                                              : apt.services_data;
                                            
                                            console.log('📋 Parsed services_data:', servicesData);
                                            
                                            if (Array.isArray(servicesData)) {
                                              serviceDuration = servicesData.reduce((total, serviceId) => {
                                                const service = services.find(s => s.id === serviceId);
                                                console.log(`  Service ${serviceId}:`, service?.duration || 30);
                                                return total + (service?.duration || 30);
                                              }, 0);
                                            }
                                          } catch (e) {
                                            console.warn('Error parsing services_data:', e);
                                          }
                                        }
                                        
                                        // If still no duration, try to get from service_id
                                        if (!serviceDuration && apt.service_id) {
                                          const service = services.find(s => s.id === apt.service_id);
                                          serviceDuration = service?.duration || 30;
                                          console.log(`📋 Service from service_id:`, service?.duration || 30);
                                        }
                                        
                                        // Final fallback
                                        serviceDuration = serviceDuration || 30;
                                        
                                        console.log(`✅ Final calculated duration: ${serviceDuration} minutes`);
                                        
                                        const serviceDurationText = serviceDuration >= 60 
                                          ? `${Math.floor(serviceDuration / 60)}h ${serviceDuration % 60}m`
                                          : `${serviceDuration}m`;
                                        
                                        return (
                                          <div key={idx} className={`d-flex justify-content-between align-items-center py-1 px-2 rounded mb-1 ${
                                            isOngoing ? 'bg-success bg-opacity-10' : 
                                            isPending ? 'bg-warning bg-opacity-10' : 
                                            'bg-light'
                                          }`}>
                                            <div className="d-flex align-items-center">
                                              <span className={`badge me-2 ${
                                                isOngoing ? 'bg-success' : 
                                                isPending ? 'bg-warning' : 
                                                isQueue ? 'bg-primary' : 'bg-info'
                                              }`}>
                                                {isQueue ? `#${apt.queue_position || 'N/A'}` : 
                                                 isScheduled ? 'Scheduled' : 'N/A'}
                                              </span>
                                              <div className="d-flex flex-column">
                                                <span className="fw-medium">
                                                  {isQueue ? 'Queue Position' : 
                                                   isScheduled ? 'Scheduled' : 'Unknown'}
                                                </span>
                                                <small className="text-muted">
                                                  <i className="bi bi-clock me-1"></i>
                                                  {serviceDurationText}
                                                </small>
                                              </div>
                                            </div>
                                            <div className="text-end">
                                              <span className={`badge ${
                                                isOngoing ? 'bg-success' : 
                                                isPending ? 'bg-warning' : 
                                                apt.status === 'scheduled' ? 'bg-primary' : 'bg-secondary'
                                              }`}>
                                                {isOngoing ? 'Serving Now' : 
                                                 isPending ? 'Pending' : 
                                                 apt.status === 'scheduled' ? 'Scheduled' : 
                                                 apt.status || 'Unknown'}
                                              </span>
                                              {isScheduled && apt.appointment_time && (
                                                <div className="text-muted small mt-1">
                                                  {convertTo12Hour(apt.appointment_time)}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                          );
                        })}
                                  </div>
                                ) : (
                                  <div className="text-center py-3">
                                    <i className="bi bi-inbox text-muted fs-4"></i>
                                    <p className="small text-muted mb-0 mt-2">No customers in queue</p>
                                    <small className="text-muted">Be the first to join!</small>
                                  </div>
                                )}
                                
                                {/* Queue Summary */}
                                {queue.appointments && queue.appointments.length > 0 && (
                                  <div className="mt-3 pt-2 border-top">
                                    <div className="row text-center small">
                                      <div className="col-4">
                                        <div className="text-primary fw-bold">{queue.queueCount || 0}</div>
                                        <div className="text-muted">In Queue</div>
                                      </div>
                                      <div className="col-4">
                                        <div className="text-info fw-bold">{queue.scheduledCount || 0}</div>
                                        <div className="text-muted">Scheduled</div>
                                      </div>
                                      <div className="col-4">
                                        <div className="text-warning fw-bold">{queue.pendingCount || 0}</div>
                                        <div className="text-muted">Pending</div>
                                      </div>
                                    </div>
                                    
                                    {/* Service Time Information */}
                                    {queue.appointments && queue.appointments.length > 0 && (
                                      <div className="mt-2 pt-2 border-top">
                                        <div className="row text-center small">
                                          <div className="col-6">
                                            <div className="text-success fw-bold">
                                              {(() => {
                                                const queueAppts = queue.appointments.filter(apt => apt.appointment_type === 'queue');
                                                let totalQueueTime = 0;
                                                
                                                queueAppts.forEach(apt => {
                                                  let duration = apt.total_duration;
                                                  
                                                  // Calculate duration from services_data if total_duration is not available
                                                  if (!duration && apt.services_data) {
                                                    try {
                                                      const servicesData = typeof apt.services_data === 'string' 
                                                        ? JSON.parse(apt.services_data) 
                                                        : apt.services_data;
                                                      
                                                      if (Array.isArray(servicesData)) {
                                                        duration = servicesData.reduce((total, serviceId) => {
                                                          const service = services.find(s => s.id === serviceId);
                                                          return total + (service?.duration || 30);
                                                        }, 0);
                                                      }
                                                    } catch (e) {
                                                      console.warn('Error parsing services_data for avg calculation:', e);
                                                    }
                                                  }
                                                  
                                                  // Fallback to service_id
                                                  if (!duration && apt.service_id) {
                                                    const service = services.find(s => s.id === apt.service_id);
                                                    duration = service?.duration || 30;
                                                  }
                                                  
                                                  totalQueueTime += duration || 30;
                                                });
                                                
                                                const avgServiceTime = queueAppts.length > 0 ? Math.round(totalQueueTime / queueAppts.length) : 0;
                                                return avgServiceTime >= 60 
                                                  ? `${Math.floor(avgServiceTime / 60)}h ${avgServiceTime % 60}m`
                                                  : `${avgServiceTime}m`;
                                              })()}
                                            </div>
                                            <div className="text-muted">Avg Service Time</div>
                                          </div>
                                          <div className="col-6">
                                            <div className="text-warning fw-bold">
                                              {(() => {
                                                const queueAppts = queue.appointments.filter(apt => apt.appointment_type === 'queue');
                                                let totalWaitTime = 0;
                                                
                                                queueAppts.forEach(apt => {
                                                  let duration = apt.total_duration;
                                                  
                                                  // Calculate duration from services_data if total_duration is not available
                                                  if (!duration && apt.services_data) {
                                                    try {
                                                      const servicesData = typeof apt.services_data === 'string' 
                                                        ? JSON.parse(apt.services_data) 
                                                        : apt.services_data;
                                                      
                                                      if (Array.isArray(servicesData)) {
                                                        duration = servicesData.reduce((total, serviceId) => {
                                                          const service = services.find(s => s.id === serviceId);
                                                          return total + (service?.duration || 30);
                                                        }, 0);
                                                      }
                                                    } catch (e) {
                                                      console.warn('Error parsing services_data for wait time calculation:', e);
                                                    }
                                                  }
                                                  
                                                  // Fallback to service_id
                                                  if (!duration && apt.service_id) {
                                                    const service = services.find(s => s.id === apt.service_id);
                                                    duration = service?.duration || 30;
                                                  }
                                                  
                                                  totalWaitTime += duration || 30;
                                                });
                                                
                                                return totalWaitTime >= 60 
                                                  ? `${Math.floor(totalWaitTime / 60)}h ${totalWaitTime % 60}m`
                                                  : `${totalWaitTime}m`;
                                              })()}
                                            </div>
                                            <div className="text-muted">Est. Wait Time</div>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                          );
                        })}
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-muted">Loading barbers...</p>
                </div>
              )}
            </div>
          </div>
                      
        </>
      )}

      {/* Navigation */}
      <div className="row mt-4">
        <div className="col-12 d-flex justify-content-end">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleNext}
            disabled={!selectedDate || !selectedBarber || (appointmentType === 'scheduled' && !selectedTimeSlot) || (bookForFriend && (!friendName || !friendPhone)) || isBarberFullyScheduled}
          >
            {isBarberFullyScheduled ? 'Barber Fully Scheduled' : 'Next: Select Services'}
            <i className="bi bi-arrow-right ms-2"></i>
          </button>
                    </div>
                      </div>
                    </div>
  );
};


// Step 2: Services and Add-ons
const Step2ServicesAndAddons = ({ 
  bookingData, 
  updateBookingData, 
  onNext, 
  onPrev, 
  services, 
  addOns 
}) => {
  const [selectedServices, setSelectedServices] = useState(bookingData.selectedServices || []);
  const [selectedAddOns, setSelectedAddOns] = useState(bookingData.selectedAddOns || []);
  const [specialRequests, setSpecialRequests] = useState(bookingData.specialRequests || '');

  // Auto-fill special request from haircut recommendation
  useEffect(() => {
    const haircutSpecialRequest = localStorage.getItem('specialRequest');
    if (haircutSpecialRequest && !specialRequests) {
      setSpecialRequests(haircutSpecialRequest);
      // Update booking data as well
      updateBookingData('specialRequests', haircutSpecialRequest);
    }
  }, [specialRequests, setSpecialRequests, updateBookingData]);

  const handleServiceToggle = (serviceId) => {
    setSelectedServices(prev => 
      prev.includes(serviceId) 
        ? [] // Deselect if already selected
        : [serviceId] // Select only this service (single selection)
    );
  };

  const handleAddOnToggle = (addonId) => {
    setSelectedAddOns(prev => 
      prev.includes(addonId) 
        ? prev.filter(id => id !== addonId)
        : [...prev, addonId]
    );
  };

  const calculateTotal = () => {
    const servicesTotal = selectedServices.reduce((total, serviceId) => {
      const service = services.find(s => s.id === serviceId);
      return total + (service?.price || 0);
    }, 0);
    
    const addOnsTotal = selectedAddOns.reduce((total, addonId) => {
      const addon = addOns.find(a => a.id === addonId);
      if (addon) {
        return total + (addon.price || 0);
      }
      
      // Legacy mapping for addon prices (fallback)
      const legacyPriceMapping = {
        'addon1': 50.00, // Beard Trim
        'addon2': 30.00, // Hot Towel Treatment
        'addon3': 80.00, // Scalp Massage
        'addon4': 40.00, // Hair Wash
        'addon5': 25.00, // Styling
        'addon6': 35.00, // Hair Wax Application
        'addon7': 20.00, // Eyebrow Trim
        'addon8': 20.00, // Mustache Trim
        'addon9': 45.00, // Face Mask
        'addon10': 60.00  // Hair Treatment
      };
      
      return total + (legacyPriceMapping[addonId] || 0);
    }, 0);

    return servicesTotal + addOnsTotal;
  };

  const handleNext = () => {
    updateBookingData({
      selectedServices,
      selectedAddOns,
      specialRequests,
      totalPrice: calculateTotal()
    });
    onNext();
  };

  return (
    <div className="card-body p-4">
                      <div className="row">
        <div className="col-12">
          <h4 className="mb-4">
            <i className="bi bi-list-check me-2 text-primary"></i>
            Select Services & Add-ons
          </h4>
                          </div>
                    </div>

                    {/* Services Selection */}
      <div className="row mb-4">
        <div className="col-12">
          <h5 className="mb-3">
            <i className="bi bi-scissors me-2"></i>
            Services <small className="text-muted">(Select 1)</small>
          </h5>
          <div className="row g-3">
            {services && services.length > 0 ? services.map((service) => (
              <div key={service.id} className="col-md-6 col-lg-4">
                <div 
                  className={`card service-card h-100 ${selectedServices.includes(service.id) ? 'border-primary bg-primary bg-opacity-10' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleServiceToggle(service.id)}
                >
                              <div className="card-body p-3">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <h6 className="card-title mb-0">{service.name}</h6>
                                      <span className="badge bg-success">₱{service.price}</span>
                                    </div>
                                    <p className="text-muted small mb-2">{service.description}</p>
                    <div className="d-flex justify-content-between align-items-center">
                                      <small className="text-muted">
                                        <i className="bi bi-clock me-1"></i>
                        {service.duration} mins
                                      </small>
                      {selectedServices.includes(service.id) && (
                        <i className="bi bi-check-circle-fill text-primary"></i>
                      )}
                                    </div>
                                </div>
                              </div>
                            </div>
            )) : (
              <div className="col-12 text-center">
                <p className="text-muted">Loading services...</p>
                          </div>
            )}
          </div>
                      </div>
                    </div>

                    {/* Add-ons Selection */}
      <div className="row mb-4">
        <div className="col-12">
          <h5 className="mb-3">
            <i className="bi bi-plus-circle me-2"></i>
            Add-ons <small className="text-muted">(Select Multiple)</small>
          </h5>
          <div className="row g-3">
            {addOns && addOns.length > 0 ? addOns.map((addon) => (
              <div key={addon.id} className="col-md-6 col-lg-4">
                <div 
                  className={`card addon-card h-100 ${selectedAddOns.includes(addon.id) ? 'border-warning bg-warning bg-opacity-10' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleAddOnToggle(addon.id)}
                >
                  <div className="card-body p-3">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <h6 className="card-title mb-0">{addon.name}</h6>
                      <span className="badge bg-warning text-dark">₱{addon.price}</span>
                          </div>
                    <p className="text-muted small mb-2">{addon.description}</p>
                                      <div className="d-flex justify-content-between align-items-center">
                      <small className="text-muted">
                        <i className="bi bi-clock me-1"></i>
                        {addon.duration} mins
                      </small>
                      {selectedAddOns.includes(addon.id) && (
                        <i className="bi bi-check-circle-fill text-warning"></i>
                      )}
                                        </div>
                                      </div>
                                  </div>
                                </div>
            )) : (
              <div className="col-12 text-center">
                <p className="text-muted">Loading add-ons...</p>
                              </div>
            )}
                            </div>
                        </div>
                      </div>

      {/* Special Requests */}
      <div className="row mb-4">
        <div className="col-12">
          <label htmlFor="specialRequests" className="form-label fw-bold">
            <i className="bi bi-chat-text me-2 text-primary"></i>
            Special Requests
                      </label>
                      <textarea
                        className="form-control"
            id="specialRequests"
                        rows="3"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            placeholder="Any special instructions or requests for your barber..."
          />
        </div>
                    </div>

      {/* Total Price */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="alert alert-success">
            <h6 className="mb-0">
              <i className="bi bi-calculator me-2"></i>
              Total: ₱{calculateTotal().toFixed(2)}
            </h6>
          </div>
        </div>
                  </div>

      {/* Navigation */}
      <div className="row mt-4">
        <div className="col-12 d-flex justify-content-between">
          <button
            className="btn btn-outline-secondary btn-lg"
            onClick={onPrev}
          >
            <i className="bi bi-arrow-left me-2"></i>
            Back
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleNext}
            disabled={selectedServices.length === 0}
          >
            Next: Review & Confirm
            <i className="bi bi-arrow-right ms-2"></i>
          </button>
                            </div>
                          </div>
    </div>
  );
};

// Step 3: Queue Summary
const Step3QueueSummary = ({ 
  bookingData, 
  updateBookingData, 
  onPrev, 
  onEdit, 
  barbers, 
  services, 
  addOns, 
  barberQueues, 
  user, 
  isRebooking, 
  rebookingAppointment, 
  onSubmit, 
  loading,
  timeSlots,
  getQueuePosition,
  getNextSlotRange,
  calculateTotalDuration,
  getEstimatedStartTime,
  getEstimatedEndTime,
  wouldCrossLunchBreak,
  isRefreshing,
  setIsRefreshing,
  updateQueueStatus,
  queueStatus,
  // Real-time status calculation functions
  calculateCurrentQueueStatus,
  calculateRealTimeAvailability,
  unifiedSlots,
  alternativeBarbers
}) => {
  const selectedBarber = barbers.find(b => b.id === bookingData.selectedBarber);
  const queue = barberQueues[bookingData.selectedBarber];
  const [estimatedStartTime, setEstimatedStartTime] = useState('Loading...');
  const [estimatedEndTime, setEstimatedEndTime] = useState('Loading...');
  
  // Real-time status state
  const [realTimeStatus, setRealTimeStatus] = useState({
    queueStatus: null,
    availability: null,
    lastUpdated: null
  });
  const [statusLoading, setStatusLoading] = useState(true);

  // Load async data when component mounts or barber changes
  useEffect(() => {
    const loadAsyncData = async () => {
      if (bookingData.selectedBarber) {
        try {
          setStatusLoading(true);
          
          // Load data based on appointment type
          if (bookingData.appointmentType === 'scheduled') {
            // Load scheduled appointment data
            const startTimeResult = await getEstimatedStartTime(bookingData.selectedBarber, bookingData.selectedDate);
            setEstimatedStartTime(startTimeResult);
            
            const endTimeResult = await getEstimatedEndTime(
              bookingData.selectedBarber,
              bookingData.selectedServices,
              bookingData.selectedAddOns,
              services,
              addOns,
              bookingData.selectedDate
            );
            setEstimatedEndTime(endTimeResult);
          } else {
            // For queue appointments, set appropriate values
            setEstimatedStartTime('Queue Position');
            setEstimatedEndTime('TBD');
          }

          // Calculate real-time status
          const serviceDuration = calculateTotalDuration(
            bookingData.selectedServices, 
            bookingData.selectedAddOns, 
            services, 
            addOns
          );

          const [queueStatus, availability] = await Promise.all([
            calculateCurrentQueueStatus(bookingData.selectedBarber, bookingData.selectedDate),
            calculateRealTimeAvailability(bookingData.selectedBarber, bookingData.selectedDate, serviceDuration)
          ]);

          setRealTimeStatus({
            queueStatus,
            availability,
            lastUpdated: new Date().toLocaleTimeString()
          });

        } catch (error) {
          console.error('Error loading async data:', error);
          setEstimatedStartTime('N/A');
          setEstimatedEndTime('N/A');
        } finally {
          setStatusLoading(false);
        }
      }
    };

    loadAsyncData();
  }, [bookingData.selectedBarber, bookingData.selectedDate, bookingData.selectedServices, bookingData.selectedAddOns, services, addOns]);

  const calculateTotal = () => {
    const servicesTotal = bookingData.selectedServices.reduce((total, serviceId) => {
      const service = services.find(s => s.id === serviceId);
      return total + (service?.price || 0);
    }, 0);
    
    const addOnsTotal = bookingData.selectedAddOns.reduce((total, addonId) => {
      const addon = addOns.find(a => a.id === addonId);
      if (addon) {
        return total + (addon.price || 0);
      }
      
      // Legacy mapping for addon prices (fallback)
      const legacyPriceMapping = {
        'addon1': 50.00, // Beard Trim
        'addon2': 30.00, // Hot Towel Treatment
        'addon3': 80.00, // Scalp Massage
        'addon4': 40.00, // Hair Wash
        'addon5': 25.00, // Styling
        'addon6': 35.00, // Hair Wax Application
        'addon7': 20.00, // Eyebrow Trim
        'addon8': 20.00, // Mustache Trim
        'addon9': 45.00, // Face Mask
        'addon10': 60.00  // Hair Treatment
      };
      
      return total + (legacyPriceMapping[addonId] || 0);
    }, 0);

    return servicesTotal + addOnsTotal;
  };

  return (
    <div className="container-fluid px-2 px-md-4 py-3 py-md-5">
      <style>{`
        .queue-card {
          transition: all 0.3s ease;
        }
        
        .queue-stat {
          transition: all 0.3s ease;
        }
        
        .queue-stat:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
      `}</style>
      <div className="container-xl">
        <div className="row justify-content-center">
          <div className="col-12 col-xxl-10">
            <div className="bg-white p-4 p-lg-5 rounded-3 shadow-sm border">
              <div className="text-center mb-4">
                <h3 className="mb-2 fw-bold text-dark">
                  <i className="bi bi-clipboard-check me-2 text-primary"></i>
                  Review & Confirm Your Booking
                </h3>
                <p className="text-muted mb-0">Please review your appointment details before confirming</p>
              </div>
              
              {/* 🧭 Enhanced Queue Information Section */}
              {bookingData && (
                <div className="bg-light rounded p-3 mb-4 shadow-sm">
                  <h6 className="fw-bold mb-3">
                    <i className="bi bi-hourglass-split me-2 text-primary"></i>
                    {bookingData.appointmentType === 'queue'
                      ? 'Queue Information'
                      : 'Scheduled Appointment'}
                  </h6>

                  {realTimeStatus.queueStatus && realTimeStatus.availability ? (
                    <>
                      {/* For Queue-Based Appointments */}
                      {bookingData.appointmentType === 'queue' && (
                        <div>
                          <p className="mb-1">
                            <strong>Queue Position:</strong>{' '}
                            {realTimeStatus.queueStatus.nextQueuePosition} of {realTimeStatus.queueStatus.queueLength + realTimeStatus.queueStatus.nextQueuePosition}
                          </p>
                          <p className="mb-1">
                            <strong>Estimated Start Time:</strong>{' '}
                            {realTimeStatus.availability.nextAvailableTime ? convertTo12Hour(realTimeStatus.availability.nextAvailableTime) : 'Calculating...'}
                          </p>
                          <p className="mb-0">
                            <strong>Estimated Wait Time:</strong>{' '}
                            {realTimeStatus.queueStatus.estimatedWaitTime > 0 ? 
                              `${Math.round(realTimeStatus.queueStatus.estimatedWaitTime / 60)}h ${realTimeStatus.queueStatus.estimatedWaitTime % 60}m` :
                              'No wait'
                            }
                          </p>
                        </div>
                      )}

                      {/* For Scheduled Appointments */}
                      {bookingData.appointmentType === 'scheduled' && (
                        <div>
                          <p className="mb-1">
                            <strong>Appointment Time:</strong>{' '}
                            {bookingData.selectedTimeSlot ? convertTo12Hour(bookingData.selectedTimeSlot) : 'Not Set'}
                          </p>
                          <p className="mb-0">
                            <strong>Service Duration:</strong>{' '}
                            {calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns)} minutes
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-muted mb-0 text-center py-2">
                      <i className="bi bi-info-circle me-1"></i>
                      Calculating queue information...
                    </p>
                  )}
                </div>
              )}
              
              {/* Lunch Break Conflict Warning */}
              {(() => {
                if (bookingData.appointmentType === 'scheduled' && bookingData.selectedTimeSlot) {
                  const totalDuration = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
                  if (wouldCrossLunchBreak(bookingData.selectedTimeSlot, totalDuration)) {
                    return (
                      <div className="row justify-content-center mb-4">
                        <div className="col-12 col-lg-12 col-xl-10">
                          <div className="alert alert-danger border-0 shadow-sm">
                            <div className="d-flex align-items-center">
                              <i className="bi bi-exclamation-triangle-fill me-3 fs-4"></i>
                              <div>
                                <h6 className="mb-1 fw-bold">Lunch Break Conflict Detected!</h6>
                                <p className="mb-0">
                                  Your selected time slot ({bookingData.selectedTimeSlot}) with {totalDuration}-minute service would cross the lunch break period (12:00 PM - 1:00 PM). 
                                  Please go back and choose a different time slot or reduce your service duration.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              <div className="row justify-content-center">
                {/* Unified Booking & Queue Summary */}
                <div className="col-12 col-lg-12 col-xl-10">
                  <div className="card border shadow-sm">
                    <div className="card-header bg-primary text-white border-0 py-3">
                      <h5 className="mb-0 d-flex align-items-center">
                        <i className="bi bi-calendar-check me-2"></i>
                        <span className="d-none d-sm-inline">Appointment Summary</span>
                        <span className="d-sm-none">Summary</span>
                      </h5>
                    </div>
                    <div className="card-body p-3 p-md-4 p-lg-5">
                      {/* Date & Type - Mobile Responsive */}
                      <div className="row g-3 mb-4">
                        <div className="col-12 col-md-6">
                          <div className="d-flex  flex-md-row align-items-start align-items-md-center justify-content-between">
                            <div className="flex-grow-1 mb-2 mb-md-0">
                              <label className="form-label text-muted small mb-1">
                                <i className="bi bi-calendar me-1"></i>
                                <span className="d-none d-sm-inline">Appointment Date</span>
                                <span className="d-sm-none">Date</span>
                              </label>
                              <div className="fw-bold text-dark fs-6">{bookingData.selectedDate}</div>
                            </div>
                            <button 
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => onEdit(1)}
                              style={{ transition: 'all 0.3s ease' }}
                            >
                              <i className="bi bi-pencil me-1"></i>
                              <span className="d-none d-sm-inline">Edit</span>
                            </button>
                          </div>
                        </div>
                        <div className="col-12 col-md-6">
                          <div>
                            <label className="form-label text-muted small mb-1">
                              <i className="bi bi-clock me-1"></i>
                              <span className="d-none d-sm-inline">Appointment Type</span>
                              <span className="d-sm-none">Type</span>
                            </label>
                            <div className="fw-bold text-dark">
                              <span className={`badge fs-6 ${bookingData.appointmentType === 'queue' ? 'bg-info' : 'bg-success'}`}>
                                {bookingData.appointmentType === 'queue' ? 'Queue' : 'Scheduled'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Time Slot for Scheduled */}
                      {bookingData.appointmentType === 'scheduled' && bookingData.selectedTimeSlot && (
                        <div className="row g-3 mb-4">
                          <div className="col-12">
                            <label className="form-label text-muted small mb-1">Appointment Time</label>
                            <div className="fw-bold text-dark">{bookingData.selectedTimeSlot}</div>
                          </div>
                        </div>
                      )}

                      {/* Barber - Mobile Responsive */}
                      <div className="row g-3 mb-4">
                        <div className="col-12">
                          <div className="d-flex  flex-md-row align-items-start align-items-md-center justify-content-between">
                            <div className="flex-grow-1 mb-2 mb-md-0">
                              <label className="form-label text-muted small mb-1">
                                <i className="bi bi-person me-1"></i>
                                <span className="d-none d-sm-inline">Selected Barber</span>
                                <span className="d-sm-none">Barber</span>
                              </label>
                              <div className="fw-bold text-dark fs-6">{selectedBarber?.full_name}</div>
                            </div>
                            <button 
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => onEdit(1)}
                            >
                              <i className="bi bi-pencil me-1"></i>
                              <span className="d-none d-sm-inline">Edit</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Services - Mobile Responsive */}
                      <div className="row g-3 mb-4">
  <div className="col-12">
    {/* Header Section */}
    <div className="d-flex flex-md-row justify-content-between align-items-start align-items-md-center mb-3">
      {/* Left: Label */}
      <div className="d-flex align-items-center gap-2 mb-2 mb-md-0">
        <i className="bi bi-scissors text-muted fs-5"></i>
        <span className="text-muted small">
          <span className="d-none d-sm-inline">Selected Services</span>
          <span className="d-sm-none">Services</span>
        </span>
      </div>

      {/* Right: Button */}
      <div className="text-start text-md-end">
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={() => onEdit(2)}
        >
          <i className="bi bi-pencil me-1"></i>
          <span className="d-none d-sm-inline">Edit</span>
        </button>
      </div>
    </div>

    {/* Content Section */}
    <div className="bg-light p-3 rounded">
      {bookingData.selectedServices && services ? (
        bookingData.selectedServices.map(serviceId => {
          const service = services.find(s => s.id === serviceId);
          return (
            <div
              key={serviceId}
              className="d-flex justify-content-between align-items-center py-2 border-bottom"
            >
              <div>
                <span className="fw-medium">{service?.name}</span>
                <small className="text-muted d-block">
                  <i className="bi bi-clock me-1"></i>
                  {service?.duration} minutes
                </small>
              </div>
              <span className="text-success fw-bold">₱{service?.price}</span>
            </div>
          );
        })
      ) : (
        <p className="text-muted mb-0 text-center py-3">
          <i className="bi bi-info-circle me-1"></i>
          No services selected
        </p>
      )}
    </div>
  </div>
</div>
                      {/* Add-ons - Mobile Responsive */}
                      {bookingData.selectedAddOns.length > 0 && (
                        <div className="row g-3 mb-4">
                          <div className="col-12">
                            <label className="form-label text-muted small mb-1">
                              <i className="bi bi-plus-circle me-1"></i>
                              <span className="d-none d-sm-inline">Selected Add-ons</span>
                              <span className="d-sm-none">Add-ons</span>
                            </label>
                            <div className="bg-light p-3 rounded">
                              {bookingData.selectedAddOns && addOns ? bookingData.selectedAddOns.map(addonId => {
                                const addon = addOns.find(a => a.id === addonId);
                                return (
                                  <div key={addonId} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                                    <div>
                                      <span className="fw-medium">{addon?.name}</span>
                                      <small className="text-muted d-block">
                                        <i className="bi bi-clock me-1"></i>
                                        {addon?.duration} minutes
                                      </small>
                                    </div>
                                    <span className="text-warning fw-bold">₱{addon?.price}</span>
                                  </div>
                                );
                              }) : (
                                <p className="text-muted mb-0 text-center py-3">
                                  <i className="bi bi-info-circle me-1"></i>
                                  No add-ons selected
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Special Requests */}
                      {bookingData.specialRequests && (
                        <div className="row g-3 mb-4">
                          <div className="col-12">
                            <label className="form-label text-muted small mb-1">Special Requests</label>
                            <div className="bg-light p-3 rounded">
                              <p className="text-muted mb-0">{bookingData.specialRequests}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Enhanced Slot System & Intelligent Suggestions */}
                      {(bookingData.appointmentType === 'queue' || bookingData.appointmentType === 'scheduled') && (
                        <div className="row g-4 mb-4">
                          <div className="col-12 mb-4">
                                    {/* Appointment Summary */}
                                    <div className="card border mb-3">
                                      <div className="card-header bg-light border-bottom">
                                        <h6 className="mb-0 text-dark">
                                          <i className="bi bi-info-circle me-2"></i>
                                          Appointment Summary
                                        </h6>
                                      </div>
                                      <div className="card-body">
                                        <div className="row g-3">
                                          <div className="col-md-4">
                                            <div className="text-center p-3 border rounded">
                                              <i className="bi bi-clock text-dark mb-2"></i>
                                              <h6 className="mb-1 text-dark">Service Duration</h6>
                                              <span className="badge bg-dark">
                                                {calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns)} min
                                              </span>
                                            </div>
                                          </div>
                                          {bookingData.appointmentType === 'queue' ? (
                                            <>
                                              <div className="col-md-4">
                                                <div className="text-center p-3 border rounded">
                                                  <i className="bi bi-people text-dark mb-2"></i>
                                                  <h6 className="mb-1 text-dark">Queue Position</h6>
                                                  <span className="badge bg-dark">
                                                    #{queue?.queueCount ? queue.queueCount + 1 : 1}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="col-md-4">
                                                <div className="text-center p-3 border rounded">
                                                  <i className="bi bi-hourglass text-dark mb-2"></i>
                                                  <h6 className="mb-1 text-dark">Est. Wait Time</h6>
                                                  <span className="badge bg-dark">
                                                    {queue?.estimatedWait || 'Calculating...'} min
                                                  </span>
                                                </div>
                                              </div>
                                            </>
                                          ) : (
                                            <>
                                              <div className="col-md-4">
                                                <div className="text-center p-3 border rounded">
                                                  <i className="bi bi-calendar-check text-dark mb-2"></i>
                                                  <h6 className="mb-1 text-dark">Scheduled Time</h6>
                                                  <span className="badge bg-dark">
                                                    {bookingData.selectedTimeSlot ? convertTo12Hour(bookingData.selectedTimeSlot) : 'Not Set'}
                                                  </span>
                                                </div>
                                              </div>
                                              <div className="col-md-4">
                                                <div className="text-center p-3 border rounded">
                                                  <i className="bi bi-shield-check text-dark mb-2"></i>
                                                  <h6 className="mb-1 text-dark">Booking Type</h6>
                                                  <span className="badge bg-dark">
                                                    Scheduled
                                                  </span>
                                                </div>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {/* Intelligent Slot Suggestions */}
                                    <IntelligentQueueSlotsComponent
                                      barberId={bookingData.selectedBarber}
                                      date={bookingData.selectedDate}
                                      serviceDuration={calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns)}
                                      onSlotSelect={(slot) => {
                                        console.log('🎯 Selected intelligent queue slot:', slot);
                                        if (slot.type === 'intelligent_gap') {
                                          // Convert intelligent gap to scheduled appointment
                                          updateBookingData({
                                            appointmentType: 'scheduled',
                                            selectedTimeSlot: slot.time
                                          });
                                        } else if (slot.type === 'queue_position') {
                                          // Keep as queue appointment
                                          updateBookingData({
                                            appointmentType: 'queue',
                                            selectedTimeSlot: ''
                                          });
                                        }
                                      }}
                                    />
                                  </div>
                                
                                {/* Booking Details */}
                                <div className="col-12 col-md-6">
                                  <div className="bg-light p-4 rounded h-100 border">
                                    <h6 className="text-dark mb-3 fw-bold">
                                      <i className="bi bi-info-circle me-2"></i>
                                      <span className="d-none d-sm-inline">Booking Details</span>
                                      <span className="d-sm-none">Details</span>
                                    </h6>
                                    <div className="text-dark small">
                                      <div className="d-flex justify-content-between mb-3 align-items-center">
                                        <span className="d-flex align-items-center">
                                          <i className="bi bi-clock me-2 text-warning"></i>
                                          <span className="d-none d-sm-inline">Duration:</span>
                                          <span className="d-sm-none">Time:</span>
                                        </span>
                                        <span className="fw-bold text-dark fs-6">{calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns)} min</span>
                                      </div>
                                      {bookingData.selectedDate && (
                                        <div className="d-flex justify-content-between mb-3 align-items-center">
                                          <span className="d-flex align-items-center">
                                            <i className="bi bi-calendar me-2 text-info"></i>
                                            <span className="d-none d-sm-inline">
                                              {bookingData.appointmentType === 'queue' ? 'Queue Info:' : 'Estimated:'}
                                            </span>
                                            <span className="d-sm-none">
                                              {bookingData.appointmentType === 'queue' ? 'Queue:' : 'Time:'}
                                            </span>
                                          </span>
                                          <span className="fw-bold text-dark text-end fs-6">
                                            {bookingData.appointmentType === 'queue' ? (
                                              <>
                                                Your Position: #{getQueuePosition(bookingData.selectedBarber, bookingData.selectedDate) || 'TBD'}
                                                <br />
                                                <small className="text-dark">
                                                  <i className="bi bi-clock me-1"></i>
                                                  Wait time: {realTimeStatus.queueStatus?.estimatedWaitTime > 0 ? `${realTimeStatus.queueStatus.estimatedWaitTime} min` : 'No wait'}
                                                </small>
                                              </>
                                            ) : (
                                              `${estimatedStartTime} - ${estimatedEndTime}`
                                            )}
                                          </span>
                                        </div>
                                      )}
                                      <hr className="my-3 border-secondary" />
                                      <div className="d-flex justify-content-between align-items-center">
                                        <span className="fw-bold text-dark">Total Price:</span>
                                        <span className="fw-bold text-warning fs-4">₱{calculateTotal().toFixed(2)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Queue Information consolidated with Enhanced Section Above */}

                                {/* Current Serving */}
                                {barberQueues[bookingData.selectedBarber]?.current && (
                                  <div className="col-12">
                                    <div className="bg-success bg-opacity-25 p-4 rounded-3 text-center border border-success border-opacity-50">
                                      <div className="text-white fw-bold fs-5">
                                        <i className="bi bi-scissors me-2 text-success"></i>
                                        Now serving: Queue #{barberQueues[bookingData.selectedBarber].current.queue_position || 'N/A'}
                                      </div>
                                      <div className="text-light small mt-1">
                                        <i className="bi bi-clock me-1"></i>
                                        Service in progress
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                    

                      {/* Friend/Child Info */}
                      {bookingData.bookForFriend && (
                        <div className="row mb-3">
                          <div className="col-12">
                            <div className="alert alert-info border-0 shadow-sm">
                              <div className="d-flex align-items-center mb-2">
                                <i className="bi bi-person-check me-2 fs-5 text-info"></i>
                                <h6 className="mb-0 text-info fw-bold">Booking for Friend/Child</h6>
                              </div>
                              <div className="row g-2">
                                <div className="col-md-6">
                                  <div className="d-flex align-items-center">
                                    <i className="bi bi-person me-2 text-primary"></i>
                                    <span className="fw-bold text-dark me-2">Name:</span>
                                    <span className="badge bg-primary bg-opacity-25 text-primary px-3 py-2 rounded-pill">
                                      {bookingData.friendName}
                                    </span>
                                  </div>
                                </div>
                                <div className="col-md-6">
                                  <div className="d-flex align-items-center">
                                    <i className="bi bi-telephone me-2 text-success"></i>
                                    <span className="fw-bold text-dark me-2">Contact:</span>
                                    <span className="badge bg-success bg-opacity-25 text-success px-3 py-2 rounded-pill">
                                      {bookingData.friendPhone}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Total */}
                      <div className="row">
                        <div className="col-12">
                          <div className="bg-primary text-white p-4 rounded shadow-sm">
                            <div className="d-flex align-items-center justify-content-between">
                              <div className="d-flex align-items-center">
                                <i className="bi bi-calculator me-3 fs-4"></i>
                                <div>
                                  <h5 className="mb-0 fw-bold">Total Price</h5>
                                  <small className="opacity-75">Including all services & add-ons</small>
                                </div>
                              </div>
                              <div className="text-end">
                                <div className="fs-2 fw-bold">₱{calculateTotal().toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

                <hr className="my-4 my-lg-5" />

              {/* Enhanced Button Layout */}
              <div className="row g-3 mb-4">
                <div className="col-12 col-md-4 order-2 order-md-1">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-lg w-100 py-3"
                    onClick={() => window.history.back()}
                  >
                    <i className="bi bi-arrow-left me-2"></i>
                    Back
                  </button>
                </div>
                <div className="col-12 col-md-8 order-1 order-md-2">
                  <button
                    type="submit"
                    className="btn btn-success btn-lg w-100 py-3 fw-bold"
                    disabled={
                      loading || 
                    !bookingData.selectedBarber || 
                    bookingData.selectedServices.length === 0 || 
                    !bookingData.selectedDate ||
                    (bookingData.appointmentType === 'scheduled' && bookingData.selectedTimeSlot && 
                     wouldCrossLunchBreak(bookingData.selectedTimeSlot, calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns)))
                  }
                    onClick={onSubmit}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        {isRebooking ? 'Processing...' : 'Processing...'}
                      </>
                    ) : (
                      <>
                        <i className="bi bi-check-circle me-2"></i>
                        {isRebooking ? 'Confirm Reschedule Request' : 'Confirm Booking Request'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
  );
};


export default BookAppointment;