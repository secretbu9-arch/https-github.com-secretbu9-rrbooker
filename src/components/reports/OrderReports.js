import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

const OrderReports = ({ dateRange }) => {
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
      const totalRevenue = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
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
        ordersByCustomer[customerId].revenue += order.total_amount || 0;
        
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
          productSales[productId].quantitySold += item.quantity || 0;
          productSales[productId].revenue += item.total_price || 0;
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
          dailyRevenue[date].revenue += order.total_amount || 0;
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
          orderTypes.walkIn.revenue += order.total_amount || 0;
        } else {
          orderTypes.online.count += 1;
          orderTypes.online.revenue += order.total_amount || 0;
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
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3 text-muted">Generating order report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        <i className="bi bi-exclamation-triangle me-2"></i>
        {error}
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className="text-center py-5">
        <i className="bi bi-box-seam display-4 text-muted"></i>
        <p className="text-muted mt-3">No order data available</p>
      </div>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'confirmed': return 'info';
      case 'preparing': return 'primary';
      case 'ready_for_pickup': return 'success';
      case 'picked_up': return 'secondary';
      case 'cancelled': return 'danger';
      default: return 'light';
    }
  };

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
    <div className="order-report">
      <style>
        {`
          .order-report table {
            border-collapse: collapse;
            width: 100%;
            font-size: 13px;
            border: 1px solid #d0d0d0;
          }
          .order-report table thead {
            background-color: #f2f2f2;
            border-bottom: 2px solid #d0d0d0;
          }
          .order-report table thead th {
            background-color: #f2f2f2;
            border: 1px solid #d0d0d0;
            padding: 8px 10px;
            text-align: left;
            font-weight: 600;
            color: #000;
            white-space: nowrap;
          }
          .order-report table tbody td {
            border: 1px solid #d0d0d0;
            padding: 6px 10px;
            background-color: #fff;
          }
          .order-report table tbody tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .order-report table tbody tr:nth-child(even) td {
            background-color: #f9f9f9;
          }
          .order-report table tbody tr:hover {
            background-color: #e8f4f8;
          }
          .order-report table tbody tr:hover td {
            background-color: #e8f4f8;
          }
          .order-report .table-responsive {
            border: 1px solid #d0d0d0;
            overflow-x: auto;
          }
        `}
      </style>
      {/* Summary Table */}
      <div className="row mb-4">
        <div className="col-12">
          <h5>Order Summary</h5>
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
                  <td><strong>Total Orders</strong></td>
                  <td><strong>{orderData.summary.totalOrders}</strong></td>
                </tr>
                <tr>
                  <td>Total Revenue</td>
                  <td className="currency-table-cell">₱{orderData.summary.totalRevenue.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Average Order Value</td>
                  <td className="currency-table-cell">₱{orderData.summary.averageOrderValue.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Walk-in Orders</td>
                  <td>{orderData.orderTypes.walkIn.count}</td>
                </tr>
                <tr>
                  <td>Online Orders</td>
                  <td>{orderData.orderTypes.online.count}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Orders by Status */}
        <div className="col-md-6 mb-4">
          <h5>Orders by Status</h5>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Count</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {orderData.summary.ordersByStatus.map((status, index) => (
                  <tr key={index}>
                    <td>{getStatusText(status.status)}</td>
                    <td>{status.count}</td>
                    <td className="currency-table-cell">₱{status.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Types */}
        <div className="col-md-6 mb-4">
          <h5>Order Types</h5>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Count</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Walk-in Orders</td>
                  <td>{orderData.orderTypes.walkIn.count}</td>
                  <td className="currency-table-cell">₱{orderData.orderTypes.walkIn.revenue.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Online Orders</td>
                  <td>{orderData.orderTypes.online.count}</td>
                  <td className="currency-table-cell">₱{orderData.orderTypes.online.revenue.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="row">
        {/* Top Customers */}
        <div className="col-md-6 mb-4">
          <h5>Top Customers by Revenue</h5>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Orders</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {orderData.topCustomers.map((customer, index) => (
                  <tr key={index}>
                    <td>
                      <div>
                        <strong>{customer.name}</strong>
                        <br />
                        <small className="text-muted">{customer.email}</small>
                      </div>
                    </td>
                    <td>{customer.orders}</td>
                    <td className="currency-table-cell">₱{customer.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products */}
        <div className="col-md-6 mb-4">
          <h5>Top Products by Revenue</h5>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {orderData.topProducts.map((product, index) => (
                  <tr key={index}>
                    <td>
                      <strong>{product.name}</strong>
                    </td>
                    <td>{product.category}</td>
                    <td>{product.quantitySold}</td>
                    <td className="currency-table-cell">₱{product.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Daily Revenue Chart */}
      <div className="row mb-4">
        <div className="col-12">
          <h5>Daily Revenue Breakdown</h5>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Orders</th>
                  <th>Revenue</th>
                  <th>Average per Order</th>
                </tr>
              </thead>
              <tbody>
                {orderData.dailyRevenue.map((day, index) => (
                  <tr key={index}>
                    <td>{new Date(day.date).toLocaleDateString()}</td>
                    <td>{day.orders}</td>
                    <td className="currency-table-cell">₱{day.revenue.toFixed(2)}</td>
                    <td className="currency-table-cell">₱{day.orders > 0 ? (day.revenue / day.orders).toFixed(2) : '0.00'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="row">
        <div className="col-12">
          <h5>Recent Orders</h5>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {orderData.recentOrders.map((order, index) => (
                  <tr key={index}>
                    <td>
                      <code>#{order.id.slice(-8)}</code>
                    </td>
                    <td>
                      <div>
                        <strong>{order.customer?.full_name || 'Unknown'}</strong>
                        <br />
                        <small className="text-muted">{order.customer?.email || ''}</small>
                      </div>
                    </td>
                    <td>{getStatusText(order.status)}</td>
                    <td className="currency-table-cell">₱{order.total_amount?.toFixed(2) || '0.00'}</td>
                    <td>{new Date(order.created_at).toLocaleDateString()}</td>
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


