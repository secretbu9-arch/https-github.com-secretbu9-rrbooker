// components/manager/ManageServices.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/ApiService';
import { formatPrice } from '../utils/helpers';
import { isValidPrice } from '../utils/validators';
import LoadingSpinner from '../common/LoadingSpinner';

const ManageServices = () => {
  // Services state
  const [services, setServices] = useState([]);
  const [serviceUsage, setServiceUsage] = useState({});
  
  // Add-ons state
  const [addOns, setAddOns] = useState([]);
  const [addOnUsage, setAddOnUsage] = useState({});
  
  // Common state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('services'); // 'services' or 'addons'
  
  // Service form state
  const [selectedService, setSelectedService] = useState(null);
  const [isEditingService, setIsEditingService] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceFormData, setServiceFormData] = useState({
    name: '',
    description: '',
    price: '',
    duration: '',
    is_active: true
  });
  
  // Add-on form state
  const [selectedAddOn, setSelectedAddOn] = useState(null);
  const [isEditingAddOn, setIsEditingAddOn] = useState(false);
  const [showAddOnModal, setShowAddOnModal] = useState(false);
  const [addOnFormData, setAddOnFormData] = useState({
    name: '',
    description: '',
    price: '',
    duration: '',
    category: '',
    is_active: true
  });
  
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchInitialData();
    
    // Set up subscription for service changes
    const servicesSubscription = supabase
      .channel('services-changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'services'
        }, 
        () => {
          fetchServices();
        }
      )
      .subscribe();
    
    // Set up subscription for add-ons changes
    const addOnsSubscription = supabase
      .channel('addons-changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'add_ons'
        }, 
        () => {
          fetchAddOns();
        }
      )
      .subscribe();
    
    return () => {
      servicesSubscription.unsubscribe();
      addOnsSubscription.unsubscribe();
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch both services and add-ons in parallel
      const [servicesData, addOnsData] = await Promise.all([
        apiService.getServices(true),
        apiService.getAddOns()
      ]);
      
      setServices(servicesData);
      setAddOns(addOnsData);
      
      // Fetch usage information for both
      await Promise.all([
        fetchServiceUsage(servicesData),
        fetchAddOnUsage(addOnsData)
      ]);
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async () => {
    try {
      const data = await apiService.getServices(true);
      setServices(data);
      await fetchServiceUsage(data);
    } catch (error) {
      console.error('Error fetching services:', error);
      setError('Failed to load services. Please try again.');
    }
  };

  const fetchAddOns = async () => {
    try {
      const data = await apiService.getAddOns();
      setAddOns(data);
      await fetchAddOnUsage(data);
    } catch (error) {
      console.error('Error fetching add-ons:', error);
      setError('Failed to load add-ons. Please try again.');
    }
  };

  const fetchServiceUsage = async (servicesData) => {
    try {
      const usageData = {};
      
      for (const service of servicesData) {
        // Check direct service_id references
        const { data: directRefs, error: directError } = await supabase
          .from('appointments')
          .select('id, status')
          .eq('service_id', service.id)
          .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']);
        
        if (directError) {
          console.warn('Error checking direct service usage:', directError);
          continue;
        }
        
        // Check JSON services_data references
        const { data: jsonRefs, error: jsonError } = await supabase
          .from('appointments')
          .select('id, services_data, status')
          .not('services_data', 'is', null)
          .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']);
        
        let jsonReferences = 0;
        if (!jsonError && jsonRefs) {
          jsonReferences = jsonRefs.filter(apt => {
            try {
              const servicesData = typeof apt.services_data === 'string' 
                ? JSON.parse(apt.services_data) 
                : apt.services_data;
              return Array.isArray(servicesData) && servicesData.includes(service.id);
            } catch (e) {
              return false;
            }
          }).length;
        }
        
        const totalActive = (directRefs?.length || 0) + jsonReferences;
        usageData[service.id] = {
          directReferences: directRefs?.length || 0,
          jsonReferences,
          totalActive
        };
      }
      
      setServiceUsage(usageData);
    } catch (error) {
      console.error('Error fetching service usage:', error);
    }
  };

  const fetchAddOnUsage = async (addOnsData) => {
    try {
      const usageData = {};
      
      for (const addOn of addOnsData) {
        // Check JSON add_ons_data references
        const { data: jsonRefs, error: jsonError } = await supabase
          .from('appointments')
          .select('id, add_ons_data, status')
          .not('add_ons_data', 'is', null)
          .in('status', ['pending', 'scheduled', 'confirmed', 'ongoing']);
        
        let jsonReferences = 0;
        if (!jsonError && jsonRefs) {
          jsonReferences = jsonRefs.filter(apt => {
            try {
              const addOnsData = typeof apt.add_ons_data === 'string' 
                ? JSON.parse(apt.add_ons_data) 
                : apt.add_ons_data;
              return Array.isArray(addOnsData) && addOnsData.includes(addOn.id);
            } catch (e) {
              return false;
            }
          }).length;
        }
        
        usageData[addOn.id] = {
          totalActive: jsonReferences
        };
      }
      
      setAddOnUsage(usageData);
    } catch (error) {
      console.error('Error fetching add-on usage:', error);
    }
  };

  const handleServiceChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle checkbox differently
    const val = type === 'checkbox' ? checked : value;
    
    setServiceFormData(prev => ({
      ...prev,
      [name]: val
    }));
    
    // Clear validation error for this field
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const handleAddOnChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle checkbox differently
    const val = type === 'checkbox' ? checked : value;
    
    setAddOnFormData(prev => ({
      ...prev,
      [name]: val
    }));
    
    // Clear validation error for this field
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  const validateServiceForm = () => {
    const errors = {};
    
    // Required fields
    if (!serviceFormData.name.trim()) {
      errors.name = 'Service name is required';
    }
    
    if (!serviceFormData.price) {
      errors.price = 'Price is required';
    } else if (!isValidPrice(serviceFormData.price)) {
      errors.price = 'Price must be a valid number with up to 2 decimal places';
    }
    
    if (!serviceFormData.duration) {
      errors.duration = 'Duration is required';
    } else if (isNaN(serviceFormData.duration) || parseInt(serviceFormData.duration) <= 0) {
      errors.duration = 'Duration must be a positive number';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateAddOnForm = () => {
    const errors = {};
    
    // Required fields
    if (!addOnFormData.name.trim()) {
      errors.name = 'Add-on name is required';
    }
    
    if (!addOnFormData.price) {
      errors.price = 'Price is required';
    } else if (!isValidPrice(addOnFormData.price)) {
      errors.price = 'Price must be a valid number with up to 2 decimal places';
    }
    
    if (!addOnFormData.duration) {
      errors.duration = 'Duration is required';
    } else if (isNaN(addOnFormData.duration) || parseInt(addOnFormData.duration) <= 0) {
      errors.duration = 'Duration must be a positive number';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleServiceSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateServiceForm()) {
      return;
    }
    
    try {
      setLoading(true);
      
      // Prepare data with correct types
      const serviceData = {
        ...serviceFormData,
        price: parseFloat(serviceFormData.price),
        duration: parseInt(serviceFormData.duration)
      };
      
      let result;
      
      if (isEditingService && selectedService) {
        // Update existing service
        result = await apiService.updateService(selectedService.id, serviceData);
        
        // Update local state
        setServices(prev => 
          prev.map(service => 
            service.id === selectedService.id ? result : service
          )
        );
      } else {
        // Create new service
        result = await apiService.createService(serviceData);
        
        // Update local state
        setServices(prev => [...prev, result]);
      }
      
      // Close modal and reset form
      resetServiceFormAndCloseModal();
      
    } catch (error) {
      console.error('Error saving service:', error);
      setError('Failed to save service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddOnSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateAddOnForm()) {
      return;
    }
    
    try {
      setLoading(true);
      
      // Prepare data with correct types
      const addOnData = {
        ...addOnFormData,
        price: parseFloat(addOnFormData.price),
        duration: parseInt(addOnFormData.duration)
      };
      
      let result;
      
      if (isEditingAddOn && selectedAddOn) {
        // Update existing add-on
        result = await apiService.updateAddOn(selectedAddOn.id, addOnData);
        
        // Update local state
        setAddOns(prev => 
          prev.map(addOn => 
            addOn.id === selectedAddOn.id ? result : addOn
          )
        );
      } else {
        // Create new add-on
        result = await apiService.createAddOn(addOnData);
        
        // Update local state
        setAddOns(prev => [...prev, result]);
      }
      
      // Close modal and reset form
      resetAddOnFormAndCloseModal();
      
    } catch (error) {
      console.error('Error saving add-on:', error);
      setError('Failed to save add-on. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceEdit = (service) => {
    setSelectedService(service);
    setServiceFormData({
      name: service.name,
      description: service.description || '',
      price: service.price.toString(),
      duration: service.duration.toString(),
      is_active: service.is_active
    });
    setIsEditingService(true);
    setShowServiceModal(true);
  };

  const handleAddOnEdit = (addOn) => {
    setSelectedAddOn(addOn);
    setAddOnFormData({
      name: addOn.name,
      description: addOn.description || '',
      price: addOn.price.toString(),
      duration: addOn.duration.toString(),
      category: addOn.category || '',
      is_active: addOn.is_active
    });
    setIsEditingAddOn(true);
    setShowAddOnModal(true);
  };

  const handleServiceDelete = async (serviceId) => {
    const service = services.find(s => s.id === serviceId);
    const serviceName = service ? service.name : 'this service';
    
    if (!window.confirm(`Are you sure you want to delete "${serviceName}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null); // Clear previous errors
      
      await apiService.deleteService(serviceId);
      
      // Update local state
      setServices(prev => prev.filter(service => service.id !== serviceId));
      
      // Show success message (optional)
      console.log(`Service "${serviceName}" deleted successfully`);
      
    } catch (error) {
      console.error('Error deleting service:', error);
      
      // Provide specific error messages based on the error
      let errorMessage = 'Failed to delete service. Please try again.';
      let showDeactivateOption = false;
      
      if (error.message) {
        if (error.message.includes('currently being used by') || error.message.includes('referenced in')) {
          errorMessage = error.message;
          showDeactivateOption = true;
        } else if (error.message.includes('Failed to check')) {
          errorMessage = 'Unable to verify if service can be deleted. Please try again or contact support.';
        } else {
          errorMessage = error.message;
        }
      }
      
      // If service is in use, offer to deactivate instead
      if (showDeactivateOption && service && service.is_active) {
        const shouldDeactivate = window.confirm(
          `${errorMessage}\n\nWould you like to deactivate "${serviceName}" instead? This will hide it from new bookings but keep existing appointments intact.`
        );
        
        if (shouldDeactivate) {
          try {
            await handleServiceToggleActive(service);
            return; // Exit early if deactivation succeeds
          } catch (deactivateError) {
            console.error('Error deactivating service:', deactivateError);
            setError(`Failed to deactivate service: ${deactivateError.message}`);
            return;
          }
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOnDelete = async (addOnId) => {
    const addOn = addOns.find(a => a.id === addOnId);
    const addOnName = addOn ? addOn.name : 'this add-on';
    
    if (!window.confirm(`Are you sure you want to delete "${addOnName}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null); // Clear previous errors
      
      await apiService.deleteAddOn(addOnId);
      
      // Update local state
      setAddOns(prev => prev.filter(addOn => addOn.id !== addOnId));
      
      // Show success message (optional)
      console.log(`Add-on "${addOnName}" deleted successfully`);
      
    } catch (error) {
      console.error('Error deleting add-on:', error);
      
      // Provide specific error messages based on the error
      let errorMessage = 'Failed to delete add-on. Please try again.';
      let showDeactivateOption = false;
      
      if (error.message) {
        if (error.message.includes('currently being used by')) {
          errorMessage = error.message;
          showDeactivateOption = true;
        } else if (error.message.includes('Failed to check')) {
          errorMessage = 'Unable to verify if add-on can be deleted. Please try again or contact support.';
        } else {
          errorMessage = error.message;
        }
      }
      
      // If add-on is in use, offer to deactivate instead
      if (showDeactivateOption && addOn && addOn.is_active) {
        const shouldDeactivate = window.confirm(
          `${errorMessage}\n\nWould you like to deactivate "${addOnName}" instead? This will hide it from new bookings but keep existing appointments intact.`
        );
        
        if (shouldDeactivate) {
          try {
            await handleAddOnToggleActive(addOn);
            return; // Exit early if deactivation succeeds
          } catch (deactivateError) {
            console.error('Error deactivating add-on:', deactivateError);
            setError(`Failed to deactivate add-on: ${deactivateError.message}`);
            return;
          }
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleServiceToggleActive = async (service) => {
    try {
      setLoading(true);
      
      const result = await apiService.updateService(service.id, {
        is_active: !service.is_active
      });
      
      // Update local state
      setServices(prev => 
        prev.map(s => s.id === service.id ? result : s)
      );
      
    } catch (error) {
      console.error('Error updating service status:', error);
      setError('Failed to update service status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddOnToggleActive = async (addOn) => {
    try {
      setLoading(true);
      
      const result = await apiService.updateAddOn(addOn.id, {
        is_active: !addOn.is_active
      });
      
      // Update local state
      setAddOns(prev => 
        prev.map(a => a.id === addOn.id ? result : a)
      );
      
    } catch (error) {
      console.error('Error updating add-on status:', error);
      setError('Failed to update add-on status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceAddNew = () => {
    setServiceFormData({
      name: '',
      description: '',
      price: '',
      duration: '',
      is_active: true
    });
    setIsEditingService(false);
    setSelectedService(null);
    setShowServiceModal(true);
  };

  const handleAddOnAddNew = () => {
    setAddOnFormData({
      name: '',
      description: '',
      price: '',
      duration: '',
      category: '',
      is_active: true
    });
    setIsEditingAddOn(false);
    setSelectedAddOn(null);
    setShowAddOnModal(true);
  };

  const resetServiceFormAndCloseModal = () => {
    setServiceFormData({
      name: '',
      description: '',
      price: '',
      duration: '',
      is_active: true
    });
    setFormErrors({});
    setIsEditingService(false);
    setSelectedService(null);
    setShowServiceModal(false);
  };

  const resetAddOnFormAndCloseModal = () => {
    setAddOnFormData({
      name: '',
      description: '',
      price: '',
      duration: '',
      category: '',
      is_active: true
    });
    setFormErrors({});
    setIsEditingAddOn(false);
    setSelectedAddOn(null);
    setShowAddOnModal(false);
  };

  if (loading && !services.length && !addOns.length) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Manage Services & Add-ons</h2>
        <div className="d-flex gap-2">
          {activeTab === 'services' ? (
            <button 
              className="btn btn-primary" 
              onClick={handleServiceAddNew}
            >
              <i className="bi bi-plus-circle me-2"></i>
              Add New Service
            </button>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={handleAddOnAddNew}
            >
              <i className="bi bi-plus-circle me-2"></i>
              Add New Add-on
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <ul className="nav nav-tabs mb-4" id="managementTabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            className={`nav-link ${activeTab === 'services' ? 'active' : ''}`}
            id="services-tab"
            type="button"
            role="tab"
            onClick={() => setActiveTab('services')}
            aria-controls="services"
            aria-selected={activeTab === 'services'}
          >
            <i className="bi bi-scissors me-2"></i>
            Services
            <span className="badge bg-secondary ms-2">{services.length}</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button
            className={`nav-link ${activeTab === 'addons' ? 'active' : ''}`}
            id="addons-tab"
            type="button"
            role="tab"
            onClick={() => setActiveTab('addons')}
            aria-controls="addons"
            aria-selected={activeTab === 'addons'}
          >
            <i className="bi bi-plus-circle me-2"></i>
            Add-ons
            <span className="badge bg-secondary ms-2">{addOns.length}</span>
          </button>
        </li>
      </ul>

      {error && (
        <div className="alert alert-danger alert-dismissible fade show" role="alert">
          <div className="d-flex align-items-start">
            <i className="bi bi-exclamation-triangle-fill me-2 mt-1"></i>
            <div className="flex-grow-1">
              <strong>Management Error</strong>
              <div className="mt-1">{error}</div>
              {error.includes('currently being used by') || error.includes('referenced in') ? (
                <div className="mt-2">
                  <small className="text-muted">
                    <i className="bi bi-info-circle me-1"></i>
                    <strong>Tip:</strong> You can deactivate the item instead of deleting it. This will hide it from new bookings while keeping existing appointments intact.
                  </small>
                </div>
              ) : null}
            </div>
          </div>
          <button 
            type="button" 
            className="btn-close" 
            onClick={() => setError(null)} 
            aria-label="Close"
          ></button>
        </div>
      )}

      {/* Tab Content */}
      <div className="tab-content" id="managementTabContent">
        {/* Services Tab */}
        {activeTab === 'services' && (
          <div className="tab-pane fade show active" id="services" role="tabpanel" aria-labelledby="services-tab">

      {/* Services Table */}
      <div className="card">
        <div className="card-body">
          {services.length === 0 ? (
            <div className="text-center py-4">
              <div className="text-muted mb-3">
                <i className="bi bi-inbox fs-1"></i>
              </div>
              <p>No services found. Click "Add New Service" to create one.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Price</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Usage</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => {
                    const usage = serviceUsage[service.id] || { totalActive: 0, directReferences: 0, jsonReferences: 0 };
                    const canDelete = usage.totalActive === 0;
                    
                    return (
                      <tr key={service.id} className={!service.is_active ? 'table-secondary' : ''}>
                        <td>
                          <div className="d-flex align-items-center">
                            <span>{service.name}</span>
                            {!service.is_active && (
                              <span className="badge bg-secondary ms-2">Hidden</span>
                            )}
                          </div>
                        </td>
                        <td>{service.description || '-'}</td>
                        <td className="currency-table-cell">{formatPrice(service.price)}</td>
                        <td>{service.duration} min</td>
                        <td>
                          <span className={`badge bg-${service.is_active ? 'success' : 'secondary'}`}>
                            {service.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          {usage.totalActive > 0 ? (
                            <div className="d-flex flex-column">
                              <span className="badge bg-warning text-dark">
                                <i className="bi bi-people me-1"></i>
                                {usage.totalActive} active
                              </span>
                              {usage.directReferences > 0 && (
                                <small className="text-muted">
                                  {usage.directReferences} direct
                                </small>
                              )}
                              {usage.jsonReferences > 0 && (
                                <small className="text-muted">
                                  {usage.jsonReferences} in bundles
                                </small>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted">
                              <i className="bi bi-check-circle text-success me-1"></i>
                              No active usage
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="btn-group" role="group">
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => handleServiceEdit(service)}
                              title="Edit service"
                            >
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button
                              className={`btn btn-sm ${canDelete ? 'btn-outline-danger' : 'btn-outline-secondary'}`}
                              onClick={() => handleServiceDelete(service.id)}
                              disabled={!canDelete}
                              title={canDelete ? 'Delete service' : 'Cannot delete - service is in use'}
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                            <button
                              className="btn btn-sm btn-outline-warning"
                              onClick={() => handleServiceToggleActive(service)}
                              title={service.is_active ? 'Deactivate service' : 'Activate service'}
                            >
                              <i className={`bi bi-${service.is_active ? 'eye-slash' : 'eye'}`}></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
          </div>
        )}

        {/* Add-ons Tab */}
        {activeTab === 'addons' && (
          <div className="tab-pane fade show active" id="addons" role="tabpanel" aria-labelledby="addons-tab">
            {/* Add-ons Table */}
            <div className="card">
              <div className="card-body">
                {addOns.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="text-muted mb-3">
                      <i className="bi bi-inbox fs-1"></i>
                    </div>
                    <p>No add-ons found. Click "Add New Add-on" to create one.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Description</th>
                          <th>Category</th>
                          <th>Price</th>
                          <th>Duration</th>
                          <th>Status</th>
                          <th>Usage</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {addOns.map((addOn) => {
                          const usage = addOnUsage[addOn.id] || { totalActive: 0 };
                          const canDelete = usage.totalActive === 0;
                          
                          return (
                            <tr key={addOn.id} className={!addOn.is_active ? 'table-secondary' : ''}>
                              <td>
                                <div className="d-flex align-items-center">
                                  <span>{addOn.name}</span>
                                  {!addOn.is_active && (
                                    <span className="badge bg-secondary ms-2">Hidden</span>
                                  )}
                                </div>
                              </td>
                              <td>{addOn.description || '-'}</td>
                              <td>
                                {addOn.category ? (
                                  <span className="badge bg-info">{addOn.category}</span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td className="currency-table-cell">{formatPrice(addOn.price)}</td>
                              <td>{addOn.duration} min</td>
                              <td>
                                <span className={`badge bg-${addOn.is_active ? 'success' : 'secondary'}`}>
                                  {addOn.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td>
                                {usage.totalActive > 0 ? (
                                  <span className="badge bg-warning text-dark">
                                    <i className="bi bi-people me-1"></i>
                                    {usage.totalActive} active
                                  </span>
                                ) : (
                                  <span className="text-muted">
                                    <i className="bi bi-check-circle text-success me-1"></i>
                                    No active usage
                                  </span>
                                )}
                              </td>
                              <td>
                                <div className="btn-group" role="group">
                                  <button
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => handleAddOnEdit(addOn)}
                                    title="Edit add-on"
                                  >
                                    <i className="bi bi-pencil"></i>
                                  </button>
                                  <button
                                    className={`btn btn-sm ${canDelete ? 'btn-outline-danger' : 'btn-outline-secondary'}`}
                                    onClick={() => handleAddOnDelete(addOn.id)}
                                    disabled={!canDelete}
                                    title={canDelete ? 'Delete add-on' : 'Cannot delete - add-on is in use'}
                                  >
                                    <i className="bi bi-trash"></i>
                                  </button>
                                  <button
                                    className="btn btn-sm btn-outline-warning"
                                    onClick={() => handleAddOnToggleActive(addOn)}
                                    title={addOn.is_active ? 'Deactivate add-on' : 'Activate add-on'}
                                  >
                                    <i className={`bi bi-${addOn.is_active ? 'eye-slash' : 'eye'}`}></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Service Add/Edit Modal */}
      {showServiceModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {isEditingService ? 'Edit Service' : 'Add New Service'}
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={resetServiceFormAndCloseModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleServiceSubmit}>
                  <div className="mb-3">
                    <label htmlFor="service_name" className="form-label">Service Name</label>
                    <input
                      type="text"
                      className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
                      id="service_name"
                      name="name"
                      value={serviceFormData.name}
                      onChange={handleServiceChange}
                      required
                    />
                    {formErrors.name && (
                      <div className="invalid-feedback">{formErrors.name}</div>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="service_description" className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      id="service_description"
                      name="description"
                      value={serviceFormData.description}
                      onChange={handleServiceChange}
                      rows="3"
                    ></textarea>
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label htmlFor="service_price" className="form-label">Price (₱)</label>
                      <input
                        type="number"
                        className={`form-control ${formErrors.price ? 'is-invalid' : ''}`}
                        id="service_price"
                        name="price"
                        value={serviceFormData.price}
                        onChange={handleServiceChange}
                        step="0.01"
                        min="0"
                        required
                      />
                      {formErrors.price && (
                        <div className="invalid-feedback">{formErrors.price}</div>
                      )}
                    </div>
                    
                    <div className="col-md-6">
                      <label htmlFor="service_duration" className="form-label">Duration (minutes)</label>
                      <input
                        type="number"
                        className={`form-control ${formErrors.duration ? 'is-invalid' : ''}`}
                        id="service_duration"
                        name="duration"
                        value={serviceFormData.duration}
                        onChange={handleServiceChange}
                        min="1"
                        required
                      />
                      {formErrors.duration && (
                        <div className="invalid-feedback">{formErrors.duration}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mb-3 form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="service_is_active"
                      name="is_active"
                      checked={serviceFormData.is_active}
                      onChange={handleServiceChange}
                    />
                    <label className="form-check-label" htmlFor="service_is_active">Active</label>
                  </div>
                  
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={resetServiceFormAndCloseModal}
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
                        'Save Service'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add-on Add/Edit Modal */}
      {showAddOnModal && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {isEditingAddOn ? 'Edit Add-on' : 'Add New Add-on'}
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={resetAddOnFormAndCloseModal}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleAddOnSubmit}>
                  <div className="mb-3">
                    <label htmlFor="addon_name" className="form-label">Add-on Name</label>
                    <input
                      type="text"
                      className={`form-control ${formErrors.name ? 'is-invalid' : ''}`}
                      id="addon_name"
                      name="name"
                      value={addOnFormData.name}
                      onChange={handleAddOnChange}
                      required
                    />
                    {formErrors.name && (
                      <div className="invalid-feedback">{formErrors.name}</div>
                    )}
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="addon_description" className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      id="addon_description"
                      name="description"
                      value={addOnFormData.description}
                      onChange={handleAddOnChange}
                      rows="3"
                    ></textarea>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="addon_category" className="form-label">Category</label>
                    <input
                      type="text"
                      className="form-control"
                      id="addon_category"
                      name="category"
                      value={addOnFormData.category}
                      onChange={handleAddOnChange}
                      placeholder="e.g., Hair Care, Styling, etc."
                    />
                    <div className="form-text">Optional: Group add-ons by category</div>
                  </div>
                  
                  <div className="row mb-3">
                    <div className="col-md-6">
                      <label htmlFor="addon_price" className="form-label">Price (₱)</label>
                      <input
                        type="number"
                        className={`form-control ${formErrors.price ? 'is-invalid' : ''}`}
                        id="addon_price"
                        name="price"
                        value={addOnFormData.price}
                        onChange={handleAddOnChange}
                        step="0.01"
                        min="0"
                        required
                      />
                      {formErrors.price && (
                        <div className="invalid-feedback">{formErrors.price}</div>
                      )}
                    </div>
                    
                    <div className="col-md-6">
                      <label htmlFor="addon_duration" className="form-label">Duration (minutes)</label>
                      <input
                        type="number"
                        className={`form-control ${formErrors.duration ? 'is-invalid' : ''}`}
                        id="addon_duration"
                        name="duration"
                        value={addOnFormData.duration}
                        onChange={handleAddOnChange}
                        min="1"
                        required
                      />
                      {formErrors.duration && (
                        <div className="invalid-feedback">{formErrors.duration}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="mb-3 form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="addon_is_active"
                      name="is_active"
                      checked={addOnFormData.is_active}
                      onChange={handleAddOnChange}
                    />
                    <label className="form-check-label" htmlFor="addon_is_active">Active</label>
                  </div>
                  
                  <div className="d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={resetAddOnFormAndCloseModal}
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
                        'Save Add-on'
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

export default ManageServices;