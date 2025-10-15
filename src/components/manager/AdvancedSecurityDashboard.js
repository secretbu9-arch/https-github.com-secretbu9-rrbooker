// components/manager/AdvancedSecurityDashboard.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { advancedFakeUserPrevention } from '../../services/AdvancedFakeUserPrevention';

const AdvancedSecurityDashboard = () => {
  const [stats, setStats] = useState({
    totalViolations: 0,
    rateLimitViolations: 0,
    suspiciousDevices: 0,
    blockedIPs: 0,
    verifiedUsers: 0,
    riskDistribution: {}
  });
  
  const [recentViolations, setRecentViolations] = useState([]);
  const [suspiciousDevices, setSuspiciousDevices] = useState([]);
  const [rateLimitStats, setRateLimitStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTimeframe, setSelectedTimeframe] = useState('24'); // hours

  useEffect(() => {
    loadSecurityData();
  }, [selectedTimeframe]);

  const loadSecurityData = async () => {
    try {
      setLoading(true);
      setError('');

      const hoursAgo = new Date(Date.now() - selectedTimeframe * 60 * 60 * 1000).toISOString();

      // Load security statistics
      await Promise.all([
        loadSecurityStats(hoursAgo),
        loadRecentViolations(hoursAgo),
        loadSuspiciousDevices(hoursAgo),
        loadRateLimitStats(hoursAgo)
      ]);

    } catch (err) {
      console.error('Error loading security data:', err);
      setError('Failed to load security data');
    } finally {
      setLoading(false);
    }
  };

  const loadSecurityStats = async (since) => {
    try {
      // Get total violations
      const { data: violations } = await supabase
        .from('security_violations')
        .select('*', { count: 'exact' })
        .gte('created_at', since);

      // Get rate limit violations
      const { data: rateLimitViolations } = await supabase
        .from('security_violations')
        .select('*', { count: 'exact' })
        .eq('violation_type', 'rate_limit_exceeded')
        .gte('created_at', since);

      // Get suspicious devices
      const { data: devices } = await supabase
        .from('device_fingerprints')
        .select('*', { count: 'exact' })
        .gt('risk_score', 50)
        .gte('last_seen', since);

      // Get verified users
      const { data: verifiedUsers } = await supabase
        .from('social_verifications')
        .select('user_id', { count: 'exact' })
        .eq('is_active', true)
        .gte('verified_at', since);

      setStats(prev => ({
        ...prev,
        totalViolations: violations?.length || 0,
        rateLimitViolations: rateLimitViolations?.length || 0,
        suspiciousDevices: devices?.length || 0,
        verifiedUsers: verifiedUsers?.length || 0
      }));

    } catch (error) {
      console.error('Error loading security stats:', error);
    }
  };

  const loadRecentViolations = async (since) => {
    try {
      const { data } = await supabase
        .from('security_violations')
        .select(`
          *,
          user:user_id (email, full_name)
        `)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20);

      setRecentViolations(data || []);
    } catch (error) {
      console.error('Error loading recent violations:', error);
    }
  };

  const loadSuspiciousDevices = async (since) => {
    try {
      const { data } = await supabase
        .from('device_fingerprints')
        .select(`
          *,
          user:user_id (email, full_name)
        `)
        .gt('risk_score', 50)
        .gte('last_seen', since)
        .order('risk_score', { ascending: false })
        .limit(20);

      setSuspiciousDevices(data || []);
    } catch (error) {
      console.error('Error loading suspicious devices:', error);
    }
  };

  const loadRateLimitStats = async (since) => {
    try {
      const { data } = await supabase
        .from('rate_limit_logs')
        .select('action, created_at')
        .gte('created_at', since);

      // Group by action and count
      const stats = (data || []).reduce((acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {});

      setRateLimitStats(Object.entries(stats).map(([action, count]) => ({
        action,
        count
      })));
    } catch (error) {
      console.error('Error loading rate limit stats:', error);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'danger';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'secondary';
    }
  };

  const getRiskColor = (score) => {
    if (score >= 80) return 'danger';
    if (score >= 60) return 'warning';
    if (score >= 40) return 'info';
    if (score >= 20) return 'success';
    return 'secondary';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const handleBlockUser = async (userId) => {
    try {
      // This would implement user blocking logic
      console.log('Blocking user:', userId);
      // Implementation would go here
    } catch (error) {
      console.error('Error blocking user:', error);
    }
  };

  const handleInvestigateUser = async (userId) => {
    try {
      // This would implement user investigation logic
      console.log('Investigating user:', userId);
      // Implementation would go here
    } catch (error) {
      console.error('Error investigating user:', error);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2><i className="bi bi-shield-lock me-2"></i>Advanced Security Dashboard</h2>
            <div className="d-flex gap-2">
              <select 
                className="form-select" 
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                style={{ width: 'auto' }}
              >
                <option value="1">Last 1 hour</option>
                <option value="24">Last 24 hours</option>
                <option value="168">Last 7 days</option>
                <option value="720">Last 30 days</option>
              </select>
              <button 
                className="btn btn-outline-primary"
                onClick={loadSecurityData}
              >
                <i className="bi bi-arrow-clockwise"></i> Refresh
              </button>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              <i className="bi bi-exclamation-triangle me-2"></i>
              {error}
            </div>
          )}

          {/* Security Statistics Cards */}
          <div className="row mb-4">
            <div className="col-md-3">
              <div className="card bg-danger text-white">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h4 className="card-title">{stats.totalViolations}</h4>
                      <p className="card-text">Security Violations</p>
                    </div>
                    <div className="align-self-center">
                      <i className="bi bi-shield-x fs-1"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-md-3">
              <div className="card bg-warning text-white">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h4 className="card-title">{stats.rateLimitViolations}</h4>
                      <p className="card-text">Rate Limit Violations</p>
                    </div>
                    <div className="align-self-center">
                      <i className="bi bi-speedometer2 fs-1"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-md-3">
              <div className="card bg-info text-white">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h4 className="card-title">{stats.suspiciousDevices}</h4>
                      <p className="card-text">Suspicious Devices</p>
                    </div>
                    <div className="align-self-center">
                      <i className="bi bi-laptop fs-1"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-md-3">
              <div className="card bg-success text-white">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h4 className="card-title">{stats.verifiedUsers}</h4>
                      <p className="card-text">Verified Users</p>
                    </div>
                    <div className="align-self-center">
                      <i className="bi bi-check-circle fs-1"></i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rate Limit Statistics */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h5 className="card-title mb-0">Rate Limit Statistics</h5>
                </div>
                <div className="card-body">
                  {rateLimitStats.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-hover">
                        <thead>
                          <tr>
                            <th>Action</th>
                            <th>Attempts</th>
                            <th>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rateLimitStats.map((stat, index) => (
                            <tr key={index}>
                              <td>
                                <span className="badge bg-primary">{stat.action}</span>
                              </td>
                              <td>{stat.count}</td>
                              <td>
                                <div className="progress" style={{ width: '100px' }}>
                                  <div 
                                    className="progress-bar bg-warning" 
                                    style={{ 
                                      width: `${(stat.count / Math.max(...rateLimitStats.map(s => s.count))) * 100}%` 
                                    }}
                                  >
                                    {Math.round((stat.count / Math.max(...rateLimitStats.map(s => s.count))) * 100)}%
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center text-muted py-4">
                      <i className="bi bi-graph-down fs-1"></i>
                      <p className="mt-2">No rate limit violations in the selected timeframe</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Security Violations */}
          <div className="row mb-4">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h5 className="card-title mb-0">Recent Security Violations</h5>
                </div>
                <div className="card-body">
                  {recentViolations.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-hover">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Violation Type</th>
                            <th>Severity</th>
                            <th>IP Address</th>
                            <th>Date</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentViolations.map((violation) => (
                            <tr key={violation.id}>
                              <td>
                                {violation.user ? (
                                  <div>
                                    <div className="fw-bold">{violation.user.full_name}</div>
                                    <small className="text-muted">{violation.user.email}</small>
                                  </div>
                                ) : (
                                  <span className="text-muted">Unknown User</span>
                                )}
                              </td>
                              <td>
                                <span className="badge bg-secondary">
                                  {violation.violation_type.replace('_', ' ')}
                                </span>
                              </td>
                              <td>
                                <span className={`badge bg-${getSeverityColor(violation.severity)}`}>
                                  {violation.severity.toUpperCase()}
                                </span>
                              </td>
                              <td>
                                <code>{violation.ip_address}</code>
                              </td>
                              <td>
                                <small>{formatDate(violation.created_at)}</small>
                              </td>
                              <td>
                                <div className="btn-group btn-group-sm">
                                  <button 
                                    className="btn btn-outline-primary"
                                    onClick={() => handleInvestigateUser(violation.user_id)}
                                  >
                                    <i className="bi bi-search"></i>
                                  </button>
                                  <button 
                                    className="btn btn-outline-danger"
                                    onClick={() => handleBlockUser(violation.user_id)}
                                  >
                                    <i className="bi bi-ban"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center text-muted py-4">
                      <i className="bi bi-shield-check fs-1"></i>
                      <p className="mt-2">No security violations in the selected timeframe</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Suspicious Devices */}
          <div className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h5 className="card-title mb-0">Suspicious Devices</h5>
                </div>
                <div className="card-body">
                  {suspiciousDevices.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-hover">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Device Fingerprint</th>
                            <th>Risk Score</th>
                            <th>First Seen</th>
                            <th>Last Seen</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {suspiciousDevices.map((device) => (
                            <tr key={device.id}>
                              <td>
                                {device.user ? (
                                  <div>
                                    <div className="fw-bold">{device.user.full_name}</div>
                                    <small className="text-muted">{device.user.email}</small>
                                  </div>
                                ) : (
                                  <span className="text-muted">Unknown User</span>
                                )}
                              </td>
                              <td>
                                <code className="small">{device.fingerprint_hash.substring(0, 16)}...</code>
                              </td>
                              <td>
                                <span className={`badge bg-${getRiskColor(device.risk_score)}`}>
                                  {device.risk_score}/100
                                </span>
                              </td>
                              <td>
                                <small>{formatDate(device.first_seen)}</small>
                              </td>
                              <td>
                                <small>{formatDate(device.last_seen)}</small>
                              </td>
                              <td>
                                <span className={`badge ${device.is_trusted ? 'bg-success' : 'bg-warning'}`}>
                                  {device.is_trusted ? 'Trusted' : 'Suspicious'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center text-muted py-4">
                      <i className="bi bi-laptop fs-1"></i>
                      <p className="mt-2">No suspicious devices in the selected timeframe</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedSecurityDashboard;
