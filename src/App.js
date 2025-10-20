// App.js
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
// REMOVED: NotificationService import - use only CentralizedNotificationService
import { sessionManager } from './services/SessionManager';

// Auth components
import Login from './components/auth/Login';
import Register from './components/auth/Register';
// Note: We don't need to import OnboardingSlides here anymore - it's inside Login.js

// Dashboard components
import ManagerDashboard from './components/dashboards/ManagerDashboard';
import BarberDashboard from './components/dashboards/BarberDashboard';
import CustomerDashboard from './components/dashboards/CustomerDashboard';

// Common components
import Navigation from './components/common/Navigation';
import LoadingSpinner from './components/common/LoadingSpinner';
import ErrorBoundary from './components/common/ErrorBoundary';

// Debug components
import AuthDebug from './components/debug/AuthDebug';
import DayOffTester from './components/debug/DayOffTester';

// Customer components
import BookAppointment from './components/customer/BookAppointment';
import CustomerAppointments from './components/customer/CustomerAppointments';
import HaircutRecommender from './components/customer/HaircutRecommender';


// Barber components
import BarberSchedule from './components/barber/BarberSchedule';
import BarberQueue from './components/barber/BarberQueue';
import AppointmentRequestManagerBasic from './components/barber/AppointmentRequestManagerBasic';
import BarberDayOffManager from './components/barber/BarberDayOffManager';

// Manager components
import ManageBarbers from './components/manager/ManageBarbers';
import ManageServices from './components/manager/ManageServices';
import ManageProducts from './components/manager/ManageProducts';
import ManageAppointments from './components/manager/ManageAppointments';
import NotificationManager from './components/manager/NotificationManager';
import QueuePriorityManager from './components/manager/QueuePriorityManager';
import AdvancedSecurityDashboard from './components/manager/AdvancedSecurityDashboard';
import Reports from './components/reports/Reports';

// Product components
import IntegratedShop from './components/products/IntegratedShop';
import ProductDetails from './components/products/ProductDetails';

// Orders components
import OrderCheckout from './components/orders/OrderCheckout';
import CustomerOrders from './components/orders/CustomerOrders';
import ManageOrders from './components/manager/ManageOrders';

// User Profile and Settings components
import Profile from './components/pages/Profile';
import Settings from './components/pages/Settings';
import { PushService } from './services/PushService';

// Styles
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './App.css';
import './components/onboarding/OnboardingSlides.css';

function App() {
  const [session, setSession] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [debug, setDebug] = useState({});

  useEffect(() => {
    if (!isInitialized) {
      initializeApp();
    }
  }, [isInitialized]);

  const initializeApp = async () => {
    try {
      // Initialize services
      sessionManager.initialize();
      
      // Get session on mount
      const { data: { session } } = await supabase.auth.getSession();
      
      console.log('Initial session check:', session?.user?.id);
      
      if (session?.user) {
        await fetchUserRole(session.user.id);
      }
      
      setSession(session);
      setLoading(false);
      setIsInitialized(true);

      // Listen for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        console.log('User metadata:', session?.user?.user_metadata);
        
        setSession(session);
        
        if (session?.user) {
          // Important: Need to wait for the role to be properly set
          await fetchUserRole(session.user.id);
        } else {
          setUserRole(null);
        }
      });

      return () => subscription.unsubscribe();
    } catch (error) {
      console.error('Error initializing app:', error);
      setLoading(false);
    }
  };

  const fetchUserRole = async (userId) => {
    try {
      console.log('Fetching role for user:', userId);
      
      // Collect debug information
      const debugInfo = {
        userId,
        metadata: null,
        dbRecord: null,
        errors: []
      };
      
      // Get user from auth
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('Error getting user from auth:', userError);
        debugInfo.errors.push({ source: 'auth.getUser', error: userError });
      } else {
        debugInfo.metadata = userData.user.user_metadata;
        console.log('User metadata from auth:', userData.user.user_metadata);
      }
      
      // Try to get user from database first
      const { data, error } = await supabase
        .from('users')
        .select('role, email, full_name')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user role from DB:', error);
        debugInfo.errors.push({ source: 'db.users.select', error });
        
        // User not found in users table or other error
        if (userData.user) {
          // Determine role from metadata or use default
          let role = 'customer'; // default role
          
          // Check metadata first (this is critical for new registrations)
          if (userData.user.user_metadata?.role) {
            role = userData.user.user_metadata.role;
            console.log('Found role in metadata:', role);
          } else if (userData.user.email === 'admin@rnrbooker.com') {
            role = 'manager';
          } else if (userData.user.email === 'barber@rnrbooker.com') {
            role = 'barber';
          }
          
          console.log('Creating user with role:', role);
          
          // Create user entry
          const { data: insertData, error: insertError } = await supabase
            .from('users')
            .insert([{
              id: userId,
              email: userData.user.email,
              full_name: userData.user.user_metadata?.full_name || userData.user.email.split('@')[0],
              role: role,
              phone: userData.user.user_metadata?.phone || ''
            }])
            .select();
          
          if (insertError) {
            console.error('Error creating user:', insertError);
            debugInfo.errors.push({ source: 'db.users.insert', error: insertError });
            
            // If duplicate key error, try update instead
            if (insertError.code === '23505') {
              console.log('User already exists, trying update instead');
              
              const { data: updateData, error: updateError } = await supabase
                .from('users')
                .update({
                  role: role,
                  full_name: userData.user.user_metadata?.full_name || userData.user.email.split('@')[0],
                  phone: userData.user.user_metadata?.phone || ''
                })
                .eq('id', userId)
                .select();
              
              if (updateError) {
                console.error('Error updating user:', updateError);
                debugInfo.errors.push({ source: 'db.users.update', error: updateError });
              } else {
                console.log('User updated successfully:', updateData);
                debugInfo.dbRecord = updateData[0];
                setUserRole(role);
                setDebug(debugInfo);
                return;
              }
            }
            
            // If we get here, we couldn't insert or update
            // Fallback to role from metadata
            setUserRole(role);
            setDebug(debugInfo);
            return;
          } else {
            console.log('User created successfully:', insertData);
            debugInfo.dbRecord = insertData[0];
            setUserRole(role);
            setDebug(debugInfo);
            return;
          }
        }
        
        // Fallback to customer role if all else fails
        console.log('Falling back to customer role');
        setUserRole('customer');
        setDebug(debugInfo);
        return;
      }
      
      console.log('User found in database:', data);
      debugInfo.dbRecord = data;
      console.log('User role from database:', data.role);
      setUserRole(data.role);
      setDebug(debugInfo);
    } catch (error) {
      console.error('Fatal error in fetchUserRole:', error);
      // Fallback to customer role
      setUserRole('customer');
      setDebug({ fatalError: error });
    }
  };

  const renderDebugInfo = () => {
    if (Object.keys(debug).length === 0) return null;
    
    return (
      <div style={{ 
        position: 'fixed', 
        bottom: '10px', 
        right: '10px', 
        background: '#f8f9fa', 
        padding: '10px', 
        border: '1px solid #ddd',
        borderRadius: '4px',
        zIndex: 9999,
        maxWidth: '400px',
        maxHeight: '200px',
        overflow: 'auto',
        fontSize: '12px'
      }}>
      
      </div>
    );
  };

  if (loading || !isInitialized) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {session && userRole && <Navigation userRole={userRole} />}
      
      <ErrorBoundary>
        <Routes>
          {/* Auth Routes */}
          <Route 
            path="/login" 
            element={!session ? <Login /> : <Navigate to="/dashboard" replace />} 
          />
          <Route 
            path="/register" 
            element={!session ? <Register /> : <Navigate to="/dashboard" replace />} 
          />
          
          {/* Dashboard Route */}
          <Route 
            path="/dashboard" 
            element={
              session ? (
                userRole === 'manager' ? <ManagerDashboard /> :
                userRole === 'barber' ? <BarberDashboard /> :
                <CustomerDashboard />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          
          {/* Customer Routes */}
          <Route 
            path="/book" 
            element={session ? <BookAppointment /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/appointments" 
            element={session ? <CustomerAppointments /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/haircut-recommender" 
            element={session ? <HaircutRecommender /> : <Navigate to="/login" replace />} 
          />
          
          {/* Barber Routes */}
          <Route 
            path="/schedule" 
            element={
              session && userRole === 'barber' ? 
              <BarberSchedule /> : 
              <Navigate to="/dashboard" replace />
            } 
          />
          <Route 
            path="/queue" 
            element={
              session && userRole === 'barber' ? 
              <BarberQueue /> : 
              <Navigate to="/dashboard" replace />
            } 
          />
          <Route 
            path="/appointment-requests" 
            element={
              session && userRole === 'barber' ? 
              <AppointmentRequestManagerBasic user={session.user} userRole={userRole} /> : 
              <Navigate to="/dashboard" replace />
            } 
          />
          <Route 
            path="/day-off-manager" 
            element={
              session && userRole === 'barber' ? 
              <BarberDayOffManager user={session.user} /> : 
              <Navigate to="/dashboard" replace />
            } 
          />
          
          {/* Manager Routes */}
          <Route 
            path="/manage/barbers" 
            element={
              session && userRole === 'manager' ? 
              <ManageBarbers /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          <Route 
            path="/manage/services" 
            element={
              session && userRole === 'manager' ? 
              <ManageServices /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          <Route 
            path="/manage/products" 
            element={
              session && userRole === 'manager' ? 
              <ManageProducts /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          <Route 
            path="/manage/appointments" 
            element={
              session && userRole === 'manager' ? 
              <ManageAppointments /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          <Route 
            path="/manage/queue-priority" 
            element={
              session && userRole === 'manager' ? 
              <QueuePriorityManager /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          <Route 
            path="/manage/notifications" 
            element={
              session && userRole === 'manager' ? 
              <NotificationManager /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          <Route 
            path="/reports" 
            element={
              session && userRole === 'manager' ? 
              <Reports /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          <Route 
            path="/manage/advanced-security" 
            element={
              session && userRole === 'manager' ? 
              <AdvancedSecurityDashboard /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          <Route 
            path="/manage/orders" 
            element={
              session && userRole === 'manager' ? 
              <ManageOrders /> : 
              <Navigate to="/dashboard" replace />
            }
          />
          
          {/* Product Routes */}
          <Route 
            path="/products" 
            element={session ? <IntegratedShop /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/products/:productId" 
            element={session ? <ProductDetails /> : <Navigate to="/login" replace />} 
          />
          
          {/* Orders Routes */}
          <Route 
            path="/checkout" 
            element={session ? <OrderCheckout /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/orders" 
            element={session ? <CustomerOrders /> : <Navigate to="/login" replace />} 
          />
          
          {/* User Profile and Settings Routes */}
          <Route 
            path="/profile" 
            element={session ? <Profile /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/settings" 
            element={session ? <Settings /> : <Navigate to="/login" replace />} 
          />
          
          {/* Debug Route */}
          <Route 
            path="/debug" 
            element={
              session ? (
                <div className="container mt-5">
                  <h2>Debug Information</h2>
                  <div className="card">
                    <div className="card-body">
                      <h5>Session Info</h5>
                      <pre>{JSON.stringify(session, null, 2)}</pre>
                      <h5>Role: {userRole}</h5>
                      <pre>{JSON.stringify(debug, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          
          {/* Debug Routes */}
          <Route 
            path="/debug/auth" 
            element={session ? <AuthDebug /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/debug/day-off" 
            element={
              session && userRole === 'barber' ? 
              <DayOffTester user={session.user} /> : 
              <Navigate to="/dashboard" replace />
            } 
          />
          
          {/* Default Routes */}
          <Route 
            path="/" 
            element={
              session ? 
              <Navigate to="/dashboard" replace /> : 
              <Navigate to="/login" replace />
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
      
      {renderDebugInfo()}

    </div>
  );
}


export default App;

