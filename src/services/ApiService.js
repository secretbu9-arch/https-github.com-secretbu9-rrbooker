// services/ApiService.js (Enhanced with queue management and new features)
import { supabase } from '../supabaseClient';
import addOnsService from './AddOnsService';

/**
 * Enhanced API Service for handling all barbershop operations
 */
class ApiService {
  
  // =====================
  // USER MANAGEMENT
  // =====================
  
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  }

  async getUserProfile(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateUserProfile(userId, updates) {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateBarberStatus(barberId, status) {
    const { data, error } = await supabase
      .from('users')
      .update({
        barber_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', barberId)
      .eq('role', 'barber')
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // =====================
  // APPOINTMENT MANAGEMENT (Enhanced)
  // =====================

  async getAppointments(filters = {}) {
    let query = supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone, barber_status),
        service:service_id(id, name, price, duration, description)
      `);
    
    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (key === 'date_range' && value.from && value.to) {
          query = query.gte('appointment_date', value.from).lte('appointment_date', value.to);
        } else if (key === 'search' && value.trim()) {
          // Enhanced search including services and add-ons
          query = query.or(`customer.full_name.ilike.%${value}%,barber.full_name.ilike.%${value}%,notes.ilike.%${value}%`);
        } else {
          query = query.eq(key, value);
        }
      }
    });
    
    // Default sorting by queue number, then by appointment time
    if (filters.sort_by) {
      query = query.order(filters.sort_by, { ascending: filters.sort_dir !== 'desc' });
    } else {
      query = query
        .order('appointment_date', { ascending: true })
        .order('queue_position', { ascending: true, nullsLast: true })
        .order('appointment_time', { ascending: true });
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  }

  async createAppointment(appointmentData) {
    // Create an appointment with provided status (manager/walk-in or direct create flows)
    const { data, error } = await supabase
      .from('appointments')
      .insert([
        {
          ...appointmentData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  async updateAppointment(appointmentId, updates) {
    const { data, error } = await supabase
      .from('appointments')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId)
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  async createAppointmentRequest(appointmentData) {
    // Enhanced appointment creation with queue management
    const { data, error } = await supabase
      .from('appointments')
      .insert([{
        ...appointmentData,
        status: 'pending', // All new appointments start as pending
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .single();
    
    if (error) throw error;
    return data;
  }

  async confirmAppointment(appointmentId, queueNumber, isUrgent = false) {
    const updates = {
      status: 'scheduled',
      queue_position: queueNumber,
      updated_at: new Date().toISOString()
    };

    // If urgent, need to adjust other queue numbers
    if (isUrgent) {
      const appointment = await this.getAppointmentById(appointmentId);
      
      // Get all existing appointments to increment their queue numbers
      const { data: existingAppointments, error: fetchError } = await supabase
        .from('appointments')
        .select('id, queue_position')
        .eq('barber_id', appointment.barber_id)
        .eq('appointment_date', appointment.appointment_date)
        .eq('status', 'scheduled')
        .gte('queue_position', 1)
        .order('queue_position', { ascending: false });

      if (fetchError) throw fetchError;

      // Update each appointment's queue number
      for (const apt of existingAppointments || []) {
        await supabase
          .from('appointments')
          .update({ 
            queue_position: apt.queue_position + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', apt.id);
      }
      
      updates.queue_position = 1;
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId)
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .single();
    
    if (error) throw error;
    return data;
  }

  async declineAppointment(appointmentId, reason = '') {
    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', appointmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateAppointmentStatus(appointmentId, status) {
    const updates = {
      status,
      updated_at: new Date().toISOString()
    };

    // Handle queue number based on status
    if (status === 'ongoing') {
      updates.queue_position = 0; // 0 means currently being served
    } else if (status === 'done' || status === 'cancelled') {
      updates.queue_position = null; // Remove from queue
    }

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId)
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .single();
    
    if (error) throw error;
    return data;
  }

  async rescheduleAppointment(appointmentId, newDate, newQueueNumber = null) {
    const updates = {
      appointment_date: newDate,
      status: 'pending', // Needs re-confirmation for new date
      queue_position: newQueueNumber,
      is_rebooking: true,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getAppointmentById(appointmentId) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .eq('id', appointmentId)
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteAppointment(appointmentId) {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentId);
    
    if (error) throw error;
    return true;
  }

  // =====================
  // QUEUE MANAGEMENT (New)
  // =====================

  async getBarberQueue(barberId, date) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .eq('barber_id', barberId)
      .eq('appointment_date', date)
      .in('status', ['scheduled', 'ongoing'])
      .order('queue_position', { ascending: true, nullsLast: true });
    
    if (error) throw error;
    
    const current = data?.find(apt => apt.status === 'ongoing') || null;
    const queue = data?.filter(apt => apt.status === 'scheduled') || [];
    
    return { current, queue, total: data?.length || 0 };
  }

  async getPendingRequests(barberId, date = null) {
    let query = supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .eq('barber_id', barberId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (date) {
      query = query.eq('appointment_date', date);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data || [];
  }

  async getNextQueueNumber(barberId, date) {
    const { data, error } = await supabase
      .from('appointments')
      .select('queue_position')
      .eq('barber_id', barberId)
      .eq('appointment_date', date)
      .eq('status', 'scheduled')
      .order('queue_position', { ascending: false })
      .limit(1);
    
    if (error) throw error;
    
    const maxQueueNumber = data?.[0]?.queue_position || 0;
    return maxQueueNumber + 1;
  }

  async advanceQueue(barberId, date) {
    // Move the first person in queue to 'ongoing' status
    const { data: nextCustomer, error: nextError } = await supabase
      .from('appointments')
      .select('id')
      .eq('barber_id', barberId)
      .eq('appointment_date', date)
      .eq('status', 'scheduled')
      .order('queue_position', { ascending: true })
      .limit(1)
      .single();

    if (nextError && nextError.code !== 'PGRST116') throw nextError;
    
    if (nextCustomer) {
      return await this.updateAppointmentStatus(nextCustomer.id, 'ongoing');
    }
    
    return null;
  }

  // =====================
  // SERVICES MANAGEMENT (Enhanced)
  // =====================

  async getServices(includeInactive = false) {
    let query = supabase
      .from('services')
      .select('*');
    
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    
    query = query.order('name');
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  }

  async createService(serviceData) {
    const { data, error } = await supabase
      .from('services')
      .insert([{
        ...serviceData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateService(serviceId, updates) {
    const { data, error } = await supabase
      .from('services')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', serviceId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteService(serviceId) {
    try {
      // First, check if the service is being used by any appointments
      const { data: appointments, error: checkError } = await supabase
        .from('appointments')
        .select('id, status, appointment_date')
        .eq('service_id', serviceId)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']);
      
      if (checkError) {
        console.error('Error checking service usage:', checkError);
        throw new Error('Failed to check if service is in use');
      }
      
      // If service is being used by active appointments, prevent deletion
      if (appointments && appointments.length > 0) {
        const activeAppointments = appointments.filter(apt => 
          ['pending', 'scheduled', 'confirmed', 'ongoing'].includes(apt.status)
        );
        
        if (activeAppointments.length > 0) {
          throw new Error(`Cannot delete service. It is currently being used by ${activeAppointments.length} active appointment(s). Please deactivate the service instead or wait until all appointments are completed.`);
        }
      }
      
      // Check if service is referenced in services_data JSON field
      const { data: jsonReferences, error: jsonError } = await supabase
        .from('appointments')
        .select('id, services_data')
        .not('services_data', 'is', null)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']);
      
      if (jsonError) {
        console.error('Error checking JSON service references:', jsonError);
        throw new Error('Failed to check service references in appointment data');
      }
      
      // Check if service ID appears in any services_data JSON arrays
      if (jsonReferences && jsonReferences.length > 0) {
        const activeJsonReferences = jsonReferences.filter(apt => {
          try {
            const servicesData = typeof apt.services_data === 'string' 
              ? JSON.parse(apt.services_data) 
              : apt.services_data;
            return Array.isArray(servicesData) && servicesData.includes(serviceId);
          } catch (e) {
            console.warn('Error parsing services_data:', e);
            return false;
          }
        });
        
        if (activeJsonReferences.length > 0) {
          throw new Error(`Cannot delete service. It is referenced in ${activeJsonReferences.length} active appointment(s) as part of multiple services. Please deactivate the service instead.`);
        }
      }
      
      // If no active references, proceed with deletion
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', serviceId);
      
      if (error) {
        console.error('Error deleting service:', error);
        throw new Error(`Failed to delete service: ${error.message}`);
      }
      
      return true;
    } catch (error) {
      console.error('Service deletion error:', error);
      throw error;
    }
  }

  // =====================
  // ADD-ONS MANAGEMENT (New)
  // =====================

  async getAddOns() {
    return await addOnsService.getAddOns();
  }

  async calculateAddOnsTotal(addOnIds) {
    const addOnsData = JSON.stringify(addOnIds);
    return await addOnsService.calculateAddOnsPrice(addOnsData);
  }

  async calculateAddOnsDuration(addOnIds) {
    const addOnsData = JSON.stringify(addOnIds);
    return await addOnsService.calculateAddOnsDuration(addOnsData);
  }

  async createAddOn(addOnData) {
    const { data, error } = await supabase
      .from('add_ons')
      .insert([{
        ...addOnData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async updateAddOn(addOnId, updates) {
    const { data, error } = await supabase
      .from('add_ons')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', addOnId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async deleteAddOn(addOnId) {
    try {
      // First, check if the add-on is being used by any appointments
      const { data: appointments, error: checkError } = await supabase
        .from('appointments')
        .select('id, add_ons_data, status')
        .not('add_ons_data', 'is', null)
        .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']);
      
      if (checkError) {
        console.error('Error checking add-on usage:', checkError);
        throw new Error('Failed to check if add-on is in use');
      }
      
      // Check if add-on ID appears in any add_ons_data JSON arrays
      if (appointments && appointments.length > 0) {
        const activeReferences = appointments.filter(apt => {
          try {
            const addOnsData = typeof apt.add_ons_data === 'string' 
              ? JSON.parse(apt.add_ons_data) 
              : apt.add_ons_data;
            return Array.isArray(addOnsData) && addOnsData.includes(addOnId);
          } catch (e) {
            console.warn('Error parsing add_ons_data:', e);
            return false;
          }
        });
        
        if (activeReferences.length > 0) {
          throw new Error(`Cannot delete add-on. It is currently being used by ${activeReferences.length} active appointment(s). Please deactivate the add-on instead.`);
        }
      }
      
      // If no active references, proceed with deletion
      const { error } = await supabase
        .from('add_ons')
        .delete()
        .eq('id', addOnId);
      
      if (error) {
        console.error('Error deleting add-on:', error);
        throw new Error(`Failed to delete add-on: ${error.message}`);
      }
      
      return true;
    } catch (error) {
      console.error('Add-on deletion error:', error);
      throw error;
    }
  }

  // =====================
  // BARBER MANAGEMENT (Enhanced)
  // =====================

  async getBarbers(includeStatus = true) {
    let selectFields = 'id, full_name, email, phone';
    if (includeStatus) {
      selectFields += ', barber_status';
    }

    const { data, error } = await supabase
      .from('users')
      .select(selectFields)
      .eq('role', 'barber')
      .order('full_name');
    
    if (error) throw error;
    return data;
  }

  async getBarberCapacity(barberId, date) {
    const { count, error } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('barber_id', barberId)
      .eq('appointment_date', date)
      .in('status', ['scheduled', 'ongoing', 'pending']);
    
    if (error) throw error;
    
    const maxCapacity = 15; // Could be configurable per barber
    return {
      current: count || 0,
      max: maxCapacity,
      available: maxCapacity - (count || 0),
      isFullCapacity: (count || 0) >= maxCapacity
    };
  }

  async getBarberStatistics(barberId, dateFrom, dateTo) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        service:service_id(price)
      `)
      .eq('barber_id', barberId)
      .gte('appointment_date', dateFrom)
      .lte('appointment_date', dateTo);
    
    if (error) throw error;
    
    const completed = data?.filter(apt => apt.status === 'done') || [];
    const cancelled = data?.filter(apt => apt.status === 'cancelled') || [];
    const revenue = completed.reduce((sum, apt) => {
      const basePrice = apt.total_price || apt.service?.price || 0;
      const urgentFee = apt.is_urgent ? 100 : 0;
      return sum + basePrice + urgentFee;
    }, 0);
    
    return {
      totalAppointments: data?.length || 0,
      completedAppointments: completed.length,
      cancelledAppointments: cancelled.length,
      revenue,
      completionRate: data?.length > 0 ? (completed.length / data.length) * 100 : 0
    };
  }

  async getAllBarbersCapacity(date) {
    // Return capacity summary for all barbers for a given date
    const { data: barbers, error: barbersError } = await supabase
      .from('users')
      .select('id, full_name')
      .eq('role', 'barber')
      .order('full_name');

    if (barbersError) throw barbersError;

    const results = await Promise.all(
      (barbers || []).map(async (barber) => {
        const capacity = await this.getBarberCapacity(barber.id, date);
        return {
          barber_id: barber.id,
          barber_name: barber.full_name,
          current_capacity: capacity.current,
          max_capacity: capacity.max,
          available_slots: capacity.available,
          is_full: capacity.isFullCapacity,
          estimated_wait_time: Math.max(0, capacity.current * 35) // rough estimate in minutes
        };
      })
    );

    return results;
  }

  // =====================
  // NOTIFICATION MANAGEMENT (Enhanced)
  // =====================

  async createNotification(notification) {
    console.warn('⚠️ DEPRECATED: ApiService.createNotification is deprecated. Use CentralizedNotificationService instead.');
    console.warn('⚠️ This prevents duplicate notifications. Please update your code.');
    
    // Return a mock response to prevent errors
    return {
      id: 'deprecated',
      message: 'ApiService.createNotification is deprecated',
      created_at: new Date().toISOString()
    };
  }

  async getNotifications(userId, limit = 50) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data;
  }

  async markNotificationAsRead(notificationId) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', notificationId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  // =====================
  // SYSTEM LOGGING (Enhanced)
  // =====================

  async logAction(userId, action, details = {}) {
    const { data, error } = await supabase
      .from('system_logs')
      .insert([{
        user_id: userId,
        action,
        details,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }

  async getSystemLogs(filters = {}, limit = 100) {
    let query = supabase
      .from('system_logs')
      .select(`
        *,
        user:user_id(full_name, role)
      `)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    
    if (filters.action) {
      query = query.eq('action', filters.action);
    }
    
    if (filters.date_from) {
      query = query.gte('created_at', filters.date_from);
    }
    
    if (filters.date_to) {
      query = query.lte('created_at', filters.date_to);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return data;
  }

  // =====================
  // ANALYTICS & REPORTS (Enhanced)
  // =====================

  async getRevenueData(dateFrom, dateTo) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        appointment_date,
        total_price,
        is_urgent,
        service:service_id(price)
      `)
      .eq('status', 'done')
      .gte('appointment_date', dateFrom)
      .lte('appointment_date', dateTo);
    
    if (error) throw error;
    
    // Process data to get daily revenue including urgent fees
    const revenueByDate = {};
    data.forEach(appointment => {
      const date = appointment.appointment_date;
      const basePrice = appointment.total_price || appointment.service?.price || 0;
      const urgentFee = appointment.is_urgent ? 100 : 0;
      const totalPrice = basePrice + urgentFee;
      
      if (!revenueByDate[date]) {
        revenueByDate[date] = 0;
      }
      
      revenueByDate[date] += totalPrice;
    });
    
    return Object.entries(revenueByDate).map(([date, amount]) => ({
      date,
      amount
    }));
  }

  async getQueueAnalytics(dateFrom, dateTo) {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        appointment_date,
        barber_id,
        queue_position,
        status,
        is_urgent,
        created_at,
        updated_at,
        barber:barber_id(full_name)
      `)
      .gte('appointment_date', dateFrom)
      .lte('appointment_date', dateTo);
    
    if (error) throw error;
    
    // Analyze queue performance
    const analytics = {
      totalBookings: data?.length || 0,
      urgentBookings: data?.filter(apt => apt.is_urgent).length || 0,
      averageQueuePosition: 0,
      queueEfficiency: 0,
      barberWorkload: {}
    };
    
    // Calculate average queue position
    const queuePositions = data?.filter(apt => apt.queue_position).map(apt => apt.queue_position) || [];
    if (queuePositions.length > 0) {
      analytics.averageQueuePosition = queuePositions.reduce((sum, pos) => sum + pos, 0) / queuePositions.length;
    }
    
    // Calculate barber workload
    data?.forEach(appointment => {
      const barberId = appointment.barber_id;
      const barberName = appointment.barber?.full_name || 'Unknown';
      
      if (!analytics.barberWorkload[barberId]) {
        analytics.barberWorkload[barberId] = {
          barberName,
          totalAppointments: 0,
          urgentAppointments: 0,
          completedAppointments: 0
        };
      }
      
      analytics.barberWorkload[barberId].totalAppointments += 1;
      
      if (appointment.is_urgent) {
        analytics.barberWorkload[barberId].urgentAppointments += 1;
      }
      
      if (appointment.status === 'done') {
        analytics.barberWorkload[barberId].completedAppointments += 1;
      }
    });
    
    return analytics;
  }

  // =====================
  // UTILITY METHODS (New)
  // =====================

  formatAppointmentData(appointment) {
    // Helper method to format appointment data for display
    const addOns = this.getAddOns();
    let formattedData = { ...appointment };
    
    // Parse and format services data
    if (appointment.services_data) {
      try {
        formattedData.additionalServices = JSON.parse(appointment.services_data);
      } catch (e) {
        formattedData.additionalServices = [];
      }
    }
    
    // Parse and format add-ons data
    if (appointment.add_ons_data) {
      try {
        const addOnIds = JSON.parse(appointment.add_ons_data);
        formattedData.addOns = addOnIds.map(addonId => 
          addOns.find(addon => addon.id === addonId)
        ).filter(Boolean);
      } catch (e) {
        formattedData.addOns = [];
      }
    }
    
    // Calculate total price including urgent fee
    formattedData.finalPrice = (appointment.total_price || 0) + (appointment.is_urgent ? 100 : 0);
    
    return formattedData;
  }

  calculateEstimatedWaitTime(queuePosition, averageServiceTime = 35) {
    const waitMinutes = (queuePosition - 1) * averageServiceTime;
    
    if (waitMinutes < 60) {
      return `${waitMinutes} min`;
    } else {
      const hours = Math.floor(waitMinutes / 60);
      const minutes = waitMinutes % 60;
      return `${hours}h ${minutes > 0 ? ` ${minutes}m` : ''}`;
    }
  }

  // =====================
  // PRODUCT MANAGEMENT
  // =====================
  
  async getProducts(includeInactive = false) {
    try {
      let query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Add is_available field based on stock_quantity and is_active
      const productsWithAvailability = (data || []).map(product => ({
        ...product,
        is_available: product.is_active && (Number(product.stock_quantity) > 0)
      }));
      
      return productsWithAvailability;
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  async getProductById(productId) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      
      // Add is_available field based on stock_quantity and is_active
      const productWithAvailability = {
        ...data,
        is_available: data.is_active && (Number(data.stock_quantity) > 0)
      };
      
      return productWithAvailability;
    } catch (error) {
      console.error('Error getting product by ID:', error);
      throw error;
    }
  }

  async createProduct(productData) {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([{
          ...productData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  async updateProduct(productId, updates) {
    try {
      const { data, error } = await supabase
        .from('products')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', productId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  async deleteProduct(productId) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  async getProductCategories() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .distinct();

      if (error) throw error;
      return data?.map(item => item.category).filter(Boolean) || [];
    } catch (error) {
      console.error('Error getting product categories:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const apiService = new ApiService();