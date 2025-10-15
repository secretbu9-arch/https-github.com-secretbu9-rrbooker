// services/AllAppointmentsService.js
import { supabase } from '../supabaseClient';

class AllAppointmentsService {
  // Fetch all appointments with queue information
  async fetchAllAppointments(filters = {}) {
    try {
      const {
        date = new Date().toISOString().split('T')[0],
        barberId = null,
        status = ['scheduled', 'confirmed', 'ongoing'],
        includeCompleted = false
      } = filters;

      let query = supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('appointment_date', date)
        .in('status', status)
        .order('barber_id')
        .order('queue_position', { nullsLast: true });

      if (barberId) {
        query = query.eq('barber_id', barberId);
      }

      if (includeCompleted) {
        query = query.in('status', [...status, 'done']);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching all appointments:', error);
      throw error;
    }
  }

  // Fetch appointments statistics
  async fetchAppointmentStats(filters = {}) {
    try {
      const {
        date = new Date().toISOString().split('T')[0],
        barberId = null
      } = filters;

      let query = supabase
        .from('appointments')
        .select('*')
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing']);

      if (barberId) {
        query = query.eq('barber_id', barberId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const appointments = data || [];
      
      return {
        total: appointments.length,
        withQueuePosition: appointments.filter(apt => apt.queue_position !== null).length,
        queueType: appointments.filter(apt => apt.appointment_type === 'queue').length,
        scheduledType: appointments.filter(apt => apt.appointment_type === 'scheduled').length,
        walkIns: appointments.filter(apt => apt.is_walk_in).length,
        urgent: appointments.filter(apt => apt.priority_level === 'urgent').length,
        high: appointments.filter(apt => apt.priority_level === 'high').length,
        normal: appointments.filter(apt => apt.priority_level === 'normal').length,
        low: appointments.filter(apt => apt.priority_level === 'low').length,
        byStatus: {
          scheduled: appointments.filter(apt => apt.status === 'scheduled').length,
          confirmed: appointments.filter(apt => apt.status === 'confirmed').length,
          ongoing: appointments.filter(apt => apt.status === 'ongoing').length
        }
      };
    } catch (error) {
      console.error('Error fetching appointment stats:', error);
      throw error;
    }
  }

  // Fetch appointments by barber
  async fetchAppointmentsByBarber(date = new Date().toISOString().split('T')[0]) {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('appointment_date', date)
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
        .order('barber_id')
        .order('queue_position', { nullsLast: true });

      if (error) throw error;

      // Group appointments by barber
      const grouped = {};
      (data || []).forEach(apt => {
        const barberId = apt.barber_id;
        if (!grouped[barberId]) {
          grouped[barberId] = {
            barber: apt.barber,
            appointments: []
          };
        }
        grouped[barberId].appointments.push(apt);
      });

      return grouped;
    } catch (error) {
      console.error('Error fetching appointments by barber:', error);
      throw error;
    }
  }

  // Fetch appointments that need queue integration
  async fetchAppointmentsNeedingIntegration() {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `)
        .eq('appointment_date', new Date().toISOString().split('T')[0])
        .in('status', ['scheduled', 'confirmed', 'ongoing'])
        .or('queue_position.is.null,appointment_type.is.null,priority_level.is.null');

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching appointments needing integration:', error);
      throw error;
    }
  }

  // Update appointment for queue integration
  async updateAppointmentForQueue(appointmentId, updates) {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error updating appointment for queue:', error);
      throw error;
    }
  }

  // Batch update appointments for queue integration
  async batchUpdateAppointmentsForQueue(appointments) {
    try {
      const updates = appointments.map(apt => ({
        id: apt.id,
        appointment_type: apt.appointment_type || (apt.queue_position ? 'queue' : 'scheduled'),
        priority_level: apt.priority_level || 'normal',
        queue_position: apt.queue_position,
        updated_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('appointments')
        .upsert(updates, { onConflict: 'id' })
        .select();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error batch updating appointments:', error);
      throw error;
    }
  }

  // Process scheduled appointments for queue
  async processScheduledAppointments() {
    try {
      const { data, error } = await supabase
        .rpc('process_scheduled_appointments_for_queue');

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error processing scheduled appointments:', error);
      throw error;
    }
  }

  // Get queue position for appointment
  async getQueuePosition(barberId, date, priorityLevel = 'normal') {
    try {
      const { data, error } = await supabase
        .rpc('get_next_queue_position', {
          p_barber_id: barberId,
          p_appointment_date: date,
          p_priority_level: priorityLevel
        });

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error getting queue position:', error);
      throw error;
    }
  }

  // Reorder queue by priority
  async reorderQueueByPriority(barberId, date) {
    try {
      const { data, error } = await supabase
        .rpc('reorder_queue_by_priority', {
          p_barber_id: barberId,
          p_appointment_date: date
        });

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error reordering queue by priority:', error);
      throw error;
    }
  }

  // Get barber queue status
  async getBarberQueueStatus(barberId, date) {
    try {
      const { data, error } = await supabase
        .rpc('get_barber_queue_status', {
          p_barber_id: barberId,
          p_appointment_date: date
        });

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error getting barber queue status:', error);
      throw error;
    }
  }

  // Fetch appointments with real-time updates
  subscribeToAppointments(filters = {}, callback) {
    const {
      date = new Date().toISOString().split('T')[0],
      barberId = null
    } = filters;

    let query = supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(id, full_name, email, phone),
        barber:barber_id(id, full_name, email, phone),
        service:service_id(id, name, price, duration, description)
      `)
      .eq('appointment_date', date)
      .in('status', ['scheduled', 'confirmed', 'ongoing']);

    if (barberId) {
      query = query.eq('barber_id', barberId);
    }

    return query.on('*', callback).subscribe();
  }

  // Export appointments data
  async exportAppointments(filters = {}) {
    try {
      const appointments = await this.fetchAllAppointments(filters);
      
      const exportData = appointments.map(apt => ({
        id: apt.id,
        customer_name: apt.customer?.full_name || 'Unknown',
        customer_phone: apt.customer?.phone || '',
        customer_email: apt.customer?.email || '',
        barber_name: apt.barber?.full_name || 'Unknown',
        service_name: apt.service?.name || 'Unknown',
        service_duration: apt.service?.duration || 0,
        appointment_date: apt.appointment_date,
        appointment_time: apt.appointment_time,
        queue_position: apt.queue_position,
        priority_level: apt.priority_level,
        appointment_type: apt.appointment_type,
        status: apt.status,
        is_walk_in: apt.is_walk_in,
        notes: apt.notes,
        created_at: apt.created_at,
        updated_at: apt.updated_at
      }));

      return exportData;
    } catch (error) {
      console.error('Error exporting appointments:', error);
      throw error;
    }
  }
}

export const allAppointmentsService = new AllAppointmentsService();
export default allAppointmentsService;

