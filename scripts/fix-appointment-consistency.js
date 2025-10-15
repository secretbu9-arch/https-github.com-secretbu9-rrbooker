#!/usr/bin/env node

/**
 * Appointment Data Consistency Fix Script
 * 
 * This script fixes critical data consistency issues in the appointments table
 * where queue appointments have appointment_time values and missing queue_position
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixAppointmentConsistency() {
  console.log('🔧 Starting appointment data consistency fix...\n');

  try {
    // Step 1: Identify problematic appointments
    console.log('📊 Step 1: Identifying problematic appointments...');
    
    const { data: problematicAppointments, error: selectError } = await supabase
      .from('appointments')
      .select('id, appointment_type, appointment_time, queue_position, status, appointment_date')
      .or('and(appointment_type.eq.queue,appointment_time.not.is.null),and(appointment_type.eq.queue,queue_position.is.null),and(appointment_type.eq.scheduled,queue_position.not.is.null)');

    if (selectError) {
      throw selectError;
    }

    console.log(`Found ${problematicAppointments.length} problematic appointments:`);
    problematicAppointments.forEach(apt => {
      console.log(`  - ${apt.id}: type=${apt.appointment_type}, time=${apt.appointment_time}, position=${apt.queue_position}`);
    });

    if (problematicAppointments.length === 0) {
      console.log('✅ No problematic appointments found. Data is already consistent!');
      return;
    }

    // Step 2: Fix queue appointments with incorrect appointment_time
    console.log('\n🔧 Step 2: Fixing queue appointments with appointment_time...');
    
    const { error: updateTimeError } = await supabase
      .from('appointments')
      .update({ 
        appointment_time: null,
        updated_at: new Date().toISOString()
      })
      .eq('appointment_type', 'queue')
      .not('appointment_time', 'is', null);

    if (updateTimeError) {
      throw updateTimeError;
    }
    console.log('✅ Fixed queue appointments with incorrect appointment_time');

    // Step 3: Fix scheduled appointments with incorrect queue_position
    console.log('\n🔧 Step 3: Fixing scheduled appointments with queue_position...');
    
    const { error: updatePositionError } = await supabase
      .from('appointments')
      .update({ 
        queue_position: null,
        updated_at: new Date().toISOString()
      })
      .eq('appointment_type', 'scheduled')
      .not('queue_position', 'is', null);

    if (updatePositionError) {
      throw updatePositionError;
    }
    console.log('✅ Fixed scheduled appointments with incorrect queue_position');

    // Step 4: Fix queue appointments missing queue_position
    console.log('\n🔧 Step 4: Fixing queue appointments missing queue_position...');
    
    // Get all queue appointments that need queue positions
    const { data: queueAppointments, error: queueSelectError } = await supabase
      .from('appointments')
      .select('id, barber_id, appointment_date, created_at, is_urgent')
      .eq('appointment_type', 'queue')
      .is('queue_position', null)
      .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']);

    if (queueSelectError) {
      throw queueSelectError;
    }

    // Group by barber and date, then assign queue positions
    const appointmentsByBarber = {};
    queueAppointments.forEach(apt => {
      const key = `${apt.barber_id}-${apt.appointment_date}`;
      if (!appointmentsByBarber[key]) {
        appointmentsByBarber[key] = [];
      }
      appointmentsByBarber[key].push(apt);
    });

    // Assign queue positions
    for (const [key, appointments] of Object.entries(appointmentsByBarber)) {
      // Sort by urgency first, then by creation time
      appointments.sort((a, b) => {
        if (a.is_urgent && !b.is_urgent) return -1;
        if (!a.is_urgent && b.is_urgent) return 1;
        return new Date(a.created_at) - new Date(b.created_at);
      });

      // Update each appointment with its queue position
      for (let i = 0; i < appointments.length; i++) {
        const { error: updateQueueError } = await supabase
          .from('appointments')
          .update({ 
            queue_position: i + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', appointments[i].id);

        if (updateQueueError) {
          throw updateQueueError;
        }
      }
    }

    console.log(`✅ Fixed ${queueAppointments.length} queue appointments missing queue_position`);

    // Step 5: Validate fixes
    console.log('\n📊 Step 5: Validating fixes...');
    
    const { data: remainingIssues, error: validateError } = await supabase
      .from('appointments')
      .select('id, appointment_type, appointment_time, queue_position')
      .or('and(appointment_type.eq.queue,appointment_time.not.is.null),and(appointment_type.eq.queue,queue_position.is.null),and(appointment_type.eq.scheduled,queue_position.not.is.null)');

    if (validateError) {
      throw validateError;
    }

    if (remainingIssues.length === 0) {
      console.log('✅ All appointment data consistency issues have been resolved!');
    } else {
      console.log(`⚠️ ${remainingIssues.length} issues remain:`);
      remainingIssues.forEach(issue => {
        console.log(`  - ${issue.id}: type=${issue.appointment_type}, time=${issue.appointment_time}, position=${issue.queue_position}`);
      });
    }

    // Step 6: Show summary
    console.log('\n📈 Summary:');
    console.log(`  - Fixed queue appointments with appointment_time: ${problematicAppointments.filter(apt => apt.appointment_type === 'queue' && apt.appointment_time).length}`);
    console.log(`  - Fixed scheduled appointments with queue_position: ${problematicAppointments.filter(apt => apt.appointment_type === 'scheduled' && apt.queue_position).length}`);
    console.log(`  - Fixed queue appointments missing queue_position: ${queueAppointments.length}`);

    console.log('\n🎉 Appointment data consistency fix completed successfully!');

  } catch (error) {
    console.error('❌ Error fixing appointment consistency:', error);
    process.exit(1);
  }
}

// Run the fix
fixAppointmentConsistency();
