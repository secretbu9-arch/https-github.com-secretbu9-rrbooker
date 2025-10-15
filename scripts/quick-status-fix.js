const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function quickStatusFix() {
  console.log('🔧 Quick status fix for appointment 63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff...\n');

  try {
    // First, let's try to update the appointment using a different approach
    console.log('📋 Attempting direct SQL update...');
    
    // Try using a raw SQL query approach
    const { data: result, error: sqlError } = await supabase
      .from('appointments')
      .update({ 
        status: 'done',
        queue_position: null
      })
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
      .select();

    if (sqlError) {
      console.error('❌ Direct update failed:', sqlError);
      
      // Try a different approach - update without queue_position first
      console.log('\n📋 Trying update without queue_position...');
      const { data: result2, error: sqlError2 } = await supabase
        .from('appointments')
        .update({ status: 'done' })
        .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
        .select();
      
      if (sqlError2) {
        console.error('❌ Status-only update also failed:', sqlError2);
      } else {
        console.log('✅ Status update succeeded:', result2);
        
        // Now try to update queue_position separately
        console.log('\n📋 Updating queue_position separately...');
        const { data: result3, error: sqlError3 } = await supabase
          .from('appointments')
          .update({ queue_position: null })
          .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
          .select();
        
        if (sqlError3) {
          console.error('❌ Queue position update failed:', sqlError3);
        } else {
          console.log('✅ Queue position update succeeded:', result3);
        }
      }
    } else {
      console.log('✅ Direct update succeeded:', result);
    }

    // Check the final status
    console.log('\n📋 Final appointment status...');
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

quickStatusFix();
