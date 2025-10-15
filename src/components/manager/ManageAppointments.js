// components/manager/ManageAppointments.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
// REMOVED: PushService import - use only CentralizedNotificationService
import { formatDate, formatTime, getStatusColor } from '../utils/helpers';
import { APPOINTMENT_STATUS } from '../utils/constants';
import LoadingSpinner from '../common/LoadingSpinner';
import SearchAndFilter from '../common/SearchAndFilter';
import AppointmentProductPurchase from './AppointmentProductPurchase';
import AdvancedHybridQueueService from '../../services/AdvancedHybridQueueService';
import UnifiedSlotBookingService from '../../services/UnifiedSlotBookingService';
import { 
  BOOKING_STATUS, 
  APPOINTMENT_FIELDS, 
  PRIORITY_LEVELS 
} from '../../constants/booking.constants';

const ManageAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [addOns, setAddOns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showAppointmentProductModal, setShowAppointmentProductModal] = useState(false);
  const [selectedAppointmentForProduct, setSelectedAppointmentForProduct] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  // Advanced Hybrid Queue System state
  const [queueAnalytics, setQueueAnalytics] = useState({});
  const [realTimeUpdates, setRealTimeUpdates] = useState(false);
  const [efficiencyMetrics, setEfficiencyMetrics] = useState({});
  
  const [filters, setFilters] = useState({
    status: '',
    barber_id: '',
    date_range: 'today',
    search: '',
    double_booking_only: false
  });
  
  const [formData, setFormData] = useState({
    customer_id: '',
    barber_id: '',
    service_id: '',
    appointment_date: '',
    appointment_time: '',
    notes: '',
    status: ''
  });

  const [walkInFormData, setWalkInFormData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    barber_id: '',
    service_id: '',
    add_ons_data: [],
    appointment_date: '',
    appointment_time: '',
    notes: '',
    priority_level: 'normal',
    is_walk_in: true,
    primary_customer_id: ''
  });

  // Walk-in unified slot system (like customer booking)
  const [walkInUnifiedSlots, setWalkInUnifiedSlots] = useState([]);
  const [walkInAlternativeBarbers, setWalkInAlternativeBarbers] = useState([]);
  const [walkInShowAlternatives, setWalkInShowAlternatives] = useState(false);
  const [walkInLoadingSlots, setWalkInLoadingSlots] = useState(false);
  
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchInitialData();
    
    // Set up Advanced Hybrid Queue real-time updates for managers
    const handleManagerUpdate = (update) => {
      console.log('🔔 Manager received Advanced Hybrid Queue update:', update);
      
      // Refresh appointments and analytics
          fetchAppointments();
      fetchQueueAnalytics();
      
      // Show notification for important updates
      if (update.event === 'queue_rebalanced' || update.event === 'efficiency_improved') {
        console.log(`📊 Queue analytics updated: ${update.event}`);
      }
    };

    // Subscribe to manager-level updates
    const subscription = AdvancedHybridQueueService.subscribeToManagerUpdates(
      handleManagerUpdate
    );

    setRealTimeUpdates(true);
    
    return () => {
      console.log('🧹 Cleaning up Advanced Hybrid Queue manager subscription');
      AdvancedHybridQueueService.unsubscribeFromManagerUpdates();
      setRealTimeUpdates(false);
    };
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [filters]);

  useEffect(() => {
    if (formData.barber_id && formData.appointment_date) {
      fetchAvailableSlots();
    }
  }, [formData.barber_id, formData.appointment_date]);

  // Fetch unified slots for walk-in appointments (like customer booking)
  useEffect(() => {
    if (walkInFormData.barber_id && walkInFormData.appointment_date && walkInFormData.service_id) {
      loadWalkInUnifiedSlots();
    }
  }, [walkInFormData.barber_id, walkInFormData.appointment_date, walkInFormData.service_id, walkInFormData.add_ons_data]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch all in parallel
      const [barbersResult, servicesResult, customersResult, addOnsResult] = await Promise.all([
        fetchBarbers(),
        fetchServices(),
        fetchCustomers(),
        fetchAddOns()
      ]);
      
      setBarbers(barbersResult);
      setServices(servicesResult);
      setAddOns(addOnsResult);
      setCustomers(customersResult);
      
      // Then fetch appointments
      await fetchAppointments();
      
      // Fetch queue analytics
      await fetchQueueAnalytics();
      
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError('Failed to load initial data. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueueAnalytics = async () => {
    try {
      const analytics = await AdvancedHybridQueueService.getQueueAnalytics();
      if (analytics.success) {
        setQueueAnalytics(analytics.data);
        setEfficiencyMetrics(analytics.efficiency);
        console.log('📊 Queue analytics loaded:', analytics.data);
      }
    } catch (error) {
      console.error('Error fetching queue analytics:', error);
    }
  };

  const fetchBarbers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('role', 'barber')
      .order('full_name');
    
    if (error) throw error;
    return data || [];
  };

  const fetchServices = async () => {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    return data || [];
  };

  const fetchAddOns = async () => {
    const { data, error } = await supabase
      .from('add_ons')
      .select('*')
      .eq('is_active', true)
      .order('name');
    
    if (error) throw error;
    return data || [];
  };

  const fetchCustomers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, phone')
      .eq('role', 'customer')
      .order('full_name');
    
    if (error) throw error;
    return data || [];
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query based on filters
      let query = supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .order('appointment_date', { ascending: false })
        .order('appointment_time', { ascending: false });
      
      // Apply status filter
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      // Apply barber filter
      if (filters.barber_id) {
        query = query.eq('barber_id', filters.barber_id);
      }
      
      // Apply date range filter
      if (filters.date_range) {
        const today = new Date().toISOString().split('T')[0];
        
        if (filters.date_range === 'today') {
          query = query.eq('appointment_date', today);
        } else if (filters.date_range === 'week') {
          const weekLater = new Date();
          weekLater.setDate(weekLater.getDate() + 7);
          const weekLaterStr = weekLater.toISOString().split('T')[0];
          
          query = query.gte('appointment_date', today).lte('appointment_date', weekLaterStr);
        } else if (filters.date_range === 'month') {
          const monthLater = new Date();
          monthLater.setMonth(monthLater.getMonth() + 1);
          const monthLaterStr = monthLater.toISOString().split('T')[0];
          
          query = query.gte('appointment_date', today).lte('appointment_date', monthLaterStr);
        } else if (filters.date_range === 'custom' && filters.start_date && filters.end_date) {
          query = query.gte('appointment_date', filters.start_date).lte('appointment_date', filters.end_date);
        }
      }
      
      // Apply search filter
      if (filters.search) {
        // This is a simplified approach. For better performance,
        // you might want to use text search or create specific indexes
        query = query.or(`customer.full_name.ilike.%${filters.search}%,barber.full_name.ilike.%${filters.search}%`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Debug: Log double booking appointments
      const doubleBookings = data?.filter(apt => apt.is_double_booking);
      if (doubleBookings && doubleBookings.length > 0) {
        console.log('🔍 Double booking appointments found:', doubleBookings);
        console.log('📊 Double booking data structure:', doubleBookings.map(apt => ({
          id: apt.id,
          is_double_booking: apt.is_double_booking,
          double_booking_data: apt.double_booking_data,
          customer_name: apt.customer?.full_name,
          customer_phone: apt.customer?.phone,
          customer_data: apt.customer
        })));
      } else {
        console.log('❌ No double booking appointments found in current data');
      }
      
      setAppointments(data || []);
      
    } catch (error) {
      console.error('Error fetching appointments:', error);
      setError('Failed to load appointments. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async () => {
    try {
      // Get existing appointments for the selected barber and date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('appointment_time, service:service_id(duration)')
        .eq('barber_id', formData.barber_id)
        .eq('appointment_date', formData.appointment_date)
        .in('status', ['scheduled', 'ongoing']);

      if (error) throw error;

      // Generate time slots with lunch break (8:00 AM - 11:30 AM, 1:00 PM - 4:30 PM)
      const timeSlots = [];
      
      // Morning slots: 8:00 AM - 11:30 AM
      for (let hour = 8; hour <= 11; hour++) {
        for (let minute of ['00', '30']) {
          // End at 11:30 AM
          if (hour === 11 && minute === '30') {
            const time = `${hour.toString().padStart(2, '0')}:${minute}`;
            timeSlots.push(time);
            break;
          }
          const time = `${hour.toString().padStart(2, '0')}:${minute}`;
          timeSlots.push(time);
        }
      }
      
      // Afternoon slots: 1:00 PM - 4:30 PM
      for (let hour = 13; hour <= 16; hour++) {
        for (let minute of ['00', '30']) {
          // End at 4:30 PM (last slot at 4:00 PM for 30-min service ending at 4:30 PM)
          if (hour === 16 && minute === '30') break;
          const time = `${hour.toString().padStart(2, '0')}:${minute}`;
          timeSlots.push(time);
        }
      }

      // Filter out booked slots
      const bookedTimes = appointments?.map(apt => apt.appointment_time) || [];
      const available = timeSlots.filter(time => {
        // If editing an appointment, allow its original time
        if (selectedAppointment && selectedAppointment.appointment_time === time) {
          return true;
        }
        
        // Otherwise, exclude booked times
        return !bookedTimes.includes(time);
      });

      setAvailableSlots(available);
    } catch (error) {
      console.error('Error fetching available slots:', error);
      setFormErrors(prev => ({
        ...prev,
        appointment_time: 'Failed to load available time slots'
      }));
    }
  };

  // Load unified slots for walk-in appointments (same as customer booking)
  const loadWalkInUnifiedSlots = async () => {
    try {
      setWalkInLoadingSlots(true);
      setWalkInUnifiedSlots([]);
      setWalkInShowAlternatives(false);
      
      // Get service duration
      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('duration')
        .eq('id', walkInFormData.service_id)
        .single();

      if (serviceError) {
        console.error('Error fetching service data:', serviceError);
        return;
      }

      // Calculate add-ons duration
      let addOnsDuration = 0;
      if (walkInFormData.add_ons_data && walkInFormData.add_ons_data.length > 0) {
        const { data: addOnsData, error: addOnsError } = await supabase
          .from('add_ons')
          .select('duration')
          .in('id', walkInFormData.add_ons_data);
        
        if (!addOnsError && addOnsData) {
          addOnsDuration = addOnsData.reduce((sum, addon) => sum + addon.duration, 0);
        }
      }

      // Calculate total duration (service + addons)
      const totalDuration = serviceData.duration + addOnsDuration;
      console.log('🔄 Loading unified slots for walk-in:', {
        barberId: walkInFormData.barber_id,
        date: walkInFormData.appointment_date,
        serviceDuration: serviceData.duration,
        addOnsDuration,
        totalDuration
      });

      // Use UnifiedSlotBookingService to get slots (same as customer booking)
      const slots = await UnifiedSlotBookingService.getUnifiedSlots(
        walkInFormData.barber_id,
        walkInFormData.appointment_date,
        totalDuration
      );

      console.log('📊 Walk-in unified slots loaded:', slots);
      setWalkInUnifiedSlots(slots);

      // If no available slots, load alternative barbers
      const availableSlots = slots.filter(slot => slot.type === 'available' && slot.canBook);
      if (availableSlots.length === 0) {
        console.log('🔄 No available slots, loading alternative barbers...');
        await loadWalkInAlternativeBarbers(totalDuration);
      }

    } catch (error) {
      console.error('Error loading walk-in unified slots:', error);
      setWalkInUnifiedSlots([]);
    } finally {
      setWalkInLoadingSlots(false);
    }
  };

  // Load alternative barbers for walk-in (same as customer booking)
  const loadWalkInAlternativeBarbers = async (totalDuration) => {
    try {
      console.log('🔄 Loading alternative barbers for walk-in...');
      
      const alternativeBarbers = [];
      
      for (const barber of barbers) {
        if (barber.id === walkInFormData.barber_id) continue; // Skip current barber
        
        // Get barber's availability for the date
        const { data: appointments, error } = await supabase
          .from('appointments')
          .select('appointment_time, total_duration, appointment_type, status')
          .eq('barber_id', barber.id)
          .eq('appointment_date', walkInFormData.appointment_date)
          .in('status', ['scheduled', 'confirmed', 'ongoing', 'pending']);
        
        if (error) {
          console.error('Error fetching appointments for barber:', barber.id, error);
          continue;
        }
        
        // Calculate available slots considering total duration (service + addons)
        const availableSlots = calculateAvailableSlotsWithDuration(
          appointments || [], 
          totalDuration
        );
        
        // Only include barbers who can accommodate the service
        if (availableSlots.length > 0) {
          alternativeBarbers.push({
            ...barber,
            availableSlots: availableSlots.length,
            nextAvailableTime: availableSlots[0]?.time || 'N/A'
          });
        }
      }
      
      console.log('📊 Alternative barbers for walk-in:', alternativeBarbers);
      setWalkInAlternativeBarbers(alternativeBarbers);
      setWalkInShowAlternatives(alternativeBarbers.length > 0);
      
    } catch (error) {
      console.error('Error loading alternative barbers for walk-in:', error);
      setWalkInAlternativeBarbers([]);
    }
  };

  // Calculate available slots with duration (helper function)
  const calculateAvailableSlotsWithDuration = (appointments, serviceDuration) => {
    const timeSlots = [];
    
    // Generate all possible time slots (8:00 AM - 4:30 PM, 30-minute intervals)
    for (let hour = 8; hour <= 16; hour++) {
      for (let minute of ['00', '30']) {
        // Include 4:30 PM, end at 4:30 PM
        if (hour === 16 && minute === '30') {
          const timeString = `${hour.toString().padStart(2, '0')}:${minute}`;
          const timeInMinutes = hour * 60 + parseInt(minute);
          
          // Check if this slot is available
          const isAvailable = !appointments?.some(apt => {
            if (!apt.appointment_time) return false; // Skip queue appointments
            
            const aptTime = apt.appointment_time.split(':');
            const aptTimeInMinutes = parseInt(aptTime[0]) * 60 + parseInt(aptTime[1]);
            const aptDuration = apt.total_duration || 30;
            
            // Check if the new appointment would conflict
            return timeInMinutes < aptTimeInMinutes + aptDuration && 
                   timeInMinutes + serviceDuration > aptTimeInMinutes;
          });

          if (isAvailable) {
            timeSlots.push({
              time: timeString,
              displayTime: convertTo12Hour(timeString)
            });
          }
          break; // End after 4:30 PM
        }
        
        const timeString = `${hour.toString().padStart(2, '0')}:${minute}`;
        const timeInMinutes = hour * 60 + parseInt(minute);
        
        // Check if this slot is available
        const isAvailable = !appointments?.some(apt => {
          if (!apt.appointment_time) return false; // Skip queue appointments
          
          const aptTime = apt.appointment_time.split(':');
          const aptTimeInMinutes = parseInt(aptTime[0]) * 60 + parseInt(aptTime[1]);
          const aptDuration = apt.total_duration || 30;
          
          // Check if the new appointment would conflict
          return timeInMinutes < aptTimeInMinutes + aptDuration && 
                 timeInMinutes + serviceDuration > aptTimeInMinutes;
        });

        if (isAvailable) {
          timeSlots.push({
            time: timeString,
            displayTime: convertTo12Hour(timeString)
          });
        }
      }
    }
    
    return timeSlots;
  };

  // Helper function to convert 24-hour format to 12-hour format
  const convertTo12Hour = (time24) => {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error for this field
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const errors = {};
    
    // Required fields
    if (!formData.barber_id) {
      errors.barber_id = 'Barber is required';
    }
    
    if (!formData.service_id) {
      errors.service_id = 'Service is required';
    }
    
    if (!formData.appointment_date) {
      errors.appointment_date = 'Date is required';
    }
    
    if (!formData.appointment_time) {
      errors.appointment_time = 'Time is required';
    }
    
    if (!formData.status) {
      errors.status = 'Status is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setLoading(true);
      
      const updates = {
        barber_id: formData.barber_id,
        service_id: formData.service_id,
        appointment_date: formData.appointment_date,
        appointment_time: formData.appointment_time,
        notes: formData.notes,
        status: formData.status,
        updated_at: new Date().toISOString()
      };
      
      // Update appointment
      const { data, error } = await supabase
        .from('appointments')
        .update(updates)
        .eq('id', selectedAppointment.id)
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .single();
      
      if (error) throw error;
      
      // Update local state
      setAppointments(prev => 
        prev.map(apt => apt.id === selectedAppointment.id ? data : apt)
      );
      
      // Create notification using centralized service (handles both database and push)
      try {
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
        await centralizedNotificationService.createNotification({
          userId: selectedAppointment.customer_id,
          title: 'Appointment Updated 📝',
          message: `Your appointment has been updated by the manager. New details: ${formData.appointment_date} at ${formData.appointment_time}`,
          type: 'appointment',
          channels: ['app', 'push'],
          data: {
            appointment_id: selectedAppointment.id,
            update_type: 'modified',
            new_date: formData.appointment_date,
            new_time: formData.appointment_time,
            barber_name: data.barber?.full_name
          }
        });
        console.log('✅ Appointment update notification sent via CentralizedNotificationService');
      } catch (notificationError) {
        console.warn('Failed to send appointment update notification:', notificationError);
      }
      
      // Close modal and reset form
      closeEditModal();
      
    } catch (error) {
      console.error('Error updating appointment:', error);
      setError('Failed to update appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (appointmentId, status) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('appointments')
        .update({ 
          status,
          updated_at: new Date().toISOString(),
          // Update queue position when status changes
          queue_position: status === 'done' || status === 'cancelled' ? null : 
                      status === 'ongoing' ? 0 : undefined  // 0 for ongoing (currently being served)
        })
        .eq('id', appointmentId)
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .single();
      
      if (error) throw error;
      
      // Update local state
      setAppointments(prev => 
        prev.map(apt => apt.id === appointmentId ? data : apt)
      );
      
      // Push notification is now handled by CentralizedNotificationService

      // Barber notification is now handled by CentralizedNotificationService
      
      // Create notification using centralized service (ONLY way to create notifications)
      const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
      
      // Notify customer
      await centralizedNotificationService.createAppointmentStatusNotification({
        userId: data.customer_id,
        appointmentId: appointmentId,
        status: status,
        changedBy: 'manager'
      });
      
      // Notify barber
      await centralizedNotificationService.createAppointmentStatusNotification({
        userId: data.barber_id,
        appointmentId: appointmentId,
        status: status,
        changedBy: 'manager'
      });
      
    } catch (error) {
      console.error('Error updating appointment status:', error);
      setError('Failed to update appointment status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (appointment) => {
    setSelectedAppointment(appointment);
    setShowDetailsModal(true);
  };

  const handleEdit = (appointment) => {
    setSelectedAppointment(appointment);
    setFormData({
      customer_id: appointment.customer_id,
      barber_id: appointment.barber_id,
      service_id: appointment.service_id,
      appointment_date: appointment.appointment_date,
      appointment_time: appointment.appointment_time,
      notes: appointment.notes || '',
      status: appointment.status
    });
    setShowEditModal(true);
  };

  const closeDetailsModal = () => {
    setSelectedAppointment(null);
    setShowDetailsModal(false);
  };

  const closeEditModal = () => {
    setSelectedAppointment(null);
    setFormData({
      customer_id: '',
      barber_id: '',
      service_id: '',
      appointment_date: '',
      appointment_time: '',
      notes: '',
      status: ''
    });
    setFormErrors({});
    setShowEditModal(false);
  };

  const handleWalkInChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    setWalkInFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear validation error for this field
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const handleWalkInTimeSlotSelect = (timeSlot) => {
    setWalkInFormData(prev => ({
      ...prev,
      appointment_time: timeSlot.time
    }));
  };

  // Handle unified slot selection (same as customer booking)
  const handleWalkInUnifiedSlotSelect = (slot) => {
    console.log('🎯 Selected unified slot for walk-in:', slot);
    
    // Determine appointment type based on slot availability and time
    let appointmentType = 'queue'; // Default to queue
    
    if (slot.type === 'available' && slot.canBook && slot.time) {
      appointmentType = 'scheduled'; // Has specific time = scheduled
    } else if (slot.type === 'queue_position') {
      appointmentType = 'queue'; // No specific time = queue
    }
    
    console.log('🎯 Determined appointment type for walk-in:', appointmentType, 'for slot:', slot);
    
    setWalkInFormData(prev => ({
      ...prev,
      appointment_time: slot.time || null,
      appointment_type: appointmentType
    }));
  };

  // Handle alternative barber selection for walk-in
  const handleWalkInAlternativeBarberSelect = (barberId) => {
    console.log('🎯 Selected alternative barber for walk-in:', barberId);
    setWalkInFormData(prev => ({
      ...prev,
      barber_id: barberId
    }));
    setWalkInShowAlternatives(false);
    // Reload slots for the new barber
    if (walkInFormData.appointment_date && walkInFormData.service_id) {
      loadWalkInUnifiedSlots();
    }
  };

  const validateWalkInForm = () => {
    const errors = {};
    
    // Required fields
    if (!walkInFormData.customer_name.trim()) {
      errors.customer_name = 'Customer name is required';
    }
    
    if (!walkInFormData.barber_id) {
      errors.barber_id = 'Barber is required';
    }
    
    if (!walkInFormData.service_id) {
      errors.service_id = 'Service is required';
    }
    
    if (!walkInFormData.appointment_date) {
      errors.appointment_date = 'Date is required';
    }
    
    // Time is now optional since we use the slot system
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleWalkInSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateWalkInForm()) {
      return;
    }
    
    try {
      setLoading(true);
      setError(''); // Clear previous errors
      
      console.log('🚀 Starting walk-in appointment creation...');
      console.log('📋 Form data:', walkInFormData);
      
      // Check if customer exists, if not create one
      let customerId = walkInFormData.primary_customer_id;
      
      if (!customerId && walkInFormData.customer_email) {
        console.log('🔍 Checking for existing customer by email...');
        // Try to find existing customer by email
        const { data: existingCustomer, error: customerSearchError } = await supabase
          .from('users')
          .select('id')
          .eq('email', walkInFormData.customer_email)
          .eq('role', 'customer')
          .single();
        
        if (customerSearchError && customerSearchError.code !== 'PGRST116') {
          console.error('❌ Error searching for customer:', customerSearchError);
          throw new Error(`Customer search failed: ${customerSearchError.message}`);
        }
        
        if (existingCustomer) {
          customerId = existingCustomer.id;
          console.log('✅ Found existing customer:', customerId);
        } else {
          console.log('👤 Creating new customer...');
          // Create new customer
          const { data: newCustomer, error: customerError } = await supabase
            .from('users')
            .insert([{
              email: walkInFormData.customer_email,
              full_name: walkInFormData.customer_name,
              phone: walkInFormData.customer_phone || '',
              role: 'customer'
            }])
            .select()
            .single();
          
          if (customerError) {
            console.error('❌ Error creating customer:', customerError);
            throw new Error(`Customer creation failed: ${customerError.message}`);
          }
          customerId = newCustomer.id;
          console.log('✅ Created new customer:', customerId);
        }
      }
      
      // Ensure we have a customer ID; if still none, create a minimal customer using provided name/phone
      if (!customerId) {
        console.log('👤 Creating minimal customer...');
        const { data: newMinimalCustomer, error: minimalErr } = await supabase
          .from('users')
          .insert([{
            email: walkInFormData.customer_email || null,
            full_name: walkInFormData.customer_name,
            phone: walkInFormData.customer_phone || '',
            role: 'customer'
          }])
          .select('id')
          .single();
        
        if (minimalErr) {
          console.error('❌ Error creating minimal customer:', minimalErr);
          throw new Error(`Minimal customer creation failed: ${minimalErr.message}`);
        }
        customerId = newMinimalCustomer.id;
        console.log('✅ Created minimal customer:', customerId);
      }

      // Validate required data before proceeding
      if (!customerId) {
        throw new Error('Customer ID is required but not available');
      }
      
      if (!walkInFormData.barber_id) {
        throw new Error('Barber ID is required');
      }
      
      if (!walkInFormData.service_id) {
        throw new Error('Service ID is required');
      }
      
      if (!walkInFormData.appointment_date) {
        throw new Error('Appointment date is required');
      }

      console.log('📅 Creating walk-in appointment with Advanced Hybrid Queue System...');
      console.log('👤 Customer ID:', customerId);
      console.log('👨‍💼 Barber ID:', walkInFormData.barber_id);
      console.log('🔧 Service ID:', walkInFormData.service_id);
      console.log('📅 Date:', walkInFormData.appointment_date);
      console.log('⏰ Time:', walkInFormData.appointment_time);
      console.log('🎯 Priority:', walkInFormData.priority_level);

      // Get service details for price and duration calculation
      const { data: serviceData, error: serviceError } = await supabase
        .from('services')
        .select('price, duration')
        .eq('id', walkInFormData.service_id)
        .single();

      if (serviceError) {
        console.error('❌ Error fetching service data:', serviceError);
        throw new Error(`Service data error: ${serviceError.message}`);
      }

      // Calculate add-ons price and duration
      let addOnsPrice = 0;
      let addOnsDuration = 0;
      
      if (walkInFormData.add_ons_data && walkInFormData.add_ons_data.length > 0) {
        const { data: addOnsData, error: addOnsError } = await supabase
          .from('add_ons')
          .select('price, duration')
          .in('id', walkInFormData.add_ons_data);
        
        if (!addOnsError && addOnsData) {
          addOnsPrice = addOnsData.reduce((sum, addon) => sum + addon.price, 0);
          addOnsDuration = addOnsData.reduce((sum, addon) => sum + addon.duration, 0);
        }
      }

      // Prepare appointment data using standardized field names (same as regular booking)
      const appointmentData = {
        [APPOINTMENT_FIELDS.CUSTOMER_ID]: customerId,
        [APPOINTMENT_FIELDS.BARBER_ID]: walkInFormData.barber_id,
        [APPOINTMENT_FIELDS.SERVICE_ID]: walkInFormData.service_id,
        [APPOINTMENT_FIELDS.SERVICES_DATA]: [walkInFormData.service_id], // Single service for walk-in
        [APPOINTMENT_FIELDS.ADD_ONS_DATA]: walkInFormData.add_ons_data || [], // Include selected add-ons
        [APPOINTMENT_FIELDS.APPOINTMENT_DATE]: walkInFormData.appointment_date,
        [APPOINTMENT_FIELDS.APPOINTMENT_TIME]: null, // Walk-in appointments are always queue type
        [APPOINTMENT_FIELDS.APPOINTMENT_TYPE]: 'queue', // Walk-in is always queue
        [APPOINTMENT_FIELDS.PRIORITY_LEVEL]: walkInFormData.priority_level || PRIORITY_LEVELS.NORMAL,
        [APPOINTMENT_FIELDS.STATUS]: BOOKING_STATUS.PENDING, // Start as pending like regular booking
        [APPOINTMENT_FIELDS.TOTAL_PRICE]: serviceData.price + addOnsPrice,
        [APPOINTMENT_FIELDS.TOTAL_DURATION]: serviceData.duration + addOnsDuration,
        [APPOINTMENT_FIELDS.NOTES]: walkInFormData.notes || '',
        [APPOINTMENT_FIELDS.IS_URGENT]: walkInFormData.priority_level === PRIORITY_LEVELS.URGENT,
        [APPOINTMENT_FIELDS.BOOK_FOR_FRIEND]: false, // Walk-in is for the customer themselves
        // Walk-in specific fields
        is_walk_in: true,
        is_double_booking: false, // Walk-in appointments are always single bookings
        primary_customer_id: walkInFormData.primary_customer_id || null,
        double_booking_data: null // No double booking for walk-in
      };

      console.log('📤 Walk-in booking with Advanced Hybrid System:', appointmentData);

      // Use Advanced Hybrid Queue Service for intelligent appointment insertion (same as regular booking)
      const result = await AdvancedHybridQueueService.smartInsertAppointment(appointmentData);

      if (!result.success) {
        console.error('❌ Advanced Hybrid Queue booking failed:', result.error);
        throw new Error(`Walk-in booking failed: ${result.error}`);
      }

      console.log('✅ Walk-in appointment created successfully with Advanced Hybrid System:', result);
      
      // Fetch the created appointment with full details
      const { data: createdAppointment, error: fetchError } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('id', result.appointment_id)
        .single();
      
      if (fetchError) {
        console.error('⚠️ Error fetching created appointment:', fetchError);
        // Don't throw error, we have the appointment ID from result
      }

      const data = createdAppointment || { id: result.appointment_id };
      
      // Update local state
      setAppointments(prev => [data, ...prev]);
      
      // Create notification for barber
      console.log('📢 Creating notification for barber...');
      const notificationData = {
        user_id: walkInFormData.barber_id,
        title: 'Walk-in Appointment Added',
        message: `Manager has added a walk-in appointment for ${walkInFormData.customer_name}. ${result.position ? `Queue position: #${result.position}` : ''} ${result.estimated_time ? `Est. time: ${result.estimated_time}` : ''}`,
        type: 'walk_in_appointment',
        data: {
          appointment_id: result.appointment_id,
          customer_name: walkInFormData.customer_name,
          queue_position: result.position,
          estimated_time: result.estimated_time,
          priority_level: walkInFormData.priority_level
        }
      };
      
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert([notificationData]);
      
      if (notificationError) {
        console.error('⚠️ Error creating notification:', notificationError);
        // Don't throw error for notification failure
      } else {
        console.log('✅ Notification created successfully');
      }
      
      // Show success message with position and estimated time
      const successMessage = `✅ Walk-in appointment created successfully!\n` +
        `Customer: ${walkInFormData.customer_name}\n` +
        `Position: #${result.position}\n` +
        `Estimated time: ${result.estimated_time || 'TBD'}`;
      
      // You can add a success state here if needed
      console.log('🎉 Walk-in appointment creation completed successfully!', successMessage);
      
      // Close modal and reset form
      closeWalkInModal();
      
    } catch (error) {
      console.error('❌ Error creating walk-in appointment:', error);
      const errorMessage = error.message || 'Failed to create walk-in appointment. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const closeWalkInModal = () => {
    setWalkInFormData({
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      barber_id: '',
      service_id: '',
      appointment_date: '',
      appointment_time: '',
      notes: '',
      priority_level: 'normal',
      is_walk_in: true,
      is_double_booking: false,
      primary_customer_id: ''
    });
    setFormErrors({});
    setShowWalkInModal(false);
  };

  // Product purchase handlers

  const handleAppointmentProductPurchase = (appointment) => {
    setSelectedAppointmentForProduct(appointment);
    setShowAppointmentProductModal(true);
  };

  const closeAppointmentProductModal = () => {
    setShowAppointmentProductModal(false);
    setSelectedAppointmentForProduct(null);
  };

  const handleProductPurchaseSuccess = (order) => {
    console.log('Product purchase completed:', order);
    // Refresh appointments or show success message
    fetchAppointments();
  };

  if (loading && !appointments.length && !barbers.length && !services.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container-fluid py-4">
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setError(null)} 
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-0">Manage Appointments</h2>
          <small className="text-muted">View and manage all appointments</small>
        </div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-success"
            onClick={() => setShowWalkInModal(true)}
          >
            <i className="bi bi-person-plus me-2"></i>
            Add Walk-in Appointment
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <SearchAndFilter 
        type="appointments"
        onResults={setAppointments}
        initialFilters={filters}
      />

      {/* Double Booking Filter */}
      <div className="card mb-3">
        <div className="card-body py-2">
          <div className="d-flex align-items-center gap-3">
            <div className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                id="doubleBookingFilter"
                checked={filters.double_booking_only}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  double_booking_only: e.target.checked
                }))}
              />
              <label className="form-check-label fw-medium" htmlFor="doubleBookingFilter">
                <i className="bi bi-people me-2 text-info"></i>
                Show only "Book a Friend" appointments
              </label>
            </div>
            {filters.double_booking_only && (
              <span className="badge bg-info bg-opacity-20 text-info">
                <i className="bi bi-funnel me-1"></i>
                Filtering friend bookings
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Appointments Table */}
      <div className="card">
        <div className="card-body">
          {appointments.length === 0 ? (
            <div className="text-center py-5">
              <div className="text-muted mb-3">
                <i className="bi bi-calendar-x fs-1"></i>
              </div>
              <p>No appointments found matching your criteria.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>
                      Customer
                      <small className="text-muted d-block">(includes friend bookings)</small>
                    </th>
                    <th>Barber</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments
                    .filter(appointment => {
                      // Apply double booking filter
                      if (filters.double_booking_only) {
                        return appointment.is_double_booking === true;
                      }
                      return true;
                    })
                    .map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        {formatDate(appointment.appointment_date)} <br />
                        <small className="text-muted">{formatTime(appointment.appointment_time)}</small>
                      </td>
                      <td>
                        <div className="d-flex align-items-start">
                          <div className="me-3 d-flex flex-column align-items-center">
                            {appointment.is_double_booking ? (
                              <div className="text-center">
                                <div className="bg-info text-white rounded-circle d-flex align-items-center justify-content-center mb-1" 
                                     style={{width: '32px', height: '32px'}}>
                                  <i className="bi bi-people-fill fs-6"></i>
                                </div>
                                <small className="text-info fw-bold">Double</small>
                              </div>
                            ) : (
                              <div className="text-center">
                                <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center mb-1" 
                                     style={{width: '32px', height: '32px'}}>
                                  <i className="bi bi-person-fill fs-6"></i>
                                </div>
                                <small className="text-primary fw-bold">Single</small>
                              </div>
                            )}
                          </div>
                          <div className="flex-grow-1">
                            <div className="fw-bold text-dark">
                              {appointment.customer?.full_name || 'Unknown'}
                            </div>
                            <small className="text-muted d-block mb-2">
                              <i className="bi bi-telephone me-1"></i>
                              {appointment.customer?.phone || 'No phone'}
                            </small>
                            {appointment.is_double_booking && appointment.double_booking_data && (
                              <div className="p-2 bg-info bg-opacity-10 border border-info rounded">
                                <div className="text-dark">
                                  <div className="mb-1">
                                    <i className="bi bi-person-check me-1 text-info"></i>
                                    <strong>Service For:</strong> {appointment.double_booking_data.friend_name || 'Friend'}
                                  </div>
                                  {appointment.double_booking_data.friend_phone && (
                                    <div className="mb-1">
                                      <i className="bi bi-telephone me-1 text-info"></i>
                                      <strong>Contact Number:</strong> {appointment.double_booking_data.friend_phone}
                                    </div>
                                  )}
                                  <div className="mb-1">
                                    <i className="bi bi-person-plus me-1 text-info"></i>
                                    <strong>Booked By:</strong> {appointment.double_booking_data.booked_by || 'Customer'}
                                  </div>
                                  {appointment.customer?.phone && appointment.customer.phone !== 'No phone' && (
                                    <div className="mb-0">
                                      <i className="bi bi-telephone-fill me-1 text-info"></i>
                                      <strong>Contact Number of Booked Person:</strong> {appointment.customer.phone}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{appointment.barber?.full_name || 'Unknown'}</td>
                      <td>
                        {appointment.service?.name || 'Unknown'} <br />
                        <small className="text-muted">{appointment.service?.duration} min</small>
                      </td>
                      <td>
                        <span className={`badge bg-${getStatusColor(appointment.status)}`}>
                          {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                        </span>
                        {appointment.is_double_booking && (
                          <span className="badge bg-info ms-1">
                            <i className="bi bi-people me-1"></i>
                            Friend
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="dropdown">
                          <button className="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" id={`dropdown-${appointment.id}`} data-bs-toggle="dropdown" aria-expanded="false">
                            Actions
                          </button>
                          <ul className="dropdown-menu" aria-labelledby={`dropdown-${appointment.id}`}>
                            <li>
                              <button className="dropdown-item" onClick={() => handleViewDetails(appointment)}>
                                <i className="bi bi-eye me-2"></i>View Details
                              </button>
                            </li>
                            <li>
                              <button className="dropdown-item" onClick={() => handleEdit(appointment)}>
                                <i className="bi bi-pencil me-2"></i>Edit
                              </button>
                            </li>
                            <li>
                              <button className="dropdown-item" onClick={() => handleAppointmentProductPurchase(appointment)}>
                                <i className="bi bi-cart-plus me-2"></i>Buy Products
                              </button>
                            </li>
                            <li><hr className="dropdown-divider" /></li>
                            <li className="dropdown-header">Change Status</li>
                            {Object.values(APPOINTMENT_STATUS).map(status => (
                              <li key={status}>
                                {status !== appointment.status && (
                                  <button 
                                    className="dropdown-item"
                                    onClick={() => handleStatusChange(appointment.id, status)}
                                  >
                                    <i className={`bi bi-check-circle me-2 text-${getStatusColor(status)}`}></i>
                                    Mark as {status.charAt(0).toUpperCase() + status.slice(1)}
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedAppointment && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Appointment Details</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={closeDetailsModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3 pb-3 border-bottom">
                  <span className={`badge bg-${getStatusColor(selectedAppointment.status)} mb-2`}>
                    {selectedAppointment.status.charAt(0).toUpperCase() + selectedAppointment.status.slice(1)}
                  </span>
                  <h5>
                    {formatDate(selectedAppointment.appointment_date)} at {formatTime(selectedAppointment.appointment_time)}
                  </h5>
                </div>
                
                <div className="row mb-3">
                  <div className="col-md-6">
                    <h6>Customer</h6>
                    <p className="mb-0">{selectedAppointment.customer?.full_name}</p>
                    <p className="mb-0">{selectedAppointment.customer?.email}</p>
                    <p className="mb-0">{selectedAppointment.customer?.phone}</p>
                    
                    {/* Double Booking Information */}
                    {selectedAppointment.is_double_booking && selectedAppointment.double_booking_data && (
                      <div className="mt-3 p-3 bg-info bg-opacity-10 border border-info rounded">
                        <h6 className="text-light mb-2">
                          <i className="bi bi-people me-2 text-info"></i>
                          Double Booking Details
                        </h6>
                        <p className="mb-1 text-dark">
                          <strong>Service For:</strong> {selectedAppointment.double_booking_data.friend_name || 'Friend'}
                        </p>
                        {selectedAppointment.double_booking_data.friend_phone && (
                          <p className="mb-1 text-dark">
                            <strong>Contact Number:</strong> {selectedAppointment.double_booking_data.friend_phone}
                          </p>
                        )}
                        <p className="mb-1 text-dark">
                          <strong>Booked By:</strong> {selectedAppointment.double_booking_data.booked_by || 'Customer'}
                        </p>
                        {selectedAppointment.customer?.phone && selectedAppointment.customer.phone !== 'No phone' && (
                          <p className="mb-0 text-dark">
                            <strong>Contact Number of Booked Person:</strong> {selectedAppointment.customer.phone}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="col-md-6">
                    <h6>Barber</h6>
                    <p className="mb-0">{selectedAppointment.barber?.full_name}</p>
                    <p className="mb-0">{selectedAppointment.barber?.email}</p>
                  </div>
                </div>
                
                <div className="mb-3">
                  <h6>Service</h6>
                  <p className="mb-0">{selectedAppointment.service?.name}</p>
                  <p className="mb-0">Duration: {selectedAppointment.service?.duration} minutes</p>
                  <p className="mb-0">Price: ₱{selectedAppointment.service?.price}</p>
                </div>
                
                {selectedAppointment.notes && (
                  <div className="mb-3">
                    <h6>Notes</h6>
                    <p className="mb-0">{selectedAppointment.notes}</p>
                  </div>
                )}
                
                <div className="mb-3">
                  <h6>System Info</h6>
                  <p className="mb-0">Created: {formatDate(selectedAppointment.created_at, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                  <p className="mb-0">Last Updated: {formatDate(selectedAppointment.updated_at, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={closeDetailsModal}
                >
                  Close
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={() => {
                    closeDetailsModal();
                    handleEdit(selectedAppointment);
                  }}
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedAppointment && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit Appointment</h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={closeEditModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleSubmit}>
                  <div className="mb-3">
                    <label htmlFor="customer" className="form-label">Customer</label>
                    <input
                      type="text"
                      className="form-control"
                      id="customer"
                      value={selectedAppointment.customer?.full_name}
                      disabled
                    />
                    <div className="form-text">Customer cannot be changed</div>
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="barber_id" className="form-label">Barber</label>
                    <select
                      className={`form-select ${formErrors.barber_id ? 'is-invalid' : ''}`}
                      id="barber_id"
                      name="barber_id"
                      value={formData.barber_id}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select Barber</option>
                      {barbers.map((barber) => (
                        <option key={barber.id} value={barber.id}>
                          {barber.full_name}
                        </option>
                      ))}
                    </select>
                    {formErrors.barber_id && (
                      <div className="invalid-feedback">{formErrors.barber_id}</div>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="service_id" className="form-label">Service</label>
                    <select
                      className={`form-select ${formErrors.service_id ? 'is-invalid' : ''}`}
                      id="service_id"
                      name="service_id"
                      value={formData.service_id}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select Service</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name} - ₱{service.price} ({service.duration} min)
                        </option>
                      ))}
                    </select>
                    {formErrors.service_id && (
                      <div className="invalid-feedback">{formErrors.service_id}</div>
                    )}
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label htmlFor="appointment_date" className="form-label">Date</label>
                      <input
                        type="date"
                        className={`form-control ${formErrors.appointment_date ? 'is-invalid' : ''}`}
                        id="appointment_date"
                        name="appointment_date"
                        value={formData.appointment_date}
                        onChange={handleChange}
                        required
                      />
                      {formErrors.appointment_date && (
                        <div className="invalid-feedback">{formErrors.appointment_date}</div>
                      )}
                    </div>
                    
                    <div className="col-md-6">
                      <label htmlFor="appointment_time" className="form-label">Time</label>
                      <select
                        className={`form-select ${formErrors.appointment_time ? 'is-invalid' : ''}`}
                        id="appointment_time"
                        name="appointment_time"
                        value={formData.appointment_time}
                        onChange={handleChange}
                        required
                        disabled={!formData.barber_id || !formData.appointment_date}
                      >
                        <option value="">Select Time</option>
                        {availableSlots.map((time) => (
                          <option key={time} value={time}>
                            {formatTime(time)}
                          </option>
                        ))}
                      </select>
                      {formErrors.appointment_time && (
                        <div className="invalid-feedback">{formErrors.appointment_time}</div>
                      )}
                      {formData.barber_id && formData.appointment_date && availableSlots.length === 0 && (
                        <div className="form-text text-danger">
                          No available slots for this date. Please try another date.
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="status" className="form-label">Status</label>
                    <select
                      className={`form-select ${formErrors.status ? 'is-invalid' : ''}`}
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select Status</option>
                      {Object.values(APPOINTMENT_STATUS).map((status) => (
                        <option key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </option>
                      ))}
                    </select>
                    {formErrors.status && (
                      <div className="invalid-feedback">{formErrors.status}</div>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="notes" className="form-label">Notes</label>
                    <textarea
                      className="form-control"
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      rows="3"
                    ></textarea>
                  </div>
                  
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeEditModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Walk-in Appointment Modal */}
      {showWalkInModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title">
                  <i className="bi bi-person-plus me-2"></i>
                  Add Walk-in Appointment
                </h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={closeWalkInModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleWalkInSubmit}>
                  {/* Customer Information */}
                  <div className="row mb-3">
                    <div className="col-12">
                      <h6 className="text-primary mb-3">
                        <i className="bi bi-person me-2"></i>
                        Customer Information
                      </h6>
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <label htmlFor="customer_name" className="form-label">Customer Name *</label>
                      <input
                        type="text"
                        className={`form-control ${formErrors.customer_name ? 'is-invalid' : ''}`}
                        id="customer_name"
                        name="customer_name"
                        value={walkInFormData.customer_name}
                        onChange={handleWalkInChange}
                        required
                        placeholder="Enter customer's full name"
                      />
                      {formErrors.customer_name && (
                        <div className="invalid-feedback">{formErrors.customer_name}</div>
                      )}
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <label htmlFor="customer_phone" className="form-label">Phone Number</label>
                      <input
                        type="tel"
                        className="form-control"
                        id="customer_phone"
                        name="customer_phone"
                        value={walkInFormData.customer_phone}
                        onChange={handleWalkInChange}
                        placeholder="Enter phone number"
                      />
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <label htmlFor="customer_email" className="form-label">Email Address</label>
                      <input
                        type="email"
                        className="form-control"
                        id="customer_email"
                        name="customer_email"
                        value={walkInFormData.customer_email}
                        onChange={handleWalkInChange}
                        placeholder="Enter email address (optional)"
                      />
                      <div className="form-text">If provided, we'll check for existing customer account</div>
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <label htmlFor="primary_customer_id" className="form-label">Existing Customer</label>
                      <select
                        className="form-select"
                        id="primary_customer_id"
                        name="primary_customer_id"
                        value={walkInFormData.primary_customer_id}
                        onChange={handleWalkInChange}
                      >
                        <option value="">Select existing customer (optional)</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.full_name} ({customer.email})
                          </option>
                        ))}
                      </select>
                      <div className="form-text">Choose this if customer already has an account</div>
                    </div>
                  </div>

                  {/* Note: Double booking not available for walk-in appointments */}
                  <div className="row mb-3">
                    <div className="col-12">
                      <div className="alert alert-info">
                        <i className="bi bi-info-circle me-2"></i>
                        <strong>Walk-in appointments are single bookings only.</strong> 
                        For double bookings, please use the regular booking system.
                      </div>
                    </div>
                  </div>

                  {/* Appointment Details */}
                  <div className="row mb-3">
                    <div className="col-12">
                      <h6 className="text-primary mb-3">
                        <i className="bi bi-calendar-check me-2"></i>
                        Appointment Details
                      </h6>
                    </div>
                    
                    <div className="col-12 mb-4">
                      <h6 className="text-primary mb-3">
                        <i className="bi bi-person-badge me-2"></i>
                        Select Barber *
                      </h6>
                      <div className="row g-3">
                        {barbers.map((barber) => {
                          // Calculate barber availability for today
                          const today = new Date().toISOString().split('T')[0];
                          const barberAppointmentsToday = appointments.filter(apt => 
                            apt.barber_id === barber.id && 
                            apt.appointment_date === today && 
                            apt.status !== 'cancelled'
                          );
                          const isAvailable = barberAppointmentsToday.length < 16; // Max 8 appointments per day
                          const currentQueue = barberAppointmentsToday.filter(apt => apt.appointment_type === 'queue').length;
                          
                          return (
                            <div key={barber.id} className="col-12">
                              <div 
                                className={`card h-100 cursor-pointer border-2 ${
                                  walkInFormData.barber_id === barber.id 
                                    ? 'border-primary bg-primary bg-opacity-10' 
                                    : isAvailable 
                                      ? 'border-success' 
                                      : 'border-danger'
                                }`}
                                onClick={() => handleWalkInChange({ target: { name: 'barber_id', value: barber.id } })}
                                style={{ cursor: 'pointer' }}
                              >
                                <div className="card-body">
                                  <div className="d-flex align-items-center">
                                    <div className="me-3">
                                      <i className={`bi bi-person-circle fs-1 ${
                                        walkInFormData.barber_id === barber.id 
                                          ? 'text-primary' 
                                          : isAvailable 
                                            ? 'text-success' 
                                            : 'text-danger'
                                      }`}></i>
                                    </div>
                                    <div className="flex-grow-1">
                                      <h6 className="card-title mb-1">{barber.full_name}</h6>
                                      <div className="mb-2">
                                        <span className={`badge ${
                                          isAvailable ? 'bg-success' : 'bg-danger'
                                        }`}>
                                          {isAvailable ? 'Available' : 'Fully Booked'}
                                        </span>
                                      </div>
                                    </div>
                                    {walkInFormData.barber_id === barber.id && (
                                      <div className="ms-3">
                                        <i className="bi bi-check-circle-fill text-primary fs-3"></i>
                                        <div className="small text-primary fw-bold">Selected</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {formErrors.barber_id && (
                        <div className="text-danger mt-2">
                          <i className="bi bi-exclamation-triangle me-1"></i>
                          {formErrors.barber_id}
                        </div>
                      )}
                    </div>
                    
                    <div className="col-12 mb-4">
                      <h6 className="text-primary mb-3">
                        <i className="bi bi-scissors me-2"></i>
                        Select Service *
                      </h6>
                      <div className="row g-3">
                        {services.map((service) => {
                          // Calculate service popularity/availability
                          const today = new Date().toISOString().split('T')[0];
                          const serviceBookingsToday = appointments.filter(apt => 
                            apt.service_id === service.id && 
                            apt.appointment_date === today && 
                            apt.status !== 'cancelled'
                          );
                          const isPopular = serviceBookingsToday.length >= 3;
                          
                          return (
                            <div key={service.id} className="col-12">
                              <div 
                                className={`card h-100 cursor-pointer border-2 ${
                                  walkInFormData.service_id === service.id 
                                    ? 'border-primary bg-primary bg-opacity-10' 
                                    : 'border-secondary'
                                }`}
                                onClick={() => handleWalkInChange({ target: { name: 'service_id', value: service.id } })}
                                style={{ cursor: 'pointer' }}
                              >
                                <div className="card-body">
                                  <div className="d-flex align-items-center">
                                    <div className="me-3">
                                      <i className={`bi bi-scissors fs-1 ${
                                        walkInFormData.service_id === service.id 
                                          ? 'text-primary' 
                                          : 'text-secondary'
                                      }`}></i>
                                    </div>
                                    <div className="flex-grow-1">
                                      <h6 className="card-title mb-1">{service.name}</h6>
                                      <div className="mb-2">
                                        <span className="badge bg-info me-1">
                                          ₱{service.price}
                                        </span>
                                        <span className="badge bg-secondary">
                                          {service.duration} min
                                        </span>
                                        {isPopular && (
                                          <span className="badge bg-warning ms-1">
                                            <i className="bi bi-fire me-1"></i>
                                            Popular Today
                                          </span>
                                        )}
                                      </div>
                                      <div className="small text-muted mb-1">
                                        {service.description || 'Professional service'}
                                      </div>
                                    </div>
                                    {walkInFormData.service_id === service.id && (
                                      <div className="ms-3">
                                        <i className="bi bi-check-circle-fill text-primary fs-3"></i>
                                        <div className="small text-primary fw-bold">Selected</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {formErrors.service_id && (
                        <div className="text-danger mt-2">
                          <i className="bi bi-exclamation-triangle me-1"></i>
                          {formErrors.service_id}
                        </div>
                      )}
                    </div>
                    
                    {/* Add-ons Selection */}
                    <div className="col-12 mb-4">
                      <h6 className="text-primary mb-3">
                        <i className="bi bi-plus-circle me-2"></i>
                        Select Add-ons (Optional)
                      </h6>
                      <div className="row g-3">
                        {addOns.map((addon) => {
                          // Calculate add-on popularity
                          const today = new Date().toISOString().split('T')[0];
                          const addonBookingsToday = appointments.filter(apt => {
                            if (!apt.add_ons_data) return false;
                            try {
                              const addonIds = typeof apt.add_ons_data === 'string' 
                                ? JSON.parse(apt.add_ons_data) 
                                : apt.add_ons_data;
                              return Array.isArray(addonIds) && addonIds.includes(addon.id);
                            } catch {
                              return false;
                            }
                          }).length;
                          const isPopular = addonBookingsToday >= 2;
                          const isSelected = walkInFormData.add_ons_data && 
                            (Array.isArray(walkInFormData.add_ons_data) 
                              ? walkInFormData.add_ons_data.includes(addon.id)
                              : walkInFormData.add_ons_data === addon.id);
                          
                          return (
                            <div key={addon.id} className="col-12">
                              <div 
                                className={`card h-100 cursor-pointer border-2 ${
                                  isSelected 
                                    ? 'border-primary bg-primary bg-opacity-10' 
                                    : 'border-light'
                                }`}
                                onClick={() => {
                                  const currentAddons = walkInFormData.add_ons_data || [];
                                  const addonIds = Array.isArray(currentAddons) ? currentAddons : [currentAddons];
                                  
                                  let newAddons;
                                  if (isSelected) {
                                    // Remove addon
                                    newAddons = addonIds.filter(id => id !== addon.id);
                                  } else {
                                    // Add addon
                                    newAddons = [...addonIds, addon.id];
                                  }
                                  
                                  handleWalkInChange({ 
                                    target: { 
                                      name: 'add_ons_data', 
                                      value: newAddons.length === 0 ? [] : newAddons 
                                    } 
                                  });
                                }}
                                style={{ cursor: 'pointer' }}
                              >
                                <div className="card-body">
                                  <div className="d-flex align-items-center">
                                    <div className="me-3">
                                      <i className={`bi bi-plus-circle fs-1 ${
                                        isSelected ? 'text-primary' : 'text-muted'
                                      }`}></i>
                                    </div>
                                    <div className="flex-grow-1">
                                      <h6 className="card-title mb-1">{addon.name}</h6>
                                      <div className="mb-2">
                                        <span className="badge bg-warning me-1">
                                          ₱{addon.price}
                                        </span>
                                        <span className="badge bg-info">
                                          +{addon.duration} min
                                        </span>
                                        {isPopular && (
                                          <span className="badge bg-warning ms-1">
                                            <i className="bi bi-fire me-1"></i>
                                            Popular Today
                                          </span>
                                        )}
                                      </div>
                                      <div className="small text-muted mb-1">
                                        {addon.description || 'Additional service'}
                                      </div>
                                    </div>
                                    {isSelected && (
                                      <div className="ms-3">
                                        <i className="bi bi-check-circle-fill text-primary fs-3"></i>
                                        <div className="small text-primary fw-bold">Selected</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2">
                        <small className="text-muted">
                          <i className="bi bi-info-circle me-1"></i>
                          Add-ons will increase the total price and service duration
                        </small>
                      </div>
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <label htmlFor="priority_level" className="form-label">Priority Level</label>
                      <select
                        className="form-select"
                        id="priority_level"
                        name="priority_level"
                        value={walkInFormData.priority_level}
                        onChange={handleWalkInChange}
                      >
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                        <option value="low">Low</option>
                      </select>
                      <div className="form-text">
                        <i className="bi bi-info-circle me-1"></i>
                        Urgent appointments go to the front of the queue
                      </div>
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <label htmlFor="appointment_date" className="form-label">Date *</label>
                      <input
                        type="date"
                        className={`form-control ${formErrors.appointment_date ? 'is-invalid' : ''}`}
                        id="appointment_date"
                        name="appointment_date"
                        value={walkInFormData.appointment_date}
                        onChange={handleWalkInChange}
                        min={new Date().toISOString().split('T')[0]}
                        required
                      />
                      {formErrors.appointment_date && (
                        <div className="invalid-feedback">{formErrors.appointment_date}</div>
                      )}
                    </div>
                    
                    {/* Enhanced Unified Slot System (like customer booking) */}
                    {walkInFormData.barber_id && walkInFormData.appointment_date && walkInFormData.service_id && (
                      <div className="col-12 mb-3">
                        <div className="d-flex align-items-center justify-content-between mb-3">
                          <h6 className="mb-0">
                            <i className="bi bi-magic me-2"></i>
                            Enhanced Slot System
                            <span className="badge bg-success ms-2">NEW</span>
                          </h6>
                          {walkInLoadingSlots && (
                            <div className="spinner-border spinner-border-sm text-primary" role="status">
                              <span className="visually-hidden">Loading...</span>
                            </div>
                      )}
                    </div>
                        
                        {walkInUnifiedSlots.length > 0 ? (
                          <div className="alert alert-info">
                            <h6 className="alert-heading">
                              <i className="bi bi-magic me-2"></i>
                              Smart Slot Management
                            </h6>
                            <p className="mb-3">Real-time availability with intelligent recommendations.</p>
                            
                            <div className="row g-2">
                              {walkInUnifiedSlots.map((slot, index) => (
                                <div key={index} className="col-3 col-md-2 col-lg-2">
                                  <button
                                    type="button"
                                    className={`btn w-100 ${
                                      slot.type === 'available' && slot.canBook
                                        ? walkInFormData.appointment_time === slot.time
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
                                    onClick={() => slot.canBook && handleWalkInUnifiedSlotSelect(slot)}
                                    disabled={!slot.canBook}
                                    title={slot.reason || (slot.canBook ? 'Click to select' : 'Not available')}
                                  >
                                    <div className="small fw-bold">
                                      {convertTo12Hour(slot.time)}
                                    </div>
                                    <div className="small">
                                      {slot.type === 'available' && 'Available'}
                                      {slot.type === 'scheduled' && 'Booked'}
                                      {slot.type === 'queue' && `Queue #${slot.queuePosition || 'X'}`}
                                      {slot.type === 'lunch' && 'Lunch'}
                                      {slot.type === 'full' && 'Full'}
                                    </div>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : !walkInLoadingSlots && (
                          <div className="text-center py-2">
                            <small className="text-muted">
                              <i className="bi bi-info-circle me-1"></i>
                              No available time slots for this service duration
                            </small>
                          </div>
                        )}

                        {/* Alternative Barbers (like customer booking) */}
                        {walkInShowAlternatives && walkInAlternativeBarbers.length > 0 && (
                          <div className="mt-3">
                            <div className="alert alert-warning">
                              <h6 className="alert-heading">
                                <i className="bi bi-people me-2"></i>
                                Alternative Barbers Available
                              </h6>
                              <p className="mb-3">The selected barber is fully booked. Consider these alternatives:</p>
                              
                              <div className="row g-2">
                                {walkInAlternativeBarbers.slice(0, 3).map((barber, index) => (
                                  <div key={index} className="col-12">
                                    <button
                                      type="button"
                                      className="btn btn-outline-warning w-100"
                                      onClick={() => handleWalkInAlternativeBarberSelect(barber.id)}
                                    >
                                      <div className="d-flex align-items-center justify-content-between">
                                        <div>
                                          <div className="fw-bold">{barber.full_name}</div>
                                          <div className="small text-muted">
                                            {barber.availableSlots} slots available
                                          </div>
                                        </div>
                                        <div className="text-end">
                                          <div className="small fw-bold text-success">
                                            Next: {convertTo12Hour(barber.nextAvailableTime)}
                                          </div>
                                          <div className="small text-muted">Click to switch</div>
                                        </div>
                                      </div>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="col-12 mb-3">
                      <label htmlFor="notes" className="form-label">Notes</label>
                      <textarea
                        className="form-control"
                        id="notes"
                        name="notes"
                        value={walkInFormData.notes}
                        onChange={handleWalkInChange}
                        rows="3"
                        placeholder="Any special requests or notes..."
                      ></textarea>
                    </div>
                  </div>
                  
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={closeWalkInModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-success"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Creating...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check-lg me-2"></i>
                          Create Walk-in Appointment
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Appointment Product Purchase Modal */}
      {showAppointmentProductModal && selectedAppointmentForProduct && (
        <AppointmentProductPurchase
          appointment={selectedAppointmentForProduct}
          onClose={closeAppointmentProductModal}
          onSuccess={handleProductPurchaseSuccess}
        />
      )}
    </div>
  );
};

export default ManageAppointments;