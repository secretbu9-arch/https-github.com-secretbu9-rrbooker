// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

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