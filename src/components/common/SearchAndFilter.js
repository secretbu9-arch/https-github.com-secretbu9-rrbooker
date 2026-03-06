// components/common/SearchAndFilter.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const SearchAndFilter = ({ type, onResults, initialFilters = {} }) => {
  const today = new Date().toISOString().split('T')[0];
  const [filters, setFilters] = useState({
    status: '',
    barber_id: '',
    service_id: '',
    addon_id: '',
    start_date: initialFilters.start_date || today,
    end_date: initialFilters.end_date || today,
    ...initialFilters
  });
  const [availableFilters, setAvailableFilters] = useState({});
  const [loading, setLoading] = useState(false);

  // Configure filters based on search type
  const filterConfigs = {
    appointments: {
      status: ['all', 'pending', 'scheduled', 'confirmed', 'ongoing', 'completed', 'cancelled'],
      barber: [],
      service: [],
      dateRange: ['today', 'week', 'month', 'custom']
    },
    products: {
      category: ['all', 'hair care', 'styling', 'beard care', 'tools'],
      price: ['all', 'under-500', '500-1000', 'over-1000'],
      inStock: ['all', 'in-stock', 'out-of-stock']
    },
    services: {
      duration: ['all', 'quick', 'standard', 'premium'],
      price: ['all', 'budget', 'standard', 'premium']
    },
    users: {
      role: ['all', 'customer', 'barber', 'manager'],
      status: ['all', 'active', 'inactive']
    }
  };

  useEffect(() => {
    loadAvailableFilters();
  }, [type]);

  useEffect(() => {
    performSearch();
  }, [filters]);

  const loadAvailableFilters = async () => {
    try {
      const config = filterConfigs[type] || {};
      const dynamicFilters = {};

      // Load dynamic filter options based on type
      if (type === 'appointments') {
        // Load barbers
        const { data: barbers } = await supabase
          .from('users')
          .select('id, full_name')
          .eq('role', 'barber');

        config.barber = [{ value: '', label: 'All Barbers' }, ...barbers?.map(b => ({
          value: b.id,
          label: b.full_name
        })) || []];

        // Load services
        const { data: services } = await supabase
          .from('services')
          .select('id, name')
          .eq('is_active', true)
          .order('price', { ascending: true });

        config.service = [{ value: '', label: 'All Services' }, ...services?.map(s => ({
          value: s.id,
          label: s.name
        })) || []];

        // Load addons
        const { data: addons } = await supabase
          .from('add_ons')
          .select('id, name')
          .eq('is_active', true)
          .order('price', { ascending: true });

        config.addon = [{ value: '', label: 'All Add-ons' }, ...addons?.map(a => ({
          value: a.id,
          label: a.name
        })) || []];
      }

      setAvailableFilters(config);
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  };

  const performSearch = async () => {
    setLoading(true);
    try {
      let query = supabase.from(getTableName()).select(getSelectFields());

      // Apply filters
      if (filters.status && filters.status !== 'all' && filters.status !== '') {
        query = query.eq('status', filters.status);
      }

      if (filters.barber_id && filters.barber_id !== '') {
        query = query.eq('barber_id', filters.barber_id);
      }

      if (filters.service_id && filters.service_id !== '') {
        query = query.eq('service_id', filters.service_id);
      }

      if (filters.addon_id && filters.addon_id !== '') {
        // Filter by addon - check if addon ID is in the add_ons_data array
        query = query.contains('add_ons_data', [filters.addon_id]);
      }

      // Apply date range filter
      if (filters.start_date && filters.end_date) {
        query = query.gte('appointment_date', filters.start_date)
          .lte('appointment_date', filters.end_date);
      } else if (filters.start_date) {
        query = query.gte('appointment_date', filters.start_date);
      } else if (filters.end_date) {
        query = query.lte('appointment_date', filters.end_date);
      }

      // Apply ordering
      query = applyOrdering(query);

      const { data, error } = await query;

      if (error) throw error;
      onResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
      onResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getTableName = () => {
    switch (type) {
      case 'appointments': return 'appointments';
      case 'products': return 'products';
      case 'services': return 'services';
      case 'users': return 'users';
      default: return type;
    }
  };

  const getSelectFields = () => {
    switch (type) {
      case 'appointments':
        return `
          *,
          customer:customer_id(id, full_name, email, phone),
          barber:barber_id(id, full_name, email, phone),
          service:service_id(id, name, price, duration, description)
        `;
      case 'products':
        return '*';
      case 'services':
        return '*';
      case 'users':
        return 'id, full_name, email, role, created_at';
      default:
        return '*';
    }
  };


  const applyOrdering = (query) => {
    switch (type) {
      case 'appointments':
        return query.order('appointment_date', { ascending: false }).order('appointment_time', { ascending: true });
      case 'products':
        return query.order('name');
      case 'services':
        return query.order('price', { ascending: true });
      case 'users':
        return query.order('created_at', { ascending: false });
      default:
        return query;
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const resetFilters = () => {
    const today = new Date().toISOString().split('T')[0];
    setFilters({
      status: '',
      barber_id: '',
      service_id: '',
      addon_id: '',
      start_date: today,
      end_date: today,
      ...initialFilters
    });
  };

  const exportResults = async () => {
    try {
      // This would export search results to CSV
      // Implementation depends on requirements
      alert('Export functionality coming soon!');
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  if (type !== 'appointments') {
    // For other types, return the original component
    return null;
  }

  return (
    <div className="card mb-4 border-0 shadow-sm">
      <div className="card-header bg-white border-bottom py-3">
        <h6 className="mb-0 fw-bold">
          <i className="bi bi-funnel me-2"></i>
          Filters
        </h6>
      </div>
      <div className="card-body">
        <div className="row g-3">
          {/* Status Filter */}
          <div className="col-md-2">
            <label className="form-label fw-bold small">
              <i className="bi bi-tag me-1"></i>
              Status
            </label>
            <select
              className="form-select"
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="scheduled">Scheduled</option>
              <option value="confirmed">Confirmed</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Barber Filter */}
          <div className="col-md-2">
            <label className="form-label fw-bold small">
              <i className="bi bi-person-badge me-1"></i>
              Barber
            </label>
            <select
              className="form-select"
              value={filters.barber_id || ''}
              onChange={(e) => handleFilterChange('barber_id', e.target.value)}
            >
              <option value="">All Barbers</option>
              {availableFilters.barber?.slice(1).map(barber => (
                <option key={barber.value} value={barber.value}>
                  {barber.label}
                </option>
              ))}
            </select>
          </div>

          {/* Service Filter */}
          <div className="col-md-2">
            <label className="form-label fw-bold small">
              <i className="bi bi-scissors me-1"></i>
              Service
            </label>
            <select
              className="form-select"
              value={filters.service_id || ''}
              onChange={(e) => handleFilterChange('service_id', e.target.value)}
            >
              <option value="">All Services</option>
              {availableFilters.service?.slice(1).map(service => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
          </div>

          {/* Add-on Filter */}
          <div className="col-md-2">
            <label className="form-label fw-bold small">
              <i className="bi bi-plus-circle me-1"></i>
              Add-on
            </label>
            <select
              className="form-select"
              value={filters.addon_id || ''}
              onChange={(e) => handleFilterChange('addon_id', e.target.value)}
            >
              <option value="">All Add-ons</option>
              {availableFilters.addon?.slice(1).map(addon => (
                <option key={addon.value} value={addon.value}>
                  {addon.label}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div className="col-md-2">
            <label className="form-label fw-bold small">
              <i className="bi bi-calendar-event me-1"></i>
              Start Date
            </label>
            <div className="position-relative">
              <input
                type="date"
                className="form-control"
                value={filters.start_date || ''}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                max={filters.end_date || undefined}
                style={{
                  paddingLeft: '2.5rem',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              />
              <i className="bi bi-calendar3 position-absolute"
                style={{
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#6c757d',
                  pointerEvents: 'none'
                }}></i>
            </div>
          </div>

          {/* End Date */}
          <div className="col-md-2">
            <label className="form-label fw-bold small">
              <i className="bi bi-calendar-check me-1"></i>
              End Date
            </label>
            <div className="position-relative">
              <input
                type="date"
                className="form-control"
                value={filters.end_date || ''}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                min={filters.start_date || undefined}
                style={{
                  paddingLeft: '2.5rem',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              />
              <i className="bi bi-calendar3 position-absolute"
                style={{
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#6c757d',
                  pointerEvents: 'none'
                }}></i>
            </div>
          </div>
        </div>

        <div className="row mt-3">
          <div className="col-12 text-end">
            <button className="btn btn-outline-secondary btn-sm" onClick={resetFilters}>
              <i className="bi bi-arrow-counterclockwise me-1"></i>
              Reset Filters
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-center mt-3">
            <div className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchAndFilter;