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
  const styles = {
    card: {
      borderRadius: '24px',
      border: 'none',
      overflow: 'hidden',
    },
    statsCardBlack: {
      background: '#ffffff',
      color: '#1a1a1a',
      borderRadius: '24px',
      border: '1px solid rgba(0,0,0,0.06)',
    },
    statsCardBrown: {
      background: '#ffffff',
      color: '#1a1a1a',
      borderRadius: '24px',
      border: '1px solid rgba(0,0,0,0.06)',
    },
    statsCardGray: {
      background: '#ffffff',
      color: '#1a1a1a',
      borderRadius: '24px',
      border: '1px solid rgba(0,0,0,0.06)',
    },
    statsCardWhite: {
      background: '#ffffff',
      color: '#1a1a1a',
      borderRadius: '20px',
      border: '1px solid #3d2b1f',
    },
    container: {
      fontFamily: "'Outfit', 'Inter', sans-serif",
      backgroundColor: '#fcfcfc',
      minHeight: '100vh'
    },
    sectionTitle: {
      fontSize: '0.85rem',
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: '1.5px',
      color: '#1a1a1a',
      marginBottom: '1.5rem',
      display: 'flex',
      alignItems: 'center',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    },
    appointmentCard: {
      background: '#ffffff',
      border: '1px solid #f0f0f0',
      borderRadius: '20px',
      transition: 'all 0.3s ease'
    },
    badgeOngoing: {
      background: '#3d2b1f',
      color: '#ffffff'
    },
    badgeUpcoming: {
      background: '#f2f2f2',
      color: '#1a1a1a',
      border: '1px solid #dddddd'
    }
  };

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

    // Reduce delay for layout animations to improve perceived speed
    setTimeout(() => {
      setAnimateCards(true);
      setTimeout(() => {
        setAnimateActions(true);
      }, 150);
    }, 150);
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    } finally {
      // Set loading false as soon as we know the auth status
      // This allows the shell of the page to render while data is still fetching
      setLoading(false);
    }
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
          .eq('customer_id', user.id)
          .eq('status', 'completed'),

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
        totalAppointments: completedAppointments.length,
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
      case 'available': return '#3d2b1f'; // Brown
      default: return '#dddddd'; // Light Gray
    }
  };

  const getBarberStatusText = (status) => {
    switch (status) {
      case 'available': return 'Available';
      default: return 'not available';
    }
  };

  // The full page loading spinner is retired in favor of skeleton loading/progressive rendering
  // for better LCP metrics. The header will render immediately.

  return (
    <div className="container-fluid py-4 dashboard-container" style={styles.container}>
      {/* Notification Permission Banner */}
      <div className="row mb-0">
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
      <div className="row mb-3">
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
                <h1 className="mb-0 text-white" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)', fontWeight: 'bold', minHeight: '1.5em' }}>
                  {loading ? (
                    <span className="opacity-50">Welcome back...</span>
                  ) : (
                    `Welcome back, ${user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Customer'}!`
                  )}
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
      <div className="quick-actions-container mb-3">
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
      <div className="row mb-4 g-3">
        <div className="col-6 col-md-3">
          <div
            className={`card h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ ...styles.statsCardBlack, animationDelay: '0.1s' }}
          >
            <div className="card-body d-flex flex-column justify-content-center p-3">
              <div className="text-muted extra-small mb-1 fw-bold text-uppercase letter-spacing-1">Visits</div>
              <h2 className="mb-0 fw-800 text-dark">{userStats.totalAppointments}</h2>
              <div className="position-absolute end-0 bottom-0 p-2 opacity-10">
                <i className="bi bi-calendar-check fs-1 text-dark"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div
            className={`card h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ ...styles.statsCardBrown, animationDelay: '0.2s' }}
          >
            <div className="card-body d-flex flex-column justify-content-center p-3">
              <div className="text-muted extra-small mb-1 fw-bold text-uppercase letter-spacing-1">Spent</div>
              <h2 className="mb-0 fw-800 text-dark" style={{ fontSize: '1.25rem' }}>
                ₱{userStats.totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </h2>
              <div className="position-absolute end-0 bottom-0 p-2 opacity-10">
                <i className="bi bi-wallet2 fs-1 text-dark"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div
            className={`card h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ ...styles.statsCardGray, animationDelay: '0.3s' }}
          >
            <div className="card-body d-flex flex-column justify-content-center p-3">
              <div className="text-muted small mb-1 fw-bold text-uppercase letter-spacing-1">Upcoming</div>
              <h2 className="mb-0 fw-800 text-dark">{userStats.upcomingCount}</h2>
              <div className="position-absolute end-0 bottom-0 p-2 opacity-10">
                <i className="bi bi-clock fs-1 text-dark"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div
            className={`card h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ ...styles.statsCardWhite, animationDelay: '0.4s' }}
          >
            <div className="card-body d-flex flex-column justify-content-center p-3">
              <div className="text-muted small mb-1 fw-bold text-uppercase letter-spacing-1">Favorite</div>
              <h2 className="mb-0 fw-800 text-dark" style={{ fontSize: '0.9rem' }}>
                {userStats.favoriteBarber?.full_name || 'None yet'}
              </h2>
              <div className="position-absolute end-0 bottom-0 p-2 opacity-10">
                <i className="bi bi-star fs-1 text-dark"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Requests Alert */}
      {pendingRequests.length > 0 && (
        <div className="alert border-0 shadow-sm mb-4" style={{ background: '#f8f9fa', borderLeft: '4px solid #3d2b1f', borderRadius: '15px' }} role="alert">
          <div className="d-flex align-items-center">
            <div className="me-3">
              <i className="bi bi-clock-fill fs-4" style={{ color: '#3d2b1f' }}></i>
            </div>
            <div className="flex-grow-1">
              <h6 className="mb-1 fw-800 text-dark">Pending Requests</h6>
              <p className="mb-0 small text-muted">
                You have {pendingRequests.length} booking request{pendingRequests.length > 1 ? 's' : ''} waiting for confirmation.
              </p>
            </div>
            <Link
              to="/appointments"
              className="btn btn-sm btn-premium-brown fw-bold"
              style={{ borderRadius: '12px', padding: '8px 20px', fontSize: '0.9rem' }}
            >
              View
            </Link>
          </div>
        </div>
      )}

      <div className="row g-4">
        {/* Upcoming Appointments */}
        <div className="col-lg-8">
          <div className="card shadow-sm border-0" style={{ borderRadius: '24px' }}>
            <div className="card-header bg-white py-4 px-4 border-0 d-flex justify-content-between align-items-center">
              <div style={styles.sectionTitle} className="mb-0">
                <i className="bi bi-calendar-event me-2"></i>
                Upcoming Appointments
              </div>
              <Link to="/book" className="btn btn-dark btn-sm rounded-pill px-4" style={{ backgroundColor: '#1a1a1a', display: 'flex', alignItems: 'center' }}>
                <i className="bi bi-plus-lg me-2 text-white"></i>
                <span style={{ color: '#ffffff' }}>New Booking</span>
              </Link>
            </div>
            <div className="card-body px-4 pb-4 pt-0">
              {upcomingAppointments.length === 0 ? (
                <div className="empty-state text-center py-5">
                  <div className="empty-icon mb-4">
                    <i className="bi bi-calendar2-x text-muted" style={{ fontSize: '3rem opacity: 0.3' }}></i>
                  </div>
                  <h5 className="fw-800 text-dark">No Appointments</h5>
                  <p className="text-muted mb-4 small">Your schedule is currently clear.</p>
                  <Link to="/book" className="btn btn-dark rounded-pill px-4" style={{ backgroundColor: '#1a1a1a' }}>
                    <span style={{ color: '#ffffff' }}>Book Now</span>
                  </Link>
                </div>
              ) : (
                <div className="row">
                  {upcomingAppointments.map((appointment) => (
                    <div key={appointment.id} className="col-md-6 mb-3">
                      <div className="card h-100 shadow-sm" style={styles.appointmentCard}>
                        <div className="card-body p-4">
                          <div className="d-flex justify-content-between align-items-start mb-3">
                            <div>
                              <h6 className="fw-800 mb-1 text-dark">{getServicesDisplay(appointment)}</h6>
                              <div className="d-flex flex-column gap-1">
                                <span className="text-muted small">
                                  <i className="bi bi-person me-2"></i>
                                  {appointment.barber?.full_name}
                                </span>
                                <span className="text-muted small">
                                  <i className="bi bi-calendar3 me-2"></i>
                                  {new Date(appointment.appointment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </div>
                            </div>
                            <div className="text-end">
                              <span className="badge rounded-pill" style={appointment.status === 'ongoing' ? styles.badgeOngoing : styles.badgeUpcoming}>
                                {appointment.status === 'ongoing' ? 'In Progress' : 'Confirmed'}
                              </span>
                            </div>
                          </div>

                          <div className="mb-2">
                            <span className="fw-800 text-dark">₱{getTotalPrice(appointment)}</span>
                            <span className="text-muted ms-2">
                              ({appointment.total_duration || appointment.service?.duration} min)
                            </span>
                          </div>

                          {appointment.status === 'ongoing' && (
                            <div className="py-2 px-3 mb-3 border-0 rounded-3 d-flex align-items-center" style={{ background: '#3d2b1f', color: '#ffffff' }}>
                              <div className="spinner-grow spinner-grow-sm me-2 text-white" role="status"></div>
                              <span className="small fw-bold">In Progress...</span>
                            </div>
                          )}

                          {['scheduled', 'confirmed'].includes(appointment.status) && queuePositions[appointment.id] && (
                            <div className="py-2 px-3 mb-3 border-0 rounded-3" style={{ background: '#f8f9fa', color: '#1a1a1a', border: '1px solid #eeeeee' }}>
                              <div className="d-flex align-items-center mb-1">
                                <i className="bi bi-people me-2" style={{ color: '#3d2b1f' }}></i>
                                <span className="small fw-bold">Queue: #{queuePositions[appointment.id].position} / {queuePositions[appointment.id].totalInQueue}</span>
                              </div>
                              <div className="d-flex align-items-center">
                                <i className="bi bi-clock me-2" style={{ color: '#3d2b1f' }}></i>
                                <span className="small">Wait: {queuePositions[appointment.id].estimatedWait}</span>
                              </div>
                            </div>
                          )}

                          {appointment.priority_request_status === 'pending' && (
                            <div className="py-2 px-3 mb-2 rounded-3" style={{ background: '#f8f9fa', border: '1px solid #3d2b1f', color: '#3d2b1f' }}>
                              <small className="fw-bold"><i className="bi bi-clock-history me-1"></i> Priority Pending</small>
                            </div>
                          )}
                          {appointment.priority_request_status === 'approved' && !appointment.is_urgent && (
                            <div className="py-2 px-3 mb-2 rounded-3" style={{ background: '#f2f2f2', border: '1px solid #dddddd', color: '#1a1a1a' }}>
                              <small className="fw-bold"><i className="bi bi-check-circle-fill me-1"></i> Priority Approved</small>
                            </div>
                          )}
                          {appointment.priority_request_status === 'rejected' && (
                            <div className="py-2 px-3 mb-2 rounded-3" style={{ background: '#f8f9fa', border: '1px solid #eeeeee', color: '#999' }}>
                              <small><i className="bi bi-x-circle me-1"></i> Priority Declined</small>
                            </div>
                          )}



                          {/* Action Buttons */}
                          <div className="d-flex gap-2 mt-3">
                            {['scheduled', 'confirmed', 'pending'].includes(appointment.status) &&
                              !appointment.is_urgent &&
                              (appointment.priority_request_status === null ||
                                appointment.priority_request_status === undefined ||
                                appointment.priority_request_status === '') &&
                              appointment.queue_position !== null && (
                                <button
                                  className="btn btn-sm rounded-pill px-3"
                                  style={{ background: '#3d2b1f' }}
                                  onClick={() => openPriorityRequestModal(appointment)}
                                >
                                  <i className="bi bi-lightning-fill me-1 text-white"></i>
                                  <span style={{ color: '#ffffff' }}>Priority</span>
                                </button>
                              )}
                            {['scheduled', 'confirmed', 'pending'].includes(appointment.status) && (
                              <button
                                className="btn btn-sm btn-outline-dark px-3 rounded-pill"
                                onClick={() => handleCancelAppointment(appointment.id)}
                              >
                                <i className="bi bi-x-lg me-1"></i>
                                Cancel
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
        <div className="col-lg-4">
          <div className="card shadow-sm border-0" style={{ borderRadius: '24px' }}>
            <div className="card-header bg-white py-4 px-4 border-0">
              <div style={styles.sectionTitle} className="mb-0">
                <i className="bi bi-people me-2"></i>
                Queue Status
              </div>
            </div>
            <div className="card-body p-4 pt-0">
              {Object.keys(liveQueueStatus).length > 0 ? (
                Object.entries(liveQueueStatus).map(([barberId, queueData]) => (
                  <div key={barberId} className="mb-4">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <h6 className="mb-0 fw-800 text-dark">{queueData.barber_name}</h6>
                      <span className="badge rounded-pill px-3" style={{ background: '#f2f2f2', color: '#1a1a1a', border: '1px solid #eeeeee' }}>
                        {queueData.total} in queue
                      </span>
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
                          <div key={appointment.id} className={`d-flex align-items-center justify-content-between p-3 mb-2 rounded-4 ${appointment.status === 'ongoing' ? 'bg-dark text-white shadow-sm fw-bold' :
                            ['scheduled', 'confirmed'].includes(appointment.status) ? 'bg-white border border-secondary text-dark' :
                              'bg-light border border-light'
                            }`}>
                            <div className="d-flex align-items-center">
                              <span className="fw-bold me-2">
                                {upcomingAppointments.some(userApt => userApt.id === appointment.id) ? (
                                  <span className="badge bg-white text-dark border shadow-sm pulse-badge me-1" style={{ fontSize: '0.7rem' }}>
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
                            </div>
                            <small className="opacity-75">
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
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '28px' }}>
              <div className="modal-header border-0 pt-4 px-4">
                <h5 className="modal-title fw-800 text-dark">
                  <i className="bi bi-lightning-fill me-2" style={{ color: '#3d2b1f' }}></i>
                  Priority Service
                </h5>
                <button
                  type="button"
                  className="btn-close shadow-none"
                  onClick={closePriorityRequestModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="alert border-0 mb-3" style={{ background: '#f2f2f2', color: '#1a1a1a', borderRadius: '15px' }}>
                  <i className="bi bi-info-circle me-2" style={{ color: '#3d2b1f' }}></i>
                  <small><strong>Priority service</strong> moves your appointment to the front of the queue. A ₱100 fee will be applied if approved.</small>
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
                        <strong className="text-dark">₱{getTotalPrice(priorityRequestModal.appointment)}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card mb-3" style={{ border: '1px solid #3d2b1f', borderRadius: '15px' }}>
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-0 fw-800">Priority Fee</h6>
                        <small className="text-muted">Applied if approved</small>
                      </div>
                      <div className="text-end">
                        <h5 className="mb-0 fw-800" style={{ color: '#3d2b1f' }}>+₱100.00</h5>
                      </div>
                    </div>
                    <hr />
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-0 fw-800">New Total</h6>
                      </div>
                      <div className="text-end">
                        <h5 className="mb-0 fw-800 text-dark">
                          ₱{getTotalPrice(priorityRequestModal.appointment) + 100}
                        </h5>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="alert border-0 mb-0" style={{ background: '#f8f9fa', color: '#666', borderRadius: '15px' }}>
                  <small>
                    <i className="bi bi-info-circle me-2"></i>
                    <strong>Note:</strong> Your request will be reviewed by a manager. You will be notified once a decision is made.
                  </small>
                </div>
              </div>
              <div className="modal-footer border-0 pb-4 px-4 gap-2">
                <button
                  type="button"
                  className="btn btn-light rounded-pill px-4 fw-bold"
                  onClick={closePriorityRequestModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn rounded-pill px-4 fw-bold shadow-sm"
                  style={{ background: '#3d2b1f' }}
                  onClick={() => handleRequestPriority(priorityRequestModal.appointment.id)}
                >
                  <span style={{ color: '#ffffff' }}>Confirm Request</span>
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
          0% { box-shadow: 0 0 0 0px rgba(61, 43, 31, 0.4); }
          100% { box-shadow: 0 0 0 10px rgba(61, 43, 31, 0); }
        }
        .dashboard-container {
          background-color: #f8f9fa;
          min-vh: 100vh;
        }
        .fw-800 { font-weight: 800; }
        .letter-spacing-1 { letter-spacing: 1px; }

        /* Force white text on dark buttons and their spans */
        .btn-dark, 
        .btn-dark *,
        .btn-dark:hover, 
        .btn-dark:active, 
        .btn-dark:focus,
        .btn-premium-brown,
        .btn-premium-brown *,
        [style*="background: #3d2b1f"],
        [style*="background: #3d2b1f"] *,
        [style*="background:#3d2b1f"],
        [style*="background:#3d2b1f"] * {
          color: #ffffff !important;
        }
        .btn-premium-brown {
          background-color: #3d2b1f !important;
          color: #ffffff !important;
          border: none;
        }
        .btn-premium-brown:hover {
          background-color: #4d3b2f !important;
          color: #ffffff !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
};

export default CustomerDashboard;
