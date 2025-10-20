// components/manager/ManageBarbers.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { formatDate } from '../utils/helpers';
import { isValidEmail, isValidPhone } from '../utils/validators';
import LoadingSpinner from '../common/LoadingSpinner';

const ManageBarbers = () => {
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'barber',
    skills: ''
  });
  
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
  }, []);

  useEffect(() => {
    if (barbers.length > 0) {
      fetchBarberStats();
    }
  }, [barbers]);

  const fetchBarbers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'barber')
        .order('full_name');
      
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
          completed: barberAppointments.filter(apt => apt.status === 'done').length,
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
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
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
    
    try {
      setLoading(true);
      
      if (isEditing && selectedBarber) {
        // Update existing barber
        const { data, error } = await supabase
          .from('users')
          .update({
            full_name: formData.full_name,
            phone: formData.phone,
            skills: formData.skills
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
          
          // Show a notice to the user about manual verification
          alert('Barber account created! Note: The barber may need to verify their email before logging in. If you have SQL access, you can run the auto-confirmation script.');
          
          // Update local state
          setBarbers(prev => [...prev, userData[0]]);
        }
      }
      
      // Close modal and reset form
      resetFormAndCloseModal();
      
    } catch (error) {
      console.error('Error saving barber:', error);
      setError('Failed to save barber. ' + (error.message || 'Please try again.'));
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
      role: 'barber',
      skills: barber.skills || ''
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const handleDelete = async (barberId) => {
    if (!window.confirm('Are you sure you want to delete this barber? This will also delete all associated appointments.')) {
      return;
    }
    
    try {
      setLoading(true);
      
      // Delete user
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', barberId);
      
      if (error) throw error;
      
      // Update local state
      setBarbers(prev => prev.filter(barber => barber.id !== barberId));
      
    } catch (error) {
      console.error('Error deleting barber:', error);
      setError('Failed to delete barber. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setFormData({
      full_name: '',
      email: '',
      phone: '',
      password: '',
      role: 'barber',
      skills: ''
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
      skills: ''
    });
    setFormErrors({});
    setIsEditing(false);
    setSelectedBarber(null);
    setShowModal(false);
  };

  const filteredBarbers = barbers.filter(barber => 
    barber.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    barber.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (barber.phone && barber.phone.includes(searchQuery))
  );

  if (loading && !barbers.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Manage Barbers</h2>
        <button 
          className="btn btn-primary" 
          onClick={handleAddNew}
        >
          <i className="bi bi-person-plus me-2"></i>
          Add New Barber
        </button>
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          {error}
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
                    : "No barbers found. Click 'Add New Barber' to create one."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          filteredBarbers.map(barber => (
            <div key={barber.id} className="col-md-6 col-lg-4 mb-4">
              <div className="card h-100">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h5 className="card-title mb-0">{barber.full_name}</h5>
                  <div className="dropdown">
                    <button className="btn btn-sm btn-outline-secondary" type="button" id={`dropdown-${barber.id}`} data-bs-toggle="dropdown" aria-expanded="false">
                      <i className="bi bi-three-dots-vertical"></i>
                    </button>
                    <ul className="dropdown-menu dropdown-menu-end" aria-labelledby={`dropdown-${barber.id}`}>
                      <li>
                        <button className="dropdown-item" onClick={() => handleEdit(barber)}>
                          <i className="bi bi-pencil me-2"></i>Edit
                        </button>
                      </li>
                      <li>
                        <button className="dropdown-item text-danger" onClick={() => handleDelete(barber.id)}>
                          <i className="bi bi-trash me-2"></i>Delete
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
                <form onSubmit={handleSubmit}>
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
                      <div className="form-text">Email cannot be changed for existing users.</div>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="phone" className="form-label">Phone (optional)</label>
                    <input
                      type="tel"
                      className={`form-control ${formErrors.phone ? 'is-invalid' : ''}`}
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                    />
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
                      disabled={loading}
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
    </div>
  );
};

export default ManageBarbers;