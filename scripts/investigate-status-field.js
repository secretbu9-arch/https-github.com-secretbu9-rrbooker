const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigateStatusField() {
  console.log('🔍 Investigating status field issue...\n');

  try {
    // First, let's check the current appointment data
    console.log('📋 Getting current appointment data...');
    const { data: appointment, error: selectError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
      .single();

    if (selectError) {
      console.error('❌ Error selecting appointment:', selectError);
      return;
    }

    console.log('Current appointment:');
    console.log(`  - ID: ${appointment.id}`);
    console.log(`  - Status: ${appointment.status} (type: ${typeof appointment.status})`);
    console.log(`  - Appointment Type: ${appointment.appointment_type}`);
    console.log(`  - Queue Position: ${appointment.queue_position} (type: ${typeof appointment.queue_position})`);
    console.log(`  - Appointment Time: ${appointment.appointment_time} (type: ${typeof appointment.appointment_time})`);

    // Try different approaches to update the status
    console.log('\n🧪 Testing different update approaches...');

    // Approach 1: Update with explicit type casting
    console.log('\n1️⃣ Testing with explicit type casting...');
    const { error: castError } = await supabase
      .from('appointments')
      .update({ status: 'done' })
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff');

    if (castError) {
      console.error('❌ Type cast update failed:', castError);
    } else {
      console.log('✅ Type cast update succeeded');
    }

    // Approach 2: Try updating a different field first
    console.log('\n2️⃣ Testing update of notes field...');
    const { error: notesError } = await supabase
      .from('appointments')
      .update({ notes: 'Test update' })
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff');

    if (notesError) {
      console.error('❌ Notes update failed:', notesError);
    } else {
      console.log('✅ Notes update succeeded');
    }

    // Approach 3: Try using RPC function
    console.log('\n3️⃣ Testing with RPC function...');
    const { error: rpcError } = await supabase
      .rpc('update_appointment_status', {
        appointment_id: '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff',
        new_status: 'done'
      });

    if (rpcError) {
      console.error('❌ RPC update failed:', rpcError);
    } else {
      console.log('✅ RPC update succeeded');
    }

    // Approach 4: Check if there are any constraints on the status field
    console.log('\n4️⃣ Checking status field constraints...');
    const { data: constraints, error: constraintError } = await supabase
      .from('information_schema.check_constraints')
      .select('constraint_name, check_clause')
      .ilike('check_clause', '%status%');

    if (constraintError) {
      console.log('ℹ️ Could not check constraints:', constraintError.message);
    } else if (constraints && constraints.length > 0) {
      console.log('Status constraints found:');
      constraints.forEach(constraint => {
        console.log(`  - ${constraint.constraint_name}: ${constraint.check_clause}`);
      });
    } else {
      console.log('No status constraints found');
    }

    // Check final status
    console.log('\n📋 Final appointment status...');
    const { data: finalAppointment, error: finalError } = await supabase
      .from('appointments')
      .select('id, status, updated_at')
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
      .single();

    if (finalError) {
      console.error('❌ Error getting final appointment:', finalError);
    } else {
      console.log('Final status:', finalAppointment);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

investigateStatusField();
