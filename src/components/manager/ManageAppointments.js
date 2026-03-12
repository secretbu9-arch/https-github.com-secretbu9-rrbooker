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


  // Advanced Hybrid Queue System state
  const [queueAnalytics, setQueueAnalytics] = useState({});
  const [realTimeUpdates, setRealTimeUpdates] = useState(false);
  const [efficiencyMetrics, setEfficiencyMetrics] = useState({});

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
      <div className="d-flex justify-content-between align-items-center mb-4 p-3 rounded shadow-sm" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' }}>
        <div>
          <h2 className="mb-0 fw-bold">Manage Appointments</h2>
          <small className="text-muted">View and manage all appointments</small>
        </div>
        <div className="d-flex gap-2">
        </div>
      </div>

      {/* Search and Filters */}
      <SearchAndFilter
        type="appointments"
        onResults={setAppointments}
        initialFilters={filters}
      />

      {/* Filters Row */}
      <div className="row mb-3">
        <div className="col-md-12">
          <div className="card border-0 shadow-sm">
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
                    <th className="text-center">Queue #</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments
                    .filter(appointment => {
                      // Apply double booking filter
                      if (filters.double_booking_only) {
                        if (!appointment.is_double_booking) return false;
                      }

                      // Apply add-on filter
                      return true;
                    })
                    .map((appointment) => {
                      const canonicalStatus = normalizeStatus(appointment.status) || appointment.status;
                      const displayStatus = canonicalStatus || appointment.status || '';

                      const isPriorityOne = appointment.priority_level === '1';
                      const isUrgent = appointment.priority_level === 'urgent';
                      const hasHighPriority = isPriorityOne || isUrgent;

                      return (
                        <tr key={appointment.id} className={isPriorityOne ? 'table-danger border-left-priority' : isUrgent ? 'table-warning opacity-90' : ''}>
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
                                      style={{ width: '32px', height: '32px' }}>
                                      <i className="bi bi-people-fill fs-6"></i>
                                    </div>
                                    <small className="text-info fw-bold">Double</small>
                                  </div>
                                ) : (
                                  <div className="text-center">
                                    <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center mb-1"
                                      style={{ width: '32px', height: '32px' }}>
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
                            {(() => {
                              if (!appointment.add_ons_data) return null;

                              const addOnIds = parseAddOnsData(appointment.add_ons_data);

                              if (!addOnIds || addOnIds.length === 0) return null;
                              if (!addOns || addOns.length === 0) return null;

                              // Fetch full add-on data using UUIDs from database
                              const appointmentAddOns = addOnIds.map(addonId => {
                                // First, try to find by original ID (in case it's already a UUID)
                                let addon = addOns.find(a => a.id === addonId);

                                // If not found, map legacy ID to UUID and try again
                                if (!addon) {
                                  const mappedIds = mapLegacyAddonIds([addonId], addOns);
                                  if (mappedIds.length > 0 && mappedIds[0]) {
                                    addon = addOns.find(a => a.id === mappedIds[0]);
                                  }
                                }

                                // If found, return full addon data from database
                                if (addon) {
                                  return {
                                    name: addon.name,
                                    price: addon.price,
                                    duration: addon.duration,
                                    id: addon.id
                                  };
                                }

                                // If not found, skip it
                                return null;
                              }).filter(Boolean);

                              if (appointmentAddOns.length > 0) {
                                return (
                                  <div className="mt-2">
                                    <small className="text-muted d-block mb-1">
                                      <i className="bi bi-plus-circle me-1"></i>
                                      <strong>Add-ons:</strong>
                                    </small>
                                    {appointmentAddOns.map((addon, index) => (
                                      <span key={index} className="badge bg-secondary me-1 mb-1">
                                        {addon.name} {addon.price > 0 && `(₱${addon.price})`}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }

                              return null;
                            })()}
                          </td>
                          <td className="text-center">
                            {appointment.queue_position !== null && appointment.queue_position !== undefined ? (
                              <div className="d-flex justify-content-center align-items-center">
                                <div className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold"
                                  style={{ width: '40px', height: '40px', fontSize: '16px' }}>
                                  {appointment.queue_position}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted small">-</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge bg-${getStatusColor(displayStatus)}`}>
                              {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
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
                                  <button
                                    className="dropdown-item text-danger fw-bold"
                                    onClick={() => handleApproveEmergency(appointment)}
                                    disabled={
                                      appointment.priority_level === '1' ||
                                      appointment.status === 'ongoing' ||
                                      ['completed', 'cancelled', 'cancel', 'done'].includes(appointment.status?.toLowerCase()) ||
                                      appointment.appointment_date < new Date().toISOString().split('T')[0]
                                    }
                                  >
                                    <i className="bi bi-lightning-charge-fill me-2"></i>Approve Urgent Priority
                                  </button>
                                </li>
                                <li><hr className="dropdown-divider" /></li>
                                <li className="dropdown-header">Change Status</li>
                                {ALLOWED_STATUSES.map(status => (
                                  <li key={status}>
                                    {status !== displayStatus && (
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
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Details Modal */}
      {showDetailsModal && selectedAppointment && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title">
                  <i className="bi bi-calendar-check me-2"></i>
                  Appointment Details
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeDetailsModal}
                ></button>
              </div>
              <div className="modal-body p-4">
                {/* Header Section with Status and Queue */}
                <div className="mb-4 pb-3 border-bottom">
                  <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                    {selectedAppointment.queue_position !== null && selectedAppointment.queue_position !== undefined && (
                      <div className="rounded-circle bg-info text-white d-flex align-items-center justify-content-center fw-bold"
                        style={{ width: '50px', height: '50px', fontSize: '20px' }}>
                        {selectedAppointment.queue_position}
                      </div>
                    )}
                    <span className={`badge bg-${getStatusColor(selectedAppointment.status)} fs-6 px-3 py-2`}>
                      <i className={`bi bi-${selectedAppointment.status === 'ongoing' ? 'scissors' : selectedAppointment.status === 'completed' ? 'check-circle-fill' : selectedAppointment.status === 'cancelled' ? 'x-circle-fill' : selectedAppointment.status === 'confirmed' ? 'check-circle' : 'clock-fill'} me-2`}></i>
                      {selectedAppointment.status.charAt(0).toUpperCase() + selectedAppointment.status.slice(1)}
                    </span>
                    {selectedAppointment.is_urgent && (
                      <span className="badge bg-warning text-dark fs-6 px-3 py-2">
                        <i className="bi bi-lightning-fill me-1"></i>
                        Urgent
                      </span>
                    )}
                    {selectedAppointment.is_double_booking && (
                      <span className="badge bg-info fs-6 px-3 py-2">
                        <i className="bi bi-people me-1"></i>
                        Double Booking
                      </span>
                    )}
                  </div>
                  <div className="d-flex align-items-center mb-2">
                    <i className="bi bi-calendar3 me-2 text-primary fs-5"></i>
                    <h4 className="mb-0">{formatDate(selectedAppointment.appointment_date)}</h4>
                  </div>
                  {selectedAppointment.appointment_time && (
                    <div className="d-flex align-items-center">
                      <i className="bi bi-clock me-2 text-muted"></i>
                      <span className="text-muted">{formatTime(selectedAppointment.appointment_time)}</span>
                    </div>
                  )}
                </div>

                <div className="row mb-4">
                  <div className="col-md-6 mb-3">
                    <div className="card border-0 bg-light h-100">
                      <div className="card-body">
                        <h6 className="card-title text-primary mb-3">
                          <i className="bi bi-person-fill me-2"></i>
                          Customer Information
                        </h6>
                        <div className="mb-2">
                          <strong className="text-muted small d-block">Name</strong>
                          <span className="fs-6">{selectedAppointment.customer?.full_name || 'Unknown'}</span>
                        </div>
                        <div className="mb-2">
                          <strong className="text-muted small d-block">Email</strong>
                          <span className="fs-6">{selectedAppointment.customer?.email || 'N/A'}</span>
                        </div>
                        <div className="mb-0">
                          <strong className="text-muted small d-block">Phone</strong>
                          <span className="fs-6">
                            <i className="bi bi-telephone me-1"></i>
                            {selectedAppointment.customer?.phone || 'N/A'}
                          </span>
                        </div>

                        {/* Double Booking Information */}
                        {selectedAppointment.is_double_booking && selectedAppointment.double_booking_data && (
                          <div className="mt-3 pt-3 border-top">
                            <h6 className="text-info mb-2">
                              <i className="bi bi-people me-2"></i>
                              Double Booking Details
                            </h6>
                            <div className="small">
                              <div className="mb-2">
                                <strong>Service For:</strong> {selectedAppointment.double_booking_data.friend_name || 'Friend'}
                              </div>
                              {selectedAppointment.double_booking_data.friend_phone && (
                                <div className="mb-2">
                                  <strong>Contact Number:</strong> {selectedAppointment.double_booking_data.friend_phone}
                                </div>
                              )}
                              <div className="mb-2">
                                <strong>Booked By:</strong> {selectedAppointment.double_booking_data.booked_by || 'Customer'}
                              </div>
                              {selectedAppointment.customer?.phone && selectedAppointment.customer.phone !== 'No phone' && (
                                <div className="mb-0">
                                  <strong>Contact Number of Booked Person:</strong> {selectedAppointment.customer.phone}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6 mb-3">
                    <div className="card border-0 bg-light h-100">
                      <div className="card-body">
                        <h6 className="card-title text-primary mb-3">
                          <i className="bi bi-scissors me-2"></i>
                          Barber Information
                        </h6>
                        <div className="mb-2">
                          <strong className="text-muted small d-block">Name</strong>
                          <span className="fs-6">{selectedAppointment.barber?.full_name || 'Unknown'}</span>
                        </div>
                        <div className="mb-2">
                          <strong className="text-muted small d-block">Email</strong>
                          <span className="fs-6">{selectedAppointment.barber?.email || 'N/A'}</span>
                        </div>
                        {selectedAppointment.barber?.phone && (
                          <div className="mb-0">
                            <strong className="text-muted small d-block">Phone</strong>
                            <span className="fs-6">
                              <i className="bi bi-telephone me-1"></i>
                              {selectedAppointment.barber.phone}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card border-0 bg-light mb-4">
                  <div className="card-body">
                    <h6 className="card-title text-primary mb-3">
                      <i className="bi bi-list-check me-2"></i>
                      Services & Add-ons
                    </h6>

                    {/* Main Service */}
                    <div className="mb-3 p-3 bg-white rounded border">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong className="d-block fs-6">{selectedAppointment.service?.name || 'Unknown'}</strong>
                          <small className="text-muted">
                            <i className="bi bi-clock me-1"></i>
                            {selectedAppointment.service?.duration || 0} min
                          </small>
                        </div>
                        <div className="text-end">
                          <span className="fs-6 fw-bold text-success">₱{selectedAppointment.service?.price || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Add-ons */}
                    {(() => {
                      if (!selectedAppointment.add_ons_data) return null;

                      const addOnIds = parseAddOnsData(selectedAppointment.add_ons_data);

                      if (!addOnIds || addOnIds.length === 0) return null;
                      if (!addOns || addOns.length === 0) return null;

                      const appointmentAddOns = addOnIds.map(addonId => {
                        let addon = addOns.find(a => a.id === addonId);

                        if (!addon) {
                          const mappedIds = mapLegacyAddonIds([addonId], addOns);
                          if (mappedIds.length > 0 && mappedIds[0]) {
                            addon = addOns.find(a => a.id === mappedIds[0]);
                          }
                        }

                        if (addon) {
                          return {
                            name: addon.name,
                            price: addon.price,
                            duration: addon.duration,
                            id: addon.id
                          };
                        }

                        return null;
                      }).filter(Boolean);

                      if (appointmentAddOns.length > 0) {
                        return (
                          <>
                            <div className="mb-3">
                              <small className="text-muted fw-bold d-block mb-2">Add-ons:</small>
                              <div className="row g-2">
                                {appointmentAddOns.map((addon, index) => (
                                  <div key={index} className="col-md-6">
                                    <div className="d-flex justify-content-between align-items-center p-2 bg-white rounded border">
                                      <div>
                                        <strong className="d-block small">{addon.name}</strong>
                                        {addon.duration > 0 && (
                                          <small className="text-muted">
                                            <i className="bi bi-clock me-1"></i>
                                            {addon.duration} min
                                          </small>
                                        )}
                                      </div>
                                      <div className="text-end">
                                        <span className="fw-bold text-success small">₱{addon.price || 0}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        );
                      }

                      return null;
                    })()}

                    {/* Total */}
                    <div className="pt-3 border-top">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong className="fs-6">Total Duration</strong>
                          <div className="text-muted small">
                            <i className="bi bi-clock me-1"></i>
                            {(() => {
                              const serviceDuration = selectedAppointment.service?.duration || 0;
                              let addOnDuration = 0;

                              if (selectedAppointment.add_ons_data) {
                                const addOnIds = parseAddOnsData(selectedAppointment.add_ons_data);
                                if (addOnIds && addOnIds.length > 0 && addOns && addOns.length > 0) {
                                  addOnDuration = addOnIds.map(addonId => {
                                    let addon = addOns.find(a => a.id === addonId);
                                    if (!addon) {
                                      const mappedIds = mapLegacyAddonIds([addonId], addOns);
                                      if (mappedIds.length > 0 && mappedIds[0]) {
                                        addon = addOns.find(a => a.id === mappedIds[0]);
                                      }
                                    }
                                    return addon?.duration || 0;
                                  }).reduce((sum, duration) => sum + duration, 0);
                                }
                              }

                              return serviceDuration + addOnDuration;
                            })()} minutes
                          </div>
                        </div>
                        <div className="text-end">
                          <strong className="text-muted small d-block mb-1">Total Price</strong>
                          <span className="fs-4 fw-bold text-success">
                            ₱{selectedAppointment.total_price || selectedAppointment.service?.price || 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedAppointment.notes && (
                  <div className="card border-0 bg-light mb-4">
                    <div className="card-body">
                      <h6 className="card-title text-primary mb-3">
                        <i className="bi bi-sticky me-2"></i>
                        Notes
                      </h6>
                      <p className="mb-0">{selectedAppointment.notes}</p>
                    </div>
                  </div>
                )}

                {selectedAppointment.priority_level && (
                  <div className="card border-0 bg-light">
                    <div className="card-body">
                      <h6 className="card-title text-primary mb-3">
                        <i className="bi bi-flag me-2"></i>
                        Priority Level
                      </h6>
                      <span className={`badge bg-${selectedAppointment.priority_level === 'urgent' ? 'danger' : 'info'} fs-6 px-3 py-2`}>
                        {selectedAppointment.priority_level.charAt(0).toUpperCase() + selectedAppointment.priority_level.slice(1)}
                      </span>
                    </div>
                  </div>
                )}
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
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title">
                  <i className="bi bi-pencil-square me-2"></i>
                  Edit Appointment
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeEditModal}
                ></button>
              </div>
              <div className="modal-body p-4">
                <form onSubmit={handleSubmit}>
                  {/* Customer Info - Read Only */}
                  <div className="card border-0 bg-light mb-4">
                    <div className="card-body">
                      <h6 className="card-title text-primary mb-3">
                        <i className="bi bi-person-fill me-2"></i>
                        Customer Information
                      </h6>
                      <div className="row">
                        <div className="col-md-6">
                          <strong className="text-muted small d-block">Name</strong>
                          <span className="fs-6">{selectedAppointment.customer?.full_name || 'Unknown'}</span>
                        </div>
                        <div className="col-md-6">
                          <strong className="text-muted small d-block">Phone</strong>
                          <span className="fs-6">{selectedAppointment.customer?.phone || 'N/A'}</span>
                        </div>
                      </div>
                      <div className="form-text mt-2">
                        <i className="bi bi-info-circle me-1"></i>
                        Customer information cannot be changed
                      </div>
                    </div>
                  </div>

                  {/* Barber Selection */}
                  <div className="card border-0 bg-light mb-4">
                    <div className="card-body">
                      <h6 className="card-title text-primary mb-3">
                        <i className="bi bi-scissors me-2"></i>
                        Barber Selection
                      </h6>
                      <select
                        className={`form-select form-select-lg ${formErrors.barber_id ? 'is-invalid' : ''}`}
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
                  </div>

                  {/* Service Selection */}
                  <div className="card border-0 bg-light mb-4">
                    <div className="card-body">
                      <h6 className="card-title text-primary mb-3">
                        <i className="bi bi-list-check me-2"></i>
                        Service Selection
                      </h6>
                      <select
                        className={`form-select form-select-lg ${formErrors.service_id ? 'is-invalid' : ''}`}
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
                  </div>

                  {/* Appointment Type & Date */}
                  <div className="card border-0 bg-light mb-4">
                    <div className="card-body">
                      <h6 className="card-title text-primary mb-3">
                        <i className="bi bi-calendar3 me-2"></i>
                        Appointment Details
                      </h6>

                      <div className="row mb-3">
                        <div className="col-md-6">
                          <label htmlFor="appointment_type" className="form-label fw-bold">Appointment Type</label>
                          <select
                            className="form-select form-select-lg"
                            id="appointment_type"
                            name="appointment_type"
                            value={formData.appointment_type || selectedAppointment.appointment_type || 'queue'}
                            onChange={handleChange}
                          >
                            <option value="queue">Queue</option>
                            <option value="scheduled">Scheduled</option>
                          </select>
                          <div className="form-text">
                            <i className="bi bi-info-circle me-1"></i>
                            Queue: No specific time, position-based. Scheduled: Specific time slot.
                          </div>
                        </div>

                        <div className="col-md-6">
                          <label htmlFor="appointment_date" className="form-label fw-bold">Date</label>
                          <input
                            type="date"
                            className={`form-control form-control-lg ${formErrors.appointment_date ? 'is-invalid' : ''}`}
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
                      </div>

                      {/* Queue Position or Time Slot */}
                      {(formData.appointment_type || selectedAppointment.appointment_type) === 'queue' ? (
                        <div className="row">
                          <div className="col-md-6">
                            <label htmlFor="queue_position" className="form-label fw-bold">
                              <i className="bi bi-123 me-2"></i>
                              Queue Position
                            </label>
                            <input
                              type="number"
                              className="form-control form-control-lg"
                              id="queue_position"
                              name="queue_position"
                              min="1"
                              value={formData.queue_position || selectedAppointment.queue_position || ''}
                              onChange={handleChange}
                              placeholder="Enter queue position"
                            />
                            <div className="form-text">
                              Lower number = higher priority. Leave empty for auto-assignment.
                            </div>
                          </div>
                          <div className="col-md-6">
                            <label htmlFor="priority_level" className="form-label fw-bold">
                              <i className="bi bi-flag me-2"></i>
                              Priority Level
                            </label>
                            <select
                              className="form-select form-select-lg"
                              id="priority_level"
                              name="priority_level"
                              value={formData.priority_level || selectedAppointment.priority_level || 'normal'}
                              onChange={handleChange}
                            >
                              <option value="normal">Normal</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div className="row">
                          <div className="col-md-12">
                            <label htmlFor="appointment_time" className="form-label fw-bold">
                              <i className="bi bi-clock me-2"></i>
                              Time Slot
                            </label>
                            <select
                              className={`form-select form-select-lg ${formErrors.appointment_time ? 'is-invalid' : ''}`}
                              id="appointment_time"
                              name="appointment_time"
                              value={formData.appointment_time || ''}
                              onChange={handleChange}
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
                                <i className="bi bi-exclamation-triangle me-1"></i>
                                No available slots for this date. Please try another date.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status & Notes */}
                  <div className="row mb-4">
                    <div className="col-md-6">
                      <div className="card border-0 bg-light h-100">
                        <div className="card-body">
                          <h6 className="card-title text-primary mb-3">
                            <i className="bi bi-check-circle me-2"></i>
                            Status
                          </h6>
                          <select
                            className={`form-select form-select-lg ${formErrors.status ? 'is-invalid' : ''}`}
                            id="status"
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            required
                          >
                            <option value="">Select Status</option>
                            {ALLOWED_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                              </option>
                            ))}
                          </select>
                          {formErrors.status && (
                            <div className="invalid-feedback">{formErrors.status}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="col-md-6">
                      <div className="card border-0 bg-light h-100">
                        <div className="card-body">
                          <h6 className="card-title text-primary mb-3">
                            <i className="bi bi-sticky me-2"></i>
                            Notes
                          </h6>
                          <textarea
                            className="form-control"
                            id="notes"
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            rows="4"
                            placeholder="Add any special notes or instructions..."
                          ></textarea>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="d-flex justify-content-end gap-3">
                    <button
                      type="button"
                      className="btn btn-lg btn-outline-secondary"
                      onClick={closeEditModal}
                    >
                      <i className="bi bi-x-circle me-2"></i>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-lg btn-primary"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check-circle me-2"></i>
                          Save Changes
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




      {/* Status Update Modal */}
      {showStatusModal && statusUpdateData.appointmentId && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content shadow-lg">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title">
                  <i className="bi bi-arrow-repeat me-2"></i>
                  Update Appointment Status
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeStatusModal}
                  disabled={loading}
                ></button>
              </div>
              <div className="modal-body p-4">
                {(() => {
                  const appointment = appointments.find(apt => apt.id === statusUpdateData.appointmentId);
                  const currentStatus = appointment?.status || 'unknown';
                  const newStatus = statusUpdateData.newStatus;
                  const customerName = appointment?.customer?.full_name || 'Customer';
                  const serviceName = appointment?.service?.name || 'Service';

                  return (
                    <>
                      <div className="mb-4">
                        <p className="mb-2">
                          <strong>Customer:</strong> {customerName}
                        </p>
                        <p className="mb-2">
                          <strong>Service:</strong> {serviceName}
                        </p>
                        <p className="mb-2">
                          <strong>Current Status:</strong>{' '}
                          <span className={`badge bg-${getStatusColor(currentStatus)}`}>
                            {currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}
                          </span>
                        </p>
                        <p className="mb-0">
                          <strong>New Status:</strong>{' '}
                          <span className={`badge bg-${getStatusColor(newStatus)}`}>
                            {newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}
                          </span>
                        </p>
                      </div>

                      <div className="alert alert-info mb-0">
                        <i className="bi bi-info-circle me-2"></i>
                        Are you sure you want to change the status from <strong>{currentStatus}</strong> to <strong>{newStatus}</strong>?
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeStatusModal}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn btn-${getStatusColor(statusUpdateData.newStatus)}`}
                  onClick={confirmStatusUpdate}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Updating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check-circle me-2"></i>
                      Confirm Update
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageAppointments;
