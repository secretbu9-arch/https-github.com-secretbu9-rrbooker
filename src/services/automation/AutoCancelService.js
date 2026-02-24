// services/AutoCancelService.js
/**
 * Auto-Cancel Service
 * 
 * Automatically cancels unconfirmed orders and appointments
 * that haven't been accepted/claimed within the day they were scheduled
 */

import { supabase } from '../../supabaseClient';

class AutoCancelService {
  /**
   * Automatically cancel unconfirmed orders and appointments
   * @returns {Promise<Object>} Result with counts of cancelled items
   */
  async cancelUnconfirmedItems() {
    try {
      console.log('🔄 Starting auto-cancel process...');

      // Call the database function
      const { data, error } = await supabase.rpc('auto_cancel_unconfirmed_items');

      if (error) {
        console.error('❌ Error cancelling unconfirmed items:', error);
        throw error;
      }

      const result = data[0] || {
        cancelled_orders_count: 0,
        cancelled_appointments_count: 0,
        cancelled_order_ids: [],
        cancelled_appointment_ids: []
      };

      console.log('✅ Auto-cancel completed:', {
        orders: result.cancelled_orders_count,
        appointments: result.cancelled_appointments_count
      });

      return {
        success: true,
        cancelledOrders: result.cancelled_orders_count,
        cancelledAppointments: result.cancelled_appointments_count,
        cancelledOrderIds: result.cancelled_order_ids || [],
        cancelledAppointmentIds: result.cancelled_appointment_ids || []
      };

    } catch (error) {
      console.error('❌ Error in auto-cancel service:', error);
      throw error;
    }
  }

  /**
   * Get statistics about unconfirmed items that would be cancelled
   * @returns {Promise<Object>} Statistics about unconfirmed items
   */
  async getUnconfirmedItemsStats() {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get unconfirmed orders count
      const { count: unconfirmedOrdersCount, error: ordersError } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('pickup_date', today)
        .is('confirmed_at', null);

      if (ordersError) throw ordersError;

      // Get unconfirmed appointments count
      const { count: unconfirmedAppointmentsCount, error: appointmentsError } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('appointment_date', today)
        .is('confirmed_at', null);

      if (appointmentsError) throw appointmentsError;

      return {
        unconfirmedOrders: unconfirmedOrdersCount || 0,
        unconfirmedAppointments: unconfirmedAppointmentsCount || 0,
        total: (unconfirmedOrdersCount || 0) + (unconfirmedAppointmentsCount || 0)
      };

    } catch (error) {
      console.error('❌ Error getting unconfirmed items stats:', error);
      throw error;
    }
  }

  /**
   * Manually trigger auto-cancel via Edge Function
   * Useful for testing or manual execution
   * @returns {Promise<Object>} Result from Edge Function
   */
  async triggerAutoCancelViaEdgeFunction() {
    try {
      const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 
                         (await supabase).supabaseUrl;
      const functionUrl = `${supabaseUrl}/functions/v1/auto-cancel-unconfirmed`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
        }
      });

      if (!response.ok) {
        throw new Error(`Edge function error: ${response.statusText}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('❌ Error triggering Edge Function:', error);
      throw error;
    }
  }
}

export default new AutoCancelService();








