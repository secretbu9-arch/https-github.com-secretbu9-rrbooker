// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase configuration missing!');
  console.error('Please check your .env file and ensure the following variables are set:');
  console.error('- REACT_APP_SUPABASE_URL');
  console.error('- REACT_APP_SUPABASE_ANON_KEY');
  
  if (!supabaseUrl) {
    console.error('⚠️ REACT_APP_SUPABASE_URL is missing');
  }
  if (!supabaseAnonKey) {
    console.error('⚠️ REACT_APP_SUPABASE_ANON_KEY is missing');
  }
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Handle auth errors gracefully
    flowType: 'pkce'
  }
});

// Helper function to check Supabase connection
export const checkSupabaseConnection = async () => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        connected: false,
        error: 'Missing Supabase configuration. Please check your .env file.',
        details: {
          urlMissing: !supabaseUrl,
          keyMissing: !supabaseAnonKey
        }
      };
    }

    // Test connection by making a simple request
    const { error } = await supabase.from('users').select('id').limit(1);
    
    if (error) {
      // Check for network errors
      if (error.message?.includes('Failed to fetch') || error.message?.includes('ERR_NAME_NOT_RESOLVED')) {
        return {
          connected: false,
          error: 'Network Error: Unable to reach Supabase',
          details: {
            possibleCauses: [
              'Check your internet connection',
              'Verify your REACT_APP_SUPABASE_URL in .env file',
              'Check if your Supabase project is active (not paused)',
              'URL format should be: https://your-project-id.supabase.co',
              'Ensure you\'re using .co (not .com) for Supabase URLs'
            ],
            currentUrl: supabaseUrl
          }
        };
      }
      return {
        connected: false,
        error: error.message,
        details: error
      };
    }

    return { connected: true };
  } catch (err) {
    return {
      connected: false,
      error: err.message || 'Unknown error',
      details: err
    };
  }
};

// Helper functions for common database operations

// User-related functions
export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  return { data, error };
};

export const updateUserProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  
  return { data, error };
};

// Appointment-related functions
export const createAppointment = async (appointmentData) => {
  const { data, error } = await supabase
    .from('appointments')
    .insert([appointmentData])
    .select()
    .single();
  
  return { data, error };
};

export const updateAppointmentStatus = async (appointmentId, status) => {
  const { data, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', appointmentId)
    .select()
    .single();
  
  return { data, error };
};

export const getAppointments = async (filters = {}) => {
  let query = supabase
    .from('appointments')
    .select(`
      *,
      customer:customer_id (id, full_name, email),
      barber:barber_id (id, full_name, email),
      service:service_id (id, name, price, duration)
    `);
  
  // Apply filters
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  
  const { data, error } = await query.order('appointment_date', { ascending: true });
  
  return { data, error };
};

// Service-related functions
export const getServices = async () => {
  const { data, error } = await supabase
    .from('services')
    .select('*')
    .order('name');
  
  return { data, error };
};

// Product-related functions
export const getProducts = async () => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name');
  
  return { data, error };
};

export const updateProductStock = async (productId, quantity) => {
  const { data, error } = await supabase
    .from('products')
    .update({ stock_quantity: quantity })
    .eq('id', productId)
    .select()
    .single();
  
  return { data, error };
};

// Queue-related functions
export const getQueue = async (barberId, date) => {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      customer:customer_id (id, full_name, email)
    `)
    .eq('barber_id', barberId)
    .eq('appointment_date', date)
    .eq('status', 'scheduled')
    .order('appointment_time');
  
  return { data, error };
};

// Logging functions
export const logAction = async (userId, action, details = {}) => {
  const { data, error } = await supabase
    .from('system_logs')
    .insert([{
      user_id: userId,
      action,
      details,
      created_at: new Date().toISOString()
    }]);
  
  return { data, error };
};