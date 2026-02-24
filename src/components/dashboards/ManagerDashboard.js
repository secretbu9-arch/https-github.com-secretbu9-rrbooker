// components/dashboards/ManagerDashboard.js (Enhanced with analytics, queue management, and orders)
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/core/ApiService';
import { PushService } from '../../services/notifications/PushService';
import NotificationModal from '../manager/NotificationModal';
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
    <div className="container-fluid py-3 dashboard-container">
      {/* Simplified Header */}
      <div className="row mb-3">
        <div className="col">
          <div className="d-flex justify-content-between align-items-center rounded shadow-sm" style={{ 
            background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
            padding: 'clamp(1rem, 3vw, 1.5rem)'
          }}>
            <div>
              <h2 className="mb-1 fw-bold" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.75rem)' }}>
                <i className="bi bi-speedometer2 me-2"></i>
                Manager Dashboard
              </h2>
              <p className="text-muted mb-0" style={{ fontSize: 'clamp(0.875rem, 2vw, 1rem)' }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <button 
              className="btn btn-outline-secondary btn-sm"
              onClick={fetchDashboardData}
              disabled={isFetchingData}
              style={{ fontSize: 'clamp(0.75rem, 1.8vw, 0.875rem)' }}
            >
              <i className={`bi bi-arrow-clockwise me-1 ${isFetchingData ? 'spinner-border spinner-border-sm' : ''}`}></i>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics - Simplified Grid */}
      <div className="row g-3 mb-4">
        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)' }}>
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1">
                  <div className="text-muted small mb-1">Today's Appointments</div>
                  <div className="h3 mb-0 fw-bold">{stats.todayAppointments}</div>
                </div>
                <div className="text-primary" style={{ fontSize: '2.5rem' }}>
                  <i className="bi bi-calendar-check"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)' }}>
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1">
                  <div className="text-muted small mb-1">Pending Requests</div>
                  <div className="h3 mb-0 fw-bold text-warning">{stats.pendingRequests}</div>
                </div>
                <div className="text-warning" style={{ fontSize: '2.5rem' }}>
                  <i className="bi bi-clock-fill"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)' }}>
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1">
                  <div className="text-muted small mb-1">Total Revenue</div>
                  <div className="h4 mb-0 fw-bold text-success">
                    ₱{stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="text-success" style={{ fontSize: '2.5rem' }}>
                  <span style={{ fontSize: '2rem' }}>₱</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-6 col-lg-3">
          <div className="card border-0 shadow-sm h-100" style={{ background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)' }}>
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="flex-grow-1">
                  <div className="text-muted small mb-1">Pending Orders</div>
                  <div className="h3 mb-0 fw-bold text-warning">{stats.pendingOrders}</div>
                </div>
                <div className="text-warning" style={{ fontSize: '2.5rem' }}>
                  <i className="bi bi-box-seam"></i>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Requests Alert */}
      {pendingRequests.length > 0 && (
        <div className="row mb-3">
          <div className="col-12">
            <div className="alert alert-warning border-0 shadow-sm mb-0">
              <div className="d-flex align-items-center">
                <i className="bi bi-exclamation-triangle me-2 fs-5"></i>
                <div className="flex-grow-1">
                  <strong>Pending Booking Requests:</strong> You have {pendingRequests.length} booking request{pendingRequests.length !== 1 ? 's' : ''} awaiting approval.
                </div>
                <button 
                  className="btn btn-warning btn-sm"
                  onClick={() => document.getElementById('pending-requests')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Review <i className="bi bi-arrow-down ms-1"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      <div className="row g-3">
        {/* Recent Appointments */}
        <div className="col-lg-8 mb-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header border-bottom d-flex justify-content-between align-items-center py-3" style={{ background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)', color: 'white' }}>
              <h5 className="mb-0 fw-bold" style={{ color: 'white' }}>
                <i className="bi bi-calendar-week me-2"></i>
                Recent Appointments
              </h5>
              <span className="badge bg-light text-primary">{recentAppointments.length}</span>
            </div>
            <div className="card-body p-0">
              {recentAppointments.length === 0 ? (
                <div className="text-center py-5">
                  <i className="bi bi-calendar-x text-muted" style={{ fontSize: '3rem' }}></i>
                  <p className="text-muted mt-2 mb-0">No appointments found</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Customer</th>
                        <th>Barber</th>
                        <th>Service</th>
                        <th>Date</th>
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
                              <small className="text-muted">
                                <i className="bi bi-telephone me-1"></i>
                                {appointment.customer.phone}
                              </small>
                            )}
                          </td>
                          <td>
                            <i className="bi bi-scissors me-1 text-muted"></i>
                            {appointment.barber?.full_name || 'Unknown'}
                          </td>
                          <td>
                            <div>{appointment.service?.name || 'Unknown'}</div>
                            <small className="text-muted">
                              ₱{appointment.total_price || appointment.service?.price}
                              {appointment.is_urgent && (
                                <span className="badge bg-warning ms-2">URGENT</span>
                              )}
                            </small>
                          </td>
                          <td>
                            <div>{appointment.appointment_date}</div>
                            {appointment.queue_position && (
                              <small className="text-muted">Queue #{appointment.queue_position}</small>
                            )}
                          </td>
                          <td>
                            <span className={`badge bg-${
                              appointment.status === 'completed' ? 'success' :
                              appointment.status === 'ongoing' ? 'primary' :
                              appointment.status === 'scheduled' ? 'info' :
                              appointment.status === 'cancelled' ? 'danger' : 'secondary'
                            }`}>
                              {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                            </span>
                          </td>
                          <td>
                            {appointment.status === 'scheduled' && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleAppointmentStatus(appointment.id, 'ongoing')}
                              >
                                <i className="bi bi-play-fill"></i>
                              </button>
                            )}
                            {appointment.status === 'ongoing' && (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => handleAppointmentStatus(appointment.id, 'completed')}
                              >
                                <i className="bi bi-check-lg"></i>
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

        {/* Right Column - Quick Actions */}
        <div className="col-lg-4 mb-3">
          {/* Pending Requests */}
          <div id="pending-requests" className="card border-0 shadow-sm mb-3">
            <div className="card-header border-bottom py-3" style={{ background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)', color: 'white' }}>
              <h6 className="mb-0 fw-bold" style={{ color: 'white' }}>
                <i className="bi bi-bell me-2"></i>
                Pending Requests
                <span className="badge bg-light text-warning ms-2">{pendingRequests.length}</span>
              </h6>
            </div>
            <div className="card-body p-0">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-4">
                  <i className="bi bi-check-circle text-success" style={{ fontSize: '2rem' }}></i>
                  <p className="text-muted small mt-2 mb-0">All requests processed</p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {pendingRequests.slice(0, 4).map((request) => (
                    <div key={request.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div className="flex-grow-1">
                          <div className="fw-bold small">{request.customer?.full_name}</div>
                          <div className="text-muted small">
                            {request.service?.name} • {request.barber?.full_name}
                          </div>
                        </div>
                        {request.is_urgent && (
                          <span className="badge bg-danger">URGENT</span>
                        )}
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-success flex-fill"
                          onClick={() => handlePendingRequest(request.id, 'approve')}
                        >
                          <i className="bi bi-check"></i> Approve
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger flex-fill"
                          onClick={() => handlePendingRequest(request.id, 'decline')}
                        >
                          <i className="bi bi-x"></i> Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Pending Orders */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header border-bottom py-3" style={{ background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)', color: 'white' }}>
              <h6 className="mb-0 fw-bold" style={{ color: 'white' }}>
                <i className="bi bi-box-seam me-2"></i>
                Pending Orders
                <span className="badge bg-light text-warning ms-2">{pendingOrders.length}</span>
              </h6>
            </div>
            <div className="card-body p-0">
              {pendingOrders.length === 0 ? (
                <div className="text-center py-4">
                  <i className="bi bi-check-circle text-success" style={{ fontSize: '2rem' }}></i>
                  <p className="text-muted small mt-2 mb-0">All orders processed</p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {pendingOrders.slice(0, 4).map((order) => (
                    <div key={order.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div className="flex-grow-1">
                          <div className="fw-bold small">Order #{order.order_number || order.id.slice(0, 8)}</div>
                          <div className="text-muted small">{order.customer?.full_name || 'Unknown'}</div>
                          <div className="text-success small mt-1">
                            ₱{Number(order.total_amount || 0).toFixed(2)}
                          </div>
                        </div>
                        <span className="badge bg-warning">PENDING</span>
                      </div>
                      <button
                        className="btn btn-sm btn-primary w-100"
                        onClick={() => navigate(`/manage/orders?order=${order.id}`)}
                      >
                        <i className="bi bi-eye me-1"></i> View Details
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Orders Section - Simplified */}
      {recentOrders.length > 0 && (
        <div className="row mt-3">
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-header border-bottom d-flex justify-content-between align-items-center py-3" style={{ background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)', color: 'white' }}>
                <h5 className="mb-0 fw-bold" style={{ color: 'white' }}>
                  <i className="bi bi-box-seam me-2"></i>
                  Recent Orders
                </h5>
                <button 
                  className="btn btn-light btn-sm"
                  onClick={() => navigate('/manage/orders')}
                >
                  <i className="bi bi-gear me-1"></i>
                  Manage All
                </button>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.slice(0, 5).map((order) => (
                        <tr key={order.id}>
                          <td className="fw-bold">#{order.order_number || order.id.slice(0, 8)}</td>
                          <td>{order.customer?.full_name || 'Unknown'}</td>
                          <td>
                            <span className="fw-bold text-success">
                              ₱{Number(order.total_amount || 0).toFixed(2)}
                            </span>
                          </td>
                          <td>
                            <span className={`badge bg-${
                              order.status === 'picked_up' || order.status === 'completed' ? 'success' :
                              order.status === 'ready_for_pickup' ? 'info' :
                              order.status === 'preparing' ? 'primary' :
                              order.status === 'confirmed' ? 'warning' :
                              order.status === 'pending' ? 'secondary' : 'danger'
                            }`}>
                              {order.status.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td>
                            <small className="text-muted">
                              {new Date(order.created_at).toLocaleDateString()}
                            </small>
                          </td>
                          <td>
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => navigate(`/manage/orders?order=${order.id}`)}
                            >
                              <i className="bi bi-eye"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barber Ratings - Simplified */}
      {barberRatings.length > 0 && (
        <div className="row mt-3">
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-header border-bottom py-3" style={{ background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)', color: 'white' }}>
                <h6 className="mb-0 fw-bold" style={{ color: 'white' }}>
                  <i className="bi bi-star-fill me-2"></i>
                  Barber Performance
                </h6>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  {barberRatings.slice(0, 4).map((barber) => (
                    <div key={barber.id} className="col-md-6 col-lg-3">
                      <div className="border rounded p-3">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div>
                            <div className="fw-bold small">{barber.full_name}</div>
                            <span className={`badge bg-${
                              barber.barber_status === 'available' ? 'success' : 
                              barber.barber_status === 'busy' ? 'warning' : 'secondary'
                            } small`}>
                              {barber.barber_status}
                            </span>
                          </div>
                        </div>
                        <div className="d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center">
                            {[...Array(5)].map((_, i) => (
                              <i
                                key={i}
                                className={`bi bi-star-fill ${
                                  i < Math.floor(barber.average_rating || 0) ? 'text-warning' : 'text-muted'
                                }`}
                                style={{ fontSize: '0.8rem' }}
                              ></i>
                            ))}
                          </div>
                          <div className="text-end">
                            <div className="fw-bold text-warning small">
                              {barber.average_rating || '0'}/5
                            </div>
                            <small className="text-muted">{barber.total_ratings || 0} reviews</small>
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
