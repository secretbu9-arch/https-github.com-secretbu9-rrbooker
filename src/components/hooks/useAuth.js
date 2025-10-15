// hooks/useAuth.js
import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

/**
 * Custom hook for managing authentication state and user information
 */
export const useAuth = () => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Get initial session
    const initializeAuth = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          throw sessionError;
        }

        setSession(session);

        if (session) {
          // Get user data
          setUser(session.user);
          
          // Fetch user profile data from the database
          await fetchUserProfile(session.user.id);
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      
      setSession(session);
      
      if (session) {
        setUser(session.user);
        await fetchUserProfile(session.user.id);
      } else {
        setUser(null);
        setUserProfile(null);
        setUserRole(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Fetch user profile data from the database
   * @param {string} userId - The user ID
   */
  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        return;
      }

      setUserProfile(data);
      setUserRole(data.role);
    } catch (err) {
      console.error('Error in fetchUserProfile:', err);
    }
  };

  /**
   * Sign in with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<object>} - Auth operation result
   */
  const signIn = async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      // Log the login action
      if (data.user) {
        await supabase.from('system_logs').insert({
          user_id: data.user.id,
          action: 'login_success',
          details: { email },
        });
      }

      return { success: true, data };
    } catch (err) {
      console.error('Error signing in:', err);
      setError(err.message);
      
      // Log failed login attempt
      await supabase.from('system_logs').insert({
        action: 'login_failed',
        details: { email, error: err.message },
      });
      
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign up with email and password
   * @param {object} userData - User registration data
   * @returns {Promise<object>} - Auth operation result
   */
  const signUp = async (userData) => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            full_name: userData.fullName,
            role: userData.role || 'customer',
            phone: userData.phone || ''
          }
        }
      });

      if (error) {
        throw error;
      }

      // Create user profile
      if (data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .upsert([{
            id: data.user.id,
            email: userData.email,
            full_name: userData.fullName,
            role: userData.role || 'customer',
            phone: userData.phone || ''
          }], {
            onConflict: 'id'
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }
      }

      return { success: true, data };
    } catch (err) {
      console.error('Error signing up:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign out the current user
   * @returns {Promise<object>} - Auth operation result
   */
  const signOut = async () => {
    try {
      setLoading(true);
      setError(null);

      // Log the logout action
      if (user) {
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: 'logout_success',
          details: { email: user.email }
        });
      }

      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (err) {
      console.error('Error signing out:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update user profile
   * @param {object} updates - Profile data to update
   * @returns {Promise<object>} - Profile update result
   */
  const updateProfile = async (updates) => {
    try {
      setLoading(true);
      setError(null);

      if (!user) {
        throw new Error('No user logged in');
      }

      // Update auth metadata if needed
      if (updates.email || updates.full_name) {
        const { data, error: updateError } = await supabase.auth.updateUser({
          email: updates.email,
          data: { full_name: updates.full_name }
        });

        if (updateError) {
          throw updateError;
        }
      }

      // Update profile in database
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      setUserProfile(data);
      if (data.role !== userRole) {
        setUserRole(data.role);
      }

      return { success: true, data };
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reset password
   * @param {string} email - User email
   * @returns {Promise<object>} - Password reset result
   */
  const resetPassword = async (email) => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (err) {
      console.error('Error resetting password:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update password
   * @param {string} password - New password
   * @returns {Promise<object>} - Password update result
   */
  const updatePassword = async (password) => {
    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (err) {
      console.error('Error updating password:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return {
    session,
    user,
    userProfile,
    userRole,
    loading,
    error,
    signIn,
    signUp,
    signOut,
    updateProfile,
    resetPassword,
    updatePassword,
    refreshProfile: () => fetchUserProfile(user?.id)
  };
};

export default useAuth;