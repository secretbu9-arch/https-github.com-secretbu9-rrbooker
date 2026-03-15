import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { ROUTES } from '../utils/constants';

const barberRevenueStyles = `
  :root {
    --rev-black: #000000;
    --rev-brown: #2c1810;
    --rev-white: #ffffff;
    --rev-light-gray: #f8f9fa;
    --rev-gray: #e9ecef;
    --rev-dark-gray: #6c757d;
  }

  .revenue-container {
    background-color: var(--rev-light-gray);
    min-height: 100vh;
    padding-bottom: 5rem;
  }

  .premium-card {
    background: var(--rev-white);
    border: 1px solid rgba(0,0,0,0.05);
    border-radius: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
    transition: all 0.3s ease;
  }

  .main-stat-card {
    background: var(--rev-black);
    color: var(--rev-white);
    border-radius: 24px;
    padding: 2.5rem 2rem;
    margin-bottom: 2rem;
    position: relative;
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
  }

  .main-stat-card::after {
    content: '';
    position: absolute;
    top: -50px;
    right: -50px;
    width: 200px;
    height: 200px;
    background: linear-gradient(135deg, transparent, rgba(255,255,255,0.03));
    border-radius: 50%;
  }

  .grid-2x2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .rev-box {
    background: var(--rev-white);
    padding: 1.25rem;
    border-radius: 18px;
    border: 1px solid rgba(0,0,0,0.05);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transition: all 0.2s ease;
  }

  .rev-box:active {
    transform: scale(0.96);
    background: var(--rev-gray);
  }

  .rev-label {
    text-transform: uppercase;
    font-size: 0.65rem;
    font-weight: 800;
    color: var(--rev-dark-gray);
    letter-spacing: 1px;
    margin-bottom: 0.5rem;
  }

  .rev-value {
    font-weight: 900;
    color: var(--rev-black);
    margin-bottom: 0;
    letter-spacing: -0.5px;
  }

  .section-header {
    font-weight: 900;
    letter-spacing: -0.5px;
    margin-bottom: 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.1rem;
  }

  .history-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--rev-gray);
  }

  .history-item:last-child {
    border-bottom: none;
  }

  .btn-rev-primary {
    background: var(--rev-brown);
    color: var(--rev-white);
    border: none;
    border-radius: 12px;
    padding: 0.75rem 1.5rem;
    font-weight: 700;
    transition: all 0.2s ease;
  }

  .btn-rev-primary:hover {
    background: var(--rev-black);
    color: var(--rev-white);
    transform: translateY(-2px);
  }

  .btn-rev-light {
    background: var(--rev-white);
    color: var(--rev-black);
    border: 1px solid var(--rev-gray);
    border-radius: 12px;
    padding: 0.75rem 1.5rem;
    font-weight: 700;
  }

  @media (min-width: 768px) {
    .grid-2x2 {
      grid-template-columns: repeat(4, 1fr);
    }
  }
`;

const BarberRevenue = () => {
  const [user, setUser] = useState(null);
  const [revenueData, setRevenueData] = useState({
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    lastMonth: 0,
    thisYear: 0,
    completedCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const loadingTimeoutRef = useRef(null);

  // Auto-clear loading after 10 seconds maximum - safety mechanism
  useEffect(() => {
    if (!loading) {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      return;
    }

    loadingTimeoutRef.current = setTimeout(() => {
      console.warn('⚠️ Loading state auto-cleared after 10 seconds');
      setLoading(false);
      setError('Loading took too long. Data may be incomplete.');
      setRevenueData({
        today: 0,
        thisWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
        thisYear: 0,
        completedCount: 0
      });
    }, 10000);

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [loading]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        setUser(user);
      } catch (err) {
        console.error('Error fetching user:', err);
        setError('Failed to load user information.');
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    if (!user) return;

    let isCancelled = false;

    const fetchRevenue = async () => {
      try {
        setError('');

        const today = new Date();
        const getLocalDateString = (d) => {
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        };
        const todayStr = getLocalDateString(today);

        // Calculate date ranges
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const startOfWeekStr = getLocalDateString(startOfWeek);

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfMonthStr = getLocalDateString(startOfMonth);

        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const startOfLastMonthStr = getLocalDateString(startOfLastMonth);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        const endOfLastMonthStr = getLocalDateString(endOfLastMonth);

        const startOfYear = new Date(today.getFullYear(), 0, 1);
        const startOfYearStr = getLocalDateString(startOfYear);

        console.log('📊 Fetching revenue data...');

        // Fetch all data in parallel for faster loading
        const [todayResult, weekResult, monthResult, lastMonthResult, yearResult] = await Promise.all([
          supabase
            .from('appointments')
            .select('id, total_price, is_urgent, service:service_id(price)')
            .eq('barber_id', user.id)
            .eq('status', 'completed')
            .eq('appointment_date', todayStr),
          supabase
            .from('appointments')
            .select('id, total_price, is_urgent, service:service_id(price)')
            .eq('barber_id', user.id)
            .eq('status', 'completed')
            .gte('appointment_date', startOfWeekStr)
            .lte('appointment_date', todayStr),
          supabase
            .from('appointments')
            .select('id, total_price, is_urgent, service:service_id(price)')
            .eq('barber_id', user.id)
            .eq('status', 'completed')
            .gte('appointment_date', startOfMonthStr)
            .lte('appointment_date', todayStr),
          supabase
            .from('appointments')
            .select('id, total_price, is_urgent, service:service_id(price)')
            .eq('barber_id', user.id)
            .eq('status', 'completed')
            .gte('appointment_date', startOfLastMonthStr)
            .lte('appointment_date', endOfLastMonthStr),
          supabase
            .from('appointments')
            .select('id, total_price, is_urgent, service:service_id(price)')
            .eq('barber_id', user.id)
            .eq('status', 'completed')
            .gte('appointment_date', startOfYearStr)
            .lte('appointment_date', todayStr)
        ]);

        if (isCancelled) return;

        if (todayResult.error) throw todayResult.error;
        if (weekResult.error) throw weekResult.error;
        if (monthResult.error) throw monthResult.error;
        if (lastMonthResult.error) throw lastMonthResult.error;
        if (yearResult.error) throw yearResult.error;

        const calculateRevenue = (appointments) => {
          if (!Array.isArray(appointments)) return 0;
          return appointments.reduce((sum, apt) => {
            // First source of truth: total_price from database (already includes services + add-ons + urgent fee)
            if (apt.total_price !== null && apt.total_price !== undefined && Number(apt.total_price) > 0) {
              return sum + Number(apt.total_price);
            }

            // Fallback for older appointments without total_price: service price + urgent fee
            const price = Number(apt.service?.price) || 0;
            const urgentFee = apt.is_urgent ? 100 : 0;
            return sum + price + urgentFee;
          }, 0);
        };

        const todayRevenue = calculateRevenue(todayResult.data || []);
        const weekRevenue = calculateRevenue(weekResult.data || []);
        const monthRevenue = calculateRevenue(monthResult.data || []);
        const lastMonthRevenue = calculateRevenue(lastMonthResult.data || []);
        const yearRevenue = calculateRevenue(yearResult.data || []);

        console.log('✅ Revenue calculated:', {
          today: todayRevenue,
          week: weekRevenue,
          month: monthRevenue,
          lastMonth: lastMonthRevenue,
          year: yearRevenue
        });

        setRevenueData({
          today: todayRevenue,
          thisWeek: weekRevenue,
          thisMonth: monthRevenue,
          lastMonth: lastMonthRevenue,
          thisYear: yearRevenue,
          completedCount: (monthResult.data || []).length
        });
        setLastUpdated(new Date());
        setLoading(false);

        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }

      } catch (err) {
        console.error('Error fetching revenue:', err);
        if (!isCancelled) {
          setError(err?.message || 'Failed to load revenue data. Please try again.');
          setLoading(false);
          setRevenueData(prev => prev || {
            today: 0,
            thisWeek: 0,
            thisMonth: 0,
            lastMonth: 0,
            thisYear: 0,
            completedCount: 0
          });
        }
      }
    };

    fetchRevenue();

    return () => {
      isCancelled = true;
    };
  }, [user]);

  const handleRefresh = () => {
    setLoading(true);
    setError('');
    if (user) {
      const fetchRevenue = async () => {
        try {
          setError('');

          const today = new Date();
          const getLocalDateString = (d) => {
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          };
          const todayStr = getLocalDateString(today);

          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          const startOfWeekStr = getLocalDateString(startOfWeek);

          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          const startOfMonthStr = getLocalDateString(startOfMonth);

          const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const startOfLastMonthStr = getLocalDateString(startOfLastMonth);
          const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
          const endOfLastMonthStr = getLocalDateString(endOfLastMonth);

          const startOfYear = new Date(today.getFullYear(), 0, 1);
          const startOfYearStr = getLocalDateString(startOfYear);

          const [todayResult, weekResult, monthResult, lastMonthResult, yearResult] = await Promise.all([
            supabase
              .from('appointments')
              .select('id, total_price, is_urgent, service:service_id(price)')
              .eq('barber_id', user.id)
              .eq('status', 'completed')
              .eq('appointment_date', todayStr),
            supabase
              .from('appointments')
              .select('id, total_price, is_urgent, service:service_id(price)')
              .eq('barber_id', user.id)
              .eq('status', 'completed')
              .gte('appointment_date', startOfWeekStr)
              .lte('appointment_date', todayStr),
            supabase
              .from('appointments')
              .select('id, total_price, is_urgent, service:service_id(price)')
              .eq('barber_id', user.id)
              .eq('status', 'completed')
              .gte('appointment_date', startOfMonthStr)
              .lte('appointment_date', todayStr),
            supabase
              .from('appointments')
              .select('id, total_price, is_urgent, service:service_id(price)')
              .eq('barber_id', user.id)
              .eq('status', 'completed')
              .gte('appointment_date', startOfLastMonthStr)
              .lte('appointment_date', endOfLastMonthStr),
            supabase
              .from('appointments')
              .select('id, total_price, is_urgent, service:service_id(price)')
              .eq('barber_id', user.id)
              .eq('status', 'completed')
              .gte('appointment_date', startOfYearStr)
              .lte('appointment_date', todayStr)
          ]);

          if (todayResult.error) throw todayResult.error;
          if (weekResult.error) throw weekResult.error;
          if (monthResult.error) throw monthResult.error;
          if (lastMonthResult.error) throw lastMonthResult.error;
          if (yearResult.error) throw yearResult.error;

          const calculateRevenue = (appointments) => {
            if (!Array.isArray(appointments)) return 0;
            return appointments.reduce((sum, apt) => {
              if (apt.total_price !== null && apt.total_price !== undefined && Number(apt.total_price) > 0) {
                return sum + Number(apt.total_price);
              }
              const price = Number(apt.service?.price) || 0;
              const urgentFee = apt.is_urgent ? 100 : 0;
              return sum + price + urgentFee;
            }, 0);
          };

          setRevenueData({
            today: calculateRevenue(todayResult.data || []),
            thisWeek: calculateRevenue(weekResult.data || []),
            thisMonth: calculateRevenue(monthResult.data || []),
            lastMonth: calculateRevenue(lastMonthResult.data || []),
            thisYear: calculateRevenue(yearResult.data || []),
            completedCount: (monthResult.data || []).length
          });
          setLastUpdated(new Date());
          setLoading(false);
        } catch (err) {
          console.error('Error refreshing revenue:', err);
          setError(err?.message || 'Failed to refresh revenue data.');
          setLoading(false);
        }
      };
      fetchRevenue();
    }
  };

  if (loading && !error) {
    return (
      <div className="container-fluid px-3 py-4">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
          <div className="text-center">
            <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="text-muted mb-0">Loading revenue data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="revenue-container">
      <style>{barberRevenueStyles}</style>

      {/* Modern Header */}
      <div className="bg-white border-bottom mb-4">
        <div className="container py-4">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h1 className="h3 fw-black mb-1" style={{ letterSpacing: '-1px' }}>REVENUE</h1>
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-black rounded-pill px-3 py-1" style={{ fontSize: '0.7rem' }}>
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                {lastUpdated && (
                  <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                    Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>
            <div className="d-flex gap-2">
              <Link to={ROUTES.DASHBOARD} className="btn btn-light rounded-circle p-0 d-flex align-items-center justify-content-center" style={{ width: '45px', height: '45px' }}>
                <i className="bi bi-arrow-left"></i>
              </Link>
              <button 
                className="btn btn-black text-white rounded-circle" 
                style={{ width: '45px', height: '45px' }} 
                onClick={handleRefresh}
                disabled={loading}
              >
                <i className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`}></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        {error && (
          <div className="alert alert-dark border-0 rounded-4 shadow-sm mb-4 d-flex align-items-center gap-3">
            <i className="bi bi-exclamation-octagon-fill fs-4"></i>
            <div className="small fw-bold">{error}</div>
            <button className="btn-close ms-auto" onClick={() => setError('')}></button>
          </div>
        )}

        {/* Highlight Card */}
        <div className="main-stat-card">
          <div className="rev-label text-white opacity-50 mb-2">Current Month Revenue</div>
          <h2 className="display-4 fw-black mb-2 text-white">
            ₱{revenueData.thisMonth.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </h2>
          <div className="d-flex align-items-center gap-3 mt-4">
            <div className="px-3 py-2 bg-white bg-opacity-10 rounded-pill small fw-bold">
              {revenueData.completedCount} Appointments
            </div>
            {revenueData.lastMonth > 0 && (
              <div className={`fw-bold small ${revenueData.thisMonth >= revenueData.lastMonth ? 'text-success' : 'text-danger'}`}>
                {revenueData.thisMonth >= revenueData.lastMonth ? '+' : ''}
                {(((revenueData.thisMonth - revenueData.lastMonth) / revenueData.lastMonth) * 100).toFixed(1)}% vs Last Month
              </div>
            )}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="section-header">
          <i className="bi bi-grid-fill"></i> REVENUE BREAKDOWN
        </div>
        <div className="grid-2x2">
          <div className="rev-box">
            <div className="rev-label">Today</div>
            <h4 className="rev-value">₱{revenueData.today.toLocaleString()}</h4>
          </div>
          <div className="rev-box">
            <div className="rev-label">This Week</div>
            <h4 className="rev-value">₱{revenueData.thisWeek.toLocaleString()}</h4>
          </div>
          <div className="rev-box">
            <div className="rev-label">Last Month</div>
            <h4 className="rev-value">₱{revenueData.lastMonth.toLocaleString()}</h4>
          </div>
          <div className="rev-box">
            <div className="rev-label">Annual</div>
            <h4 className="rev-value">₱{revenueData.thisYear.toLocaleString()}</h4>
          </div>
        </div>

        {/* Detailed Insights */}
        <div className="row g-4">
          <div className="col-lg-6">
            <div className="section-header">
              <i className="bi bi-lightning-charge-fill"></i> PERFORMANCE
            </div>
            <div className="premium-card p-4">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                  <div className="rev-label mb-1">Daily Average</div>
                  <h3 className="fw-black mb-0">₱{(revenueData.thisMonth / new Date().getDate()).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                </div>
                <div className="text-end">
                  <div className="rev-label mb-1">Target Pace</div>
                  <h3 className="fw-black mb-0">₱{(revenueData.thisMonth * 1.2).toLocaleString(undefined, { maximumFractionDigits: 0 })}</h3>
                </div>
              </div>
              <div className="p-3 bg-light rounded-4">
                <div className="d-flex justify-content-between mb-2">
                  <span className="small fw-bold opacity-75">MONTHLY OVERVIEW</span>
                  <span className="small fw-black">{revenueData.completedCount} JOBS</span>
                </div>
                <div className="progress bg-white" style={{ height: '8px', borderRadius: '10px' }}>
                  <div 
                    className="progress-bar bg-black" 
                    role="progressbar" 
                    style={{ width: `${Math.min(100, (revenueData.thisMonth / (revenueData.lastMonth || 1)) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-lg-6">
            <div className="section-header">
              <i className="bi bi-bar-chart-fill"></i> ANNUAL STATS
            </div>
            <div className="premium-card p-4 h-100">
              <div className="d-flex flex-column gap-3">
                <div className="d-flex justify-content-between align-items-center p-3 bg-light rounded-4">
                  <span className="fw-bold small">TOTAL YEAR REVENUE</span>
                  <span className="fw-black">₱{revenueData.thisYear.toLocaleString()}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center p-3 bg-light rounded-4">
                  <span className="fw-bold small">MONTHLY PROJECTION</span>
                  <span className="fw-black">₱{(revenueData.thisYear / (new Date().getMonth() + 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center p-3 bg-light rounded-4">
                  <span className="fw-bold small">SYSTEM RANK</span>
                  <span className="badge bg-black text-white px-3">TOP 10%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="mt-5 text-center">
          <p className="text-muted small mb-4">
            <i className="bi bi-shield-check me-2"></i>
            Revenue data is automatically calculated from your completed appointments.
          </p>
          <button className="btn-rev-primary" onClick={handleRefresh}>
            REFRESH METRICS <i className="bi bi-arrow-repeat ms-2"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BarberRevenue;
