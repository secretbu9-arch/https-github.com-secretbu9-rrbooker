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
    if (!formData.full_name.trim()) {
      errors.full_name = 'Name is required';
    }

    if (!formData.email.trim()) {
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
      full_name: barber.full_name,
      email: barber.email,
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

  if (loading && !barbers.length) {
    return <LoadingSpinner />;
  }

  const activeBarbersCount = barbers.length;
  const canAddNewBarber = activeBarbersCount < MAX_ACTIVE_BARBERS && viewFilter === 'active';

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 p-3 rounded shadow-sm" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' }}>
        <div>
          <h2 className="mb-0 fw-bold">Manage Barbers</h2>
          {viewFilter === 'active' && (
            <p className="text-muted mb-0">
              Active Barbers: <strong>{activeBarbersCount} / {MAX_ACTIVE_BARBERS}</strong>
              {!canAddNewBarber && activeBarbersCount >= MAX_ACTIVE_BARBERS && (
                <span className="text-danger ms-2">
                  <i className="bi bi-exclamation-triangle me-1"></i>
                  Limit reached
                </span>
              )}
            </p>
          )}
          {viewFilter === 'archived' && (
            <p className="text-muted mb-0">
              Archived Barbers: <strong>{activeBarbersCount}</strong>
            </p>
          )}
        </div>
        {viewFilter === 'active' && (
          <button
            className={`btn ${canAddNewBarber ? 'btn-primary' : 'btn-secondary'}`}
            onClick={handleAddNew}
            disabled={!canAddNewBarber}
            title={!canAddNewBarber ? `Maximum of ${MAX_ACTIVE_BARBERS} active barbers allowed` : ''}
          >
            <i className="bi bi-person-plus me-2"></i>
            Add New Barber
          </button>
        )}
      </div>

      {/* View Filter Tabs */}
      <ul className="nav nav-tabs mb-4" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            className={`nav-link ${viewFilter === 'active' ? 'active' : ''}`}
            onClick={() => setViewFilter('active')}
            type="button"
          >
            <i className="bi bi-people me-2"></i>
            Active Barbers
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={`nav-link ${viewFilter === 'archived' ? 'active' : ''}`}
            onClick={() => setViewFilter('archived')}
            type="button"
          >
            <i className="bi bi-archive me-2"></i>
            Archived Barbers
          </button>
        </li>
      </ul>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show shadow-sm" role="alert">
          <div className="d-flex align-items-center justify-content-between">
            <div>
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              {error}
            </div>
            {error.includes('archive them instead') && barberToDelete && (
              <button
                className="btn btn-sm btn-outline-danger ms-3 fw-bold"
                onClick={() => {
                  setBarberToArchive(barberToDelete);
                  setShowArchiveModal(true);
                  setError(null);
                }}
              >
                Archive this Barber Instead
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setError(null)}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Search Bar */}
      <div className="input-group mb-4">
        <span className="input-group-text">
          <i className="bi bi-search"></i>
        </span>
        <input
          type="text"
          className="form-control"
          placeholder="Search barbers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="btn btn-outline-secondary"
            type="button"
            onClick={() => setSearchQuery('')}
          >
            <i className="bi bi-x"></i>
          </button>
        )}
      </div>

      {/* Barbers List */}
      <div className="row">
        {filteredBarbers.length === 0 ? (
          <div className="col-12">
            <div className="card">
              <div className="card-body text-center py-5">
                <div className="text-muted mb-3">
                  <i className="bi bi-people fs-1"></i>
                </div>
                <p>
                  {searchQuery
                    ? "No barbers found matching your search."
                    : viewFilter === 'active'
                      ? "No active barbers found. Click 'Add New Barber' to create one."
                      : "No archived barbers found."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          filteredBarbers.map(barber => (
            <div key={barber.id} className="col-md-6 col-lg-4 mb-4">
              <div className={`card h-100 ${viewFilter === 'archived' ? 'border-warning' : ''}`}>
                <div className="card-header d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center">
                    <div
                      className="d-flex align-items-center justify-content-center flex-shrink-0 me-3"
                      style={{ cursor: 'pointer', zIndex: 2 }}
                      onClick={(e) => { e.stopPropagation(); setExpandedProfileBarber(barber); }}
                    >
                      {barber.profile_picture_url ? (
                        <img src={barber.profile_picture_url} alt={barber.full_name} style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                      ) : (
                        <div className="bg-primary text-white d-flex align-items-center justify-content-center" style={{ width: '42px', height: '42px', borderRadius: '50%', fontSize: '1.2rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)', boxShadow: '0 2px 4px rgba(13,110,253,0.2)' }}>
                          {barber.full_name ? barber.full_name.charAt(0).toUpperCase() : <i className="bi bi-person"></i>}
                        </div>
                      )}
                    </div>
                    <h5 className="card-title mb-0 me-2">{barber.full_name}</h5>
                    {viewFilter === 'archived' && (
                      <span className="badge bg-warning text-dark">
                        <i className="bi bi-archive me-1"></i>
                        Archived
                      </span>
                    )}
                  </div>
                  <div className="dropdown">
                    <button className="btn btn-sm btn-outline-secondary" type="button" id={`dropdown-${barber.id}`} data-bs-toggle="dropdown" aria-expanded="false">
                      <i className="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end" aria-labelledby={`dropdown-${barber.id}`}>
                      {viewFilter === 'active' && (
                        <>
                          <li>
                            <button className="dropdown-item" onClick={() => handleEdit(barber)}>
                              <i className="bi bi-pencil me-2"></i>Edit
                            </button>
                          </li>
                          <li>
                            <button className="dropdown-item text-warning" onClick={() => handleArchiveClick(barber)}>
                              <i className="bi bi-archive me-2"></i>Archive
                            </button>
                          </li>
                        </>
                      )}
                      {viewFilter === 'archived' && (
                        <li>
                          <button className="dropdown-item text-success" onClick={() => handleUnarchiveClick(barber)}>
                            <i className="bi bi-arrow-counterclockwise me-2"></i>Unarchive
                          </button>
                        </li>
                      )}
                      <li><hr className="dropdown-divider" /></li>
                      <li>
                        <button className="dropdown-item text-danger" onClick={() => handleDeleteClick(barber)}>
                          <i className="bi bi-trash me-2"></i>Delete Permanently
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="card-body">
                  <div className="mb-3">
                    <div className="d-flex align-items-center mb-2">
                      <i className="bi bi-envelope text-muted me-2"></i>
                      <span>{barber.email}</span>
                    </div>
                    {barber.phone && (
                      <div className="d-flex align-items-center mb-2">
                        <i className="bi bi-telephone text-muted me-2"></i>
                        <span>{barber.phone}</span>
                      </div>
                    )}
                    {barber.skills && (
                      <div className="d-flex align-items-center">
                        <i className="bi bi-award text-muted me-2"></i>
                        <div>
                          {barber.skills.split(',').map((skill, index) => (
                            <span key={index} className="badge bg-primary me-1 mb-1">
                              {skill.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Barber Stats */}
                  {barberStats[barber.id] && (
                    <div className="row text-center g-2 mt-3">
                      <div className="col-6">
                        <div className="bg-success bg-opacity-10 rounded p-2">
                          <h6 className="mb-0">{barberStats[barber.id].completed}</h6>
                          <small className="text-muted">Completed</small>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="bg-primary bg-opacity-10 rounded p-2">
                          <h6 className="mb-0">{barberStats[barber.id].upcoming}</h6>
                          <small className="text-muted">Upcoming</small>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="card-footer text-muted">
                  <small>Joined: {formatDate(barber.created_at)}</small>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {isEditing ? 'Edit Barber' : 'Add New Barber'}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={resetFormAndCloseModal}
                ></button>
              </div>
              <div className="modal-body">
                {!isEditing && !canAddNewBarber && (
                  <div className="alert alert-warning mb-3" role="alert">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    <strong>Limit Reached:</strong> You have reached the maximum limit of {MAX_ACTIVE_BARBERS} active barbers.
                    Please archive an existing barber before adding a new one.
                  </div>
                )}
                <form onSubmit={handleSubmit}>
                  {isEditing && (
                    <div className="mb-4 d-flex flex-column align-items-center">
                      <div className="position-relative mb-3">
                        {formData.profile_picture_url ? (
                          <img
                            src={formData.profile_picture_url}
                            alt="Profile"
                            className="rounded-circle border border-3 border-primary shadow-sm"
                            style={{ width: '120px', height: '120px', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            className="rounded-circle border border-3 border-secondary d-flex align-items-center justify-content-center shadow-sm"
                            style={{ width: '120px', height: '120px', backgroundColor: '#f8f9fa' }}
                          >
                            <i className="bi bi-person-fill text-secondary" style={{ fontSize: '3.5rem' }}></i>
                          </div>
                        )}
                        {uploadingImage && (
                          <div className="position-absolute top-0 start-0 w-100 h-100 rounded-circle d-flex align-items-center justify-content-center bg-dark bg-opacity-50">
                            <span className="spinner-border text-white" role="status"></span>
                          </div>
                        )}
                      </div>
                      <div className="d-flex gap-2">
                        <label className={`btn btn-primary btn-sm rounded-pill px-3 shadow-sm ${uploadingImage ? 'disabled' : ''}`} style={{ cursor: uploadingImage ? 'default' : 'pointer' }}>
                          <i className="bi bi-camera me-1"></i>
                          {formData.profile_picture_url ? 'Change' : 'Upload'} Picture
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            style={{ display: 'none' }}
                            disabled={uploadingImage}
                          />
                        </label>
                        {formData.profile_picture_url && (
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm rounded-pill px-3 shadow-sm"
                            onClick={handleRemoveImage}
                            disabled={uploadingImage}
                          >
                            <i className="bi bi-trash me-1"></i>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="full_name" className="form-label">Full Name</label>
                    <input
                      type="text"
                      className={`form-control ${formErrors.full_name ? 'is-invalid' : ''}`}
                      id="full_name"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      required
                    />
                    {formErrors.full_name && (
                      <div className="invalid-feedback">{formErrors.full_name}</div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label htmlFor="email" className="form-label">Email</label>
                    <input
                      type="email"
                      className={`form-control ${formErrors.email ? 'is-invalid' : ''}`}
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      disabled={isEditing} // Cannot change email for existing users
                    />
                    {formErrors.email && (
                      <div className="invalid-feedback">{formErrors.email}</div>
                    )}
                    {isEditing && (
                      <div className="form-text d-flex justify-content-between align-items-center mt-2">
                        <span>Email cannot be changed for existing users.</span>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-warning"
                          onClick={handleResetPassword}
                          disabled={loading}
                        >
                          <i className="bi bi-envelope me-1"></i> Send Password Reset
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <div className="mb-3 p-3 bg-light rounded border">
                      <label htmlFor="new_password" className="form-label text-danger fw-bold">
                        <i className="bi bi-shield-lock me-1"></i> Override Password Directly
                      </label>
                      <div className="input-group">
                        <input
                          type="password"
                          className="form-control border-danger border-opacity-50"
                          id="new_password"
                          name="new_password"
                          value={formData.new_password}
                          onChange={handleChange}
                          placeholder="Force a new password (min. 6 characters)"
                          minLength={6}
                        />
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={handleForcePasswordUpdate}
                          disabled={loading || !formData.new_password || formData.new_password.length < 6}
                        >
                          Override Now
                        </button>
                      </div>
                      <small className="form-text text-muted">
                        Use this if the barber has a dummy email (like janedoe@example.com) and cannot receive the reset email.
                      </small>
                    </div>
                  )}

                  <div className="mb-3">
                    <label htmlFor="phone" className="form-label">Phone (optional)</label>
                    <div style={{ position: 'relative' }}>
                      <img
                        src="https://www.flagcolorcodes.com/data/flag-of-the-philippines.png"
                        alt="Philippines"
                        style={{
                          position: 'absolute',
                          left: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '20px',
                          height: '15px',
                          zIndex: 10,
                          pointerEvents: 'none',
                          objectFit: 'cover'
                        }}
                      />
                      <input
                        type="tel"
                        className={`form-control ${formErrors.phone ? 'is-invalid' : ''}`}
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+63XXXXXXXXXX"
                        maxLength={13}
                        style={{ paddingLeft: '45px' }}
                      />
                    </div>
                    <small className="form-text text-muted">Format: +63 followed by 10 digits</small>
                    {formErrors.phone && (
                      <div className="invalid-feedback">{formErrors.phone}</div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label htmlFor="skills" className="form-label">Skills (optional)</label>
                    <input
                      type="text"
                      className={`form-control ${formErrors.skills ? 'is-invalid' : ''}`}
                      id="skills"
                      name="skills"
                      value={formData.skills}
                      onChange={handleChange}
                      placeholder="e.g., Haircut, Beard Trim, Styling"
                    />
                    {formErrors.skills && (
                      <div className="invalid-feedback">{formErrors.skills}</div>
                    )}
                    <div className="form-text">Enter specializations separated by commas</div>
                  </div>

                  {!isEditing && (
                    <div className="mb-3">
                      <label htmlFor="password" className="form-label">Password</label>
                      <input
                        type="password"
                        className={`form-control ${formErrors.password ? 'is-invalid' : ''}`}
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        required={!isEditing}
                        minLength={6}
                      />
                      {formErrors.password && (
                        <div className="invalid-feedback">{formErrors.password}</div>
                      )}
                      <div className="form-text">Password must be at least 6 characters long.</div>
                    </div>
                  )}

                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={resetFormAndCloseModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={loading || (!isEditing && !canAddNewBarber)}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Saving...
                        </>
                      ) : (
                        'Save Barber'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveModal && barberToArchive && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-0">
                <h5 className="modal-title d-flex align-items-center">
                  <i className="bi bi-exclamation-triangle-fill text-warning me-2"></i>
                  Archive Barber
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={handleArchiveCancel}
                  disabled={loading}
                ></button>
              </div>
              <div className="modal-body">
                <p>
                  Are you sure you want to archive <strong>{barberToArchive.full_name}</strong>?
                </p>
                <p className="text-muted mb-0">
                  The barber will no longer appear in the active barbers list. You can view and unarchive them from the Archived Barbers tab.
                </p>
              </div>
              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleArchiveCancel}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-warning"
                  onClick={handleArchiveConfirm}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Archiving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-archive me-2"></i>
                      Archive Barber
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unarchive Confirmation Modal */}
      {showUnarchiveModal && barberToUnarchive && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header border-0">
                <h5 className="modal-title d-flex align-items-center">
                  <i className="bi bi-check-circle-fill text-success me-2"></i>
                  Unarchive Barber
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={handleUnarchiveCancel}
                  disabled={loading}
                ></button>
              </div>
              <div className="modal-body">
                <p>
                  Are you sure you want to unarchive <strong>{barberToUnarchive.full_name}</strong>?
                </p>
                {!canUnarchive && (
                  <div className="alert alert-warning mt-3 mb-0" role="alert">
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    <strong>Limit Reached:</strong> Maximum limit of {MAX_ACTIVE_BARBERS} active barbers reached.
                    Please archive an existing barber before unarchiving this one.
                  </div>
                )}
                {canUnarchive && (
                  <p className="text-muted mb-0">
                    The barber will be restored to the active barbers list and will be available for appointments again.
                  </p>
                )}
              </div>
              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleUnarchiveCancel}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleUnarchiveConfirm}
                  disabled={loading || !canUnarchive}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Unarchiving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-arrow-counterclockwise me-2"></i>
                      Unarchive Barber
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Success Modal */}
      {showSuccessModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-body text-center p-5">
                <div className="mb-4">
                  <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '4rem' }}></i>
                </div>
                <h3 className="fw-bold mb-3">User Registered!</h3>
                <p className="text-muted mb-4">{successMessage}</p>
                <button
                  className="btn btn-success px-5 py-2 rounded-pill fw-bold"
                  onClick={() => setShowSuccessModal(false)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">Delete Barber Permanently</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowDeleteModal(false)}
                ></button>
              </div>
              <div className="modal-body p-4">
                <div className="text-center mb-4">
                  <i className="bi bi-exclamation-octagon text-danger" style={{ fontSize: '3rem' }}></i>
                </div>
                <p className="text-center fw-bold">Warning: This action is irreversible.</p>
                <p>Are you sure you want to permanently delete <strong>{barberToDelete?.full_name}</strong> from the database?</p>
                <p className="small text-danger">
                  <i className="bi bi-info-circle me-1"></i>
                  Note: Deletion will fail if the barber has appointments or other related records. In that case, use <strong>Archive</strong> instead.
                </p>
              </div>
              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger px-4"
                  onClick={handleDeleteConfirm}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Profile Modal */}
      {expandedProfileBarber && (
        <div className="modal-backdrop fade show" style={{ zIndex: 1070 }} onClick={() => setExpandedProfileBarber(null)}></div>
      )}
      {expandedProfileBarber && (
        <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1071 }} onClick={() => setExpandedProfileBarber(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content border-0 overflow-hidden shadow-lg" style={{ borderRadius: '24px' }}>
              <div className="modal-header border-0 bg-transparent p-3 position-absolute top-0 w-100 z-3" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)' }}>
                <button type="button" className="btn-close btn-close-white ms-auto bg-dark bg-opacity-50 rounded-circle shadow-sm p-2" onClick={() => setExpandedProfileBarber(null)}></button>
              </div>
              <div className="modal-body p-0 text-center position-relative">
                {expandedProfileBarber.profile_picture_url ? (
                  <img
                    src={expandedProfileBarber.profile_picture_url}
                    alt={expandedProfileBarber.full_name}
                    className="img-fluid w-100"
                    style={{ minHeight: '300px', maxHeight: '450px', objectFit: 'cover' }}
                  />
                ) : (
                  <div className="bg-primary text-white d-flex flex-column align-items-center justify-content-center w-100" style={{ height: '350px', fontSize: '6rem', fontWeight: 'bold', background: 'linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%)' }}>
                    {expandedProfileBarber.full_name ? expandedProfileBarber.full_name.charAt(0).toUpperCase() : <i className="bi bi-person"></i>}
                  </div>
                )}
                <div className="bg-white p-4 text-start position-relative z-2" style={{ marginTop: '-20px', borderRadius: '24px 24px 0 0', boxShadow: '0 -10px 20px rgba(0,0,0,0.05)' }}>
                  <h4 className="fw-bold mb-1">{expandedProfileBarber.full_name}</h4>
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    <span className="badge bg-light text-dark shadow-sm py-2 px-3 fw-bold">
                      <i className="bi bi-star-fill text-warning me-1"></i>
                      {expandedProfileBarber.average_rating || '0'} <span className="text-muted fw-normal ms-1">({expandedProfileBarber.total_ratings || 0} reviews)</span>
                    </span>
                    {expandedProfileBarber.skills && expandedProfileBarber.skills.split(',').map((skill, i) => (
                      <span key={i} className="badge bg-primary bg-opacity-10 text-primary shadow-sm py-2 px-3">{skill.trim()}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageBarbers;