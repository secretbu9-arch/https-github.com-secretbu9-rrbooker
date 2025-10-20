// components/barber/BarberDayOffManager.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import BarberAvailabilityService from '../../services/BarberAvailabilityService';

const BarberDayOffManager = ({ user }) => {
  const [dayOffs, setDayOffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    start_date: '',
    end_date: '',
    type: 'day_off',
    reason: ''
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchDayOffs();
  }, [user]);

  const fetchDayOffs = async () => {
    try {
      setLoading(true);
      setError('');

      const { data, error } = await supabase
        .from('barber_day_offs')
        .select('*')
        .eq('barber_id', user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;

      setDayOffs(data || []);
    } catch (err) {
      console.error('Error fetching day-offs:', err);
      setError(`Failed to load day-offs: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.start_date || !formData.end_date) {
      setError('Please select both start and end dates');
      return;
    }

    if (new Date(formData.start_date) > new Date(formData.end_date)) {
      setError('Start date cannot be after end date');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const result = await BarberAvailabilityService.setBarberUnavailable(
        user.id,
        formData.start_date,
        formData.end_date,
        formData.type,
        formData.reason
      );

      if (result.success) {
        setFormData({
          start_date: '',
          end_date: '',
          type: 'day_off',
          reason: ''
        });
        setShowAddForm(false);
        await fetchDayOffs();
        
        // Show success message
        alert('Day-off scheduled successfully! Existing appointments have been cancelled and customers notified.');
      } else {
        setError(result.error || 'Failed to schedule day-off');
      }
    } catch (err) {
      console.error('Error scheduling day-off:', err);
      setError(`Failed to schedule day-off: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelDayOff = async (dayOffId) => {
    if (!window.confirm('Are you sure you want to cancel this day-off? This will make you available for booking again.')) {
      return;
    }

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('barber_day_offs')
        .update({ is_active: false })
        .eq('id', dayOffId);

      if (error) throw error;

      await fetchDayOffs();
      alert('Day-off cancelled successfully!');
    } catch (err) {
      console.error('Error cancelling day-off:', err);
      setError(`Failed to cancel day-off: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getTypeColor = (type) => {
    const colors = {
      day_off: 'secondary',
      sick_leave: 'danger',
      vacation: 'info',
      emergency: 'warning'
    };
    return colors[type] || 'secondary';
  };

  const getTypeIcon = (type) => {
    const icons = {
      day_off: 'calendar-x',
      sick_leave: 'bandaid',
      vacation: 'airplane',
      emergency: 'exclamation-triangle'
    };
    return icons[type] || 'calendar-x';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isPast = (dateString) => {
    return new Date(dateString) < new Date();
  };

  if (loading) {
    return (
      <div className="container py-4">
        <div className="text-center py-4">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading day-off schedule...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid py-3">
      {/* Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
            <div>
              <h2 className="mb-1">
                <i className="bi bi-calendar-x me-2 text-primary"></i>
                Day-Off Management
              </h2>
              <p className="text-muted mb-0">Schedule your unavailable dates and manage your availability</p>
            </div>
            <button 
              className="btn btn-primary"
              onClick={() => setShowAddForm(true)}
            >
              <i className="bi bi-plus-circle me-2"></i>
              Schedule Day-Off
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </div>
      )}

      {/* Add Day-Off Form */}
      {showAddForm && (
        <div className="row mb-4">
          <div className="col-12">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-primary text-white">
                <div className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">
                    <i className="bi bi-calendar-plus me-2"></i>
                    Schedule New Day-Off
                  </h5>
                  <button 
                    className="btn btn-outline-light btn-sm"
                    onClick={() => setShowAddForm(false)}
                  >
                    <i className="bi bi-x"></i>
                  </button>
                </div>
              </div>
              <div className="card-body">
                <form onSubmit={handleSubmit}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label htmlFor="start_date" className="form-label">
                        Start Date <span className="text-danger">*</span>
                      </label>
                      <input
                        type="date"
                        className="form-control"
                        id="start_date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                        min={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="end_date" className="form-label">
                        End Date <span className="text-danger">*</span>
                      </label>
                      <input
                        type="date"
                        className="form-control"
                        id="end_date"
                        value={formData.end_date}
                        onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                        min={formData.start_date || new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="type" className="form-label">
                        Type <span className="text-danger">*</span>
                      </label>
                      <select
                        className="form-select"
                        id="type"
                        value={formData.type}
                        onChange={(e) => setFormData({...formData, type: e.target.value})}
                        required
                      >
                        <option value="day_off">Day Off</option>
                        <option value="sick_leave">Sick Leave</option>
                        <option value="vacation">Vacation</option>
                        <option value="emergency">Emergency</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label htmlFor="reason" className="form-label">
                        Reason (Optional)
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        id="reason"
                        value={formData.reason}
                        onChange={(e) => setFormData({...formData, reason: e.target.value})}
                        placeholder="Brief reason for unavailability"
                      />
                    </div>
                    <div className="col-12">
                      <div className="alert alert-info">
                        <i className="bi bi-info-circle me-2"></i>
                        <strong>Important:</strong> Scheduling a day-off will automatically cancel all existing appointments during this period and notify customers. They will be able to reschedule or book with another barber.
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="d-flex gap-2">
                        <button 
                          type="submit" 
                          className="btn btn-primary"
                          disabled={submitting}
                        >
                          {submitting ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                              Scheduling...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-calendar-check me-2"></i>
                              Schedule Day-Off
                            </>
                          )}
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-outline-secondary"
                          onClick={() => setShowAddForm(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day-Offs List */}
      <div className="row">
        <div className="col-12">
          {dayOffs.length === 0 ? (
            <div className="text-center py-5">
              <div className="card border-0 bg-light">
                <div className="card-body py-5">
                  <i className="bi bi-calendar-x display-1 text-muted mb-3"></i>
                  <h4 className="text-muted">No day-offs scheduled</h4>
                  <p className="text-muted">
                    You haven't scheduled any day-offs yet. Click "Schedule Day-Off" to set your unavailable dates.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="row g-3">
              {dayOffs.map((dayOff) => (
                <div key={dayOff.id} className="col-12 col-md-6 col-lg-4">
                  <div className="card h-100 shadow-sm border-0">
                    <div className="card-header bg-white border-bottom">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="d-flex align-items-center">
                          <div className={`p-2 rounded-circle me-3 bg-${getTypeColor(dayOff.type)} bg-opacity-10`}>
                            <i className={`bi bi-${getTypeIcon(dayOff.type)} text-${getTypeColor(dayOff.type)}`}></i>
                          </div>
                          <div>
                            <h6 className="mb-0 text-capitalize">{dayOff.type.replace('_', ' ')}</h6>
                            <small className="text-muted">
                              {dayOff.start_date === dayOff.end_date 
                                ? formatDate(dayOff.start_date)
                                : `${formatDate(dayOff.start_date)} - ${formatDate(dayOff.end_date)}`
                              }
                            </small>
                          </div>
                        </div>
                        <span className={`badge bg-${dayOff.is_active ? 'success' : 'secondary'}`}>
                          {dayOff.is_active ? 'Active' : 'Cancelled'}
                        </span>
                      </div>
                    </div>

                    <div className="card-body">
                      {dayOff.reason && (
                        <div className="mb-3">
                          <h6 className="text-muted mb-1">Reason:</h6>
                          <p className="small mb-0">{dayOff.reason}</p>
                        </div>
                      )}

                      <div className="mb-3">
                        <h6 className="text-muted mb-1">Duration:</h6>
                        <p className="small mb-0">
                          {dayOff.start_date === dayOff.end_date 
                            ? '1 day'
                            : `${Math.ceil((new Date(dayOff.end_date) - new Date(dayOff.start_date)) / (1000 * 60 * 60 * 24)) + 1} days`
                          }
                        </p>
                      </div>

                      <div className="mb-3">
                        <h6 className="text-muted mb-1">Scheduled:</h6>
                        <p className="small mb-0">
                          {new Date(dayOff.created_at).toLocaleString()}
                        </p>
                      </div>

                      {isPast(dayOff.end_date) && (
                        <div className="alert alert-info py-2 mb-0">
                          <small>
                            <i className="bi bi-info-circle me-1"></i>
                            This day-off period has ended
                          </small>
                        </div>
                      )}
                    </div>

                    <div className="card-footer bg-light border-0">
                      {dayOff.is_active && !isPast(dayOff.end_date) && (
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleCancelDayOff(dayOff.id)}
                        >
                          <i className="bi bi-x-circle me-1"></i>
                          Cancel Day-Off
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarberDayOffManager;
