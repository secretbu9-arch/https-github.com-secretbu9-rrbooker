// hooks/useAppointments.js
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';

/**
 * Custom hook for managing appointments
 * @param {object} initialFilters - Initial filters to apply to appointments
 * @param {boolean} autoFetch - Whether to fetch appointments automatically on mount
 */
export const useAppointments = (initialFilters = {}, autoFetch = true) => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [subscribed, setSubscribed] = useState(false);

  /**
   * Fetch appointments based on current filters
   */
  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiService.getAppointments(filters);
      setAppointments(data);
    } catch (err) {
      console.error('Error fetching appointments:', err);
      setError('Failed to load appointments. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  /**
   * Update filters and refetch appointments
   * @param {object} newFilters - New filters to apply
   */
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  /**
   * Create a new appointment
   * @param {object} appointmentData - New appointment data
   * @returns {Promise<object>} - Result of the operation
   */
  const createAppointment = async (appointmentData) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiService.createAppointment(appointmentData);
      
      // Update local state
      setAppointments(prev => [data, ...prev]);
      
      return { success: true, data };
    } catch (err) {
      console.error('Error creating appointment:', err);
      setError('Failed to create appointment. Please try again.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update an existing appointment
   * @param {string} appointmentId - ID of the appointment to update
   * @param {object} updates - Data to update
   * @returns {Promise<object>} - Result of the operation
   */
  const updateAppointment = async (appointmentId, updates) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiService.updateAppointment(appointmentId, updates);
      
      // Update local state
      setAppointments(prev => 
        prev.map(apt => apt.id === appointmentId ? { ...apt, ...data } : apt)
      );
      
      return { success: true, data };
    } catch (err) {
      console.error('Error updating appointment:', err);
      setError('Failed to update appointment. Please try again.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cancel an appointment
   * @param {string} appointmentId - ID of the appointment to cancel
   * @returns {Promise<object>} - Result of the operation
   */
  const cancelAppointment = async (appointmentId) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiService.updateAppointment(appointmentId, { 
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        queue_position: null
      });
      
      // Update local state
      setAppointments(prev => 
        prev.map(apt => apt.id === appointmentId ? { ...apt, ...data } : apt)
      );
      
      return { success: true, data };
    } catch (err) {
      console.error('Error cancelling appointment:', err);
      setError('Failed to cancel appointment. Please try again.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Change appointment status (for barbers/managers)
   * @param {string} appointmentId - ID of the appointment
   * @param {string} status - New status ('scheduled', 'ongoing', 'done', 'cancelled')
   * @returns {Promise<object>} - Result of the operation
   */
  const changeAppointmentStatus = async (appointmentId, status) => {
    try {
      setLoading(true);
      setError(null);
      
      // Prepare updates based on status
      const updates = { 
        status,
        updated_at: new Date().toISOString()
      };
      
      // Set queue number based on status
      if (status === 'ongoing') {
        updates.queue_position = 0; // Currently being served
      } else if (status === 'done' || status === 'cancelled') {
        updates.queue_position = null; // Remove from queue
      }
      
      const data = await apiService.updateAppointment(appointmentId, updates);
      
      // Update local state
      setAppointments(prev => 
        prev.map(apt => apt.id === appointmentId ? { ...apt, ...data } : apt)
      );
      
      return { success: true, data };
    } catch (err) {
      console.error('Error changing appointment status:', err);
      setError('Failed to update appointment status. Please try again.');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Set up real-time subscription to appointments changes
   */
  const setupSubscription = useCallback(() => {
    if (!subscribed) {
      // Get the current user
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        
        // Get role from filters or user role
        const role = filters.role || 'customer';
        
        // Set up appropriate filter based on role
        let filterCondition;
        if (role === 'barber') {
          filterCondition = `barber_id=eq.${user.id}`;
        } else if (role === 'customer') {
          filterCondition = `customer_id=eq.${user.id}`;
        }
        // For managers, we don't filter and get all updates
        
        // Set up subscription
        const subscription = supabase
          .channel('appointments-changes')
          .on('postgres_changes', 
            { 
              event: '*', 
              schema: 'public', 
              table: 'appointments',
              filter: filterCondition
            }, 
            () => {
              // Simply refetch appointments when changes occur
              fetchAppointments();
            }
          )
          .subscribe();
        
        setSubscribed(true);
        
        // Return cleanup function
        return () => {
          subscription.unsubscribe();
          setSubscribed(false);
        };
      });
    }
  }, [filters, fetchAppointments, subscribed]);

  // Initial fetch on mount if autoFetch is true
  useEffect(() => {
    if (autoFetch) {
      fetchAppointments();
    }
  }, [autoFetch, fetchAppointments]);

  // Set up subscription on mount
  useEffect(() => {
    const cleanup = setupSubscription();
    return cleanup;
  }, [setupSubscription]);

  // Refetch when filters change
  useEffect(() => {
    fetchAppointments();
  }, [filters, fetchAppointments]);

  return {
    appointments,
    loading,
    error,
    filters,
    updateFilters,
    fetchAppointments,
    createAppointment,
    updateAppointment,
    cancelAppointment,
    changeAppointmentStatus
  };
};

export default useAppointments;