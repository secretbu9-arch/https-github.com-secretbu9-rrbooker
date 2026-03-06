import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function checkColumns() {
    const { data, error } = await supabase.from('appointments').select('*').limit(1);
    if (data && data.length > 0) {
        const appointment = data[0];
        console.log('priority_level_type:', typeof appointment.priority_level);
        console.log('priority_level_value:', JSON.stringify(appointment.priority_level));
    }
}
checkColumns();
