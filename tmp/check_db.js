import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function checkSchema() {
    console.log('Checking for emergency_audit table...');
    const { data, error } = await supabase.from('emergency_audit').select('*').limit(1);

    if (error) {
        console.log('Error or table missing:', error.message);
    } else {
        console.log('Table exists. Data sample:', data);
    }

    console.log('\nChecking appointments status check constraint...');
    // We can't easily check constraints via client, but we can try to insert a weird status
}

checkSchema();
