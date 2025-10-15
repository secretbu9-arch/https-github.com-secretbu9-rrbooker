// supabase/functions/process-queue/index.ts
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
    console.log('🔄 Processing queue for scheduled appointments...')

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call the database function to process scheduled appointments
    const { data, error } = await supabase.rpc('process_scheduled_appointments_for_queue')

    if (error) {
      console.error('❌ Error processing queue:', error)
      throw error
    }

    const processedCount = data || 0
    console.log(`✅ Queue processing completed. Processed ${processedCount} appointments.`)

    // Get current queue statistics
    const { data: queueStats, error: statsError } = await supabase
      .from('queue_analytics')
      .select('*')

    if (statsError) {
      console.warn('Failed to get queue statistics:', statsError)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processedCount} appointments`,
        processedCount,
        queueStats: queueStats || []
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('❌ Error in process-queue function:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
