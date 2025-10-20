// components/customer/CustomerAppointments.js (Clean Rating System)
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import LoadingSpinner from '../common/LoadingSpinner';
import RescheduleCancelModal from './RescheduleCancelModal';
import RatingForm from '../common/RatingForm';
import addOnsService from '../../services/AddOnsService';
import AdvancedHybridQueueService from '../../services/AdvancedHybridQueueService';

const CustomerAppointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [filteredAppointments, setFilteredAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const [queuePositions, setQueuePositions] = useState({});
  const [ratingAppointment, setRatingAppointment] = useState(null);
  const [modalData, setModalData] = useState({ isOpen: false, appointment: null, action: null });
  const [rejectedRequests, setRejectedRequests] = useState(new Set());
  
  // Advanced Hybrid Queue System state
  const [realTimeUpdates, setRealTimeUpdates] = useState(false);
  const [queueStats, setQueueStats] = useState({});
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6); // Show 6 appointments per page
  const [dateFilter, setDateFilter] = useState('all'); // all, today, this_week, this_month, custom
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    getUser();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAppointments();
      fetchRejectedRequests();
      
      // Set up Advanced Hybrid Queue real-time updates
      const handleAppointmentUpdate = (update) => {
        console.log('🔔 Customer received Advanced Hybrid Queue update:', update);
        
        // Refresh appointments when there's an update
        clearTimeout(window.customerUpdateTimeout);
        window.customerUpdateTimeout = setTimeout(() => {
          console.log('🔄 Customer refreshing appointments from Advanced Hybrid Queue...');
          fetchAppointments();
          
          // Show notification if it's a queue position update
          if (update.event === 'queue_position_updated') {
            setSuccess(`Your queue position has been updated!`);
            setTimeout(() => setSuccess(''), 3000);
          }
        }, 500);
      };

      // Subscribe to customer-specific updates
      const subscription = AdvancedHybridQueueService.subscribeToCustomerUpdates(
        user.id,
        handleAppointmentUpdate
      );

      setRealTimeUpdates(true);
      
      return () => {
        console.log('🧹 Cleaning up Advanced Hybrid Queue customer subscription');
        AdvancedHybridQueueService.unsubscribeFromCustomerUpdates(user.id);
        clearTimeout(window.customerUpdateTimeout);
        setRealTimeUpdates(false);
      };
    }
  }, [user]);

  useEffect(() => {
    const runFilters = async () => {
      await applyFilters();
    };
    runFilters();
  }, [appointments, filter, searchQuery, dateFilter, customStartDate, customEndDate]);

  useEffect(() => {
    if (user && appointments.length > 0) {
      fetchQueuePositions();
    }
  }, [user, appointments]);

  const getUser = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      setUser(user);
    } catch (error) {
      console.error('Error getting user:', error);
      setError('Failed to authenticate user');
    }
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      
      console.log('Fetching customer appointments for:', user.id);
      
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('customer_id', user.id)
        .order('appointment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('Customer appointments fetched:', data?.length || 0);
      
      // Debug: Check for completed appointments
      const completedAppointments = data?.filter(apt => apt.status === 'done') || [];
      const rateableAppointments = completedAppointments.filter(apt => !apt.is_reviewed);
      console.log('Completed appointments:', completedAppointments.length);
      console.log('Rateable appointments:', rateableAppointments.length);
      console.log('All appointments statuses:', data?.map(apt => ({ id: apt.id, status: apt.status, is_reviewed: apt.is_reviewed })));
      
      setAppointments(data || []);
      setFilteredAppointments(data || []);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load appointments. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRejectedRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('appointment_requests')
        .select('appointment_id')
        .eq('customer_id', user.id)
        .eq('status', 'rejected');

      if (error) throw error;

      const rejectedAppointmentIds = new Set(data?.map(req => req.appointment_id) || []);
      setRejectedRequests(rejectedAppointmentIds);
      console.log('Rejected requests fetched:', rejectedAppointmentIds);
    } catch (err) {
      console.error('Error fetching rejected requests:', err);
    }
  };



  const fetchQueuePositions = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayAppointments = appointments.filter(apt => 
        apt.appointment_date === today && 
        (apt.status === 'scheduled' || apt.status === 'pending')
      );

      const positions = {};
      
      for (const appointment of todayAppointments) {
        if (appointment.status === 'scheduled') {
          // Get queue position
          const { data: queueData, error } = await supabase
            .from('appointments')
            .select('id, queue_position')
            .eq('barber_id', appointment.barber_id)
            .eq('appointment_date', today)
            .eq('status', 'scheduled')
            .order('queue_position', { ascending: true });

          if (!error && queueData) {
            const position = queueData.findIndex(apt => apt.id === appointment.id) + 1;
            const estimatedWait = position * 35; // 35 minutes average per customer
            
            positions[appointment.id] = {
              position,
              estimatedWait: estimatedWait < 60 ? `${estimatedWait} min` : 
                            `${Math.floor(estimatedWait / 60)}h ${estimatedWait % 60}m`
            };
          }
        }
      }
      
      setQueuePositions(positions);
    } catch (err) {
      console.error('Error fetching queue positions:', err);
    }
  };

  const applyFilters = async () => {
    if (!appointments.length) return;

    const today = new Date().toISOString().split('T')[0];
    
    let filtered = [...appointments];
    
    // Apply quick status filter (upcoming/past/etc.)
    switch (filter) {
      case 'upcoming':
        filtered = filtered.filter(apt => 
          (apt.appointment_date >= today && ['scheduled', 'pending'].includes(apt.status)) ||
          apt.status === 'ongoing'
        );
        break;
      case 'past':
        filtered = filtered.filter(apt => 
          apt.appointment_date < today || apt.status === 'done'
        );
        break;
      case 'pending':
        filtered = filtered.filter(apt => apt.status === 'pending');
        break;
      case 'cancelled':
        filtered = filtered.filter(apt => apt.status === 'cancelled');
        break;
      default:
        // 'all' - no filtering needed
        break;
    }

    // Note: explicit status filter removed as requested
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      
      // Filter with async add-ons display
      const filteredWithAddOns = await Promise.all(
        filtered.map(async (apt) => {
          const addOnsText = await getAddOnsDisplay(apt);
          const matchesSearch = 
            apt.barber?.full_name.toLowerCase().includes(query) ||
            apt.service?.name.toLowerCase().includes(query) ||
            (apt.notes && apt.notes.toLowerCase().includes(query)) ||
            getServicesDisplay(apt).toLowerCase().includes(query) ||
            addOnsText.toLowerCase().includes(query);
          
          return matchesSearch ? apt : null;
        })
      );
      
      filtered = filteredWithAddOns.filter(apt => apt !== null);
    }
    
    setFilteredAppointments(filtered);
  };

  const getServicesDisplay = (appointment) => {
    const services = [];
    
    // Add primary service
    if (appointment.service) {
      services.push(appointment.service.name);
    }
    
    // Add additional services
    if (appointment.services_data) {
      try {
        let serviceIds;
        
        // Check if services_data is already an array (object)
        if (Array.isArray(appointment.services_data)) {
          serviceIds = appointment.services_data;
        } else if (typeof appointment.services_data === 'string') {
          // Try to parse as JSON
          serviceIds = JSON.parse(appointment.services_data);
        } else {
          // Handle other data types
          serviceIds = [appointment.services_data];
        }
        
        if (Array.isArray(serviceIds) && serviceIds.length > 1) {
          services.push(`+${serviceIds.length - 1} more services`);
        }
      } catch (e) {
        console.error('Error parsing services data:', e);
        console.log('Raw services_data:', appointment.services_data);
        console.log('Type of services_data:', typeof appointment.services_data);
        
        // Fallback: treat as single service ID
        if (typeof appointment.services_data === 'string' && appointment.services_data.length > 0) {
          services.push('+1 more service');
        }
      }
    }
    
    return services.join(', ');
  };

  const getAddOnsDisplay = async (appointment) => {
    return await addOnsService.getAddOnsDisplay(appointment.add_ons_data);
  };

  // Component to display add-ons with async loading
  const AddOnsDisplay = ({ appointment }) => {
    const [addOnsText, setAddOnsText] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const loadAddOns = async () => {
        if (!appointment.add_ons_data) {
          setAddOnsText('');
          setLoading(false);
          return;
        }

        try {
          const text = await getAddOnsDisplay(appointment);
          setAddOnsText(text);
        } catch (error) {
          console.error('Error loading add-ons display:', error);
          setAddOnsText('');
        } finally {
          setLoading(false);
        }
      };

      loadAddOns();
    }, [appointment.add_ons_data]);

    if (loading) {
      return <div className="small text-muted">Loading add-ons...</div>;
    }

    if (!addOnsText) {
      return null;
    }

    return (
      <div className="mb-2">
        <small className="text-muted">Add-ons:</small>
        <div className="small text-info addon-display">{addOnsText}</div>
      </div>
    );
  };

  const getTotalPrice = (appointment) => {
    let total = appointment.total_price || appointment.service?.price || 0;
    
    // Add urgent fee if applicable
    if (appointment.is_urgent) {
      total += 100;
    }
    
    return total;
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      console.log('🔄 Customer cancelling appointment:', appointmentId);

      // Find appointment details to compute queue collapse
      const appointment = appointments.find(apt => apt.id === appointmentId);
      
      // Store original queue position before updating
      const originalQueuePosition = appointment?.queue_position;

      // First cancel the appointment
      const { error: cancelError } = await supabase
        .from('appointments')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString(),
          queue_position: null,
          cancellation_reason: 'Cancelled by customer'
        })
        .eq('id', appointmentId);

      if (cancelError) throw cancelError;

      // Collapse queue positions if needed
      if (appointment && originalQueuePosition != null) {
        try {
          console.log(`🔄 Collapsing queue positions after cancelling position ${originalQueuePosition}`);
          
          const { data: affected, error: fetchErr } = await supabase
            .from('appointments')
            .select('id, queue_position')
            .eq('barber_id', appointment.barber_id)
            .eq('appointment_date', appointment.appointment_date)
            .in('status', ['scheduled', 'pending', 'confirmed', 'ongoing'])
            .gt('queue_position', originalQueuePosition)
            .order('queue_position', { ascending: true });

          if (!fetchErr && Array.isArray(affected) && affected.length) {
            console.log(`📝 Found ${affected.length} appointments to update positions`);
            
            for (const apt of affected) {
              const newPosition = apt.queue_position - 1;
              console.log(`📝 Updating appointment ${apt.id} from position ${apt.queue_position} to ${newPosition}`);
              
              await supabase
                .from('appointments')
                .update({ 
                  queue_position: newPosition,
                  updated_at: new Date().toISOString()
                })
                .eq('id', apt.id);
            }
            
            console.log('✅ Queue positions collapsed successfully');
          } else {
            console.log('ℹ️ No appointments found to collapse positions');
          }
        } catch (collapseErr) {
          console.warn('Queue collapse warning:', collapseErr);
        }
      }

      // Create notification for barber using CentralizedNotificationService
      if (appointment) {
        const { CentralizedNotificationService } = await import('../../services/CentralizedNotificationService');
        await CentralizedNotificationService.createNotification({
          userId: appointment.barber_id,
          title: 'Appointment Cancelled',
          message: `${user.user_metadata?.full_name || user.email} has cancelled their appointment.`,
          type: 'appointment_cancelled',
          appointmentId: appointmentId,
          data: {
            customer_name: user.user_metadata?.full_name || user.email
          }
        });
      }

      // Add log entry
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'appointment_cancelled_by_customer',
        details: {
          appointment_id: appointmentId
        }
      });

      console.log('✅ Customer appointment cancelled successfully');

      // Refresh appointments
      setTimeout(() => fetchAppointments(), 1000);
    } catch (err) {
      console.error('❌ Error cancelling appointment:', err);
      setError('Failed to cancel appointment. Please try again.');
    }
  };

  const canReschedule = (appointment) => {
    // Check if appointment is in a reschedulable state
    const reschedulableStatuses = ['scheduled', 'pending'];
    if (!reschedulableStatuses.includes(appointment.status)) {
      return false;
    }

    // Check if this appointment has a rejected reschedule request
    if (rejectedRequests.has(appointment.id)) {
      return false;
    }

    // Check if appointment is not in the past
    const appointmentDate = new Date(appointment.appointment_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return appointmentDate >= today;
  };

  const handleReschedule = (appointment) => {
    if (!canReschedule(appointment)) {
      if (rejectedRequests.has(appointment.id)) {
        setError('This appointment cannot be rescheduled because your previous reschedule request was rejected. Please contact the barber directly.');
      } else {
        setError('This appointment cannot be rescheduled. It may be in the past or not in a reschedulable state.');
      }
      return;
    }
    setModalData({
      isOpen: true,
      appointment: appointment,
      action: 'reschedule'
    });
  };

  const handleCancel = (appointment) => {
    setModalData({
      isOpen: true,
      appointment: appointment,
      action: 'cancel'
    });
  };

  const handleModalClose = () => {
    setModalData({ isOpen: false, appointment: null, action: null });
  };

  const handleModalSuccess = (request) => {
    setSuccess(`${modalData.action === 'reschedule' ? 'Reschedule' : 'Cancellation'} request submitted successfully!`);
    fetchAppointments(); // Refresh appointments
    fetchRejectedRequests(); // Refresh rejected requests list
  };

  const handleCloneAppointment = async (appointment) => {
    // Navigate to booking page with pre-filled data
    const searchParams = new URLSearchParams({
      barber: appointment.barber_id,
      service: appointment.service_id,
      services: appointment.services_data || JSON.stringify([appointment.service_id]),
      addons: appointment.add_ons_data || '[]',
      notes: appointment.notes || ''
    });
    
    navigate(`/book?${searchParams.toString()}`);
  };

  const formatAppointmentDate = (dateString) => {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'done':
        return 'bg-success';
      case 'ongoing':
        return 'bg-primary';
      case 'cancelled':
        return 'bg-danger';
      case 'pending':
        return 'bg-warning text-dark';
      case 'scheduled':
        return 'bg-info';
      case 'confirmed':
        return 'bg-success'; // Same as done since confirmed means ready to go
      default:
        return 'bg-secondary';
    }
  };

  // Filter appointments by date
  const filterAppointmentsByDate = (appointments) => {
    if (dateFilter === 'all') return appointments;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return appointments.filter(appointment => {
      const appointmentDate = new Date(appointment.appointment_date);
      const appointmentDateOnly = new Date(appointmentDate.getFullYear(), appointmentDate.getMonth(), appointmentDate.getDate());
      
      switch (dateFilter) {
        case 'today':
          return appointmentDateOnly.getTime() === today.getTime();
        case 'this_week':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          return appointmentDateOnly >= weekStart && appointmentDateOnly <= weekEnd;
        case 'this_month':
          return appointmentDate.getMonth() === now.getMonth() && appointmentDate.getFullYear() === now.getFullYear();
        case 'custom':
          if (!customStartDate || !customEndDate) return true;
          {
            const start = new Date(customStartDate);
            const end = new Date(customEndDate);
            // Normalize times to date-only
            const startOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const endOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            return appointmentDateOnly >= startOnly && appointmentDateOnly <= endOnly;
          }
        default:
          return true;
      }
    });
  };

  // Get paginated appointments
  const getPaginatedAppointments = () => {
    const dateFilteredAppointments = filterAppointmentsByDate(filteredAppointments);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return dateFilteredAppointments.slice(startIndex, endIndex);
  };

  // Get total pages
  const getTotalPages = () => {
    const dateFilteredAppointments = filterAppointmentsByDate(filteredAppointments);
    return Math.ceil(dateFilteredAppointments.length / itemsPerPage);
  };

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle date filter change
  const handleDateFilterChange = (filter) => {
    setDateFilter(filter);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'done':
        return 'bi-check-circle-fill';
      case 'ongoing':
        return 'bi-scissors';
      case 'cancelled':
        return 'bi-x-circle-fill';
      case 'pending':
        return 'bi-clock-fill';
      case 'scheduled':
        return 'bi-calendar-check';
      case 'confirmed':
        return 'bi-check-circle'; // Confirmed but not yet done
      default:
        return 'bi-circle';
    }
  };

  const getPendingStatusText = (appointment) => {
    if (appointment.status === 'pending') {
      return 'Waiting for barber confirmation';
    }
    return '';
  };

  const getEstimatedWaitTime = (appointment) => {
    if (appointment.status === 'scheduled' && queuePositions[appointment.id]) {
      return queuePositions[appointment.id].estimatedWait;
    }
    return null;
  };

  const getQueuePosition = (appointment) => {
    if (appointment.status === 'scheduled' && queuePositions[appointment.id]) {
      return queuePositions[appointment.id].position;
    }
    return null;
  };

  if (loading && !appointments.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2>My Appointments</h2>
          <p className="text-muted mb-0">Track your queue position and appointment status</p>
        </div>
        <Link to="/book" className="btn btn-primary">
          <i className="bi bi-calendar-plus me-2"></i>
          Book New Appointment
        </Link>
      </div>


      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <div className="d-flex align-items-center">
            <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
            <div>{error}</div>
          </div>
          <button type="button" className="btn-close" onClick={() => setError(null)}></button>
        </div>
      )}

      {success && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          <div className="d-flex align-items-center">
            <i className="bi bi-check-circle-fill me-2 fs-4"></i>
            <div>{success}</div>
          </div>
          <button type="button" className="btn-close" onClick={() => setSuccess('')}></button>
        </div>
      )}

      {/* Enhanced Filters */}
      <div className="card mb-4 shadow-sm">
        <div className="card-header bg-light border-0">
          <h6 className="card-title mb-0 d-flex align-items-center">
            <i className="bi bi-funnel me-2 text-primary"></i>
            Filter & Search Appointments
          </h6>
        </div>
        <div className="card-body">
          {/* Search Bar - Top Priority */}
          <div className="row mb-4">
            <div className="col-12">
              <label className="form-label fw-semibold text-dark">
                <i className="bi bi-search me-1"></i>
                Search Appointments
              </label>
              <div className="input-group input-group-lg">
                <span className="input-group-text bg-white border-end-0">
                  <i className="bi bi-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Search by barber name, service, or appointment details..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button 
                    className="btn btn-outline-secondary border-start-0" 
                    type="button"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                  >
                    <i className="bi bi-x-lg"></i>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="row g-3">
            {/* Appointment Status Filter (Quick buttons) */}
            <div className="col-lg-6">
              <label className="form-label fw-semibold text-dark">
                <i className="bi bi-list-check me-1"></i>
                Appointment Status
              </label>
              <div className="d-flex flex-wrap gap-2 w-100">
                <button 
                  type="button" 
                  className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline-primary'} flex-fill`}
                  onClick={() => setFilter('all')}
                >
                  <i className="bi bi-list-ul me-1"></i>
                  All
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${filter === 'upcoming' ? 'btn-primary' : 'btn-outline-primary'} flex-fill`}
                  onClick={() => setFilter('upcoming')}
                >
                  <i className="bi bi-calendar-check me-1"></i>
                  Upcoming
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-outline-primary'} flex-fill`}
                  onClick={() => setFilter('pending')}
                >
                  <i className="bi bi-clock me-1"></i>
                  Pending
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${filter === 'past' ? 'btn-primary' : 'btn-outline-primary'} flex-fill`}
                  onClick={() => setFilter('past')}
                >
                  <i className="bi bi-calendar-x me-1"></i>
                  Past
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${filter === 'cancelled' ? 'btn-primary' : 'btn-outline-primary'} flex-fill`}
                  onClick={() => setFilter('cancelled')}
                >
                  <i className="bi bi-x-circle me-1"></i>
                  Cancelled
                </button>
              </div>
            </div>
            
            {/* Date Filter */}
            <div className="col-lg-6">
              <label className="form-label fw-semibold text-dark">
                <i className="bi bi-calendar-range me-1"></i>
                Date Range
              </label>
              <div className="d-flex flex-wrap gap-2 w-100">
                <button 
                  type="button" 
                  className={`btn btn-sm ${dateFilter === 'all' ? 'btn-success' : 'btn-outline-success'} flex-fill`}
                  onClick={() => handleDateFilterChange('all')}
                >
                  <i className="bi bi-calendar3 me-1"></i>
                  All Dates
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${dateFilter === 'today' ? 'btn-success' : 'btn-outline-success'} flex-fill`}
                  onClick={() => handleDateFilterChange('today')}
                >
                  <i className="bi bi-calendar-day me-1"></i>
                  Today
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${dateFilter === 'this_week' ? 'btn-success' : 'btn-outline-success'} flex-fill`}
                  onClick={() => handleDateFilterChange('this_week')}
                >
                  <i className="bi bi-calendar-week me-1"></i>
                  This Week
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${dateFilter === 'this_month' ? 'btn-success' : 'btn-outline-success'} flex-fill`}
                  onClick={() => handleDateFilterChange('this_month')}
                >
                  <i className="bi bi-calendar-month me-1"></i>
                  This Month
                </button>
                <button 
                  type="button" 
                  className={`btn btn-sm ${dateFilter === 'custom' ? 'btn-success' : 'btn-outline-success'} flex-fill`}
                  onClick={() => handleDateFilterChange('custom')}
                >
                  <i className="bi bi-sliders me-1"></i>
                  Custom
                </button>
              </div>
            </div>
          </div>

          {/* Additional precise filters */}
          <div className="row g-3 mt-2">
            {/* Custom Date Range Inputs */}
            {dateFilter === 'custom' && (
              <div className="col-lg-6">
                <label className="form-label fw-semibold text-dark">
                  <i className="bi bi-calendar2-week me-1"></i>
                  Custom Range
                </label>
                <div className="row g-2">
                  <div className="col-12 col-sm-6">
                    <input 
                      type="date" 
                      className="form-control" 
                      value={customStartDate} 
                      onChange={(e) => setCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div className="col-12 col-sm-6">
                    <input 
                      type="date" 
                      className="form-control" 
                      value={customEndDate} 
                      onChange={(e) => setCustomEndDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Active Filters Summary */}
          {(filter !== 'all' || dateFilter !== 'all' || searchQuery) && (
            <div className="row mt-3">
              <div className="col-12">
                <div className="alert alert-info border-0 py-2">
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center">
                      <i className="bi bi-info-circle me-2"></i>
                      <span className="fw-semibold">Active Filters:</span>
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      {filter !== 'all' && (
                        <span className="badge bg-primary">
                          Status: {filter.charAt(0).toUpperCase() + filter.slice(1)}
                          <button 
                            type="button" 
                            className="btn-close btn-close-white ms-1" 
                            style={{fontSize: '0.6em'}}
                            onClick={() => setFilter('all')}
                            title="Remove status filter"
                          ></button>
                        </span>
                      )}
                      {dateFilter !== 'all' && (
                        <span className="badge bg-success">
                          Date: {dateFilter.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          <button 
                            type="button" 
                            className="btn-close btn-close-white ms-1" 
                            style={{fontSize: '0.6em'}}
                            onClick={() => handleDateFilterChange('all')}
                            title="Remove date filter"
                          ></button>
                        </span>
                      )}
                      {searchQuery && (
                        <span className="badge bg-secondary">
                          Search: "{searchQuery}"
                          <button 
                            type="button" 
                            className="btn-close btn-close-white ms-1" 
                            style={{fontSize: '0.6em'}}
                            onClick={() => setSearchQuery('')}
                            title="Clear search"
                          ></button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {filterAppointmentsByDate(filteredAppointments).length === 0 ? (
        <div className="text-center py-5">
          <div className="display-4 text-muted mb-3">
            <i className="bi bi-calendar-x"></i>
          </div>
          <h4 className="text-muted">
            {filter !== 'all' ? 
              `No ${filter} appointments found` : 
              "You don't have any appointments yet"}
          </h4>
          <p className="text-muted mb-4">
            {filter !== 'all' ? 
              `Try adjusting your filter or search terms.` : 
              "Book your first appointment to get started."}
          </p>
          <Link to="/book" className="btn btn-primary btn-lg">
            <i className="bi bi-calendar-plus me-2"></i>
            Book Your First Appointment
          </Link>
        </div>
      ) : (
        <div>
          <div className="row">
            {getPaginatedAppointments().map((appointment) => (
              <div key={appointment.id} className="col-md-6 col-lg-4 mb-4">
                <div className={`card h-100 ${appointment.status === 'ongoing' ? 'border-primary border-2' : ''} ${appointment.is_urgent ? 'border-warning border-2' : ''}`}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center">
                    <i className={`bi ${getStatusIcon(appointment.status)} me-2`}></i>
                    <span className={`badge ${getStatusBadgeClass(appointment.status)} me-2`}>
                      {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                    </span>
                    {appointment.is_urgent && (
                      <span className="badge bg-warning text-dark">
                        <i className="bi bi-lightning-fill me-1"></i>URGENT
                      </span>
                    )}
                  </div>
                    <small className="text-muted">
                      {formatAppointmentDate(appointment.appointment_date)}
                      {appointment.appointment_type === 'scheduled' && appointment.appointment_time && (
                        <>
                          {' • '}
                          {new Date(`2000-01-01T${appointment.appointment_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </>
                      )}
                    </small>
                </div>
                
                <div className="card-body">
                  <div className="d-flex mb-3">
                    <div className="flex-shrink-0">
                      <div className="bg-light rounded-circle p-3 text-center" style={{ width: '60px', height: '60px' }}>
                        <i className="bi bi-scissors fs-4"></i>
                      </div>
                    </div>
                    <div className="ms-3 flex-grow-1">
                      <h5 className="card-title mb-1">{getServicesDisplay(appointment)}</h5>
                      <p className="card-text text-muted mb-1">
                        <i className="bi bi-person me-1"></i> {appointment.barber?.full_name}
                      </p>
                      <p className="card-text text-muted mb-1">
                        <i className="bi bi-clock me-1"></i> 
                        {appointment.total_duration || appointment.service?.duration} min
                      </p>
                      <p className="card-text text-success mb-0 fw-bold">
                
                        <span className="currency-amount">₱{Number(getTotalPrice(appointment)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </p>
                    </div>
                  </div>
                  
                  <AddOnsDisplay appointment={appointment} />

                  {appointment.status === 'pending' && (
                    <div className="alert alert-warning py-2 mb-2">
                      <small>
                        <i className="bi bi-clock me-1"></i>
                        {getPendingStatusText(appointment)}
                      </small>
                    </div>
                  )}

                  {appointment.appointment_type === 'queue' && (appointment.queue_position || getQueuePosition(appointment)) && (
                    <div className="alert alert-info py-2 mb-2">
                      <small>
                        <i className="bi bi-people me-1"></i>
                        Queue position: #{appointment.queue_position || getQueuePosition(appointment)}
                        <br />
                        <i className="bi bi-clock me-1"></i>
                        Est. wait: {getEstimatedWaitTime(appointment)}
                        {appointment.is_double_booking && (
                          <>
                            <br />
                            <i className="bi bi-person-plus me-1"></i>
                            <strong>For:</strong> {appointment.double_booking_data?.friend_name || 'Friend/Child'}
                          </>
                        )}
                      </small>
                    </div>
                  )}

                  {appointment.status === 'confirmed' && (
                    <div className="alert alert-success py-2 mb-2">
                      <small>
                        <i className="bi bi-check-circle me-1"></i>
                        Appointment confirmed! Please arrive on time.
                      </small>
                    </div>
                  )}

                  {appointment.status === 'ongoing' && (
                    <div className="alert alert-primary py-2 mb-2">
                      <small>
                        <i className="bi bi-scissors me-1"></i>
                        Your appointment is in progress!
                      </small>
                    </div>
                  )}

                  {appointment.status === 'done' && (
                    <div className="alert alert-success py-2 mb-2">
                      <small>
                        <i className="bi bi-check-circle me-1"></i>
                        Service completed successfully
                      </small>
                    </div>
                  )}

                  {appointment.status === 'cancelled' && (
                    <div className="alert alert-danger py-2 mb-2">
                      <small>
                        <i className="bi bi-x-circle me-1"></i>
                        Appointment was cancelled
                        {appointment.cancellation_reason && (
                          <><br />Reason: {appointment.cancellation_reason}</>
                        )}
                      </small>
                    </div>
                  )}
                  
                  {/* Double Booking Details */}
                  {appointment.is_double_booking && appointment.double_booking_data && (
                    <div className="alert alert-info py-2 mb-2">
                      <small>
                        <i className="bi bi-person-plus me-1"></i>
                        <strong>Booked for:</strong> {appointment.double_booking_data.friend_name}
                        <br />
                        <i className="bi bi-telephone me-1"></i>
                        <strong>Contact:</strong> {appointment.double_booking_data.friend_phone}
                        <br />
                        <i className="bi bi-person me-1"></i>
                        <strong>Booked by:</strong> {appointment.double_booking_data.booked_by}
                      </small>
                    </div>
                  )}

                  {appointment.notes && (
                    <div className="mb-2">
                      <small className="text-muted">Notes:</small>
                      <p className="small mb-0 bg-light p-2 rounded">{appointment.notes}</p>
                    </div>
                  )}

                  {/* Inline Rating Form for Completed Appointments */}
                  {appointment.status === 'done' && ratingAppointment?.id === appointment.id && (
                    <div className="mt-3">
                      <RatingForm
                        appointment={appointment}
                        onRatingSubmitted={() => {
                          setRatingAppointment(null);
                          fetchAppointments(); // Refresh to show updated rating
                          setSuccess('Thank you for your rating!');
                        }}
                        onCancel={() => setRatingAppointment(null)}
                      />
                    </div>
                  )}
                </div>

                <div className="card-footer bg-transparent">
                  <div className="d-flex justify-content-between align-items-center">
                    {/* Action buttons based on status */}
                    <div className="d-flex gap-2">
                      {appointment.status === 'scheduled' && (
                        <>
                          <button
                            className={`btn btn-sm ${canReschedule(appointment) ? 'btn-outline-warning' : 'btn-outline-secondary'}`}
                            onClick={() => handleReschedule(appointment)}
                            disabled={!canReschedule(appointment)}
                            title={
                              canReschedule(appointment) 
                                ? "Request Reschedule" 
                                : rejectedRequests.has(appointment.id) 
                                  ? "Cannot reschedule - previous request was rejected" 
                                  : "Cannot reschedule this appointment"
                            }
                          >
                            <i className="bi bi-arrow-repeat me-1"></i>
                            Reschedule
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleCancel(appointment)}
                            title="Request Cancellation"
                          >
                            <i className="bi bi-x-circle me-1"></i>
                            Cancel
                          </button>
                        </>
                      )}

                      {appointment.status === 'pending' && (
                        <>
                          <button
                            className={`btn btn-sm ${canReschedule(appointment) ? 'btn-outline-warning' : 'btn-outline-secondary'}`}
                            onClick={() => handleReschedule(appointment)}
                            disabled={!canReschedule(appointment)}
                            title={
                              canReschedule(appointment) 
                                ? "Request Reschedule" 
                                : rejectedRequests.has(appointment.id) 
                                  ? "Cannot reschedule - previous request was rejected" 
                                  : "Cannot reschedule this appointment"
                            }
                          >
                            <i className="bi bi-arrow-repeat me-1"></i>
                            Reschedule
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleCancel(appointment)}
                            title="Request Cancellation"
                          >
                            <i className="bi bi-x-circle me-1"></i>
                            Cancel Request
                          </button>
                        </>
                      )}

                      {appointment.status === 'done' && (
                        <>
                          <button
                            className="btn btn-sm btn-outline-success"
                            onClick={() => handleCloneAppointment(appointment)}
                            title="Book Same Service Again"
                          >
                            <i className="bi bi-arrow-clockwise me-1"></i>
                            Book Again
                          </button>
                          {!appointment.is_reviewed ? (
                            <button
                              className="btn btn-sm btn-outline-warning"
                              onClick={() => setRatingAppointment(appointment)}
                              title="Rate & Review"
                            >
                              <i className="bi bi-star me-1"></i>
                              Rate
                            </button>
                          ) : (
                            <div className="d-flex align-items-center">
                              <div className="me-2">
                                {[...Array(5)].map((_, i) => (
                                  <i
                                    key={i}
                                    className={`bi bi-star-fill ${
                                      i < (appointment.customer_rating || 0) ? 'text-warning' : 'text-muted'
                                    }`}
                                    style={{ fontSize: '0.8rem' }}
                                  ></i>
                                ))}
                              </div>
                              <small className="text-muted">Rated</small>
                            </div>
                          )}
                        </>
                      )}
                      

                      {appointment.status === 'cancelled' && (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => handleCloneAppointment(appointment)}
                          title="Book Same Service Again"
                        >
                          <i className="bi bi-arrow-clockwise me-1"></i>
                          Book Again
                        </button>
                      )}

                      {appointment.status === 'ongoing' && (
                        <small className="text-primary">
                          <i className="bi bi-info-circle me-1"></i>
                          Service in progress...
                        </small>
                      )}
                    </div>

                    <small className="text-muted">
                      {new Date(appointment.created_at).toLocaleDateString()}
                    </small>
                  </div>
                </div>
              </div>
            </div>
            ))}
          </div>
          
          {/* Pagination Controls */}
          {getTotalPages() > 1 && (
            <div className="d-flex justify-content-center mt-4">
              <nav aria-label="Appointments pagination">
                <ul className="pagination">
                  <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                    <button 
                      className="page-link" 
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <i className="bi bi-chevron-left"></i>
                    </button>
                  </li>
                  
                  {Array.from({ length: getTotalPages() }, (_, i) => i + 1).map(page => (
                    <li key={page} className={`page-item ${currentPage === page ? 'active' : ''}`}>
                      <button 
                        className="page-link" 
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    </li>
                  ))}
                  
                  <li className={`page-item ${currentPage === getTotalPages() ? 'disabled' : ''}`}>
                    <button 
                      className="page-link" 
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === getTotalPages()}
                    >
                      <i className="bi bi-chevron-right"></i>
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          )}
          
          {/* Pagination Info */}
          {getTotalPages() > 1 && (
            <div className="text-center mt-2">
              <small className="text-muted">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filterAppointmentsByDate(filteredAppointments).length)} of {filterAppointmentsByDate(filteredAppointments).length} appointments
              </small>
            </div>
          )}
        </div>
      )}

      {/* Reschedule/Cancel Modal */}
      <RescheduleCancelModal
        isOpen={modalData.isOpen}
        onClose={handleModalClose}
        appointment={modalData.appointment}
        action={modalData.action}
        onSuccess={handleModalSuccess}
      />

      {/* Auto-refresh indicator */}
      <div className="position-fixed bottom-0 start-0 p-3" style={{ zIndex: 1040 }}>
        <small className="badge bg-secondary">
          <i className="bi bi-arrow-clockwise me-1"></i>
          Auto-updating
        </small>
      </div>
      
    </div>
  );
};

export default CustomerAppointments;