// components/customer/BookAppointment.js - Step-by-Step Booking Flow
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

import UnifiedSlotBookingService from '../../services/booking/UnifiedSlotBookingService';
import AdvancedHybridQueueService from '../../services/queue/AdvancedHybridQueueService';
import QueueTimeCalculator from '../../services/queue/QueueTimeCalculator';
import BarberAvailabilityService from '../../services/booking/BarberAvailabilityService';
import { friendBookingOTPService } from '../../services/auth/FriendBookingOTPService';
import {
  BOOKING_STATUS,
  APPOINTMENT_FIELDS,
  PRIORITY_LEVELS,
  QUEUE_SETTINGS
} from '../../constants/booking.constants';
import { formatPrice } from '../utils/helpers';
import logoImage from '../../assets/images/raf-rok-logo.png';

// Helper constants for friend email validation and initial verification state
const FRIEND_EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;


const createInitialFriendVerificationState = () => ({
  email: '',
  sent: false,
  verified: false,
  sending: false,
  verifying: false,
  error: '',
  success: '',
  expiresAt: null
});

// Helper function to convert 24-hour format to 12-hour format (accessible by all components)
const convertTo12Hour = (time24) => {
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${ampm}`;
};






const BookAppointment = () => {
  const styles = {
    colors: {
      black: '#000000',
      brown: '#5D4037', // Premium Brown
      white: '#FFFFFF',
      lightGray: '#F5F5F5',
      accentBrown: '#8B4513',
      textSecondary: '#6c757d'
    },
    cards: {
      base: {
        background: '#FFFFFF',
        borderRadius: '24px',
        border: '1px solid #E0E0E0',
        transition: 'all 0.3s ease',
        boxShadow: '0 4px 6px rgba(0,0,0,0.02)'
      },
      hover: {
        transform: 'translateY(-5px)',
        boxShadow: '0 12px 20px rgba(0,0,0,0.08)',
        borderColor: '#5D4037'
      }
    },
    buttons: {
      primary: {
        background: '#000000',
        color: '#FFFFFF',
        borderRadius: '50px',
        padding: '12px 24px',
        fontWeight: '700',
        border: 'none',
        transition: 'all 0.3s ease'
      },
      secondary: {
        background: '#5D4037',
        color: '#FFFFFF',
        borderRadius: '50px',
        padding: '12px 24px',
        fontWeight: '700',
        border: 'none'
      }
    }
  };

  // Step management
  const [currentStep, setCurrentStep] = useState(1);
  const [bookingData, setBookingData] = useState({
    selectedDate: '',
    appointmentType: 'queue', // Always queue - no scheduled appointments
    selectedTimeSlot: '', // No time slots for queue appointments
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
  const [authLoading, setAuthLoading] = useState(true);
  const [animateForm, setAnimateForm] = useState(false);

  // Rebooking states
  const [isRebooking, setIsRebooking] = useState(false);
  const [rebookingAppointment, setRebookingAppointment] = useState(null);

  // Additional states
  const [existingAppointment, setExistingAppointment] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedDetails, setSubmittedDetails] = useState(null);


  const [friendVerification, setFriendVerification] = useState(() => createInitialFriendVerificationState());

  const resetFriendVerification = useCallback(() => {
    setFriendVerification(createInitialFriendVerificationState());
  }, []);

  const sendFriendVerificationCode = useCallback(async (email, childName) => {
    const normalizedEmail = (email || '').trim().toLowerCase();

    setFriendVerification(prev => ({
      ...createInitialFriendVerificationState(),
      email: normalizedEmail,
      sending: true
    }));

    try {
      const result = await friendBookingOTPService.sendVerificationCode(normalizedEmail, {
        friendName: childName || null,
        requestedBy: user?.email || user?.user_metadata?.email || user?.user_metadata?.full_name || null
      });

      setFriendVerification(prev => ({
        ...prev,
        email: normalizedEmail,
        sending: false,
        sent: true,
        verified: false,
        error: '',
        success: `Verification code sent to ${normalizedEmail}.`,
        expiresAt: result?.expiresAt || null
      }));

      return { success: true };
    } catch (err) {
      setFriendVerification(prev => ({
        ...prev,
        email: normalizedEmail,
        sending: false,
        error: err.message || 'Failed to send verification code. Please try again.',
        success: ''
      }));
      return { success: false, error: err };
    }
  }, [user]);

  const verifyFriendVerificationCode = useCallback(async (email, code) => {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const trimmedCode = (code || '').trim();

    if (!trimmedCode) {
      setFriendVerification(prev => ({
        ...prev,
        email: normalizedEmail || prev.email,
        error: 'Please enter the verification code before verifying.'
      }));
      return false;
    }

    setFriendVerification(prev => ({
      ...prev,
      email: normalizedEmail || prev.email,
      verifying: true,
      error: '',
      success: ''
    }));

    try {
      await friendBookingOTPService.verifyCode(normalizedEmail, trimmedCode);

      setFriendVerification(prev => ({
        ...prev,
        email: normalizedEmail,
        verifying: false,
        verified: true,
        sent: true,
        error: '',
        success: 'Email verified successfully.'
      }));

      return true;
    } catch (err) {
      setFriendVerification(prev => ({
        ...prev,
        email: normalizedEmail || prev.email,
        verifying: false,
        error: err.message || 'Failed to verify code. Please try again.'
      }));
      return false;
    }
  }, []);

  const navigate = useNavigate();





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
    // Prevent synthetic events from being set as the step
    if (typeof step === 'number') {
      setCurrentStep(step);
    } else if (typeof step === 'string') {
      const parsed = parseInt(step);
      if (!isNaN(parsed)) setCurrentStep(parsed);
    }
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
        appointmentType: 'queue', // Always queue - no scheduled appointments
        selectedTimeSlot: '', // No time slots for queue appointments
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
        appointmentType: 'queue', // Always queue - no scheduled appointments
        selectedTimeSlot: '', // No time slots for queue appointments
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
        .in('status', ['scheduled', 'confirmed', 'pending', 'ongoing', 'completed']);

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


  // Generate time slots for 8AM-11:30AM and 1PM-4:30PM in 12-hour format with 30-minute intervals





  // Fetch data on component mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        setAuthLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch (err) {
        console.error('Error fetching user:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    fetchUser();
    fetchBarbersAndServices();


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
      // Fetch barbers (only active barbers - not archived)
      const { data: barbersData, error: barbersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone, barber_status, average_rating, total_ratings, skills, profile_picture_url')
        .eq('role', 'barber')
        .neq('archived', true)
        .order('full_name');

      if (barbersError) throw barbersError;
      setBarbers(Array.isArray(barbersData) ? barbersData : []);

      // Fetch services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (servicesError) throw servicesError;
      setServices(Array.isArray(servicesData) ? servicesData : []);

      // Fetch add-ons
      const { data: addOnsData, error: addOnsError } = await supabase
        .from('add_ons')
        .select('*')
        .eq('is_active', true)
        .order('price', { ascending: true });

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
    const maxQueueSize = 15; // Standardized queue capacity

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

    // Check if it overflows closing time
    if (estimatedEndTime > workingHours) return false;

    // Check if it bumps lunch (starts before 12 PM but ends after 12 PM)
    // totalQueueTime is minutes since 8:00 AM
    const lunchStartMinutes = 4 * 60; // 12:00 PM is 4 hours after 8:00 AM
    if (totalQueueTime < lunchStartMinutes && estimatedEndTime > lunchStartMinutes) {
      return false;
    }

    return true;
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



      const queues = {};
      const barbersToProcess = barbersList.length > 0 ? barbersList : barbers;

      console.log('👥 Barbers to process:', barbersToProcess);

      // Process barbers sequentially to handle async operations
      for (const barber of barbersToProcess) {
        const barberAppointments = queueData?.filter(apt => apt.barber_id === barber.id) || [];

        // Separate queue and scheduled appointments
        const queueAppointments = barberAppointments.filter(apt => apt.appointment_type === 'queue');
        const scheduledAppointments = barberAppointments.filter(apt => apt.appointment_type === 'scheduled');

        // Filter queue appointments by correct status (confirmed, ongoing, pending, scheduled)
        const activeQueueAppointments = queueAppointments.filter(apt =>
          ['confirmed', 'ongoing', 'pending', 'scheduled'].includes(apt.status)
        );

        // Total appointments ahead (including ongoing - for consistent position counting)
        const queueCount = activeQueueAppointments.length;
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

        // Use the unified QueueTimeCalculator for accurate, lunch-aware estimates
        const currentServiceDuration = (bookingData.selectedServices?.length > 0)
          ? calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns)
          : 30;

        const queueAnalysis = await QueueTimeCalculator.calculateQueueInfo(barber.id, dateToFetch, currentServiceDuration);
        const estimatedWait = queueAnalysis.estimatedWaitTime;

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
        const maxQueueSize = 15; // Standardized queue capacity // Maximum queue size
        const isFullyScheduled = remainingTime < minServiceDuration || queueAppointments.length >= maxQueueSize;

        // Check if barber is at full capacity (queue full OR fully scheduled OR service overflows closing time OR bumps lunch)
        const isFullCapacity = isFullyScheduled || 
                              (remainingTime < minServiceDuration && queueAppointments.length > 0) || 
                              queueAnalysis.isOverflowingWorkHours ||
                              queueAnalysis.wasPushedByLunch;

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
          remainingTime, // Remaining time in minutes
          wasPushedByLunch: queueAnalysis.wasPushedByLunch,
          availBeforeLunch: queueAnalysis.availBeforeLunch
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
        const currentAddOnsDuration = calculateAddOnsDuration(currentAppointment.add_ons_data);
        totalWaitTime += (currentServiceDuration + currentAddOnsDuration);
      }

      // Add wait time for each person in queue
      for (const appointment of queueAppointments) {
        if (appointment.status === 'ongoing') continue; // Skip current appointment (already counted)

        const serviceDuration = appointment.service?.duration || 30;
        const addOnsDuration = calculateAddOnsDuration(appointment.add_ons_data);
        totalWaitTime += (serviceDuration + addOnsDuration);
      }

      return Math.max(0, totalWaitTime); // Return 0 if negative
    } catch (error) {
      console.error('Error calculating estimated wait time:', error);
      return queueAppointments.length * 30; // Fallback to 30 minutes per person
    }
  };
  // Calculate add-ons duration (synchronous)
  const calculateAddOnsDuration = (addOnsData) => {
    try {
      if (!addOnsData) return 0;

      // Handle both array format (new) and JSON string format (old)
      let addOnItems;
      if (typeof addOnsData === 'string') {
        try {
          addOnItems = JSON.parse(addOnsData);
        } catch (e) {
          return 0;
        }
      } else if (Array.isArray(addOnsData)) {
        addOnItems = addOnsData;
      } else {
        return 0;
      }

      if (!Array.isArray(addOnItems) || addOnItems.length === 0) return 0;

      let totalDuration = 0;
      addOnItems.forEach(item => {
        // Try to find in state first
        const id = typeof item === 'object' ? (item.id || item) : item;
        const addon = addOns.find(a => a.id === id);

        if (addon) {
          totalDuration += addon.duration || 15;
        } else {
          totalDuration += 15; // Default fallback
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
          const addOnsDuration = calculateAddOnsDuration(appointment.add_ons_data);
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



  const calculateTotalDuration = (selectedServices, selectedAddOns, servicesList, addOnsList) => {
    const servicesDuration = selectedServices.reduce((total, serviceId) => {
      const service = servicesList.find(s => s.id === serviceId);
      return total + (service?.duration || 30); // Fixed: use 'duration' not 'duration_minutes'
    }, 0);

    // Use unified helper for add-ons duration
    const addOnsDuration = calculateAddOnsDuration(selectedAddOns);

    return servicesDuration + addOnsDuration;
  };





  // Check if a time slot + duration would conflict with existing appointments




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
        const isUnavailable = barber.barber_status === 'day_off' || barber.barber_status === 'offline' || barber.archived;
        if (isUnavailable) return false;

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
            `${rating}/5 rating`,
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


  // Check if a service would cross the lunch break (12:00 PM - 1:00 PM)
  const wouldCrossLunchBreak = (startTime, duration) => {
    if (!startTime) return false;
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + duration;

    // Lunch break is 12:00 PM (720 minutes) to 1:00 PM (780 minutes)
    const lunchStart = 12 * 60; // 720 minutes
    const lunchEnd = 13 * 60;   // 780 minutes

    // Check if service crosses lunch break
    return startMinutes < lunchEnd && endMinutes > lunchStart;
  };



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

      // First check comprehensive barber availability
      const availabilityCheck = await BarberAvailabilityService.checkBarberAvailability(barberId, date, selectedTimeSlot);

      if (!availabilityCheck.isAvailable) {
        // Provide specific error messages based on unavailability type
        let errorMessage = availabilityCheck.reason;

        if (availabilityCheck.type === 'day_off') {
          errorMessage = `${availabilityCheck.barberName} is on ${availabilityCheck.dayOffType?.replace('_', ' ')} from ${availabilityCheck.startDate} to ${availabilityCheck.endDate}. Please select a different barber or date.`;
        } else if (availabilityCheck.type === 'offline') {
          errorMessage = `${availabilityCheck.barberName} is currently offline. Please select a different barber.`;
        } else if (availabilityCheck.type === 'currently_busy') {
          errorMessage = `${availabilityCheck.barberName} is currently busy. Estimated available time: ${availabilityCheck.estimatedAvailableTime}. Please try again later or select a different barber.`;
        } else if (availabilityCheck.type === 'at_capacity') {
          errorMessage = `${availabilityCheck.barberName} is fully booked for this time slot. Next available time: ${availabilityCheck.nextAvailableTime}. Please select a different time or barber.`;
        } else if (availabilityCheck.type === 'outside_hours') {
          errorMessage = `Appointments are only available between 8:00 AM and 5:00 PM. Please select a different time.`;
        }

        throw new Error(errorMessage);
      }

      // Additional validation for scheduled appointments
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

      // First check comprehensive barber availability
      const availabilityCheck = await BarberAvailabilityService.checkBarberAvailability(barberId, date);

      if (!availabilityCheck.isAvailable) {
        // Provide specific error messages based on unavailability type
        let errorMessage = availabilityCheck.reason;

        if (availabilityCheck.type === 'day_off') {
          errorMessage = `${availabilityCheck.barberName} is on ${availabilityCheck.dayOffType?.replace('_', ' ')} from ${availabilityCheck.startDate} to ${availabilityCheck.endDate}. Please select a different barber or date.`;
        } else if (availabilityCheck.type === 'offline') {
          errorMessage = `${availabilityCheck.barberName} is currently offline. Please select a different barber.`;
        } else if (availabilityCheck.type === 'currently_busy') {
          errorMessage = `${availabilityCheck.barberName} is currently busy. Estimated available time: ${availabilityCheck.estimatedAvailableTime}. Please try again later or select a different barber.`;
        } else if (availabilityCheck.type === 'outside_hours') {
          errorMessage = `Queue appointments are only available during business hours (8:00 AM - 5:00 PM). Please try again during business hours.`;
        }

        throw new Error(errorMessage);
      }

      // Additional capacity check for queue appointments
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

      // Use SmartTimelineService to check if adding this appointment would exceed working hours
      const smartCheck = await import('../../services/queue/SmartTimelineService').then(m => m.default);
      const customerServiceDuration = serviceDuration || 40; // Use provided service duration or default
      const queueAcceptance = await smartCheck.canAcceptQueueBooking(barberId, date, customerServiceDuration);

      const wouldExceedWorkingHours = !queueAcceptance.canAccept;

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
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
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
    } finally {
      setIsRefreshing(false);
    }
  };
  // Make updateQueueStatus available globally
  window.updateQueueStatus = updateQueueStatus;


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
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
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
      const result = convertTo12Hour(nextAvailableTime);
      console.log(`🔍 getNextAvailableSlot - Next available: ${result} (${serviceDuration} min service)`);

      return result;

    } catch (error) {
      console.error('Error in getNextAvailableSlot:', error);
      return 'N/A';
    }
  };

  // Make it available globally
  window.getNextAvailableSlot = getNextAvailableSlot;




  // Test function for queue vs scheduled conflict scenario




  // Send hybrid system queue update notification to customer
  const sendHybridQueueUpdateNotification = async (queueStatus, payload) => {
    try {
      const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');

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
        } else if (oldStatus === 'ongoing' && newStatus === 'completed') {
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
      const { default: UnifiedSlotBookingService } = await import('../../services/booking/UnifiedSlotBookingService');

      for (const barber of barbers) {
        if (barber.barber_status === 'day_off' || barber.barber_status === 'offline' || barber.archived) {
          continue;
        }

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
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
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

      if (bookingData.bookForFriend) {
        const normalizedFriendEmail = (bookingData.friendEmail || '').trim().toLowerCase();
        if (!normalizedFriendEmail) {
          setError('Child email address is required for double booking.');
          setLoading(false);
          setCurrentStep(1);
          return;
        }

        if (!FRIEND_EMAIL_REGEX.test(normalizedFriendEmail)) {
          setError('Please enter a valid child email address.');
          setLoading(false);
          setCurrentStep(1);
          return;
        }

        if (!friendVerification.verified || friendVerification.email !== normalizedFriendEmail) {
          setError('Please verify the child email address before completing the booking.');
          setLoading(false);
          setCurrentStep(1);
          return;
        }
      }

      // Validation checks
      if (!user) {
        throw new Error('User not logged in');
      }

      // Final double-booking check if not booking for a friend
      if (!bookingData.bookForFriend) {
        const { data: existingApts } = await supabase
          .from('appointments')
          .select('id')
          .eq('customer_id', user.id)
          .eq('appointment_date', bookingData.selectedDate)
          .in('status', ['scheduled', 'confirmed', 'pending', 'ongoing', 'completed']);

        if (existingApts && existingApts.length > 0) {
          throw new Error('You already have an appointment for this date (active or completed). You can only book once per day for yourself.');
        }
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

      // No time slot validation needed - queue appointments don't require time slots

      if (bookingData.selectedServices.length === 0) {
        throw new Error('No services selected');
      }

      // No lunch break conflict check needed - queue appointments are automatically scheduled around lunch break

      console.log('✅ Validation passed, proceeding with Advanced Hybrid Queue booking...');

      // Always use queue appointments - no scheduled appointments
      // Use the appointment type from booking data (defaults to queue)
      const appointmentType = bookingData.appointmentType || 'queue';

      // No time slot conflict check needed - queue appointments are automatically scheduled
      if (false) {
        const { data: existingAppointments } = await supabase
          .from('appointments')
          .select('id')
          .eq('barber_id', bookingData.selectedBarber)
          .eq('appointment_date', bookingData.selectedDate)
          .eq('appointment_time', bookingData.selectedTimeSlot)
          .in('status', ['scheduled', 'confirmed', 'ongoing']);

        if (existingAppointments && existingAppointments.length > 0) {
          throw new Error('Time slot is already booked. Please select a different time.');
        }
      }

      // CRITICAL: Check barber capacity and working hours boundaries
      await validateBarberCapacityAndBoundaries(bookingData.selectedBarber, bookingData.selectedDate, appointmentType, bookingData.selectedTimeSlot);

      // Final strict check for lunch and closing using QueueTimeCalculator
      const serviceDurationForSubmit = calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns);
      const queueInfoForSubmit = await QueueTimeCalculator.calculateQueueInfo(
        bookingData.selectedBarber,
        bookingData.selectedDate,
        serviceDurationForSubmit,
        bookingData.isUrgent || false,
        user?.id
      );

      if (queueInfoForSubmit.isOverflowingWorkHours) {
        throw new Error('This appointment cannot be booked because it exceeds closing time (5:00 PM).');
      }

      if (queueInfoForSubmit.wasPushedByLunch) {
        throw new Error('This appointment cannot be booked because it conflicts with the lunch break (12:00 PM - 1:00 PM).');
      }

      // For queue appointments, check if barber has any availability at all
      await validateBarberQueueAvailability(bookingData.selectedBarber, bookingData.selectedDate);

      console.log('🎯 Final appointment type:', appointmentType, 'Time slot:', bookingData.selectedTimeSlot);

      // Final Price Calculation for Database Submission
      const servicesDbTotal = bookingData.selectedServices.reduce((total, serviceId) => {
        const service = services.find(s => s.id === serviceId);
        return total + (service?.price || 0);
      }, 0);

      const addOnsDbTotal = bookingData.selectedAddOns.reduce((total, addonId) => {
        const addon = addOns.find(a => a.id === addonId);
        return total + (addon?.price || 0);
      }, 0);

      const urgentDbFee = bookingData.isUrgent ? (QUEUE_SETTINGS.URGENT_FEE || 100) : 0;
      const finalDbTotalPrice = servicesDbTotal + addOnsDbTotal + urgentDbFee;

      // Calculate the estimated 24-hour time for the queue appointment
      let calculatedTime = bookingData.selectedTimeSlot || null;
      if (appointmentType === 'queue') {
        try {
          const { data: qAppointments } = await supabase
            .from('appointments')
            .select('*')
            .eq('barber_id', bookingData.selectedBarber)
            .eq('appointment_date', bookingData.selectedDate)
            .in('status', ['confirmed', 'ongoing', 'pending', 'scheduled']);

          const now = new Date();

          let baseMinutes = 8 * 60; // Default to 8:00 AM
          if (bookingData.selectedDate) {
            const dateToBook = new Date(bookingData.selectedDate);
            const isToday = dateToBook.toDateString() === now.toDateString();
            if (isToday) {
              const currentTime = now.getHours() * 60 + now.getMinutes();
              baseMinutes = Math.max(8 * 60, currentTime); // Don't go earlier than 8:00 AM
            }
          }
          let latestEnd = baseMinutes;

          for (const apt of qAppointments || []) {
            if (apt.appointment_time) {
              const [h, m] = apt.appointment_time.split(':').map(Number);
              const endM = h * 60 + m + (apt.total_duration || 30);
              if (endM > latestEnd) {
                latestEnd = endM;
              }
            }
          }

          // Format to HH:MM format
          const hours = Math.floor(latestEnd / 60);
          const mins = latestEnd % 60;
          calculatedTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        } catch (e) {
          console.error('Error computing calculated time', e);
        }
      }

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
        [APPOINTMENT_FIELDS.APPOINTMENT_TIME]: calculatedTime, // Setting calculated estimated start time for queue
        [APPOINTMENT_FIELDS.APPOINTMENT_TYPE]: appointmentType,
        [APPOINTMENT_FIELDS.PRIORITY_LEVEL]: bookingData.isUrgent ? PRIORITY_LEVELS.URGENT : PRIORITY_LEVELS.NORMAL,
        [APPOINTMENT_FIELDS.STATUS]: BOOKING_STATUS.PENDING, // ALL appointments start as pending and require manager/barber confirmation
        [APPOINTMENT_FIELDS.TOTAL_PRICE]: finalDbTotalPrice,
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
        // Skip generic alert message and set up the details for the Success Modal
        setSubmittedDetails({
          barberName: barbers.find(b => b.id === bookingData.selectedBarber)?.full_name || 'Selected Barber',
          serviceName: services.find(s => s.id === bookingData.selectedServices[0])?.name || 'Haircut Service',
          date: bookingData.selectedDate,
          time: calculatedTime || 'Queue',
          queuePosition: result.queue_position,
          totalPrice: finalDbTotalPrice
        });
        
        // Show modal and skip automatic redirect
        setShowSuccessModal(true);

        resetFriendVerification();

        // Email confirmation removed - using push notifications only

        // Do NOT create booking confirmation notification here for customers to avoid duplicates.
        // Confirmation notifications are sent to customers ONLY upon approval by barber/manager.

        // Notify barber and managers of new booking
        try {
          const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');

          const serviceId = bookingData.selectedServices[0];
          const service = services.find(s => s.id === serviceId);
          const serviceName = service ? service.name : 'Service';
          const customerName = bookingData.bookForFriend
            ? bookingData.friendName
            : (user?.user_metadata?.full_name || user?.email || 'A customer');

          await centralizedNotificationService.createNewBookingNotification({
            barberId: bookingData.selectedBarber,
            customerName,
            serviceName,
            appointmentId: result.appointment_id,
            appointmentType: bookingData.appointmentType,
            appointmentTime: bookingData.selectedTimeSlot
          });
          console.log('✅ Barber and Managers notified of new booking');
        } catch (notifError) {
          console.warn('⚠️ Failed to notify barber/manager of new booking:', notifError);
        }

        // Do not auto navigate - user clicks button on modal.

        console.log('✅ Advanced Hybrid Queue booking completed successfully');

        // Clear haircut recommendation data from localStorage after successful booking
        localStorage.removeItem('specialRequest');
        localStorage.removeItem('selectedHaircutStyle');
      } else {
        // If the service returned failure, throw the error to be caught by the catch block below
        throw new Error(result.error || 'The booking system encountered an error. Please try again.');
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

  if (authLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100 bg-white">
        <div className="text-center">
          <div className="spinner-border text-dark mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted fw-medium">Verifying your session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container-fluid vh-100 d-flex align-items-center justify-content-center" style={{ background: '#F8F9FA' }}>
        <div className="col-12 col-md-6 col-lg-4">
          <div className="card border-0 shadow-lg p-5 text-center rounded-5">
            <div className="bg-light rounded-circle p-4 mb-4 d-inline-block shadow-sm">
              <i className="bi bi-person-lock fs-1" style={{ color: '#5D4037' }}></i>
            </div>
            <h3 className="fw-800 mb-3 text-dark">Login Required</h3>
            <p className="text-muted mb-4 fs-6">Please log in to your account to book an appointment and manage your schedule.</p>
            <button
              className="btn btn-dark btn-lg w-100 py-3 rounded-pill fw-bold shadow-sm"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </button>
            <button
              className="btn btn-link mt-3 text-decoration-none text-muted small fw-medium"
              onClick={() => navigate('/')}
            >
              <i className="bi bi-arrow-left me-2"></i>Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="container-fluid px-2 px-md-4 py-3 py-md-5 booking-step-container" style={{ background: '#FFFFFF', minHeight: '100vh' }}>
      <style>{`
        :root {
          --premium-black: #000000;
          --premium-brown: #5D4037;
          --premium-light-gray: #F5F5F5;
          --premium-white: #FFFFFF;
        }

        .booking-step-container {
          font-family: 'Outfit', 'Inter', sans-serif !important;
        }

        h1, h2, h3, h4, h5, h6, .display-1, .display-2, .display-3, .display-4, .display-5, .display-6 {
          font-family: 'Outfit', 'Inter', sans-serif !important;
        }

        .btn-dark, .btn-primary {
          background-color: var(--premium-black) !important;
          border-color: var(--premium-black) !important;
          color: var(--premium-white) !important;
          border-radius: 50px !important;
          font-weight: 600 !important;
          transition: all 0.3s ease !important;
        }

        .btn-dark:hover, .btn-primary:hover {
          background-color: var(--premium-brown) !important;
          border-color: var(--premium-brown) !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .btn-outline-primary {
          color: var(--premium-black) !important;
          border-color: var(--premium-black) !important;
          border-radius: 50px !important;
        }

        .btn-outline-primary:hover {
          background-color: var(--premium-black) !important;
          color: var(--premium-white) !important;
        }

        .text-primary {
          color: var(--premium-brown) !important;
        }

        .bg-primary {
          background-color: var(--premium-brown) !important;
        }

        .card {
          border-radius: 20px !important;
          border: 1px solid rgba(0,0,0,0.05) !important;
          transition: all 0.3s ease !important;
        }

        .barber-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 12px 24px rgba(0,0,0,0.1) !important;
          border-color: var(--premium-brown) !important;
        }

        .progress-bar {
          background: linear-gradient(90deg, var(--premium-black) 0%, var(--premium-brown) 100%) !important;
        }

        .step-indicator {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          margin-bottom: 10px;
          transition: all 0.3s ease;
          cursor: pointer;
        }
        .step-indicator:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 12px rgba(93, 64, 55, 0.2);
        }

        .step-active {
          background-color: var(--premium-black);
          color: white;
          box-shadow: 0 0 0 4px rgba(93, 64, 55, 0.2);
        }

        .step-inactive {
          background-color: var(--premium-light-gray);
          color: #999;
        }

        .form-control:focus {
          border-color: var(--premium-brown) !important;
          box-shadow: 0 0 0 0.25rem rgba(93, 64, 55, 0.1) !important;
        }

        .badge-premium {
          background-color: var(--premium-light-gray);
          color: var(--premium-black);
          border: 1px solid rgba(0,0,0,0.1);
          border-radius: 50px;
          padding: 6px 14px;
          font-weight: 600;
        }
      `}</style>

      <div className="container-fluid">
        {/* Book for a Child */}
        <div className="row mb-4 mb-lg-5">
          <div className="col">
            <div className="card border-0 shadow-sm" style={{ background: '#FFFFFF', borderRadius: '24px' }}>
              <div className="card-body py-4 py-lg-4">
                {/* Mobile Layout */}
                <div className="d-block d-md-none">
                  <div className="text-center mb-3">
                    <div className="bg-white rounded-circle p-2 d-inline-block shadow-sm mb-2 border" style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={logoImage}
                        alt="Raf & Rox"
                        style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }}
                      />
                    </div>
                    <h5 className="mb-1 text-dark fw-bold">
                      {isRebooking ? 'Reschedule Appointment' : 'Book Appointment'}
                    </h5>
                    <div className="d-flex justify-content-center gap-2 mt-2">
                      <span 
                        className={`badge ${currentStep === 1 ? 'step-active' : 'step-inactive'} step-indicator`}
                        onClick={() => goToStep(1)}
                        style={{ cursor: 'pointer' }}
                      >1</span>
                      <span 
                        className={`badge ${currentStep === 2 ? 'step-active' : 'step-inactive'} step-indicator`}
                        onClick={() => goToStep(2)}
                        style={{ cursor: 'pointer' }}
                      >2</span>
                      <span 
                        className={`badge ${currentStep === 3 ? 'step-active' : 'step-inactive'} step-indicator`}
                        onClick={() => goToStep(3)}
                        style={{ cursor: 'pointer' }}
                      >3</span>
                    </div>
                    <small className="text-secondary fw-bold text-uppercase mt-2 d-block" style={{ letterSpacing: '1px' }}>
                      {currentStep}. {getStepTitle(currentStep)}
                    </small>
                  </div>
                </div>

                <div className="d-none d-md-flex align-items-center justify-content-between px-4">
                  <div className="d-flex align-items-center">
                    <div className="bg-white rounded-circle p-2 me-4 shadow-sm border" style={{ width: '75px', height: '75px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={logoImage}
                        alt="Raf & Rok"
                        style={{ maxWidth: '85%', maxHeight: '85%', objectFit: 'contain' }}
                      />
                    </div>
                    <div>
                      <h3 className="mb-1 text-dark fw-800">
                        {isRebooking ? 'Reschedule Appointment' : 'Book Appointment'}
                      </h3>
                      <p className="text-secondary fw-medium mb-0 fs-5">
                        {currentStep}. {getStepTitle(currentStep)}
                      </p>
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-4">
                    <div className="d-flex gap-3">
                      <div className="text-center" onClick={() => goToStep(1)} style={{ cursor: 'pointer' }}>
                        <div className={`step-indicator ${currentStep === 1 ? 'step-active' : 'step-inactive'} mx-auto`}>1</div>
                        <small className="fw-bold extra-small text-uppercase">1 Setup</small>
                      </div>
                      <div className="text-center" onClick={() => goToStep(2)} style={{ cursor: 'pointer' }}>
                        <div className={`step-indicator ${currentStep === 2 ? 'step-active' : 'step-inactive'} mx-auto`}>2</div>
                        <small className="fw-bold extra-small text-uppercase">2 Services</small>
                      </div>
                      <div className="text-center" onClick={() => goToStep(3)} style={{ cursor: 'pointer' }}>
                        <div className={`step-indicator ${currentStep === 3 ? 'step-active' : 'step-inactive'} mx-auto`}>3</div>
                        <small className="fw-bold extra-small text-uppercase">3 Review</small>
                      </div>
                    </div>
                    <div className="bg-light rounded-pill px-2 py-1 shadow-sm ms-3" style={{ width: '150px' }}>
                      <div className="progress" style={{ height: '6px' }}>
                        <div
                          className="progress-bar"
                          style={{
                            width: `${(currentStep / 3) * 100}%`
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
                <div className="alert border-0 m-3 mb-0 fade show" role="alert" style={{ background: '#FFF5F5', borderLeft: '4px solid #DC3545', borderRadius: '12px' }}>
                  <div className="d-flex align-items-center">
                    <i className="bi bi-exclamation-triangle-fill me-2 fs-5" style={{ color: '#DC3545' }}></i>
                    <div className="text-dark fw-medium small">{error}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-close small"
                    onClick={() => setError('')}
                    style={{ fontSize: '0.7rem' }}
                  ></button>
                </div>
              )}

              {success && (
                <div className="alert border-0 m-3 mb-0 fade show" role="alert" style={{ background: '#F8F9FA', borderLeft: '4px solid #5D4037', borderRadius: '12px' }}>
                  <div className="d-flex align-items-center">
                    <i className="bi bi-check-circle-fill me-2 fs-5" style={{ color: '#5D4037' }}></i>
                    <div className="text-dark fw-medium small">{success}</div>
                  </div>
                  <button
                    type="button"
                    className="btn-close small"
                    onClick={() => setSuccess('')}
                    style={{ fontSize: '0.7rem' }}
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
                  fetchBarberQueues={fetchBarberQueues}
                  queueStatus={queueStatus}
                  updateQueueStatus={updateQueueStatus}
                  calculateTotalDuration={calculateTotalDuration}
                  wouldCrossLunchBreak={wouldCrossLunchBreak}


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
                  // Child email OTP helpers
                  friendVerification={friendVerification}
                  onSendFriendVerification={sendFriendVerificationCode}
                  onVerifyFriendVerification={verifyFriendVerificationCode}
                  onResetFriendVerification={resetFriendVerification}
                />}

                {currentStep === 2 && <Step2ServicesAndAddons
                  bookingData={bookingData}
                  updateBookingData={updateBookingData}
                  onNext={nextStep}
                  onPrev={prevStep}
                  services={services}
                  addOns={addOns}
                  calculateTotalDuration={calculateTotalDuration}
                  barberQueues={barberQueues}
                  canBarberAccommodateService={canBarberAccommodateService}
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
        onEdit={() => goToStep(2)}
        barbers={barbers}
        services={services}
        addOns={addOns}
        barberQueues={barberQueues}
        user={user}
        isRebooking={isRebooking}
        rebookingAppointment={rebookingAppointment}
        onSubmit={handleBookingSubmit}
        loading={loading}
        calculateTotalDuration={calculateTotalDuration}
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
        friendVerification={friendVerification}
        onSendFriendVerification={sendFriendVerificationCode}
        onVerifyFriendVerification={verifyFriendVerificationCode}
        onResetFriendVerification={resetFriendVerification}
        onLoadAlternatives={loadAlternativeBarbers}
      />}

      {/* Success Modal */}
      {showSuccessModal && submittedDetails && (
        <div className="modal-backdrop fade show" style={{ zIndex: 1055, background: 'rgba(0,0,0,0.6)' }} onClick={() => navigate('/appointments')}></div>
      )}
      {showSuccessModal && submittedDetails && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1056 }}>
          <div className="modal-dialog modal-dialog-centered modal-sm px-2">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '24px', overflow: 'hidden' }}>
              <div className="modal-body p-4 p-md-5 text-center bg-white">
                <div className="mb-4">
                  <div className="bg-success bg-opacity-10 rounded-circle d-inline-flex align-items-center justify-content-center" style={{ width: '80px', height: '80px' }}>
                    <i className="bi bi-calendar-check-fill text-success" style={{ fontSize: '2.5rem' }}></i>
                  </div>
                </div>
                <h3 className="fw-900 text-dark mb-2" style={{ letterSpacing: '-0.5px' }}>Booked!</h3>
                <p className="text-muted small mb-4">Your appointment was queued successfully.</p>
                
                <div className="bg-light rounded-4 p-3 text-start mb-4">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-muted extra-small">Barber</span>
                    <span className="fw-bold small text-truncate ms-3 text-end">{submittedDetails.barberName}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-muted extra-small">Service</span>
                    <span className="fw-bold small text-truncate ms-3 text-end">{submittedDetails.serviceName}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-muted extra-small">Date</span>
                    <span className="fw-bold small">{new Date(submittedDetails.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  </div>
                  {submittedDetails.queuePosition ? (
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="text-muted extra-small">Queue Position</span>
                        <span className="fw-bold small px-2 py-1 rounded bg-warning bg-opacity-25 text-dark" style={{fontSize: '0.7rem'}}>#{submittedDetails.queuePosition}</span>
                      </div>
                  ) : null}
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="text-muted extra-small">Est. Start</span>
                    <span className="fw-bold small">{submittedDetails.time && submittedDetails.time !== 'Queue' ? convertTo12Hour(submittedDetails.time) : 'TBD'}</span>
                  </div>
                  <hr className="my-2 border-secondary opacity-10" />
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-dark fw-bold small">Total</span>
                    <span className="fw-900 fs-5" style={{ color: '#5D4037' }}>{formatPrice(submittedDetails.totalPrice)}</span>
                  </div>
                </div>

                <button 
                  className="btn btn-dark w-100 rounded-pill py-3 fw-bold shadow-sm"
                  onClick={() => {
                    setShowSuccessModal(false);
                    navigate('/appointments');
                  }}
                  style={{ background: '#1a1a1a', border: 'none' }}
                >
                  View Details
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
  fetchBarberQueues,
  queueStatus,
  updateQueueStatus,
  calculateTotalDuration,
  wouldCrossLunchBreak,


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
  canBarberAccommodateService,
  friendVerification,
  onSendFriendVerification,
  onVerifyFriendVerification,
  onResetFriendVerification
}) => {
  const [selectedDate, setSelectedDate] = useState(bookingData.selectedDate || '');
  const [appointmentType] = useState('queue'); // Always queue - no scheduled appointments
  const [selectedTimeSlot] = useState(''); // No time slot for queue appointments
  const [selectedBarber, setSelectedBarber] = useState(bookingData.selectedBarber || '');
  const [bookForFriend, setBookForFriend] = useState(bookingData.bookForFriend || false);
  const [friendName, setFriendName] = useState(bookingData.friendName || '');
  const [friendPhone, setFriendPhone] = useState(bookingData.friendPhone || '');
  const [friendEmail, setFriendEmail] = useState(bookingData.friendEmail || '');
  const [checkingAppointment, setCheckingAppointment] = useState(false);
  const [friendEmailError, setFriendEmailError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [expandedProfileBarber, setExpandedProfileBarber] = useState(null);

  const normalizedFriendEmail = friendEmail.trim().toLowerCase();
  const isFriendEmailValid = FRIEND_EMAIL_REGEX.test(normalizedFriendEmail);
  const isOtpSectionVisible = bookForFriend && friendVerification?.sent && friendVerification.email === normalizedFriendEmail && !friendVerification?.verified;
  const isFriendEmailVerified = bookForFriend && friendVerification?.verified && friendVerification.email === normalizedFriendEmail;

  useEffect(() => {
    if (!bookForFriend) {
      setOtpCode('');
      setFriendEmailError('');
      setOtpError('');
    }
  }, [bookForFriend]);

  useEffect(() => {
    setFriendEmailError('');
    setOtpError('');
  }, [friendEmail]);

  useEffect(() => {
    if (!bookForFriend) return;

    const normalized = friendEmail.trim().toLowerCase();

    if (!normalized) {
      if (friendVerification?.email) {
        onResetFriendVerification?.();
      }
      return;
    }

    if (friendVerification?.email && friendVerification.email !== normalized) {
      onResetFriendVerification?.();
    }
  }, [bookForFriend, friendEmail, friendVerification?.email, onResetFriendVerification]);

  const handleBookForFriendChange = (checked) => {
    setBookForFriend(checked);
    updateBookingData({ bookForFriend: checked });

    if (!checked) {
      setFriendName('');
      setFriendPhone('');
      setFriendEmail('');
      setOtpCode('');
      setFriendEmailError('');
      setOtpError('');
      onResetFriendVerification?.();
    }
  };

  const handleFriendNameChange = (value) => {
    setFriendName(value);
    updateBookingData({ friendName: value });
  };

  const handleFriendPhoneChange = (value) => {
    // Ensure the value starts with +63 and only contains digits after that
    let digits = '';

    if (value.startsWith('+63')) {
      digits = value.substring(3).replace(/\D/g, '');
    } else {
      digits = value.replace(/\D/g, '');
      // If starts with 0 (traditional PH format), strip it and add +63
      if (digits.startsWith('0')) {
        digits = digits.substring(1);
      } else if (digits.startsWith('63')) {
        digits = digits.substring(2);
      }
    }

    // Enforce that it must start with 9
    if (digits.length > 0 && digits[0] !== '9') {
      digits = '';
    }

    // Limit to 10 digits
    digits = digits.substring(0, 10);

    setFriendPhone(digits.length > 0 ? '+63' + digits : '');
    updateBookingData({ friendPhone: digits.length > 0 ? '+63' + digits : '' });
  };

  const handleFriendEmailChange = (value) => {
    setFriendEmail(value);
    updateBookingData({ friendEmail: value });
  };

  const handleSendVerificationClick = async () => {
    const trimmedEmail = friendEmail.trim();

    if (!trimmedEmail) {
      setFriendEmailError('Child email address is required.');
      return;
    }

    if (!FRIEND_EMAIL_REGEX.test(trimmedEmail)) {
      setFriendEmailError('Please enter a valid child email address.');
      return;
    }

    setOtpError('');

    if (!onSendFriendVerification) {
      setOtpError('Unable to send verification code at this time.');
      return;
    }

    const result = await onSendFriendVerification(trimmedEmail, friendName);

    if (!result?.success) {
      setOtpError(friendVerification?.error || 'Failed to send verification code. Please try again.');
    } else {
      setOtpCode('');
    }
  };

  const handleVerifyOTPClick = async () => {
    const trimmedEmail = friendEmail.trim();
    const trimmedCode = otpCode.trim();

    if (!trimmedEmail) {
      setFriendEmailError('Child email address is required.');
      return;
    }

    if (!FRIEND_EMAIL_REGEX.test(trimmedEmail)) {
      setFriendEmailError('Please enter a valid child email address.');
      return;
    }

    if (!trimmedCode) {
      setOtpError('Please enter the verification code.');
      return;
    }

    if (!onVerifyFriendVerification) {
      setOtpError('Unable to verify code at this time.');
      return;
    }

    const success = await onVerifyFriendVerification(trimmedEmail, trimmedCode);

    if (!success) {
      setOtpError(friendVerification?.error || 'Failed to verify the code. Please try again.');
    } else {
      setOtpError('');
    }
  };

  // Barber availability warning state
  const [barberAvailability, setBarberAvailability] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  // Track availability for each barber
  const [barberAvailabilityStatus, setBarberAvailabilityStatus] = useState({});
  const [showQueueDetails, setShowQueueDetails] = useState({});
  const [showAvailability, setShowAvailability] = useState(true);
  const [dateValidationMessage, setDateValidationMessage] = useState('');
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState('Loading...');

  // Load estimated arrival time when barber is selected
  useEffect(() => {
    const loadEstimatedArrivalTime = async () => {
      if (selectedBarber && barberQueues && selectedDate) {
        try {
          // For queue appointments, show queue position and wait time
          const queueInfo = barberQueues[selectedBarber];
          if (queueInfo) {
            const queuePosition = (queueInfo.queueCount || 0) + 1; // Next position
            const waitTime = queueInfo.estimatedWait || 0;

            if (queuePosition === 1) {
              setEstimatedArrivalTime('Next in line');
            } else {
              setEstimatedArrivalTime(`Position #${queuePosition} (${waitTime} min wait)`);
            }
          } else {
            setEstimatedArrivalTime('Position #1');
          }
        } catch (error) {
          console.error('Error loading estimated arrival time:', error);
          setEstimatedArrivalTime('N/A');
        }
      }
    };

    loadEstimatedArrivalTime();
  }, [selectedBarber, barberQueues, selectedDate]);



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
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      setSelectedDate(tomorrowStr);
      setDateValidationMessage('⚠️ Cannot book for today after 4:30 PM. Date has been set to tomorrow.');
      return;
    }

    setSelectedDate(date);
    setCheckingAppointment(true);

    // Check for existing appointment
    const hasExisting = await checkExistingAppointment(date);
    setCheckingAppointment(false);

    // No time slot reset needed - queue appointments don't use time slots
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

  // Helper function to check if a specific time is in the past
  const isTimeInPast = (date, time) => {
    if (!date || !time) return false;

    const selectedDateTime = new Date(`${date} ${time}`);
    const now = new Date();

    return selectedDateTime < now;
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

      // Final strict capacity and lunch check before proceeding to services
      if (selectedBarber) {
        const queue = barberQueues[selectedBarber];
        const availability = barberAvailabilityStatus[selectedBarber];

        // Use a standard duration check for initial gatekeeping
        const defaultDuration = 30;
        const canAccommodate = canBarberAccommodateService ? canBarberAccommodateService(queue, defaultDuration) : false;

        if (availability && !availability.isAvailable) {
          setError(`Barber is currently unavailable: ${availability.reason || 'Offline'}`);
          return;
        }

        if (queue && (!canAccommodate || queue.isFullCapacity)) {
          setError('This barber is at full capacity or cannot accommodate more services before closing. Please select a different barber.');
          return;
        }
      }
    }

    // Check for existing appointment before proceeding
    if (existingAppointment && !bookForFriend) {
      setError('You already have an appointment on this date (including completed ones). You can only book once per day for yourself.');
      return;
    }

    // Check if barber is selected
    if (!selectedBarber) {
      setError('Please select a barber before proceeding.');
      return;
    }

    // No time slot validation needed - queue appointments don't require time slots

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

  // Check barber availability for selected date
  const checkBarberAvailability = async (barberId, date) => {
    if (!barberId || !date) {
      setBarberAvailability(null);
      return;
    }

    try {
      setCheckingAvailability(true);
      console.log('🔍 Checking barber availability for warning:', { barberId, date });

      const availability = await BarberAvailabilityService.checkBarberAvailability(barberId, date);
      console.log('📊 Barber availability result:', availability);

      setBarberAvailability(availability);
    } catch (error) {
      console.error('❌ Error checking barber availability:', error);
      setBarberAvailability(null);
    } finally {
      setCheckingAvailability(false);
    }
  };

  // Check availability for all barbers when date changes
  const checkAllBarbersAvailability = async (date) => {
    if (!date || !barbers || barbers.length === 0) return;

    console.log('🔍 Checking availability for all barbers on date:', date);

    const availabilityPromises = barbers.map(async (barber) => {
      try {
        const availability = await BarberAvailabilityService.checkBarberAvailability(barber.id, date);
        return { barberId: barber.id, availability };
      } catch (error) {
        console.error(`❌ Error checking availability for barber ${barber.id}:`, error);
        return { barberId: barber.id, availability: { isAvailable: true } };
      }
    });

    const results = await Promise.all(availabilityPromises);
    const availabilityMap = {};

    results.forEach(({ barberId, availability }) => {
      availabilityMap[barberId] = availability;
    });

    setBarberAvailabilityStatus(availabilityMap);
    console.log('📊 All barbers availability status:', availabilityMap);
  };

  // Check availability when date or barber changes
  useEffect(() => {
    if (selectedBarber && selectedDate) {
      checkBarberAvailability(selectedBarber, selectedDate);
    }
  }, [selectedBarber, selectedDate]);

  // Check all barbers availability when date changes
  useEffect(() => {
    if (selectedDate && barbers && barbers.length > 0) {
      checkAllBarbersAvailability(selectedDate);
    }
  }, [selectedDate, barbers]);

  // Barber selection functions
  const handleBarberSelect = async (barberId) => {
    if (selectedBarber === barberId) {
      setSelectedBarber('');
      return;
    }
    setSelectedBarber(barberId);
    setShowRecommendations(false);

    console.log('🎯 Barber selected:', barberId, 'Date:', selectedDate);

    // Check availability for the selected barber and date
    if (selectedDate) {
      checkBarberAvailability(barberId, selectedDate);
    }

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



    // No time slot loading needed - queue appointments don't use time slots
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
    <div className="card-body p-3 p-md-4">
      <div className="d-flex align-items-center mb-4">
        <div className="bg-white p-1 rounded-circle me-3 shadow-sm border" style={{ width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <img
            src={logoImage}
            alt="RAF & ROX"
            style={{ maxWidth: '80%', maxHeight: '80%', objectFit: 'contain' }}
          />
        </div>
        <div>
          <h4 className="mb-0 fw-bold text-dark">Select Date & Barber</h4>
          <p className="text-muted small mb-0">Choose when and with whom you'd like your service</p>
        </div>
      </div>

      {/* Existing Appointment Alert */}
      {existingAppointment && (
        <div className="alert alert-warning border-0 shadow-sm mb-4 d-flex align-items-center">
          <i className="bi bi-exclamation-triangle-fill fs-4 me-3"></i>
          <div>
            <strong>Existing Appointment Found:</strong>
            <p className="mb-0 small">You already have an appointment on {selectedDate} at {existingAppointment.appointment_time || 'Queue #' + (existingAppointment.queue_position || 1)} with {existingAppointment.barber?.full_name || 'your barber'}.</p>
          </div>
        </div>
      )}

      <div className="row g-4">
        {/* Left Column: Date and Options */}
        <div className="col-lg-4">
          <div className="card border-0 bg-light rounded-4 h-100 p-3 p-lg-4">
            <h5 className="mb-3 fw-bold">
              <i className="bi bi-clock-history me-2 text-primary"></i>
              Booking Details
            </h5>

            <div className="mb-4">
              <label htmlFor="appointmentDate" className="form-label fw-bold small text-uppercase text-secondary mb-2" style={{ letterSpacing: '0.5px' }}>
                Select Date
              </label>
              <div className="input-group shadow-sm" style={{ borderRadius: '15px', overflow: 'hidden', border: '1px solid #E0E0E0' }}>
                <span className="input-group-text bg-white border-0" style={{ paddingLeft: '1.25rem' }}>
                  <i className="bi bi-calendar-check-fill fs-5" style={{ color: '#5D4037' }}></i>
                </span>
                <input
                  type="date"
                  className="form-control border-0 ps-2 py-3"
                  id="appointmentDate"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  onBlur={(e) => handleDateChange(e.target.value)}
                  min={today}
                  max={maxDateStr}
                  required
                  style={{ fontWeight: '600', fontSize: '1.05rem', backgroundColor: '#FFF' }}
                />
              </div>
              {dateValidationMessage && (
                <div className="alert alert-warning py-2 px-3 mt-2 mb-0 small border-0 shadow-sm">
                  <i className="bi bi-exclamation-triangle me-2"></i>
                  {dateValidationMessage}
                </div>
              )}
            </div>

            <div className="mb-4">
              <div className="form-check form-switch p-3 bg-white rounded-3 shadow-sm mb-3 border">
                <input
                  className="form-check-input ms-0 me-3"
                  type="checkbox"
                  id="bookForFriend"
                  checked={bookForFriend}
                  onChange={(e) => handleBookForFriendChange(e.target.checked)}
                  style={{ width: '2.5em', height: '1.25em', cursor: 'pointer' }}
                />
                <label className="form-check-label fw-bold d-flex align-items-center text-dark" htmlFor="bookForFriend">
                  <i className="bi bi-person-plus me-2" style={{ color: '#5D4037' }}></i>
                  Book for a Child
                </label>
              </div>

              {bookForFriend && (
                <div className="card border-0 shadow-sm rounded-4 p-4 mt-3 bg-white animate-fade-in border-start border-4" style={{ borderColor: '#5D4037' }}>
                  <div className="d-flex align-items-center mb-3">
                    <div className="bg-light p-2 rounded-circle me-3">
                      <i className="bi bi-person-heart fs-5" style={{ color: '#5D4037' }}></i>
                    </div>
                    <div>
                      <h6 className="mb-0 fw-bold text-dark">Child's Information</h6>
                      <p className="text-muted extra-small mb-0">Please provide details for the child booking</p>
                    </div>
                  </div>

                  <div className="row g-3">
                    <div className="col-12">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: '0.7rem' }}>Child's Name</label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-light border-end-0"><i className="bi bi-person text-muted"></i></span>
                        <input
                          type="text"
                          className="form-control border-start-0 ps-0"
                          value={friendName}
                          onChange={(e) => handleFriendNameChange(e.target.value)}
                          placeholder="Enter child's full name"
                          style={{ borderRadius: '0 8px 8px 0' }}
                        />
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: '0.7rem' }}>Guardian Phone Number</label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-light border-end-0 fw-bold text-primary" style={{ minWidth: '55px' }}>+63</span>
                        <input
                          type="tel"
                          className="form-control border-start-0 ps-0"
                          value={friendPhone.replace('+63', '')}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val.length <= 10) handleFriendPhoneChange('+63' + val);
                          }}
                          placeholder="9XX XXX XXXX"
                          style={{ borderRadius: '0 8px 8px 0' }}
                        />
                      </div>
                      <div className="form-text extra-small mt-1 text-muted" style={{ fontSize: '0.65rem' }}>
                        <i className="bi bi-info-circle me-1"></i>
                        Used for appointment alerts & status updates
                      </div>
                    </div>

                    <div className="col-12">
                      <label className="form-label small fw-bold text-secondary text-uppercase mb-1" style={{ fontSize: '0.7rem' }}>Verification Email</label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-light border-end-0"><i className="bi bi-envelope text-muted"></i></span>
                        <input
                          type="email"
                          className={`form-control border-start-0 ps-0 ${friendEmailError ? 'is-invalid' : ''}`}
                          value={friendEmail}
                          onChange={(e) => handleFriendEmailChange(e.target.value)}
                          placeholder="child@example.com"
                          disabled={isFriendEmailVerified}
                          style={{ borderRadius: isFriendEmailVerified ? '0 8px 8px 0' : '0' }}
                        />
                        {!isFriendEmailVerified && (
                          <button
                            className="btn btn-primary px-3"
                            type="button"
                            onClick={handleSendVerificationClick}
                            disabled={!isFriendEmailValid || friendVerification?.sending}
                            style={{ borderRadius: '0 8px 8px 0' }}
                          >
                            {friendVerification?.sending ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-send-fill"></i>}
                          </button>
                        )}
                      </div>

                      {isOtpSectionVisible && (
                        <div className="bg-light p-3 rounded-3 mt-3 border border-primary border-opacity-25 shadow-sm animate-fade-in">
                          <label className="form-label small fw-bold mb-2 d-block">Enter 6-Digit Verification Code</label>
                          <div className="input-group input-group-sm">
                            <input
                              type="text"
                              className="form-control fw-bold text-center"
                              placeholder="0 0 0 0 0 0"
                              value={otpCode}
                              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                              maxLength={6}
                              style={{ fontSize: '1.2rem', letterSpacing: '4px', borderRadius: '8px 0 0 8px' }}
                            />
                            <button className="btn btn-primary fw-bold px-3" type="button" onClick={handleVerifyOTPClick} style={{ borderRadius: '0 8px 8px 0' }}>Verify</button>
                          </div>
                          <div className="mt-2 d-flex justify-content-between align-items-center">
                            <small className="text-muted extra-small">Didn't get the code?</small>
                            <button className="btn btn-link p-0 extra-small text-decoration-none fw-bold" onClick={handleSendVerificationClick}>Resend Code</button>
                          </div>
                        </div>
                      )}

                      {isFriendEmailVerified && (
                        <div className="d-flex align-items-center text-success small fw-bold mt-2 bg-success bg-opacity-10 p-2 rounded-2 border border-success border-opacity-25">
                          <i className="bi bi-check-circle-fill me-2 fs-6"></i>
                          Verification Email Confirmed
                        </div>
                      )}

                      {friendEmailError && (
                        <div className="text-danger extra-small mt-2 px-1">
                          <i className="bi bi-exclamation-circle-fill me-1"></i>
                          {friendEmailError}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {selectedDate && !existingAppointment && !bookForFriend && (
              <div className="alert alert-info py-2 px-3 m-0 small border-0 shadow-sm mt-auto">
                <i className="bi bi-shield-check me-2 text-info"></i>
                One appointment per day maximum.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Barber Selection */}
        <div className="col-lg-8">
          {selectedDate ? (
            <div className="d-flex flex-column gap-4 h-100">
              {/* Recommendations Section */}
              <div className="card border-0 rounded-4 p-3 p-lg-4 shadow-sm" style={{ background: '#F9F9F9', border: '1px solid #EDEDED' }}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0 fw-800 text-dark">
                    <i className="bi bi-stars me-2" style={{ color: '#D4AF37' }}></i>
                    Recommended for You
                  </h5>
                  <button
                    className="btn btn-sm btn-light rounded-circle shadow-sm border"
                    onClick={() => setShowRecommendations(!showRecommendations)}
                  >
                    {showRecommendations ? <i className="bi bi-chevron-up"></i> : <i className="bi bi-chevron-down"></i>}
                  </button>
                </div>

                {showRecommendations && (
                  <div className="row g-3 barber-selection-row">
                    {barberRecommendations && barberRecommendations.length > 0 ? (
                      (() => {
                        const serviceDuration = bookingData.selectedServices.length > 0
                          ? calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns)
                          : 30;

                        return barberRecommendations
                          .filter(rec => {
                            if (!rec || !rec.barber) return false;
                            const queue = barberQueues[rec.barber.id];
                            // Suggestions should still include barbers even if they are 'full' but only because of lunch push.
                            // Only hide if they are TRULY full (exceed 5 PM or max queue)
                            return queue && !queue.isFullyScheduled;
                          })
                          .slice(0, 3)
                          .map((rec, index) => (
                            <div key={rec.barber.id} className="col-md-4">
                              <div className={`card barber-card h-100 border-0 shadow-sm ${selectedBarber === rec.barber.id ? 'border-primary ring-2 ring-primary ring-opacity-50' : ''}`}
                                onClick={() => handleBarberSelect(rec.barber.id)}>
                                <div className="card-body p-3">
                                  <div className="d-flex justify-content-between align-items-start mb-3">
                                    <div className="d-flex align-items-center me-2" style={{ minWidth: 0 }}>
                                      <div
                                        className="d-flex align-items-center justify-content-center flex-shrink-0 me-3"
                                        style={{ cursor: 'pointer', zIndex: 2 }}
                                        onClick={(e) => { e.stopPropagation(); setExpandedProfileBarber(rec.barber); }}
                                      >
                                        {rec.barber.profile_picture_url ? (
                                          <img src={rec.barber.profile_picture_url} alt={rec.barber.full_name} style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                                        ) : (
                                          <div className="bg-dark text-white d-flex align-items-center justify-content-center" style={{ width: '42px', height: '42px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                                            {rec.barber.full_name ? rec.barber.full_name.charAt(0).toUpperCase() : <i className="bi bi-person"></i>}
                                          </div>
                                        )}
                                      </div>
                                      <div className="text-truncate">
                                        <h6 className="fw-bold mb-0 text-truncate text-dark">
                                          {rec.barber.full_name}
                                        </h6>
                                        <div className="extra-small text-muted fw-normal d-flex align-items-center mt-1">
                                          <i className="bi bi-star-fill text-warning me-1" style={{ fontSize: '0.8em' }}></i>
                                          {rec.barber.average_rating || '0'}
                                          <span className="opacity-50 ms-1">({rec.barber.total_ratings || 0})</span>
                                        </div>
                                      </div>
                                    </div>
                                    <span className="badge bg-dark text-white rounded-pill px-2">#{index + 1}</span>
                                  </div>
                                  <div className="mb-2 d-flex flex-wrap gap-1">
                                    {rec.barber.skills?.split(',').slice(0, 2).map((skill, i) => (
                                      <span key={i} className="badge bg-light text-dark extra-small rounded-1 border">{skill.trim()}</span>
                                    ))}
                                  </div>
                                  <button className={`btn btn-sm w-100 mt-2 ${selectedBarber === rec.barber.id ? 'btn-dark' : 'btn-outline-dark'}`} style={{ borderRadius: '10px' }}>
                                    {selectedBarber === rec.barber.id ? 'Selected' : 'Choose Barber'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ));
                      })()
                    ) : (
                      <div className="col-12 py-3 text-center text-muted">Finding best matches...</div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-grow-1">
                {(() => {
                  const activeBarbers = barbers?.filter(b => b.barber_status !== 'offline' && b.barber_status !== 'day_off' && !b.archived) || [];
                  return (
                    <>
                      <div className="d-flex align-items-center justify-content-between mb-3 px-1">
                        <h5 className="mb-0 fw-800 text-dark">Choose Your Barber</h5>
                        <span className="badge badge-premium">{activeBarbers.length} Available</span>
                      </div>

                      <div className="row g-3 barber-selection-row">
                        {activeBarbers.length > 0 ? (
                          activeBarbers.map((barber) => {
                            const queue = barberQueues[barber.id];
                            const isSelected = selectedBarber === barber.id;
                            const availability = barberAvailabilityStatus[barber.id];
                            const isUnavailable = availability && !availability.isAvailable;

                            const serviceDuration = bookingData.selectedServices.length > 0
                              ? calculateTotalDuration(bookingData.selectedServices, bookingData.selectedAddOns, services, addOns)
                              : 30;
                            const canAccommodate = canBarberAccommodateService ? canBarberAccommodateService(queue, serviceDuration) : false;
                            const isFullSlot = queue && (!canAccommodate || queue.isFullCapacity);
                            const isDisabled = isFullSlot || isUnavailable;

                            return (
                              <div key={barber.id} className="col-sm-6 col-xl-4">
                                <div
                                  className={`card barber-card h-100 shadow-sm ${isSelected ? 'border-primary ring-2 ring-primary ring-opacity-20' : 'border-0'} ${isDisabled ? 'opacity-50 grayscale' : ''}`}
                                  style={{ borderColor: isSelected ? '#5D4037' : 'transparent', borderRadius: '18px', width: '100%' }}
                                  onClick={() => !isDisabled && handleBarberSelect(barber.id)}
                                >
                                  <div className="card-body p-3">
                                    <div className="d-flex justify-content-between align-items-start mb-3">
                                      <div className="d-flex align-items-center me-2" style={{ minWidth: 0 }}>
                                        <div
                                          className="d-flex align-items-center justify-content-center flex-shrink-0 me-3"
                                          style={{ cursor: isDisabled ? 'default' : 'pointer', zIndex: 2 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isDisabled) setExpandedProfileBarber(barber);
                                          }}
                                        >
                                          {barber.profile_picture_url ? (
                                            <img src={barber.profile_picture_url} alt={barber.full_name} className={`${isDisabled ? 'opacity-50 grayscale' : ''}`} style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', boxShadow: isDisabled ? 'none' : '0 2px 4px rgba(0,0,0,0.1)' }} />
                                          ) : (
                                            <div className={`text-white d-flex align-items-center justify-content-center ${isDisabled ? 'bg-secondary' : 'bg-dark'}`} style={{ width: '42px', height: '42px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', boxShadow: isDisabled ? 'none' : '0 2px 4px rgba(0,0,0,0.2)' }}>
                                              {barber.full_name ? barber.full_name.charAt(0).toUpperCase() : <i className="bi bi-person"></i>}
                                            </div>
                                          )}
                                        </div>
                                        <div className="text-truncate">
                                          <h6 className="fw-bold mb-0 text-truncate text-dark">
                                            {barber.full_name}
                                          </h6>
                                          <div className="extra-small text-muted fw-normal d-flex align-items-center mt-1">
                                            <i className="bi bi-star-fill text-warning me-1" style={{ fontSize: '0.8em' }}></i>
                                            {barber.average_rating || '0'}
                                            <span className="opacity-50 ms-1">({barber.total_ratings || 0})</span>
                                          </div>
                                        </div>
                                      </div>
                                      {isUnavailable ? (
                                        <span className="badge bg-secondary rounded-pill px-2">Offline</span>
                                      ) : isFullSlot ? (
                                        <span className="badge bg-secondary rounded-pill px-2">Full</span>
                                      ) : (
                                        <span className="badge rounded-pill px-2 text-white" style={{ background: '#5D4037' }}>Available</span>
                                      )}
                                    </div>

                                    <div className="mt-auto pt-2 border-top">
                                      <div className="d-flex justify-content-between align-items-center mb-1">
                                        <span className="extra-small fw-bold text-uppercase text-muted ls-1">Line Status</span>
                                        <span className="badge bg-success bg-opacity-10 text-success extra-small rounded-pill pulse-soft">
                                          <i className="bi bi-circle-fill me-1" style={{ fontSize: '0.5em' }}></i> Live
                                        </span>
                                      </div>
                                      <div className="d-flex justify-content-between align-items-center mb-1">
                                        <span className="small text-muted"><i className="bi bi-people me-1"></i>Ahead:</span>
                                        <span className="small fw-bold">{queue?.queueCount || 0} person(s)</span>
                                      </div>
                                      <div className="d-flex justify-content-between align-items-center mb-1">
                                        <span className="small text-muted"><i className="bi bi-clock me-2"></i>Serving:</span>
                                        <span className="small fw-bold">{queue?.current ? 'In Progress' : 'None'}</span>
                                      </div>
                                      <div className="d-flex justify-content-between align-items-center">
                                        <span className="small text-muted"><i className="bi bi-hourglass-split me-2"></i>Wait:</span>
                                        <span className="small fw-bold" style={{ color: '#5D4037' }}>{queue?.estimatedWait ? `${queue.estimatedWait}m` : '0m'}</span>
                                      </div>
                                    </div>

                                    <div className="d-flex gap-2 mt-3 mb-3">
                                      <button
                                        className={`btn btn-sm flex-grow-1 ${isSelected ? 'btn-dark' : isDisabled ? 'btn-light disabled' : 'btn-outline-dark'}`}
                                        disabled={isDisabled}
                                      >
                                        {isSelected ? 'Barber Selected' : isDisabled ? 'Unavailable' : 'Select'}
                                      </button>
                                    </div>

                                    {queue && (
                                      <div className="mt-2 p-2 bg-light rounded-3 small border border-light-subtle">
                                        <div className="d-flex justify-content-between align-items-center mb-1 border-bottom pb-1">
                                          <span className="fw-bold extra-small text-uppercase text-muted letter-spacing-1">Current Queue</span>
                                          {queue.appointments?.length > 0 && (
                                            <span className="badge bg-white border extra-small" style={{ color: '#5D4037' }}>{queue.appointments.length}</span>
                                          )}
                                        </div>
                                        {queue.appointments?.length > 0 ? (
                                          <div className="d-flex flex-column gap-2 mt-2">
                                            {queue.appointments.slice(0, 3).map((apt, i) => (
                                              <div key={i} className="d-flex justify-content-between extra-small align-items-center p-1 px-2 rounded-2 bg-white shadow-sm border border-light">
                                                <span className="text-truncate fw-medium">
                                                  <i className={`bi bi-circle-fill me-2 ${apt.status === 'ongoing' ? 'text-success' : 'text-warning'}`} style={{ fontSize: '0.6em' }}></i>
                                                  {apt.status === 'ongoing' ? 'Serving...' : `Position #${i + 1}`}
                                                </span>
                                                <span className="badge bg-light text-muted fw-normal">{apt.total_duration || 30}m</span>
                                              </div>
                                            ))}
                                            {queue.appointments.length > 3 && (
                                              <div className="text-center extra-small text-muted py-1 border-top mt-1">
                                                <i className="bi bi-three-dots me-1"></i>
                                                {queue.appointments.length - 3} more waiting in line
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="text-center py-2 text-muted extra-small">
                                            <i className="bi bi-calendar-event me-1"></i>
                                            No active appointments
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="col-12 py-5 text-center bg-light rounded-4">
                            <i className="bi bi-person-x fs-1 text-muted mb-3 d-block"></i>
                            <p className="text-muted">No barbers available for this date.</p>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="h-100 d-flex flex-column align-items-center justify-content-center bg-white rounded-4 border p-5 text-center shadow-sm">
              <div className="bg-light rounded-circle p-4 shadow-sm mb-4">
                <i className="bi bi-calendar-check fs-1" style={{ color: '#5D4037' }}></i>
              </div>
              <h5 className="fw-800">Please Select a Date</h5>
              <p className="text-muted">Choose a date on the left to see available barbers and their schedules</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="row mt-5 border-top pt-4">
        <div className="col-12 d-flex justify-content-end">
          <button
            className="btn btn-dark btn-lg px-5 rounded-pill shadow-sm"
            onClick={handleNext}
            disabled={!selectedDate || !selectedBarber || (barberAvailabilityStatus[selectedBarber] && !barberAvailabilityStatus[selectedBarber].isAvailable)}
          >
            Next: Choose Services
            <i className="bi bi-arrow-right ms-2"></i>
          </button>
        </div>
      </div>

      {/* Expanded Profile Modal */}
      {expandedProfileBarber && (
        <div className="modal-backdrop fade show" style={{ zIndex: 1050 }} onClick={() => setExpandedProfileBarber(null)}></div>
      )}
      {expandedProfileBarber && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1051 }} onClick={() => setExpandedProfileBarber(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 overflow-hidden shadow-lg" style={{ borderRadius: '24px' }}>
              <div className="modal-header border-0 bg-transparent p-3 position-absolute top-0 w-100 z-3" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)' }}>
                <button type="button" className="btn-close btn-close-white ms-auto bg-dark bg-opacity-50 rounded-circle shadow-sm p-2" onClick={() => setExpandedProfileBarber(null)}></button>
              </div>
              <div className="modal-body p-0 text-center position-relative">
                {expandedProfileBarber.profile_picture_url ? (
                  <img
                    src={expandedProfileBarber.profile_picture_url}
                    alt={expandedProfileBarber.full_name}
                    className="img-fluid w-100"
                    style={{ minHeight: '300px', maxHeight: '450px', objectFit: 'cover' }}
                  />
                ) : (
                  <div className="bg-dark text-white d-flex flex-column align-items-center justify-content-center w-100" style={{ height: '350px', fontSize: '6rem', fontWeight: 'bold' }}>
                    {expandedProfileBarber.full_name ? expandedProfileBarber.full_name.charAt(0).toUpperCase() : <i className="bi bi-person"></i>}
                  </div>
                )}
                <div className="bg-white p-4 text-start position-relative z-2" style={{ marginTop: '-20px', borderRadius: '24px 24px 0 0', boxShadow: '0 -10px 20px rgba(0,0,0,0.05)' }}>
                  <h4 className="fw-bold mb-1 text-dark">{expandedProfileBarber.full_name}</h4>
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    <span className="badge bg-light text-dark shadow-sm py-2 px-3 fw-bold">
                      <i className="bi bi-star-fill text-warning me-1"></i>
                      {expandedProfileBarber.average_rating || '0'} <span className="text-muted fw-normal ms-1">({expandedProfileBarber.total_ratings || 0} reviews)</span>
                    </span>
                    {expandedProfileBarber.skills && expandedProfileBarber.skills.split(',').map((skill, i) => (
                      <span key={i} className="badge bg-light text-dark shadow-sm py-2 px-3 border">{skill.trim()}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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
  addOns,
  calculateTotalDuration,
  barberQueues,
  canBarberAccommodateService
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
    const isNowSelected = !selectedServices.includes(serviceId);

    // Reset services selection (single selection only)
    setSelectedServices(isNowSelected ? [serviceId] : []);

    // RESET all add-ons when service is changed or toggled to ensure compatibility
    setSelectedAddOns([]);
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

      return total;
    }, 0);

    return servicesTotal + addOnsTotal;
  };

  const handleNext = () => {
    // Strict check for lunch and closing before proceeding to summary
    const serviceDuration = calculateTotalDuration(
      selectedServices,
      selectedAddOns,
      services,
      addOns
    );

    const queue = barberQueues[bookingData.selectedBarber];
    // Re-check capacity with real duration
    if (queue) {
      const canAccommodate = canBarberAccommodateService ? canBarberAccommodateService(queue, serviceDuration) : true;
      if (!canAccommodate || queue.isFullCapacity) {
        alert('Conflicting Schedule: Selected services are too long for the available time before closing or lunch. Please try a shorter service.');
        return;
      }
    }

    updateBookingData({
      selectedServices,
      selectedAddOns,
      specialRequests,
      totalPrice: calculateTotal()
    });
    onNext();
  };

  return (
    <div className="card-body p-3 p-md-4">
      <div className="d-flex align-items-center mb-4">
        <div className="bg-light p-2 rounded-circle me-3">
          <i className="bi bi-scissors fs-4" style={{ color: '#5D4037' }}></i>
        </div>
        <div>
          <h4 className="mb-0 fw-800 text-dark">Services & Add-ons</h4>
          <p className="text-muted small mb-0">Customize your haircut experience</p>
        </div>
      </div>

      {/* Services Selection */}
      <div className="mb-5">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0 fw-bold">
            <i className="bi bi-star me-2 text-primary"></i>
            Primary Services
          </h5>
          <span className="badge bg-light text-dark border">Select 1</span>
        </div>

        <div className="row g-3">
          {services && services.length > 0 ? services.map((service) => (
            <div key={service.id} className="col-md-6 col-lg-4">
              <div
                className={`card barber-card h-100 ${selectedServices.includes(service.id) ? 'border shadow-sm' : 'border-0 shadow-sm'}`}
                style={{ borderColor: selectedServices.includes(service.id) ? '#5D4037' : 'transparent', background: selectedServices.includes(service.id) ? '#FDFDFD' : '#FFFFFF' }}
                onClick={() => handleServiceToggle(service.id)}
              >
                <div className="card-body p-3 d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-bold mb-0 text-dark">{service.name}</h6>
                    <span className="fw-800" style={{ color: '#5D4037' }}>{formatPrice(service.price)}</span>
                  </div>
                  <p className="text-muted small mb-3 flex-grow-1">{service.description}</p>
                  <div className="mt-auto d-flex justify-content-between align-items-center pt-2 border-top">
                    <small className="text-muted">
                      <i className="bi bi-clock me-1"></i>
                      {service.duration} mins
                    </small>
                    {selectedServices.includes(service.id) ? (
                      <span className="badge bg-dark rounded-pill"><i className="bi bi-check-lg"></i></span>
                    ) : (
                      <span className="small fw-bold" style={{ color: '#5D4037' }}>Select</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )) : (
            <div className="col-12 text-center py-5">
              <div className="spinner-border text-primary mb-3"></div>
              <p className="text-muted">Loading services...</p>
            </div>
          )}
        </div>
      </div>

      {/* Add-ons Selection */}
      <div className="mb-5">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0 fw-bold text-dark">
            <i className="bi bi-plus-circle me-2" style={{ color: '#5D4037' }}></i>
            Extra add-ons
          </h5>
          <span className="badge bg-light text-dark border">Multiple allowed</span>
        </div>

        <div className="row g-3">
          {addOns && addOns.length > 0 ? addOns.map((addon) => {
            const selectedServiceObj = services.find(s => selectedServices.includes(s.id));
            const serviceName = selectedServiceObj?.name?.toLowerCase() || '';
            const addonName = addon.name?.toLowerCase() || '';

            let isDisabled = false;
            if (serviceName.includes('emperor') && addonName.includes('hair spa')) isDisabled = true;
            if (serviceName.includes('superior') && addonName.includes('hair color')) isDisabled = true;

            const isSelected = selectedAddOns.includes(addon.id);

            // Recommendation logic
            const isRecommended = (
              (serviceName.includes('haircut') && (addonName.includes('spa') || addonName.includes('massage'))) ||
              (serviceName.includes('beard') && addonName.includes('facial')) ||
              (serviceName.includes('shave') && addonName.includes('massage'))
            );

            // Time conflict check for THIS specific addon on top of current selections
            const currentDuration = calculateTotalDuration(selectedServices, selectedAddOns, services, addOns);
            const durationWithThisAddon = currentDuration + (isSelected ? 0 : addon.duration);
            const queue = barberQueues[bookingData.selectedBarber];
            const wouldConflict = queue && !isSelected && !canBarberAccommodateService(queue, durationWithThisAddon);

            return (
              <div key={addon.id} className="col-md-6 col-lg-4">
                <div
                  className={`card barber-card h-100 ${isSelected ? 'border shadow-sm' : 'border-0 shadow-sm'} ${(isDisabled || wouldConflict) ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                  style={{ borderColor: isSelected ? '#5D4037' : 'transparent', background: isSelected ? '#FDFDFD' : '#FFFFFF' }}
                  onClick={() => !isDisabled && !wouldConflict && handleAddOnToggle(addon.id)}
                  title={isDisabled ? `Not available with ${selectedServiceObj?.name}` : wouldConflict ? 'This addon crosses lunch or closing' : ''}
                >
                  <div className="card-body p-3 d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div className="d-flex flex-column">
                        <h6 className="fw-bold mb-0 small text-dark">{addon.name}</h6>
                        {isRecommended && !isSelected && !isDisabled && !wouldConflict && (
                          <span className="extra-small fw-bold mt-1" style={{ color: '#5D4037' }}><i className="bi bi-hand-thumbs-up-fill me-1"></i>Highly Recommended</span>
                        )}
                      </div>
                      <span className="small fw-bold" style={{ color: '#5D4037' }}>{formatPrice(addon.price)}</span>
                    </div>
                    <div className="mt-auto d-flex justify-content-between align-items-center pt-2 border-top">
                      <small className="text-muted extra-small">
                        <i className="bi bi-clock me-1"></i>
                        {addon.duration} mins
                      </small>
                      {isSelected ? (
                        <span className="badge bg-dark rounded-pill"><i className="bi bi-check-lg"></i></span>
                      ) : (
                        <span className="small fw-bold" style={{ color: '#5D4037' }}>Add</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="col-12 text-center py-4 bg-light rounded-3">
              <p className="text-muted mb-0">No add-ons available</p>
            </div>
          )}
        </div>
      </div>

      {/* Special Requests */}
      <div className="mb-5">
        <label htmlFor="specialRequests" className="form-label fw-bold text-dark">
          <i className="bi bi-chat-dots me-2" style={{ color: '#5D4037' }}></i>
          Any special instructions?
        </label>
        <textarea
          className="form-control border-0 shadow-sm rounded-4 p-3"
          id="specialRequests"
          rows="3"
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
          placeholder="e.g., Specific style, allergies, or questions..."
        />
      </div>

      {/* Lunch and Closing Warning for Step 2 */}
      {(() => {
        const queue = barberQueues[bookingData.selectedBarber];
        const duration = calculateTotalDuration(selectedServices, selectedAddOns, services, addOns);
        const canAccommodate = canBarberAccommodateService ? canBarberAccommodateService(queue, duration) : true;

        if (queue && (!canAccommodate || queue.isFullCapacity)) {
          return (
            <div className="alert alert-warning border-0 shadow-sm rounded-4 p-3 mb-4 d-flex align-items-center gap-3">
              <i className="bi bi-exclamation-triangle-fill fs-4 text-warning"></i>
              <div>
                <h6 className="mb-1 fw-bold">Time Conflict Detected</h6>
                <p className="mb-0 small opacity-75">Your current selection takes too long ({duration}m) and will cross the lunch break or closing hour. Consider choosing shorter services or checking other barbers in Step 1.</p>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* Floating Summary Bar (Mobile Only or Bottom Fixed) */}
      <div className="alert border-0 shadow-sm rounded-4 p-3 mb-5" style={{ background: '#F8F9FA', border: '1px solid #EDEDED' }}>
        <div className="d-flex justify-content-between align-items-center text-dark">
          <div>
            <h6 className="mb-1 fw-bold">Current Total</h6>
            <p className="mb-0 small text-muted">
              {selectedServices.length} Service {selectedAddOns.length > 0 ? `+ ${selectedAddOns.length} Add-on(s)` : ''}
            </p>
          </div>
          <div className="text-end">
            <h4 className="mb-0 fw-800" style={{ color: '#5D4037' }}>{formatPrice(calculateTotal())}</h4>
          </div>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="row mt-5 border-top pt-4">
        <div className="col-12 d-flex justify-content-between">
          <button
            className="btn btn-outline-dark btn-lg px-4 rounded-pill"
            onClick={onPrev}
          >
            <i className="bi bi-arrow-left me-2"></i>
            Back
          </button>
          <button
            className="btn btn-dark btn-lg px-5 rounded-pill shadow-sm"
            onClick={handleNext}
            disabled={selectedServices.length === 0}
          >
            Review Booking
            <i className="bi bi-pencil-square ms-2"></i>
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
  calculateTotalDuration,

  wouldCrossLunchBreak,
  isRefreshing,
  setIsRefreshing,
  updateQueueStatus,
  queueStatus,
  // Real-time status calculation functions
  calculateCurrentQueueStatus,
  calculateRealTimeAvailability,
  unifiedSlots,
  alternativeBarbers,
  friendVerification,
  onSendFriendVerification,
  onVerifyFriendVerification,
  onResetFriendVerification,
  onLoadAlternatives
}) => {
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');

  const normalizedEmail = (bookingData.friendEmail || '').trim().toLowerCase();
  const isOtpSectionVisible = bookingData.bookForFriend && friendVerification?.sent && friendVerification.email === normalizedEmail && !friendVerification?.verified;
  const isFriendEmailVerified = bookingData.bookForFriend && friendVerification?.verified && friendVerification.email === normalizedEmail;
  const isFriendEmailValid = FRIEND_EMAIL_REGEX.test(normalizedEmail);
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

          const serviceDuration = calculateTotalDuration(
            bookingData.selectedServices,
            bookingData.selectedAddOns,
            services,
            addOns
          );

          // Use enhanced queue calculator for accurate estimates
          if (bookingData.appointmentType === 'queue') {
            const queueInfo = await QueueTimeCalculator.calculateQueueInfo(
              bookingData.selectedBarber,
              bookingData.selectedDate,
              serviceDuration,
              bookingData.isUrgent || false,
              isRebooking ? rebookingAppointment?.id : null
            );

            // Convert to 12-hour format if needed
            const startTime = queueInfo.estimatedStartTime;
            let formattedStartTime = startTime;
            
            if (startTime && startTime.includes(':')) {
              // Extract hours and minutes (handles HH:mm and HH:mm:ss)
              const [h, m] = startTime.split(':').map(Number);
              const totalMinutes = h * 60 + m - 10;
              
              // Format back to 24-hour string for convertTo12Hour
              const newH = Math.floor(totalMinutes / 60);
              const newM = totalMinutes % 60;
              const time24 = `${String(newH).padStart(2, '0')}:${String(newM < 0 ? 0 : newM).padStart(2, '0')}`;
              
              formattedStartTime = convertTo12Hour(time24);
            }

            setEstimatedStartTime(formattedStartTime);
            setEstimatedEndTime(queueInfo.estimatedEndTime);

            setRealTimeStatus({
              queueStatus: {
                nextQueuePosition: queueInfo.queuePosition,
                totalInQueue: queueInfo.totalInQueue,
                queueLength: (queueInfo.queuePosition || 1) - 1,
                estimatedWaitTime: queueInfo.estimatedWaitTime,
                isOverflowingWorkHours: queueInfo.isOverflowingWorkHours,
                wasPushedByLunch: queueInfo.wasPushedByLunch,
                availBeforeLunch: queueInfo.availBeforeLunch
              },
              availability: {
                nextAvailableTime: formattedStartTime,
                isOverflowingWorkHours: queueInfo.isOverflowingWorkHours,
                wasPushedByLunch: queueInfo.wasPushedByLunch
              },
              lastUpdated: new Date().toLocaleTimeString(),
              recommendations: queueInfo.recommendations
            });

            // If there's a closing conflict or lunch push, trigger alternative barber search
            if ((queueInfo.isOverflowingWorkHours || queueInfo.wasPushedByLunch) && onLoadAlternatives) {
              console.log('🔄 Conflict detected, loading alternatives...');
              onLoadAlternatives(bookingData.selectedDate, serviceDuration, bookingData.selectedBarber);
            }
          } else if (bookingData.appointmentType === 'scheduled') {
            // For scheduled appointments, check for conflicts and calculate times
            const scheduledInfo = await QueueTimeCalculator.calculateScheduledAppointmentTimes(
              bookingData.selectedBarber,
              bookingData.selectedDate,
              bookingData.selectedTimeSlot,
              serviceDuration
            );

            if (scheduledInfo.hasConflict) {
              setEstimatedStartTime('Conflict Detected');
              setEstimatedEndTime('Please Reschedule');
            } else {
              setEstimatedStartTime(bookingData.selectedTimeSlot);
              setEstimatedEndTime(scheduledInfo.endTime);
            }

            setRealTimeStatus({
              queueStatus: null,
              availability: {
                nextAvailableTime: bookingData.selectedTimeSlot,
                hasConflict: scheduledInfo.hasConflict,
                isOverflowingWorkHours: scheduledInfo.isOverflowingWorkHours,
                conflictMessage: scheduledInfo.conflictMessage,
                recommendedSlots: scheduledInfo.recommendedSlots || []
              },
              lastUpdated: new Date().toLocaleTimeString()
            });
          }

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
  }, [bookingData.selectedBarber, bookingData.selectedDate, bookingData.selectedServices, bookingData.selectedAddOns, services, addOns, bookingData.appointmentType, bookingData.selectedTimeSlot, bookingData.isUrgent]);

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

      return total;
    }, 0);

    // Add 100 pesos urgent fee if it's an urgent booking
    const urgentFee = (bookingData.isUrgent || bookingData.priority_level === 'urgent' || bookingData.priorityLevel === PRIORITY_LEVELS.URGENT)
      ? (QUEUE_SETTINGS.URGENT_FEE || 100)
      : 0;

    return servicesTotal + addOnsTotal + urgentFee;
  };

  // Find services and add-ons that fit in the remaining time if there's a conflict
  const fittingServices = React.useMemo(() => {
    const conflict = realTimeStatus.recommendations?.find(r => r.type === 'closing_conflict' || r.type === 'lunch_conflict');
    if (!conflict || conflict.remainingMinutes === undefined || conflict.remainingMinutes <= 0) return [];

    return services.filter(service =>
      service.duration <= conflict.remainingMinutes &&
      !bookingData.selectedServices.includes(service.id)
    );
  }, [realTimeStatus.recommendations, services, bookingData.selectedServices]);

  const fittingAddOns = React.useMemo(() => {
    const conflict = realTimeStatus.recommendations?.find(r => r.type === 'closing_conflict' || r.type === 'lunch_conflict');

    // If there's a conflict, suggest things that fit in the remaining gap
    if (conflict && conflict.remainingMinutes !== undefined && conflict.remainingMinutes > 0) {
      return addOns.filter(addon =>
        addon.duration <= conflict.remainingMinutes &&
        !bookingData.selectedAddOns.includes(addon.id)
      );
    }

    // If NO conflict, suggest generally recommended add-ons for the selected service
    const selectedServiceObj = services.find(s => (bookingData.selectedServices || []).includes(s.id));
    if (!selectedServiceObj) return [];

    const serviceName = selectedServiceObj.name?.toLowerCase() || '';

    return addOns.filter(addon => {
      if ((bookingData.selectedAddOns || []).includes(addon.id)) return false;

      const addonName = addon.name?.toLowerCase() || '';
      return (
        (serviceName.includes('haircut') && (addonName.includes('hair spa') || addonName.includes('massage') || addonName.includes('shampoo'))) ||
        (serviceName.includes('shave') && (addonName.includes('facial') || addonName.includes('hot towel'))) ||
        (serviceName.includes('emperor') && (addonName.includes('premium') || addonName.includes('mask'))) ||
        (serviceName.includes('superior') && (addonName.includes('treatment') || addonName.includes('spa')))
      );
    }).slice(0, 3);
  }, [realTimeStatus.recommendations, addOns, bookingData.selectedAddOns, services, bookingData.selectedServices]);

  return (
    <div className="container-fluid px-2 px-md-4 py-4 py-md-5 animate-fade-in">
      <style>{`
        .summary-card {
          border: none;
          box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          border-radius: 24px;
          overflow: hidden;
          background: #ffffff;
        }
        .info-card {
          background: #f8f9fa;
          border-radius: 20px;
          border: 1px solid rgba(0,0,0,0.05);
          transition: all 0.3s ease;
        }
        .info-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          border-color: var(--bs-primary);
        }
        .queue-badge-container {
          position: relative;
          width: 160px;
          height: 160px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .queue-ring-outer {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          border: 2px dashed #e9ecef;
          animation: rotate-dashed 20s linear infinite;
        }
        @keyframes rotate-dashed {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .queue-pulse {
          position: absolute;
          width: 140px;
          height: 140px;
          border-radius: 50%;
          background: rgba(25, 135, 84, 0.05);
          animation: pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.3; }
          100% { transform: scale(0.8); opacity: 0.5; }
        }
        .queue-inner {
          position: relative;
          width: 130px;
          height: 130px;
          background: white;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.05);
          z-index: 2;
          border: 4px solid #fff;
        }
        .queue-number {
          font-size: 4rem;
          font-weight: 800;
          line-height: 1;
          margin-bottom: -5px;
          background: linear-gradient(135deg, #000000 0%, #5D4037 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          display: block;
        }
        .queue-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-uppercase;
          color: #6c757d;
          letter-spacing: 1.5px;
        }
        .total-price-card {
          background: linear-gradient(135deg, #000000 0%, #5D4037 100%);
          border-radius: 20px;
          color: white;
          box-shadow: 0 10px 20px rgba(0,0,0,0.15);
        }
        .edit-btn-pill {
          padding: 4px 12px;
          border-radius: 50px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .service-item {
          padding: 12px;
          border-bottom: 1px dashed rgba(0,0,0,0.1);
        }
        .service-item:last-child {
          border-bottom: none;
        }
        .queue-number-v2 {
        font-size: 2.5rem;
        font-weight: 900;
        color: #0d6efd;
        background: #f0f7ff;
        width: 80px;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 20px;
        border: 2px solid #e0eeff;
        box-shadow: 0 8px 20px rgba(13, 110, 253, 0.1);
      }
      .stat-box-v2 {
        background: #f8f9fa;
        padding: 1rem;
        border-radius: 16px;
        text-align: center;
        flex: 1;
        border: 1px solid #eee;
        transition: all 0.2s ease;
      }
      .stat-box-v2:hover {
        background: #fff;
        border-color: #0d6efd;
        transform: translateY(-2px);
      }
      .animate-pulse-subtle {
        animation: pulse-subtle 2s infinite;
      }
      @keyframes pulse-subtle {
        0% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.05); opacity: 0.8; }
        100% { transform: scale(1); opacity: 1; }
      }
      @media (max-width: 576px) {
        .queue-number-v2 {
          width: 70px;
          height: 70px;
          font-size: 2rem;
        }
        .stat-box-v2 .h3 {
          font-size: 1.5rem !important;
        }
      }
      `}</style>

      <div className="row justify-content-center">
        <div className="col-xl-9 col-lg-10">
          <div className="summary-card">
            {/* Real-time Status Banner */}
            {realTimeStatus.lastUpdated && (
              <div className="bg-dark text-white py-2 px-4 text-center small">
                <i className="bi bi-arrow-repeat me-2"></i>
                Estimate updated at {realTimeStatus.lastUpdated}
              </div>
            )}

            <div className="p-4 p-lg-5">
              {/* Header Section */}
              <div className="text-center mb-5">
                <span className="badge badge-premium px-3 py-2 rounded-pill fw-bold mb-3">
                  <i className="bi bi-shield-check me-2" style={{ color: '#5D4037' }}></i>Final Confirmation
                </span>
                <h2 className="display-6 fw-800 text-dark">Review Your Booking</h2>
                <p className="text-muted">Almost there! Double-check your appointment details below.</p>
              </div>

              {/* Ultra-Minimalist Queue Status with Circle */}
              <div className="text-center mb-5">
                <div className="d-flex flex-column align-items-center mb-4">
                  <div className="position-relative d-flex align-items-center justify-content-center mb-2" style={{ width: '110px', height: '110px' }}>
                    <div className="position-absolute w-100 h-100 rounded-circle border border-dark border-opacity-10"></div>
                    <div className="position-absolute rounded-circle border border-dark border-2" style={{ width: '90px', height: '90px' }}></div>
                    <span className="display-4 fw-900 text-dark" style={{ zIndex: 1, letterSpacing: '-2px' }}>
                      {realTimeStatus.queueStatus?.nextQueuePosition || '?'}
                    </span>
                  </div>
                  <div className="small text-muted text-uppercase fw-bold ls-2">Position</div>
                </div>

                <div className="py-4">
                  <h4 className="fw-bold text-dark mb-0">Queue Reservation</h4>
                  <p className="text-muted small">with {selectedBarber?.full_name || 'Selected Barber'}</p>
                </div>

                <div className="row g-2 g-md-3 justify-content-center mb-5 px-2">
                  <div className="col-6 col-sm-5 col-md-4">
                    <div className="stat-box-v2 h-100 d-flex flex-column justify-content-center">
                      <div className="extra-small text-muted text-uppercase fw-bold ls-1 mb-1">Waiting Time</div>
                      <div className="h3 fw-900 mb-0" style={{ color: '#5D4037' }}>{statusLoading ? '...' : (realTimeStatus.queueStatus?.estimatedWaitTime || '0')}m</div>
                    </div>
                  </div>
                  {!statusLoading && estimatedStartTime && (
                    <div className="col-6 col-sm-5 col-md-4">
                      <div className="stat-box-v2 h-100 d-flex flex-column justify-content-center">
                        <span className="extra-small text-muted text-uppercase fw-bold ls-1 mb-1 d-block">Arrival Time</span>
                        <div className="h3 fw-900 mb-0" style={{ color: '#5D4037' }}>{estimatedStartTime}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Minimalist Switch Component */}
                <div className="d-flex justify-content-center pt-2">
                  <label className={`d-flex align-items-center gap-3 px-4 py-2 rounded-pill border ${bookingData.isUrgent ? 'border-dark bg-dark text-white' : 'border-light bg-light'} cursor-pointer`} style={{ transition: 'all 0.2s', cursor: 'pointer' }}>
                    <span className="small fw-bold">Urgent Priority (+₱{QUEUE_SETTINGS.URGENT_FEE || 100})</span>
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        checked={bookingData.isUrgent || false}
                        onChange={(e) => updateBookingData({ isUrgent: e.target.checked })}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                  </label>
                </div>
              </div>

              {/* Conflict Warnings */}
              {realTimeStatus.recommendations?.length > 0 && (
                <div className="mt-3">
                  {realTimeStatus.recommendations.map((rec, i) => (
                    <div key={i} className={`alert border-0 shadow-sm rounded-4 p-3 mb-2 d-flex align-items-center gap-3 ${rec.severity === 'high' ? 'alert-danger' : 'alert-warning'}`}>
                      <i className={`bi ${rec.severity === 'high' ? 'bi-exclamation-octagon-fill' : 'bi-exclamation-triangle-fill'} fs-4`}></i>
                      <div>
                        <h6 className="mb-1 fw-bold">{rec.title}</h6>
                        <p className="mb-0 small opacity-75">{rec.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Booking Grid */}
              <div className="row g-4 mb-5">
                {/* Left Column: Barber Summary */}
                <div className="col-lg-5">
                  <div className="card border-0 bg-light rounded-4 p-4 h-100 shadow-sm">
                    <div className="d-flex align-items-center mb-4">
                      <div className="bg-white p-2 rounded-circle shadow-sm me-3">
                        <i className="bi bi-person-badge fs-5" style={{ color: '#5D4037' }}></i>
                      </div>
                      <h5 className="mb-0 fw-bold text-dark">Your Barber</h5>
                    </div>

                    <div className="d-flex align-items-center p-3 bg-white rounded-4 border">
                      <div className="position-relative">
                        {selectedBarber?.profile_picture_url ? (
                          <img
                            src={selectedBarber.profile_picture_url}
                            alt={selectedBarber.full_name}
                            className="rounded-circle border"
                            style={{ width: '64px', height: '64px', objectFit: 'cover' }}
                          />
                        ) : (
                          <div className="bg-dark text-white d-flex align-items-center justify-content-center rounded-circle" style={{ width: '64px', height: '64px', fontSize: '1.5rem', fontWeight: 'bold' }}>
                            {selectedBarber?.full_name?.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="ms-3">
                        <h6 className="mb-0 fw-800 text-dark">{selectedBarber?.full_name || 'No Barber Selected'}</h6>
                        <span className="badge bg-light text-muted border extra-small mt-1 px-2">Professional Barber</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-top">
                      <p className="small text-muted mb-2 fw-bold text-uppercase ls-1">Appointment Details</p>
                      <ul className="list-unstyled mb-0">
                        <li className="d-flex justify-content-between mb-2 small">
                          <span className="text-muted"><i className="bi bi-calendar-event me-2" style={{ color: '#5D4037' }}></i>Date</span>
                          <span className="fw-bold text-dark">{bookingData.selectedDate}</span>
                        </li>
                        <li className="d-flex justify-content-between mb-2 small">
                          <span className="text-muted"><i className="bi bi-clock me-2" style={{ color: '#5D4037' }}></i>Estimated Arrival</span>
                          <span className="fw-bold text-dark">{estimatedStartTime}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Right Column: Services & Total */}
                <div className="col-lg-7">
                  <div className="card border-0 bg-white rounded-4 p-4 h-100 shadow-sm border">
                    <div className="d-flex justify-content-between align-items-center mb-4">
                      <div className="d-flex align-items-center">
                        <div className="bg-light p-2 rounded-circle me-3">
                          <i className="bi bi-list-check fs-5" style={{ color: '#5D4037' }}></i>
                        </div>
                        <h5 className="mb-0 fw-bold text-dark">Services Selected</h5>
                      </div>
                      <button className="btn btn-sm btn-link text-decoration-none fw-bold p-0" onClick={onEdit} style={{ color: '#5D4037' }}>Edit</button>
                    </div>

                    <div className="services-list mb-4">
                      {bookingData.selectedServices?.map(serviceId => {
                        const service = services.find(s => s.id === serviceId);
                        return (
                          <div key={serviceId} className="d-flex justify-content-between align-items-center py-2 border-bottom border-light">
                            <div>
                              <div className="fw-bold text-dark mb-0">{service?.name}</div>
                              <div className="text-muted extra-small"><i className="bi bi-clock me-1"></i>{service?.duration} mins</div>
                            </div>
                            <div className="fw-800" style={{ color: '#5D4037' }}>{formatPrice(service?.price)}</div>
                          </div>
                        );
                      })}
                      {bookingData.selectedAddOns?.map(addonId => {
                        const addon = addOns.find(a => a.id === addonId);
                        return (
                          <div key={addonId} className="d-flex justify-content-between align-items-center py-2 border-bottom border-light">
                            <div>
                              <div className="fw-bold text-dark mb-0 small">{addon?.name} (Add-on)</div>
                              <div className="text-muted extra-small"><i className="bi bi-clock me-1"></i>{addon?.duration} mins</div>
                            </div>
                            <div className="fw-800" style={{ color: '#5D4037' }}>{formatPrice(addon?.price)}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="total-price-card p-4 mt-auto">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <span className="opacity-75 small fw-bold text-uppercase ls-1">Financial Summary</span>
                        <i className="bi bi-wallet2 opacity-50"></i>
                      </div>

                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="opacity-85">Base Services</span>
                        <span className="fw-bold">{formatPrice(calculateTotal() - (bookingData.isUrgent ? (QUEUE_SETTINGS.URGENT_FEE || 100) : 0))}</span>
                      </div>

                      {bookingData.isUrgent && (
                        <div className="d-flex justify-content-between align-items-center mb-2 text-warning">
                          <span className="opacity-85"><i className="bi bi-lightning-fill me-1"></i>Urgent Priority Fee</span>
                          <span className="fw-bold">{formatPrice(QUEUE_SETTINGS.URGENT_FEE || 100)}</span>
                        </div>
                      )}

                      <div className="d-flex justify-content-between align-items-center border-top border-white border-opacity-20 pt-3 mt-3">
                        <div>
                          <h6 className="mb-0 opacity-75 fw-medium">Grand Total</h6>
                          <div className="extra-small opacity-50">Incl. all taxes & fees</div>
                        </div>
                        <h2 className="mb-0 fw-800">{formatPrice(calculateTotal())}</h2>
                      </div>
                      <div className="mt-3 pt-2 text-center border-top border-white border-opacity-10">
                        <span className="extra-small opacity-75">
                          <i className="bi bi-cash-stack me-1"></i>
                          Pay in person at RAF & ROX
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Special Requests */}
              {bookingData.specialRequests && (
                <div className="info-card p-3 mb-5 border-start border-4" style={{ borderColor: '#5D4037' }}>
                  <div className="small text-muted fw-bold text-uppercase mb-2">Instructions</div>
                  <p className="mb-0 text-dark small italic">{bookingData.specialRequests}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="row g-3">
                <div className="col-md-4 order-2 order-md-1">
                  <button
                    type="button"
                    className="btn btn-outline-dark btn-lg w-100 py-3 rounded-pill fw-bold"
                    onClick={onPrev}
                  >
                    <i className="bi bi-arrow-left me-2"></i>Back
                  </button>
                </div>
                <div className="col-md-8 order-1 order-md-2">
                  <button
                    type="submit"
                    className="btn btn-dark btn-lg w-100 py-3 rounded-pill fw-bold shadow-sm"
                    disabled={loading || statusLoading || !bookingData.selectedBarber || bookingData.selectedServices.length === 0 || realTimeStatus.availability?.isOverflowingWorkHours || realTimeStatus.availability?.wasPushedByLunch}
                    onClick={onSubmit}
                  >
                    {loading ? (
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    ) : (
                      <i className="bi bi-check-circle-fill me-2"></i>
                    )}
                    {isRebooking ? 'Confirm Reschedule' : 'Confirm & Book Spot'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BookAppointment;
