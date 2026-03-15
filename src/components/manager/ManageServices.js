// components/manager/ManageServices.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/core/ApiService';
import centralizedNotificationService from '../../services/notifications/CentralizedNotificationService';
import { formatPrice } from '../utils/helpers';
import { isValidPrice } from '../utils/validators';
import LoadingSpinner from '../common/LoadingSpinner';

const ManageServices = () => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [itemToDeactivate, setItemToDeactivate] = useState(null);

  const [showUsageModal, setShowUsageModal] = useState(false);
  const [usageItem, setUsageItem] = useState(null);
  const [usageBookings, setUsageBookings] = useState([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const [showArchiveBookingModal, setShowArchiveBookingModal] = useState(false);
  const [bookingToArchive, setBookingToArchive] = useState(null);

  // Premium Minimalist Styles
  const styles = {
    container: {
      padding: windowWidth < 576 ? '1.5rem 1rem' : '2rem 1.5rem',
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    },
    headerCard: {
      background: '#fff',
      padding: '1.25rem',
      borderRadius: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      border: '1px solid #f0f0f0',
      marginBottom: '1.5rem',
      display: 'flex',
      flexDirection: windowWidth < 650 ? 'column' : 'row',
      justifyContent: 'space-between',
      alignItems: windowWidth < 650 ? 'stretch' : 'center',
      gap: '1rem'
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: '800',
      color: '#1a1a1a',
      margin: 0,
      letterSpacing: '-0.5px'
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '0.8rem 1.25rem',
      borderRadius: '16px',
      fontWeight: '600',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.6rem',
      transition: 'all 0.3s'
    },
    tabs: {
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '1.5rem',
      backgroundColor: '#ececec',
      padding: '0.4rem',
      borderRadius: '18px',
      width: 'fit-content'
    },
    tabBtn: (active) => ({
      padding: '0.6rem 1.2rem',
      borderRadius: '14px',
      border: 'none',
      backgroundColor: active ? '#fff' : 'transparent',
      color: active ? '#1a1a1a' : '#666',
      fontWeight: '700',
      fontSize: '0.85rem',
      boxShadow: active ? '0 4px 10px rgba(0,0,0,0.05)' : 'none',
      transition: 'all 0.2s ease'
    }),
    grid: {
      display: 'grid',
      gridTemplateColumns: windowWidth < 768 ? '1fr' : windowWidth < 1200 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
      gap: '1.25rem'
    },
    card: {
      backgroundColor: '#fff',
      borderRadius: '24px',
      padding: '1.5rem',
      boxShadow: '0 8px 25px rgba(0,0,0,0.03)',
      border: '1px solid #f0f0f0',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      position: 'relative',
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    priceLabel: {
      fontSize: '1.25rem',
      fontWeight: '800',
      color: '#5D4037'
    },
    durationBadge: {
      backgroundColor: '#f5f5f5',
      color: '#666',
      padding: '0.3rem 0.6rem',
      borderRadius: '8px',
      fontSize: '0.75rem',
      fontWeight: '600'
    },
    actionBtn: {
      width: '38px',
      height: '38px',
      borderRadius: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 'none',
      transition: 'all 0.2s'
    },
    modal: {
      backgroundColor: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      padding: '0',
      zIndex: 1050,
      transition: 'opacity 0.3s ease'
    },
    modalContent: {
      borderRadius: windowWidth < 576 ? '32px 32px 0 0' : '28px',
      border: windowWidth < 576 ? 'none' : '1px solid rgba(255,255,255,0.1)',
      overflow: 'hidden',
      boxShadow: windowWidth < 576 ? '0 -10px 40px rgba(0,0,0,0.15)' : '0 20px 50px rgba(0,0,0,0.2)',
      marginTop: windowWidth < 576 ? 'auto' : '0',
      backgroundColor: '#fff'
    }
  };

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
        // Check direct service_id references (all history)
        const { data: directRefs, error: directError } = await supabase
          .from('appointments')
          .select('id, status')
          .eq('service_id', service.id);

        let activeDirect = 0;
        let pastDirect = 0;

        if (!directError && directRefs) {
          const validDirectRefs = directRefs.filter(a => a.status !== 'cancelled' && a.status !== 'rejected');
          activeDirect = validDirectRefs.filter(a => ['pending', 'scheduled', 'confirmed', 'ongoing'].includes(a.status)).length;
          pastDirect = validDirectRefs.length - activeDirect;
        }

        // Check JSON services_data references (all history)
        const { data: jsonRefs, error: jsonError } = await supabase
          .from('appointments')
          .select('id, services_data, status')
          .not('services_data', 'is', null);

        let activeJson = 0;
        let pastJson = 0;

        if (!jsonError && jsonRefs) {
          const refs = jsonRefs.filter(apt => {
            if (apt.status === 'cancelled' || apt.status === 'rejected') return false;
            try {
              const sd = typeof apt.services_data === 'string'
                ? JSON.parse(apt.services_data)
                : apt.services_data;
              return Array.isArray(sd) && sd.includes(service.id);
            } catch (e) {
              return false;
            }
          });
          activeJson = refs.filter(a => ['pending', 'scheduled', 'confirmed', 'ongoing'].includes(a.status)).length;
          pastJson = refs.length - activeJson;
        }

        usageData[service.id] = {
          totalActive: activeDirect + activeJson,
          totalPast: pastDirect + pastJson,
          directReferences: activeDirect,
          jsonReferences: activeJson
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
        // Check JSON add_ons_data references (all history)
        const { data: jsonRefs, error: jsonError } = await supabase
          .from('appointments')
          .select('id, add_ons_data, status')
          .not('add_ons_data', 'is', null);

        let activeRefs = 0;
        let pastRefs = 0;

        if (!jsonError && jsonRefs) {
          const refs = jsonRefs.filter(apt => {
            if (apt.status === 'cancelled' || apt.status === 'rejected') return false;
            try {
              const aod = typeof apt.add_ons_data === 'string'
                ? JSON.parse(apt.add_ons_data)
                : apt.add_ons_data;
              return Array.isArray(aod) && aod.includes(addOn.id);
            } catch (e) {
              return false;
            }
          });
          activeRefs = refs.filter(a => ['pending', 'scheduled', 'confirmed', 'ongoing'].includes(a.status)).length;
          pastRefs = refs.length - activeRefs;
        }

        usageData[addOn.id] = {
          totalActive: activeRefs,
          totalPast: pastRefs
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
        // Track previous values for notification
        const oldPrice = selectedService.price;
        const oldDuration = selectedService.duration;
        const oldName = selectedService.name;

        // Update existing service
        result = await apiService.updateService(selectedService.id, serviceData);

        // Update local state
        setServices(prev =>
          prev.map(service =>
            service.id === selectedService.id ? result : service
          )
        );

        // Notify customers with active appointments if details changed
        if (oldPrice !== result.price || oldDuration !== result.duration || oldName !== result.name) {
          try {
            // Find upcoming appointments using this service
            const { data: upcomingAppointments } = await supabase
              .from('appointments')
              .select('id, customer_id, services_data')
              .in('status', ['pending', 'scheduled', 'confirmed'])
              .or(`service_id.eq.${selectedService.id},services_data.not.is.null`);

            if (upcomingAppointments && upcomingAppointments.length > 0) {
              const affectedCustomers = new Set();

              const relevantAppointments = upcomingAppointments.filter(apt => {
                if (apt.service_id === selectedService.id) {
                  return true;
                }

                if (apt.services_data) {
                  try {
                    const sd = typeof apt.services_data === 'string'
                      ? JSON.parse(apt.services_data)
                      : apt.services_data;
                    return Array.isArray(sd) && sd.includes(selectedService.id);
                  } catch (e) {
                    return false;
                  }
                }
                return false;
              });

              for (const appt of relevantAppointments) {
                if (appt.customer_id && !affectedCustomers.has(appt.customer_id)) {
                  affectedCustomers.add(appt.customer_id);

                  let changeMsg = `The service "${oldName}" you booked has been updated by the manager. `;
                  if (oldPrice !== result.price) changeMsg += `Price changed from ₱${oldPrice} to ₱${result.price}. `;
                  if (oldDuration !== result.duration) changeMsg += `Duration changed from ${oldDuration} to ${result.duration} mins. `;

                  await centralizedNotificationService.createNotification({
                    userId: appt.customer_id,
                    title: 'Service Update Notice ⚠️',
                    message: changeMsg,
                    type: 'system',
                    priority: 'high',
                    channels: ['app', 'push'],
                    appointmentId: appt.id
                  });
                }
              }
            }
          } catch (notifError) {
            console.error('Error sending service update notifications:', notifError);
          }
        }
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
        const oldPrice = selectedAddOn.price;
        const oldDuration = selectedAddOn.duration;
        const oldName = selectedAddOn.name;

        // Update existing add-on
        result = await apiService.updateAddOn(selectedAddOn.id, addOnData);

        // Update local state
        setAddOns(prev =>
          prev.map(addOn =>
            addOn.id === selectedAddOn.id ? result : addOn
          )
        );

        // Notify customers with active appointments if details changed
        if (oldPrice !== result.price || oldDuration !== result.duration || oldName !== result.name) {
          try {
            // Find upcoming appointments using this addon
            const { data: upcomingAppointments } = await supabase
              .from('appointments')
              .select('id, customer_id, add_ons_data')
              .in('status', ['pending', 'scheduled', 'confirmed'])
              .not('add_ons_data', 'is', null);

            if (upcomingAppointments && upcomingAppointments.length > 0) {
              const affectedCustomers = new Set();

              const relevantAppointments = upcomingAppointments.filter(apt => {
                try {
                  const ad = typeof apt.add_ons_data === 'string'
                    ? JSON.parse(apt.add_ons_data)
                    : apt.add_ons_data;
                  return Array.isArray(ad) && ad.includes(selectedAddOn.id);
                } catch (e) {
                  return false;
                }
              });

              for (const appt of relevantAppointments) {
                if (appt.customer_id && !affectedCustomers.has(appt.customer_id)) {
                  affectedCustomers.add(appt.customer_id);

                  let changeMsg = `The add-on "${oldName}" you booked has been updated by the manager. `;
                  if (oldPrice !== result.price) changeMsg += `Price changed from ₱${oldPrice} to ₱${result.price}. `;
                  if (oldDuration !== result.duration) changeMsg += `Duration changed from ${oldDuration} to ${result.duration} mins. `;

                  await centralizedNotificationService.createNotification({
                    userId: appt.customer_id,
                    title: 'Add-on Update Notice ⚠️',
                    message: changeMsg,
                    type: 'system',
                    priority: 'high',
                    channels: ['app', 'push'],
                    appointmentId: appt.id
                  });
                }
              }
            }
          } catch (notifError) {
            console.error('Error sending add-on update notifications:', notifError);
          }
        }
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

  const handleServiceDelete = (service) => {
    setItemToDelete({ type: 'service', ...service });
    setShowDeleteModal(true);
  };

  const handleAddOnDelete = (addOn) => {
    setItemToDelete({ type: 'addon', ...addOn });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      setLoading(true);
      setError(null);

      if (itemToDelete.type === 'service') {
        await apiService.deleteService(itemToDelete.id);
        setServices(prev => prev.filter(service => service.id !== itemToDelete.id));
      } else {
        await apiService.deleteAddOn(itemToDelete.id);
        setAddOns(prev => prev.filter(addOn => addOn.id !== itemToDelete.id));
      }

      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      console.error(`Error deleting ${itemToDelete.type}:`, error);
      setShowDeleteModal(false);

      let errorMessage = `Failed to delete ${itemToDelete.type}. Please try again.`;
      let showDeactivateOption = false;

      if (error.message) {
        if (error.message.includes('currently being used by') || error.message.includes('referenced in')) {
          errorMessage = error.message;
          showDeactivateOption = true;
        } else if (error.message.includes('Failed to check')) {
          errorMessage = `Unable to verify if ${itemToDelete.type} can be deleted. Please try again or contact support.`;
        } else {
          errorMessage = error.message;
        }
      }

      if (showDeactivateOption && itemToDelete.is_active) {
        setItemToDeactivate({ ...itemToDelete, errorMessage });
        setShowDeactivateModal(true);
      } else {
        setError(errorMessage);
        setItemToDelete(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmDeactivate = async () => {
    if (!itemToDeactivate) return;

    try {
      setLoading(true);
      if (itemToDeactivate.type === 'service') {
        const result = await apiService.updateService(itemToDeactivate.id, { is_active: !itemToDeactivate.is_active });
        setServices(prev => prev.map(s => s.id === itemToDeactivate.id ? result : s));
        await notifyItemToggle(itemToDeactivate, 'service');
      } else {
        const result = await apiService.updateAddOn(itemToDeactivate.id, { is_active: !itemToDeactivate.is_active });
        setAddOns(prev => prev.map(a => a.id === itemToDeactivate.id ? result : a));
        await notifyItemToggle(itemToDeactivate, 'addon');
      }
      setShowDeactivateModal(false);
      setItemToDeactivate(null);
      setItemToDelete(null);
    } catch (deactivateError) {
      console.error(`Error deactivating ${itemToDeactivate.type}:`, deactivateError);
      setError(`Failed to deactivate ${itemToDeactivate.type}: ${deactivateError.message}`);
      setShowDeactivateModal(false);
      setItemToDeactivate(null);
      setItemToDelete(null);
    } finally {
      setLoading(false);
    }
  };

  const handleViewUsage = async (item, type) => {
    setUsageItem({ ...item, type });
    setShowUsageModal(true);
    setLoadingUsage(true);
    setUsageBookings([]);

    try {
      if (type === 'service') {
        // Fetch direct refs
        const { data: directRefs } = await supabase
          .from('appointments')
          .select('id, status, appointment_date, appointment_time, customer:customer_id(full_name)')
          .eq('service_id', item.id)
          .neq('status', 'cancelled');

        // Fetch json refs
        const { data: jsonRefs } = await supabase
          .from('appointments')
          .select('id, status, services_data, appointment_date, appointment_time, customer:customer_id(full_name)')
          .not('services_data', 'is', null)
          .neq('status', 'cancelled');

        let allRefs = directRefs || [];

        if (jsonRefs) {
          const validJsonRefs = jsonRefs.filter(apt => {
            try {
              const sd = typeof apt.services_data === 'string' ? JSON.parse(apt.services_data) : apt.services_data;
              return Array.isArray(sd) && sd.includes(item.id) && !allRefs.find(r => r.id === apt.id);
            } catch (e) { return false; }
          });
          allRefs = [...allRefs, ...validJsonRefs];
        }

        allRefs.sort((a, b) => new Date(`${b.appointment_date}T${b.appointment_time || '00:00'}`) - new Date(`${a.appointment_date}T${a.appointment_time || '00:00'}`));
        setUsageBookings(allRefs);
      } else {
        const { data: jsonRefs } = await supabase
          .from('appointments')
          .select('id, status, add_ons_data, appointment_date, appointment_time, customer:customer_id(full_name)')
          .not('add_ons_data', 'is', null)
          .neq('status', 'cancelled');

        let allRefs = [];
        if (jsonRefs) {
          allRefs = jsonRefs.filter(apt => {
            try {
              const ad = typeof apt.add_ons_data === 'string' ? JSON.parse(apt.add_ons_data) : apt.add_ons_data;
              return Array.isArray(ad) && ad.includes(item.id);
            } catch (e) { return false; }
          });
        }

        allRefs.sort((a, b) => new Date(`${b.appointment_date}T${b.appointment_time || '00:00'}`) - new Date(`${a.appointment_date}T${a.appointment_time || '00:00'}`));
        setUsageBookings(allRefs);
      }
    } catch (error) {
      console.error('Error fetching usage bookings:', error);
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleArchiveBooking = (appointmentId) => {
    setBookingToArchive(appointmentId);
    setShowArchiveBookingModal(true);
  };

  const confirmArchiveBooking = async () => {
    if (!bookingToArchive) return;

    try {
      setLoadingUsage(true);
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', bookingToArchive);

      if (error) throw error;

      // Optimistically remove from list
      setUsageBookings(prev => prev.filter(appt => appt.id !== bookingToArchive));

      // Refresh surrounding data to keep counts accurate
      if (usageItem?.type === 'service') {
        fetchServices();
      } else {
        fetchAddOns();
      }
      setShowArchiveBookingModal(false);
      setBookingToArchive(null);
    } catch (error) {
      console.error(`Error archiving appointment ${bookingToArchive}:`, error);
      setError("Failed to archive the booking: " + error.message);
    } finally {
      setLoadingUsage(false);
    }
  };

  const notifyItemToggle = async (item, itemType) => {
    const isDeactivating = item.is_active; // If it was active, it's being deactivated
    if (!isDeactivating) return; // Only notify if we are deactivating, not activating

    try {
      const { data: upcomingAppointments } = await supabase
        .from('appointments')
        .select('id, customer_id, service_id, services_data, add_ons_data')
        .in('status', ['pending', 'scheduled', 'confirmed']);

      if (!upcomingAppointments || upcomingAppointments.length === 0) return;

      const affectedCustomers = new Set();
      const relevantAppointments = upcomingAppointments.filter(apt => {
        if (itemType === 'service') {
          if (apt.service_id === item.id) return true;
          if (apt.services_data) {
            try {
              const sd = typeof apt.services_data === 'string' ? JSON.parse(apt.services_data) : apt.services_data;
              return Array.isArray(sd) && sd.includes(item.id);
            } catch (e) { return false; }
          }
        } else if (itemType === 'addon' && apt.add_ons_data) {
          try {
            const ad = typeof apt.add_ons_data === 'string' ? JSON.parse(apt.add_ons_data) : apt.add_ons_data;
            return Array.isArray(ad) && ad.includes(item.id);
          } catch (e) { return false; }
        }
        return false;
      });

      for (const appt of relevantAppointments) {
        if (appt.customer_id && !affectedCustomers.has(appt.customer_id)) {
          affectedCustomers.add(appt.customer_id);

          await centralizedNotificationService.createNotification({
            userId: appt.customer_id,
            title: `${itemType === 'service' ? 'Service' : 'Add-on'} Inactive Notice ⚠️`,
            message: `The ${itemType === 'service' ? 'service' : 'add-on'} "${item.name}" that you booked has just been deactivated by management. Your existing booking is still completely valid and secured!`,
            type: 'system',
            priority: 'high',
            channels: ['app', 'push'],
            appointmentId: appt.id
          });
        }
      }
    } catch (err) {
      console.error(`Error notifying customers about ${itemType} deactivation:`, err);
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

      // Trigger notification check
      await notifyItemToggle(service, 'service');

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

      // Trigger notification check
      await notifyItemToggle(addOn, 'addon');

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
    <div style={styles.container}>
      {/* Premium Header */}
      <div style={styles.headerCard}>
        <div>
          <h2 style={styles.title}>Service Management</h2>
          <div className="small text-muted mt-1">
            Managing <strong>{services.length} Services</strong> and <strong>{addOns.length} Add-ons</strong>
          </div>
        </div>
        <button
          style={styles.primaryBtn}
          onClick={activeTab === 'services' ? handleServiceAddNew : handleAddOnAddNew}
        >
          <i className="bi bi-plus-lg"></i>
          {activeTab === 'services' ? 'New Service' : 'New Add-on'}
        </button>
      </div>

      {/* Modern Tabs */}
      <div style={styles.tabs}>
        <button
          style={styles.tabBtn(activeTab === 'services')}
          onClick={() => setActiveTab('services')}
        >
          <i className="bi bi-scissors me-2"></i>Services
        </button>
        <button
          style={styles.tabBtn(activeTab === 'addons')}
          onClick={() => setActiveTab('addons')}
        >
          <i className="bi bi-plus-circle me-2"></i>Add-ons
        </button>
      </div>

      {error && (
        <div className="alert-mobile-custom mb-4 shake" style={{
          backgroundColor: '#fff',
          borderLeft: '4px solid #d32f2f',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
          borderRadius: '16px',
          padding: '1rem'
        }}>
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <i className="bi bi-exclamation-triangle-fill text-danger me-2"></i>
              <span className="small fw-bold">{error}</span>
            </div>
            <button className="btn-close" onClick={() => setError(null)} style={{ fontSize: '0.7rem' }}></button>
          </div>
        </div>
      )}

      {/* Grid View */}
      <div style={styles.grid}>
        {activeTab === 'services' ? (
          services.length === 0 ? (
            <div className="text-center py-5 bg-white rounded-4 border w-100" style={{ gridColumn: '1 / -1' }}>
              <i className="bi bi-scissors fs-1 text-muted opacity-25"></i>
              <p className="mt-3 text-muted">No services defined yet.</p>
            </div>
          ) : (
            services.map(service => {
              const usage = serviceUsage[service.id] || { totalActive: 0 };
              return (
                <div key={service.id} style={styles.card} className="service-card-hover">
                  <div className="d-flex justify-content-between align-items-start">
                    <div style={{ flex: 1 }}>
                      <h5 className="fw-800 mb-1">{service.name}</h5>
                      <span style={styles.durationBadge}>{service.duration} mins</span>
                    </div>
                    <div className="dropdown">
                      <button className="btn btn-light rounded-circle touch-btn" data-bs-toggle="dropdown" style={{ width: '36px', height: '36px', padding: 0 }}>
                        <i className="bi bi-three-dots-vertical"></i>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end border-0 shadow-lg p-2" style={{ borderRadius: '16px' }}>
                        <li><button className="dropdown-item rounded-3 py-2" onClick={() => handleServiceEdit(service)}><i className="bi bi-pencil me-2"></i>Edit</button></li>
                        <li><button className="dropdown-item rounded-3 py-2" onClick={() => handleServiceToggleActive(service)}><i className={`bi bi-eye${service.is_active ? '-slash' : ''} me-2`}></i>{service.is_active ? 'Deactivate' : 'Activate'}</button></li>
                        <li><hr className="dropdown-divider opacity-50" /></li>
                        <li><button className="dropdown-item rounded-3 py-2 text-danger" onClick={() => handleServiceDelete(service)}><i className="bi bi-trash me-2"></i>Delete</button></li>
                      </ul>
                    </div>
                  </div>

                  <p className="small text-muted mb-auto line-clamp-2" style={{ height: '40px' }}>{service.description || 'No description provided.'}</p>

                  <div className="d-flex justify-content-between align-items-center mt-2 pt-3 border-top">
                    <div style={styles.priceLabel}>{formatPrice(service.price)}</div>
                    {usage.totalActive > 0 ? (
                      <button className="btn btn-sm text-primary fw-700 p-0" onClick={() => handleViewUsage(service, 'service')}>
                        <i className="bi bi-people-fill me-1"></i>{usage.totalActive} Active
                      </button>
                    ) : (
                      <span className="small text-muted opacity-50"><i className="bi bi-check2-circle me-1"></i>Unused</span>
                    )}
                  </div>

                  {!service.is_active && (
                    <div className="position-absolute top-0 end-0 p-2">
                      <span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>HIDDEN</span>
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          addOns.length === 0 ? (
            <div className="text-center py-5 bg-white rounded-4 border w-100" style={{ gridColumn: '1 / -1' }}>
              <i className="bi bi-plus-circle fs-1 text-muted opacity-25"></i>
              <p className="mt-3 text-muted">No add-ons defined yet.</p>
            </div>
          ) : (
            addOns.map(addOn => {
              const usage = addOnUsage[addOn.id] || { totalActive: 0 };
              return (
                <div key={addOn.id} style={styles.card} className="service-card-hover">
                  <div className="d-flex justify-content-between align-items-start">
                    <div style={{ flex: 1 }}>
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#888', textTransform: 'uppercase' }}>{addOn.category || 'Add-on'}</span>
                      </div>
                      <h5 className="fw-800 mb-1">{addOn.name}</h5>
                      <span style={styles.durationBadge}>+{addOn.duration} mins</span>
                    </div>
                    <div className="dropdown">
                      <button className="btn btn-light rounded-circle touch-btn" data-bs-toggle="dropdown" style={{ width: '36px', height: '36px', padding: 0 }}>
                        <i className="bi bi-three-dots-vertical"></i>
                      </button>
                      <ul className="dropdown-menu dropdown-menu-end border-0 shadow-lg p-2" style={{ borderRadius: '16px' }}>
                        <li><button className="dropdown-item rounded-3 py-2" onClick={() => handleAddOnEdit(addOn)}><i className="bi bi-pencil me-2"></i>Edit</button></li>
                        <li><button className="dropdown-item rounded-3 py-2" onClick={() => handleAddOnToggleActive(addOn)}><i className={`bi bi-eye${addOn.is_active ? '-slash' : ''} me-2`}></i>{addOn.is_active ? 'Deactivate' : 'Activate'}</button></li>
                        <li><hr className="dropdown-divider opacity-50" /></li>
                        <li><button className="dropdown-item rounded-3 py-2 text-danger" onClick={() => handleAddOnDelete(addOn)}><i className="bi bi-trash me-2"></i>Delete</button></li>
                      </ul>
                    </div>
                  </div>

                  <p className="small text-muted mb-auto line-clamp-2" style={{ height: '40px' }}>{addOn.description || 'No description provided.'}</p>

                  <div className="d-flex justify-content-between align-items-center mt-2 pt-3 border-top">
                    <div style={styles.priceLabel}>{formatPrice(addOn.price)}</div>
                    {usage.totalActive > 0 ? (
                      <button className="btn btn-sm text-primary fw-700 p-0" onClick={() => handleViewUsage(addOn, 'addon')}>
                        <i className="bi bi-people-fill me-1"></i>{usage.totalActive} Active
                      </button>
                    ) : (
                      <span className="small text-muted opacity-50"><i className="bi bi-check2-circle me-1"></i>Unused</span>
                    )}
                  </div>

                  {!addOn.is_active && (
                    <div className="position-absolute top-0 end-0 p-2">
                      <span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>HIDDEN</span>
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </div>

      {/* Service Modal */}
      {showServiceModal && (
        <div className="modal fade show d-block" style={styles.modal} onClick={(e) => { if (e.target === e.currentTarget) resetServiceFormAndCloseModal(); }}>
          <div className={`modal-dialog modal-lg ${windowWidth < 576 ? 'm-0 h-100' : 'modal-dialog-centered'}`}>
            <div className="modal-content border-0" style={styles.modalContent}>
              <div className="modal-header border-0 p-4 pb-0">
                <div className="w-100">
                  {windowWidth < 576 && <div className="modal-drag-indicator mb-3 mx-auto"></div>}
                  <h5 className="fw-800 m-0">{isEditingService ? 'Edit Service' : 'New Service'}</h5>
                </div>
                <button type="button" className="btn-close" onClick={resetServiceFormAndCloseModal}></button>
              </div>
              <div className="modal-body p-4">
                <form onSubmit={handleServiceSubmit}>
                  <div className="row g-3">
                    <div className="col-12">
                      <div className="form-floating mb-3">
                        <input type="text" className={`form-control premium-input ${formErrors.name ? 'is-invalid' : ''}`} id="service_name" name="name" value={serviceFormData.name} onChange={handleServiceChange} placeholder="e.g. Premium Haircut" required />
                        <label htmlFor="service_name">Service Name</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-floating mb-3">
                        <input type="number" className={`form-control premium-input ${formErrors.price ? 'is-invalid' : ''}`} id="service_price" name="price" value={serviceFormData.price} onChange={handleServiceChange} step="0.01" min="0" placeholder="Price" required />
                        <label htmlFor="service_price">Price (₱)</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-floating mb-3">
                        <input type="number" className={`form-control premium-input ${formErrors.duration ? 'is-invalid' : ''}`} id="service_duration" name="duration" value={serviceFormData.duration} onChange={handleServiceChange} min="1" placeholder="Duration" required />
                        <label htmlFor="service_duration">Duration (mins)</label>
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="form-floating mb-3">
                        <textarea className="form-control premium-input" id="service_description" name="description" value={serviceFormData.description} onChange={handleServiceChange} placeholder="Description" style={{ height: '100px' }}></textarea>
                        <label htmlFor="service_description">Description</label>
                      </div>
                    </div>
                    <div className="col-12 mb-3">
                      <div className="p-3 rounded-4 bg-light border d-flex align-items-center justify-content-between">
                        <div>
                          <div className="fw-bold">Active Status</div>
                          <div className="small text-muted">Visible to customers</div>
                        </div>
                        <div className="form-check form-switch fs-4">
                          <input className="form-check-input custom-switch" type="checkbox" id="service_is_active" name="is_active" checked={serviceFormData.is_active} onChange={handleServiceChange} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-dark w-100 py-3 rounded-4 fw-800 premium-btn" disabled={loading}>
                    {loading ? (
                      <span className="d-flex align-items-center justify-content-center gap-2">
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        SYNCING...
                      </span>
                    ) : (
                      <span className="d-flex align-items-center justify-content-center gap-2">
                        <i className={`bi bi-${isEditingService ? 'check2-circle' : 'rocket-takeoff-fill'}`}></i>
                        {isEditingService ? 'UPDATE SERVICE' : 'LAUNCH SERVICE'}
                      </span>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add-on Modal */}
      {showAddOnModal && (
        <div className="modal fade show d-block" style={styles.modal} onClick={(e) => { if (e.target === e.currentTarget) resetAddOnFormAndCloseModal(); }}>
          <div className={`modal-dialog modal-lg ${windowWidth < 576 ? 'm-0 h-100' : 'modal-dialog-centered'}`}>
            <div className="modal-content border-0" style={styles.modalContent}>
              <div className="modal-header border-0 p-4 pb-0">
                <div className="w-100">
                  {windowWidth < 576 && <div className="modal-drag-indicator mb-3 mx-auto"></div>}
                  <h5 className="fw-800 m-0">{isEditingAddOn ? 'Refine Add-on' : 'New Add-on'}</h5>
                </div>
                <button type="button" className="btn-close" onClick={resetAddOnFormAndCloseModal}></button>
              </div>
              <div className="modal-body p-4">
                <form onSubmit={handleAddOnSubmit}>
                  <div className="row g-3">
                    <div className="col-md-8">
                      <div className="form-floating mb-3">
                        <input type="text" className={`form-control premium-input ${formErrors.name ? 'is-invalid' : ''}`} id="addon_name" name="name" value={addOnFormData.name} onChange={handleAddOnChange} placeholder="e.g. Beard Oil" required />
                        <label htmlFor="addon_name">Add-on Name</label>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="form-floating mb-3">
                        <input type="text" className="form-control premium-input" id="addon_category" name="category" value={addOnFormData.category} onChange={handleAddOnChange} placeholder="Category" />
                        <label htmlFor="addon_category">Category</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-floating mb-3">
                        <input type="number" className={`form-control premium-input ${formErrors.price ? 'is-invalid' : ''}`} id="addon_price" name="price" value={addOnFormData.price} onChange={handleAddOnChange} step="0.01" min="0" placeholder="Price" required />
                        <label htmlFor="addon_price">Price (₱)</label>
                      </div>
                    </div>
                    <div className="col-md-6">
                      <div className="form-floating mb-3">
                        <input type="number" className={`form-control premium-input ${formErrors.duration ? 'is-invalid' : ''}`} id="addon_duration" name="duration" value={addOnFormData.duration} onChange={handleAddOnChange} min="1" placeholder="Duration" required />
                        <label htmlFor="addon_duration">Duration (mins)</label>
                      </div>
                    </div>
                    <div className="col-12">
                      <div className="form-floating mb-3">
                        <textarea className="form-control premium-input" id="addon_description" name="description" value={addOnFormData.description} onChange={handleAddOnChange} placeholder="Description" style={{ height: '100px' }}></textarea>
                        <label htmlFor="addon_description">Description</label>
                      </div>
                    </div>
                    <div className="col-12 mb-3">
                      <div className="p-3 rounded-4 bg-light border d-flex align-items-center justify-content-between">
                        <div>
                          <div className="fw-bold">Active Status</div>
                          <div className="small text-muted">Available for booking</div>
                        </div>
                        <div className="form-check form-switch fs-4">
                          <input className="form-check-input custom-switch" type="checkbox" id="addon_is_active" name="is_active" checked={addOnFormData.is_active} onChange={handleAddOnChange} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-dark w-100 py-3 rounded-4 fw-800 premium-btn" disabled={loading}>
                    {loading ? (
                      <span className="d-flex align-items-center justify-content-center gap-2">
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        SYNCING...
                      </span>
                    ) : (
                      <span className="d-flex align-items-center justify-content-center gap-2">
                        <i className={`bi bi-${isEditingAddOn ? 'check2-circle' : 'rocket-takeoff-fill'}`}></i>
                        {isEditingAddOn ? 'UPDATE ADD-ON' : 'LAUNCH ADD-ON'}
                      </span>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteModal && (
        <div className="modal fade show d-block" style={styles.modal} onClick={(e) => { if (e.target === e.currentTarget) { setShowDeleteModal(false); setItemToDelete(null); } }}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '28px' }}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{ width: '64px', height: '64px', backgroundColor: '#ffebee', borderRadius: '20px' }}>
                  <i className="bi bi-trash3-fill text-danger fs-3"></i>
                </div>
                <h5 className="fw-800 text-danger">Confirm Delete</h5>
                <p className="small text-muted mb-4">Are you sure you want to permanently remove <strong>{itemToDelete?.name}</strong>?</p>
                <div className="d-grid gap-2">
                  <button className="btn btn-danger py-3 rounded-pill fw-bold" onClick={confirmDelete}>DELETE FOREVER</button>
                  <button className="btn btn-link text-muted" onClick={() => { setShowDeleteModal(false); setItemToDelete(null); }}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Option Modal */}
      {showDeactivateModal && (
        <div className="modal fade show d-block" style={styles.modal} onClick={(e) => { if (e.target === e.currentTarget) { setShowDeactivateModal(false); setItemToDeactivate(null); } }}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '28px' }}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{ width: '64px', height: '64px', backgroundColor: '#fff3e0', borderRadius: '20px' }}>
                  <i className="bi bi-eye-slash-fill text-warning fs-3"></i>
                </div>
                <h5 className="fw-800">In Use</h5>
                <p className="small text-muted">{itemToDeactivate?.errorMessage}</p>
                <p className="small fw-bold">Would you like to deactivate it instead?</p>
                <div className="d-grid gap-2">
                  <button className="btn btn-warning py-3 rounded-pill fw-bold text-dark" onClick={confirmDeactivate}>DEACTIVATE INSTEAD</button>
                  <button className="btn btn-link text-muted" onClick={() => { setShowDeactivateModal(false); setItemToDeactivate(null); }}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Usage Bookings Modal */}
      {showUsageModal && usageItem && (
        <div className="modal fade show d-block" style={styles.modal} onClick={(e) => { if (e.target === e.currentTarget) { setShowUsageModal(false); setUsageItem(null); } }}>
          <div className={`modal-dialog modal-lg ${windowWidth < 576 ? 'm-0 h-100' : 'modal-dialog-centered'}`}>
            <div className="modal-content border-0" style={styles.modalContent}>
              <div className="modal-header border-0 p-4 pb-0">
                <div className="w-100">
                  {windowWidth < 576 && <div className="modal-drag-indicator mb-3 mx-auto"></div>}
                  <h5 className="fw-800 m-0">Bookings: {usageItem.name}</h5>
                </div>
                <button type="button" className="btn-close" onClick={() => { setShowUsageModal(false); setUsageItem(null); }}></button>
              </div>
              <div className="modal-body p-4 scroll-mobile-modal" style={{ maxHeight: windowWidth < 576 ? '70vh' : '400px', overflowY: 'auto' }}>
                {loadingUsage ? (
                  <div className="text-center py-5"><div className="spinner-border text-dark"></div></div>
                ) : usageBookings.length === 0 ? (
                  <div className="text-center py-4 text-muted">No bookings found.</div>
                ) : (
                  <div className="list-group list-group-flush gap-2">
                    {usageBookings.map((appt) => (
                      <div key={appt.id} className="list-group-item rounded-4 border p-3 d-flex justify-content-between align-items-center mb-2">
                        <div>
                          <div className="fw-bold">{appt.customer?.full_name || 'Guest'}</div>
                          <div className="small text-muted">{appt.appointment_date} @ {appt.appointment_time || 'Queue'}</div>
                          <span className={`badge bg-light text-dark border mt-1`} style={{ fontSize: '0.6rem' }}>
                            {appt.status.toUpperCase()}
                          </span>
                        </div>
                        <button className="btn btn-light rounded-circle" onClick={() => handleArchiveBooking(appt.id)}>
                          <i className="bi bi-box-arrow-down"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation */}
      {showArchiveBookingModal && (
        <div className="modal fade show d-block" style={styles.modal} onClick={(e) => { if (e.target === e.currentTarget) { setShowArchiveBookingModal(false); setBookingToArchive(null); } }}>
          <div className="modal-dialog modal-dialog-centered modal-sm p-3">
            <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '28px' }}>
              <div className="modal-body p-4 text-center">
                <div className="mb-3 mx-auto d-flex align-items-center justify-content-center" style={{ width: '64px', height: '64px', backgroundColor: '#f5f5f5', borderRadius: '20px' }}>
                  <i className="bi bi-box-arrow-down text-dark fs-3"></i>
                </div>
                <h5 className="fw-800">Archive Booking</h5>
                <p className="small text-muted">This will hide the booking from usage list.</p>
                <div className="d-grid gap-2">
                  <button className="btn btn-dark py-3 rounded-pill fw-bold" onClick={confirmArchiveBooking}>ARCHIVE</button>
                  <button className="btn btn-link text-muted" onClick={() => { setShowArchiveBookingModal(false); setBookingToArchive(null); }}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .service-card-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .service-card-hover:hover {
          transform: translateY(-8px);
          box-shadow: 0 15px 35px rgba(0,0,0,0.08) !important;
          border-color: #5D403788 !important;
        }
        .fw-800 { font-weight: 800; }
        
        /* Interactive Elements */
        .touch-btn {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .touch-btn:active { 
          transform: scale(0.9) !important;
          opacity: 0.8;
        }
        .premium-input {
          border-radius: 16px !important;
          border: 1.5px solid #eee !important;
          background-color: #fcfcfc !important;
          transition: all 0.2s ease !important;
        }
        .premium-input:focus {
          background-color: #fff !important;
          border-color: #5D4037 !important;
          box-shadow: 0 4px 15px rgba(93, 64, 55, 0.08) !important;
          transform: translateY(-1px);
        }
        .custom-switch:checked {
          background-color: #5D4037 !important;
          border-color: #5D4037 !important;
        }
        
        .modal-drag-indicator { 
          width: 36px; 
          height: 4px; 
          background: #e0e0e0; 
          border-radius: 10px; 
        }

        /* Modal Animations */
        @media (max-width: 575.98px) {
          .modal-dialog {
            display: flex;
            align-items: flex-end;
            margin: 0 !important;
            height: 100%;
            max-width: 100%;
          }
          .modal-content {
            animation: slideUp 0.4s cubic-bezier(0, 0, 0.2, 1);
          }
        }

        @media (min-width: 576px) {
          .modal-content {
            animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .shake { animation: shake 0.5s; }
        @keyframes shake {
          0%, 100% {transform: translateX(0);}
          10%, 30%, 50%, 70%, 90% {transform: translateX(-5px);}
          20%, 40%, 60%, 80% {transform: translateX(5px);}
        }

        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .premium-btn {
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border: none !important;
        }
        .premium-btn:hover {
          transform: translateY(-2px) scale(1.01);
          box-shadow: 0 8px 25px rgba(0,0,0,0.2) !important;
          background-color: #333 !important;
        }
        .premium-btn:active {
          transform: translateY(0) scale(0.98) !important;
        }
        .premium-btn::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -60%;
          width: 20%;
          height: 200%;
          background: rgba(255,255,255,0.1);
          transform: rotate(30deg);
          transition: all 0.5s;
        }
        .premium-btn:hover::after {
          left: 120%;
        }
        .dropdown-item:active {
          background-color: #5D4037 !important;
          color: #fff !important;
        }

        /* Better scrolling for mobile modals */
        .scroll-mobile-modal::-webkit-scrollbar {
          width: 0px;
        }
      `}</style>
    </div>
  );
};

export default ManageServices;
