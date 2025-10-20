// components/dashboards/ManagerDashboard.js (Enhanced with analytics, queue management, and orders)
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
import { PushService } from '../../services/PushService';
import NotificationModal from '../manager/NotificationModal';
import logoImage from '../../assets/images/raf-rok-logo.png';

const ManagerDashboard = () => {
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
        
        // Total barbers
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'barber'),
        
        // Calculate revenue (completed appointments)
        supabase
          .from('appointments')
          .select(`
            total_price,
            is_urgent,
            service:service_id(price)
          `)
          .eq('status', 'done'),
        
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
        ['scheduled', 'done', 'cancelled'].includes(apt.status)
      ).length || 0;
      const completed = appointments?.filter(apt => apt.status === 'done').length || 0;
      const completionRate = totalScheduled > 0 ? (completed / totalScheduled) * 100 : 0;

      // Get barber queues for today
      const barbers = await apiService.getBarbers();
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
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
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
        const { default: centralizedNotificationService } = await import('../../services/CentralizedNotificationService');
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
    <div className="container-fluid py-4 dashboard-container">
      {/* Manager Welcome Header */}
      <div className="row mb-4">
        <div className="col">
          <div className="manager-welcome-header p-4 rounded shadow-sm d-flex align-items-center">
            <div>
              <div className="d-flex align-items-center mb-2">
                <img 
                  src={logoImage} 
                  alt="Raf & Rok" 
                  className="dashboard-logo me-3" 
                  height="40"
                  style={{
                    backgroundColor: '#ffffff',
                    padding: '3px',
                    borderRadius: '5px'
                  }}
                />
                <h1 className="h3 mb-0 text-white">Manager Dashboard</h1>
              </div>
              <p className="text-light mb-0">
                <i className="bi bi-graph-up me-2"></i>
                Complete overview of barbershop operations and queue management
              </p>
            </div>
            <div className="ms-auto text-end text-light">
              <div className="h4 mb-0">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div className="text-light">
                <i className="bi bi-calendar-check me-2"></i>
                Real-time Operations
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Appointment Statistics Cards */}
      <div className="row mb-4">
        <div className="col-12">
          <h5 className="mb-3">
            <i className="bi bi-calendar-week me-2"></i>
            Appointment Statistics
          </h5>
        </div>
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-primary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Today's Appointments</h6>
                <h2 className="mb-0">{stats.todayAppointments}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-calendar-check"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-warning text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Pending Requests</h6>
                <h2 className="mb-0">{stats.pendingRequests}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-clock-fill"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-danger text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Urgent Bookings</h6>
                <h2 className="mb-0">{stats.urgentBookings}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-lightning-fill"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Total Revenue</h6>
                <h2 className="mb-0"><span className="currency-amount-large">₱{stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-cash-coin"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-info text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.5s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Active Queues</h6>
                <h2 className="mb-0">{stats.activeQueues}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-people-fill"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-secondary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.6s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Completion Rate</h6>
                <h2 className="mb-0">{stats.completionRate}%</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-check-circle"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Order Statistics Cards */}
      <div className="row mb-4">
        <div className="col-12">
          <h5 className="mb-3">
            <i className="bi bi-box-seam me-2"></i>
            Order Statistics
          </h5>
        </div>
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-primary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.7s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Total Orders</h6>
                <h2 className="mb-0">{stats.totalOrders}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-box-seam"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-info text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.8s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Today's Orders</h6>
                <h2 className="mb-0">{stats.todayOrders}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-calendar-day"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-warning text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.9s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Pending Orders</h6>
                <h2 className="mb-0">{stats.pendingOrders}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-clock"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '1.0s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Ready for Pickup</h6>
                <h2 className="mb-0">{stats.readyOrders}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-check-circle-fill"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 col-lg-2 mb-3">
          <div 
            className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '1.1s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Order Revenue</h6>
                <h2 className="mb-0"><span className="currency-amount-large">₱{stats.orderRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></h2>
              </div>
              <div className="ms-auto card-icon">
              <i className="bi bi-cash-coin"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Capacity Overview */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header">
              <h5 className="mb-0">
                <i className="bi bi-speedometer me-2"></i>
                Barber Capacity Overview
              </h5>
            </div>
            <div className="card-body">
              <div className="row">
                {capacityOverview.map((barber) => (
                  <div key={barber.barber_id} className="col-md-4 col-lg-3 mb-3">
                    <div className="card border-0 bg-light">
                      <div className="card-body p-3">
                        <h6 className="card-title">{barber.barber_name}</h6>
                        <div className="progress mb-2" style={{ height: '10px' }}>
                          <div 
                            className={`progress-bar bg-${getCapacityColor(barber.current_capacity, barber.max_capacity)}`}
                            style={{ width: `${(barber.current_capacity / barber.max_capacity) * 100}%` }}
                          ></div>
                        </div>
                        <div className="d-flex justify-content-between">
                          <small>{barber.current_capacity}/{barber.max_capacity}</small>
                          <small className="text-muted">
                            {barber.is_full ? 'FULL' : `${barber.available_slots} available`}
                          </small>
                        </div>
                        {barber.estimated_wait_time > 0 && (
                          <div className="mt-1">
                            <small className="text-info">
                              <i className="bi bi-clock me-1"></i>
                              Wait: {calculateWaitTime(barber.current_capacity)}
                            </small>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Requests Alert */}
      {pendingRequests.length > 0 && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="alert alert-warning shadow-sm">
              <div className="d-flex align-items-center">
                <i className="bi bi-exclamation-triangle me-2 fs-4"></i>
                <div className="flex-grow-1">
                  <h5 className="alert-heading">Pending Booking Requests</h5>
                  <p className="mb-0">You have {pendingRequests.length} booking requests awaiting approval.</p>
                </div>
                <button 
                  className="btn btn-warning"
                  onClick={() => document.getElementById('pending-requests').scrollIntoView()}
                >
                  Review Requests
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="row">
        {/* Recent Appointments */}
        <div className="col-md-8 mb-4">
          <div className="card shadow-sm appointments-card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <i className="bi bi-calendar-week me-2 header-icon"></i>
                <h5 className="card-title mb-0">Recent Appointments</h5>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-light btn-sm" onClick={fetchDashboardData}>
                  <i className="bi bi-arrow-clockwise me-1"></i>
                  Refresh
                </button>
              </div>
            </div>
            <div className="card-body">
              {recentAppointments.length === 0 ? (
                <div className="empty-state text-center py-4">
                  <div className="empty-icon">
                    <i className="bi bi-calendar-x"></i>
                  </div>
                  <h5>No Appointments Found</h5>
                  <p className="text-muted">There are no appointments in the system yet.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Barber</th>
                        <th>Service</th>
                        <th>Date & Time</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAppointments.slice(0, 8).map((appointment) => (
                        <tr key={appointment.id} className={appointment.status === 'ongoing' ? 'table-active current-row' : ''}>
                          <td>
                            <div className="d-flex align-items-center">
                              <div className="avatar-placeholder me-2">
                                {appointment.customer?.full_name?.charAt(0) || '?'}
                              </div>
                              <div>
                                <div>{appointment.customer?.full_name || 'Unknown'}</div>
                                {appointment.customer?.phone && (
                                  <div className="phone-number">
                                    <i className="bi bi-telephone me-1"></i>
                                    {appointment.customer.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="barber-name">
                              <i className="bi bi-scissors me-1"></i>
                              {appointment.barber?.full_name || 'Unknown'}
                            </div>
                          </td>
                          <td>
                            <div className="service-name">{appointment.service?.name || 'Unknown'}</div>
                            <div className="service-details">
                              <span className="duration">
                                <i className="bi bi-clock me-1"></i>
                                {appointment.total_duration || appointment.service?.duration} min
                              </span>
                              <span className="price ms-2">
                                <i className="bi bi-cash me-1"></i>
                                ₱{appointment.total_price || appointment.service?.price}
                              </span>
                              {appointment.is_urgent && (
                                <span className="badge bg-warning ms-2">URGENT</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="date-info">
                              <i className="bi bi-calendar3 me-1"></i>
                              {appointment.appointment_date}
                            </div>
                            {appointment.queue_position && (
                              <div className="queue-info">
                                <i className="bi bi-list-ol me-1"></i>
                                Queue #{appointment.queue_position}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className={`status-badge status-${appointment.status}`}>
                              {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                            </span>
                          </td>
                          <td>
                            {appointment.status === 'scheduled' && (
                              <div className="btn-group" role="group">
                                <button
                                  className="btn btn-sm btn-primary action-btn"
                                  onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                                >
                                  <i className="bi bi-play-fill me-1"></i>
                                  Start
                                </button>
                                <button
                                  className="btn btn-sm btn-danger action-btn"
                                  onClick={() => handleAppointmentStatus(appointment.id, 'cancelled')}
                                >
                                  <i className="bi bi-x-lg me-1"></i>
                                  Cancel
                                </button>
                              </div>
                            )}
                            {appointment.status === 'ongoing' && (
                              <button
                                className="btn btn-sm btn-success action-btn"
                                onClick={() => handleAppointmentStatus(appointment.id, 'done')}
                              >
                                <i className="bi bi-check-lg me-1"></i>
                                Complete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Pending Requests & Pending Orders */}
        <div className="col-md-4 mb-4">
          {/* Pending Requests */}
          <div id="pending-requests" className="card shadow-sm mb-4">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <i className="bi bi-bell me-2 header-icon"></i>
                <h5 className="card-title mb-0">Pending Requests</h5>
                <span className="badge bg-warning ms-2">{pendingRequests.length}</span>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="pending-requests-feed">
                {pendingRequests.length === 0 ? (
                  <div className="empty-state text-center py-4">
                    <div className="empty-icon">
                      <i className="bi bi-check-circle"></i>
                    </div>
                    <h5>No Pending Requests</h5>
                    <p className="text-muted">All booking requests have been processed.</p>
                  </div>
                ) : (
                  pendingRequests.map((request) => (
                    <div key={request.id} className="pending-request-item p-3 border-bottom">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <h6 className="mb-1">{request.customer?.full_name}</h6>
                          <small className="text-muted">
                            {request.service?.name} with {request.barber?.full_name}
                          </small>
                        </div>
                        {request.is_urgent && (
                          <span className="badge bg-danger">URGENT</span>
                        )}
                      </div>
                      
                      <div className="mb-2">
                        <small className="text-muted">
                          <i className="bi bi-calendar me-1"></i>
                          {new Date(request.appointment_date).toLocaleDateString()}
                        </small>
                        <br />
                        <small className="text-success">
                          <i className="bi bi-cash me-1"></i>
                          ₱{request.total_price || request.service?.price}
                        </small>
                      </div>
                      
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-success flex-fill"
                          onClick={() => handlePendingRequest(request.id, 'approve')}
                        >
                          <i className="bi bi-check me-1"></i>
                          Approve
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger flex-fill"
                          onClick={() => handlePendingRequest(request.id, 'decline')}
                        >
                          <i className="bi bi-x me-1"></i>
                          Decline
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Pending Orders */}
          <div className="card shadow-sm mb-4">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <i className="bi bi-box-seam me-2 header-icon"></i>
                <h5 className="card-title mb-0">Pending Orders</h5>
                <span className="badge bg-warning ms-2">{pendingOrders.length}</span>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="pending-orders-feed">
                {pendingOrders.length === 0 ? (
                  <div className="empty-state text-center py-4">
                    <div className="empty-icon">
                      <i className="bi bi-check-circle"></i>
                    </div>
                    <h5>No Pending Orders</h5>
                    <p className="text-muted">All orders have been processed.</p>
                  </div>
                ) : (
                  pendingOrders.map((order) => (
                    <div key={order.id} className="pending-order-item p-3 border-bottom">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <h6 className="mb-1">Order #{order.order_number || order.id.slice(0, 8)}</h6>
                          <small className="text-muted">
                            {order.customer?.full_name || 'Unknown Customer'}
                          </small>
                        </div>
                        <span className="badge bg-warning">PENDING</span>
                      </div>
                      
                      <div className="mb-2">
                        <small className="text-muted">
                          <i className="bi bi-calendar me-1"></i>
                          {new Date(order.created_at).toLocaleDateString()}
                        </small>
                        <br />
                        <small className="text-success">
                          <i className="bi bi-cash me-1"></i>
                          ₱{order.total_amount || 0}
                        </small>
                      </div>
                      
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-success flex-fill"
                          onClick={async () => {
                            try {
                              const { default: ordersService } = await import('../../services/OrdersService');
                              await ordersService.updateOrderStatus(order.id, 'confirmed');
                              await fetchDashboardData();
                              alert('Order confirmed successfully!');
                            } catch (error) {
                              console.error('Error confirming order:', error);
                              alert('Failed to confirm order. Please try again.');
                            }
                          }}
                        >
                          <i className="bi bi-check me-1"></i>
                          Confirm
                        </button>
                        <button
                          className="btn btn-sm btn-outline-primary flex-fill"
                          onClick={() => window.location.href = `/manage-orders?order=${order.id}`}
                        >
                          <i className="bi bi-eye me-1"></i>
                          View
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* System Activity Log */}
          <div className="card shadow-sm">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <i className="bi bi-activity me-2 header-icon"></i>
                <h5 className="card-title mb-0">Recent Activity</h5>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="activity-feed">
                {recentLogs.length === 0 ? (
                  <div className="empty-state text-center py-4">
                    <div className="empty-icon">
                      <i className="bi bi-clock-history"></i>
                    </div>
                    <h5>No Recent Activity</h5>
                    <p className="text-muted">System activity will appear here.</p>
                  </div>
                ) : (
                  recentLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="activity-item p-3 border-bottom">
                      <div className="activity-icon me-3">
                        <div className={`activity-icon-bg icon-${
                          log.action.includes('success') ? 'success' :
                          log.action.includes('failed') ? 'danger' :
                          log.action.includes('appointment') ? 'primary' :
                          log.action.includes('login') ? 'info' :
                          'secondary'
                        }`}>
                          <i className={`bi ${
                            log.action.includes('login') ? 'bi-box-arrow-in-right' :
                            log.action.includes('appointment') ? 'bi-calendar' :
                            log.action.includes('registration') ? 'bi-person-plus' :
                            'bi-activity'
                          }`}></i>
                        </div>
                      </div>
                      <div className="activity-content">
                        <div className="d-flex justify-content-between mb-1">
                          <div className="activity-title">{formatAction(log.action)}</div>
                          <div className="activity-time">
                            {formatTimestamp(log.created_at)}
                          </div>
                        </div>
                        <div className="activity-user">
                          {log.user ? (
                            <span>
                              <i className="bi bi-person me-1"></i>
                              {log.user.full_name} 
                              <span className="user-role">({log.user.role})</span>
                            </span>
                          ) : (
                            <span className="system-user">System</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="card-footer bg-light">
              <div className="d-flex justify-content-between align-items-center">
                <small className="text-muted">Showing last {Math.min(recentLogs.length, 5)} activities</small>
                <button className="btn btn-sm btn-light" onClick={fetchDashboardData}>
                  <i className="bi bi-arrow-clockwise me-1"></i>
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="row">
        <div className="col-12 mb-4">
          <div className="card shadow-sm orders-card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <i className="bi bi-box-seam me-2 header-icon"></i>
                <h5 className="card-title mb-0">Recent Orders</h5>
              </div>
              <div className="d-flex gap-2">
                <button 
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => window.location.href = '/manage-orders'}
                >
                  <i className="bi bi-gear me-1"></i>
                  Manage Orders
                </button>
                <button className="btn btn-light btn-sm" onClick={fetchDashboardData}>
                  <i className="bi bi-arrow-clockwise me-1"></i>
                  Refresh
                </button>
              </div>
            </div>
            <div className="card-body">
              {recentOrders.length === 0 ? (
                <div className="empty-state text-center py-4">
                  <div className="empty-icon">
                    <i className="bi bi-box"></i>
                  </div>
                  <h5>No Orders Found</h5>
                  <p className="text-muted">There are no orders in the system yet.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table align-middle">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Items</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.slice(0, 8).map((order) => (
                        <tr key={order.id}>
                          <td>
                            <div className="order-number">
                              <i className="bi bi-hash me-1"></i>
                              {order.order_number || order.id.slice(0, 8)}
                            </div>
                          </td>
                          <td>
                            <div className="d-flex align-items-center">
                              <div className="avatar-placeholder me-2">
                                {order.customer?.full_name?.charAt(0) || '?'}
                              </div>
                              <div>
                                <div>{order.customer?.full_name || 'Unknown'}</div>
                                {order.customer?.phone && (
                                  <div className="phone-number">
                                    <i className="bi bi-telephone me-1"></i>
                                    {order.customer.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="order-items">
                              {order.items && Array.isArray(order.items) ? (
                                <span className="badge bg-info">
                                  {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="text-muted">No items</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div className="order-total">
                              <i className="bi bi-cash me-1"></i>
                              <span className="currency-amount">₱{Number(order.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`status-badge status-${order.status}`}>
                              {order.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <div className="date-info">
                              <i className="bi bi-calendar3 me-1"></i>
                              {new Date(order.created_at).toLocaleDateString()}
                            </div>
                            <div className="time-info">
                              <i className="bi bi-clock me-1"></i>
                              {new Date(order.created_at).toLocaleTimeString()}
                            </div>
                          </td>
                          <td>
                            <div className="btn-group" role="group">
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => window.location.href = `/manage-orders?order=${order.id}`}
                              >
                                <i className="bi bi-eye me-1"></i>
                                View
                              </button>
                              {order.status === 'pending' && (
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={async () => {
                                    try {
                                      const { default: ordersService } = await import('../../services/OrdersService');
                                      await ordersService.updateOrderStatus(order.id, 'confirmed');
                                      await fetchDashboardData();
                                      alert('Order confirmed successfully!');
                                    } catch (error) {
                                      console.error('Error confirming order:', error);
                                      alert('Failed to confirm order. Please try again.');
                                    }
                                  }}
                                >
                                  <i className="bi bi-check me-1"></i>
                                  Confirm
                                </button>
                              )}
                              {order.status === 'confirmed' && (
                                <button
                                  className="btn btn-sm btn-warning"
                                  onClick={async () => {
                                    try {
                                      const { default: ordersService } = await import('../../services/OrdersService');
                                      await ordersService.updateOrderStatus(order.id, 'preparing');
                                      await fetchDashboardData();
                                      alert('Order marked as preparing!');
                                    } catch (error) {
                                      console.error('Error updating order:', error);
                                      alert('Failed to update order. Please try again.');
                                    }
                                  }}
                                >
                                  <i className="bi bi-gear me-1"></i>
                                  Prepare
                                </button>
                              )}
                              {order.status === 'preparing' && (
                                <button
                                  className="btn btn-sm btn-info"
                                  onClick={async () => {
                                    try {
                                      const { default: ordersService } = await import('../../services/OrdersService');
                                      await ordersService.updateOrderStatus(order.id, 'ready_for_pickup');
                                      await fetchDashboardData();
                                      alert('Order marked as ready for pickup!');
                                    } catch (error) {
                                      console.error('Error updating order:', error);
                                      alert('Failed to update order. Please try again.');
                                    }
                                  }}
                                >
                                  <i className="bi bi-check-circle me-1"></i>
                                  Ready
                                </button>
                              )}
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
        </div>
      </div>

      {/* Barber Ratings Overview */}
      {barberRatings.length > 0 && (
        <div className="row mt-4">
          <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-header bg-warning text-dark">
                <h6 className="mb-0">
                  <i className="bi bi-star-fill me-2"></i>
                  Barber Performance Ratings
                </h6>
              </div>
              <div className="card-body">
                <div className="row">
                  {barberRatings.map((barber) => (
                    <div key={barber.id} className="col-md-6 col-lg-4 mb-3">
                      <div className="card h-100 border-0 bg-light">
                        <div className="card-body p-3">
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div>
                              <h6 className="card-title mb-1">{barber.full_name}</h6>
                              <small className="text-muted">{barber.email}</small>
                            </div>
                            <span className={`badge ${
                              barber.barber_status === 'available' ? 'bg-success' : 
                              barber.barber_status === 'busy' ? 'bg-warning' : 'bg-secondary'
                            }`}>
                              {barber.barber_status}
                            </span>
                          </div>
                          <div className="d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center">
                              {[...Array(5)].map((_, i) => (
                                <i
                                  key={i}
                                  className={`bi bi-star-fill ${
                                    i < Math.floor(barber.average_rating || 0) ? 'text-warning' : 'text-muted'
                                  }`}
                                  style={{ fontSize: '0.9rem' }}
                                ></i>
                              ))}
                            </div>
                            <div className="text-end">
                              <div className="fw-bold text-warning">
                                {barber.average_rating || '0'}/5
                              </div>
                              <small className="text-muted">
                                {barber.total_ratings || 0} reviews
                              </small>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {barberRatings.length === 0 && (
                  <div className="text-center py-4">
                    <i className="bi bi-star text-muted" style={{ fontSize: '3rem' }}></i>
                    <p className="text-muted mt-2">No ratings available yet</p>
                  </div>
                )}
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