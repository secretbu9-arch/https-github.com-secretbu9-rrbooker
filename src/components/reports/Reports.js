// components/reports/Reports.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import OrderReports from './OrderReports';

const Reports = () => {
  const [reportType, setReportType] = useState('revenue');
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  
  // Quick date range filters
  const [selectedQuickFilter, setSelectedQuickFilter] = useState('today');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  // Manager deduction system
  const [deductions, setDeductions] = useState({
    lunch: 0,
    supplies: 0,
    other: 0
  });

  // Export functionality
  const reportRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  // Quick date range filter functions
  const setQuickDateRange = (filter) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    switch (filter) {
      case 'today':
        setDateRange({ start: todayStr, end: todayStr });
        break;
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
        setDateRange({ 
          start: weekStart.toISOString().split('T')[0], 
          end: todayStr 
        });
        break;
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        setDateRange({ 
          start: monthStart.toISOString().split('T')[0], 
          end: todayStr 
        });
        break;
      case 'last7days':
        const last7Days = new Date(today);
        last7Days.setDate(today.getDate() - 7);
        setDateRange({ 
          start: last7Days.toISOString().split('T')[0], 
          end: todayStr 
        });
        break;
      case 'last30days':
        const last30Days = new Date(today);
        last30Days.setDate(today.getDate() - 30);
        setDateRange({ 
          start: last30Days.toISOString().split('T')[0], 
          end: todayStr 
        });
        break;
      default:
        break;
    }
    setSelectedQuickFilter(filter);
  };

  // Export functions
  const exportToPDF = async () => {
    if (!reportRef.current) return;
    
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Add header with date range
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${reportTypes.find(t => t.value === reportType)?.label || 'Report'}`, 20, 20);
      
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      const dateText = `Date Range: ${new Date(dateRange.start).toLocaleDateString()} - ${new Date(dateRange.end).toLocaleDateString()}`;
      pdf.text(dateText, 20, 30);
      
      pdf.setFontSize(10);
      const generatedText = `Generated on: ${new Date().toLocaleString()}`;
      pdf.text(generatedText, 20, 40);
      
      // Add a line separator
      pdf.setLineWidth(0.5);
      pdf.line(20, 45, 190, 45);
      
      const imgWidth = 190;
      const pageHeight = 250; // Reduced to account for header
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      
      let position = 50; // Start below header
      
      pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight + 50; // Account for header on new pages
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      const fileName = `${reportType}_report_${dateRange.start}_to_${dateRange.end}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Error exporting to PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToImage = async () => {
    if (!reportRef.current) return;
    
    setIsExporting(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });
      
      // Create a new canvas with header information
      const headerCanvas = document.createElement('canvas');
      const headerCtx = headerCanvas.getContext('2d');
      
      // Set canvas size (add space for header)
      headerCanvas.width = canvas.width;
      headerCanvas.height = canvas.height + 80; // Add space for header
      
      // Fill background
      headerCtx.fillStyle = '#ffffff';
      headerCtx.fillRect(0, 0, headerCanvas.width, headerCanvas.height);
      
      // Add header text
      headerCtx.fillStyle = '#000000';
      headerCtx.font = 'bold 24px Arial';
      headerCtx.textAlign = 'left';
      headerCtx.fillText(`${reportTypes.find(t => t.value === reportType)?.label || 'Report'}`, 20, 30);
      
      headerCtx.font = '18px Arial';
      const dateText = `Date Range: ${new Date(dateRange.start).toLocaleDateString()} - ${new Date(dateRange.end).toLocaleDateString()}`;
      headerCtx.fillText(dateText, 20, 55);
      
      headerCtx.font = '14px Arial';
      headerCtx.fillStyle = '#666666';
      const generatedText = `Generated on: ${new Date().toLocaleString()}`;
      headerCtx.fillText(generatedText, 20, 75);
      
      // Draw the original report content below the header
      headerCtx.drawImage(canvas, 0, 80);
      
      const link = document.createElement('a');
      link.download = `${reportType}_report_${dateRange.start}_to_${dateRange.end}.png`;
      link.href = headerCanvas.toDataURL();
      link.click();
    } catch (error) {
      console.error('Error exporting to image:', error);
      alert('Error exporting to image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const reportTypes = [
    { value: 'revenue', label: 'Revenue Report' },
    { value: 'orders', label: 'Order Reports' },
    { value: 'appointments', label: 'Appointments Report' },
    { value: 'customers', label: 'Customer Analytics' },
    { value: 'services', label: 'Service Performance' },
    { value: 'queue', label: 'Queue Analytics' },
    { value: 'double_booking', label: 'Double Booking Insights' },
    { value: 'real_time', label: 'Real-time Dashboard' },
    { value: 'inventory', label: 'Inventory Report' },
    { value: 'system', label: 'System Activity Logs' }
  ];

  useEffect(() => {
    if (dateRange.start && dateRange.end) {
      generateReport();
    }
  }, [reportType, dateRange]);

  // Auto-refresh for real-time dashboard
  useEffect(() => {
    let interval;
    if (autoRefresh && reportType === 'real_time') {
      interval = setInterval(() => {
        generateReport();
      }, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, reportType]);

  const generateReport = async () => {
    setLoading(true);
    setError('');
    
    try {
      let data;
      switch (reportType) {
        case 'revenue':
          data = await generateRevenueReport();
          break;
        case 'orders':
          // Orders report is handled by OrderReports component
          data = { type: 'orders' };
          break;
        case 'appointments':
          data = await generateAppointmentsReport();
          break;
        case 'customers':
          data = await generateCustomerReport();
          break;
        case 'services':
          data = await generateServiceReport();
          break;
        case 'inventory':
          data = await generateInventoryReport();
          break;
        case 'queue':
          data = await generateQueueReport();
          break;
        case 'double_booking':
          data = await generateDoubleBookingReport();
          break;
        case 'real_time':
          data = await generateRealTimeReport();
          break;
        case 'system':
          data = await generateSystemReport();
          break;
        default:
          throw new Error('Invalid report type');
      }
      
      // Validate data before setting
      if (!data) {
        throw new Error('No data returned from report generation');
      }
      
      setReportData(data);
      
      // Log report generation
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('system_logs').insert({
        user_id: user.id,
        action: 'report_generated',
        details: {
          report_type: reportType,
          date_range: dateRange
        }
      });
    } catch (err) {
      console.error('Report generation error:', err);
      setError('Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const generateRevenueReport = async () => {
    // Get appointments with services (including all statuses for testing)
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        *,
        service:service_id(name, price),
        barber:barber_id(full_name)
      `)
      .gte('appointment_date', dateRange.start)
      .lte('appointment_date', dateRange.end);

    // Get orders for the same date range
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end);


    // Calculate revenue (simplified - no add-ons)
    const revenueByBarber = {};
    const revenueByService = {};
    let totalRevenue = 0;
    let totalOrderRevenue = 0;

    appointments?.forEach(apt => {
      const barberId = apt.barber_id;
      const serviceId = apt.service_id;
      const servicePrice = apt.service?.price || 0;
      const totalPrice = apt.total_price || servicePrice;
      
      // Only count revenue for completed appointments
      if (!['done', 'completed'].includes(apt.status)) {
        return;
      }

      // Revenue by barber
      if (!revenueByBarber[barberId]) {
        revenueByBarber[barberId] = {
          name: apt.barber?.full_name || 'Unknown',
          revenue: 0,
          appointments: 0
        };
      }
      revenueByBarber[barberId].revenue += totalPrice;
      revenueByBarber[barberId].appointments += 1;

      // Revenue by service
      if (!revenueByService[serviceId]) {
        revenueByService[serviceId] = {
          name: apt.service?.name || 'Unknown',
          revenue: 0,
          count: 0
        };
      }
      revenueByService[serviceId].revenue += totalPrice;
      revenueByService[serviceId].count += 1;

      totalRevenue += totalPrice;
    });

    // Calculate order revenue
    orders?.forEach(order => {
      // Only count completed orders (picked_up status)
      if (order.status === 'picked_up') {
        totalOrderRevenue += order.total_amount || 0;
      }
    });

    // Daily revenue (only for completed appointments)
    const dailyRevenue = {};
    appointments?.forEach(apt => {
      if (!['done', 'completed'].includes(apt.status)) {
        return;
      }
      const date = apt.appointment_date;
      const price = apt.total_price || apt.service?.price || 0;
      if (!dailyRevenue[date]) {
        dailyRevenue[date] = 0;
      }
      dailyRevenue[date] += price;
    });

    // Get today's revenue
    const today = new Date().toISOString().split('T')[0];
    const todayRevenue = dailyRevenue[today] || 0;



    return {
      summary: {
        totalRevenue,
        totalOrderRevenue,
        totalCombinedRevenue: totalRevenue + totalOrderRevenue,
        totalAppointments: appointments?.length || 0,
        totalOrders: orders?.length || 0,
        averageTransaction: appointments?.length ? totalRevenue / appointments.length : 0,
        averageOrderValue: orders?.length ? totalOrderRevenue / orders.length : 0,
        todayRevenue
      },
      revenueByBarber: Object.values(revenueByBarber || {}),
      revenueByService: Object.values(revenueByService || {}),
      dailyRevenue
    };
  };

  const generateAppointmentsReport = async () => {
    const { data: appointments } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(full_name),
        barber:barber_id(full_name),
        service:service_id(name, price, duration)
      `)
      .gte('appointment_date', dateRange.start)
      .lte('appointment_date', dateRange.end);

    // Status breakdown
    const statusBreakdown = {
      scheduled: 0,
      ongoing: 0,
      done: 0,
      cancelled: 0
    };

    // Additional metrics
    let queueAppointments = 0;
    let scheduledAppointments = 0;
    let walkInAppointments = 0;
    let doubleBookings = 0;

    appointments?.forEach(apt => {
      statusBreakdown[apt.status] = (statusBreakdown[apt.status] || 0) + 1;
      
      // Count appointment types
      if (apt.appointment_type === 'queue') queueAppointments++;
      if (apt.appointment_type === 'scheduled') scheduledAppointments++;
      if (apt.is_walk_in) walkInAppointments++;
      if (apt.is_double_booking) doubleBookings++;
    });

    // Appointments by barber
    const appointmentsByBarber = {};
    appointments?.forEach(apt => {
      const barberId = apt.barber_id;
      if (!appointmentsByBarber[barberId]) {
        appointmentsByBarber[barberId] = {
          name: apt.barber?.full_name || 'Unknown',
          total: 0,
          queueAppointments: 0,
          statusBreakdown: { scheduled: 0, ongoing: 0, done: 0, cancelled: 0 }
        };
      }
      appointmentsByBarber[barberId].total += 1;
      appointmentsByBarber[barberId].statusBreakdown[apt.status] += 1;
      if (apt.appointment_type === 'queue') {
        appointmentsByBarber[barberId].queueAppointments += 1;
      }
    });

    // Appointments by service
    const appointmentsByService = {};
    appointments?.forEach(apt => {
      const serviceId = apt.service_id;
      if (!appointmentsByService[serviceId]) {
        appointmentsByService[serviceId] = {
          name: apt.service?.name || 'Unknown',
          total: 0,
          completed: 0,
          totalDuration: 0,
          revenue: 0
        };
      }
      appointmentsByService[serviceId].total += 1;
      if (apt.status === 'done') {
        appointmentsByService[serviceId].completed += 1;
        appointmentsByService[serviceId].revenue += apt.total_price || apt.service?.price || 0;
      }
      appointmentsByService[serviceId].totalDuration += apt.total_duration || apt.service?.duration || 0;
    });

    // Calculate averages for services
    Object.values(appointmentsByService).forEach(service => {
      service.averageDuration = service.total > 0 ? Math.round(service.totalDuration / service.total) : 0;
    });

    // Daily breakdown
    const dailyBreakdown = {};
    appointments?.forEach(apt => {
      const date = apt.appointment_date;
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = {
          date,
          total: 0,
          scheduled: 0,
          queue: 0,
          completed: 0,
          cancelled: 0
        };
      }
      dailyBreakdown[date].total += 1;
      if (apt.appointment_type === 'scheduled') dailyBreakdown[date].scheduled += 1;
      if (apt.appointment_type === 'queue') dailyBreakdown[date].queue += 1;
      if (apt.status === 'done') dailyBreakdown[date].completed += 1;
      if (apt.status === 'cancelled') dailyBreakdown[date].cancelled += 1;
    });

    return {
      summary: {
        total: appointments?.length || 0,
        statusBreakdown,
        queueAppointments,
        scheduledAppointments,
        walkInAppointments,
        doubleBookings
      },
      appointmentsByBarber: Object.values(appointmentsByBarber || {}),
      appointmentsByService: Object.values(appointmentsByService || {}),
      dailyBreakdown: Object.values(dailyBreakdown || {}).sort((a, b) => new Date(a.date) - new Date(b.date)),
      appointments: appointments || []
    };
  };

  const generateCustomerReport = async () => {
    // Get all customers
    const { data: customers } = await supabase
      .from('users')
      .select('id, full_name, email, created_at')
      .eq('role', 'customer');

    // Get appointment data for customers
    const customerStats = {};
    
    for (const customer of customers || []) {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*, service:service_id(price)')
        .eq('customer_id', customer.id)
        .gte('appointment_date', dateRange.start)
        .lte('appointment_date', dateRange.end);

      customerStats[customer.id] = {
        ...customer,
        appointments: appointments?.length || 0,
        totalSpent: appointments?.reduce((sum, apt) => sum + (apt.service?.price || 0), 0) || 0,
        lastVisit: appointments?.[0]?.appointment_date || null
      };
    }

    // New customers in period
    const newCustomers = customers?.filter(c => 
      new Date(c.created_at) >= new Date(dateRange.start) &&
      new Date(c.created_at) <= new Date(dateRange.end)
    ).length || 0;

    return {
      summary: {
        totalCustomers: customers?.length || 0,
        newCustomers,
        repeatCustomers: Object.values(customerStats || {}).filter(c => c.appointments > 1).length
      },
      customerStats: Object.values(customerStats || {})
    };
  };

  const generateServiceReport = async () => {
    const { data: services } = await supabase
      .from('services')
      .select('*');

    const servicePerformance = {};

    for (const service of services || []) {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('service_id', service.id)
        .gte('appointment_date', dateRange.start)
        .lte('appointment_date', dateRange.end);

      servicePerformance[service.id] = {
        ...service,
        bookings: appointments?.length || 0,
        revenue: (appointments?.length || 0) * service.price
      };
    }

    return {
      servicePerformance: Object.values(servicePerformance || {}),
      mostPopular: Object.values(servicePerformance || {}).sort((a, b) => b.bookings - a.bookings)[0],
      mostRevenue: Object.values(servicePerformance || {}).sort((a, b) => b.revenue - a.revenue)[0]
    };
  };

  const generateInventoryReport = async () => {
    const { data: products } = await supabase
      .from('products')
      .select('*');

    // Products needing restock
    const needsRestock = products?.filter(p => p.stock_quantity < 10) || [];

    // Low stock items
    const lowStock = products?.filter(p => p.stock_quantity < 5) || [];

    // Get sales data
    const { data: orders } = await supabase
      .from('orders')
      .select('items')
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end);

    const productSales = {};
    orders?.forEach(order => {
      order.items?.forEach(item => {
        if (!productSales[item.id]) {
          productSales[item.id] = {
            name: item.name,
            quantity: 0,
            revenue: 0
          };
        }
        productSales[item.id].quantity += item.quantity;
        productSales[item.id].revenue += item.price * item.quantity;
      });
    });

    return {
      summary: {
        totalProducts: products?.length || 0,
        needsRestock: needsRestock.length,
        lowStock: lowStock.length
      },
      productSales: Object.values(productSales || {}),
      needsRestock,
      lowStock
    };
  };

  const generateQueueReport = async () => {
    // Get queue appointments data
    const { data: queueAppointments } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(full_name),
        barber:barber_id(full_name),
        service:service_id(name, duration)
      `)
      .eq('appointment_type', 'queue')
      .gte('appointment_date', dateRange.start)
      .lte('appointment_date', dateRange.end);

    // Queue metrics
    const totalQueueAppointments = queueAppointments?.length || 0;
    const completedQueue = queueAppointments?.filter(apt => apt.status === 'done').length || 0;
    const cancelledQueue = queueAppointments?.filter(apt => apt.status === 'cancelled').length || 0;
    const pendingQueue = queueAppointments?.filter(apt => apt.status === 'pending').length || 0;

    // Average wait times
    const waitTimes = queueAppointments?.map(apt => apt.estimated_wait_time || 0).filter(time => time > 0) || [];
    const averageWaitTime = waitTimes.length ? waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length : 0;

    // Queue by barber
    const queueByBarber = {};
    queueAppointments?.forEach(apt => {
      const barberId = apt.barber_id;
      if (!queueByBarber[barberId]) {
        queueByBarber[barberId] = {
          name: apt.barber?.full_name || 'Unknown',
          total: 0,
          completed: 0,
          cancelled: 0,
          pending: 0,
          averageWaitTime: 0
        };
      }
      queueByBarber[barberId].total += 1;
      queueByBarber[barberId][apt.status] += 1;
    });

    // Calculate average wait time per barber
    Object.keys(queueByBarber).forEach(barberId => {
      const barberQueues = queueAppointments?.filter(apt => 
        apt.barber_id === barberId && apt.estimated_wait_time
      ) || [];
      if (barberQueues.length > 0) {
        queueByBarber[barberId].averageWaitTime = 
          barberQueues.reduce((sum, apt) => sum + apt.estimated_wait_time, 0) / barberQueues.length;
      }
    });

    // Peak hours analysis
    const hourlyDistribution = {};
    queueAppointments?.forEach(apt => {
      if (apt.appointment_time) {
        const hour = apt.appointment_time.split(':')[0];
        hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
      }
    });

    return {
      summary: {
        totalQueueAppointments: totalQueueAppointments || 0,
        completedQueue: completedQueue || 0,
        cancelledQueue: cancelledQueue || 0,
        pendingQueue: pendingQueue || 0,
        averageWaitTime: Math.round(averageWaitTime || 0),
        completionRate: totalQueueAppointments ? (completedQueue / totalQueueAppointments * 100) : 0
      },
      queueByBarber: Object.values(queueByBarber || {}),
      hourlyDistribution: hourlyDistribution || {},
      queueAppointments: queueAppointments || []
    };
  };

  const generateDoubleBookingReport = async () => {
    // Get double booking appointments
    const { data: doubleBookings } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(full_name),
        barber:barber_id(full_name),
        service:service_id(name, price)
      `)
      .eq('is_double_booking', true)
      .gte('appointment_date', dateRange.start)
      .lte('appointment_date', dateRange.end);

    const totalDoubleBookings = doubleBookings?.length || 0;
    const completedDoubleBookings = doubleBookings?.filter(apt => apt.status === 'done').length || 0;
    const cancelledDoubleBookings = doubleBookings?.filter(apt => apt.status === 'cancelled').length || 0;

    // Revenue from double bookings
    const doubleBookingRevenue = doubleBookings?.reduce((sum, apt) => 
      sum + (apt.status === 'done' ? (apt.total_price || apt.service?.price || 0) : 0), 0) || 0;

    // Double bookings by barber
    const doubleBookingsByBarber = {};
    doubleBookings?.forEach(apt => {
      const barberId = apt.barber_id;
      if (!doubleBookingsByBarber[barberId]) {
        doubleBookingsByBarber[barberId] = {
          name: apt.barber?.full_name || 'Unknown',
          total: 0,
          completed: 0,
          revenue: 0
        };
      }
      doubleBookingsByBarber[barberId].total += 1;
      if (apt.status === 'done') {
        doubleBookingsByBarber[barberId].completed += 1;
        doubleBookingsByBarber[barberId].revenue += apt.total_price || apt.service?.price || 0;
      }
    });

    // Friend booking patterns
    const friendBookingPatterns = {};
    doubleBookings?.forEach(apt => {
      if (apt.double_booking_data?.friend_name) {
        const friendName = apt.double_booking_data.friend_name;
        if (!friendBookingPatterns[friendName]) {
          friendBookingPatterns[friendName] = {
            name: friendName,
            bookings: 0,
            totalSpent: 0,
            lastBooking: apt.appointment_date
          };
        }
        friendBookingPatterns[friendName].bookings += 1;
        if (apt.status === 'done') {
          friendBookingPatterns[friendName].totalSpent += apt.total_price || apt.service?.price || 0;
        }
      }
    });

    return {
      summary: {
        totalDoubleBookings: totalDoubleBookings || 0,
        completedDoubleBookings: completedDoubleBookings || 0,
        cancelledDoubleBookings: cancelledDoubleBookings || 0,
        doubleBookingRevenue: doubleBookingRevenue || 0,
        completionRate: totalDoubleBookings ? (completedDoubleBookings / totalDoubleBookings * 100) : 0,
        averageRevenuePerBooking: completedDoubleBookings ? (doubleBookingRevenue / completedDoubleBookings) : 0
      },
      doubleBookingsByBarber: Object.values(doubleBookingsByBarber || {}),
      friendBookingPatterns: Object.values(friendBookingPatterns || {}),
      doubleBookings: doubleBookings || []
    };
  };

  const generateRealTimeReport = async () => {
    // Get current day data
    const today = new Date().toISOString().split('T')[0];
    
    // Today's appointments
    const { data: todayAppointments } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customer_id(full_name),
        barber:barber_id(full_name),
        service:service_id(name, price, duration)
      `)
      .eq('appointment_date', today);

    // Current queue status
    const currentQueue = todayAppointments?.filter(apt => 
      apt.appointment_type === 'queue' && 
      ['pending', 'scheduled', 'ongoing'].includes(apt.status)
    ) || [];

    // Current scheduled appointments
    const currentScheduled = todayAppointments?.filter(apt => 
      apt.appointment_type === 'scheduled' && 
      ['scheduled', 'confirmed', 'ongoing'].includes(apt.status)
    ) || [];

    // Active barbers (with appointments today)
    const activeBarbers = {};
    todayAppointments?.forEach(apt => {
      const barberId = apt.barber_id;
      if (!activeBarbers[barberId]) {
        activeBarbers[barberId] = {
          name: apt.barber?.full_name || 'Unknown',
          totalAppointments: 0,
          completed: 0,
          ongoing: 0,
          pending: 0,
          revenue: 0
        };
      }
      activeBarbers[barberId].totalAppointments += 1;
      activeBarbers[barberId][apt.status] += 1;
      if (apt.status === 'done') {
        const totalPrice = apt.total_price || apt.service?.price || 0;
        activeBarbers[barberId].revenue += totalPrice;
      }
    });

    // Today's revenue
    const todayRevenue = todayAppointments?.reduce((sum, apt) => 
      sum + (apt.status === 'done' ? (apt.total_price || apt.service?.price || 0) : 0), 0) || 0;

    // Service demand today
    const serviceDemand = {};
    todayAppointments?.forEach(apt => {
      const serviceId = apt.service_id;
      if (!serviceDemand[serviceId]) {
        serviceDemand[serviceId] = {
          name: apt.service?.name || 'Unknown',
          bookings: 0,
          revenue: 0
        };
      }
      serviceDemand[serviceId].bookings += 1;
      if (apt.status === 'done') {
        const totalPrice = apt.total_price || apt.service?.price || 0;
        serviceDemand[serviceId].revenue += totalPrice;
      }
    });

    return {
      summary: {
        todayDate: today,
        totalAppointmentsToday: todayAppointments?.length || 0,
        currentQueueSize: currentQueue.length || 0,
        currentScheduledSize: currentScheduled.length || 0,
        todayRevenue: todayRevenue || 0,
        activeBarbersCount: Object.keys(activeBarbers || {}).length,
        completedToday: todayAppointments?.filter(apt => apt.status === 'done').length || 0
      },
      activeBarbers: Object.values(activeBarbers || {}),
      serviceDemand: Object.values(serviceDemand || {}),
      currentQueue: currentQueue || [],
      currentScheduled: currentScheduled || [],
      todayAppointments: todayAppointments || []
    };
  };

  const generateSystemReport = async () => {
    const { data: logs, count } = await supabase
      .from('system_logs')
      .select('*', { count: 'exact' })
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end)
      .order('created_at', { ascending: false })
      .limit(1000);

    // Group by action
    const actionBreakdown = {};
    logs?.forEach(log => {
      actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
    });

    // Failed login attempts
    const failedLogins = logs?.filter(log => log.action === 'login_failed').length || 0;

    return {
      summary: {
        totalLogs: count || 0,
        failedLogins,
        actionBreakdown
      },
      recentLogs: logs || []
    };
  };


  return (
    <div className="container py-4">
      <style>
        {`
          .report-content {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .btn-group .btn {
            margin-right: 5px;
          }
          .btn-group .btn:last-child {
            margin-right: 0;
          }
        `}
      </style>
      <div className="card">
        <div className="card-header">
          <div className="row align-items-center">
            <div className="col-md-8">
              <h3 className="mb-0">Reports & Analytics</h3>
            </div>
            <div className="col-md-4 text-end">
              {reportType === 'real_time' && (
                <div className="form-check form-switch d-inline-block me-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="autoRefresh"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="autoRefresh">
                    Auto-refresh
                  </label>
                </div>
              )}
              {reportData && (
                <div className="btn-group" role="group">
                  <button 
                    className="btn btn-danger" 
                    onClick={exportToPDF}
                    disabled={isExporting}
                  >
                    <i className="bi bi-file-earmark-pdf me-2"></i>
                    {isExporting ? 'Exporting...' : 'Export PDF'}
                  </button>
                  <button 
                    className="btn btn-info" 
                    onClick={exportToImage}
                    disabled={isExporting}
                  >
                    <i className="bi bi-image me-2"></i>
                    {isExporting ? 'Exporting...' : 'Export Image'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="card-body">
          <div className="row mb-4">
            <div className="col-md-4">
              <label className="form-label">Report Type</label>
              <select
                className="form-select"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                {reportTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="col-md-4">
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="form-control"
                value={dateRange.start}
                onChange={(e) => {
                  setDateRange(prev => ({ ...prev, start: e.target.value }));
                  setSelectedQuickFilter('custom');
                }}
              />
            </div>
            
            <div className="col-md-4">
              <label className="form-label">End Date</label>
              <input
                type="date"
                className="form-control"
                value={dateRange.end}
                onChange={(e) => {
                  setDateRange(prev => ({ ...prev, end: e.target.value }));
                  setSelectedQuickFilter('custom');
                }}
              />
            </div>
          </div>

          {/* Quick Date Range Filters */}
          <div className="row mb-3">
            <div className="col-12">
              <div className="btn-group" role="group">
                <button
                  type="button"
                  className={`btn ${selectedQuickFilter === 'today' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setQuickDateRange('today')}
                >
                  <i className="bi bi-calendar-day me-1"></i>
                  Today
                </button>
                <button
                  type="button"
                  className={`btn ${selectedQuickFilter === 'week' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setQuickDateRange('week')}
                >
                  <i className="bi bi-calendar-week me-1"></i>
                  This Week
                </button>
                <button
                  type="button"
                  className={`btn ${selectedQuickFilter === 'month' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setQuickDateRange('month')}
                >
                  <i className="bi bi-calendar-month me-1"></i>
                  This Month
                </button>
                <button
                  type="button"
                  className={`btn ${selectedQuickFilter === 'last7days' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setQuickDateRange('last7days')}
                >
                  <i className="bi bi-calendar-range me-1"></i>
                  Last 7 Days
                </button>
                <button
                  type="button"
                  className={`btn ${selectedQuickFilter === 'last30days' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setQuickDateRange('last30days')}
                >
                  <i className="bi bi-calendar-range me-1"></i>
                  Last 30 Days
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-3 text-muted">Generating report...</p>
            </div>
          ) : reportData ? (
            <div ref={reportRef} className="report-content">
              {/* Render report based on type */}
              {reportType === 'revenue' && <RevenueReportView data={reportData} deductions={deductions} setDeductions={setDeductions} />}
              {reportType === 'orders' && <OrderReports dateRange={dateRange} />}
              {reportType === 'appointments' && <AppointmentsReportView data={reportData} />}
              {reportType === 'customers' && <CustomerReportView data={reportData} />}
              {reportType === 'services' && <ServiceReportView data={reportData} />}
              {reportType === 'queue' && <QueueReportView data={reportData} />}
              {reportType === 'double_booking' && <DoubleBookingReportView data={reportData} />}
              {reportType === 'real_time' && <RealTimeReportView data={reportData} />}
              {reportType === 'inventory' && <InventoryReportView data={reportData} />}
              {reportType === 'system' && <SystemReportView data={reportData} />}
            </div>
          ) : (
            <div className="text-center py-5">
              <div className="text-muted mb-3">
                <i className="bi bi-graph-up fs-1"></i>
              </div>
              <h5>No Data Available</h5>
              <p className="text-muted">Select a date range and report type to generate analytics.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Individual report view components
const RevenueReportView = ({ data, deductions, setDeductions }) => (
  <div>
    {/* Manager Deduction System */}
    <div className="row mb-4">
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h5 className="mb-0">
              <i className="bi bi-calculator me-2"></i>
              Daily Deductions Manager
            </h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-4">
                <label className="form-label">Lunch Expenses</label>
                <div className="input-group">
                  <span className="input-group-text">₱</span>
                  <input 
                    type="number" 
                    className="form-control"
                    value={deductions.lunch || ''}
                    onChange={(e) => setDeductions({...deductions, lunch: parseFloat(e.target.value) || 0})}
                    placeholder="Enter amount"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="col-md-4">
                <label className="form-label">Supplies</label>
                <div className="input-group">
                  <span className="input-group-text">₱</span>
                  <input 
                    type="number" 
                    className="form-control"
                    value={deductions.supplies || ''}
                    onChange={(e) => setDeductions({...deductions, supplies: parseFloat(e.target.value) || 0})}
                    placeholder="Enter amount"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="col-md-4">
                <label className="form-label">Other Expenses</label>
                <div className="input-group">
                  <span className="input-group-text">₱</span>
                  <input 
                    type="number" 
                    className="form-control"
                    value={deductions.other || ''}
                    onChange={(e) => setDeductions({...deductions, other: parseFloat(e.target.value) || 0})}
                    placeholder="Enter amount"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Revenue Summary with Deductions */}
    <div className="row mb-4">
      <div className="col-md-2">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>Service Revenue</h6>
            <h3>₱{(data.summary.totalRevenue || 0).toFixed(2)}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-2">
        <div className="card bg-info text-white">
          <div className="card-body">
            <h6>Product Revenue</h6>
            <h3>₱{(data.summary.totalOrderRevenue || 0).toFixed(2)}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-2">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Revenue</h6>
            <h3>₱{(data.summary.totalCombinedRevenue || 0).toFixed(2)}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-2">
        <div className="card bg-secondary text-white">
          <div className="card-body">
            <h6>Today's Revenue</h6>
            <h3>₱{(data.summary.todayRevenue || 0).toFixed(2)}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-2">
        <div className="card bg-warning text-white">
          <div className="card-body">
            <h6>Total Deductions</h6>
            <h3>₱{(deductions.lunch + deductions.supplies + deductions.other).toFixed(2)}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-2">
        <div className="card bg-dark text-white">
          <div className="card-body">
            <h6>Net Sales</h6>
            <h3>₱{((data.summary.totalCombinedRevenue || 0) - (deductions.lunch + deductions.supplies + deductions.other)).toFixed(2)}</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row mb-4">
      <div className="col-md-3">
        <div className="card bg-info text-white">
          <div className="card-body">
            <h6>Total Appointments</h6>
            <h3>{data.summary.totalAppointments}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Orders</h6>
            <h3>{data.summary.totalOrders}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-warning text-white">
          <div className="card-body">
            <h6>Avg. Service Value</h6>
            <h3>₱{(data.summary.averageTransaction || 0).toFixed(2)}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>Avg. Order Value</h6>
            <h3>₱{(data.summary.averageOrderValue || 0).toFixed(2)}</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row">
      <div className="col-md-6">
        <h5>Revenue by Barber</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Barber</th>
                <th>Revenue</th>
                <th>Appointments</th>
              </tr>
            </thead>
            <tbody>
              {(data.revenueByBarber || []).map((barber, index) => (
                <tr key={index}>
                  <td>{barber.name}</td>
                  <td><strong>₱{(barber.revenue || 0).toFixed(2)}</strong></td>
                  <td>{barber.appointments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="col-md-6">
        <h5>Revenue by Service</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Revenue</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {(data.revenueByService || []).map((service, index) => (
                <tr key={index}>
                  <td>{service.name}</td>
                  <td>₱{(service.revenue || 0).toFixed(2)}</td>
                  <td>{service.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>

  </div>
);

const AppointmentsReportView = ({ data }) => {
  // Ensure data has proper structure with defaults
  const summary = data?.summary || {};
  const statusBreakdown = summary.statusBreakdown || { scheduled: 0, ongoing: 0, done: 0, cancelled: 0 };
  const appointmentsByBarber = data?.appointmentsByBarber || [];
  const appointmentsByService = data?.appointmentsByService || [];
  const dailyBreakdown = data?.dailyBreakdown || [];

  return (
    <div>
      {/* Summary Cards */}
      <div className="row mb-4">
        <div className="col-md-3">
          <div className="card bg-primary text-white">
            <div className="card-body">
              <h6>Total Appointments</h6>
              <h3>{summary.total || 0}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-success text-white">
            <div className="card-body">
              <h6>Completed</h6>
              <h3>{statusBreakdown.done || 0}</h3>
              <small>{(summary.total || 0) > 0 ? (((statusBreakdown.done || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</small>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-warning text-white">
            <div className="card-body">
              <h6>Scheduled</h6>
              <h3>{statusBreakdown.scheduled || 0}</h3>
              <small>{(summary.total || 0) > 0 ? (((statusBreakdown.scheduled || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</small>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-danger text-white">
            <div className="card-body">
              <h6>Cancelled</h6>
              <h3>{statusBreakdown.cancelled || 0}</h3>
              <small>{(summary.total || 0) > 0 ? (((statusBreakdown.cancelled || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</small>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="row mb-4">
        <div className="col-md-3">
          <div className="card bg-info text-white">
            <div className="card-body">
              <h6>Queue Appointments</h6>
              <h3>{summary.queueAppointments || 0}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-secondary text-white">
            <div className="card-body">
              <h6>Scheduled Appointments</h6>
              <h3>{summary.scheduledAppointments || 0}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-dark text-white">
            <div className="card-body">
              <h6>Walk-in Appointments</h6>
              <h3>{summary.walkInAppointments || 0}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-light text-dark">
            <div className="card-body">
              <h6>Double Bookings</h6>
              <h3>{summary.doubleBookings || 0}</h3>
            </div>
          </div>
        </div>
      </div>

    {/* Appointments by Barber */}
    <div className="row mb-4">
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h5 className="mb-0">
              <i className="bi bi-person-badge me-2"></i>
              Appointments by Barber
            </h5>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Barber</th>
                    <th>Total</th>
                    <th>Scheduled</th>
                    <th>Queue</th>
                    <th>Ongoing</th>
                    <th>Done</th>
                    <th>Cancelled</th>
                    <th>Completion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {appointmentsByBarber.map((barber, index) => {
                    const barberStatusBreakdown = barber.statusBreakdown || { scheduled: 0, ongoing: 0, done: 0, cancelled: 0 };
                    return (
                      <tr key={index}>
                        <td><strong>{barber.name || 'Unknown'}</strong></td>
                        <td><span className="badge bg-primary">{barber.total || 0}</span></td>
                        <td><span className="badge bg-warning">{barberStatusBreakdown.scheduled || 0}</span></td>
                        <td><span className="badge bg-info">{barber.queueAppointments || 0}</span></td>
                        <td><span className="badge bg-secondary">{barberStatusBreakdown.ongoing || 0}</span></td>
                        <td><span className="badge bg-success">{barberStatusBreakdown.done || 0}</span></td>
                        <td><span className="badge bg-danger">{barberStatusBreakdown.cancelled || 0}</span></td>
                        <td>
                          <span className={`badge ${(barber.total || 0) > 0 && ((barberStatusBreakdown.done || 0) / (barber.total || 1)) >= 0.8 ? 'bg-success' : 'bg-warning'}`}>
                            {(barber.total || 0) > 0 ? (((barberStatusBreakdown.done || 0) / (barber.total || 1)) * 100).toFixed(1) : 0}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Appointments by Service */}
    <div className="row mb-4">
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h5 className="mb-0">
              <i className="bi bi-scissors me-2"></i>
              Appointments by Service
            </h5>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Total Bookings</th>
                    <th>Completed</th>
                    <th>Average Duration</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {appointmentsByService.map((service, index) => (
                    <tr key={index}>
                      <td><strong>{service.name || 'Unknown'}</strong></td>
                      <td><span className="badge bg-primary">{service.total || 0}</span></td>
                      <td><span className="badge bg-success">{service.completed || 0}</span></td>
                      <td>{service.averageDuration || 0} min</td>
                      <td>₱{(service.revenue || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Daily Breakdown */}
    <div className="row mb-4">
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h5 className="mb-0">
              <i className="bi bi-calendar-week me-2"></i>
              Daily Appointment Breakdown
            </h5>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Scheduled</th>
                    <th>Queue</th>
                    <th>Completed</th>
                    <th>Cancelled</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyBreakdown.map((day, index) => (
                    <tr key={index}>
                      <td><strong>{day.date ? new Date(day.date).toLocaleDateString() : 'Unknown Date'}</strong></td>
                      <td><span className="badge bg-primary">{day.total || 0}</span></td>
                      <td><span className="badge bg-warning">{day.scheduled || 0}</span></td>
                      <td><span className="badge bg-info">{day.queue || 0}</span></td>
                      <td><span className="badge bg-success">{day.completed || 0}</span></td>
                      <td><span className="badge bg-danger">{day.cancelled || 0}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

const CustomerReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Customers</h6>
            <h3>{data.summary.totalCustomers}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>New Customers</h6>
            <h3>{data.summary.newCustomers}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-info text-white">
          <div className="card-body">
            <h6>Repeat Customers</h6>
            <h3>{data.summary.repeatCustomers}</h3>
          </div>
        </div>
      </div>
    </div>

    <h5>Customer Statistics</h5>
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Appointments</th>
            <th>Total Spent</th>
            <th>Last Visit</th>
          </tr>
        </thead>
        <tbody>
          {(data.customerStats || []).map((customer) => (
            <tr key={customer.id}>
              <td>{customer.full_name}</td>
              <td>{customer.appointments}</td>
                  <td>₱{(customer.totalSpent || 0).toFixed(2)}</td>
              <td>{customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : 'Never'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ServiceReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-6">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Most Popular Service</h6>
            <h3>{data.mostPopular?.name || 'N/A'}</h3>
            <p className="mb-0">{data.mostPopular?.bookings || 0} bookings</p>
          </div>
        </div>
      </div>
      <div className="col-md-6">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>Highest Revenue Service</h6>
            <h3>{data.mostRevenue?.name || 'N/A'}</h3>
            <p className="mb-0">₱{(data.mostRevenue?.revenue || 0).toFixed(2)}</p>
          </div>
        </div>
      </div>
    </div>

    <h5>Service Performance</h5>
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Price</th>
            <th>Bookings</th>
            <th>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {(data.servicePerformance || []).map((service) => (
            <tr key={service.id}>
              <td>{service.name}</td>
                  <td>₱{(service.price || 0).toFixed(2)}</td>
              <td>{service.bookings}</td>
              <td>₱{(service.revenue || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const InventoryReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-4">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Products</h6>
            <h3>{data.summary.totalProducts}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-warning text-white">
          <div className="card-body">
            <h6>Needs Restock</h6>
            <h3>{data.summary.needsRestock}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-4">
        <div className="card bg-danger text-white">
          <div className="card-body">
            <h6>Low Stock</h6>
            <h3>{data.summary.lowStock}</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row">
      <div className="col-md-6">
        <h5>Products Needing Restock</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Current Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.needsRestock || []).map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.stock_quantity}</td>
                  <td>
                    <span className={`badge bg-${product.stock_quantity < 5 ? 'danger' : 'warning'}`}>
                      {product.stock_quantity < 5 ? 'Critical' : 'Low Stock'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5>Product Sales</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity Sold</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data.productSales || []).map((product, index) => (
                <tr key={index}>
                  <td>{product.name}</td>
                  <td>{product.quantity}</td>
                  <td>₱{(product.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

const SystemReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-6">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Logs</h6>
            <h3>{data.summary.totalLogs}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-6">
        <div className="card bg-danger text-white">
          <div className="card-body">
            <h6>Failed Login Attempts</h6>
            <h3>{data.summary.failedLogins}</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row">
      <div className="col-md-6">
        <h5>Action Breakdown</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.summary.actionBreakdown || {}).map(([action, count]) => (
                <tr key={action}>
                  <td>{action.replace(/_/g, ' ').toUpperCase()}</td>
                  <td>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5>Recent Logs</h5>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>User ID</th>
              </tr>
            </thead>
            <tbody>
              {(data.recentLogs || []).slice(0, 20).map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.action}</td>
                  <td>{log.user_id?.substring(0, 8) || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

// New Advanced Report View Components
const QueueReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-md-3">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Queue Appointments</h6>
            <h3>{data.summary.totalQueueAppointments}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>Completed</h6>
            <h3>{data.summary.completedQueue}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-warning text-white">
          <div className="card-body">
            <h6>Pending</h6>
            <h3>{data.summary.pendingQueue}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-info text-white">
          <div className="card-body">
            <h6>Avg Wait Time</h6>
            <h3>{data.summary.averageWaitTime || 0} min</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row mb-4">
      <div className="col-md-6">
        <div className="card">
          <div className="card-body">
            <h5>Completion Rate</h5>
            <div className="progress mb-2">
              <div 
                className="progress-bar bg-success" 
                style={{ width: `${data.summary.completionRate || 0}%` }}
              ></div>
            </div>
            <p className="mb-0">{(data.summary.completionRate || 0).toFixed(1)}% completion rate</p>
          </div>
        </div>
      </div>
      <div className="col-md-6">
        <div className="card">
          <div className="card-body">
            <h5>Queue Performance</h5>
            <p className="mb-1"><strong>Completed:</strong> {data.summary.completedQueue}</p>
            <p className="mb-1"><strong>Cancelled:</strong> {data.summary.cancelledQueue}</p>
            <p className="mb-0"><strong>Pending:</strong> {data.summary.pendingQueue}</p>
          </div>
        </div>
      </div>
    </div>

    <h5>Queue Performance by Barber</h5>
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Barber</th>
            <th>Total Queue</th>
            <th>Completed</th>
            <th>Cancelled</th>
            <th>Pending</th>
            <th>Avg Wait Time</th>
          </tr>
        </thead>
        <tbody>
          {(data.queueByBarber || []).map((barber, index) => (
            <tr key={index}>
              <td>{barber.name}</td>
              <td>{barber.total}</td>
              <td>{barber.completed}</td>
              <td>{barber.cancelled}</td>
              <td>{barber.pending}</td>
                  <td>{Math.round(barber.averageWaitTime || 0)} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const DoubleBookingReportView = ({ data }) => {
  // Ensure data has proper structure with defaults
  const summary = data?.summary || {};
  const doubleBookingsByBarber = data?.doubleBookingsByBarber || [];
  const friendBookingPatterns = data?.friendBookingPatterns || [];

  return (
    <div>
      <div className="row mb-4">
        <div className="col-md-3">
          <div className="card bg-info text-white">
            <div className="card-body">
              <h6>Total Friend Bookings</h6>
              <h3>{summary.totalDoubleBookings || 0}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-success text-white">
            <div className="card-body">
              <h6>Completed</h6>
              <h3>{summary.completedDoubleBookings || 0}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-primary text-white">
            <div className="card-body">
              <h6>Revenue from Friends</h6>
              <h3>₱{(summary.doubleBookingRevenue || 0).toFixed(2)}</h3>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-warning text-white">
            <div className="card-body">
              <h6>Avg Revenue/Booking</h6>
              <h3>₱{(summary.averageRevenuePerBooking || 0).toFixed(2)}</h3>
            </div>
          </div>
        </div>
      </div>

    <div className="row">
      <div className="col-md-6">
        <h5>Friend Bookings by Barber</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Barber</th>
                <th>Total</th>
                <th>Completed</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {doubleBookingsByBarber.map((barber, index) => (
                <tr key={index}>
                  <td>{barber.name || 'Unknown'}</td>
                  <td>{barber.total || 0}</td>
                  <td>{barber.completed || 0}</td>
                  <td>₱{(barber.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5>Top Friends by Bookings</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Friend Name</th>
                <th>Bookings</th>
                <th>Total Spent</th>
                <th>Last Booking</th>
              </tr>
            </thead>
            <tbody>
              {friendBookingPatterns.slice(0, 10).map((friend, index) => (
                <tr key={index}>
                  <td>{friend.name || 'Unknown'}</td>
                  <td>{friend.bookings || 0}</td>
                  <td>₱{(friend.totalSpent || 0).toFixed(2)}</td>
                  <td>{friend.lastBooking ? new Date(friend.lastBooking).toLocaleDateString() : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
  );
};

const RealTimeReportView = ({ data }) => (
  <div>
    <div className="alert alert-info">
      <h5 className="alert-heading">
        <i className="bi bi-clock me-2"></i>
        Real-time Dashboard - {data.summary.todayDate}
      </h5>
      <p className="mb-0">Live data for today's operations</p>
    </div>

    <div className="row mb-4">
      <div className="col-md-3">
        <div className="card bg-primary text-white">
          <div className="card-body">
            <h6>Total Today</h6>
            <h3>{data.summary.totalAppointmentsToday}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-success text-white">
          <div className="card-body">
            <h6>Completed</h6>
            <h3>{data.summary.completedToday}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-warning text-white">
          <div className="card-body">
            <h6>Current Queue</h6>
            <h3>{data.summary.currentQueueSize}</h3>
          </div>
        </div>
      </div>
      <div className="col-md-3">
        <div className="card bg-info text-white">
          <div className="card-body">
            <h6>Today's Revenue</h6>
            <h3>₱{(data.summary.todayRevenue || 0).toFixed(2)}</h3>
          </div>
        </div>
      </div>
    </div>

    <div className="row">
      <div className="col-md-6">
        <h5>Active Barbers Today</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Barber</th>
                <th>Total</th>
                <th>Completed</th>
                <th>Ongoing</th>
                <th>Pending</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data.activeBarbers || []).map((barber, index) => (
                <tr key={index}>
                  <td>{barber.name}</td>
                  <td>{barber.totalAppointments}</td>
                  <td>{barber.completed}</td>
                  <td>{barber.ongoing}</td>
                  <td>{barber.pending}</td>
                  <td>₱{(barber.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5>Service Demand Today</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Service</th>
                <th>Bookings</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data.serviceDemand || []).map((service, index) => (
                <tr key={index}>
                  <td>{service.name}</td>
                  <td>{service.bookings}</td>
                  <td>₱{(service.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div className="row mt-4">
      <div className="col-md-6">
        <h5>Current Queue Status</h5>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Barber</th>
                <th>Service</th>
                <th>Status</th>
                <th>Position</th>
              </tr>
            </thead>
            <tbody>
              {(data.currentQueue || []).slice(0, 10).map((appointment, index) => (
                <tr key={index}>
                  <td>{appointment.customer?.full_name || 'Unknown'}</td>
                  <td>{appointment.barber?.full_name || 'Unknown'}</td>
                  <td>{appointment.service?.name || 'Unknown'}</td>
                  <td>
                    <span className={`badge bg-${appointment.status === 'ongoing' ? 'success' : 'warning'}`}>
                      {appointment.status}
                    </span>
                  </td>
                  <td>#{appointment.queue_position || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5>Current Scheduled Appointments</h5>
        <div className="table-responsive">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Barber</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.currentScheduled || []).slice(0, 10).map((appointment, index) => (
                <tr key={index}>
                  <td>{appointment.customer?.full_name || 'Unknown'}</td>
                  <td>{appointment.barber?.full_name || 'Unknown'}</td>
                  <td>{appointment.appointment_time || 'N/A'}</td>
                  <td>
                    <span className={`badge bg-${appointment.status === 'ongoing' ? 'success' : 'primary'}`}>
                      {appointment.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

export default Reports;