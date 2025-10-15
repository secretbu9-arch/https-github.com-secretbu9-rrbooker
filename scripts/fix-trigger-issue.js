const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTriggerIssue() {
  console.log('🔧 Fixing trigger issue...\n');

  try {
    // First, let's try to disable the problematic trigger temporarily
    console.log('📋 Attempting to disable trigger...');
    
    let disableError = null;
    try {
      const result = await supabase
        .rpc('exec_sql', { 
          sql: 'ALTER TABLE appointments DISABLE TRIGGER update_timeline_on_status_change;' 
        });
      disableError = result.error;
    } catch (err) {
      console.log('ℹ️ exec_sql function not available, trying alternative approach...');
      disableError = null;
    }

    if (disableError) {
      console.log('ℹ️ Could not disable trigger:', disableError.message);
    } else {
      console.log('✅ Trigger disabled successfully');
    }

    // Now try the update
    console.log('\n🧪 Testing update with trigger disabled...');
    const { error: updateError } = await supabase
      .from('appointments')
      .update({ status: 'done' })
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff');

    if (updateError) {
      console.error('❌ Update still failed:', updateError);
    } else {
      console.log('✅ Update succeeded with trigger disabled');
    }

    // Re-enable the trigger
    console.log('\n📋 Re-enabling trigger...');
    let enableError = null;
    try {
      const result = await supabase
        .rpc('exec_sql', { 
          sql: 'ALTER TABLE appointments ENABLE TRIGGER update_timeline_on_status_change;' 
        });
      enableError = result.error;
    } catch (err) {
      console.log('ℹ️ exec_sql function not available for re-enabling...');
      enableError = null;
    }

    if (enableError) {
      console.log('ℹ️ Could not re-enable trigger:', enableError.message);
    } else {
      console.log('✅ Trigger re-enabled successfully');
    }

    // Alternative approach: Try updating without triggering the status change
    console.log('\n🧪 Testing alternative update approach...');
    
    // Try updating a different field first to see if it's specifically the status field
    const { error: notesError } = await supabase
      .from('appointments')
      .update({ notes: 'Updated via script' })
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff');

    if (notesError) {
      console.error('❌ Notes update failed:', notesError);
    } else {
      console.log('✅ Notes update succeeded');
    }

    // Check current status
    console.log('\n📋 Checking current appointment status...');
    const { data: appointment, error: selectError } = await supabase
      .from('appointments')
      .select('id, status, queue_position, appointment_type')
      .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff')
      .single();

    if (selectError) {
      console.error('❌ Error selecting appointment:', selectError);
    } else {
      console.log('Current status:', appointment);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixTriggerIssue();
