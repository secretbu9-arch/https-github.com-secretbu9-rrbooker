
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
);

async function checkPending() {
    const { data, error } = await supabase
        .from('appointments')
        .select('id, status, barber_id, appointment_date')
        .eq('status', 'pending');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Pending appointments count:', data.length);
    console.log('Sample pending data:', data.slice(0, 5));
}

checkPending();
