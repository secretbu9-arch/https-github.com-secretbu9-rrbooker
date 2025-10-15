const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugAppointment() {
  console.log('🔍 Debugging appointment 63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff...\n');

  try {
    // Get the specific appointment
    const { data: appointment, error: selectError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
      .single();

    if (selectError) {
      console.error('❌ Error selecting appointment:', selectError);
      return;
    }

    console.log('📋 Current appointment data:');
    console.log(JSON.stringify(appointment, null, 2));

    // Try a simple status update first
    console.log('\n🧪 Testing simple status update...');
    const { error: simpleUpdateError } = await supabase
      .from('appointments')
      .update({ status: 'done' })
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff');

    if (simpleUpdateError) {
      console.error('❌ Simple status update failed:', simpleUpdateError);
    } else {
      console.log('✅ Simple status update succeeded');
    }

    // Try updating with queue_position = null
    console.log('\n🧪 Testing status + queue_position update...');
    const { error: complexUpdateError } = await supabase
      .from('appointments')
      .update({ 
        status: 'done',
        queue_position: null
      })
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff');

    if (complexUpdateError) {
      console.error('❌ Complex update failed:', complexUpdateError);
    } else {
      console.log('✅ Complex update succeeded');
    }

    // Check the final state
    console.log('\n📋 Final appointment data:');
    const { data: finalAppointment, error: finalError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
      .single();

    if (finalError) {
      console.error('❌ Error getting final appointment:', finalError);
    } else {
      console.log(JSON.stringify(finalAppointment, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugAppointment();
