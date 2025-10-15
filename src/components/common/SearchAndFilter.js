// components/common/SearchAndFilter.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const SearchAndFilter = ({ type, onResults, initialFilters = {} }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(initialFilters);
  const [availableFilters, setAvailableFilters] = useState({});
  const [loading, setLoading] = useState(false);

  // Configure filters based on search type
  const filterConfigs = {
    appointments: {
      status: ['all', 'pending', 'scheduled', 'confirmed', 'ongoing', 'done', 'cancelled'],
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
  }, [searchQuery, filters]);

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
          .eq('is_active', true);
        
        config.service = [{ value: '', label: 'All Services' }, ...services?.map(s => ({
          value: s.id,
          label: s.name
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

      // Apply search query
      if (searchQuery) {
        query = applyTextSearch(query);
      }

      // Apply filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== 'all' && value !== '') {
          query = applyFilter(query, key, value);
        }
      });

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
          customer:customer_id(full_name, email),
          barber:barber_id(full_name),
          service:service_id(name, price)
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

  const applyTextSearch = (query) => {
    switch (type) {
      case 'appointments':
        return query.or(`customer.full_name.ilike.%${searchQuery}%,service.name.ilike.%${searchQuery}%`);
      case 'products':
        return query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      case 'services':
        return query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      case 'users':
        return query.or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
      default:
        return query;
    }
  };

  const applyFilter = (query, key, value) => {
    switch (type) {
      case 'appointments':
        if (key === 'status') return query.eq('status', value);
        if (key === 'barber') return query.eq('barber_id', value);
        if (key === 'service') return query.eq('service_id', value);
        if (key === 'dateRange') return applyDateRangeFilter(query, value);
        break;
      case 'products':
        if (key === 'price') return applyPriceFilter(query, value);
        if (key === 'inStock') return value === 'in-stock' ? query.gt('stock_quantity', 0) : query.eq('stock_quantity', 0);
        break;
      case 'users':
        if (key === 'role') return query.eq('role', value);
        break;
    }
    return query;
  };

  const applyDateRangeFilter = (query, range) => {
    const today = new Date();
    let startDate, endDate;

    switch (range) {
      case 'today':
        startDate = endDate = today.toISOString().split('T')[0];
        break;
      case 'week':
        startDate = new Date(today.setDate(today.getDate() - 7)).toISOString().split('T')[0];
        endDate = new Date().toISOString().split('T')[0];
        break;
      case 'month':
        startDate = new Date(today.setMonth(today.getMonth() - 1)).toISOString().split('T')[0];
        endDate = new Date().toISOString().split('T')[0];
        break;
      default:
        return query;
    }

    return query.gte('appointment_date', startDate).lte('appointment_date', endDate);
  };

  const applyPriceFilter = (query, range) => {
    switch (range) {
      case 'under-500':
        return query.lt('price', 500);
      case '500-1000':
        return query.gte('price', 500).lte('price', 1000);
      case 'over-1000':
        return query.gt('price', 1000);
      default:
        return query;
    }
  };

  const applyOrdering = (query) => {
    switch (type) {
      case 'appointments':
        return query.order('appointment_date').order('appointment_time');
      case 'products':
        return query.order('name');
      case 'services':
        return query.order('name');
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
    setSearchQuery('');
    setFilters(initialFilters);
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

  return (
    <div className="card mb-4">
      <div className="card-header">
        <div className="row align-items-center">
          <div className="col-md-6">
            <div className="input-group">
              <span className="input-group-text">
                <i className="bi bi-search"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder={`Search ${type}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="col-md-6 text-end">
            <button className="btn btn-outline-secondary me-2" onClick={resetFilters}>
              <i className="bi bi-arrow-counterclockwise me-1"></i>
              Reset
            </button>
            <button className="btn btn-outline-primary" onClick={exportResults}>
              <i className="bi bi-download me-1"></i>
              Export
            </button>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="row g-3">
          {Object.entries(availableFilters).map(([filterKey, options]) => (
            <div key={filterKey} className="col-md-3">
              <label className="form-label text-capitalize">{filterKey}</label>
              <select
                className="form-select"
                value={filters[filterKey] || ''}
                onChange={(e) => handleFilterChange(filterKey, e.target.value)}
              >
                {Array.isArray(options) && typeof options[0] === 'string' ? (
                  options.map(option => (
                    <option key={option} value={option === 'all' ? '' : option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))
                ) : Array.isArray(options) ? (
                  options.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))
                ) : null}
              </select>
            </div>
          ))}
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