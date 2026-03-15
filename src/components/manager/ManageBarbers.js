// components/manager/ManageBarbers.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { formatDate } from '../utils/helpers';
import { isValidEmail, isValidPhone } from '../utils/validators';
import LoadingSpinner from '../common/LoadingSpinner';

const MAX_ACTIVE_BARBERS = 5;

const ManageBarbers = () => {
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showUnarchiveModal, setShowUnarchiveModal] = useState(false);
  const [barberToArchive, setBarberToArchive] = useState(null);
  const [barberToUnarchive, setBarberToUnarchive] = useState(null);
  const [barberToDelete, setBarberToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState('active'); // 'active' or 'archived'
  const [canUnarchive, setCanUnarchive] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [expandedProfileBarber, setExpandedProfileBarber] = useState(null);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    new_password: '',
    role: 'barber',
    skills: '',
    profile_picture_url: ''
  });
  const [uploadingImage, setUploadingImage] = useState(false);

  const [formErrors, setFormErrors] = useState({});
  const [barberStats, setBarberStats] = useState({});

  useEffect(() => {
    fetchBarbers();

    // Set up subscription for user changes
    const subscription = supabase
      .channel('barbers-changes')
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
          filter: 'role=eq.barber'
        },
        () => {
          fetchBarbers();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [viewFilter]);

  useEffect(() => {
    if (barbers.length > 0) {
      fetchBarberStats();
    }
  }, [barbers]);

  const fetchBarbers = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('users')
        .select('*')
        .eq('role', 'barber');

      // Filter based on view filter
      if (viewFilter === 'active') {
        query = query.neq('archived', true);
      } else if (viewFilter === 'archived') {
        query = query.eq('archived', true);
      }

      const { data, error } = await query.order('full_name');

      if (error) throw error;

      setBarbers(data || []);
    } catch (error) {
      console.error('Error fetching barbers:', error);
      setError('Failed to load barbers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchBarberStats = async () => {
    try {
      // Get appointments for each barber
      const { data, error } = await supabase
        .from('appointments')
        .select('barber_id, status')
        .in('barber_id', barbers.map(b => b.id));

      if (error) throw error;

      // Calculate stats for each barber
      const stats = {};

      barbers.forEach(barber => {
        const barberAppointments = data.filter(apt => apt.barber_id === barber.id);

        stats[barber.id] = {
          total: barberAppointments.length,
          completed: barberAppointments.filter(apt => apt.status === 'completed').length,
          upcoming: barberAppointments.filter(apt => apt.status === 'scheduled').length,
          cancelled: barberAppointments.filter(apt => apt.status === 'cancelled').length
        };
      });

      setBarberStats(stats);

    } catch (error) {
      console.error('Error fetching barber stats:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Handle phone number with +63 prefix
    if (name === 'phone') {
      // Remove all non-digit characters
      let digits = value.replace(/\D/g, '');

      // If user is typing, extract only digits after +63
      if (value.startsWith('+63')) {
        // Get digits after +63
        digits = value.substring(3).replace(/\D/g, '');
      } else if (digits.startsWith('63')) {
        // If user typed 63 first, remove it and get remaining digits
        digits = digits.substring(2);
      }

      // Strip leading 0 if it exists (extra check for numbers like +6309...)
      if (digits.startsWith('0')) {
        digits = digits.substring(1);
      }

      // Enforce starting with 9
      if (digits.length > 0 && digits[0] !== '9') {
        digits = '';
      }

      // Limit to 10 digits
      if (digits.length > 10) {
        digits = digits.substring(0, 10);
      }

      // Add +63 prefix if we have digits
      const formatted = digits.length > 0 ? `+63${digits}` : '';

      setFormData(prev => ({
        ...prev,
        [name]: formatted
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }

    // Clear validation error for this field
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateForm = () => {
    const errors = {};

    // Required fields
    if (!(formData.full_name || '').trim()) {
      errors.full_name = 'Name is required';
    }

    if (!(formData.email || '').trim()) {
      errors.email = 'Email is required';
    } else if (!isValidEmail(formData.email)) {
      errors.email = 'Invalid email format';
    }

    if (formData.phone && !isValidPhone(formData.phone)) {
      errors.phone = 'Invalid phone number';
    }

    // Password is required only for new barbers
    if (!isEditing && !formData.password) {
      errors.password = 'Password is required';
    } else if (!isEditing && formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Check active barber limit for new barbers
    if (!isEditing && barbers.length >= MAX_ACTIVE_BARBERS) {
      setError(`Maximum limit of ${MAX_ACTIVE_BARBERS} active barbers reached. Please archive an existing barber before adding a new one.`);
      return;
    }

    try {
      setLoading(true);
      setError(null); // Clear any previous errors

      if (isEditing && selectedBarber) {
        // Update existing barber
        const { data, error } = await supabase
          .from('users')
          .update({
            full_name: formData.full_name,
            phone: formData.phone,
            skills: formData.skills,
            profile_picture_url: formData.profile_picture_url
          })
          .eq('id', selectedBarber.id)
          .select();

        if (error) throw error;

        // Update local state
        setBarbers(prev =>
          prev.map(barber =>
            barber.id === selectedBarber.id
              ? { ...barber, ...data[0] }
              : barber
          )
        );
      } else {
        // Try to use the RPC function if it exists
        try {
          const { data, error } = await supabase.rpc('create_confirmed_barber', {
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            phone: formData.phone || null,
            skills: formData.skills || null
          });

          if (error) throw error;

          // Update local state with returned data
          setBarbers(prev => [...prev, data]);
        } catch (rpcError) {
          console.error('RPC function failed:', rpcError);

          // Fallback to regular signup method
          // First, sign up the user
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: formData.email,
            password: formData.password,
            options: {
              data: {
                full_name: formData.full_name,
                role: 'barber',
                phone: formData.phone || '',
                skills: formData.skills || ''
              }
            }
          });

          if (authError) throw authError;

          // Then, manually insert into the users table
          const { data: userData, error: userError } = await supabase
            .from('users')
            .insert([{
              id: authData.user.id,
              email: formData.email,
              full_name: formData.full_name,
              role: 'barber',
              phone: formData.phone || '',
              skills: formData.skills || ''
            }])
            .select();

          if (userError) throw userError;

          setSuccessMessage('Barber account created! Note: The barber may need to verify their email before logging in.');
          setShowSuccessModal(true);

          // Update local state
          setBarbers(prev => [...prev, userData[0]]);
        }
      }

      // Close modal and reset form
      resetFormAndCloseModal();
    } catch (error) {
      console.error('Error saving barber:', error);
      setError('Failed to save barber: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (barber) => {
    setSelectedBarber(barber);
    setFormData({
      full_name: barber.full_name || '',
      email: barber.email || '',
      phone: barber.phone || '',
      password: '', // Don't populate password for editing
      new_password: '', // Used for force update
      role: 'barber',
      skills: barber.skills || '',
      profile_picture_url: barber.profile_picture_url || ''
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleArchiveClick = (barber) => {
    setBarberToArchive(barber);
    setShowArchiveModal(true);
  };

  const handleArchiveConfirm = async () => {
    if (!barberToArchive) return;

    try {
      setLoading(true);

      // Archive user (set archived to true)
      const { error } = await supabase
        .from('users')
        .update({ archived: true })
        .eq('id', barberToArchive.id);

      if (error) throw error;

      // Update local state
      setBarbers(prev => prev.filter(barber => barber.id !== barberToArchive.id));

      // Close modal and reset state
      setShowArchiveModal(false);
      setBarberToArchive(null);

    } catch (error) {
      console.error('Error archiving barber:', error);
      setError('Failed to archive barber. Please try again.');
      setShowArchiveModal(false);
      setBarberToArchive(null);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveCancel = () => {
    setShowArchiveModal(false);
    setBarberToArchive(null);
  };

  const getActiveBarbersCount = async () => {
    try {
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'barber')
        .neq('archived', true);

      if (error) throw error;

      return count || 0;
    } catch (error) {
      console.error('Error fetching active barbers count:', error);
      return 0;
    }
  };

  const handleUnarchiveClick = async (barber) => {
    // Check if unarchiving would exceed the limit
    const activeCount = await getActiveBarbersCount();

    if (activeCount >= MAX_ACTIVE_BARBERS) {
      setError(`Cannot unarchive barber. Maximum limit of ${MAX_ACTIVE_BARBERS} active barbers reached. Please archive an existing barber first.`);
      return;
    }

    setCanUnarchive(true);
    setBarberToUnarchive(barber);
    setShowUnarchiveModal(true);
  };

  const handleUnarchiveConfirm = async () => {
    if (!barberToUnarchive) return;

    // Double-check the limit before unarchiving
    const activeCount = await getActiveBarbersCount();

    if (activeCount >= MAX_ACTIVE_BARBERS) {
      setCanUnarchive(false);
      setError(`Cannot unarchive barber. Maximum limit of ${MAX_ACTIVE_BARBERS} active barbers reached. Please archive an existing barber first.`);
      return;
    }

    try {
      setLoading(true);

      // Unarchive user (set archived to false)
      const { error } = await supabase
        .from('users')
        .update({ archived: false })
        .eq('id', barberToUnarchive.id);

      if (error) throw error;

      // Update local state - remove from archived list
      setBarbers(prev => prev.filter(barber => barber.id !== barberToUnarchive.id));

      // Close modal and reset state
      setShowUnarchiveModal(false);
      setBarberToUnarchive(null);

      // Switch to active view to show the unarchived barber
      setViewFilter('active');

    } catch (error) {
      console.error('Error unarchiving barber:', error);
      setError('Failed to unarchive barber. Please try again.');
      setShowUnarchiveModal(false);
      setBarberToUnarchive(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUnarchiveCancel = () => {
    setShowUnarchiveModal(false);
    setBarberToUnarchive(null);
    setCanUnarchive(true);
  };

  const handleDeleteClick = (barber) => {
    setBarberToDelete(barber);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!barberToDelete) return;

    try {
      setLoading(true);
      setError(null);

      // Attempt to delete from the public users table
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', barberToDelete.id);

      if (error) {
        // Check if it's a foreign key constraint error
        if (error.code === '23503') {
          throw new Error('Cannot delete barber: They have associated records (appointments, logs, etc.). Please archive them instead.');
        }
        throw error;
      }

      // Update local state
      setBarbers(prev => prev.filter(b => b.id !== barberToDelete.id));
      setShowDeleteModal(false);
      setBarberToDelete(null);

      setSuccessMessage('Barber deleted successfully from the database.');
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Error deleting barber:', error);
      setError(error.message || 'Failed to delete barber. They might have related records in other tables.');
      setShowDeleteModal(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    // Check if limit is reached before opening modal
    if (barbers.length >= MAX_ACTIVE_BARBERS) {
      setError(`Maximum limit of ${MAX_ACTIVE_BARBERS} active barbers reached. Please archive an existing barber before adding a new one.`);
      return;
    }

    setFormData({
      full_name: '',
      email: '',
      phone: '',
      password: '',
      role: 'barber',
      skills: '',
      profile_picture_url: ''
    });
    setIsEditing(false);
    setSelectedBarber(null);
    setShowModal(true);
  };

  const resetFormAndCloseModal = () => {
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      password: '',
      role: 'barber',
      skills: '',
      profile_picture_url: ''
    });
    setFormErrors({});
    setIsEditing(false);
    setSelectedBarber(null);
    setShowModal(false);
  };

  const handleImageUpload = async (e) => {
    if (!selectedBarber) return;
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      setUploadingImage(true);
      setError(null);

      const fileExt = file.name.split('.').pop();
      const fileName = `${selectedBarber.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw new Error(uploadError.message);

      const { data: urlData } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, profile_picture_url: urlData.publicUrl }));
    } catch (error) {
      console.error('Error uploading image:', error);
      setError('Failed to upload image: ' + error.message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setFormData(prev => ({ ...prev, profile_picture_url: '' }));
  };

  const handleResetPassword = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSuccessMessage(`Password reset email sent to ${formData.email}.`);
      setShowSuccessModal(true);
    } catch (err) {
      console.error('Error sending reset email:', err);
      setError('Failed to send password reset email: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForcePasswordUpdate = async () => {
    if (!formData.new_password || formData.new_password.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.rpc('update_user_password', {
        target_user_id: selectedBarber.id,
        new_password: formData.new_password
      });

      if (error) {
        if (error.code === 'PGRST202' || error.message.includes('Could not find')) {
          throw new Error('Database function missing. Please run the required SQL snippet in your Supabase SQL Editor to enable direct password updates.');
        }
        throw error;
      }

      setSuccessMessage(`Password for ${formData.full_name} has been directly updated.`);
      setShowSuccessModal(true);
      setFormData(prev => ({ ...prev, new_password: '' }));
    } catch (err) {
      console.error('Error overriding password:', err);
      setError(err.message || 'Failed to override password.');
    } finally {
      setLoading(false);
    }
  };

  const filteredBarbers = barbers.filter(barber =>
    barber.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    barber.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (barber.phone && barber.phone.includes(searchQuery))
  );

  // Premium Minimalist Styles - Enhanced for Mobile
  const styles = {
    container: {
      padding: '1.5rem 1rem', // Reduced padding for mobile
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    },
    header: {
      display: 'flex',
      flexDirection: window.innerWidth < 576 ? 'column' : 'row', // Dynamic stacking
      justifyContent: 'space-between',
      alignItems: window.innerWidth < 576 ? 'flex-start' : 'center',
      marginBottom: '1.5rem',
      background: '#fff',
      padding: '1.25rem',
      borderRadius: '20px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      border: '1px solid #f0f0f0',
      gap: '1rem'
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: '800',
      color: '#1a1a1a',
      margin: 0,
      letterSpacing: '-0.5px'
    },
    subtitle: {
      color: '#888',
      fontSize: '0.85rem',
      marginTop: '0.2rem'
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '0.8rem 1.2rem',
      borderRadius: '14px',
      fontWeight: '600',
      fontSize: '0.9rem',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.6rem',
      width: window.innerWidth < 576 ? '100%' : 'auto' // Full width on mobile
    },
    tabList: {
      display: 'flex',
      gap: '0.75rem',
      marginBottom: '1.5rem',
      overflowX: 'auto', // Scrollable tabs on mobile
      paddingBottom: '5px',
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
    },
    tabItem: (active) => ({
      padding: '0.7rem 1.2rem',
      borderRadius: '14px',
      cursor: 'pointer',
      fontSize: '0.9rem',
      fontWeight: '600',
      whiteSpace: 'nowrap',
      transition: 'all 0.3s ease',
      backgroundColor: active ? '#5D4037' : '#fff',
      color: active ? '#fff' : '#666',
      border: active ? 'none' : '1px solid #eee',
      boxShadow: active ? '0 8px 15px rgba(93, 64, 55, 0.2)' : 'none',
      flex: window.innerWidth < 576 ? '1' : 'none',
      textAlign: 'center'
    }),
    searchWrapper: {
      position: 'relative',
      marginBottom: '1.5rem'
    },
    searchInput: {
      width: '100%',
      padding: '1.1rem 1.2rem 1.1rem 3.2rem',
      borderRadius: '18px',
      border: '1.5px solid #f0f0f0',
      backgroundColor: '#fff',
      fontSize: '1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
      outline: 'none',
      transition: 'all 0.3s ease'
    },
    barberGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(100%, 1fr))', // Default to 1 column for mobile
      gap: '1.25rem'
    },
    barberCard: {
      backgroundColor: '#fff',
      borderRadius: '24px',
      padding: '1.25rem',
      boxShadow: '0 8px 25px rgba(0,0,0,0.03)',
      border: '1px solid #f0f0f0',
      transition: 'all 0.3s ease',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    },
    avatar: {
      width: '72px',
      height: '72px',
      borderRadius: '20px',
      objectFit: 'cover',
    },
    avatarPlaceholder: {
      width: '72px',
      height: '72px',
      borderRadius: '20px',
      backgroundColor: '#5D4037',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '1.8rem',
      fontWeight: '700',
    },
    statBox: {
      backgroundColor: '#fbfbfb',
      padding: '0.85rem 0.5rem',
      borderRadius: '16px',
      textAlign: 'center',
      border: '1px solid #f5f5f5'
    },
    modal: {
      backgroundColor: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(8px)',
      padding: '0'
    },
    modalContent: {
      borderRadius: window.innerWidth < 576 ? '24px 24px 0 0' : '24px',
      border: 'none',
      marginTop: window.innerWidth < 576 ? 'auto' : '0',
      boxShadow: '0 -10px 40px rgba(0,0,0,0.2)'
    }
  };

  // State to handle resize for dynamic styles
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading && !barbers.length) {
    return <LoadingSpinner />;
  }

  return (
    <div style={styles.container}>
      {/* Premium Header - Responsive Stack */}
      <div style={{...styles.header, flexDirection: windowWidth < 600 ? 'column' : 'row', alignItems: windowWidth < 600 ? 'stretch' : 'center'}}>
        <div>
          <h2 style={styles.title}>Manage Barbers</h2>
          <div style={styles.subtitle}>
            {viewFilter === 'active' ? (
              <>
                Team Strength: <strong>{barbers.length} / {MAX_ACTIVE_BARBERS}</strong>
              </>
            ) : (
              `Archived: ${barbers.length}`
            )}
          </div>
        </div>
        {viewFilter === 'active' && (
          <button
            style={{
              ...styles.primaryBtn,
              opacity: barbers.length >= MAX_ACTIVE_BARBERS ? 0.6 : 1,
              width: windowWidth < 600 ? '100%' : 'auto'
            }}
            onClick={handleAddNew}
            disabled={barbers.length >= MAX_ACTIVE_BARBERS}
          >
            <i className="bi bi-plus-lg"></i>
            Add Professional Barber
          </button>
        )}
      </div>

      {/* Modern Scrollable Tabs */}
      <div style={styles.tabList} className="no-scrollbar">
        <div
          style={styles.tabItem(viewFilter === 'active')}
          onClick={() => setViewFilter('active')}
        >
          <i className="bi bi-person-check-fill me-2"></i>
          Active Team
        </div>
        <div
          style={styles.tabItem(viewFilter === 'archived')}
          onClick={() => setViewFilter('archived')}
        >
          <i className="bi bi-archive-fill me-2"></i>
          Archive
        </div>
      </div>

      {error && (
        <div className="alert-mobile-custom mb-3 shake" style={{
          backgroundColor: '#fff',
          borderLeft: '4px solid #d32f2f',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
          borderRadius: '16px',
          padding: '1rem',
          color: '#333'
        }}>
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <i className="bi bi-exclamation-circle-fill text-danger me-2"></i>
              <span className="small fw-bold">{error}</span>
            </div>
            <button type="button" className="btn-close" style={{fontSize: '0.7rem'}} onClick={() => setError(null)}></button>
          </div>
          {error.includes('archive') && barberToDelete && (
            <button
              className="btn btn-sm btn-dark w-100 mt-2 rounded-pill"
              onClick={() => {
                setBarberToArchive(barberToDelete);
                setShowArchiveModal(true);
                setError(null);
              }}
            >
              Archive Instead
            </button>
          )}
        </div>
      )}

      {/* Styled Search Bar */}
      <div style={styles.searchWrapper}>
        <i className="bi bi-search" style={{
          position: 'absolute',
          left: '1.25rem',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#bbb',
          fontSize: '1.1rem'
        }}></i>
        <input
          type="text"
          style={styles.searchInput}
          placeholder="Lookup professional..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <div
            style={{
              position: 'absolute',
              right: '1.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#999',
              cursor: 'pointer',
              padding: '5px'
            }}
            onClick={() => setSearchQuery('')}
          >
            <i className="bi bi-x-circle-fill"></i>
          </div>
        )}
      </div>

      {/* Barber Card Grid - Tablet/Desktop 2-3 cols, Mobile 1 col */}
      <div className="mobile-grid">
        {filteredBarbers.length === 0 ? (
          <div className="text-center py-5 w-100 border rounded-4 bg-white">
            <i className="bi bi-person-slash text-muted" style={{fontSize: '3rem'}}></i>
            <h6 className="mt-3 text-muted fw-bold">No results match your search</h6>
          </div>
        ) : (
          filteredBarbers.map(barber => (
            <div key={barber.id} style={styles.barberCard} className="barber-card-mobile h-100">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <div onClick={() => setExpandedProfileBarber(barber)} className="avatar-touch-target">
                  {barber.profile_picture_url ? (
                    <img src={barber.profile_picture_url} alt={barber.full_name} style={styles.avatar} />
                  ) : (
                    <div style={styles.avatarPlaceholder}>
                      {barber.full_name?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {viewFilter === 'archived' && (
                    <div className="position-absolute translate-middle-y mt-2">
                       <span className="badge bg-warning text-dark rounded-pill px-2" style={{fontSize: '0.6rem'}}>ARCHIVED</span>
                    </div>
                  )}
                </div>
                <div className="dropdown">
                  <button 
                    className="btn btn-light rounded-circle p-0 touch-btn" 
                    style={{width: '40px', height: '40px'}}
                    data-bs-toggle="dropdown"
                  >
                    <i className="bi bi-three-dots fs-5"></i>
                  </button>
                  <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 p-2 fade-in" style={{ borderRadius: '18px' }}>
                    {viewFilter === 'active' ? (
                      <>
                        <li><button className="dropdown-item rounded-3 py-2" onClick={() => handleEdit(barber)}><i className="bi bi-pencil-square me-2"></i>Edit Profile</button></li>
                        <li><button className="dropdown-item rounded-3 py-2 text-warning" onClick={() => handleArchiveClick(barber)}><i className="bi bi-archive-fill me-2"></i>Archive</button></li>
                      </>
                    ) : (
                      <li><button className="dropdown-item rounded-3 py-2 text-success" onClick={() => handleUnarchiveClick(barber)}><i className="bi bi-arrow-up-circle-fill me-2"></i>Restore</button></li>
                    )}
                    <li><hr className="dropdown-divider opacity-50" /></li>
                    <li><button className="dropdown-item rounded-3 py-2 text-danger" onClick={() => handleDeleteClick(barber)}><i className="bi bi-trash3-fill me-2"></i>Delete Forever</button></li>
                  </ul>
                </div>
              </div>

              <div className="flex-grow-1">
                <h5 className="fw-bold mb-1 text-dark">{barber.full_name}</h5>
                <p className="text-muted mb-3 d-flex align-items-center" style={{fontSize: '0.85rem'}}>
                  <i className="bi bi-envelope-at me-2 text-secondary"></i> {barber.email}
                </p>

                <div className="mb-4">
                  <div className="d-flex flex-wrap gap-1">
                    {barber.skills ? (
                      barber.skills.split(',').map((skill, i) => (
                        <span key={i} className="skill-badge">{skill.trim()}</span>
                      ))
                    ) : (
                      <span className="text-muted small italic opacity-50">General Professional</span>
                    )}
                  </div>
                </div>
              </div>

              {barberStats[barber.id] && (
                <div className="row g-2 mt-auto">
                  <div className="col-6">
                    <div style={styles.statBox}>
                      <div className="fw-bold text-dark">{barberStats[barber.id].completed}</div>
                      <div className="stat-label">Done</div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div style={styles.statBox}>
                      <div className="fw-bold text-dark">{barberStats[barber.id].upcoming}</div>
                      <div className="stat-label">Next</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Responsive Form Modal */}
      {showModal && (
        <div className="modal fade show d-block" style={styles.modal}>
          <div className={`modal-dialog modal-dialog-centered ${windowWidth < 576 ? 'm-0 h-100' : ''}`}>
            <div className="modal-content border-0 h-sm-100" style={styles.modalContent}>
              <div className="modal-header border-0 p-4 pb-0">
                <div className="w-100">
                   {windowWidth < 576 && <div className="modal-drag-indicator mb-3 mx-auto"></div>}
                   <h5 className="fw-bold m-0">{isEditing ? 'Update Professional' : 'New Specialist'}</h5>
                </div>
                <button type="button" className="btn-close" onClick={resetFormAndCloseModal}></button>
              </div>
              <div className="modal-body p-4 scroll-mobile-modal" style={{maxHeight: windowWidth < 576 ? '80vh' : 'auto', overflowY: 'auto'}}>
                <form onSubmit={handleSubmit}>
                  {isEditing && (
                    <div className="text-center mb-4">
                      <div className="position-relative d-inline-block">
                        {formData.profile_picture_url ? (
                          <img src={formData.profile_picture_url} alt="Profile" className="rounded-4 border-3 border-dark shadow" style={{ width: '90px', height: '90px', objectFit: 'cover' }} />
                        ) : (
                          <div className="rounded-4 bg-light d-flex align-items-center justify-content-center border" style={{ width: '90px', height: '90px' }}>
                            <i className="bi bi-person-plus-fill fs-1 text-muted"></i>
                          </div>
                        )}
                        <label className="position-absolute bottom-0 end-0 bg-dark text-white rounded-circle d-flex align-items-center justify-content-center shadow-lg" style={{ width: '32px', height: '32px', cursor: 'pointer', border: '2px solid #fff' }}>
                          <i className="bi bi-camera-fill" style={{fontSize: '0.8rem'}}></i>
                          <input type="file" className="d-none" onChange={handleImageUpload} />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="form-floating mb-3">
                    <input
                      type="text"
                      className="form-control premium-input"
                      id="full_name"
                      placeholder="John Doe"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      required
                    />
                    <label htmlFor="full_name">Full Name</label>
                  </div>

                  <div className="form-floating mb-3">
                    <input
                      type="email"
                      className="form-control premium-input"
                      id="email"
                      placeholder="name@example.com"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={isEditing}
                      required
                    />
                    <label htmlFor="email">Email Address</label>
                  </div>

                  {!isEditing && (
                    <div className="form-floating mb-3">
                      <input
                        type="password"
                        className="form-control premium-input"
                        id="password"
                        placeholder="Password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        minLength={6}
                      />
                      <label htmlFor="password">Initial Password</label>
                    </div>
                  )}

                  <div className="mb-3">
                    <label className="small fw-bold text-uppercase text-muted mb-2 px-2">Phone Number</label>
                    <div className="position-relative">
                      <div className="position-absolute h-100 d-flex align-items-center px-3" style={{zIndex: 10}}>
                        <img src="https://www.flagcolorcodes.com/data/flag-of-the-philippines.png" alt="PH" style={{ width: '22px', borderRadius: '2px' }} />
                      </div>
                      <input
                        type="tel"
                        className="form-control premium-input"
                        style={{ paddingLeft: '3.5rem' }}
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="9xx xxx xxxx"
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="small fw-bold text-uppercase text-muted mb-2 px-2">Expertise</label>
                    <input
                      type="text"
                      className="form-control premium-input"
                      name="skills"
                      value={formData.skills}
                      onChange={handleChange}
                      placeholder="e.g. Fades, Grooming, Styling"
                    />
                  </div>

                  {isEditing && (
                    <div className="admin-zone p-3 mb-4 rounded-4">
                      <div className="small fw-bold text-danger mb-2 d-flex align-items-center">
                        <i className="bi bi-shield-lock-fill me-2"></i>
                        ADMIN SECURITY OVERRIDE
                      </div>
                      <div className="input-group">
                        <input
                          type="password"
                          className="form-control border-0 bg-white"
                          placeholder="New Strength Password"
                          name="new_password"
                          value={formData.new_password}
                          onChange={handleChange}
                        />
                        <button className="btn btn-danger px-3" type="button" onClick={handleForcePasswordUpdate}>
                          RESET
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="d-grid gap-2 mb-2">
                    <button type="submit" className="btn btn-dark btn-lg py-3 rounded-4 fw-bold shadow-dark" disabled={loading}>
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          SAVING DATA...
                        </>
                      ) : isEditing ? 'UPDATE PROFESSIONAL' : 'LAUNCH ACCOUNT'}
                    </button>
                    <button type="button" className="btn btn-link text-muted py-2" onClick={resetFormAndCloseModal}>Dismiss Changes</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Styled Interaction Modals */}
      {showArchiveModal && (
        <div className="modal fade show d-block" style={styles.modal}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 card-shadow-lg" style={{borderRadius: '28px'}}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{width: '64px', height: '64px', backgroundColor: '#fff3e0', borderRadius: '20px'}}>
                   <i className="bi bi-archive-fill text-warning fs-2"></i>
                </div>
                <h5 className="fw-800">Archive Team Member?</h5>
                <p className="small text-muted mb-4 px-2">Profile will be moved to the archive. You can restore them anytime.</p>
                <div className="d-grid gap-2">
                  <button className="btn btn-warning py-3 rounded-pill fw-bold" onClick={handleArchiveConfirm}>Archive Now</button>
                  <button className="btn btn-link text-muted" onClick={() => setShowArchiveModal(false)}>Keep Active</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUnarchiveModal && (
        <div className="modal fade show d-block" style={styles.modal}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 card-shadow-lg" style={{borderRadius: '28px'}}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{width: '64px', height: '64px', backgroundColor: '#e8f5e9', borderRadius: '20px'}}>
                   <i className="bi bi-arrow-up-circle-fill text-success fs-2"></i>
                </div>
                <h5 className="fw-800">Restore Specialist?</h5>
                <p className="small text-muted mb-4 px-2">Move this specialist back to the active team roster?</p>
                <div className="d-grid gap-2">
                  <button className="btn btn-success py-3 rounded-pill fw-bold" onClick={handleUnarchiveConfirm}>Restore to Team</button>
                  <button className="btn btn-link text-muted" onClick={() => setShowUnarchiveModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal fade show d-block" style={styles.modal}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 card-shadow-lg" style={{borderRadius: '28px'}}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{width: '64px', height: '64px', backgroundColor: '#ffebee', borderRadius: '20px'}}>
                   <i className="bi bi-trash3-fill text-danger fs-2"></i>
                </div>
                <h5 className="fw-800 text-danger">Purge Record?</h5>
                <p className="small text-muted mb-4 px-2 italic">This is permanent. We recommend Archiving instead.</p>
                <div className="d-grid gap-2">
                  <button className="btn btn-danger py-3 rounded-pill fw-bold" onClick={handleDeleteConfirm}>Delete Forever</button>
                  <button className="btn btn-link text-muted" onClick={() => setShowDeleteModal(false)}>Go Back</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="modal fade show d-block" style={styles.modal}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 card-shadow-lg" style={{borderRadius: '28px'}}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{width: '64px', height: '64px', backgroundColor: '#e8f5e9', borderRadius: '20px'}}>
                   <i className="bi bi-check-all text-success fs-1"></i>
                </div>
                <h5 className="fw-800">Account Ready!</h5>
                <p className="small text-muted">{successMessage}</p>
                <button className="btn btn-dark w-100 mt-3 py-3 rounded-pill fw-bold" onClick={() => setShowSuccessModal(false)}>Excellent</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modern Expanded View - Full Screen for Mobile */}
      {expandedProfileBarber && (
        <div className="modal fade show d-block" style={styles.modal} onClick={() => setExpandedProfileBarber(null)}>
          <div className={`modal-dialog ${windowWidth < 576 ? 'modal-fullscreen' : 'modal-dialog-centered'}`} onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 overflow-hidden" style={{ borderRadius: windowWidth < 576 ? '0' : '32px' }}>
              <div className="position-relative">
                {expandedProfileBarber.profile_picture_url ? (
                  <img src={expandedProfileBarber.profile_picture_url} alt="" style={{ width: '100%', height: windowWidth < 576 ? '60vh' : '450px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ height: windowWidth < 576 ? '50vh' : '350px', backgroundColor: '#5D4037', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12rem', color: '#fff', fontWeight: '800' }}>
                    {expandedProfileBarber.full_name?.charAt(0)}
                  </div>
                )}
                <div className="position-absolute top-0 start-0 w-100 p-3 d-flex justify-content-between">
                  <button onClick={() => setExpandedProfileBarber(null)} className="btn btn-blur rounded-circle p-0" style={{ width: '44px', height: '44px' }}>
                    <i className="bi bi-arrow-left fs-4"></i>
                  </button>
                </div>
              </div>
              <div className="p-4 bg-white" style={{marginTop: '-40px', borderRadius: '40px 40px 0 0', position: 'relative', zIndex: 10, minHeight: '40vh'}}>
                <div className="d-flex justify-content-between align-items-center">
                   <h2 className="fw-800 mb-0">{expandedProfileBarber.full_name}</h2>
                   <span className="badge bg-light text-dark shadow-sm py-2 px-3 rounded-pill fw-800" style={{fontSize: '1rem'}}>
                      <i className="bi bi-star-fill text-warning me-1"></i> NEW
                   </span>
                </div>
                <p className="text-secondary mt-2 mb-4 d-flex align-items-center">
                   <i className="bi bi-shield-check-fill text-dark me-2"></i> Verified Professional Team Member
                </p>
                
                <h6 className="fw-800 text-uppercase small text-dark opacity-50 letter-spacing-1 mb-3">Specializations</h6>
                <div className="d-flex flex-wrap gap-2 mb-5">
                  {expandedProfileBarber.skills ? (
                    expandedProfileBarber.skills.split(',').map((s, i) => (
                      <span key={i} className="skill-pill">{s.trim()}</span>
                    ))
                  ) : <span className="skill-pill">Full Service Styling</span>}
                </div>
                
                <div className="d-grid">
                   <button className="btn btn-dark py-3 rounded-4 fw-bold" onClick={() => setExpandedProfileBarber(null)}>Close Profile View</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Responsive Overrides */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        @media (min-width: 768px) {
          .mobile-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1.5rem;
          }
        }
        
        @media (min-width: 1200px) {
          .mobile-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        .barber-card-mobile {
          transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        
        .barber-card-mobile:active {
          transform: scale(0.98);
        }

        .skill-badge {
          font-size: 0.65rem;
          padding: 0.35rem 0.75rem;
          border-radius: 10px;
          background-color: #f3f3f3;
          color: #333;
          font-weight: 700;
          text-transform: uppercase;
          border: 1px solid #eee;
        }

        .skill-pill {
          background: #000;
          color: #fff;
          padding: 0.6rem 1.4rem;
          border-radius: 16px;
          font-weight: 600;
          font-size: 0.85rem;
          box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }

        .stat-label {
          font-size: 0.6rem;
          font-weight: 800;
          text-transform: uppercase;
          color: #bdbdbd;
          letter-spacing: 0.5px;
          margin-top: 2px;
        }

        .touch-btn {
          transition: all 0.2s ease;
          border: none !important;
          background: #f8f9fa !important;
        }

        .touch-btn:active {
          background: #eee !important;
          transform: scale(0.9);
        }

        .premium-input {
          border-radius: 16px !important;
          border: 1.5px solid #eee !important;
          background-color: #fafafa !important;
          padding-top: 1.625rem !important;
          padding-bottom: 0.625rem !important;
        }

        .premium-input:focus {
          border-color: #000 !important;
          box-shadow: 0 0 0 4px rgba(0,0,0,0.05) !important;
          background-color: #fff !important;
        }

        .modal-drag-indicator {
          width: 40px;
          height: 5px;
          background: #ddd;
          border-radius: 10px;
        }

        .admin-zone {
          background: #fff5f5;
          border: 1px dashed #feb2b2;
        }

        .btn-blur {
          background: rgba(255,255,255,0.7);
          backdrop-filter: blur(10px);
          border: none;
          color: #000;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }

        .fw-800 { font-weight: 800; }
        .letter-spacing-1 { letter-spacing: 1px; }
        .shadow-dark { boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }
        
        .fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Mobile Slide Up Animation for Modals */
        @media (max-width: 575.98px) {
          .modal.show .modal-dialog {
            transform: translateY(0);
          }
          .modal .modal-dialog {
            transform: translateY(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: flex-end;
            margin: 0;
            height: 100%;
          }
          .modal-content {
            border-radius: 30px 30px 0 0 !important;
            max-height: 92%;
          }
        }

        .avatar-touch-target {
          cursor: pointer;
          position: relative;
          transition: transform 0.2s ease;
        }
        
        .avatar-touch-target:active {
          transform: scale(0.95);
        }

        @keyframes shake {
          0%, 100% {transform: translateX(0);}
          10%, 30%, 50%, 70%, 90% {transform: translateX(-5px);}
          20%, 40%, 60%, 80% {transform: translateX(5px);}
        }
      `}</style>
    </div>
  );
};

export default ManageBarbers;