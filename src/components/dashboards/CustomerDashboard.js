// components/dashboards/CustomerDashboard.js (Enhanced with queue status and new features)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import NotificationPermission from '../common/NotificationPermission';
import AdvancedHybridQueueService from '../../services/AdvancedHybridQueueService';
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
      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          *,
          barber:barber_id(id, full_name, email, barber_status),
          service:service_id(id, name, price, duration)
        `)
        .eq('customer_id', user.id)
        .gte('appointment_date', today)
        .in('status', ['scheduled', 'ongoing', 'pending'])
        .order('appointment_date')
        .order('queue_position', { ascending: true });

      if (appointmentsError) throw appointmentsError;

      // Separate pending requests from confirmed appointments
      const confirmedAppointments = appointments?.filter(apt => apt.status !== 'pending') || [];
      const pendingAppointments = appointments?.filter(apt => apt.status === 'pending') || [];

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
      const [totalAppointmentsResult, completedAppointmentsResult, appointmentsByBarberResult, lastAppointmentResult] = await Promise.all([
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('customer_id', user.id),
        
        supabase
          .from('appointments')
          .select('total_price, service:service_id(price), is_urgent')
          .eq('customer_id', user.id)
          .eq('status', 'done'),
        
        supabase
          .from('appointments')
          .select('barber_id, barber:barber_id(full_name)')
          .eq('customer_id', user.id)
          .eq('status', 'done'),
        
        supabase
          .from('appointments')
          .select('appointment_date')
          .eq('customer_id', user.id)
          .eq('status', 'done')
          .order('appointment_date', { ascending: false })
          .limit(1)
      ]);

      const totalAppointments = totalAppointmentsResult.count || 0;
      const completedAppointments = completedAppointmentsResult.data || [];
      const appointmentsByBarber = appointmentsByBarberResult.data || [];
      const lastAppointment = lastAppointmentResult.data?.[0];

      // Calculate total spent
      const totalSpent = completedAppointments.reduce((sum, apt) => {
        const price = apt.total_price || apt.service?.price || 0;
        const urgentFee = apt.is_urgent ? 100 : 0;
        return sum + price + urgentFee;
      }, 0);

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
        .in('status', ['scheduled', 'pending', 'ongoing'])
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
            // Filter out customer names for privacy
            const sanitizedTimeline = queueData.timeline.map(apt => ({
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
            
            return {
              barberId: barber.id,
              data: {
                barber_name: barber.full_name,
                timeline: sanitizedTimeline,
                stats: queueData.stats,
                current: queueData.current,
                total: queueData.total
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

  const handleCancelAppointment = async (appointmentId) => {
    if (!window.confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString(),
          queue_position: null,
          cancellation_reason: 'Cancelled by customer'
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Create notification for barber
      const appointment = upcomingAppointments.find(apt => apt.id === appointmentId);
      if (appointment) {
        await supabase.from('notifications').insert({
          user_id: appointment.barber_id,
          title: 'Appointment Cancelled',
          message: `${user.user_metadata?.full_name || user.email} has cancelled their appointment.`,
          type: 'appointment_cancelled',
          data: {
            appointment_id: appointmentId,
            customer_name: user.user_metadata?.full_name || user.email
          }
        });
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
      case 'busy': return 'warning';
      case 'break': return 'info';
      case 'offline': return 'secondary';
      default: return 'primary';
    }
  };

  const getBarberStatusText = (status) => {
    switch (status) {
      case 'available': return 'Available';
      case 'busy': return 'Busy';
      case 'break': return 'On Break';
      case 'offline': return 'Offline';
      default: return 'Unknown';
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
      <div className="row mb-4">
        <div className="col">
          <NotificationPermission />
        </div>
      </div>

      {/* Customer Welcome Header */}
      <div className="row mb-4">
        <div className="col">
          <div className="customer-welcome-header p-4 rounded shadow-sm d-flex align-items-center">
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
                <h1 className="h3 mb-0 text-white">Welcome back!</h1>
              </div>
              <p className="text-light mb-0">
                <i className="bi bi-calendar3 me-2"></i>
                Your appointments and queue status
              </p>
            </div>
            <div className="ms-auto text-end text-light">
              <div className="h4 mb-0">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div className="text-light d-flex align-items-center justify-content-end">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="realTimeToggle"
                    checked={realTimeUpdates}
                    onChange={(e) => setRealTimeUpdates(e.target.checked)}
                  />
                  <label className="form-check-label text-light" htmlFor="realTimeToggle">
                    <i className="bi bi-broadcast me-1"></i>
                    Live Updates
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <Link 
            to="/book" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon primary-action mb-3">
                <i className="bi bi-calendar-plus"></i>
              </div>
              <h5 className="card-title">Book Appointment</h5>
              <p className="card-text text-muted">Schedule your next visit</p>
            </div>
          </Link>
        </div>
        
        <div className="col-md-3 mb-3">
          <Link 
            to="/haircut-recommender" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon success-action mb-3">
                <i className="bi bi-magic"></i>
              </div>
              <h5 className="card-title">Style Recommender</h5>
              <p className="card-text text-muted">Get personalized suggestions</p>
            </div>
          </Link>
        </div>
        
        <div className="col-md-3 mb-3">
          <Link 
            to="/appointments" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon info-action mb-3">
                <i className="bi bi-calendar-check"></i>
              </div>
              <h5 className="card-title">My Appointments</h5>
              <p className="card-text text-muted">View appointment history</p>
            </div>
          </Link>
        </div>

        <div className="col-md-3 mb-3">
          <Link 
            to="/products" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon warning-action mb-3">
                <i className="bi bi-bag"></i>
              </div>
              <h5 className="card-title">Shop Products</h5>
              <p className="card-text text-muted">Browse our products</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Additional Quick Actions Row */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <Link 
            to="/orders" 
            className={`card quick-action-card shadow-sm h-100 text-decoration-none ${animateActions ? 'action-card-animated' : ''}`}
            style={{ animationDelay: '0.5s' }}
          >
            <div className="card-body text-center">
              <div className="quick-action-icon success-action mb-3">
                <i className="bi bi-bag-check"></i>
              </div>
              <h5 className="card-title">My Orders</h5>
              <p className="card-text text-muted">Track your product orders</p>
            </div>
          </Link>
        </div>

      </div>

      {/* Stats Cards */}
      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <div 
            className={`card stats-card bg-gradient-primary text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.1s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Total Visits</h6>
                <h2 className="mb-0">{userStats.totalAppointments}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-calendar-check"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 mb-3">
          <div 
            className={`card stats-card bg-gradient-success text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.2s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Total Spent</h6>
                <h2 className="mb-0">₱{userStats.totalSpent.toFixed(0)}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-wallet2"></i>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-3 mb-3">
          <div 
            className={`card stats-card bg-gradient-info text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.3s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Upcoming</h6>
                <h2 className="mb-0">{userStats.upcomingCount}</h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-clock"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-3 mb-3">
          <div 
            className={`card stats-card bg-gradient-warning text-white h-100 shadow-sm ${animateCards ? 'card-animated' : ''}`}
            style={{ animationDelay: '0.4s' }}
          >
            <div className="card-body d-flex align-items-center">
              <div>
                <h6 className="card-title mb-1">Favorite Barber</h6>
                <h2 className="mb-0" style={{ fontSize: '1.2rem' }}>
                  {userStats.favoriteBarber?.full_name || 'None yet'}
                </h2>
              </div>
              <div className="ms-auto card-icon">
                <i className="bi bi-star"></i>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Requests Alert */}
      {pendingRequests.length > 0 && (
        <div className="alert alert-warning shadow-sm mb-4" role="alert">
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
        <div className="col-md-8 mb-4">
          <div className="card shadow-sm appointments-card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <i className="bi bi-calendar-week me-2 header-icon"></i>
                <h5 className="card-title mb-0">Upcoming Appointments</h5>
              </div>
              <Link to="/book" className="btn btn-primary btn-sm">
                <i className="bi bi-plus-lg me-1"></i>
                Book New
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
                Book Your First Appointment
              </Link>
                </div>
              ) : (
                <div className="row">
                  {upcomingAppointments.map((appointment) => (
                    <div key={appointment.id} className="col-md-6 mb-3">
                      <div className={`card appointment-card h-100 ${appointment.status === 'ongoing' ? 'border-success' : 'border-primary'}`}>
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
                            <div className="alert alert-success py-2 mb-2">
                              <small>
                                <i className="bi bi-scissors me-1"></i>
                                Your appointment is in progress!
                              </small>
                            </div>
                          )}

                          {appointment.status === 'scheduled' && queuePositions[appointment.id] && (
                            <div className="alert alert-info py-2 mb-2">
                              <small>
                                <i className="bi bi-people me-1"></i>
                                Queue position: #{queuePositions[appointment.id].position} of {queuePositions[appointment.id].totalInQueue}
                                <br />
                                <i className="bi bi-clock me-1"></i>
                                Est. wait: {queuePositions[appointment.id].estimatedWait}
                              </small>
                            </div>
                          )}

                          {appointment.status === 'scheduled' && (
                            <div className="d-flex gap-2">
                              <Link
                                to={`/book?rebook=${appointment.id}`}
                                className="btn btn-sm btn-outline-primary"
                                title="Reschedule"
                              >
                                <i className="bi bi-arrow-repeat"></i>
                              </Link>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => handleCancelAppointment(appointment.id)}
                                title="Cancel"
                              >
                                <i className="bi bi-x-circle"></i>
                              </button>
                            </div>
                          )}
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
        <div className="col-md-4 mb-4">
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
                      {queueData.timeline.map((appointment, index) => (
                        <div key={appointment.id} className={`d-flex align-items-center justify-content-between p-2 mb-2 rounded ${
                          appointment.status === 'ongoing' ? 'bg-success text-white' :
                          appointment.status === 'scheduled' ? 'bg-primary text-white' :
                          'bg-light'
                        }`}>
                          <div className="d-flex align-items-center">
                            <span className="fw-bold me-2">
                              {appointment.appointment_type === 'queue' 
                                ? `#${appointment.queue_position || appointment.timeline_position}`
                                : 'Scheduled'
                              }
                            </span>
                            {appointment.is_urgent && (
                              <i className="bi bi-lightning-fill text-warning"></i>
                            )}
                          </div>
                          <small>
                            {appointment.status === 'ongoing' ? 'Now' :
                             appointment.estimated_time ? convertTo12Hour(appointment.estimated_time) : 'TBD'}
                          </small>
                        </div>
                      ))}
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
    </div>
  );
};

export default CustomerDashboard;