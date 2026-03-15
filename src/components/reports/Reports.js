// components/reports/Reports.js
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import logo from '../../assets/images/raf-rok-logo.png';
import OrderReports from './OrderReports';

const Reports = () => {
  const getLocalDateString = (d) => {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const [reportType, setReportType] = useState('revenue');
  const [dateRange, setDateRange] = useState({
    start: getLocalDateString(new Date()),
    end: getLocalDateString(new Date())
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
      const pageWidth = pdf.internal.pageSize.getWidth();

      // Add Brand Header
      // Draw Logo
      const logoWidth = 30;
      const logoHeight = 30;
      const margin = 20;
      pdf.addImage(logo, 'PNG', margin, 15, logoWidth, logoHeight);

      // Shop Information
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(26, 26, 26);
      pdf.text('RAF & ROX BARBER SHOP', margin + logoWidth + 10, 25);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text('"Your Hair, Your Style"', margin + logoWidth + 10, 32);
      pdf.text('Generated Performance Report', margin + logoWidth + 10, 37);

      // Report Specific Header
      pdf.setDrawColor(240, 240, 240);
      pdf.setLineWidth(0.5);
      pdf.line(margin, 50, pageWidth - margin, 50);

      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`${reportTypes.find(t => t.value === reportType)?.label || 'Performance Report'}`, margin, 60);

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      const dateText = `Period: ${new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to ${new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      pdf.text(dateText, margin, 66);
      pdf.text(`Exported: ${new Date().toLocaleString()}`, pageWidth - margin - 50, 66);

      // Content
      const imgWidth = pageWidth - (margin * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = pdf.internal.pageSize.getHeight();
      let heightLeft = imgHeight;
      let position = 75;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - position - margin);

      while (heightLeft > 0) {
        pdf.addPage();
        position = margin;
        // On new pages, add a small header or just the content
        pdf.addImage(imgData, 'PNG', margin, position - (imgHeight - heightLeft - (75 - margin)), imgWidth, imgHeight);
        heightLeft -= (pageHeight - (margin * 2));
      }

      // Add Footer on last page
      const finalPage = pdf.internal.getNumberOfPages();
      pdf.setPage(finalPage);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text('This is an official business report from RAF & ROX Management System.', pageWidth / 2, pageHeight - 10, { align: 'center' });

      const fileName = `${reportType}_report_${dateRange.start}_to_${dateRange.end}.pdf`;
      pdf.save(fileName);
      setSuccess('PDF Report exported successfully');
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      setError('Error exporting to PDF. Please try again.');
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

    appointments?.forEach(apt => {
      if (apt.status === 'completed') {
        const amount = Number(apt.total_price) || (Number(apt.service?.price) || 0) + (apt.is_urgent ? 100 : 0);
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

          // Use individual service price if available, otherwise distribute the total amount
          const svcPrice = Number(svc.price);
          revenueByService[sId].revenue += (!isNaN(svcPrice) && svcPrice > 0) ? svcPrice : (amount / services.length);
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

    const today = getLocalDateString(new Date());

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


  // Premium Minimalist Styles
  const styles = {
    container: {
      padding: '2rem 1.5rem',
      backgroundColor: '#fcfcfc',
      minHeight: '100vh',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    },
    headerCard: {
      background: '#fff',
      padding: '1.5rem',
      borderRadius: '24px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
      border: '1px solid #f0f0f0',
      marginBottom: '1.5rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '1rem'
    },
    card: {
      backgroundColor: '#fff',
      padding: '1.5rem',
      borderRadius: '24px',
      border: '1px solid #eee',
      marginBottom: '1.5rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
    },
    filterGroup: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '1.25rem',
      marginBottom: '1.5rem'
    },
    filterItem: {
      flex: '1',
      minWidth: '200px'
    },
    label: {
      fontSize: '0.75rem',
      fontWeight: '800',
      color: '#888',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      marginBottom: '0.5rem',
      display: 'block'
    },
    select: {
      width: '100%',
      padding: '0.8rem 1rem',
      borderRadius: '16px',
      border: '1.5px solid #f0f0f0',
      backgroundColor: '#f9f9f9',
      fontSize: '0.95rem',
      fontWeight: '600',
      color: '#1a1a1a',
      outline: 'none',
      transition: 'all 0.2s'
    },
    input: {
      width: '100%',
      padding: '0.8rem 1rem',
      borderRadius: '16px',
      border: '1.5px solid #f0f0f0',
      backgroundColor: '#f9f9f9',
      fontSize: '0.95rem',
      color: '#1a1a1a',
      outline: 'none'
    },
    primaryBtn: {
      backgroundColor: '#1a1a1a',
      color: '#fff',
      border: 'none',
      padding: '0.8rem 1.5rem',
      borderRadius: '16px',
      fontWeight: '700',
      fontSize: '0.9rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      transition: 'all 0.3s'
    },
    reportTable: {
      width: '100%',
      borderCollapse: 'separate',
      borderSpacing: '0',
      fontSize: '0.85rem'
    },
    th: {
      padding: '1.25rem 1rem',
      backgroundColor: '#f8f9fa',
      borderBottom: '2px solid #eee',
      fontWeight: '800',
      color: '#444',
      textAlign: 'left',
      fontSize: '0.75rem',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    },
    td: {
      padding: '1.1rem 1rem',
      borderBottom: '1px solid #f5f5f5',
      color: '#1a1a1a',
      fontWeight: '500'
    }
  };

  const [success, setSuccess] = useState('');
  return (
    <div style={styles.container}>
      {/* Header Card */}
      <div style={styles.headerCard}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0, letterSpacing: '-0.5px' }}>
            Analytics & Reports
          </h2>
          <p className="text-muted small mb-0">Track performance metrics and business growth</p>
        </div>
        <div>
          {reportData && (
            <button
              style={styles.primaryBtn}
              onClick={exportToPDF}
              disabled={isExporting}
            >
              {isExporting ? (
                <span className="spinner-border spinner-border-sm"></span>
              ) : (
                <i className="bi bi-file-earmark-pdf-fill"></i>
              )}
              EXPORT PDF REPORT
            </button>
          )}
        </div>
      </div>

      {/* Main Content Card */}
      <div style={styles.card}>
        <div style={styles.filterGroup}>
          <div style={styles.filterItem}>
            <label style={styles.label}>Select Report Type</label>
            <select
              style={styles.select}
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            >
              {reportTypes.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div style={styles.filterItem}>
            <label style={styles.label}>Start Date</label>
            <input
              type="date"
              style={styles.input}
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              max={dateRange.end}
            />
          </div>

          <div style={styles.filterItem}>
            <label style={styles.label}>End Date</label>
            <input
              type="date"
              style={styles.input}
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              min={dateRange.start}
            />
          </div>
        </div>

        {error && (
          <div className="alert alert-danger rounded-4 border-0 mb-4 d-flex align-items-center">
            <i className="bi bi-exclamation-circle-fill me-2"></i>
            <span className="fw-bold small">{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success rounded-4 border-0 mb-4 d-flex align-items-center">
            <i className="bi bi-check-circle-fill me-2"></i>
            <span className="fw-bold small">{success}</span>
          </div>
        )}

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-dark" style={{ width: '3rem', height: '3rem' }}></div>
            <p className="mt-3 text-muted fw-bold text-uppercase letter-spacing-1 small">Generating Analytics...</p>
          </div>
        ) : reportData ? (
          <div ref={reportRef}>
            {/* Report View Container */}
            <div className="p-4" style={{ backgroundColor: '#fff', borderRadius: '20px', border: '1px solid #f0f0f0' }}>
              <div className="mb-4 pb-3 border-bottom d-flex justify-content-between align-items-end">
                <div>
                  <h4 className="fw-800 mb-1">{reportTypes.find(t => t.value === reportType)?.label}</h4>
                  <div className="text-muted small fw-bold">
                    PERIOD: {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-end text-muted small fw-700">
                  DATE GENERATED: {new Date().toLocaleDateString()}
                </div>
              </div>

              {reportType === 'revenue' && <RevenueReportView data={reportData} styles={styles} />}
              {reportType === 'orders' && <OrderReports dateRange={dateRange} styles={styles} />}
              {reportType === 'appointments' && <AppointmentsReportView data={reportData} styles={styles} />}
              {reportType === 'customers' && <CustomerReportView data={reportData} styles={styles} />}
              {reportType === 'services' && <ServiceReportView data={reportData} styles={styles} />}
              {reportType === 'queue' && <QueueReportView data={reportData} styles={styles} />}
              {reportType === 'inventory' && <InventoryReportView data={reportData} styles={styles} />}
              {reportType === 'system' && <SystemReportView data={reportData} styles={styles} />}
            </div>
          </div>
        ) : (
          <div className="text-center py-5 opacity-50">
            <i className="bi bi-bar-chart-fill" style={{ fontSize: '4rem' }}></i>
            <h5 className="mt-3 fw-800">No Analytics Data</h5>
            <p className="text-muted small mb-0">Adjust your filters to generate a new report.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Individual report view components
const RevenueReportView = ({ data, styles }) => (
  <div>
    {/* Revenue Summary Table */}
    <div className="row mb-4">
      <div className="col-12">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Revenue Summary</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                <th style={styles.th}>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.td}><strong>Service Revenue</strong></td>
                <td style={styles.td} className="currency-table-cell">₱{(data.summary.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style={styles.td}><strong>Product Revenue</strong></td>
                <td style={styles.td} className="currency-table-cell">₱{(data.summary.totalOrderRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style={styles.td}><strong>Total Revenue</strong></td>
                <td style={styles.td} className="currency-table-cell"><span className="badge bg-success-subtle text-success px-3 py-2 rounded-pill fw-800">₱{(data.summary.totalCombinedRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
              </tr>
              <tr>
                <td style={styles.td}><strong>Today's Revenue</strong></td>
                <td style={styles.td} className="currency-table-cell">₱{(data.summary.todayRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style={styles.td}><strong>Total Appointments</strong></td>
                <td style={styles.td}>{data.summary.totalAppointments}</td>
              </tr>
              <tr>
                <td style={styles.td}><strong>Total Orders</strong></td>
                <td style={styles.td}>{data.summary.totalOrders}</td>
              </tr>
              <tr>
                <td style={styles.td}><strong>Average Service Value</strong></td>
                <td style={styles.td} className="currency-table-cell">₱{(data.summary.averageTransaction || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td style={styles.td}><strong>Average Order Value</strong></td>
                <td style={styles.td} className="currency-table-cell">₱{(data.summary.averageOrderValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div className="row g-4">
      <div className="col-md-6">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Revenue by Barber</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Barber</th>
                <th style={styles.th}>Revenue</th>
                <th style={styles.th}>Appointments</th>
              </tr>
            </thead>
            <tbody>
              {(data.revenueByBarber || []).map((barber, index) => (
                <tr key={index}>
                  <td style={styles.td}>{barber.name}</td>
                  <td style={styles.td} className="currency-table-cell"><strong>₱{(barber.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                  <td style={styles.td}>{barber.appointments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Revenue by Service</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Service</th>
                <th style={styles.th}>Revenue</th>
                <th style={styles.th}>Count</th>
              </tr>
            </thead>
            <tbody>
              {(data.revenueByService || []).map((service, index) => (
                <tr key={index}>
                  <td style={styles.td}>{service.name}</td>
                  <td style={styles.td} className="currency-table-cell">₱{(service.revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td style={styles.td}>{service.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);


const AppointmentsReportView = ({ data, styles }) => {
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
          <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Appointments Summary</h5>
          <div className="table-responsive border rounded-4 overflow-hidden">
            <table style={styles.reportTable}>
              <thead>
                <tr>
                  <th style={styles.th}>Metric</th>
                  <th style={styles.th}>Count</th>
                  <th style={styles.th}>Percentage</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={styles.td}><strong>Total Appointments</strong></td>
                  <td style={styles.td}><strong>{summary.total || 0}</strong></td>
                  <td style={styles.td}>100%</td>
                </tr>
                <tr>
                  <td style={styles.td}>Completed</td>
                  <td style={styles.td}><span className="badge bg-success-subtle text-success py-1 px-2 rounded-2 fw-700">{statusBreakdown.completed || statusBreakdown.done || 0}</span></td>
                  <td style={styles.td}>{(summary.total || 0) > 0 ? (((statusBreakdown.completed || statusBreakdown.done || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td style={styles.td}>Confirmed</td>
                  <td style={styles.td}>{statusBreakdown.confirmed || 0}</td>
                  <td style={styles.td}>{(summary.total || 0) > 0 ? (((statusBreakdown.confirmed || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td style={styles.td}>Ongoing</td>
                  <td style={styles.td}>{statusBreakdown.ongoing || 0}</td>
                  <td style={styles.td}>{(summary.total || 0) > 0 ? (((statusBreakdown.ongoing || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
                <tr>
                  <td style={styles.td}>Cancelled</td>
                  <td style={styles.td}><span className="badge bg-danger-subtle text-danger py-1 px-2 rounded-2 fw-700">{statusBreakdown.cancelled || 0}</span></td>
                  <td style={styles.td}>{(summary.total || 0) > 0 ? (((statusBreakdown.cancelled || 0) / (summary.total || 1)) * 100).toFixed(1) : 0}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Appointments by Barber */}
      <div className="row mb-4">
        <div className="col-12">
          <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Appointments by Barber</h5>
          <div className="table-responsive border rounded-4 overflow-hidden">
            <table style={styles.reportTable}>
              <thead>
                <tr>
                  <th style={styles.th}>Barber</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Completed</th>
                  <th style={styles.th}>Cancelled</th>
                  <th style={styles.th}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {appointmentsByBarber.map((barber, index) => {
                  const barberStatusBreakdown = barber.statusBreakdown || { pending: 0, confirmed: 0, ongoing: 0, completed: 0, cancelled: 0 };
                  return (
                    <tr key={index}>
                      <td style={styles.td}><strong>{barber.name || 'Unknown'}</strong></td>
                      <td style={styles.td}>{barber.total || 0}</td>
                      <td style={styles.td}>{barberStatusBreakdown?.completed || 0}</td>
                      <td style={styles.td}>{barberStatusBreakdown?.cancelled || barberStatusBreakdown?.cancel || 0}</td>
                      <td style={styles.td}>{(barber?.total || 0) > 0 ? (((barberStatusBreakdown?.completed || 0) / (barber?.total || 1)) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="row mb-4">
        <div className="col-12">
          <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Daily Appointment Breakdown</h5>
          <div className="table-responsive border rounded-4 overflow-hidden">
            <table style={styles.reportTable}>
              <thead>
                <tr>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Scheduled</th>
                  <th style={styles.th}>Queue</th>
                  <th style={styles.th}>Completed</th>
                </tr>
              </thead>
              <tbody>
                {dailyBreakdown.map((day, index) => (
                  <tr key={index}>
                    <td style={styles.td}><strong>{day.date ? new Date(day.date).toLocaleDateString() : 'Unknown Date'}</strong></td>
                    <td style={styles.td}>{day.total || 0}</td>
                    <td style={styles.td}>{day.scheduled || 0}</td>
                    <td style={styles.td}>{day.queue || 0}</td>
                    <td style={styles.td}>{day?.completed || 0}</td>
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

const CustomerReportView = ({ data, styles }) => (
  <div>
    <div className="row mb-4">
      <div className="col-12">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Customer Summary</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                <th style={styles.th}>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.td}><strong>Total Customers</strong></td>
                <td style={styles.td}><strong>{data?.summary?.totalCustomers || 0}</strong></td>
              </tr>
              <tr>
                <td style={styles.td}>New Customers</td>
                <td style={styles.td}>{data?.summary?.newCustomers || 0}</td>
              </tr>
              <tr>
                <td style={styles.td}>Repeat Customers</td>
                <td style={styles.td}>{data?.summary?.repeatCustomers || 0}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Customer Statistics</h5>
    <div className="table-responsive border rounded-4 overflow-hidden">
      <table style={styles.reportTable}>
        <thead>
          <tr>
            <th style={styles.th}>Customer</th>
            <th style={styles.th}>Appointments</th>
            <th style={styles.th}>Total Spent</th>
            <th style={styles.th}>Last Visit</th>
          </tr>
        </thead>
        <tbody>
          {(data.customerStats || []).map((customer) => (
            <tr key={customer.id}>
              <td style={styles.td}>{customer.full_name}</td>
              <td style={styles.td}>{customer.appointments}</td>
              <td style={styles.td} className="currency-table-cell">₱{(customer.totalSpent || 0).toFixed(2)}</td>
              <td style={styles.td}>{customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : 'Never'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const ServiceReportView = ({ data, styles }) => (
  <div>
    <div className="row mb-4">
      <div className="col-12">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Service Highlights</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                <th style={styles.th}>Service</th>
                <th style={styles.th}>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.td}><strong>Most Popular Service</strong></td>
                <td style={styles.td}>{data.mostPopular?.name || 'N/A'}</td>
                <td style={styles.td}>{data.mostPopular?.bookings || 0} bookings</td>
              </tr>
              <tr>
                <td style={styles.td}><strong>Highest Revenue Service</strong></td>
                <td style={styles.td}>{data.mostRevenue?.name || 'N/A'}</td>
                <td style={styles.td} className="currency-table-cell">₱{(data.mostRevenue?.revenue || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Service Performance</h5>
    <div className="table-responsive border rounded-4 overflow-hidden">
      <table style={styles.reportTable}>
        <thead>
          <tr>
            <th style={styles.th}>Service</th>
            <th style={styles.th}>Price</th>
            <th style={styles.th}>Bookings</th>
            <th style={styles.th}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {(data.servicePerformance || []).map((service) => (
            <tr key={service.id}>
              <td style={styles.td}>{service.name}</td>
              <td style={styles.td} className="currency-table-cell">₱{(service.price || 0).toFixed(2)}</td>
              <td style={styles.td}>{service.bookings}</td>
              <td style={styles.td} className="currency-table-cell">₱{(service.revenue || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const InventoryReportView = ({ data, styles }) => (
  <div>
    <div className="row mb-4">
      <div className="col-12">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Inventory Summary</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                <th style={styles.th}>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.td}><strong>Total Products</strong></td>
                <td style={styles.td}><strong>{data.summary.totalProducts}</strong></td>
              </tr>
              <tr>
                <td style={styles.td}>Needs Restock</td>
                <td style={styles.td}>{data.summary.needsRestock}</td>
              </tr>
              <tr>
                <td style={styles.td}>Low Stock</td>
                <td style={styles.td}>{data.summary.lowStock}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div className="row g-4">
      <div className="col-md-6">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Products Needing Restock</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Product</th>
                <th style={styles.th}>Current Stock</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.needsRestock || []).map((product) => (
                <tr key={product.id}>
                  <td style={styles.td}>{product.name}</td>
                  <td style={styles.td}>{product.stock_quantity}</td>
                  <td style={styles.td}>{product.stock_quantity < 5 ? 'Critical' : 'Low Stock'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Product Sales</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Product</th>
                <th style={styles.th}>Quantity Sold</th>
                <th style={styles.th}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(data.productSales || []).map((product, index) => (
                <tr key={index}>
                  <td style={styles.td}>{product.name}</td>
                  <td style={styles.td}>{product.quantity}</td>
                  <td style={styles.td} className="currency-table-cell">₱{(product.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

const SystemReportView = ({ data, styles }) => (
  <div>
    <div className="row mb-4">
      <div className="col-12">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">System Summary</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                <th style={styles.th}>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.td}><strong>Total Logs</strong></td>
                <td style={styles.td}><strong>{data.summary.totalLogs}</strong></td>
              </tr>
              <tr>
                <td style={styles.td}>Failed Login Attempts</td>
                <td style={styles.td}>{data.summary.failedLogins}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div className="row g-4">
      <div className="col-md-6">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Action Breakdown</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.summary.actionBreakdown || {}).map(([action, count]) => (
                <tr key={action}>
                  <td style={styles.td}>{action.replace(/_/g, ' ').toUpperCase()}</td>
                  <td style={styles.td}>{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="col-md-6">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Recent Logs</h5>
        <div className="table-responsive border rounded-4 overflow-hidden" style={{ maxHeight: '400px' }}>
          <table style={styles.reportTable}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>User</th>
              </tr>
            </thead>
            <tbody>
              {(data.recentLogs || []).slice(0, 20).map((log) => (
                <tr key={log.id}>
                  <td style={styles.td}>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td style={styles.td}>{log.action}</td>
                  <td style={styles.td}>{log.user_id?.substring(0, 8) || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
);

const QueueReportView = ({ data, styles }) => (
  <div>
    <div className="row mb-4">
      <div className="col-12">
        <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Queue Summary</h5>
        <div className="table-responsive border rounded-4 overflow-hidden">
          <table style={styles.reportTable}>
            <thead>
              <tr>
                <th style={styles.th}>Metric</th>
                <th style={styles.th}>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.td}><strong>Total Queue Appointments</strong></td>
                <td style={styles.td}><strong>{data.summary.totalQueueAppointments}</strong></td>
              </tr>
              <tr>
                <td style={styles.td}>Completed</td>
                <td style={styles.td}>{data.summary.completedQueue}</td>
              </tr>
              <tr>
                <td style={styles.td}>Cancelled</td>
                <td style={styles.td}>{data.summary.cancelledQueue}</td>
              </tr>
              <tr>
                <td style={styles.td}>Average Wait Time</td>
                <td style={styles.td}>{data.summary.averageWaitTime || 0} min</td>
              </tr>
              <tr>
                <td style={styles.td}>Completion Rate</td>
                <td style={styles.td}>{(data.summary.completionRate || 0).toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Queue Performance by Barber</h5>
    <div className="table-responsive border rounded-4 overflow-hidden">
      <table style={styles.reportTable}>
        <thead>
          <tr>
            <th style={styles.th}>Barber</th>
            <th style={styles.th}>Total Queue</th>
            <th style={styles.th}>Completed</th>
            <th style={styles.th}>Cancelled</th>
            <th style={styles.th}>Avg Wait Time</th>
          </tr>
        </thead>
        <tbody>
          {(data.queueByBarber || []).map((barber, index) => (
            <tr key={index}>
              <td style={styles.td}>{barber.name}</td>
              <td style={styles.td}>{barber.total}</td>
              <td style={styles.td}>{barber.completed}</td>
              <td style={styles.td}>{barber.cancelled}</td>
              <td style={styles.td}>{Math.round(barber.averageWaitTime || 0)} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);



export default Reports;