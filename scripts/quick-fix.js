const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function quickFix() {
  console.log('🔧 Running quick fix for appointment data...\n');

  try {
    // Fix queue_position data types (convert strings to integers)
    console.log('📊 Fixing queue_position data types...');
    
    // Fix each appointment individually
    const appointmentsToFix = [
      { id: 'cbdd0186-e9ae-4666-9a19-64e0355b8a9c', position: 2 },
      { id: '68fcb808-b033-4b91-9e0b-5569d7250f86', position: 3 },
      { id: '8c9f7f81-82c1-4308-8fce-ea6e8c3c2961', position: 4 },
      { id: '63c9293a-5e24-4bcf-b94f-f63e9ba2a4ff', position: 0 }
    ];

    for (const apt of appointmentsToFix) {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ 
          queue_position: apt.position,
          updated_at: new Date().toISOString()
        })
        .eq('id', apt.id);
      
      if (updateError) {
        console.error(`❌ Error updating ${apt.id}:`, updateError);
      } else {
        console.log(`✅ Fixed ${apt.id} - queue_position: ${apt.position}`);
      }
    }

    console.log('✅ Fixed queue_position data types');

    // Fix specific appointments with appointment_time
    console.log('📊 Fixing queue appointments with appointment_time...');
    
    const { error: timeError } = await supabase
      .from('appointments')
      .update({ 
        appointment_time: null,
        updated_at: new Date().toISOString()
      })
      .eq('appointment_type', 'queue')
      .not('appointment_time', 'is', null);

    if (timeError) {
      console.error('❌ Error updating appointment_time:', timeError);
    } else {
      console.log('✅ Fixed queue appointments with appointment_time');
    }

    // Check the results
    console.log('📊 Checking results...');
    
    const { data: appointments, error: selectError } = await supabase
      .from('appointments')
      .select('id, appointment_type, appointment_time, queue_position, status')
      .eq('barber_id', 'f5c19b20-d74c-4afc-8e0e-4848f2f29049')
      .eq('appointment_date', '2025-10-07');

    if (selectError) {
      console.error('❌ Error selecting appointments:', selectError);
    } else {
      console.log('📋 Current appointment data:');
      appointments.forEach(apt => {
        console.log(`  - ${apt.id}: type=${apt.appointment_type}, time=${apt.appointment_time}, position=${apt.queue_position}, status=${apt.status}`);
      });
    }

    console.log('\n🎉 Quick fix completed!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

quickFix();
