// components/dashboards/CustomerDashboard.js (Enhanced with queue status and new features)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import NotificationPermission from '../common/NotificationPermission';
import AdvancedHybridQueueService from '../../services/queue/AdvancedHybridQueueService';
import logoImage from '../../assets/images/raf-rok-logo.png';

// Helper function to convert 24-hour format to 12-hour format
const convertTo12Hour = (time24) => {
  if (!time24) return 'TBD';
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minutes} ${ampm}`;
};

const CustomerDashboard = () => {
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [queuePositions, setQueuePositions] = useState({});
  const [barberStatuses, setBarberStatuses] = useState({});
  const [pendingRequests, setPendingRequests] = useState([]);
  const [userStats, setUserStats] = useState({
    totalAppointments: 0,
    favoriteBarber: null,
    lastVisit: null,
    totalSpent: 0,
    upcomingCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [animateCards, setAnimateCards] = useState(false);
  const [animateActions, setAnimateActions] = useState(false);
  const [realTimeUpdates, setRealTimeUpdates] = useState(true);
  const [liveQueueStatus, setLiveQueueStatus] = useState({});
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isFetchingQueue, setIsFetchingQueue] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [priorityRequestModal, setPriorityRequestModal] = useState({
    isOpen: false,
    appointment: null
  });

  useEffect(() => {
    getCurrentUser();

    setTimeout(() => {
      setAnimateCards(true);
      setTimeout(() => {
        setAnimateActions(true);
      }, 300);
    }, 300);
  }, []);

  useEffect(() => {
    if (user) {
      fetchCustomerData();
      fetchLiveQueueStatus();

      // Set up real-time subscription for appointments
      const subscription = supabase
        .channel('customer-appointments')
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'appointments',
            filter: `customer_id=eq.${user.id}`
          },
          () => {
            if (realTimeUpdates) {
              debouncedRefresh();
            }
          }
        )
        .subscribe();

      // Set up interval for queue position updates
      const interval = setInterval(() => {
        if (realTimeUpdates) {
          updateQueuePositions();
          fetchLiveQueueStatus();
        }
      }, 30000); // Update every 30 seconds

      return () => {
        subscription.unsubscribe();
        clearInterval(interval);
      };
    }
  }, [user, realTimeUpdates]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  // Debounced refresh function to prevent rapid successive calls
  const debouncedRefresh = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    const timeout = setTimeout(() => {
      if (realTimeUpdates) {
        fetchCustomerData();
        fetchLiveQueueStatus();
      }
    }, 1000); // 1 second debounce

    setDebounceTimeout(timeout);
  };

  // Debug function - can be called from browser console
  window.debugAppointments = async () => {
    try {
      console.log('🔍 Debugging appointments...');

      // Check current user
      const { data: { user } } = await supabase.auth.getUser();
      console.log('👤 Current user:', user?.id);

      if (!user) {
        console.error('❌ No authenticated user');
        return;
      }

      // Check status values in database
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('status')
        .eq('customer_id', user.id)
        .limit(10);

      if (error) {
        console.error('❌ Error fetching appointments:', error);
        return;
      }

      const uniqueStatuses = [...new Set(appointments.map(apt => apt.status))];
      console.log('📊 Status values found:', uniqueStatuses);

      const expectedStatuses = ['pending', 'scheduled', 'confirmed', 'ongoing', 'completed', 'cancelled'];
      const invalidStatuses = uniqueStatuses.filter(status => !expectedStatuses.includes(status));

      if (invalidStatuses.length > 0) {
        console.warn('⚠️ Invalid status values:', invalidStatuses);
        console.log('💡 Run the SQL fix script to update these values');
      } else {
        console.log('✅ All status values are valid');
      }

    } catch (error) {
      console.error('❌ Debug error:', error);
    }
  };

  const fetchCustomerData = async () => {
    if (isFetchingData) return; // Prevent multiple simultaneous calls

    try {
      setIsFetchingData(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      // Fetch upcoming appointments with all related data in one query
      const today = new Date().toISOString().split('T')[0];

      // Try to fetch with priority request fields, fallback if they don't exist
      let appointments, appointmentsError;

      try {
        const result = await supabase
          .from('appointments')
          .select(`
            *,
            barber:barber_id(id, full_name, email, barber_status),
            service:service_id(id, name, price, duration)
          `)
          .eq('customer_id', user.id)
          .gte('appointment_date', today)
          .in('status', ['scheduled', 'ongoing', 'pending', 'confirmed'])
          .order('appointment_date')
          .order('queue_position', { ascending: true });

        appointments = result.data;
        appointmentsError = result.error;

        // If error is about missing columns, that's okay - fields will be undefined
        if (appointmentsError && appointmentsError.message &&
          appointmentsError.message.includes('column') &&
          appointmentsError.message.includes('does not exist')) {
          // Retry without the problematic fields (they'll be undefined)
          const retryResult = await supabase
            .from('appointments')
            .select(`
              *,
              barber:barber_id(id, full_name, email, barber_status),
              service:service_id(id, name, price, duration)
            `)
            .eq('customer_id', user.id)
            .gte('appointment_date', today)
            .in('status', ['scheduled', 'ongoing', 'pending', 'confirmed'])
            .order('appointment_date')
            .order('queue_position', { ascending: true });

          appointments = retryResult.data;
          appointmentsError = retryResult.error;
        }
      } catch (err) {
        appointmentsError = err;
      }

      if (appointmentsError) throw appointmentsError;

      // Separate pending requests from confirmed appointments
      const confirmedAppointments = appointments?.filter(apt => apt.status !== 'pending') || [];
      const pendingAppointments = appointments?.filter(apt => apt.status === 'pending') || [];

      // Debug: Log appointment details to help diagnose
      if (confirmedAppointments.length > 0) {
        console.log('📋 Upcoming Appointments:', confirmedAppointments.map(apt => ({
          id: apt.id,
          status: apt.status,
          is_urgent: apt.is_urgent,
          priority_request_status: apt.priority_request_status,
          queue_position: apt.queue_position,
          canRequestPriority: ['scheduled', 'confirmed', 'pending'].includes(apt.status) &&
            !apt.is_urgent &&
            (apt.priority_request_status === null || apt.priority_request_status === undefined || apt.priority_request_status === '') &&
            apt.queue_position !== null
        })));
      }

      setUpcomingAppointments(confirmedAppointments);
      setPendingRequests(pendingAppointments);

      // Extract barber statuses from appointments data
      const barberStatusMap = {};
      appointments?.forEach(apt => {
        if (apt.barber) {
          barberStatusMap[apt.barber_id] = apt.barber.barber_status || 'available';
        }
      });
      setBarberStatuses(barberStatusMap);

      // Update queue positions for today's appointments
      await updateQueuePositions(confirmedAppointments);

      // Fetch user statistics in parallel
      const [totalAppointmentsResult, completedAppointmentsResult, appointmentsByBarberResult, lastAppointmentResult, completedOrdersResult] = await Promise.all([
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('customer_id', user.id),

        supabase
          .from('appointments')
          .select('total_price, service:service_id(price), is_urgent')
          .eq('customer_id', user.id)
          .eq('status', 'completed'),

        supabase
          .from('appointments')
          .select('barber_id, barber:barber_id(full_name)')
          .eq('customer_id', user.id)
          .eq('status', 'completed'),

        supabase
          .from('appointments')
          .select('appointment_date')
          .eq('customer_id', user.id)
          .eq('status', 'completed')
          .order('appointment_date', { ascending: false })
          .limit(1),

        // Fetch only completed orders for the customer (picked_up status)
        supabase
          .from('orders')
          .select('total_amount')
          .eq('customer_id', user.id)
          .eq('status', 'picked_up')
      ]);

      const totalAppointments = totalAppointmentsResult.count || 0;
      const completedAppointments = completedAppointmentsResult.data || [];
      const appointmentsByBarber = appointmentsByBarberResult.data || [];
      const lastAppointment = lastAppointmentResult.data?.[0];
      const completedOrders = completedOrdersResult.data || [];

      // Calculate total spent from completed appointments (status = 'completed')
      // Includes base price + urgent fees (if applicable)
      const appointmentSpent = completedAppointments.reduce((sum, apt) => {
        const price = apt.total_price || apt.service?.price || 0;
        const urgentFee = apt.is_urgent ? 100 : 0;
        return sum + price + urgentFee;
      }, 0);

      // Calculate total spent from completed orders (status = 'picked_up')
      const orderSpent = completedOrders.reduce((sum, order) => {
        return sum + (order.total_amount || 0);
      }, 0);

      // Total spent = completed appointments + completed orders
      const totalSpent = appointmentSpent + orderSpent;

      // Find favorite barber
      const barberCounts = {};
      appointmentsByBarber.forEach(apt => {
        barberCounts[apt.barber_id] = (barberCounts[apt.barber_id] || 0) + 1;
      });

      const favoriteBarber = Object.keys(barberCounts).reduce((a, b) =>
        barberCounts[a] > barberCounts[b] ? a : b, null);

      const favoriteBarberInfo = appointmentsByBarber.find(apt => apt.barber_id === favoriteBarber)?.barber;

      setUserStats({
        totalAppointments,
        favoriteBarber: favoriteBarberInfo,
        lastVisit: lastAppointment?.appointment_date,
        totalSpent,
        upcomingCount: confirmedAppointments.length
      });

    } catch (error) {
      console.error('Error fetching customer data:', error);
    } finally {
      setLoading(false);
      setIsFetchingData(false);
    }
  };

  const updateQueuePositions = async (appointments = upcomingAppointments) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayAppointments = appointments.filter(apt =>
        apt.appointment_date === today && apt.status === 'scheduled'
      );

      const positions = {};

      for (const appointment of todayAppointments) {
        const { data: queueData, error } = await supabase
          .from('appointments')
          .select('id, queue_position, customer:customer_id(full_name)')
          .eq('barber_id', appointment.barber_id)
          .eq('appointment_date', today)
          .eq('status', 'scheduled')
          .order('queue_position', { ascending: true });

        if (!error && queueData) {
          const currentIndex = queueData.findIndex(apt => apt.id === appointment.id);
          const position = currentIndex + 1;
          const estimatedWait = currentIndex * 35; // 35 minutes average per customer

          positions[appointment.id] = {
            position,
            totalInQueue: queueData.length,
            estimatedWait: estimatedWait < 60 ? `${estimatedWait} min` :
              `${Math.floor(estimatedWait / 60)}h ${estimatedWait % 60}m`,
            customersAhead: queueData.slice(0, currentIndex).map(apt => apt.customer.full_name)
          };
        }
      }

      setQueuePositions(positions);
    } catch (err) {
      console.error('Error fetching queue positions:', err);
    }
  };

  const fetchLiveQueueStatus = async () => {
    if (isFetchingQueue) return; // Prevent multiple simultaneous calls

    try {
      setIsFetchingQueue(true);
      if (!user) return;

      // Get all barbers that the customer has appointments with
      const { data: barberData, error: barberError } = await supabase
        .from('appointments')
        .select('barber_id, barber:barber_id(id, full_name)')
        .eq('customer_id', user.id)
        .in('status', ['scheduled', 'pending', 'ongoing', 'confirmed'])
        .gte('appointment_date', new Date().toISOString().split('T')[0]);

      if (barberError) throw barberError;

      // Get unique barbers
      const uniqueBarbers = [...new Map(barberData.map(item => [item.barber_id, item.barber])).values()];

      const queueStatusData = {};
      const today = new Date().toISOString().split('T')[0];

      // Fetch queue status for all barbers in parallel
      const queuePromises = uniqueBarbers.map(async (barber) => {
        try {
          const queueData = await AdvancedHybridQueueService.getUnifiedQueue(barber.id, today);

          if (queueData && queueData.timeline) {
            // Filter out COMPLETED/CANCELLED and customer names for privacy
            const sanitizedTimeline = queueData.timeline
              .filter(apt => !['completed', 'cancelled', 'cancel'].includes(apt.status))
              .map(apt => ({
                id: apt.id,
                appointment_type: apt.appointment_type,
                appointment_time: apt.appointment_time,
                estimated_time: apt.estimated_time,
                estimated_end: apt.estimated_end,
                status: apt.status,
                queue_position: apt.queue_position,
                timeline_position: apt.timeline_position,
                wait_time: apt.wait_time,
                estimated_arrival: apt.estimated_arrival,
                total_duration: apt.total_duration,
                is_urgent: apt.is_urgent,
                priority_level: apt.priority_level,
                // Remove customer name for privacy
                customer_name: apt.appointment_type === 'queue' ? `Customer #${apt.queue_position || apt.timeline_position}` : 'Scheduled Customer'
              }));

            if (sanitizedTimeline.length === 0) return null;

            return {
              barberId: barber.id,
              data: {
                barber_name: barber.full_name,
                timeline: sanitizedTimeline,
                stats: queueData.stats,
                current: queueData.current,
                total: sanitizedTimeline.length
              }
            };
          }
        } catch (err) {
          console.error(`Error fetching queue status for barber ${barber.id}:`, err);
          return null;
        }
      });

      const queueResults = await Promise.all(queuePromises);

      // Process results
      queueResults.forEach(result => {
        if (result) {
          queueStatusData[result.barberId] = result.data;
        }
      });

      setLiveQueueStatus(queueStatusData);
    } catch (err) {
      console.error('Error fetching live queue status:', err);
    } finally {
      setIsFetchingQueue(false);
    }
  };

  const openPriorityRequestModal = (appointment) => {
    setPriorityRequestModal({
      isOpen: true,
      appointment: appointment
    });
  };

  const closePriorityRequestModal = () => {
    setPriorityRequestModal({
      isOpen: false,
      appointment: null
    });
  };

  const handleRequestPriority = async (appointmentId) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          priority_request_status: 'pending',
          priority_requested_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Send notification to managers
      try {
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        const appointment = upcomingAppointments.find(apt => apt.id === appointmentId);

        // Get all managers
        const { data: managers } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'manager');

        if (managers && managers.length > 0) {
          await Promise.all(managers.map(manager =>
            centralizedNotificationService.createNotification({
              userId: manager.id,
              title: 'Priority Request',
              message: `${user.user_metadata?.full_name || user.email} has requested priority for an appointment.`,
              type: 'priority_request',
              category: 'queue_update',
              priority: 'high',
              channels: ['app', 'push'],
              data: {
                appointment_id: appointmentId,
                customer_name: user.user_metadata?.full_name || user.email,
                barber_name: appointment?.barber?.full_name
              },
              appointmentId: appointmentId
            })
          ));
        }
      } catch (notifError) {
        console.warn('Failed to send priority request notification:', notifError);
      }

      setSuccess('Priority request submitted! Manager will review and notify you.');
      setTimeout(() => setSuccess(''), 5000);
      closePriorityRequestModal();
      fetchCustomerData();
    } catch (err) {
      console.error('Error requesting priority:', err);
      setError('Failed to submit priority request. Please try again.');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      // Find appointment details
      const appointment = upcomingAppointments.find(apt => apt.id === appointmentId);

      // Store original queue position before updating
      const originalQueuePosition = appointment?.queue_position;

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
          const { default: ComprehensiveQueueManager } = await import('../../services/queue/ComprehensiveQueueManager');
          await ComprehensiveQueueManager.collapseQueuePositions(
            appointment.barber_id,
            appointment.appointment_date,
            originalQueuePosition
          );
        } catch (collapseErr) {
          console.warn('Queue collapse warning:', collapseErr);
        }
      }

      // Create notification for barber using centralized service (prevents duplicates)
      if (appointment) {
        try {
          const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
          await centralizedNotificationService.createNotification({
            userId: appointment.barber_id,
            title: 'Appointment Cancelled',
            message: `${user.user_metadata?.full_name || user.email} has cancelled their appointment.`,
            type: 'appointment',
            category: 'status_update',
            priority: 'normal',
            channels: ['app', 'push'],
            appointmentId: appointmentId,
            data: {
              customer_name: user.user_metadata?.full_name || user.email,
              cancelled_by: 'customer'
            }
          });
        } catch (notifError) {
          console.warn('Failed to send cancellation notification to barber:', notifError);
        }
      }

      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'appointment_cancelled_by_customer',
        details: { appointment_id: appointmentId }
      });

      fetchCustomerData();
    } catch (err) {
      console.error('Error cancelling appointment:', err);
    }
  };

  const getServicesDisplay = (appointment) => {
    const services = [];

    if (appointment.service) {
      services.push(appointment.service.name);
    }

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
          services.push(`+${serviceIds.length - 1} more`);
        }
      } catch (e) {
        console.error('Error parsing services data:', e);
        console.log('Raw services_data:', appointment.services_data);
        console.log('Type of services_data:', typeof appointment.services_data);

        // Fallback: treat as single service ID
        if (typeof appointment.services_data === 'string' && appointment.services_data.length > 0) {
          services.push('+1 more');
        }
      }
    }

    return services.join(', ');
  };

  const getTotalPrice = (appointment) => {
    let total = appointment.total_price || appointment.service?.price || 0;
    if (appointment.is_urgent) {
      total += 100;
    }
    return total;
  };

  const getBarberStatusColor = (status) => {
    switch (status) {
      case 'available': return 'success';
      default: return 'secondary';
    }
  };

  const getBarberStatusText = (status) => {
    switch (status) {
      case 'available': return 'Available';
      default: return 'not available';
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="spinner-grow text-primary" role="status" style={{ width: '3rem', height: '3rem' }}>
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-4 dashboard-container">
      {/* Notification Permission Banner */}
      <div className="row mb-0 mt-3">
        <div className="col">
          <NotificationPermission />
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          {success}
          <button type="button" className="btn-close" onClick={() => setSuccess('')}></button>
        </div>
      )}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError('')}></button>
        </div>
      )}

      {/* Customer Welcome Header */}
      <div className="row mb-0">
        <div className="col">
          <div className="customer-welcome-header rounded shadow-sm d-flex align-items-center" style={{ padding: 'clamp(0.5rem, 2vw, 0.75rem)' }}>
            <div>
              <div className="d-flex align-items-center mb-1">
                <img
                  src={logoImage}
                  alt="Raf & Rok"
                  className="dashboard-logo me-3"
                  style={{
                    height: 'clamp(25px, 4vw, 35px)',
                    backgroundColor: '#ffffff',
                    padding: '3px',
                    borderRadius: '5px'
                  }}
                />
                <h1 className="mb-0 text-white" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>
                  Welcome back, {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Customer'}!
                </h1>
              </div>
            </div>
            <div className="ms-auto text-end text-light">
              <div className="mb-0" style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1.25rem)', fontWeight: '600' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions-container mb-0">
        <div className="quick-actions-grid">
          <Link
            to="/book"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="quick-action-icon-wrapper primary-action">
              <i className="bi bi-calendar-plus"></i>
            </div>
            <span className="quick-action-name">Book</span>
            <span className="quick-action-description d-none d-md-block">Schedule your next visit</span>
          </Link>

          <Link
            to="/haircut-recommender"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="quick-action-icon-wrapper success-action">
              <i className="bi bi-magic"></i>
            </div>
            <span className="quick-action-name">Style</span>
            <span className="quick-action-description d-none d-md-block">Get personalized suggestions</span>
          </Link>

          <Link
            to="/appointments"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="quick-action-icon-wrapper info-action">
              <i className="bi bi-calendar-check"></i>
            </div>
            <span className="quick-action-name">Appointments</span>
            <span className="quick-action-description d-none d-md-block">View appointment history</span>
          </Link>

          <Link
            to="/products"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="quick-action-icon-wrapper warning-action">
              <i className="bi bi-bag"></i>
            </div>
            <span className="quick-action-name">Shop</span>
            <span className="quick-action-description d-none d-md-block">Browse our products</span>
          </Link>

          <Link
            to="/orders"
            className={`quick-action-item ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.5s' }}
          >
            <div className="quick-action-icon-wrapper success-action">
              <i className="bi bi-bag-check"></i>
            </div>
            <span className="quick-action-name">Orders</span>
            <span className="quick-action-description d-none d-md-block">Track your product orders</span>
          </Link>
        </div>
      </div>

      {/* Stats Cards - 2x2 Grid */}
      <div className="row mb-3 g-3">
        <div className="col-6 col-md-6 mb-0">
          <div
            className={`card stats-card bg-gradient-primary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="card-body d-flex align-items-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <div>
                <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Total Visits</h6>
                <h2 className="mb-0" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>{userStats.totalAppointments}</h2>
              </div>
              <div className="ms-auto card-icon" style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>
                <i className="bi bi-calendar-check"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-6 mb-0">
          <div
            className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="card-body d-flex align-items-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <div>
                <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Total Spent</h6>
                <h2 className="mb-0" style={{ fontSize: 'clamp(1rem, 3vw, 1.5rem)', fontWeight: 'bold', lineHeight: '1.2' }}>
                  <span className="currency-amount-large">₱{userStats.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </h2>
              </div>
              <div className="ms-auto card-icon" style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>
                <i className="bi bi-wallet2"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-6 mb-0">
          <div
            className={`card stats-card bg-gradient-info text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="card-body d-flex align-items-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <div>
                <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Upcoming</h6>
                <h2 className="mb-0" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold' }}>{userStats.upcomingCount}</h2>
              </div>
              <div className="ms-auto card-icon" style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>
                <i className="bi bi-clock"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-6 mb-0">
          <div
            className={`card stats-card bg-gradient-warning text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="card-body d-flex align-items-center" style={{ padding: 'clamp(0.75rem, 2vw, 1rem)' }}>
              <div>
                <h6 className="card-title mb-1 mb-md-2" style={{ fontSize: 'clamp(0.75rem, 2vw, 0.875rem)' }}>Favorite Barber</h6>
                <h2 className="mb-0" style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1.2rem)', fontWeight: 'bold', lineHeight: '1.2' }}>
                  {userStats.favoriteBarber?.full_name || 'None yet'}
                </h2>
              </div>
              <div className="ms-auto card-icon" style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>
                <i className="bi bi-star"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Requests Alert */}
      {pendingRequests.length > 0 && (
        <div className="alert alert-warning shadow-sm mb-0" role="alert">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <i className="bi bi-clock-fill fs-4"></i>
            </div>
            <div className="flex-grow-1">
              <h5 className="alert-heading mb-1">Pending Requests</h5>
              <p className="mb-0">
                You have {pendingRequests.length} booking request{pendingRequests.length > 1 ? 's' : ''} waiting for barber confirmation.
              </p>
            </div>
            <Link to="/appointments" className="btn btn-warning">
              View Details
            </Link>
          </div>
        </div>
      )}

      <div className="row">
        {/* Upcoming Appointments */}
        <div className="col-md-8 mb-0">
          <div className="card shadow-sm appointments-card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <i className="bi bi-calendar-week me-2 header-icon"></i>
                <h4 className="card-title mb-0">Upcoming Appointments</h4>
              </div>
              <Link to="/book" className="btn btn-primary btn-sm d-inline-flex align-items-center px-3">
                <i className="bi bi-calendar-plus me-2"></i>
                Create
              </Link>
            </div>
            <div className="card-body">
              {upcomingAppointments.length === 0 ? (
                <div className="empty-state text-center py-5">
                  <div className="empty-icon mb-3">
                    <i className="bi bi-calendar-x"></i>
                  </div>
                  <h5>No Upcoming Appointments</h5>
                  <p className="text-muted mb-4">You don't have any appointments scheduled yet.</p>
                  <Link to="/book" className="btn btn-primary me-2">
                    <i className="bi bi-calendar-plus me-2"></i>
                    Book An Appointment
                  </Link>
                </div>
              ) : (
                <div className="row">
                  {upcomingAppointments.map((appointment) => (
                    <div key={appointment.id} className="col-md-6 mb-3">
                      <div className={`card appointment-card h-100 ${appointment.status === 'ongoing' ? 'border-success border-2 shadow' : 'border-primary'}`}>
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div>
                              <h6 className="card-title mb-1">{getServicesDisplay(appointment)}</h6>
                              <p className="text-muted mb-1">
                                <i className="bi bi-person me-1"></i>
                                {appointment.barber?.full_name}
                              </p>
                              <p className="text-muted mb-1">
                                <i className="bi bi-calendar me-1"></i>
                                {new Date(appointment.appointment_date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-end">
                              <span className={`badge bg-${getBarberStatusColor(barberStatuses[appointment.barber_id])}`}>
                                {getBarberStatusText(barberStatuses[appointment.barber_id])}
                              </span>
                              {appointment.is_urgent && (
                                <div className="mt-1">
                                  <span className="badge bg-warning">
                                    <i className="bi bi-lightning-fill me-1"></i>URGENT
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mb-2">
                            <span className="text-success fw-bold">₱{getTotalPrice(appointment)}</span>
                            <span className="text-muted ms-2">
                              ({appointment.total_duration || appointment.service?.duration} min)
                            </span>
                          </div>

                          {appointment.status === 'ongoing' && (
                            <div className="alert alert-success py-2 mb-2 border-0 bg-success bg-opacity-10 text-success fw-bold d-flex align-items-center">
                              <div className="spinner-grow spinner-grow-sm me-2" role="status"></div>
                              <span>Your appointment is in progress!</span>
                            </div>
                          )}

                          {['scheduled', 'confirmed'].includes(appointment.status) && queuePositions[appointment.id] && (
                            <div className="alert alert-info py-2 mb-2 border-0 bg-info bg-opacity-10 text-info fw-bold">
                              <small>
                                <div className="d-flex align-items-center mb-1">
                                  <i className="bi bi-people me-2"></i>
                                  <span>Queue position: #{queuePositions[appointment.id].position} of {queuePositions[appointment.id].totalInQueue}</span>
                                </div>
                                <div className="d-flex align-items-center">
                                  <i className="bi bi-clock me-2"></i>
                                  <span>Est. wait: {queuePositions[appointment.id].estimatedWait}</span>
                                </div>
                              </small>
                            </div>
                          )}

                          {/* Priority Request Status */}
                          {appointment.priority_request_status === 'pending' && (
                            <div className="alert alert-warning py-2 mb-2">
                              <small>
                                <i className="bi bi-clock-history me-1"></i>
                                Priority request pending manager approval
                              </small>
                            </div>
                          )}
                          {appointment.priority_request_status === 'approved' && !appointment.is_urgent && (
                            <div className="alert alert-info py-2 mb-2">
                              <small>
                                <i className="bi bi-check-circle me-1"></i>
                                Priority approved! Fee will be applied.
                              </small>
                            </div>
                          )}
                          {appointment.priority_request_status === 'rejected' && (
                            <div className="alert alert-secondary py-2 mb-2">
                              <small>
                                <i className="bi bi-x-circle me-1"></i>
                                Priority request was declined
                              </small>
                            </div>
                          )}



                          {/* Action Buttons */}
                          <div className="d-flex gap-2">
                            {/* Show Request Priority button if:
                                - Status is scheduled, confirmed, or pending (not ongoing or cancelled)
                                - Not already urgent
                                - No pending/approved/rejected priority request exists
                                - Has a queue position (is in queue) */}
                            {['scheduled', 'confirmed', 'pending'].includes(appointment.status) &&
                              !appointment.is_urgent &&
                              (appointment.priority_request_status === null ||
                                appointment.priority_request_status === undefined ||
                                appointment.priority_request_status === '') &&
                              appointment.queue_position !== null && (
                                <button
                                  className="btn btn-sm btn-warning"
                                  onClick={() => openPriorityRequestModal(appointment)}
                                  title="Request Priority (₱100 fee if approved)"
                                >
                                  <i className="bi bi-lightning-fill me-1"></i>
                                  Request Priority
                                </button>
                              )}
                            {['scheduled', 'confirmed', 'pending'].includes(appointment.status) && (
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleCancelAppointment(appointment.id)}
                                title="Cancel"
                              >
                                <i className="bi bi-x-circle"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Simplified Queue Status */}
        <div className="col-md-4 mt-3">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-white border-0">
              <h6 className="mb-0 text-dark fw-bold">
                <i className="bi bi-people me-2 text-primary"></i>
                Queue Status
              </h6>
            </div>
            <div className="card-body p-3">
              {Object.keys(liveQueueStatus).length > 0 ? (
                Object.entries(liveQueueStatus).map(([barberId, queueData]) => (
                  <div key={barberId} className="mb-3">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <h6 className="mb-0 fw-bold text-dark">{queueData.barber_name}</h6>
                      <span className="badge bg-primary">{queueData.total} waiting</span>
                    </div>

                    <div className="queue-simple">
                      {queueData.timeline.map((appointment, index) => {
                        // Calculate a fallback time if estimated_time is TBD
                        let displayTime = 'TBD';
                        if (appointment.status === 'ongoing') {
                          displayTime = 'Now';
                        } else if (appointment.status === 'pending') {
                          displayTime = 'Review';
                        } else if (appointment.estimated_time) {
                          displayTime = convertTo12Hour(appointment.estimated_time);
                        } else if (appointment.appointment_time) {
                          displayTime = convertTo12Hour(appointment.appointment_time);
                        } else {
                          // Naive estimation: last known time + 35 mins
                          displayTime = 'Soon';
                        }

                        return (
                          <div key={appointment.id} className={`d-flex align-items-center justify-content-between p-2 mb-2 rounded ${appointment.status === 'ongoing' ? 'bg-success text-white shadow-sm fw-bold border-start border-4 border-light' :
                            ['scheduled', 'confirmed'].includes(appointment.status) ? 'bg-primary text-white' :
                              'bg-light'
                            }`}>
                            <div className="d-flex align-items-center">
                              <span className="fw-bold me-2">
                                {upcomingAppointments.some(userApt => userApt.id === appointment.id) ? (
                                  <span className="badge bg-warning text-dark border border-white shadow-sm pulse-badge me-1" style={{ fontSize: '0.75rem' }}>
                                    YOU
                                  </span>
                                ) : (
                                  appointment.appointment_type === 'queue'
                                    ? `#${appointment.queue_position || appointment.timeline_position}`
                                    : 'Sched'
                                )}
                              </span>
                              {appointment.is_urgent && (
                                <i className="bi bi-lightning-fill text-warning me-1"></i>
                              )}
                              {appointment.status === 'ongoing' && (
                                <span className="badge bg-white text-success p-1 rounded-circle me-1" style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <i className="bi bi-scissors" style={{ fontSize: '0.6rem' }}></i>
                                </span>
                              )}
                            </div>
                            <small className={appointment.status === 'ongoing' ? 'text-white' : ''}>
                              {displayTime}
                            </small>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-3">
                  <i className="bi bi-info-circle fs-4 text-muted mb-2"></i>
                  <p className="text-muted mb-0">No active queue</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Priority Request Confirmation Modal */}
      {priorityRequestModal.isOpen && priorityRequestModal.appointment && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title">
                  <i className="bi bi-lightning-fill me-2"></i>
                  Request Priority Service
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closePriorityRequestModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info mb-3">
                  <i className="bi bi-info-circle me-2"></i>
                  <strong>Priority service</strong> moves your appointment to the front of the queue. A ₱100 fee will be applied if approved by the manager.
                </div>

                <div className="card border-0 bg-light mb-3">
                  <div className="card-body">
                    <h6 className="card-title mb-3">Appointment Details</h6>
                    <div className="row g-2">
                      <div className="col-6">
                        <small className="text-muted d-block">Service</small>
                        <strong>{getServicesDisplay(priorityRequestModal.appointment)}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Barber</small>
                        <strong>{priorityRequestModal.appointment.barber?.full_name}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Date</small>
                        <strong>{new Date(priorityRequestModal.appointment.appointment_date).toLocaleDateString()}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Current Position</small>
                        <strong>#{priorityRequestModal.appointment.queue_position}</strong>
                      </div>
                      <div className="col-12">
                        <small className="text-muted d-block">Current Price</small>
                        <strong className="text-success">₱{getTotalPrice(priorityRequestModal.appointment)}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card border-warning mb-3">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-1">Priority Fee</h6>
                        <small className="text-muted">Applied if approved</small>
                      </div>
                      <div className="text-end">
                        <h5 className="mb-0 text-warning">+₱100.00</h5>
                      </div>
                    </div>
                    <hr />
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-0">Total (if approved)</h6>
                      </div>
                      <div className="text-end">
                        <h5 className="mb-0 text-success">
                          ₱{getTotalPrice(priorityRequestModal.appointment) + 100}
                        </h5>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="alert alert-warning mb-0">
                  <small>
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    <strong>Note:</strong> Your request will be reviewed by a manager. You will be notified once a decision is made.
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closePriorityRequestModal}
                >
                  <i className="bi bi-x-circle me-1"></i>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={() => handleRequestPriority(priorityRequestModal.appointment.id)}
                >
                  <i className="bi bi-lightning-fill me-1"></i>
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .pulse-badge {
          animation: pulse-animation 2s infinite;
        }
        @keyframes pulse-animation {
          0% { box-shadow: 0 0 0 0px rgba(255, 193, 7, 0.4); }
          100% { box-shadow: 0 0 0 10px rgba(255, 193, 7, 0); }
        }
      `}</style>
    </div>
  );
};

export default CustomerDashboard;
