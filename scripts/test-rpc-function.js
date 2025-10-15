const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpcFunction() {
  console.log('🧪 Testing RPC function...\n');

  try {
    // Test the RPC function
    console.log('📋 Testing update_appointment_status_safe function...');
    const { data: result, error: rpcError } = await supabase
      .rpc('update_appointment_status_safe', {
        appointment_id_param: '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff',
        new_status_param: 'done'
      });

    if (rpcError) {
      console.error('❌ RPC function failed:', rpcError);
    } else {
      console.log('✅ RPC function result:', result);
    }

    // Check the final status
    console.log('\n📋 Checking final appointment status...');
    const { data: appointment, error: selectError } = await supabase
      .from('appointments')
      .select('id, status, queue_position, updated_at')
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
      .single();

    if (selectError) {
      console.error('❌ Error selecting appointment:', selectError);
    } else {
      console.log('Final appointment:', appointment);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testRpcFunction();
