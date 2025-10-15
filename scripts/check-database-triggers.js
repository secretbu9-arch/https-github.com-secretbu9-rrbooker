const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabaseTriggers() {
  console.log('🔍 Checking database triggers and constraints...\n');

  try {
    // Check for triggers on appointments table
    console.log('📋 Checking triggers on appointments table...');
    const { data: triggers, error: triggerError } = await supabase
      .rpc('get_table_triggers', { table_name: 'appointments' })
      .catch(() => {
        console.log('ℹ️ get_table_triggers function not available, trying alternative...');
        return { data: null, error: null };
      });

    if (triggerError) {
      console.log('ℹ️ Could not check triggers:', triggerError.message);
    } else if (triggers) {
      console.log('Triggers found:', triggers);
    }

    // Try to get table information
    console.log('\n📋 Checking table structure...');
    const { data: tableInfo, error: tableError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_name', 'appointments')
      .eq('table_schema', 'public');

    if (tableError) {
      console.log('ℹ️ Could not get table info:', tableError.message);
    } else {
      console.log('Table columns:');
      tableInfo.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    }

    // Try a different approach - check if there are any functions that might be called
    console.log('\n🧪 Testing with minimal update...');
    
    // Try updating just one field at a time
    const testFields = [
      { field: 'status', value: 'done' },
      { field: 'queue_position', value: null },
      { field: 'notes', value: 'test' }
    ];

    for (const test of testFields) {
      console.log(`\n🧪 Testing update of ${test.field}...`);
      const updateData = {};
      updateData[test.field] = test.value;
      
      const { error: testError } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff');

      if (testError) {
        console.error(`❌ Update of ${test.field} failed:`, testError);
      } else {
        console.log(`✅ Update of ${test.field} succeeded`);
      }
    }

    // Check if there's a specific trigger function
    console.log('\n🔍 Checking for trigger_update_timeline function...');
    const { data: triggerFunc, error: funcError } = await supabase
      .from('pg_proc')
      .select('proname, prosrc')
      .eq('proname', 'trigger_update_timeline')
      .catch(() => {
        console.log('ℹ️ Could not check trigger functions');
        return { data: null, error: null };
      });

    if (funcError) {
      console.log('ℹ️ Could not check trigger functions:', funcError.message);
    } else if (triggerFunc && triggerFunc.length > 0) {
      console.log('Found trigger_update_timeline function');
      console.log('Function source:', triggerFunc[0].prosrc);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDatabaseTriggers();
