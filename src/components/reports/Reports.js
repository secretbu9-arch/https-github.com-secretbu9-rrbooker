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

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Export functionality
  const reportRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

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
    { value: 'inventory', label: 'Inventory Report' },
    { value: 'system', label: 'System Activity Logs' }
  ];

  useEffect(() => {
    if (dateRange.start && dateRange.end) {
      generateReport();
    }
  }, [reportType, dateRange]);

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


    // Calculate revenue with multi-service and add-on support
    const revenueByBarber = {};
    const revenueByService = {};
    const dailyRevenueMap = {};
    let totalRevenue = 0;
    let totalOrderRevenue = 0;
    let completedAppointmentsCount = 0;
    let completedOrdersCount = 0;

    // Process Appointments
    appointments?.forEach(apt => {
      if (apt.status === 'completed') {
        const amount = apt.total_price || apt.service?.price || 0;
        const date = apt.appointment_date;

        dailyRevenueMap[date] = (dailyRevenueMap[date] || 0) + amount;
        totalRevenue += amount;
        completedAppointmentsCount++;

        // Revenue by barber
        const bId = apt.barber_id;
        if (!revenueByBarber[bId]) {
          revenueByBarber[bId] = { name: apt.barber?.full_name || 'Unknown', revenue: 0, appointments: 0 };
        }
        revenueByBarber[bId].revenue += amount;
        revenueByBarber[bId].appointments += 1;

        // Revenue by service (support multi-service data)
        const services = Array.isArray(apt.services_data) && apt.services_data.length > 0
          ? apt.services_data
          : [{ id: apt.service_id, name: apt.service?.name || 'Unknown', price: apt.service?.price || 0 }];

        services.forEach(svc => {
          const sId = svc.id || 'misc';
          if (!revenueByService[sId]) {
            revenueByService[sId] = { name: svc.name || 'Unknown', revenue: 0, count: 0 };
          }
          revenueByService[sId].count += 1;
          revenueByService[sId].revenue += (svc.price || (amount / services.length));
        });
      }
    });

    // Process Orders
    orders?.forEach(order => {
      if (order.status === 'picked_up') {
        const amount = order.total_amount || 0;
        const date = order.created_at?.split('T')[0];

        if (date) {
          dailyRevenueMap[date] = (dailyRevenueMap[date] || 0) + amount;
        }
        totalOrderRevenue += amount;
        completedOrdersCount++;
      }
    });

    const today = new Date().toISOString().split('T')[0];

    return {
      summary: {
        totalRevenue,
        totalOrderRevenue,
        totalCombinedRevenue: totalRevenue + totalOrderRevenue,
        totalAppointments: completedAppointmentsCount,
        totalOrders: completedOrdersCount,
        averageTransaction: completedAppointmentsCount > 0 ? totalRevenue / completedAppointmentsCount : 0,
        averageOrderValue: completedOrdersCount > 0 ? totalOrderRevenue / completedOrdersCount : 0,
        todayRevenue: dailyRevenueMap[today] || 0
      },
      revenueByBarber: Object.values(revenueByBarber),
      revenueByService: Object.values(revenueByService),
      dailyRevenue: Object.entries(dailyRevenueMap).map(([date, revenue]) => ({ date, revenue })).sort((a, b) => new Date(a.date) - new Date(b.date))
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
      pending: 0,
      confirmed: 0,
      ongoing: 0,
      completed: 0,
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
          statusBreakdown: { pending: 0, confirmed: 0, ongoing: 0, completed: 0, cancelled: 0 }
        };
      }
      appointmentsByBarber[barberId].total += 1;
      appointmentsByBarber[barberId].statusBreakdown[apt.status] += 1;
      if (apt.appointment_type === 'queue') {
        appointmentsByBarber[barberId].queueAppointments += 1;
      }
    });

    // Appointments by service (Corrected multi-service logic)
    const appointmentsByService = {};
    appointments?.forEach(apt => {
      const services = Array.isArray(apt.services_data) && apt.services_data.length > 0
        ? apt.services_data
        : [{ id: apt.service_id, name: apt.service?.name || 'Unknown', price: apt.service?.price || 0 }];

      services.forEach(svc => {
        const sId = svc.id || 'misc';
        if (!appointmentsByService[sId]) {
          appointmentsByService[sId] = {
            name: svc.name || 'Unknown',
            total: 0,
            completed: 0,
            revenue: 0
          };
        }
        appointmentsByService[sId].total += 1;
        if (apt.status === 'completed') {
          appointmentsByService[sId].completed += 1;
          const svcRevenue = svc.price || (apt.total_price / services.length) || 0;
          appointmentsByService[sId].revenue += svcRevenue;
        }
      });
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
      if (apt.status === 'completed') dailyBreakdown[date].completed += 1;
      if (['cancelled', 'cancel'].includes(apt.status)) dailyBreakdown[date].cancelled += 1;
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
        .eq('customer_id', customer.id);

      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', customer.id)
        .eq('status', 'picked_up');

      const apptSpend = appointments?.filter(apt => apt.status === 'completed')
        .reduce((sum, apt) => sum + (apt.total_price || apt.service?.price || 0), 0) || 0;

      const orderSpend = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;

      customerStats[customer.id] = {
        ...customer,
        appointments: appointments?.length || 0,
        completedAppointments: appointments?.filter(apt => apt.status === 'completed').length || 0,
        totalSpent: apptSpend + orderSpend,
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
        completedBookings: appointments?.filter(apt => apt.status === 'completed').length || 0,
        revenue: appointments?.filter(apt => apt.status === 'completed')
          .reduce((sum, apt) => sum + (apt.total_price || service.price), 0) || 0
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

    // Get sales data - only count 'picked_up' orders
    const { data: orders } = await supabase
      .from('orders')
      .select('items, status')
      .eq('status', 'picked_up')
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
    const completedQueue = queueAppointments?.filter(apt => apt.status === 'completed').length || 0;
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
      const status = apt.status || 'pending';
      if (queueByBarber[barberId].hasOwnProperty(status)) {
        queueByBarber[barberId][status] += 1;
      } else {
        // Handle confirmed/ongoing/etc as pending for queue metrics if needed, 
        // or just track them as-is by initializing
        queueByBarber[barberId][status] = (queueByBarber[barberId][status] || 0) + 1;
      }
      queueByBarber[barberId].total += 1;
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
          input[type="date"] {
            position: relative;
            background-color: #fff;
            border: 2px solid #dee2e6;
            border-radius: 0.375rem;
            transition: all 0.3s ease;
          }
          input[type="date"]:focus {
            border-color: #0d6efd;
            box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
            outline: none;
          }
          input[type="date"]:hover {
            border-color: #adb5bd;
          }
          input[type="date"]::-webkit-calendar-picker-indicator {
            cursor: pointer;
            opacity: 0.6;
            margin-left: 0.5rem;
            filter: invert(0.5) sepia(1) saturate(5) hue-rotate(200deg);
          }
          input[type="date"]::-webkit-calendar-picker-indicator:hover {
            opacity: 1;
          }
          .form-label {
            color: #495057;
            margin-bottom: 0.5rem;
          }
          .form-label i {
            color: #0d6efd;
          }
          /* Excel-like table styling */
          .report-content table {
            border-collapse: collapse;
            width: 100%;
            font-size: 13px;
            border: 1px solid #d0d0d0;
          }
          .report-content table thead {
            background-color: #f2f2f2;
            border-bottom: 2px solid #d0d0d0;
          }
          .report-content table thead th {
            background-color: #f2f2f2;
            border: 1px solid #d0d0d0;
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            color: #000;
            white-space: nowrap;
          }
          .report-content table tbody td {
            border: 1px solid #d0d0d0;
            padding: 6px 10px;
            background-color: #fff;
          }
          .report-content table tbody tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .report-content table tbody tr:nth-child(even) td {
            background-color: #f9f9f9;
          }
          .report-content table tbody tr:hover {
            background-color: #e8f4f8;
          }
          .report-content table tbody tr:hover td {
            background-color: #e8f4f8;
          }
          .report-content table tbody tr:first-child td {
            border-top: 1px solid #d0d0d0;
          }
          .report-content .table-responsive {
            border: 1px solid #d0d0d0;
            overflow-x: auto;
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
              <label className="form-label fw-bold">
                <i className="bi bi-graph-up me-2"></i>
                Report Type
              </label>
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
              <label className="form-label fw-bold">
                <i className="bi bi-calendar-event me-2"></i>
                Start Date
              </label>
              <div className="position-relative">
                <input
                  type="date"
                  className="form-control"
                  value={dateRange.start}
                  onChange={(e) => {
                    setDateRange(prev => ({ ...prev, start: e.target.value }));
                  }}
                  max={dateRange.end}
                  style={{
                    paddingLeft: '2.5rem',
                    fontSize: '1rem',
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

            <div className="col-md-4">
              <label className="form-label fw-bold">
                <i className="bi bi-calendar-check me-2"></i>
                End Date
              </label>
              <div className="position-relative">
                <input
                  type="date"
                  className="form-control"
                  value={dateRange.end}
                  onChange={(e) => {
                    setDateRange(prev => ({ ...prev, end: e.target.value }));
                  }}
                  min={dateRange.start}
                  style={{
                    paddingLeft: '2.5rem',
                    fontSize: '1rem',
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

          {/* Date Range Display */}
          <div className="row mb-3">
            <div className="col-12">
              <div className="alert alert-info d-flex align-items-center mb-0" role="alert">
                <i className="bi bi-info-circle me-2"></i>
                <span>
                  <strong>Selected Date Range:</strong> {new Date(dateRange.start).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })} - {new Date(dateRange.end).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
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
              {reportType === 'revenue' && <RevenueReportView data={reportData} />}
              {reportType === 'orders' && <OrderReports dateRange={dateRange} />}
              {reportType === 'appointments' && <AppointmentsReportView data={reportData} />}
              {reportType === 'customers' && <CustomerReportView data={reportData} />}
              {reportType === 'services' && <ServiceReportView data={reportData} />}
              {reportType === 'queue' && <QueueReportView data={reportData} />}
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
const RevenueReportView = ({ data }) => (
  <div>
    {/* Revenue Summary Table */}
    <div className="row mb-4">
      <div className="col-12">
        <h5>Revenue Summary</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Service Revenue</strong></td>
                <td className="currency-table-cell">₱{(data.summary.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td><strong>Product Revenue</strong></td>
                <td className="currency-table-cell">₱{(data.summary.totalOrderRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td><strong>Total Revenue</strong></td>
                <td className="currency-table-cell"><strong>₱{(data.summary.totalCombinedRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
              </tr>
              <tr>
                <td><strong>Today's Revenue</strong></td>
                <td className="currency-table-cell">₱{(data.summary.todayRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td><strong>Total Appointments</strong></td>
                <td>{data.summary.totalAppointments}</td>
              </tr>
              <tr>
                <td><strong>Total Orders</strong></td>
                <td>{data.summary.totalOrders}</td>
              </tr>
              <tr>
                <td><strong>Average Service Value</strong></td>
                <td className="currency-table-cell">₱{(data.summary.averageTransaction || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td><strong>Average Order Value</strong></td>
                <td className="currency-table-cell">₱{(data.summary.averageOrderValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
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
                  <td className="currency-table-cell"><strong>₱{(barber.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
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
                  <td className="currency-table-cell">₱{(service.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
  const statusBreakdown = summary.statusBreakdown || { pending: 0, confirmed: 0, ongoing: 0, completed: 0, cancelled: 0 };
  const appointmentsByBarber = data?.appointmentsByBarber || [];
  const appointmentsByService = data?.appointmentsByService || [];
  const dailyBreakdown = data?.dailyBreakdown || [];

  return (
    <div>
      {/* Summary Table */}
      <div className="row mb-4">
        <div className="col-12">
          <h5>Appointments Summary</h5>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Count</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Total Appointments</strong></td>
                  <td><strong>{summary.total || 0}</strong></td>
                  <td>100%</td>
                </tr>
                <tr>
                  <td>Completed</td>
                  <td>{statusBreakdown.done || 0}</td>
                  <td>{(summary.total || 0) > 0 ? (((statusBreakdown.done || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td>Confirmed</td>
                  <td>{statusBreakdown.confirmed || 0}</td>
                  <td>{(summary.total || 0) > 0 ? (((statusBreakdown.confirmed || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td>Ongoing</td>
                  <td>{statusBreakdown.ongoing || 0}</td>
                  <td>{(summary.total || 0) > 0 ? (((statusBreakdown.ongoing || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td>Cancelled</td>
                  <td>{statusBreakdown.cancelled || 0}</td>
                  <td>{(summary.total || 0) > 0 ? (((statusBreakdown.cancelled || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td>Queue Appointments</td>
                  <td>{summary.queueAppointments || 0}</td>
                  <td>{(summary.total || 0) > 0 ? (((summary.queueAppointments || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td>Scheduled Appointments</td>
                  <td>{summary.scheduledAppointments || 0}</td>
                  <td>{(summary.total || 0) > 0 ? (((summary.scheduledAppointments || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td>Walk-in Appointments</td>
                  <td>{summary.walkInAppointments || 0}</td>
                  <td>{(summary.total || 0) > 0 ? (((summary.walkInAppointments || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td>Double Bookings</td>
                  <td>{summary.doubleBookings || 0}</td>
                  <td>{(summary.total || 0) > 0 ? (((summary.doubleBookings || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Appointments by Barber */}
      <div className="row mb-4">
        <div className="col-12">
          <h5>Appointments by Barber</h5>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Barber</th>
                  <th>Total</th>
                  <th>Confirmed</th>
                  <th>Queue</th>
                  <th>Ongoing</th>
                  <th>Completed</th>
                  <th>Cancelled</th>
                  <th>Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                {appointmentsByBarber.map((barber, index) => {
                  const barberStatusBreakdown = barber.statusBreakdown || { pending: 0, confirmed: 0, ongoing: 0, completed: 0, cancelled: 0 };
                  return (
                    <tr key={index}>
                      <td><strong>{barber.name || 'Unknown'}</strong></td>
                      <td>{barber.total || 0}</td>
                      <td>{barberStatusBreakdown?.confirmed || 0}</td>
                      <td>{barber?.queueAppointments || 0}</td>
                      <td>{barberStatusBreakdown?.ongoing || 0}</td>
                      <td>{barberStatusBreakdown?.completed || 0}</td>
                      <td>{barberStatusBreakdown?.cancelled || barberStatusBreakdown?.cancel || 0}</td>
                      <td>{(barber?.total || 0) > 0 ? (((barberStatusBreakdown?.completed || 0) / (barber?.total || 1)) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Appointments by Service */}
      <div className="row mb-4">
        <div className="col-12">
          <h5>Appointments by Service</h5>
          <div className="table-responsive">
            <table className="table">
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
                {(appointmentsByService || []).map((service, index) => (
                  <tr key={index}>
                    <td><strong>{service?.name || 'Unknown'}</strong></td>
                    <td>{service?.total || 0}</td>
                    <td>{service?.completed || 0}</td>
                    <td>₱{(service?.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="row mb-4">
        <div className="col-12">
          <h5>Daily Appointment Breakdown</h5>
          <div className="table-responsive">
            <table className="table">
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
                    <td>{day.total || 0}</td>
                    <td>{day.scheduled || 0}</td>
                    <td>{day.queue || 0}</td>
                    <td>{day?.completed || 0}</td>
                    <td>{day?.cancelled || 0}</td>
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

const CustomerReportView = ({ data }) => (
  <div>
    <div className="row mb-4">
      <div className="col-12">
        <h5>Customer Summary</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Total Customers</strong></td>
                <td><strong>{data?.summary?.totalCustomers || 0}</strong></td>
              </tr>
              <tr>
                <td>New Customers</td>
                <td>{data?.summary?.newCustomers || 0}</td>
              </tr>
              <tr>
                <td>Repeat Customers</td>
                <td>{data?.summary?.repeatCustomers || 0}</td>
              </tr>
            </tbody>
          </table>
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
              <td className="currency-table-cell">₱{(customer.totalSpent || 0).toFixed(2)}</td>
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
      <div className="col-12">
        <h5>Service Highlights</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Service</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Most Popular Service</strong></td>
                <td>{data.mostPopular?.name || 'N/A'}</td>
                <td>{data.mostPopular?.bookings || 0} bookings</td>
              </tr>
              <tr>
                <td><strong>Highest Revenue Service</strong></td>
                <td>{data.mostRevenue?.name || 'N/A'}</td>
                <td className="currency-table-cell">₱{(data.mostRevenue?.revenue || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
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
              <td className="currency-table-cell">₱{(service.price || 0).toFixed(2)}</td>
              <td>{service.bookings}</td>
              <td className="currency-table-cell">₱{(service.revenue || 0).toFixed(2)}</td>
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
      <div className="col-12">
        <h5>Inventory Summary</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Total Products</strong></td>
                <td><strong>{data.summary.totalProducts}</strong></td>
              </tr>
              <tr>
                <td>Needs Restock</td>
                <td>{data.summary.needsRestock}</td>
              </tr>
              <tr>
                <td>Low Stock</td>
                <td>{data.summary.lowStock}</td>
              </tr>
            </tbody>
          </table>
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
                  <td>{product.stock_quantity < 5 ? 'Critical' : 'Low Stock'}</td>
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
                  <td className="currency-table-cell">₱{(product.revenue || 0).toFixed(2)}</td>
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
      <div className="col-12">
        <h5>System Summary</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Total Logs</strong></td>
                <td><strong>{data.summary.totalLogs}</strong></td>
              </tr>
              <tr>
                <td>Failed Login Attempts</td>
                <td>{data.summary.failedLogins}</td>
              </tr>
            </tbody>
          </table>
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
      <div className="col-12">
        <h5>Queue Summary</h5>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Total Queue Appointments</strong></td>
                <td><strong>{data.summary.totalQueueAppointments}</strong></td>
              </tr>
              <tr>
                <td>Completed</td>
                <td>{data.summary.completedQueue}</td>
              </tr>
              <tr>
                <td>Cancelled</td>
                <td>{data.summary.cancelledQueue}</td>
              </tr>
              <tr>
                <td>Pending</td>
                <td>{data.summary.pendingQueue}</td>
              </tr>
              <tr>
                <td>Average Wait Time</td>
                <td>{data.summary.averageWaitTime || 0} min</td>
              </tr>
              <tr>
                <td>Completion Rate</td>
                <td>{(data.summary.completionRate || 0).toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
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



export default Reports;