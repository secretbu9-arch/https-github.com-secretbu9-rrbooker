// components/dashboards/ManagerDashboard.js (Enhanced with analytics, queue management, and orders)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/core/ApiService';
import { PushService } from '../../services/notifications/PushService';
import NotificationModal from '../manager/NotificationModal';
import './ManagerDashboard.css';
import logoImage from '../../assets/images/raf-rok-logo.png';

const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalAppointments: 0,
    todayAppointments: 0,
    pendingRequests: 0,
    urgentBookings: 0,
    totalRevenue: 0,
    totalCustomers: 0,
    totalBarbers: 0,
    activeQueues: 0,
    averageWaitTime: 0,
    completionRate: 0,
    // Order statistics
    totalOrders: 0,
    todayOrders: 0,
    pendingOrders: 0,
    readyOrders: 0,
    orderRevenue: 0
  });

  const [recentAppointments, setRecentAppointments] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [barberQueues, setBarberQueues] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [queueAnalytics, setQueueAnalytics] = useState({});
  const [capacityOverview, setCapacityOverview] = useState([]);
  const [barberRatings, setBarberRatings] = useState([]);
  // Order-related state
  const [recentOrders, setRecentOrders] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [animateCards, setAnimateCards] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(null);

  // Notification modal state
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationData, setNotificationData] = useState({
    type: '',
    title: '',
    message: '',
    appointmentData: null
  });
  const [modalLoading, setModalLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState(null);

  useEffect(() => {
    fetchDashboardData();
    fetchQueueAnalytics();
    fetchCapacityOverview();
    fetchBarberRatings();

    // Trigger card animations after component mounts
    setTimeout(() => {
      setAnimateCards(true);
    }, 300);

    // Set up real-time subscription for appointments and orders
    const subscription = supabase
      .channel('manager-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        debouncedRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        debouncedRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        debouncedRefresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: 'role=eq.barber' }, () => {
        debouncedRefresh();
      })
      .subscribe();

    // Set up auto-refresh
    const interval = setInterval(() => {
      debouncedRefresh();
    }, 60000); // Refresh every minute

    setRefreshInterval(interval);

    return () => {
      subscription.unsubscribe();
      if (interval) clearInterval(interval);
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, []);

  // Debounced refresh function to prevent rapid successive calls
  const debouncedRefresh = () => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    const timeout = setTimeout(() => {
      fetchDashboardData();
      fetchQueueAnalytics();
      fetchCapacityOverview();
    }, 1000); // 1 second debounce

    setDebounceTimeout(timeout);
  };

  const fetchDashboardData = async () => {
    if (isFetchingData) return; // Prevent multiple simultaneous calls

    try {
      setIsFetchingData(true);
      setError('');

      // Get today's date
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];

      // Fetch all statistics in parallel
      const [
        { count: totalAppointments },
        { count: todayAppointments },
        { count: pendingRequests },
        { count: urgentBookings },
        { count: totalCustomers },
        { count: totalBarbers },
        { data: completedAppointments },
        { data: appointments },
        { data: logs },
        // Order statistics
        { count: totalOrders },
        { count: todayOrders },
        { count: pendingOrders },
        { count: readyOrders },
        { data: completedOrders },
        { data: recentOrdersData },
        { data: pendingOrdersData }
      ] = await Promise.all([
        // Total appointments
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true }),

        // Today's appointments
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('appointment_date', todayString),

        // Pending requests (all barbers)
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),

        // Urgent bookings today
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('appointment_date', todayString)
          .eq('is_urgent', true),

        // Total customers
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'customer'),

        // Total barbers (Active only - status 'available')
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'barber')
          .or('barber_status.eq.available,barber_status.is.null'),

        // Calculate revenue (completed appointments)
        supabase
          .from('appointments')
          .select(`
            total_price,
            is_urgent,
            service:service_id(price)
          `)
          .eq('status', 'completed'),

        // Recent appointments
        supabase
          .from('appointments')
          .select(`
            *,
            customer:customer_id(full_name, email, phone),
            barber:barber_id(full_name),
            service:service_id(name, price, duration)
          `)
          .order('created_at', { ascending: false })
          .limit(10),

        // Recent logs
        supabase
          .from('system_logs')
          .select(`
            *,
            user:user_id(full_name, role)
          `)
          .order('created_at', { ascending: false })
          .limit(10),

        // Total orders
        supabase
          .from('orders')
          .select('*', { count: 'exact', head: true }),

        // Today's orders
        supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', todayString),

        // Pending orders
        supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),

        // Ready orders
        supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ready_for_pickup'),

        // Completed orders for revenue calculation
        supabase
          .from('orders')
          .select('total_amount')
          .in('status', ['picked_up', 'completed']),

        // Recent orders
        supabase
          .from('orders')
          .select(`
            *,
            customer:customer_id(full_name, email, phone)
          `)
          .order('created_at', { ascending: false })
          .limit(10),

        // Pending orders details
        supabase
          .from('orders')
          .select(`
            *,
            customer:customer_id(full_name, email, phone)
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      // Calculate total revenue including urgent fees
      const appointmentRevenue = completedAppointments?.reduce((sum, appointment) => {
        let price = appointment.total_price || appointment.service?.price || 0;
        if (appointment.is_urgent) {
          price += 100; // Urgent fee
        }
        return sum + price;
      }, 0) || 0;

      // Calculate order revenue
      const orderRevenue = completedOrders?.reduce((sum, order) => {
        return sum + (order.total_amount || 0);
      }, 0) || 0;

      const totalRevenue = appointmentRevenue + orderRevenue;

      // Calculate completion rate
      const totalScheduled = appointments?.filter(apt =>
        ['scheduled', 'completed', 'cancelled'].includes(apt.status)
      ).length || 0;
      const completed = appointments?.filter(apt => apt.status === 'completed').length || 0;
      const completionRate = totalScheduled > 0 ? (completed / totalScheduled) * 100 : 0;

      // Get only active (available) barbers for operational status
      const barbers = await apiService.getBarbers(true, true);
      const queuePromises = barbers.map(async (barber) => {
        const queueInfo = await apiService.getBarberQueue(barber.id, todayString);
        return {
          barber,
          ...queueInfo
        };
      });

      const queues = await Promise.all(queuePromises);
      const activeQueues = queues.filter(q => q.queueCount > 0).length;
      const totalWaitTime = queues.reduce((total, q) => total + q.totalWaitTime, 0);
      const averageWaitTime = queues.length > 0 ? totalWaitTime / queues.length : 0;

      setStats({
        totalAppointments: totalAppointments || 0,
        todayAppointments: todayAppointments || 0,
        pendingRequests: pendingRequests || 0,
        urgentBookings: urgentBookings || 0,
        totalRevenue,
        totalCustomers: totalCustomers || 0,
        totalBarbers: totalBarbers || 0,
        activeQueues,
        averageWaitTime: Math.round(averageWaitTime),
        completionRate: Math.round(completionRate),
        // Order statistics
        totalOrders: totalOrders || 0,
        todayOrders: todayOrders || 0,
        pendingOrders: pendingOrders || 0,
        readyOrders: readyOrders || 0,
        orderRevenue
      });

      setRecentAppointments(appointments || []);
      setRecentLogs(logs || []);
      setBarberQueues(queues);
      setRecentOrders(recentOrdersData || []);
      setPendingOrders(pendingOrdersData || []);

      // Get pending requests details
      const { data: pendingDetails } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(full_name, email, phone),
          barber:barber_id(full_name),
          service:service_id(name, price, duration)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      setPendingRequests(pendingDetails || []);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
      setIsFetchingData(false);
    }
  };

  const fetchQueueAnalytics = async () => {
    try {
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const analytics = await apiService.getQueueAnalytics(
        weekAgo.toISOString().split('T')[0],
        today.toISOString().split('T')[0]
      );

      setQueueAnalytics(analytics);
    } catch (error) {
      console.error('Error fetching queue analytics:', error);
    }
  };

  const fetchCapacityOverview = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const capacity = await apiService.getAllBarbersCapacity(today);
      setCapacityOverview(capacity);
    } catch (error) {
      console.error('Error fetching capacity overview:', error);
    }
  };

  const fetchBarberRatings = async () => {
    try {
      console.log('Fetching barber ratings for manager dashboard...');

      const { data: barbers, error } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          email,
          average_rating,
          total_ratings,
          barber_status
        `)
        .eq('role', 'barber')
        .or('barber_status.eq.available,barber_status.is.null')
        .not('average_rating', 'is', null)
        .order('average_rating', { ascending: false });

      if (error) {
        console.error('Error fetching barber ratings:', error);
        return;
      }

      console.log('Fetched barber ratings:', barbers);
      setBarberRatings(barbers || []);
    } catch (error) {
      console.error('Error fetching barber ratings:', error);
    }
  };

  const handleAppointmentStatus = async (appointmentId, status) => {
    try {
      await apiService.updateAppointment(appointmentId, { status });

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await apiService.logAction(user.id, 'appointment_status_change', {
          appointment_id: appointmentId,
          new_status: status,
          changed_by: 'manager'
        });
      }

      // Create notification using centralized service (ONLY way to create notifications)
      const appointment = recentAppointments.find(apt => apt.id === appointmentId);
      if (appointment) {
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        await centralizedNotificationService.createAppointmentStatusNotification({
          userId: appointment.customer_id,
          appointmentId: appointmentId,
          status: status,
          changedBy: 'manager'
        });

        // Push notification is now handled by CentralizedNotificationService
      }

      // Refresh data
      fetchDashboardData();
    } catch (error) {
      console.error('Error updating appointment status:', error);
      alert('Failed to update appointment status. Please try again.');
    }
  };

  const handlePendingRequest = (appointmentId, action) => {
    const appointment = pendingRequests.find(req => req.id === appointmentId);
    if (!appointment) return;

    // Set up notification modal data
    if (action === 'approve') {
      setNotificationData({
        type: 'approve',
        title: 'Approve Appointment',
        message: `Are you sure you want to approve this appointment for ${appointment.customer?.full_name || 'the customer'}? This will add them to the queue and send them a confirmation notification.`,
        appointmentData: appointment
      });
    } else {
      setNotificationData({
        type: 'reject',
        title: 'Reject Appointment',
        message: `Are you sure you want to reject this appointment for ${appointment.customer?.full_name || 'the customer'}? This will cancel their appointment and send them a notification.`,
        appointmentData: appointment
      });
    }

    setShowNotificationModal(true);
  };

  const handleModalConfirm = async () => {
    const { type, appointmentData } = notificationData;
    const appointmentId = appointmentData.id;

    setModalLoading(true);

    try {
      if (type === 'approve') {
        const queueNumber = await apiService.getNextQueueNumber(
          appointmentData.barber_id,
          appointmentData.appointment_date
        );

        await apiService.confirmAppointment(appointmentId, queueNumber);
        // Do NOT send notification here. Approval notifications are handled
        // centrally in the barber flow to prevent duplicates.
      } else {
        await apiService.declineAppointment(appointmentId, 'Declined by management');

        // Use CentralizedNotificationService to prevent duplicates
        const { default: centralizedNotificationService } = await import('../../services/notifications/CentralizedNotificationService');
        // Keep decline notification (distinct event) or move to centralized flow if needed
        await centralizedNotificationService.createNotification({
          userId: appointmentData.customer_id,
          title: 'Appointment Declined',
          message: 'Your appointment request has been declined by management.',
          type: 'appointment',
          category: 'booking',
          data: { appointment_id: appointmentId },
          channels: ['app', 'push']
        });
      }

      // Show success notification
      setNotificationData({
        type: 'info',
        title: 'Success!',
        message: `Appointment ${type === 'approve' ? 'approved' : 'rejected'} successfully. The customer has been notified.`,
        appointmentData: null
      });

      // Refresh data
      await fetchDashboardData();

      // Close modal after a short delay
      setTimeout(() => {
        setShowNotificationModal(false);
        setModalLoading(false);
      }, 2000);

    } catch (error) {
      console.error('Error handling pending request:', error);
      setNotificationData({
        type: 'warning',
        title: 'Error',
        message: `Failed to process request: ${error.message || 'Unknown error occurred'}`,
        appointmentData: null
      });
      setModalLoading(false);
    }
  };

  const handleModalClose = () => {
    if (!modalLoading) {
      setShowNotificationModal(false);
      setModalLoading(false);
    }
  };

  // Format human-readable timestamp from ISO date
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Format action for display
  const formatAction = (action) => {
    return action
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Calculate estimated wait time for queue position
  const calculateWaitTime = (queueCount, averageServiceTime = 35) => {
    const waitTimeMinutes = queueCount * averageServiceTime;

    if (waitTimeMinutes >= 60) {
      const hours = Math.floor(waitTimeMinutes / 60);
      const minutes = waitTimeMinutes % 60;
      return `${hours}h ${minutes}m`;
    }

    return `${waitTimeMinutes} min`;
  };

  const getCapacityColor = (capacity, maxCapacity) => {
    const percentage = (capacity / maxCapacity) * 100;
    if (percentage >= 90) return 'danger';
    if (percentage >= 70) return 'warning';
    return 'success';
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

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger shadow-sm" role="alert">
          <div className="d-flex align-items-center">
            <i className="bi bi-exclamation-triangle-fill me-2 fs-4"></i>
            <div>
              <h4 className="alert-heading">Error</h4>
              <p className="mb-1">{error}</p>
            </div>
          </div>
          <button className="btn btn-danger mt-2" onClick={fetchDashboardData}>
            <i className="bi bi-arrow-clockwise me-2"></i>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Premium Header */}
      <header className="dashboard-header d-flex justify-content-between align-items-center mb-3">
        <div>
          <h1 className="dashboard-title">
            Manager Dashboard
          </h1>
          <p className="dashboard-subtitle">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </p>
        </div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-outline-secondary btn-premium"
            onClick={fetchDashboardData}
            disabled={isFetchingData}
          >
            <i className={`bi bi-arrow-clockwise me-1 ${isFetchingData ? 'spinner-border spinner-border-sm' : ''}`}></i>
            Refresh
          </button>
        </div>
      </header>

      {/* Category: Operational Overview */}
      <div className="row g-3 mb-3">
        {/* Appointments Today */}
        <div className="col-12 col-md-6 col-lg-3">
          <div className="metric-card animate-fade-in-up stagger-1">
            <div className="card-body">
              <div className="metric-icon-wrapper bg-primary-soft">
                <i className="bi bi-calendar-check"></i>
              </div>
              <div className="metric-label">Daily Appointments</div>
              <div className="metric-value">{stats.todayAppointments}</div>
              <div className="mt-2">
                <small className="text-muted">Total: {stats.totalAppointments}</small>
              </div>
            </div>
          </div>
        </div>

        {/* Financial: Total Revenue */}
        <div className="col-12 col-md-6 col-lg-3">
          <div className="metric-card animate-fade-in-up stagger-2">
            <div className="card-body d-flex flex-column align-items-end">
              <div className="d-flex align-items-center justify-content-between w-100 mb-2">
                <div className="metric-icon-wrapper bg-success-soft mb-0">
                  <span className="fw-bold">₱</span>
                </div>
                <div className="metric-label mb-0">Business Revenue</div>
              </div>
              <div className="metric-value">
                ₱{stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className="mt-1">
                <small className="text-success fw-semibold">Orders: ₱{stats.orderRevenue.toLocaleString()}</small>
              </div>
            </div>
          </div>
        </div>

        {/* Shop Status: Customers & Barbers */}
        <div className="col-12 col-md-6 col-lg-6">
          <div className="metric-card animate-fade-in-up stagger-3">
            <div className="card-body d-flex align-items-center justify-content-between h-100">
              <div className="d-flex align-items-center flex-fill border-end pe-4">
                <div className="metric-icon-wrapper bg-info-soft mb-0 me-3">
                  <i className="bi bi-people-fill"></i>
                </div>
                <div>
                  <div className="metric-label">Total Customers</div>
                  <div className="metric-value" style={{ fontSize: '1.5rem' }}>{stats.totalCustomers}</div>
                </div>
              </div>
              <div className="d-flex align-items-center flex-fill ps-4">
                <div className="metric-icon-wrapper bg-success-soft mb-0 me-3">
                  <i className="bi bi-scissors"></i>
                </div>
                <div>
                  <div className="metric-label">Active Barbers</div>
                  <div className="metric-value" style={{ fontSize: '1.5rem' }}>{stats.totalBarbers}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Integrated Action & Operations Row */}


      <div className="row g-3">
        {/* Recent Operational History (Main Content) */}
        <div className="col-lg-8">
          {/* Recent Appointments */}
          <div className="content-card mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5>
                <i className="bi bi-calendar-week me-2 text-primary"></i>
                Active Appointments
              </h5>
              <div className="d-flex align-items-center gap-2">
                <span className="badge badge-primary">{recentAppointments.length} Items</span>
                <button
                  className="btn btn-sm btn-light border-0"
                  onClick={() => navigate('/manage/appointments')}
                  title="View Full Schedule"
                >
                  <i className="bi bi-arrow-right"></i>
                </button>
              </div>
            </div>
            <div className="card-body p-0">
              {recentAppointments.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-calendar-x text-muted" style={{ fontSize: '3rem' }}></i>
                  <p className="text-muted mt-2 mb-0">No appointments found</p>
                </div>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="table modern-table table-hover">
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Service</th>
                          <th>Schedule</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentAppointments.slice(0, 6).map((appointment) => (
                          <tr key={appointment.id}>
                            <td>
                              <div className="fw-bold">{appointment.customer?.full_name || 'Unknown'}</div>
                              {appointment.customer?.phone && (
                                <small className="text-muted d-block mt-1 x-small">
                                  <i className="bi bi-telephone me-1"></i>
                                  {appointment.customer.phone}
                                </small>
                              )}
                            </td>
                            <td>
                              <div className="fw-semibold">{appointment.service?.name || 'Unknown'}</div>
                              <small className="text-muted">
                                ₱{appointment.total_price || appointment.service?.price}
                              </small>
                            </td>
                            <td>
                              <div className="small fw-medium">{appointment.appointment_date}</div>
                              <small className="text-primary x-small">
                                {appointment.barber?.full_name}
                              </small>
                            </td>
                            <td>
                              <span className={`status-badge badge-${appointment.status === 'completed' ? 'success' :
                                appointment.status === 'ongoing' ? 'warning' :
                                  appointment.status === 'scheduled' || appointment.status === 'confirmed' ? 'primary' :
                                    appointment.status === 'cancelled' ? 'danger' : 'secondary'
                                }`}>
                                {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                              </span>
                            </td>
                            <td>
                              <div className="d-flex gap-1">
                                {appointment.status === 'scheduled' && (
                                  <button
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                                    title="Start Session"
                                  >
                                    <i className="bi bi-play-fill"></i>
                                  </button>
                                )}
                                {appointment.status === 'ongoing' && (
                                  <button
                                    className="btn btn-sm btn-outline-success"
                                    onClick={() => handleAppointmentStatus(appointment.id, 'completed')}
                                    title="Complete Session"
                                  >
                                    <i className="bi bi-check-lg"></i>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-2 border-top bg-light text-center">
                    <button className="btn btn-sm btn-light w-100 border-0 x-small fw-bold" onClick={() => navigate('/manage/appointments')}>
                      MANAGED DETAILED SCHEDULE <i className="bi bi-chevron-right ms-1"></i>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Recent Orders Overview */}
          {recentOrders.length > 0 && (
            <div className="content-card mb-3">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5>
                  <i className="bi bi-receipt me-2 text-success"></i>
                  Recent Shop Orders
                </h5>
                <button
                  className="btn btn-premium btn-outline-secondary btn-sm"
                  onClick={() => navigate('/manage/orders')}
                >
                  Manage All
                </button>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table modern-table table-hover">
                    <thead>
                      <tr>
                        <th>Order Ref</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.slice(0, 5).map((order) => (
                        <tr key={order.id}>
                          <td className="fw-bold text-primary">#{order.order_number || order.id.slice(0, 8)}</td>
                          <td>{order.customer?.full_name || 'Unknown'}</td>
                          <td>
                            <span className="fw-bold text-dark">
                              ₱{Number(order.total_amount || 0).toFixed(2)}
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge badge-${order.status === 'picked_up' || order.status === 'completed' ? 'success' :
                              order.status === 'ready_for_pickup' ? 'success' :
                                order.status === 'preparing' ? 'warning' :
                                  order.status === 'confirmed' ? 'primary' :
                                    order.status === 'pending' ? 'secondary' : 'danger'
                              }`}>
                              {order.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-light border"
                              onClick={() => navigate(`/manage/orders?order=${order.id}`)}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Action Center & Priority Tasks */}
        <div className="col-lg-4">
          <div className="card content-card shadow-sm border-0 mb-3" style={{ background: '#f8f9fc' }}>
            <div className="card-body p-3">
              <h6 className="fw-bold mb-3 d-flex align-items-center">
                <i className="bi bi-lightning-fill text-warning me-2"></i>
                Action Center
              </h6>

              {/* Critical Requests Count */}
              <div className="d-flex gap-2 mb-3">
                <div className="flex-fill bg-white p-3 rounded-3 border shadow-xs text-center">
                  <div className="text-warning h4 mb-0 fw-bold">{pendingRequests.length}</div>
                  <div className="text-muted x-small fw-bold">REQUESTS</div>
                </div>
                <div className="flex-fill bg-white p-3 rounded-3 border shadow-xs text-center">
                  <div className="text-info h4 mb-0 fw-bold">{pendingOrders.length}</div>
                  <div className="text-muted x-small fw-bold">ORDERS</div>
                </div>
              </div>

              {/* Collapsible Action Sections */}
              <div className="action-hub-sections">
                {/* Pending Booking Requests */}
                {pendingRequests.length > 0 && (
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="x-small fw-bold text-muted uppercase">URGENT REQUESTS</span>
                    </div>
                    {pendingRequests.slice(0, 3).map((request) => (
                      <div key={request.id} className="p-2 mb-2 bg-white rounded border-start border-4 border-warning shadow-xs">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div>
                            <div className="fw-bold" style={{ fontSize: '0.8rem' }}>{request.customer?.full_name}</div>
                            <div className="text-muted x-small">{request.service?.name}</div>
                          </div>
                          {request.is_urgent && <span className="badge bg-danger x-small">!!!</span>}
                        </div>
                        <div className="d-flex gap-1">
                          <button className="btn btn-sm btn-primary py-0 px-2 x-small" onClick={() => handlePendingRequest(request.id, 'approve')}>Approve</button>
                          <button className="btn btn-sm btn-outline-secondary py-0 px-2 x-small border-0" onClick={() => handlePendingRequest(request.id, 'decline')}>Decline</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pending Product Orders */}
                {pendingOrders.length > 0 && (
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="x-small fw-bold text-muted uppercase">ORDERS TO PROCESS</span>
                    </div>
                    {pendingOrders.slice(0, 3).map((order) => (
                      <div key={order.id} className="p-2 mb-2 bg-white rounded border-start border-4 border-info shadow-xs">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <div className="fw-bold" style={{ fontSize: '0.8rem' }}>#{order.order_number || order.id.slice(0, 6)}</div>
                            <div className="text-muted x-small">{order.customer?.full_name}</div>
                          </div>
                          <span className="status-badge badge-warning x-small">₱{Number(order.total_amount).toFixed(0)}</span>
                        </div>
                        <button className="btn btn-sm btn-outline-info w-100 mt-2 py-0 x-small" onClick={() => navigate(`/manage/orders?order=${order.id}`)}>Review Order</button>
                      </div>
                    ))}
                  </div>
                )}

                {pendingRequests.length === 0 && pendingOrders.length === 0 && (
                  <div className="text-center py-4 opacity-50">
                    <i className="bi bi-check2-all h1"></i>
                    <p className="small mb-0">System clear, all tasks handled!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Barber Performance Leaderboard */}
      {barberRatings.length > 0 && (
        <div className="row mb-3">
          <div className="col-12">
            <div className="content-card">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0">
                  <i className="bi bi-award me-2 text-warning"></i>
                  Barber Performance
                </h5>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {barberRatings.slice(0, 4).map((barber) => (
                    <div key={barber.id} className="col-12 col-md-6 col-lg-3">
                      <div className="p-3 rounded-4 border bg-light h-100 transition-hover">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <div className="fw-bold">{barber.full_name}</div>
                          <span className={`status-badge badge-${barber.barber_status === 'available' ? 'success' :
                            barber.barber_status === 'busy' ? 'danger' : 'secondary'
                            }`}>
                            {barber.barber_status === 'available' ? 'Available' : barber.barber_status.charAt(0).toUpperCase() + barber.barber_status.slice(1)}
                          </span>
                        </div>
                        <div className="d-flex align-items-center justify-content-between">
                          <div>
                            <div className="text-warning small mb-1">
                              {[...Array(5)].map((_, i) => (
                                <i key={i} className={`bi bi-star${i < Math.floor(barber.average_rating || 0) ? '-fill' : ''} me-1`}></i>
                              ))}
                            </div>
                            <div className="text-muted small">{barber.total_ratings || 0} Ratings</div>
                          </div>
                          <div className="text-end">
                            <div className="h4 mb-0 fw-bold">{barber.average_rating || '0'}</div>
                            <div className="text-muted x-small">AVG SCORE</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      <NotificationModal
        isOpen={showNotificationModal}
        onClose={handleModalClose}
        type={notificationData.type}
        title={notificationData.title}
        message={notificationData.message}
        appointmentData={notificationData.appointmentData}
        onConfirm={handleModalConfirm}
        loading={modalLoading}
      />
    </div>
  );
};

export default ManagerDashboard;
