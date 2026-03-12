// components/manager/ManageServices.js
import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { apiService } from '../../services/core/ApiService';
import centralizedNotificationService from '../../services/notifications/CentralizedNotificationService';
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
    <div className="container py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 p-3 rounded shadow-sm" style={{ background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' }}>
        <h2 className="mb-0 fw-bold">Manage Services & Add-ons</h2>
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
                          const usage = serviceUsage[service.id] || { totalActive: 0, totalPast: 0, directReferences: 0, jsonReferences: 0 };

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
                              <td>{formatPrice(service.price)}</td>
                              <td>{service.duration} min</td>
                              <td>
                                <span className={`badge bg-${service.is_active ? 'success' : 'secondary'}`}>
                                  {service.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td>
                                {usage.totalActive > 0 ? (
                                  <div className="d-flex flex-column align-items-start">
                                    <span className="badge bg-warning text-dark mb-1">
                                      <i className="bi bi-people me-1"></i>
                                      {usage.totalActive} active
                                    </span>
                                    {usage.directReferences > 0 && (
                                      <small className="text-muted">
                                        {usage.directReferences} direct
                                      </small>
                                    )}
                                    {usage.jsonReferences > 0 && (
                                      <small className="text-muted mb-1">
                                        {usage.jsonReferences} in bundles
                                      </small>
                                    )}
                                    <button className="btn btn-sm btn-link p-0 text-decoration-none" onClick={() => handleViewUsage(service, 'service')}>
                                      View Bookings
                                    </button>
                                  </div>
                                ) : usage.totalPast > 0 ? (
                                  <div className="d-flex flex-column align-items-start">
                                    <span className="text-muted mb-1">
                                      <i className="bi bi-clock-history me-1"></i>
                                      {usage.totalPast} past bookings
                                    </span>
                                    <button className="btn btn-sm btn-link p-0 text-decoration-none" onClick={() => handleViewUsage(service, 'service')}>
                                      View Bookings
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-muted">
                                    <i className="bi bi-check-circle text-success me-1"></i>
                                    Unused
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
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => handleServiceDelete(service)}
                                    title="Delete service"
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
                          const usage = addOnUsage[addOn.id] || { totalActive: 0, totalPast: 0 };

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
                              <td>{formatPrice(addOn.price)}</td>
                              <td>{addOn.duration} min</td>
                              <td>
                                <span className={`badge bg-${addOn.is_active ? 'success' : 'secondary'}`}>
                                  {addOn.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td>
                                {usage.totalActive > 0 ? (
                                  <div className="d-flex flex-column align-items-start">
                                    <span className="badge bg-warning text-dark mb-1">
                                      <i className="bi bi-people me-1"></i>
                                      {usage.totalActive} active
                                    </span>
                                    <button className="btn btn-sm btn-link p-0 text-decoration-none" onClick={() => handleViewUsage(addOn, 'addon')}>
                                      View Bookings
                                    </button>
                                  </div>
                                ) : usage.totalPast > 0 ? (
                                  <div className="d-flex flex-column align-items-start">
                                    <span className="text-muted mb-1">
                                      <i className="bi bi-clock-history me-1"></i>
                                      {usage.totalPast} past bookings
                                    </span>
                                    <button className="btn btn-sm btn-link p-0 text-decoration-none" onClick={() => handleViewUsage(addOn, 'addon')}>
                                      View Bookings
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-muted">
                                    <i className="bi bi-check-circle text-success me-1"></i>
                                    Unused
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
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => handleAddOnDelete(addOn)}
                                    title="Delete add-on"
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && itemToDelete && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-danger text-white">
                <h5 className="modal-title">Delete {itemToDelete.type === 'service' ? 'Service' : 'Add-on'}</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => { setShowDeleteModal(false); setItemToDelete(null); }}
                ></button>
              </div>
              <div className="modal-body p-4 text-center">
                <i className="bi bi-exclamation-triangle-fill text-danger mb-3" style={{ fontSize: '3rem' }}></i>
                <h5>Are you sure?</h5>
                <p>Are you sure you want to permanently delete <strong>{itemToDelete.name}</strong>? This action cannot be undone.</p>
              </div>
              <div className="modal-footer border-0 bg-light">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowDeleteModal(false); setItemToDelete(null); }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger px-4"
                  onClick={confirmDelete}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Option Modal */}
      {showDeactivateModal && itemToDeactivate && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-warning text-dark">
                <h5 className="modal-title">Item In Use</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => { setShowDeactivateModal(false); setItemToDeactivate(null); }}
                ></button>
              </div>
              <div className="modal-body p-4 text-center">
                <i className="bi bi-info-circle-fill text-warning mb-3" style={{ fontSize: '3rem' }}></i>
                <h5>Cannot Delete {itemToDeactivate.type === 'service' ? 'Service' : 'Add-on'}</h5>
                <p className="text-start">{itemToDeactivate.errorMessage}</p>
                <p className="text-start mt-3 border-top pt-3">
                  Would you like to <strong>deactivate</strong> "{itemToDeactivate.name}" instead? This will safely hide it from new bookings while keeping your historical data fully intact.
                </p>
              </div>
              <div className="modal-footer border-0 bg-light">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowDeactivateModal(false); setItemToDeactivate(null); }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-warning px-4 text-dark fw-bold"
                  onClick={confirmDeactivate}
                  disabled={loading}
                >
                  {loading ? 'Deactivating...' : 'Deactivate Instead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Usage Bookings Modal */}
      {showUsageModal && usageItem && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title">
                  <i className="bi bi-calendar2-check me-2"></i>
                  Bookings for "{usageItem.name}"
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => { setShowUsageModal(false); setUsageItem(null); }}
                ></button>
              </div>
              <div className="modal-body p-4">
                {loadingUsage ? (
                  <div className="text-center py-5">
                    <div className="spinner-border text-primary mb-3" role="status">
                      <span className="visually-hidden">Loading...</span>
                    </div>
                    <p className="text-muted">Fetching bookings...</p>
                  </div>
                ) : usageBookings.length === 0 ? (
                  <div className="text-center py-5">
                    <i className="bi bi-inbox fs-1 text-muted mb-3 d-block"></i>
                    <p className="text-muted text-center m-0">No bookings found for this {usageItem.type}.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle">
                      <thead className="table-light">
                        <tr>
                          <th>Date</th>
                          <th>Time</th>
                          <th>Customer</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usageBookings.map((appt) => (
                          <tr key={appt.id}>
                            <td>{appt.appointment_date || <span className="text-muted fst-italic">Queue</span>}</td>
                            <td>{appt.appointment_time || '-'}</td>
                            <td>{appt.customer?.full_name || 'Guest Customer'}</td>
                            <td>
                              <span className={`badge bg-${['confirmed', 'ongoing'].includes(appt.status) ? 'success' :
                                appt.status === 'completed' ? 'primary' :
                                  ['cancelled', 'no_show', 'rejected'].includes(appt.status) ? 'danger' :
                                    'secondary'
                                }`}>
                                {appt.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => handleArchiveBooking(appt.id)}
                                title="Archive this booking"
                              >
                                <i className="bi bi-box-arrow-down"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer bg-light border-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowUsageModal(false); setUsageItem(null); }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Booking Confirmation Modal */}
      {showArchiveBookingModal && bookingToArchive && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1070 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header bg-secondary text-white">
                <h5 className="modal-title">Archive Booking</h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => { setShowArchiveBookingModal(false); setBookingToArchive(null); }}
                ></button>
              </div>
              <div className="modal-body p-4 text-center">
                <i className="bi bi-box-arrow-down text-secondary mb-3" style={{ fontSize: '3rem' }}></i>
                <h5>Are you sure?</h5>
                <p>Are you sure you want to archive this booking? It will be hidden from the active usage lists but preserved in the database for historical records.</p>
              </div>
              <div className="modal-footer border-0 bg-light">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowArchiveBookingModal(false); setBookingToArchive(null); }}
                  disabled={loadingUsage}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-4"
                  onClick={confirmArchiveBooking}
                  disabled={loadingUsage}
                >
                  {loadingUsage ? 'Archiving...' : 'Archive'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageServices;
