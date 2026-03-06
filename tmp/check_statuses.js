
const { createClient } = require('@supabase/supabase-client');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkStatuses() {
    const { data, error } = await supabase
        .from('appointments')
        .select('status, queue_position')
        .eq('appointment_date', '2026-03-06');

    if (error) {
        console.error(error);
        return;
    }

    console.log(JSON.stringify(data, null, 2));
}

checkStatuses();
