// supabase/functions/auto-cancel-unconfirmed/index.ts
// Auto-cancel unconfirmed orders and appointments that haven't been confirmed by their scheduled date

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 Starting auto-cancel unconfirmed items process...')

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the database function to auto-cancel unconfirmed items
    const { data, error } = await supabase.rpc('auto_cancel_unconfirmed_items')

    if (error) {
      console.error('❌ Error auto-cancelling unconfirmed items:', error)
      throw error
    }

    const result = data[0] || {
      cancelled_orders_count: 0,
      cancelled_appointments_count: 0,
      cancelled_order_ids: [],
      cancelled_appointment_ids: []
    }

    console.log(`✅ Auto-cancel completed:`)
    console.log(`   - Cancelled ${result.cancelled_orders_count} orders`)
    console.log(`   - Cancelled ${result.cancelled_appointments_count} appointments`)

    // Send notifications for cancelled items (optional)
    if (result.cancelled_orders_count > 0 || result.cancelled_appointments_count > 0) {
      console.log('📧 Sending cancellation notifications...')
      
      // Notify customers about cancelled orders
      if (result.cancelled_order_ids && result.cancelled_order_ids.length > 0) {
        for (const orderId of result.cancelled_order_ids) {
          try {
            // Get order details
            const { data: order, error: orderError } = await supabase
              .from('orders')
              .select('customer_id, id')
              .eq('id', orderId)
              .single()

            if (!orderError && order && order.customer_id) {
              // Create notification directly in database
              const { error: notifError } = await supabase
                .from('notifications')
                .insert({
                  user_id: order.customer_id,
                  title: 'Order Cancelled',
                  message: `Your order #${orderId.slice(-8)} has been automatically cancelled as it was not confirmed by the scheduled pickup date.`,
                  type: 'order',
                  data: {
                    category: 'cancellation',
                    priority: 'normal',
                    channels: ['app'],
                    order_id: orderId
                  },
                  read: false,
                  is_read: false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })

              if (notifError) {
                console.error(`Error creating notification for order ${orderId}:`, notifError)
              }
            }
          } catch (notifError) {
            console.error(`Error sending notification for order ${orderId}:`, notifError)
          }
        }
      }

      // Notify customers about cancelled appointments
      if (result.cancelled_appointment_ids && result.cancelled_appointment_ids.length > 0) {
        for (const appointmentId of result.cancelled_appointment_ids) {
          try {
            // Get appointment details
            const { data: appointment, error: appointmentError } = await supabase
              .from('appointments')
              .select('customer_id, id')
              .eq('id', appointmentId)
              .single()

            if (!appointmentError && appointment && appointment.customer_id) {
              // Create notification directly in database
              const { error: notifError } = await supabase
                .from('notifications')
                .insert({
                  user_id: appointment.customer_id,
                  title: 'Appointment Cancelled',
                  message: `Your appointment has been automatically cancelled as it was not confirmed by the scheduled date.`,
                  type: 'appointment',
                  data: {
                    category: 'cancellation',
                    priority: 'normal',
                    channels: ['app'],
                    appointment_id: appointmentId
                  },
                  read: false,
                  is_read: false,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })

              if (notifError) {
                console.error(`Error creating notification for appointment ${appointmentId}:`, notifError)
              }
            }
          } catch (notifError) {
            console.error(`Error sending notification for appointment ${appointmentId}:`, notifError)
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Auto-cancel process completed successfully',
        cancelled_orders_count: result.cancelled_orders_count,
        cancelled_appointments_count: result.cancelled_appointments_count,
        cancelled_order_ids: result.cancelled_order_ids,
        cancelled_appointment_ids: result.cancelled_appointment_ids,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Error in auto-cancel-unconfirmed function:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

