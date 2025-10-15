// services/OrdersService.js
import { supabase } from '../supabaseClient';

/**
 * Orders Service for Shop Products with Pickup Functionality
 * Handles order creation, management, and pickup coordination
 */
class OrdersService {
  constructor() {
    // Simplified service without fraud prevention
  }

  /**
   * Create a new order (simplified without fraud prevention)
   * @param {Object} orderData - Order data
   * @param {Object} customerData - Customer information
   * @returns {Promise<Object>} Created order
   */
  async createOrder(orderData, customerData) {
    try {
      console.log('🛒 Creating new order...', { orderData, customerData });

      // 1. Create order in database
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_id: customerData.id,
          total_amount: orderData.totalAmount,
          pickup_date: orderData.pickupDate,
          pickup_time: orderData.pickupTime,
          pickup_location: orderData.pickupLocation || 'R&R Barber Shop',
          notes: orderData.notes,
          customer_phone: customerData.phone,
          customer_email: customerData.email,
          status: 'pending'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Create order items
      const orderItems = orderData.items.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        product_name: item.productName,
        product_description: item.productDescription,
        product_image_url: item.productImageUrl
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // 3. Send notifications
      await this.sendOrderNotifications(order, customerData.name);

      console.log('✅ Order created successfully:', order);

      return {
        order,
        requiresVerification: false,
        verificationCode: null
      };

    } catch (error) {
      console.error('❌ Error creating order:', error);
      throw error;
    }
  }

  /**
   * Get orders for a customer
   * @param {string} customerId - Customer ID
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} Customer orders
   */
  async getCustomerOrders(customerId, filters = {}) {
    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            product:product_id (
              id,
              name,
              image_url
            )
          )
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.dateFrom) {
        query = query.gte('pickup_date', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('pickup_date', filters.dateTo);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching customer orders:', error);
      throw error;
    }
  }

  /**
   * Get all orders (for managers)
   * @param {Object} filters - Optional filters
   * @returns {Promise<Array>} All orders
   */
  async getAllOrders(filters = {}) {
    try {
      let query = supabase
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
              image_url
            )
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.riskLevel) {
        const riskThresholds = {
          low: [0, 30],
          medium: [31, 60],
          high: [61, 80],
          critical: [81, 100]
        };
        const [min, max] = riskThresholds[filters.riskLevel] || [0, 100];
        query = query.gte('risk_score', min).lte('risk_score', max);
      }

      if (filters.dateFrom) {
        query = query.gte('pickup_date', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('pickup_date', filters.dateTo);
      }

      if (filters.customerId) {
        query = query.eq('customer_id', filters.customerId);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching all orders:', error);
      throw error;
    }
  }

  /**
   * Update order status
   * @param {string} orderId - Order ID
   * @param {string} status - New status
   * @param {Object} updateData - Additional update data
   * @returns {Promise<Object>} Updated order
   */
  async updateOrderStatus(orderId, status, updateData = {}) {
    try {
      const updateFields = {
        status,
        updated_at: new Date().toISOString(),
        ...updateData
      };

      // Add timestamp fields based on status
      switch (status) {
        case 'confirmed':
          updateFields.confirmed_at = new Date().toISOString();
          break;
        case 'ready_for_pickup':
          updateFields.ready_at = new Date().toISOString();
          break;
        case 'picked_up':
          updateFields.picked_up_at = new Date().toISOString();
          break;
        case 'cancelled':
          updateFields.cancelled_at = new Date().toISOString();
          break;
      }

      const { data, error } = await supabase
        .from('orders')
        .update(updateFields)
        .eq('id', orderId)
        .select(`
          *,
          customer:customer_id (
            id,
            full_name,
            email,
            phone
          )
        `)
        .single();

      if (error) throw error;

      // Send status update notification
      await this.sendStatusUpdateNotification(data, status);

      console.log('✅ Order status updated:', status);

      return data;
    } catch (error) {
      console.error('❌ Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Cancel an order
   * @param {string} orderId - Order ID
   * @param {string} reason - Cancellation reason
   * @param {string} cancelledBy - Who cancelled (customer/manager)
   * @returns {Promise<Object>} Cancelled order
   */
  async cancelOrder(orderId, reason, cancelledBy = 'customer') {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select(`
          *,
          customer:customer_id (
            id,
            full_name,
            email,
            phone
          )
        `)
        .single();

      if (error) throw error;

      // Send cancellation notification
      await this.sendStatusUpdateNotification(data, 'cancelled');

      console.log('✅ Order cancelled:', orderId);

      return data;
    } catch (error) {
      console.error('❌ Error cancelling order:', error);
      throw error;
    }
  }

  /**
   * Verify order with code
   * @param {string} orderId - Order ID
   * @param {string} verificationCode - Verification code
   * @returns {Promise<boolean>} Verification result
   */
  async verifyOrder(orderId, verificationCode) {
    try {
      const result = await this.scamPrevention.verifyOrder(orderId, verificationCode);
      
      if (result) {
        // Update order to confirmed if verification successful
        await this.updateOrderStatus(orderId, 'confirmed');
      }

      return result;
    } catch (error) {
      console.error('❌ Error verifying order:', error);
      throw error;
    }
  }

  /**
   * Get order details with fraud analysis
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Order with analysis
   */
  async getOrderDetails(orderId) {
    try {
      const { data: order, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customer_id (
            id,
            full_name,
            email,
            phone,
            profile_picture_url,
            role,
            created_at
          ),
          order_items (
            *,
            product:product_id (
              id,
              name,
              image_url,
              category
            )
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;

      return {
        order: order,
        items: order.order_items || []
      };
    } catch (error) {
      console.error('❌ Error fetching order details:', error);
      throw error;
    }
  }

  /**
   * Get orders ready for pickup
   * @returns {Promise<Array>} Orders ready for pickup
   */
  async getOrdersReadyForPickup() {
    try {
      const { data, error } = await supabase
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
              image_url
            )
          )
        `)
        .eq('status', 'ready_for_pickup')
        .order('ready_at', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching orders ready for pickup:', error);
      throw error;
    }
  }

  /**
   * Get order statistics
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Order statistics
   */
  async getOrderStatistics(filters = {}) {
    try {
      const { data: orders, error } = await supabase
        .from('orders')
        .select('status, total_amount, risk_score, created_at, pickup_date');

      if (error) throw error;

      const stats = {
        total: orders.length,
        byStatus: {},
        totalRevenue: 0,
        averageOrderValue: 0,
        riskDistribution: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0
        },
        dailyOrders: {}
      };

      orders.forEach(order => {
        // Status distribution
        stats.byStatus[order.status] = (stats.byStatus[order.status] || 0) + 1;

        // Revenue calculation
        if (order.status !== 'cancelled' && order.status !== 'refunded') {
          stats.totalRevenue += parseFloat(order.total_amount);
        }

        // Risk distribution
        if (order.risk_score < 30) stats.riskDistribution.low++;
        else if (order.risk_score < 60) stats.riskDistribution.medium++;
        else if (order.risk_score < 80) stats.riskDistribution.high++;
        else stats.riskDistribution.critical++;

        // Daily orders
        const date = order.pickup_date;
        stats.dailyOrders[date] = (stats.dailyOrders[date] || 0) + 1;
      });

      stats.averageOrderValue = stats.total > 0 ? stats.totalRevenue / stats.total : 0;

      return stats;
    } catch (error) {
      console.error('❌ Error fetching order statistics:', error);
      throw error;
    }
  }

  /**
   * Send order notifications
   */
  async sendOrderNotifications(order, customerName = 'Customer') {
    try {
      // Order confirmation notification
      await this.sendNotification(order.customer_id, {
        order_id: order.id,
        notification_type: 'order_confirmed',
        title: 'Order Confirmed',
        message: `Your order #${order.order_number || order.id.slice(-8)} has been confirmed. Pickup: ${order.pickup_date} at ${order.pickup_time}`,
        sent_via: 'app'
      });

      // Notify managers of new order
      const { data: managers } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'manager');

      if (managers) {
        for (const manager of managers) {
          await this.sendNotification(manager.id, {
            order_id: order.id,
            notification_type: 'new_order',
            title: 'New Order Received',
            message: `New order #${order.order_number || order.id.slice(-8)} from ${customerName}`,
            sent_via: 'app'
          });
        }
      }

    } catch (error) {
      console.error('❌ Error sending order notifications:', error);
    }
  }

  /**
   * Send status update notification
   */
  async sendStatusUpdateNotification(order, status) {
    try {
      const statusMessages = {
        confirmed: 'Your order has been confirmed and is being prepared.',
        preparing: 'Your order is being prepared.',
        ready_for_pickup: 'Your order is ready for pickup!',
        picked_up: 'Thank you for picking up your order.',
        cancelled: 'Your order has been cancelled.'
      };

      const message = statusMessages[status] || 'Your order status has been updated.';

      await this.sendNotification(order.customer_id, {
        order_id: order.id,
        notification_type: `order_${status}`,
        title: `Order ${status.replace('_', ' ').toUpperCase()}`,
        message: message,
        sent_via: 'app'
      });

    } catch (error) {
      console.error('❌ Error sending status update notification:', error);
    }
  }

  /**
   * Send notification helper using unified service
   */
  async sendNotification(userId, notificationData) {
    try {
      // Create order notification using centralized service
      const { default: centralizedNotificationService } = await import('./CentralizedNotificationService');
      
      // Determine category based on notification type
      let category = 'status_update';
      if (notificationData.notification_type) {
        switch (notificationData.notification_type) {
          case 'order_confirmed':
            category = 'status_update';
            break;
          case 'ready_for_pickup':
            category = 'ready';
            break;
          case 'pickup_reminder':
            category = 'reminder';
            break;
          case 'order_cancelled':
            category = 'cancellation';
            break;
          default:
            category = 'status_update';
        }
      }

      // Create notification using centralized service
      await centralizedNotificationService.createNotification({
        userId: userId,
        title: notificationData.title,
        message: notificationData.message,
        type: 'order',
        category: category,
        channels: ['app', 'push'],
        orderId: notificationData.order_id,
        priority: notificationData.notification_type === 'order_cancelled' ? 'high' : 'normal',
        data: {
          original_type: notificationData.notification_type,
          sent_via: notificationData.sent_via
        }
      });

      // Push notification is now handled by CentralizedNotificationService

    } catch (error) {
      console.error('❌ Error sending notification:', error);
    }
  }
}

export default new OrdersService();
