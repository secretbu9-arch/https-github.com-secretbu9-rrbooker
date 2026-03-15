// components/barber/BarberDayOffManager.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import BarberAvailabilityService from '../../services/booking/BarberAvailabilityService';

const barberDayOffStyles = `
  :root {
    --day-black: #000000;
    --day-brown: #2c1810;
    --day-white: #ffffff;
    --day-light-gray: #f8f9fa;
    --day-gray: #e9ecef;
    --day-dark-gray: #6c757d;
  }

  .day-off-container {
    background-color: var(--day-light-gray);
    min-height: 100vh;
    padding-bottom: 5rem;
  }

  .premium-header {
    background: var(--day-white);
    border-bottom: 1px solid var(--day-gray);
    padding: 2rem 0;
    margin-bottom: 2rem;
  }

  .title-h1 {
    font-weight: 900;
    letter-spacing: -1.5px;
    text-transform: uppercase;
    margin-bottom: 0.25rem;
    color: var(--day-black);
  }

  /* Form Styling */
  .add-form-card {
    background: var(--day-white);
    border-radius: 24px;
    border: 1px solid rgba(0,0,0,0.05);
    box-shadow: 0 10px 30px rgba(0,0,0,0.03);
    overflow: hidden;
    margin-bottom: 2.5rem;
  }

  .form-header {
    background: var(--day-black);
    color: var(--day-white);
    padding: 1.25rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .form-body {
    padding: 2rem;
  }

  .minimal-input {
    background: var(--day-light-gray);
    border: 1px solid var(--day-gray);
    border-radius: 12px;
    padding: 0.75rem 1rem;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .minimal-input:focus {
    border-color: var(--day-brown);
    background: var(--day-white);
    box-shadow: 0 0 0 4px rgba(44, 24, 16, 0.05);
    outline: none;
  }

  /* Day-Off Card Item */
  .day-off-card {
    background: var(--day-white);
    border-radius: 20px;
    padding: 1.5rem;
    border: 1px solid rgba(0,0,0,0.05);
    transition: all 0.3s ease;
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
  }

  .day-off-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(0,0,0,0.05);
    border-color: var(--day-brown);
  }

  .type-badge {
    position: absolute;
    top: 1.5rem;
    right: 1.5rem;
    padding: 0.4rem 1rem;
    border-radius: 100px;
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-active { background: var(--day-black); color: var(--day-white); }
  .badge-cancelled { background: var(--day-gray); color: var(--day-dark-gray); }

  .date-display {
    font-weight: 900;
    font-size: 1.1rem;
    letter-spacing: -0.5px;
    margin-bottom: 0.5rem;
    color: var(--day-black);
  }

  .reason-text {
    color: var(--day-dark-gray);
    font-size: 0.85rem;
    line-height: 1.5;
    margin-bottom: 1.5rem;
    flex-grow: 1;
  }

  /* Buttons */
  .btn-premium {
    background: var(--day-black);
    color: var(--day-white);
    border: none;
    border-radius: 14px;
    padding: 0.8rem 1.5rem;
    font-weight: 700;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
  }

  .btn-premium:hover {
    background: var(--day-brown);
    transform: scale(1.02);
  }

  .btn-outline-minimal {
    background: transparent;
    border: 2px solid var(--day-gray);
    color: var(--day-black);
    border-radius: 14px;
    padding: 0.8rem 1.5rem;
    font-weight: 700;
  }

  .btn-cancel-card {
    background: #fff;
    border: 1px solid #fee2e2;
    color: #dc2626;
    padding: 0.6rem;
    border-radius: 12px;
    font-weight: 700;
    font-size: 0.8rem;
    width: 100%;
    transition: all 0.2s ease;
  }

  .btn-cancel-card:hover {
    background: #dc2626;
    color: #fff;
  }

  .empty-state {
    text-align: center;
    padding: 5rem 2rem;
    background: var(--day-white);
    border-radius: 30px;
    border: 2px dashed var(--day-gray);
  }

  .fab-add {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    width: 60px;
    height: 60px;
    background: var(--day-black);
    color: var(--day-white);
    border-radius: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    cursor: pointer;
    transition: all 0.3s ease;
    z-index: 100;
    border: none;
  }

  .fab-add:hover {
    background: var(--day-brown);
    transform: rotate(90deg);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .spin { animation: spin 1s linear infinite; }
`;

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
    <div className="day-off-container">
      <style>{barberDayOffStyles}</style>

      {/* Premium Header */}
      <header className="premium-header">
        <div className="container">
          <div className="d-flex justify-content-between align-items-end">
            <div>
              <h1 className="title-h1">DAY-OFF</h1>
              <p className="text-muted small mb-0 fw-bold">SCHEDULE & AVAILABILITY MANAGER</p>
            </div>
            <button className="btn-premium d-none d-md-flex" onClick={() => setShowAddForm(true)}>
              <i className="bi bi-calendar-plus"></i> NEW REQUEST
            </button>
          </div>
        </div>
      </header>

      <div className="container">
        {error && (
          <div className="alert alert-dark border-0 rounded-4 shadow-sm mb-4 d-flex align-items-center gap-3">
            <i className="bi bi-exclamation-triangle-fill fs-5"></i>
            <div className="small fw-bold">{error}</div>
            <button className="btn-close ms-auto" onClick={() => setError('')}></button>
          </div>
        )}

        {/* Add Form Section */}
        {showAddForm && (
          <div className="add-form-card">
            <div className="form-header">
              <h5 className="mb-0 fw-black small">SCHEDULE NEW ABSENCE</h5>
              <button className="btn p-0 text-white opacity-50" onClick={() => setShowAddForm(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <div className="form-body">
              <form onSubmit={handleSubmit}>
                <div className="row g-4">
                  <div className="col-md-6">
                    <label className="rev-label d-block mb-2">Duration Start</label>
                    <input
                      type="date"
                      className="minimal-input w-100"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="rev-label d-block mb-2">Duration End</label>
                    <input
                      type="date"
                      className="minimal-input w-100"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      min={formData.start_date || new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="rev-label d-block mb-2">Absence Type</label>
                    <select
                      className="minimal-input w-100"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      required
                    >
                      <option value="day_off">Regular Day Off</option>
                      <option value="sick_leave">Sick Leave</option>
                      <option value="vacation">Vacation</option>
                      <option value="emergency">Emergency</option>
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="rev-label d-block mb-2">Reason (Optional)</label>
                    <input
                      type="text"
                      className="minimal-input w-100"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      placeholder="Medical, Personal, etc."
                    />
                  </div>
                  <div className="col-12">
                    <div className="p-3 rounded-4" style={{ background: 'rgba(0,0,0,0.03)', border: '1px dashed var(--day-gray)' }}>
                      <p className="small mb-0 text-muted">
                        <strong>NOTE:</strong> Existing appointments in this period will be 
                        <span className="text-dark fw-black"> AUTO-CANCELLED</span> and customers notified.
                      </p>
                    </div>
                  </div>
                  <div className="col-12 d-flex gap-3">
                    <button type="submit" className="btn-premium flex-grow-1" disabled={submitting}>
                      {submitting ? <i className="bi bi-arrow-repeat spin"></i> : <i className="bi bi-check2-circle"></i>}
                      {submitting ? 'PROCESSING...' : 'CONFIRM ABSENCE'}
                    </button>
                    <button type="button" className="btn-outline-minimal" onClick={() => setShowAddForm(false)}>
                      CANCEL
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Day-Offs List */}
        <div className="section-header">
          <i className="bi bi-clock-history"></i> SCHEDULED ABSENCES
        </div>

        {dayOffs.length === 0 ? (
          <div className="empty-state">
            <i className="bi bi-calendar-check-fill display-1 opacity-10 mb-4 d-block"></i>
            <h4 className="fw-black mb-2">NO ABSENCES PLANNED</h4>
            <p className="text-muted">You are currently fully available for bookings.</p>
            <button className="btn-premium mx-auto mt-4" onClick={() => setShowAddForm(true)}>
              SET UNAVAILABLE
            </button>
          </div>
        ) : (
          <div className="row g-4">
            {dayOffs.map((dayOff) => (
              <div key={dayOff.id} className="col-md-6 col-lg-4">
                <div className="day-off-card">
                  <span className={`type-badge ${dayOff.is_active ? 'badge-active' : 'badge-cancelled'}`}>
                    {dayOff.is_active ? dayOff.type.replace('_', ' ') : 'CANCELLED'}
                  </span>
                  
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <div className="p-2 bg-light rounded-3">
                      <i className={`bi bi-${getTypeIcon(dayOff.type)} text-dark`}></i>
                    </div>
                  </div>

                  <div className="date-display">
                    {dayOff.start_date === dayOff.end_date
                      ? formatDate(dayOff.start_date)
                      : `${new Date(dayOff.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(dayOff.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                    }
                  </div>

                  <div className="reason-text">
                    {dayOff.reason || "Scheduled maintenance/day off."}
                    <div className="mt-2 small opacity-50">
                      Duration: {dayOff.start_date === dayOff.end_date
                        ? '1 day'
                        : `${Math.ceil((new Date(dayOff.end_date) - new Date(dayOff.start_date)) / (1000 * 60 * 60 * 24)) + 1} days`
                      }
                    </div>
                  </div>

                  {dayOff.is_active && !isPast(dayOff.end_date) && (
                    <button className="btn-cancel-card" onClick={() => handleCancelDayOff(dayOff.id)}>
                      CANCEL ABSENCE
                    </button>
                  )}
                  
                  {isPast(dayOff.end_date) && (
                    <div className="small fw-bold opacity-30 text-uppercase letter-spacing-1">
                      Absence Period Ended
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile Floating Action Button */}
      <button className="fab-add d-md-none" onClick={() => setShowAddForm(!showAddForm)}>
        <i className={`bi bi-${showAddForm ? 'x-lg' : 'plus-lg'}`}></i>
      </button>
    </div>
  );
};

export default BarberDayOffManager;
