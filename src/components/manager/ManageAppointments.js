// components/manager/ManageAppointments.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/core/ApiService';
// REMOVED: PushService import - use only CentralizedNotificationService
import { formatDate, formatTime, getStatusColor, parseAddOnsData, mapLegacyAddonIds } from '../utils/helpers';
import { APPOINTMENT_STATUS } from '../utils/constants';
import LoadingSpinner from '../common/LoadingSpinner';
import SearchAndFilter from '../common/SearchAndFilter';
import AdvancedHybridQueueService from '../../services/queue/AdvancedHybridQueueService';
import UnifiedSlotBookingService from '../../services/booking/UnifiedSlotBookingService';
import PriorityQueueService from '../../services/queue/PriorityQueueService';
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

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusUpdateData, setStatusUpdateData] = useState({ appointmentId: null, newStatus: null });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);


  // Advanced Hybrid Queue System state
  const [queueAnalytics, setQueueAnalytics] = useState({});
  const [realTimeUpdates, setRealTimeUpdates] = useState(false);
  const [efficiencyMetrics, setEfficiencyMetrics] = useState({});

  // Premium Styles
  const styles = {
    container: {
      padding: windowWidth < 576 ? '1.5rem 1rem' : '2rem 1.5rem',
      backgroundColor: '#fcfcfc',
      minHeight: '100vh',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    },
    headerCard: {
      background: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
      border: '1px solid #f0f0f0',
      marginBottom: '1.5rem',
      display: 'flex',
      flexDirection: windowWidth < 650 ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: windowWidth < 650 ? 'stretch' : 'center',
      gap: '1rem'
    },
    card: {
      backgroundColor: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      border: '1px solid #eee',
      marginBottom: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden'
    },
    badge: (status) => {
      const colors = {
        pending: { bg: '#FFF3E0', text: '#E65100' },
        confirmed: { bg: '#E3F2FD', text: '#0D47A1' },
        ongoing: { bg: '#F3E5F5', text: '#7B1FA2' },
        completed: { bg: '#E8F5E9', text: '#1B5E20' },
        cancelled: { bg: '#FFEBEE', text: '#B71C1C' }
      };
      const color = colors[status] || { bg: '#f5f5f5', text: '#666' };
      return {
        padding: '0.4rem 0.8rem',
        borderRadius: '10px',
        fontSize: '0.7rem',
        fontWeight: '700',
        backgroundColor: color.bg,
        color: color.text,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      };
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      fontWeight: '600',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.6rem',
      transition: 'all 0.3s'
    },
    secondaryBtn: {
      backgroundColor: '#f5f5f5',
      color: '#1a1a1a',
      border: 'none',
      padding: '0.5rem 0.8rem',
      borderRadius: '12px',
      fontWeight: '600',
      fontSize: '0.8rem',
      transition: 'all 0.2s',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    tab: (active) => ({
      padding: '0.6rem 1.25rem',
      borderRadius: '14px',
      fontSize: '0.85rem',
      fontWeight: '700',
      cursor: 'pointer',
      transition: 'all 0.2s',
      backgroundColor: active ? '#1a1a1a' : 'transparent',
      color: active ? '#fff' : '#888',
      border: active ? 'none' : '1px solid transparent'
    }),
    modalOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.4)',
      backdropFilter: 'blur(8px)',
      zIndex: 1060,
      display: 'flex',
      alignItems: windowWidth < 576 ? 'flex-end' : 'center',
      justifyContent: 'center',
    },
    modalContent: {
      width: '100%',
      maxWidth: windowWidth < 576 ? '100%' : '600px',
      backgroundColor: '#fff',
      borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '28px',
      boxShadow: '0 -10px 40px rgba(0,0,0,0.1)',
      maxHeight: windowWidth < 576 ? '92vh' : '90vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: windowWidth < 576 ? 'slideUp 0.4s cubic-bezier(0, 0, 0.2, 1)' : 'scaleIn 0.3s ease-out'
    }
  };

  // Allowed statuses for ManageAppointments: Only Pending, Confirmed, Ongoing, Completed, Cancelled
  const ALLOWED_STATUSES = [
    APPOINTMENT_STATUS.PENDING,
    APPOINTMENT_STATUS.CONFIRMED,
    APPOINTMENT_STATUS.ONGOING,
    APPOINTMENT_STATUS.COMPLETED,
    APPOINTMENT_STATUS.CANCELLED
  ];

  const normalizeStatus = (status) => {
    const value = status?.toLowerCase();
    switch (value) {
      case 'done':
        return APPOINTMENT_STATUS.COMPLETED;
      case 'cancel':
        return APPOINTMENT_STATUS.CANCELLED;

      default:
        return value;
    }
  };

  const normalizeAppointmentRecord = (appointment = {}) => ({
    ...appointment,
    status: normalizeStatus(appointment.status)
  });

  const getDatabaseStatusOptions = (status) => {
    const canonical = normalizeStatus(status);
    // Only allow these 5 statuses: pending, confirmed, ongoing, completed, cancelled
    const allowedStatuses = [
      APPOINTMENT_STATUS.PENDING,
      APPOINTMENT_STATUS.CONFIRMED,
      APPOINTMENT_STATUS.ONGOING,
      APPOINTMENT_STATUS.COMPLETED,
      APPOINTMENT_STATUS.CANCELLED
    ];

    // If the canonical status is in the allowed list, use it directly
    if (allowedStatuses.includes(canonical)) {
      return [canonical];
    }

    // For any other status, return empty array (will be caught by validation)
    return [];
  };

  const buildStatusUpdatePayload = (dbStatus, canonicalStatus) => {
    const payload = {
      status: dbStatus,
      updated_at: new Date().toISOString()
    };

    if (canonicalStatus === APPOINTMENT_STATUS.CANCELLED) {
      payload.queue_position = null;
    }

    return payload;
  };

  const [filters, setFilters] = useState({
    status: '',
    barber_id: '',
    date_range: 'today',
    search: '',
    double_booking_only: false,
    add_on_id: ''
  });

  const [formData, setFormData] = useState({
    customer_id: '',
    barber_id: '',
    service_id: '',
    appointment_date: '',
    appointment_time: '',
    appointment_type: 'queue',
    queue_position: '',
    priority_level: 'normal',
    notes: '',
    status: ''
  });

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Fetch customers when component mounts


  const fetchInitialData = async () => {
    try {
      setLoading(true);

      // Fetch all in parallel
      const [barbersResult, servicesResult, customersResult, addOnsResult] = await Promise.all([
        fetchBarbers(),
        fetchServices(),
        fetchAddOns()
      ]);

      setBarbers(barbersResult);
      setServices(servicesResult);
      setAddOns(addOnsResult);

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
      .order('price', { ascending: true });

    if (error) throw error;
    return data || [];
  };

  const fetchAddOns = async () => {
    const { data, error } = await supabase
      .from('add_ons')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });

    if (error) {
      console.error('Error fetching add-ons:', error);
      throw error;
    }

    console.log('Fetched add-ons:', data);
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
        .order('appointment_time', { ascending: true });

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

      const normalizedAppointments = (data || []).map(normalizeAppointmentRecord);
      setAppointments(normalizedAppointments);

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
        .in('status', ['pending', 'confirmed', 'ongoing']);

      if (error) throw error;

      // Generate time slots with lunch break (8:00 AM - 11:30 AM, 1:00 PM - 4:30 PM) - 30-minute intervals
      const timeSlots = [];

      // Morning slots: 8:00 AM - 11:30 AM (30-minute intervals)
      for (let hour = 8; hour <= 11; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          // End at 11:30 AM
          if (hour === 11 && minute > 30) break;
          const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          timeSlots.push(time);
        }
      }

      // Afternoon slots: 1:00 PM - 4:30 PM (30-minute intervals)
      for (let hour = 13; hour <= 16; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          // End at 4:30 PM
          if (hour === 16 && minute > 30) break;
          const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
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

    // Only require time if it's a scheduled appointment
    if (formData.appointment_type === 'scheduled' && !formData.appointment_time) {
      errors.appointment_time = 'Time is required for scheduled appointments';
    }

    // Only require queue position if it's a queue appointment and user wants to set it manually
    // (It's optional - can be auto-assigned)

    if (!formData.status) {
      errors.status = 'Status is required';
    } else if (!ALLOWED_STATUSES.includes(formData.status)) {
      errors.status = `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`;
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
        appointment_time: formData.appointment_time || null,
        appointment_type: formData.appointment_type || 'queue',
        queue_position: formData.appointment_type === 'queue' ? (formData.queue_position || null) : null,
        priority_level: formData.appointment_type === 'queue' ? (formData.priority_level || 'normal') : null,
        notes: formData.notes,
        status: formData.status,
        updated_at: new Date().toISOString()
      };

      // If switching to scheduled, clear queue position
      if (formData.appointment_type === 'scheduled') {
        updates.queue_position = null;
        updates.priority_level = null;
      }

      // If switching to queue, clear appointment time
      if (formData.appointment_type === 'queue') {
        updates.appointment_time = null;
      }

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
        prev.map(apt => apt.id === selectedAppointment.id ? normalizeAppointmentRecord(data) : apt)
      );
      // Create notification using centralized service (handles both database and push)
      try {
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        await centralizedNotificationService.createNotification({
          userId: selectedAppointment.customer_id,
          appointmentId: selectedAppointment.id,
          title: 'Appointment Updated 📝',
          message: `Your appointment has been updated by the manager. New details: ${formData.appointment_date}${formData.appointment_time ? ` at ${formData.appointment_time}` : ' (Queue)'}`,
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

  const handleStatusChange = (appointmentId, status) => {
    // Show modal for status update
    setStatusUpdateData({ appointmentId, newStatus: status });
    setShowStatusModal(true);
  };

  const confirmStatusUpdate = async () => {
    const { appointmentId, newStatus } = statusUpdateData;
    const canonicalStatus = normalizeStatus(newStatus);

    try {
      setLoading(true);

      const payload = buildStatusUpdatePayload(canonicalStatus, canonicalStatus);

      const { data, error } = await supabase
        .from('appointments')
        .update(payload)
        .eq('id', appointmentId)
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .single();

      if (error) throw error;

      const updatedAppointment = normalizeAppointmentRecord(data);

      // Handle queue collapse if cancelled
      if (canonicalStatus === 'cancelled' && updatedAppointment.queue_position != null) {
        try {
          const { default: ComprehensiveQueueManager } = await import('../../services/queue/ComprehensiveQueueManager');
          await ComprehensiveQueueManager.collapseQueuePositions(
            updatedAppointment.barber_id,
            updatedAppointment.appointment_date,
            updatedAppointment.queue_position
          );
        } catch (collapseErr) {
          console.warn('Queue collapse error:', collapseErr);
        }
      }

      setAppointments(prev =>
        prev.map(apt => apt.id === appointmentId ? updatedAppointment : apt)
      );

      setShowStatusModal(false);
      setStatusUpdateData({ appointmentId: null, newStatus: null });

      // Notify
      const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
      await centralizedNotificationService.createAppointmentStatusNotification({
        userId: updatedAppointment.customer_id,
        appointmentId: appointmentId,
        status: canonicalStatus,
        changedBy: 'manager'
      });

    } catch (error) {
      console.error('Error updating status:', error);
      setError('Failed to update: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveEmergency = async (appointment) => {
    const today = new Date().toISOString().split('T')[0];
    if (appointment.appointment_date < today) {
      alert("Cannot approve Urgent Priority for past appointments.");
      return;
    }

    if (!window.confirm(`Are you sure you want to approve this appointment for Urgent Priority? This will shift the entire schedule.`)) {
      return;
    }

    try {
      setLoading(true);
      const managerId = (await supabase.auth.getUser()).data.user?.id;

      await PriorityQueueService.approveEmergencyBooking(
        appointment.id,
        managerId || 'system',
        'Manager urgent override'
      );

      alert('Urgent Priority request approved. Queue has been recalculated.');
      fetchAppointments();
    } catch (error) {
      console.error('Emergency approval failed:', error);
      alert('Failed to approve emergency: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const closeStatusModal = () => {
    setShowStatusModal(false);
    setStatusUpdateData({ appointmentId: null, newStatus: null });
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
      appointment_time: appointment.appointment_time || '',
      appointment_type: appointment.appointment_type || 'queue',
      queue_position: appointment.queue_position || '',
      priority_level: appointment.priority_level || 'normal',
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
      appointment_type: 'queue',
      queue_position: '',
      priority_level: 'normal',
      notes: '',
      status: ''
    });
    setFormErrors({});
    setShowEditModal(false);
  };






  if (loading && !appointments.length && !barbers.length && !services.length) {
    return <LoadingSpinner />;
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.headerCard}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
            <i className="bi bi-calendar-check me-2" style={{ color: '#5D4037' }}></i>
            Manage Appointments
          </h2>
          <p className="text-muted small mb-0">Total system appointments: {appointments.length}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {/* Action buttons could go here */}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger rounded-4 border-0 shadow-sm d-flex align-items-center mb-4">
          <i className="bi bi-exclamation-circle-fill me-2"></i>
          <span className="small fw-bold">{error}</span>
          <button className="btn-close ms-auto" onClick={() => setError(null)}></button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="d-flex gap-2 mb-3 overflow-auto pb-2" style={{ whiteSpace: 'nowrap' }}>
        <div style={styles.tab(filters.date_range === 'today')} onClick={() => setFilters(prev => ({ ...prev, date_range: 'today' }))}>TODAY</div>
        <div style={styles.tab(filters.date_range === 'week')} onClick={() => setFilters(prev => ({ ...prev, date_range: 'week' }))}>UPCOMING</div>
        <div style={styles.tab(filters.date_range === 'month')} onClick={() => setFilters(prev => ({ ...prev, date_range: 'month' }))}>MONTHLY</div>
        <div style={styles.tab(filters.date_range === 'all')} onClick={() => setFilters(prev => ({ ...prev, date_range: 'all' }))}>VIEW ALL</div>
      </div>

      {/* Filters & Search Card */}
      <div style={{ ...styles.headerCard, padding: '1rem', background: '#fff' }}>
        <div className="row g-2 w-100 align-items-center">
          <div className="col-md-6">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white border-end-0 rounded-start-4">
                <i className="bi bi-search text-muted"></i>
              </span>
              <input 
                type="text" 
                className="form-control border-start-0 rounded-end-4 bg-white" 
                placeholder="Search by customer or barber..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>
          </div>
          <div className="col-md-3">
            <select 
              className="form-select form-select-sm rounded-4" 
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="">All Statuses</option>
              {ALLOWED_STATUSES.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <select 
              className="form-select form-select-sm rounded-4" 
              value={filters.barber_id}
              onChange={(e) => setFilters(prev => ({ ...prev, barber_id: e.target.value }))}
            >
              <option value="">All Barbers</option>
              {barbers.map(b => (
                <option key={b.id} value={b.id}>{b.full_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ ...styles.headerCard, padding: '0.8rem 1.25rem', background: '#f8f9fa', marginBottom: '1rem' }}>
        <div className="form-check form-switch mb-0">
          <input 
            className="form-check-input" 
            type="checkbox" 
            id="doubleBookingSwitch"
            checked={filters.double_booking_only}
            onChange={(e) => setFilters(prev => ({ ...prev, double_booking_only: e.target.checked }))}
          />
          <label className="form-check-label small fw-bold text-muted" htmlFor="doubleBookingSwitch">
            <i className="bi bi-people me-1"></i> SHOW FRIEND BOOKINGS ONLY
          </label>
        </div>
      </div>

      {/* Appointments Table */}
      <div className="appointments-table-container">
        {loading ? (
          <div className="text-center py-5"><div className="spinner-border text-dark"></div></div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-5 bg-white rounded-5 border">
            <i className="bi bi-calendar-x fs-1 text-muted opacity-25"></i>
            <p className="text-muted mt-3 fw-bold">No appointments found</p>
          </div>
        ) : (
          <div className="card border-0 shadow-sm" style={{ borderRadius: '24px', overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0" style={{ backgroundColor: '#fff' }}>
                <thead style={{ backgroundColor: '#fcfcfc', borderBottom: '1px solid #eee' }}>
                  <tr>
                    <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>DATE & TIME</th>
                    <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>CUSTOMER</th>
                    <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>BARBER</th>
                    <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>SERVICE</th>
                    <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }}>STATUS</th>
                    <th style={{ padding: '1.25rem', fontSize: '0.75rem', fontWeight: '800', color: '#888', letterSpacing: '1px', textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments
                    .filter(appointment => {
                      if (filters.double_booking_only && !appointment.is_double_booking) return false;
                      return true;
                    })
                    .map(appointment => {
                      const canonicalStatus = normalizeStatus(appointment.status) || appointment.status;
                      return (
                        <tr key={appointment.id} style={{ transition: 'all 0.2s' }}>
                          <td style={{ padding: '1.25rem' }}>
                            <div className="fw-800" style={{ fontSize: '0.9rem', color: '#1a1a1a' }}>{formatDate(appointment.appointment_date)}</div>
                            <div className="small text-muted fw-bold" style={{ fontSize: '0.75rem' }}>
                              <i className="bi bi-clock me-1"></i> {formatTime(appointment.appointment_time) || 'QUEUE'}
                            </div>
                            {appointment.queue_position && (
                              <span className="badge bg-dark rounded-pill mt-1" style={{ fontSize: '0.6rem' }}>Q#{appointment.queue_position}</span>
                            )}
                          </td>
                          <td style={{ padding: '1.25rem' }}>
                            <div className="d-flex align-items-center gap-3">
                              <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: appointment.is_double_booking ? '#E3F2FD' : '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <i className={`bi bi-person${appointment.is_double_booking ? '-fill text-primary' : ''} fs-5`}></i>
                              </div>
                              <div>
                                <div className="fw-800" style={{ fontSize: '0.9rem' }}>{appointment.customer?.full_name || 'Anonymous'}</div>
                                <div className="small text-muted" style={{ fontSize: '0.75rem' }}>{appointment.customer?.phone || '--'}</div>
                                {appointment.is_double_booking && (
                                  <span className="badge bg-info text-white mt-1" style={{ fontSize: '0.6rem' }}>FRIEND BOOKING</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '1.25rem' }}>
                            <div className="small fw-700" style={{ color: '#5D4037' }}>{appointment.barber?.full_name || '--'}</div>
                          </td>
                          <td style={{ padding: '1.25rem' }}>
                            <div className="small fw-800" style={{ fontSize: '0.85rem' }}>{appointment.service?.name || '--'}</div>
                            <div className="small text-muted" style={{ fontSize: '0.7rem' }}>₱{appointment.service?.price || 0} • {appointment.service?.duration || 0}m</div>
                          </td>
                          <td style={{ padding: '1.25rem' }}>
                            <span style={styles.badge(canonicalStatus)}>{canonicalStatus}</span>
                          </td>
                          <td style={{ padding: '1.25rem', textAlign: 'right' }}>
                            <div className="d-flex gap-2 justify-content-end">
                              <button style={styles.secondaryBtn} className="touch-btn" title="View Details" onClick={() => handleViewDetails(appointment)}>
                                <i className="bi bi-eye"></i>
                              </button>
                              <button style={styles.secondaryBtn} className="touch-btn" title="Edit" onClick={() => handleEdit(appointment)}>
                                <i className="bi bi-pencil"></i>
                              </button>
                              
                              {/* Approve Urgent Override */}
                              {appointment.priority_level !== '1' && 
                               appointment.status !== 'ongoing' && 
                               !['completed', 'cancelled', 'cancel', 'done'].includes(appointment.status?.toLowerCase()) && 
                               appointment.appointment_date >= new Date().toISOString().split('T')[0] && (
                                <button style={{ ...styles.secondaryBtn, color: '#E65100', background: '#FFF3E0' }} className="touch-btn" title="Approve Urgent" onClick={() => handleApproveEmergency(appointment)}>
                                  <i className="bi bi-lightning-charge-fill"></i>
                                </button>
                              )}

                              {['pending', 'confirmed'].includes(canonicalStatus) && (
                                <button style={{ ...styles.secondaryBtn, color: '#1B5E20', background: '#E8F5E9' }} className="touch-btn" title="Mark Done" onClick={() => handleStatusChange(appointment.id, 'completed')}>
                                  <i className="bi bi-check2-circle"></i>
                                </button>
                              )}
                              {canonicalStatus !== 'cancelled' && (
                                <button style={{ ...styles.secondaryBtn, color: '#B71C1C', background: '#FFEBEE' }} className="touch-btn" title="Cancel" onClick={() => handleStatusChange(appointment.id, 'cancelled')}>
                                  <i className="bi bi-x-circle"></i>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals Container */}
      {(showDetailsModal || showEditModal || showStatusModal) && (
        <div style={styles.modalOverlay} onClick={(e) => {
          if (e.target === e.currentTarget && !loading) {
            setShowDetailsModal(false); setShowEditModal(false); setShowStatusModal(false);
          }
        }}>
          <div style={styles.modalContent}>
            {/* Drag Indicator */}
            {windowWidth < 576 && (
              <div style={{ padding: '12px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '40px', height: '4px', backgroundColor: '#e0e0e0', borderRadius: '2px' }}></div>
              </div>
            )}

            {/* Modal Header */}
            <div className="p-4 border-bottom d-flex justify-content-between align-items-center">
              <h5 className="m-0 fw-800">
                {showDetailsModal && 'Appointment Details'}
                {showEditModal && 'Edit Appointment'}
                {showStatusModal && 'Update Status'}
              </h5>
              <button className="btn-close" disabled={loading} onClick={() => {
                setShowDetailsModal(false); setShowEditModal(false); setShowStatusModal(false);
              }}></button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-auto premium-scroll">
              {showDetailsModal && selectedAppointment && (
                <div className="d-flex flex-column gap-4">
                  <div className="d-flex align-items-center gap-3">
                    <div style={{ width: '64px', height: '64px', borderRadius: '20px', backgroundColor: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="bi bi-person fs-2 text-muted"></i>
                    </div>
                    <div>
                      <h4 className="fw-800 m-0">{selectedAppointment.customer?.full_name || 'Anonymous'}</h4>
                      <div className="text-muted small fw-bold mt-1">
                        <i className="bi bi-telephone me-1"></i> {selectedAppointment.customer?.phone || '--'}
                      </div>
                    </div>
                  </div>

                  <div className="row g-3">
                    <div className="col-6">
                      <div className="p-3 bg-light rounded-4">
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }} className="mb-1">BARBER</div>
                        <div className="fw-800 small">{selectedAppointment.barber?.full_name || '--'}</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-3 bg-light rounded-4">
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }} className="mb-1">SERVICE</div>
                        <div className="fw-800 small text-truncate">{selectedAppointment.service?.name || '--'}</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-3 bg-light rounded-4">
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }} className="mb-1">DATE</div>
                        <div className="fw-800 small">{formatDate(selectedAppointment.appointment_date)}</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-3 bg-light rounded-4">
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }} className="mb-1">TIME</div>
                        <div className="fw-800 small">{formatTime(selectedAppointment.appointment_time) || 'QUEUE'}</div>
                      </div>
                    </div>
                  </div>

                  {selectedAppointment.is_double_booking && selectedAppointment.double_booking_data && (
                    <div className="p-3 border border-info rounded-4 bg-info bg-opacity-10">
                      <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#0288D1', letterSpacing: '1px' }} className="mb-2">
                        <i className="bi bi-people-fill me-1"></i> FRIEND BOOKING DETAILS
                      </div>
                      <div className="small fw-800 mb-1">Name: {selectedAppointment.double_booking_data.friend_name}</div>
                      <div className="small text-muted mb-1">Phone: {selectedAppointment.double_booking_data.friend_phone || '--'}</div>
                      <div className="small text-muted mt-2 pt-2 border-top border-info border-opacity-25" style={{ fontSize: '0.7rem' }}>
                        Booked by: {selectedAppointment.double_booking_data.booked_by}
                      </div>
                    </div>
                  )}

                  {selectedAppointment.notes && (
                    <div className="p-3 border rounded-4">
                      <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#888', letterSpacing: '1px' }} className="mb-2">NOTES</div>
                      <p className="small m-0 text-muted">{selectedAppointment.notes}</p>
                    </div>
                  )}

                  <div className="d-flex gap-2 mt-2">
                    <button style={{ ...styles.primaryBtn, flex: 1 }} onClick={() => { setShowDetailsModal(false); handleEdit(selectedAppointment); }}>
                      <i className="bi bi-pencil"></i> EDIT APPOINTMENT
                    </button>
                    <button style={{ ...styles.secondaryBtn, width: '50px', height: '50px', borderRadius: '16px' }} onClick={() => setShowDetailsModal(false)}>
                      <i className="bi bi-x-lg"></i>
                    </button>
                  </div>
                </div>
              )}

              {showEditModal && (
                <form onSubmit={handleSubmit} className="d-flex flex-column gap-3">
                  <div className="row g-3">
                    <div className="col-12">
                      <label className="small fw-bold mb-1">Barber</label>
                      <select className="form-select rounded-3" name="barber_id" value={formData.barber_id} onChange={handleChange} required>
                        <option value="">Select Barber</option>
                        {barbers.map(b => (
                          <option key={b.id} value={b.id}>{b.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="small fw-bold mb-1">Service</label>
                      <select className="form-select rounded-3" name="service_id" value={formData.service_id} onChange={handleChange} required>
                        <option value="">Select Service</option>
                        {services.map(s => (
                          <option key={s.id} value={s.id}>{s.name} - ₱{s.price}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6">
                      <label className="small fw-bold mb-1">Date</label>
                      <input type="date" className="form-control rounded-3" name="appointment_date" value={formData.appointment_date} onChange={handleChange} required />
                    </div>
                    <div className="col-6">
                      <label className="small fw-bold mb-1">Status</label>
                      <select className="form-select rounded-3" name="status" value={formData.status} onChange={handleChange} required>
                        {ALLOWED_STATUSES.map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-12">
                      <label className="small fw-bold mb-1">Notes</label>
                      <textarea className="form-control rounded-3" name="notes" value={formData.notes} onChange={handleChange} rows="2"></textarea>
                    </div>
                  </div>
                  <button style={{ ...styles.primaryBtn, marginTop: '1rem' }} type="submit" disabled={loading}>
                    {loading ? 'SAVING...' : 'SAVE CHANGES'}
                  </button>
                </form>
              )}

              {showStatusModal && (
                <div className="text-center py-2">
                  <div className="mb-4">
                    <div className="rounded-circle bg-light d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: '80px', height: '80px' }}>
                      <i className={`bi bi-arrow-repeat fs-1 text-${getStatusColor(statusUpdateData.newStatus)}`}></i>
                    </div>
                    <h5 className="fw-800">Update to {statusUpdateData.newStatus?.toUpperCase()}?</h5>
                    <p className="text-muted small mt-2">The customer will receive a notification regarding this status change.</p>
                  </div>
                  <div className="d-flex gap-2">
                    <button className="btn btn-light flex-fill rounded-4 py-3 fw-800 small" onClick={() => setShowStatusModal(false)} disabled={loading}>CANCEL</button>
                    <button 
                      className={`btn btn-${getStatusColor(statusUpdateData.newStatus)} flex-fill rounded-4 py-3 fw-800 small text-white`} 
                      onClick={confirmStatusUpdate} 
                      disabled={loading}
                    >
                      {loading ? 'UPDATING...' : 'CONFIRM UPDATE'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .fw-800 { font-weight: 800; }
        .touch-btn:active { transform: scale(0.96); }
        .table-hover tbody tr:hover {
          background-color: #fcfcfc !important;
          transform: scale(1.002);
        }
        .premium-scroll::-webkit-scrollbar { width: 4px; }
        .premium-scroll::-webkit-scrollbar-thumb { background: #eee; border-radius: 10px; }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default ManageAppointments;
