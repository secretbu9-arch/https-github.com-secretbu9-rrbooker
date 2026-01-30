import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { ROUTES } from '../utils/constants';

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
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        // Calculate date ranges
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const startOfLastMonthStr = startOfLastMonth.toISOString().split('T')[0];
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        const endOfLastMonthStr = endOfLastMonth.toISOString().split('T')[0];

        const startOfYear = new Date(today.getFullYear(), 0, 1);
        const startOfYearStr = startOfYear.toISOString().split('T')[0];

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

        // Calculate revenue helper function
        const calculateRevenue = (appointments) => {
          if (!Array.isArray(appointments)) return 0;
          return appointments.reduce((sum, apt) => {
            const price = Number(apt.total_price) || Number(apt.service?.price) || 0;
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
          today.setHours(0, 0, 0, 0);
          const todayStr = today.toISOString().split('T')[0];

          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

          const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const startOfLastMonthStr = startOfLastMonth.toISOString().split('T')[0];
          const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
          const endOfLastMonthStr = endOfLastMonth.toISOString().split('T')[0];

          const startOfYear = new Date(today.getFullYear(), 0, 1);
          const startOfYearStr = startOfYear.toISOString().split('T')[0];

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
              const price = Number(apt.total_price) || Number(apt.service?.price) || 0;
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
    <div className="container-fluid px-2 px-md-4 py-3 py-md-4">
      {/* Header - Simple with White Background */}
      <div className="card shadow-sm border mb-4 bg-white">
        <div className="card-body p-3 p-md-4">
          <div className="d-flex flex-column flex-md-row align-items-start align-items-md-center justify-content-between gap-2 gap-md-3">
            <div className="flex-grow-1 w-100">
              <h2 className="mb-1" style={{ fontSize: 'clamp(1.1rem, 3.2vw, 1.5rem)' }}>
                <i className="bi bi-graph-up-arrow me-2 text-primary"></i>
                Revenue Tracking
              </h2>
              <p className="text-muted mb-0 small" style={{ fontSize: 'clamp(0.75rem, 2.4vw, 0.9rem)' }}>
                Your revenue metrics at a glance
              </p>
              {lastUpdated && (
                <small className="text-muted d-block mt-1" style={{ fontSize: 'clamp(0.7rem, 2.2vw, 0.85rem)' }}>
                  <i className="bi bi-clock-history me-1"></i>
                  Last updated: {new Date(lastUpdated).toLocaleTimeString()}
                </small>
              )}
            </div>
            <div className="d-flex gap-2 align-items-center justify-content-end flex-shrink-0" style={{ zIndex: 10 }}>
              <Link
                to={ROUTES.DASHBOARD}
                className="btn btn-outline-secondary d-flex align-items-center px-3"
                style={{
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
              >
                <i className="bi bi-arrow-left me-2"></i>
                <span>Back</span>
              </Link>
              <button
                className="btn btn-primary d-flex align-items-center px-3"
                onClick={handleRefresh}
                disabled={loading}
                type="button"
                style={{
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    <span>Refreshing...</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-arrow-clockwise me-2"></i>
                    <span>Refresh</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-warning alert-dismissible fade show mb-3" role="alert">
          <i className="bi bi-exclamation-triangle me-2"></i>
          <span className="small">{error}</span>
          <button
            type="button"
            className="btn-close btn-close-sm"
            onClick={() => setError('')}
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Revenue Cards - Hybrid Layout (Old Mobile + New Web) */}
      <div className="row g-2 g-md-3 mb-3 mb-md-4">
        {/* Today */}
        <div className="col-6 col-md-4">
          <div className="card h-100 shadow-sm border-0 revenue-card">
            <div className="card-body p-2 p-md-4 text-center">
              <div className="d-flex align-items-center justify-content-center mb-1 mb-md-2">
                <i className="bi bi-calendar-day text-success me-1 me-md-2" style={{ fontSize: '1.2rem' }}></i>
                <h6 className="card-title text-muted text-uppercase mb-0 small fw-bold">Today</h6>
              </div>
              <h3 className="h4 h-md-2 mb-1 text-success fw-bold">
                ₱{revenueData.today.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <small className="text-muted d-block mt-1">Revenue today</small>
            </div>
          </div>
        </div>

        {/* This Week */}
        <div className="col-6 col-md-4">
          <div className="card h-100 shadow-sm border-0 revenue-card">
            <div className="card-body p-2 p-md-4 text-center">
              <div className="d-flex align-items-center justify-content-center mb-1 mb-md-2">
                <i className="bi bi-calendar-week text-primary me-1 me-md-2" style={{ fontSize: '1.2rem' }}></i>
                <h6 className="card-title text-muted text-uppercase mb-0 small fw-bold">This Week</h6>
              </div>
              <h3 className="h4 h-md-2 mb-1 text-primary fw-bold">
                ₱{revenueData.thisWeek.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <small className="text-muted d-block mt-1">Weekly revenue</small>
            </div>
          </div>
        </div>

        {/* This Month */}
        <div className="col-6 col-md-4">
          <div className="card h-100 shadow-sm border-0 revenue-card">
            <div className="card-body p-2 p-md-4 text-center">
              <div className="d-flex align-items-center justify-content-center mb-1 mb-md-2">
                <i className="bi bi-calendar-month text-info me-1 me-md-2" style={{ fontSize: '1.2rem' }}></i>
                <h6 className="card-title text-muted text-uppercase mb-0 small fw-bold">This Month</h6>
              </div>
              <h3 className="h4 h-md-2 mb-1 text-info fw-bold">
                ₱{revenueData.thisMonth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <small className="text-muted d-block mt-1">{revenueData.completedCount} appointment{revenueData.completedCount !== 1 ? 's' : ''}</small>
            </div>
          </div>
        </div>

        {/* Last Month */}
        <div className="col-6 col-md-6">
          <div className="card h-100 shadow-sm border-0 revenue-card">
            <div className="card-body p-2 p-md-4 text-center">
              <div className="d-flex align-items-center justify-content-center mb-1 mb-md-2">
                <i className="bi bi-calendar-minus text-secondary me-1 me-md-2" style={{ fontSize: '1.2rem' }}></i>
                <h6 className="card-title text-muted text-uppercase mb-0 small fw-bold">Last Month</h6>
              </div>
              <h3 className="h4 h-md-2 mb-1 text-secondary fw-bold">
                ₱{revenueData.lastMonth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              {revenueData.lastMonth > 0 && revenueData.thisMonth > 0 && (
                <small className={`d-block mt-1 fw-bold ${revenueData.thisMonth > revenueData.lastMonth ? 'text-success' : 'text-danger'}`}>
                  {revenueData.thisMonth > revenueData.lastMonth ? <i className="bi bi-arrow-up-right me-1"></i> : <i className="bi bi-arrow-down-right me-1"></i>}
                  {Math.abs(((revenueData.thisMonth - revenueData.lastMonth) / revenueData.lastMonth * 100)).toFixed(1)}%
                </small>
              )}
            </div>
          </div>
        </div>

        {/* This Year */}
        <div className="col-12 col-md-6">
          <div className="card h-100 shadow-sm border-0 revenue-card">
            <div className="card-body p-3 p-md-4 text-center">
              <div className="d-flex align-items-center justify-content-center mb-2">
                <i className="bi bi-calendar-year text-warning me-2" style={{ fontSize: '1.5rem' }}></i>
                <h6 className="card-title text-muted text-uppercase mb-0 small fw-bold">This Year {new Date().getFullYear()}</h6>
              </div>
              <h3 className="h2 mb-1 text-warning fw-bold">
                ₱{revenueData.thisYear.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
              <div className="d-flex justify-content-center gap-3 mt-2 flex-wrap">
                <span className="badge bg-light text-dark p-2 border">
                  Monthly Avg: ₱{(revenueData.thisYear / (new Date().getMonth() + 1)).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                <span className="badge bg-light text-dark p-2 border">
                  Daily Avg: ₱{(revenueData.thisYear / ((new Date() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24))).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Section - Mobile Optimized */}
      <div className="row g-2 g-md-3">
        <div className="col-12">
          <div className="card shadow-sm border-0">
            <div className="card-header bg-light py-2 py-md-3">
              <h5 className="mb-0 small fw-bold">
                <i className="bi bi-graph-up me-2"></i>
                Revenue Summary
              </h5>
            </div>
            <div className="card-body p-2 p-md-4">
              <div className="row g-2 g-md-3 text-center">
                <div className="col-6 col-md-4">
                  <div className="p-2 p-md-3 bg-light rounded">
                    <strong className="d-block mb-1 small">Daily Avg</strong>
                    <div className="h5 h-md-4 mt-1 mt-md-2 text-primary fw-bold">
                      ₱{revenueData.thisWeek > 0
                        ? (revenueData.thisWeek / 7).toLocaleString('en-US', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        })
                        : '0'
                      }
                    </div>
                    <small className="text-muted d-none d-md-block">This week</small>
                  </div>
                </div>
                <div className="col-6 col-md-4">
                  <div className="p-2 p-md-3 bg-light rounded">
                    <strong className="d-block mb-1 small">Monthly</strong>
                    <div className="h5 h-md-4 mt-1 mt-md-2 text-success fw-bold">
                      ₱{revenueData.thisMonth.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </div>
                    <small className="text-muted d-none d-md-block">Current month</small>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="p-2 p-md-3 bg-light rounded">
                    <strong className="d-block mb-1 small">Completed</strong>
                    <div className="h5 h-md-4 mt-1 mt-md-2 text-info fw-bold">
                      {revenueData.completedCount}
                    </div>
                    <small className="text-muted d-none d-md-block">This month</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarberRevenue;
