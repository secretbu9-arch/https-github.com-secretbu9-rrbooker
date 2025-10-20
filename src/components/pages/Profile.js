// components/pages/Profile.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import logoImage from '../../assets/images/raf-rok-logo.png';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    barber_status: 'available',
    skills: ''
  });
  const [profilePicture, setProfilePicture] = useState(null);
  const [profilePictureUrl, setProfilePictureUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      
      // Get current authenticated user
      const { data: authUser, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      
      if (authUser?.user) {
        setUser(authUser.user);
        
        // Fetch user profile from users table
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.user.email)
          .single();
          
        if (profileError) throw profileError;
        
        setProfile(profileData);
        setFormData({
          full_name: profileData.full_name || '',
          phone: profileData.phone || '',
          email: profileData.email || '',
          barber_status: profileData.barber_status || 'available'
        });
        
        // Set profile picture URL if exists
        if (profileData.profile_picture_url) {
          setProfilePictureUrl(profileData.profile_picture_url);
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setMessage({ type: 'error', text: 'Failed to load profile data' });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select a valid image file (JPG, PNG, GIF, etc.)' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image size must be less than 5MB' });
      return;
    }

    try {
      setUploadingImage(true);
      setMessage({ type: '', text: '' });

      // Create a unique filename with user ID prefix
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      const filePath = fileName; // Store directly in bucket root

      console.log('Uploading file:', fileName, 'to bucket: profile-pictures');

      // Try to upload directly - this will give us a more specific error if the bucket doesn't exist
      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true // Allow overwriting existing files
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        
        // Provide specific error messages
        if (uploadError.message.includes('not found') || uploadError.message.includes('bucket')) {
          throw new Error('Storage bucket "profile-pictures" not found. Please create the bucket in Supabase Storage.');
        } else if (uploadError.message.includes('permission') || uploadError.message.includes('denied')) {
          throw new Error('Permission denied. Please make sure you are logged in and have the correct policies.');
        } else if (uploadError.message.includes('size')) {
          throw new Error('File too large. Please select a smaller image.');
        } else {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(filePath);

      const imageUrl = urlData.publicUrl;
      console.log('Public URL:', imageUrl);

      // Update user profile with new image URL
      const { error: updateError } = await supabase
        .from('users')
        .update({
          profile_picture_url: imageUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (updateError) {
        console.error('Database update error:', updateError);
        throw new Error('Failed to save profile picture. Please try again.');
      }

      // Update local state
      setProfilePictureUrl(imageUrl);
      setMessage({ type: 'success', text: 'Profile picture updated successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);

    } catch (error) {
      console.error('Error uploading image:', error);
      setMessage({ 
        type: 'error', 
        text: error.message || 'Failed to upload profile picture. Please try again.' 
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    try {
      setUploadingImage(true);
      setMessage({ type: '', text: '' });

      // Remove from database
      const { error: updateError } = await supabase
        .from('users')
        .update({
          profile_picture_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (updateError) throw updateError;

      // Update local state
      setProfilePictureUrl('');
      setMessage({ type: 'success', text: 'Profile picture removed successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);

    } catch (error) {
      console.error('Error removing image:', error);
      setMessage({ type: 'error', text: 'Failed to remove profile picture. Please try again.' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // Validate required fields
      if (!formData.full_name.trim()) {
        throw new Error('Full name is required');
      }

      // Update user profile
      const { error } = await supabase
        .from('users')
        .update({
          full_name: formData.full_name.trim(),
          phone: formData.phone.trim(),
          barber_status: formData.barber_status,
          skills: formData.skills.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (error) throw error;

      // Refresh profile data
      await fetchUserProfile();
      setIsEditing(false);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      full_name: profile.full_name || '',
      phone: profile.phone || '',
      email: profile.email || '',
      barber_status: profile.barber_status || 'available',
      skills: profile.skills || ''
    });
    setMessage({ type: '', text: '' });
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'manager':
        return 'bi-shield-check';
      case 'barber':
        return 'bi-scissors';
      case 'customer':
        return 'bi-person';
      default:
        return 'bi-person';
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'manager':
        return 'bg-danger';
      case 'barber':
        return 'bg-primary';
      case 'customer':
        return 'bg-success';
      default:
        return 'bg-secondary';
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-success';
      case 'busy':
        return 'bg-warning';
      case 'unavailable':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  };

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="row justify-content-center">
          <div className="col-md-8">
            <div className="card shadow-sm">
              <div className="card-body text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-3 text-muted">Loading profile...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mt-4">
        <div className="row justify-content-center">
          <div className="col-md-8">
            <div className="card shadow-sm">
              <div className="card-body text-center py-5">
                <i className="bi bi-exclamation-triangle text-warning" style={{ fontSize: '3rem' }}></i>
                <h4 className="mt-3">Profile Not Found</h4>
                <p className="text-muted">Unable to load your profile information.</p>
                <button className="btn btn-primary" onClick={fetchUserProfile}>
                  <i className="bi bi-arrow-clockwise me-2"></i>
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4 mb-5">
      <div className="row justify-content-center">
        <div className="col-md-8">
          {/* Header Card */}
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-dark text-white">
              <div className="d-flex align-items-center">
                <img 
                  src={logoImage} 
                  alt="RAF & ROK" 
                  height="40"
                  className="me-3"
                  style={{
                    backgroundColor: '#ffffff',
                    padding: '5px',
                    borderRadius: '8px'
                  }}
                />
                <div>
                  <h4 className="mb-0">
                    <i className="bi bi-person-circle me-2"></i>
                    My Profile
                  </h4>
                  <small className="text-light opacity-75">
                    Manage your account information
                  </small>
                </div>
              </div>
            </div>
          </div>

          {/* Alert Messages */}
          {message.text && (
            <div className={`alert alert-${message.type === 'error' ? 'danger' : 'success'} alert-dismissible fade show`} role="alert">
              <i className={`bi ${message.type === 'error' ? 'bi-exclamation-triangle' : 'bi-check-circle'} me-2`}></i>
              {message.text}
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setMessage({ type: '', text: '' })}
              ></button>
            </div>
          )}

          {/* Profile Picture Card */}
          <div className="card shadow-sm mb-4">
            <div className="card-header">
              <h5 className="mb-0">
                <i className="bi bi-camera me-2"></i>
                Profile Picture
              </h5>
            </div>
            <div className="card-body text-center">
              <div className="mb-3">
                {profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt="Profile"
                    className="rounded-circle border border-3 border-primary"
                    style={{ width: '150px', height: '150px', objectFit: 'cover' }}
                  />
                ) : (
                  <div 
                    className="rounded-circle border border-3 border-secondary d-flex align-items-center justify-content-center mx-auto"
                    style={{ width: '150px', height: '150px', backgroundColor: '#f8f9fa' }}
                  >
                    <i className="bi bi-person-fill text-secondary" style={{ fontSize: '4rem' }}></i>
                  </div>
                )}
              </div>
              
              <div className="d-flex justify-content-center gap-2">
                <label className="btn btn-primary btn-sm" htmlFor="profilePictureInput">
                  <i className="bi bi-camera me-1"></i>
                  {profilePictureUrl ? 'Change Picture' : 'Upload Picture'}
                </label>
                <input
                  type="file"
                  id="profilePictureInput"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                  disabled={uploadingImage}
                />
                
                {profilePictureUrl && (
                  <button
                    className="btn btn-outline-danger btn-sm"
                    onClick={handleRemoveImage}
                    disabled={uploadingImage}
                  >
                    <i className="bi bi-trash me-1"></i>
                    Remove
                  </button>
                )}
              </div>
              
              {uploadingImage && (
                <div className="mt-3">
                  <div className="spinner-border spinner-border-sm text-primary me-2" role="status">
                    <span className="visually-hidden">Uploading...</span>
                  </div>
                  <small className="text-muted">Uploading image...</small>
                </div>
              )}
              
              <div className="mt-2">
                <small className="text-muted">
                  <i className="bi bi-info-circle me-1"></i>
                  Recommended size: 300x300px. Max file size: 5MB
                </small>
              </div>
            </div>
          </div>

          {/* Profile Information Card */}
          <div className="card shadow-sm">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center">
                <i className={`bi ${getRoleIcon(profile.role)} me-2`}></i>
                <h5 className="mb-0">Profile Information</h5>
              </div>
              {!isEditing && (
                <button 
                  className="btn btn-outline-primary btn-sm"
                  onClick={() => setIsEditing(true)}
                >
                  <i className="bi bi-pencil me-1"></i>
                  Edit Profile
                </button>
              )}
            </div>
            
            <div className="card-body">
              {isEditing ? (
                /* Edit Form */
                <form onSubmit={handleSave}>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label htmlFor="full_name" className="form-label">
                        <i className="bi bi-person me-1"></i>
                        Full Name *
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        id="full_name"
                        name="full_name"
                        value={formData.full_name}
                        onChange={handleInputChange}
                        required
                        placeholder="Enter your full name"
                      />
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <label htmlFor="phone" className="form-label">
                        <i className="bi bi-telephone me-1"></i>
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        className="form-control"
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="Enter your phone number"
                      />
                    </div>
                  </div>
                  
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <label htmlFor="email" className="form-label">
                        <i className="bi bi-envelope me-1"></i>
                        Email Address
                      </label>
                      <input
                        type="email"
                        className="form-control"
                        id="email"
                        name="email"
                        value={formData.email}
                        disabled
                        title="Email cannot be changed"
                      />
                      <div className="form-text">Email address cannot be modified</div>
                    </div>
                    
                    {profile.role === 'barber' && (
                      <>
                        <div className="col-md-6 mb-3">
                          <label htmlFor="barber_status" className="form-label">
                            <i className="bi bi-activity me-1"></i>
                            Availability Status
                          </label>
                          <select
                            className="form-select"
                            id="barber_status"
                            name="barber_status"
                            value={formData.barber_status}
                            onChange={handleInputChange}
                          >
                            <option value="available">Available</option>
                            <option value="busy">Busy</option>
                            <option value="unavailable">Unavailable</option>
                          </select>
                        </div>
                        <div className="col-md-6 mb-3">
                          <label htmlFor="skills" className="form-label">
                            <i className="bi bi-award me-1"></i>
                            Skills
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            id="skills"
                            name="skills"
                            value={formData.skills}
                            onChange={handleInputChange}
                            placeholder="e.g., Haircut, Beard Trim, Styling"
                          />
                          <div className="form-text">Enter your specializations separated by commas</div>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="d-flex gap-2 mt-4">
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Saving...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-check-lg me-2"></i>
                          Save Changes
                        </>
                      )}
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary"
                      onClick={handleCancel}
                      disabled={saving}
                    >
                      <i className="bi bi-x-lg me-2"></i>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                /* Display Mode */
                <div>
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <div className="d-flex align-items-center mb-2">
                        <i className="bi bi-person text-primary me-2"></i>
                        <strong>Full Name</strong>
                      </div>
                      <p className="text-muted mb-0">{profile.full_name || 'Not provided'}</p>
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <div className="d-flex align-items-center mb-2">
                        <i className="bi bi-envelope text-primary me-2"></i>
                        <strong>Email Address</strong>
                      </div>
                      <p className="text-muted mb-0">{profile.email}</p>
                    </div>
                  </div>
                  
                  <div className="row">
                    <div className="col-md-6 mb-3">
                      <div className="d-flex align-items-center mb-2">
                        <i className="bi bi-telephone text-primary me-2"></i>
                        <strong>Phone Number</strong>
                      </div>
                      <p className="text-muted mb-0">{profile.phone || 'Not provided'}</p>
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <div className="d-flex align-items-center mb-2">
                        <i className="bi bi-shield text-primary me-2"></i>
                        <strong>Role</strong>
                      </div>
                      <span className={`badge ${getRoleBadgeColor(profile.role)} text-capitalize`}>
                        <i className={`bi ${getRoleIcon(profile.role)} me-1`}></i>
                        {profile.role}
                      </span>
                    </div>
                  </div>
                  
                  {profile.role === 'barber' && (
                    <div className="row">
                      <div className="col-md-6 mb-3">
                        <div className="d-flex align-items-center mb-2">
                          <i className="bi bi-activity text-primary me-2"></i>
                          <strong>Availability Status</strong>
                        </div>
                        <span className={`badge ${getStatusBadgeColor(profile.barber_status)} text-capitalize`}>
                          <i className="bi bi-circle-fill me-1" style={{ fontSize: '0.6rem' }}></i>
                          {profile.barber_status}
                        </span>
                      </div>
                      <div className="col-md-6 mb-3">
                        <div className="d-flex align-items-center mb-2">
                          <i className="bi bi-award text-primary me-2"></i>
                          <strong>Skills</strong>
                        </div>
                        <p className="text-muted mb-0">
                          {profile.skills ? (
                            <span className="badge bg-primary me-1">
                              {profile.skills}
                            </span>
                          ) : (
                            'No skills specified'
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="row mt-4">
                    <div className="col-md-6 mb-3">
                      <div className="d-flex align-items-center mb-2">
                        <i className="bi bi-calendar-plus text-primary me-2"></i>
                        <strong>Account Created</strong>
                      </div>
                      <p className="text-muted mb-0">{formatDate(profile.created_at)}</p>
                    </div>
                    
                    <div className="col-md-6 mb-3">
                      <div className="d-flex align-items-center mb-2">
                        <i className="bi bi-arrow-clockwise text-primary me-2"></i>
                        <strong>Last Updated</strong>
                      </div>
                      <p className="text-muted mb-0">{formatDate(profile.updated_at)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Account Information Card */}
          <div className="card shadow-sm mt-4">
            <div className="card-header">
              <h5 className="mb-0">
                <i className="bi bi-info-circle me-2"></i>
                Account Information
              </h5>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6 mb-3">
                  <div className="d-flex align-items-center mb-2">
                    <i className="bi bi-key text-warning me-2"></i>
                    <strong>User ID</strong>
                  </div>
                  <p className="text-muted mb-0 font-monospace" style={{ fontSize: '0.875rem' }}>
                    {profile.id}
                  </p>
                </div>
                
                <div className="col-md-6 mb-3">
                  <div className="d-flex align-items-center mb-2">
                    <i className="bi bi-shield-check text-success me-2"></i>
                    <strong>Account Status</strong>
                  </div>
                  <span className="badge bg-success">
                    <i className="bi bi-check-circle me-1"></i>
                    Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Role-specific information */}
          {profile.role === 'manager' && (
            <div className="card shadow-sm mt-4">
              <div className="card-header bg-danger text-white">
                <h5 className="mb-0">
                  <i className="bi bi-shield-exclamation me-2"></i>
                  Manager Privileges
                </h5>
              </div>
              <div className="card-body">
                <p className="mb-3">As a manager, you have access to:</p>
                <ul className="list-unstyled">
                  <li><i className="bi bi-check text-success me-2"></i>Manage barbers and their schedules</li>
                  <li><i className="bi bi-check text-success me-2"></i>Manage services and products</li>
                  <li><i className="bi bi-check text-success me-2"></i>View and manage all appointments</li>
                  <li><i className="bi bi-check text-success me-2"></i>Access detailed reports and analytics</li>
                  <li><i className="bi bi-check text-success me-2"></i>System administration capabilities</li>
                </ul>
              </div>
            </div>
          )}

          {profile.role === 'barber' && (
            <div className="card shadow-sm mt-4">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">
                  <i className="bi bi-scissors me-2"></i>
                  Barber Tools
                </h5>
              </div>
              <div className="card-body">
                <p className="mb-3">As a barber, you can:</p>
                <ul className="list-unstyled">
                  <li><i className="bi bi-check text-success me-2"></i>View and manage your schedule</li>
                  <li><i className="bi bi-check text-success me-2"></i>Update your availability status</li>
                  <li><i className="bi bi-check text-success me-2"></i>Manage customer queue</li>
                  <li><i className="bi bi-check text-success me-2"></i>View appointment details</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;