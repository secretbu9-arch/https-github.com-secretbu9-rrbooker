// scripts/fix-appointment-consistency.js
// Fix appointment data consistency issues

import { createClient } from '@supabase/supabase-js';

// You'll need to replace these with your actual Supabase credentials
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://ystajvslfrqdterhpbse.supabase.co';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_uWkp_QtmqllHu4xfg0vYzA_PfbdY_aa';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixAppointmentConsistency() {
  try {
    console.log('🔧 Starting appointment data consistency fix...');

    // Fix queue appointments that have appointment_time (should be null)
    // Only fix queue appointments that are already scheduled (accepted by barber)
    console.log('🔧 Fixing queue appointments with appointment_time...');
    const { data: queueFixes, error: queueError } = await supabase
      .from('appointments')
      .update({ 
        appointment_time: null,
        updated_at: new Date().toISOString()
      })
      .eq('appointment_type', 'queue')
      .eq('status', 'scheduled') // Only fix accepted queue appointments
      .not('appointment_time', 'is', null)
      .select('id');

    if (queueError) {
      console.error('❌ Error fixing queue appointments:', queueError);
    } else {
      console.log(`✅ Fixed ${queueFixes?.length || 0} queue appointments`);
    }

    // Fix scheduled appointments that have queue_position (should be null)
    // Only fix scheduled appointments that are already scheduled (accepted by barber)
    console.log('🔧 Fixing scheduled appointments with queue_position...');
    const { data: scheduledFixes, error: scheduledError } = await supabase
      .from('appointments')
      .update({ 
        queue_position: null,
        updated_at: new Date().toISOString()
      })
      .eq('appointment_type', 'scheduled')
      .eq('status', 'scheduled') // Only fix accepted scheduled appointments
      .not('queue_position', 'is', null)
      .select('id');

    if (scheduledError) {
      console.error('❌ Error fixing scheduled appointments:', scheduledError);
    } else {
      console.log(`✅ Fixed ${scheduledFixes?.length || 0} scheduled appointments`);
    }

    // Verify the fixes
    console.log('🔍 Verifying fixes...');
    const { data: verification, error: verifyError } = await supabase
      .from('appointments')
      .select('appointment_type, appointment_time, queue_position')
      .in('appointment_type', ['scheduled', 'queue']);

    if (verifyError) {
      console.error('❌ Error verifying fixes:', verifyError);
    } else {
      const scheduled = verification.filter(apt => apt.appointment_type === 'scheduled');
      const queue = verification.filter(apt => apt.appointment_type === 'queue');
      
      const scheduledWithQueue = scheduled.filter(apt => apt.queue_position !== null);
      const queueWithTime = queue.filter(apt => apt.appointment_time !== null);
      
      console.log('📊 Verification Results:');
      console.log(`- Scheduled appointments: ${scheduled.length} total`);
      console.log(`- Scheduled with queue_position: ${scheduledWithQueue.length} (should be 0)`);
      console.log(`- Queue appointments: ${queue.length} total`);
      console.log(`- Queue with appointment_time: ${queueWithTime.length} (should be 0)`);
      
      if (scheduledWithQueue.length === 0 && queueWithTime.length === 0) {
        console.log('✅ All data consistency issues have been fixed!');
      } else {
        console.log('⚠️ Some issues may still remain. Please check the data manually.');
      }
    }

  } catch (error) {
    console.error('❌ Error during consistency fix:', error);
  }
}

// Run the fix
fixAppointmentConsistency();