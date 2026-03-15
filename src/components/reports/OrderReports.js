import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const OrderReports = ({ dateRange, styles }) => {
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (dateRange) {
      generateOrderReport();
    }
  }, [dateRange]);

  const generateOrderReport = async () => {
    setLoading(true);
    setError('');

    try {
      // Get orders with customer and item details
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customer_id (
            id,
            full_name,
            email,
            phone
          ),
          order_items (
            *,
            product:product_id (
              id,
              name,
              category,
              price
            )
          )
        `)
        .gte('created_at', dateRange.start)
        .lte('created_at', dateRange.end)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Calculate order statistics
      const totalOrders = orders?.length || 0;
      // Only count 'picked_up' orders for total revenue
      const totalRevenue = orders?.filter(order => order.status === 'picked_up')
        .reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Orders by status
      const ordersByStatus = {};
      orders?.forEach(order => {
        const status = order.status || 'unknown';
        if (!ordersByStatus[status]) {
          ordersByStatus[status] = {
            count: 0,
            revenue: 0
          };
        }
        ordersByStatus[status].count += 1;
        ordersByStatus[status].revenue += order.total_amount || 0;
      });

      // Orders by customer
      const ordersByCustomer = {};
      orders?.forEach(order => {
        const customerId = order.customer_id;
        const customerName = order.customer?.full_name || 'Unknown Customer';

        if (!ordersByCustomer[customerId]) {
          ordersByCustomer[customerId] = {
            name: customerName,
            email: order.customer?.email || '',
            phone: order.customer?.phone || '',
            orders: 0,
            revenue: 0,
            lastOrder: order.created_at
          };
        }
        ordersByCustomer[customerId].orders += 1;

        // Only count revenue for 'picked_up' orders
        if (order.status === 'picked_up') {
          ordersByCustomer[customerId].revenue += order.total_amount || 0;
        }

        // Update last order date if this is more recent
        if (new Date(order.created_at) > new Date(ordersByCustomer[customerId].lastOrder)) {
          ordersByCustomer[customerId].lastOrder = order.created_at;
        }
      });

      // Product sales analysis
      const productSales = {};
      orders?.forEach(order => {
        order.order_items?.forEach(item => {
          const productId = item.product_id;
          const productName = item.product?.name || item.product_name || 'Unknown Product';
          const productCategory = item.product?.category || 'Uncategorized';

          if (!productSales[productId]) {
            productSales[productId] = {
              name: productName,
              category: productCategory,
              quantitySold: 0,
              revenue: 0,
              orders: 0
            };
          }

          // Only count quantity and revenue for 'picked_up' orders
          if (order.status === 'picked_up') {
            productSales[productId].quantitySold += item.quantity || 0;
            productSales[productId].revenue += item.total_price || 0;
          }
          productSales[productId].orders += 1;
        });
      });

      // Daily revenue breakdown
      const dailyRevenue = {};
      orders?.forEach(order => {
        const date = order.created_at?.split('T')[0];
        if (date) {
          if (!dailyRevenue[date]) {
            dailyRevenue[date] = {
              orders: 0,
              revenue: 0
            };
          }
          dailyRevenue[date].orders += 1;

          // Only count revenue for 'picked_up' orders
          if (order.status === 'picked_up') {
            dailyRevenue[date].revenue += order.total_amount || 0;
          }
        }
      });

      // Walk-in vs Online orders (based on pickup location or notes)
      const orderTypes = {
        walkIn: { count: 0, revenue: 0 },
        online: { count: 0, revenue: 0 }
      };

      orders?.forEach(order => {
        const isWalkIn = order.notes?.toLowerCase().includes('walk-in') ||
          order.pickup_location?.toLowerCase().includes('immediate');

        if (isWalkIn) {
          orderTypes.walkIn.count += 1;
          if (order.status === 'picked_up') {
            orderTypes.walkIn.revenue += order.total_amount || 0;
          }
        } else {
          orderTypes.online.count += 1;
          if (order.status === 'picked_up') {
            orderTypes.online.revenue += order.total_amount || 0;
          }
        }
      });

      // Top customers by revenue
      const topCustomers = Object.values(ordersByCustomer)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Top products by revenue
      const topProducts = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      // Recent orders
      const recentOrders = orders?.slice(0, 20) || [];

      setOrderData({
        summary: {
          totalOrders,
          totalRevenue,
          averageOrderValue,
          ordersByStatus: Object.entries(ordersByStatus).map(([status, data]) => ({
            status,
            count: data.count,
            revenue: data.revenue
          }))
        },
        orderTypes,
        topCustomers,
        topProducts,
        dailyRevenue: Object.entries(dailyRevenue).map(([date, data]) => ({
          date,
          orders: data.orders,
          revenue: data.revenue
        })).sort((a, b) => new Date(a.date) - new Date(b.date)),
        recentOrders
      });

    } catch (err) {
      console.error('Error generating order report:', err);
      setError('Failed to generate order report');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-dark" style={{ width: '2rem', height: '2rem' }}></div>
        <p className="mt-3 text-muted fw-bold small">Generating order analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger rounded-4 border-0">
        <i className="bi bi-exclamation-triangle me-2"></i>
        {error}
      </div>
    );
  }

  if (!orderData) return null;

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'confirmed': return 'Confirmed';
      case 'preparing': return 'Preparing';
      case 'ready_for_pickup': return 'Ready for Pickup';
      case 'picked_up': return 'Picked Up';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  return (
    <div>
      {/* Summary Table */}
      <div className="row mb-4">
        <div className="col-12">
          <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Order Summary</h5>
          <div className="table-responsive border rounded-4 overflow-hidden">
            <table style={styles?.reportTable || {}}>
              <thead>
                <tr>
                  <th style={styles?.th}>Metric</th>
                  <th style={styles?.th}>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={styles?.td}><strong>Total Orders</strong></td>
                  <td style={styles?.td}><strong>{orderData.summary.totalOrders}</strong></td>
                </tr>
                <tr>
                  <td style={styles?.td}>Total Revenue</td>
                  <td style={styles?.td} className="currency-table-cell">₱{orderData.summary.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td style={styles?.td}>Average Order Value</td>
                  <td style={styles?.td} className="currency-table-cell">₱{orderData.summary.averageOrderValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        {/* Orders by Status */}
        <div className="col-md-6">
          <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">By Status</h5>
          <div className="table-responsive border rounded-4 overflow-hidden">
            <table style={styles?.reportTable || {}}>
              <thead>
                <tr>
                  <th style={styles?.th}>Status</th>
                  <th style={styles?.th}>Count</th>
                  <th style={styles?.th}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {orderData.summary.ordersByStatus.map((status, index) => (
                  <tr key={index}>
                    <td style={styles?.td}>{getStatusText(status.status)}</td>
                    <td style={styles?.td}>{status.count}</td>
                    <td style={styles?.td} className="currency-table-cell">₱{status.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Customers */}
        <div className="col-md-6">
          <h5 className="fw-800 small text-uppercase letter-spacing-1 mb-3">Top Customers</h5>
          <div className="table-responsive border rounded-4 overflow-hidden">
            <table style={styles?.reportTable || {}}>
              <thead>
                <tr>
                  <th style={styles?.th}>Customer</th>
                  <th style={styles?.th}>Orders</th>
                  <th style={styles?.th}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {orderData.topCustomers.map((customer, index) => (
                  <tr key={index}>
                    <td style={styles?.td}><strong>{customer.name}</strong></td>
                    <td style={styles?.td}>{customer.orders}</td>
                    <td style={styles?.td} className="currency-table-cell">₱{customer.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
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

export default OrderReports;


