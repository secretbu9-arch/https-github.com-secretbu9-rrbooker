// components/dashboards/ManagerDashboard.js (Enhanced with analytics, queue management, and orders)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/core/ApiService';
import { PushService } from '../../services/notifications/PushService';
import NotificationModal from '../manager/NotificationModal';
import logoImage from '../../assets/images/raf-rok-logo.png';
import { getTodayISOString, toISODateString, formatPrice } from '../utils/helpers';

const managerDashboardStyles = `
  :root {
    --mng-black: #000000;
    --mng-brown: #2c1810;
    --mng-white: #ffffff;
    --mng-light-gray: #f8f9fa;
    --mng-gray: #e9ecef;
    --mng-dark-gray: #6c757d;
  }

  .manager-container {
    background-color: var(--mng-light-gray);
    min-height: 100vh;
    padding-bottom: 5rem;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .premium-card {
    background: var(--mng-white);
    border: 1px solid rgba(0,0,0,0.05);
    border-radius: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
    transition: all 0.3s ease;
  }

  .main-header {
    background: var(--mng-white);
    border-bottom: 1px solid var(--mng-gray);
    padding: 1.5rem 0;
    margin-bottom: 2rem;
  }

  .title-accent {
    height: 4px;
    width: 40px;
    background: var(--mng-brown);
    border-radius: 10px;
    margin-top: 0.5rem;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  @media (min-width: 992px) {
    .stat-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  .metric-box {
    background: var(--mng-white);
    padding: 1.5rem;
    border-radius: 24px;
    border: 1px solid rgba(0,0,0,0.05);
    display: flex;
    flex-direction: column;
    transition: all 0.2s ease;
  }

  .metric-box:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(0,0,0,0.05);
  }

  .metric-label {
    text-transform: uppercase;
    font-size: 0.65rem;
    font-weight: 800;
    color: var(--mng-dark-gray);
    letter-spacing: 1.5px;
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .metric-val {
    font-size: 2rem;
    font-weight: 900;
    color: var(--mng-black);
    letter-spacing: -1px;
    line-height: 1;
  }

  .section-title {
    font-weight: 900;
    letter-spacing: -0.5px;
    font-size: 1.1rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    text-transform: uppercase;
  }

  .modern-table-card {
    background: var(--mng-white);
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid rgba(0,0,0,0.05);
  }

  .table-head-minimal {
    background: var(--mng-black);
    color: var(--mng-white);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
  }

  .table-row-hover {
    transition: all 0.2s ease;
  }

  .table-row-hover:hover {
    background-color: var(--mng-light-gray);
  }

  .status-pill {
    padding: 0.35rem 0.85rem;
    border-radius: 100px;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pill-pending { background: var(--mng-gray); color: var(--mng-dark-gray); }
  .pill-active { background: var(--mng-black); color: var(--mng-white); }
  .pill-success { background: #e6fffa; color: #2c7a7b; }
  .pill-danger { background: #fff5f5; color: #c53030; }

  .action-btn-circle {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--mng-gray);
    background: var(--mng-white);
    color: var(--mng-black);
    transition: all 0.2s ease;
  }

  .action-btn-circle:hover {
    background: var(--mng-black);
    color: var(--mng-white);
    transform: scale(1.1);
  }

  .hub-item {
    padding: 1rem;
    border-radius: 16px;
    background: var(--mng-light-gray);
    border: 1px solid transparent;
    transition: all 0.2s ease;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .hub-item:hover {
    background: var(--mng-white);
    border-color: var(--mng-brown);
    transform: translateX(5px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  }

  .hub-icon {
    width: 40px;
    height: 40px;
    background: var(--mng-white);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    color: var(--mng-brown);
    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
  }

  .btn-refresh-top {
    background: var(--mng-white);
    border: 1px solid var(--mng-gray);
    width: 45px;
    height: 45px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
  }

  .btn-refresh-top:active {
    transform: rotate(180deg);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spin-anim { animation: spin 1s linear infinite; }
`;

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
    orderRevenue: 0,
    todayRevenue: 0
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

      // Get today's date (PHT)
      const todayString = getTodayISOString();

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

        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'barber')
          .neq('archived', true)
          .or('barber_status.eq.available,barber_status.is.null'),

        // Calculate Gross Revenue (all non-cancelled appointments)
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

        // All non-cancelled orders for gross revenue calculation
        supabase
          .from('orders')
          .select('total_amount')
          .eq('status', 'picked_up'),

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

      // Calculate total Gross Revenue (all non-cancelled)
      const appointmentRevenue = completedAppointments?.reduce((sum, apt) => {
        // If total_price exists and is > 0, it's our primary source (assumed to include urgent fee)
        if (apt.total_price !== null && apt.total_price !== undefined && Number(apt.total_price) > 0) {
          return sum + Number(apt.total_price);
        }
        
        // Fallback: Service Price + Urgent Fee
        const price = Number(apt.service?.price) || 0;
        const urgentFee = apt.is_urgent ? 100 : 0;
        return sum + price + urgentFee;
      }, 0) || 0;

      // Calculate order revenue
      const orderRevenue = completedOrders?.reduce((sum, order) => {
        return sum + (order.total_amount || 0);
      }, 0) || 0;

      // Calculate today's revenue specifically
      const todayAppointmentsData = appointments?.filter(apt => apt.appointment_date === todayString && apt.status === 'completed') || [];
      const todayApptRevenue = todayAppointmentsData.reduce((sum, apt) => {
        if (apt.total_price !== null && apt.total_price !== undefined && Number(apt.total_price) > 0) {
          return sum + Number(apt.total_price);
        }
        const price = Number(apt.service?.price) || 0;
        const urgentFee = apt.is_urgent ? 100 : 0;
        return sum + price + urgentFee;
      }, 0);

      const todayOrdersData = recentOrdersData?.filter(o => o.created_at?.startsWith(todayString) && o.status === 'picked_up') || [];
      const todayOrderRevenue = todayOrdersData.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

      const todayRevenue = todayApptRevenue + todayOrderRevenue;

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
        orderRevenue,
        todayRevenue
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
      const todayHelper = getTodayISOString();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = toISODateString(weekAgo);

      const analytics = await apiService.getQueueAnalytics(
        weekAgoStr,
        todayHelper
      );

      setQueueAnalytics(analytics);
    } catch (error) {
      console.error('Error fetching queue analytics:', error);
    }
  };

  const fetchCapacityOverview = async () => {
    try {
      const today = new Date();
      const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const capacity = await apiService.getAllBarbersCapacity(todayStr);
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
        .neq('archived', true)
        .order('average_rating', { ascending: false, nullsFirst: false });

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
    <div className="manager-container">
      <style>{managerDashboardStyles}</style>

      {/* Main Header */}
      <header className="main-header">
        <div className="container">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h1 className="fw-black mb-0" style={{ letterSpacing: '-1.5px', fontSize: '1.75rem' }}>MANAGER DASHBOARD</h1>
              <div className="title-accent"></div>
              <p className="text-muted small mt-2 mb-0 fw-bold opacity-75">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <button
              className="btn-refresh-top"
              onClick={fetchDashboardData}
              disabled={isFetchingData}
            >
              <i className={`bi bi-arrow-clockwise ${isFetchingData ? 'spin-anim' : ''}`}></i>
            </button>
          </div>
        </div>
      </header>

      <div className="container">
        {error && (
          <div className="alert alert-dark border-0 rounded-4 shadow-sm mb-4 d-flex align-items-center gap-3">
            <i className="bi bi-exclamation-octagon-fill fs-4"></i>
            <div className="small fw-bold">{error}</div>
            <button className="btn-close ms-auto" onClick={() => setError('')}></button>
          </div>
        )}

        {/* Global Statistics */}
        <div className="stat-grid">
          <div className="metric-box">
            <div className="metric-label">
              <i className="bi bi-calendar-event"></i> TODAY'S GROSS
            </div>
            <div className="metric-val">{formatPrice(stats.todayRevenue)}</div>
            <div className="mt-2 small text-muted">Current Sales</div>
          </div>
          <div className="metric-box">
            <div className="metric-label">
              <i className="bi bi-cash-stack"></i> TOTAL GROSS
            </div>
            <div className="metric-val">{formatPrice(stats.totalRevenue)}</div>
            <div className="mt-2 small text-muted">All Time Revenue</div>
          </div>
          <div className="metric-box">
            <div className="metric-label">
              <i className="bi bi-people"></i> CLIENTS
            </div>
            <div className="metric-val">{stats.totalCustomers}</div>
            <div className="mt-2 small text-muted">Registered</div>
          </div>
          <div className="metric-box">
            <div className="metric-label">
              <i className="bi bi-calendar-check"></i> TODAY'S APPOINTMENTS
            </div>
            <div className="metric-val">{stats.todayAppointments}</div>
            <div className="mt-2 small text-muted">Bookings Today</div>
          </div>
        </div>

        <div className="row g-4">
          {/* Main Content Area */}
          <div className="col-lg-8">
            <div className="section-title">
              <i className="bi bi-calendar-check-fill"></i> RECENT APPOINTMENTS
            </div>

            <div className="modern-table-card mb-4">
              <div className="table-responsive">
                <table className="table border-0 mb-0">
                  <thead className="table-head-minimal">
                    <tr>
                      <th className="border-0 px-4 py-3">Customer</th>
                      <th className="border-0 px-4 py-3">Service</th>
                      <th className="border-0 px-4 py-3">Schedule</th>
                      <th className="border-0 px-4 py-3">Status</th>
                      <th className="border-0 px-4 py-3 text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAppointments.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-5 text-muted">No recent appointments</td>
                      </tr>
                    ) : (
                      recentAppointments.slice(0, 6).map((apt) => (
                        <tr key={apt.id} className="table-row-hover">
                          <td className="px-4 py-3">
                            <div className="fw-black" style={{ fontSize: '0.9rem' }}>{apt.customer?.full_name || 'Walk-in'}</div>
                            <div className="small text-muted opacity-75">{apt.barber?.full_name}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="small fw-bold">{apt.service?.name}</div>
                            <div className="small text-muted">{formatPrice(apt.total_price || apt.service?.price)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="small fw-bold">{apt.appointment_date}</div>
                            <div className="small text-muted">{apt.appointment_time || 'Queue'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`status-pill ${apt.status === 'completed' ? 'pill-success' :
                                apt.status === 'ongoing' ? 'pill-active' : 'pill-pending'
                              }`}>
                              {apt.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-end">
                            <div className="d-flex justify-content-end gap-2">
                              {apt.status === 'scheduled' && (
                                <button className="action-btn-circle" onClick={() => handleAppointmentStatus(apt.id, 'ongoing')}>
                                  <i className="bi bi-play-fill text-dark"></i>
                                </button>
                              )}
                              {apt.status === 'ongoing' && (
                                <button className="action-btn-circle" onClick={() => handleAppointmentStatus(apt.id, 'completed')}>
                                  <i className="bi bi-check-lg text-dark"></i>
                                </button>
                              )}
                              <button className="action-btn-circle" onClick={() => navigate(`/manage/appointments?id=${apt.id}`)}>
                                <i className="bi bi-eye text-dark"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="section-title">
              <i className="bi bi-clock-history"></i> SYSTEM ACTIVITY
            </div>
            <div className="premium-card p-0 overflow-hidden">
              {recentLogs.length === 0 ? (
                <div className="p-4 text-center text-muted small">No recent activity detected</div>
              ) : (
                recentLogs.slice(0, 5).map((log, idx) => (
                  <div key={log.id} className={`p-3 d-flex gap-3 align-items-center ${idx < 4 ? 'border-bottom' : ''}`}>
                    <div className="rounded-circle bg-light d-flex align-items-center justify-content-center" style={{ width: '40px', height: '40px' }}>
                      <i className="bi bi-activity text-muted opacity-50"></i>
                    </div>
                    <div className="flex-grow-1">
                      <div className="small fw-black">{formatAction(log.action)}</div>
                      <div className="small text-muted opacity-75" style={{ fontSize: '0.75rem' }}>
                        {log.user?.full_name || 'System'} • {formatTimestamp(log.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="col-lg-4">
            {/* Urgent Requests Mini Hub */}
            {pendingRequests.length > 0 && (
              <div className="mb-4">
                <div className="section-title text-danger">
                  <i className="bi bi-exclamation-circle-fill"></i> URGENT ACTIONS
                </div>
                <div className="premium-card p-3" style={{ background: '#fff5f5' }}>
                  {pendingRequests.slice(0, 3).map((req) => (
                    <div key={req.id} className="p-2 mb-2 bg-white rounded-4 border shadow-sm">
                      <div className="d-flex justify-content-between align-items-start mb-2 px-1">
                        <div>
                          <div className="fw-black small">{req.customer?.full_name}</div>
                          <div className="text-muted" style={{ fontSize: '0.65rem' }}>{req.service?.name}</div>
                        </div>
                        {req.is_urgent && <span className="badge bg-danger p-1">!!!</span>}
                      </div>
                      <div className="d-flex gap-2">
                        <button className="btn btn-black text-white flex-grow-1 py-1 rounded-pill small fw-bold" onClick={() => handlePendingRequest(req.id, 'approve')}>APPROVE</button>
                        <button className="btn btn-light border flex-grow-1 py-1 rounded-pill small fw-bold" onClick={() => handlePendingRequest(req.id, 'reject')}>REJECT</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="section-title">
              <i className="bi bi-grid-fill"></i> ACTION HUB
            </div>
            <div className="premium-card p-3 mb-4">
              <div className="hub-item" onClick={() => navigate('/manage/appointments')}>
                <div className="hub-icon"><i className="bi bi-calendar-check"></i></div>
                <div>
                  <div className="small fw-black">APPOINTMENTS</div>
                  <div className="x-small text-muted opacity-75">Scheduling & Control</div>
                </div>
              </div>
              <div className="hub-item" onClick={() => navigate('/manage/barbers')}>
                <div className="hub-icon"><i className="bi bi-scissors"></i></div>
                <div>
                  <div className="small fw-black">TEAM MEMBERS</div>
                  <div className="x-small text-muted opacity-75">Roster & Attendance</div>
                </div>
              </div>
              <div className="hub-item" onClick={() => navigate('/manage/orders')}>
                <div className="hub-icon"><i className="bi bi-bag-check"></i></div>
                <div>
                  <div className="small fw-black">PRODUCT ORDERS</div>
                  <div className="x-small text-muted opacity-75">Shop Fulfillment</div>
                </div>
              </div>
              <div className="hub-item" onClick={() => navigate('/settings')}>
                <div className="hub-icon"><i className="bi bi-gear-fill"></i></div>
                <div>
                  <div className="small fw-black">BUSINESS SETTINGS</div>
                  <div className="x-small text-muted opacity-75">System Configuration</div>
                </div>
              </div>
            </div>

            <div className="section-title">
              <i className="bi bi-graph-up-arrow"></i> SHOP PERFORMANCE
            </div>
            <div className="premium-card p-4">
              <div className="mb-4">
                <div className="d-flex justify-content-between mb-2">
                  <span className="small fw-black">SHOP STATUS</span>
                  <span className="small fw-bold">{stats.activeQueues > 0 ? 'ACTIVE' : 'IDLE'}</span>
                </div>
                <div className="progress bg-light" style={{ height: '6px', borderRadius: '10px' }}>
                  <div
                    className="progress-bar bg-black"
                    style={{ width: `${(stats.activeQueues / (stats.totalBarbers || 1)) * 100}%` }}
                  ></div>
                </div>
              </div>

              <div className="d-flex flex-column gap-3">
                {barberRatings.map((barber) => (
                  <div key={barber.id} className="d-flex justify-content-between align-items-center p-2 rounded-3 bg-light">
                    <span className="small fw-black">{barber.full_name}</span>
                    <div className="d-flex align-items-center gap-1">
                      <i className="bi bi-star-fill text-dark small"></i>
                      <span className="small fw-black">{barber.average_rating?.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

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
