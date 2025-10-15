// services/OrderScamPreventionService.js
import { supabase } from '../supabaseClient';
import { fakeUserDetectionService } from './FakeUserDetectionService';

/**
 * Enhanced Scam Prevention Service for Orders
 * Prevents fraudulent orders and fake customers from ordering products
 */
class OrderScamPreventionService {
  constructor() {
    this.fakeUserService = fakeUserDetectionService;
    this.riskThresholds = {
      low: 30,
      medium: 60,
      high: 80,
      critical: 90
    };
  }

  /**
   * Analyze order for fraud before processing
   * @param {Object} orderData - Order data to analyze
   * @param {Object} customerData - Customer information
   * @returns {Promise<Object>} Analysis result with risk score and recommendations
   */
  async analyzeOrder(orderData, customerData) {
    try {
      console.log('🔍 Analyzing order for fraud prevention...', { orderData, customerData });

      const analysis = {
        orderId: null,
        riskScore: 0,
        riskLevel: 'low',
        fraudFlags: [],
        recommendations: [],
        verificationRequired: false,
        canProceed: true,
        analysisDetails: {}
      };

      // 1. Customer Behavior Analysis
      const behaviorAnalysis = await this.analyzeCustomerBehavior(customerData.id, orderData);
      analysis.riskScore += behaviorAnalysis.riskScore;
      analysis.fraudFlags.push(...behaviorAnalysis.flags);
      analysis.analysisDetails.behavior = behaviorAnalysis;

      // 2. Order Pattern Analysis
      const patternAnalysis = await this.analyzeOrderPatterns(orderData, customerData);
      analysis.riskScore += patternAnalysis.riskScore;
      analysis.fraudFlags.push(...patternAnalysis.flags);
      analysis.analysisDetails.patterns = patternAnalysis;

      // 3. Product Analysis
      const productAnalysis = await this.analyzeProductSelection(orderData.items);
      analysis.riskScore += productAnalysis.riskScore;
      analysis.fraudFlags.push(...productAnalysis.flags);
      analysis.analysisDetails.products = productAnalysis;

      // 4. Contact Information Analysis
      const contactAnalysis = await this.analyzeContactInfo(customerData);
      analysis.riskScore += contactAnalysis.riskScore;
      analysis.fraudFlags.push(...contactAnalysis.flags);
      analysis.analysisDetails.contact = contactAnalysis;

      // 5. Device and IP Analysis
      const deviceAnalysis = await this.analyzeDeviceAndIP(customerData);
      analysis.riskScore += deviceAnalysis.riskScore;
      analysis.fraudFlags.push(...deviceAnalysis.flags);
      analysis.analysisDetails.device = deviceAnalysis;

      // 6. Determine final risk level and recommendations
      analysis.riskLevel = this.calculateRiskLevel(analysis.riskScore);
      analysis.recommendations = this.generateRecommendations(analysis);
      analysis.verificationRequired = analysis.riskScore >= this.riskThresholds.medium;
      analysis.canProceed = analysis.riskScore < this.riskThresholds.critical;

      console.log('✅ Order analysis complete:', analysis);

      return analysis;
    } catch (error) {
      console.error('❌ Error analyzing order:', error);
      return {
        riskScore: 50, // Default to medium risk on error
        riskLevel: 'medium',
        fraudFlags: ['analysis_error'],
        recommendations: ['Manual review required due to analysis error'],
        verificationRequired: true,
        canProceed: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze customer behavior patterns
   */
  async analyzeCustomerBehavior(customerId, orderData) {
    const analysis = {
      riskScore: 0,
      flags: [],
      details: {}
    };

    try {
      // Check order frequency
      const { data: recentOrders, error } = await supabase
        .from('orders')
        .select('id, created_at, total_amount, status')
        .eq('customer_id', customerId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Flag: Too many orders in short time
      if (recentOrders && recentOrders.length > 3) {
        analysis.riskScore += 25;
        analysis.flags.push('excessive_orders_24h');
        analysis.details.excessiveOrders = recentOrders.length;
      }

      // Flag: High-value orders
      if (orderData.totalAmount > 500) {
        analysis.riskScore += 15;
        analysis.flags.push('high_value_order');
        analysis.details.highValue = orderData.totalAmount;
      }

      // Flag: New customer with large order
      if (recentOrders && recentOrders.length === 0 && orderData.totalAmount > 200) {
        analysis.riskScore += 20;
        analysis.flags.push('new_customer_large_order');
      }

      // Check for cancelled orders
      const cancelledOrders = recentOrders?.filter(order => order.status === 'cancelled') || [];
      if (cancelledOrders.length > 1) {
        analysis.riskScore += 20;
        analysis.flags.push('frequent_cancellations');
        analysis.details.cancelledOrders = cancelledOrders.length;
      }

    } catch (error) {
      console.error('Error analyzing customer behavior:', error);
      analysis.riskScore += 10;
      analysis.flags.push('behavior_analysis_error');
    }

    return analysis;
  }

  /**
   * Analyze order patterns for suspicious activity
   */
  async analyzeOrderPatterns(orderData, customerData) {
    const analysis = {
      riskScore: 0,
      flags: [],
      details: {}
    };

    try {
      // Flag: Unusual pickup time (very early or very late)
      const pickupHour = new Date(`2000-01-01T${orderData.pickupTime}`).getHours();
      if (pickupHour < 6 || pickupHour > 20) {
        analysis.riskScore += 15;
        analysis.flags.push('unusual_pickup_time');
        analysis.details.unusualTime = orderData.pickupTime;
      }

      // Flag: Same day pickup for large orders
      const pickupDate = new Date(orderData.pickupDate);
      const today = new Date();
      const isSameDay = pickupDate.toDateString() === today.toDateString();
      
      if (isSameDay && orderData.totalAmount > 100) {
        analysis.riskScore += 10;
        analysis.flags.push('same_day_large_order');
      }

      // Flag: Multiple quantities of same product
      const productQuantities = orderData.items.map(item => item.quantity);
      const maxQuantity = Math.max(...productQuantities);
      if (maxQuantity > 5) {
        analysis.riskScore += 15;
        analysis.flags.push('excessive_quantity');
        analysis.details.maxQuantity = maxQuantity;
      }

      // Flag: Only high-value products
      const avgItemPrice = orderData.items.reduce((sum, item) => sum + item.unitPrice, 0) / orderData.items.length;
      if (avgItemPrice > 100 && orderData.items.length > 2) {
        analysis.riskScore += 10;
        analysis.flags.push('only_premium_products');
        analysis.details.avgPrice = avgItemPrice;
      }

    } catch (error) {
      console.error('Error analyzing order patterns:', error);
      analysis.riskScore += 5;
      analysis.flags.push('pattern_analysis_error');
    }

    return analysis;
  }

  /**
   * Analyze product selection for suspicious patterns
   */
  async analyzeProductSelection(items) {
    const analysis = {
      riskScore: 0,
      flags: [],
      details: {}
    };

    try {
      // Flag: All products from same category (potential reseller)
      const categories = [...new Set(items.map(item => item.category))];
      if (categories.length === 1 && items.length > 3) {
        analysis.riskScore += 15;
        analysis.flags.push('single_category_bulk');
        analysis.details.category = categories[0];
      }

      // Flag: Products with low stock (potential hoarding)
      for (const item of items) {
        if (item.stockQuantity < 5 && item.quantity > 2) {
          analysis.riskScore += 10;
          analysis.flags.push('low_stock_hoarding');
          analysis.details.lowStockProduct = item.productName;
          break;
        }
      }

      // Flag: Mix of very different product types (potential fake order)
      const productTypes = items.map(item => item.category);
      const uniqueTypes = [...new Set(productTypes)];
      if (uniqueTypes.length > 4 && items.length < 6) {
        analysis.riskScore += 10;
        analysis.flags.push('diverse_product_mix');
        analysis.details.productTypes = uniqueTypes.length;
      }

    } catch (error) {
      console.error('Error analyzing product selection:', error);
      analysis.riskScore += 5;
      analysis.flags.push('product_analysis_error');
    }

    return analysis;
  }

  /**
   * Analyze contact information for fraud indicators
   */
  async analyzeContactInfo(customerData) {
    const analysis = {
      riskScore: 0,
      flags: [],
      details: {}
    };

    try {
      // Use existing fake user detection
      const fakeUserAnalysis = await this.fakeUserService.analyzeUserRegistration({
        email: customerData.email,
        phone: customerData.phone,
        full_name: customerData.full_name
      });

      // Transfer risk from fake user analysis
      analysis.riskScore += Math.floor(fakeUserAnalysis.riskScore * 0.3); // 30% weight
      analysis.flags.push(...fakeUserAnalysis.flags.map(flag => `contact_${flag}`));
      analysis.details.fakeUserAnalysis = fakeUserAnalysis;

      // Additional contact-specific checks
      if (customerData.phone && customerData.phone.length < 10) {
        analysis.riskScore += 15;
        analysis.flags.push('invalid_phone_format');
      }

      if (customerData.email && !customerData.email.includes('@')) {
        analysis.riskScore += 20;
        analysis.flags.push('invalid_email_format');
      }

    } catch (error) {
      console.error('Error analyzing contact info:', error);
      analysis.riskScore += 10;
      analysis.flags.push('contact_analysis_error');
    }

    return analysis;
  }

  /**
   * Analyze device and IP information
   */
  async analyzeDeviceAndIP(customerData) {
    const analysis = {
      riskScore: 0,
      flags: [],
      details: {}
    };

    try {
      // Check for multiple accounts from same device/IP
      const { data: deviceData, error } = await supabase
        .from('device_fingerprints')
        .select('user_id, risk_score')
        .eq('fingerprint_hash', customerData.deviceFingerprint || 'unknown');

      if (error) {
        console.warn('Device fingerprint analysis skipped:', error.message);
        // Continue without device analysis if table doesn't exist
      } else if (deviceData && deviceData.length > 1) {
        analysis.riskScore += 25;
        analysis.flags.push('multiple_accounts_same_device');
        analysis.details.deviceAccounts = deviceData.length;
      }

      // Check IP analysis cache
      if (customerData.ipAddress) {
        const { data: ipData, error: ipError } = await supabase
          .from('ip_analysis_cache')
          .select('risk_score, analysis_data')
          .eq('ip_address', customerData.ipAddress)
          .single();

        if (!ipError && ipData) {
          analysis.riskScore += Math.floor(ipData.risk_score * 0.2); // 20% weight
          analysis.details.ipAnalysis = ipData;
        }
      }

    } catch (error) {
      console.error('Error analyzing device and IP:', error);
      analysis.riskScore += 5;
      analysis.flags.push('device_analysis_error');
    }

    return analysis;
  }

  /**
   * Calculate risk level based on score
   */
  calculateRiskLevel(score) {
    if (score < this.riskThresholds.low) return 'low';
    if (score < this.riskThresholds.medium) return 'medium';
    if (score < this.riskThresholds.high) return 'high';
    return 'critical';
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.riskScore >= this.riskThresholds.critical) {
      recommendations.push('BLOCK_ORDER: Risk too high for automatic processing');
    } else if (analysis.riskScore >= this.riskThresholds.high) {
      recommendations.push('REQUIRE_MANAGER_APPROVAL: High risk order needs manual review');
      recommendations.push('REQUIRE_PHONE_VERIFICATION: Verify customer contact information');
    } else if (analysis.riskScore >= this.riskThresholds.medium) {
      recommendations.push('REQUIRE_EMAIL_VERIFICATION: Send verification email');
      recommendations.push('MONITOR_PICKUP: Watch for suspicious pickup behavior');
    } else {
      recommendations.push('PROCESS_NORMALLY: Low risk, standard processing');
    }

    // Specific recommendations based on flags
    if (analysis.fraudFlags.includes('excessive_orders_24h')) {
      recommendations.push('LIMIT_ORDER_FREQUENCY: Consider daily order limits');
    }

    if (analysis.fraudFlags.includes('high_value_order')) {
      recommendations.push('VERIFY_PAYMENT: Ensure payment method is valid');
    }

    if (analysis.fraudFlags.includes('new_customer_large_order')) {
      recommendations.push('WELCOME_CALL: Call new customer to verify order');
    }

    return recommendations;
  }

  /**
   * Save fraud analysis to database
   */
  async saveFraudAnalysis(orderId, analysis) {
    try {
      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Use the secure function instead of direct insert
      const { data, error } = await supabase.rpc('save_fraud_analysis', {
        p_order_id: orderId,
        p_user_id: user.id,
        p_risk_score: analysis.riskScore,
        p_fraud_flags: analysis.fraudFlags || [],
        p_analysis_data: analysis.analysisDetails || {},
        p_device_analysis: analysis.deviceAnalysis || {},
        p_contact_analysis: analysis.contactAnalysis || {},
        p_behavioral_analysis: analysis.behavioralAnalysis || {},
        p_recommendation: analysis.recommendation || 'approve'
      });

      if (error) throw error;

      console.log('✅ Fraud analysis saved to database:', data);
    } catch (error) {
      console.error('❌ Error saving fraud analysis:', error);
    }
  }

  /**
   * Create verification request for order
   */
  async createVerificationRequest(orderId, verificationType = 'phone') {
    try {
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Use the secure function instead of direct insert
      const { data, error } = await supabase.rpc('create_order_verification', {
        p_order_id: orderId,
        p_verification_type: verificationType,
        p_verification_code: verificationCode,
        p_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
      });

      if (error) throw error;

      console.log('✅ Verification request created:', verificationCode);
      return verificationCode;
    } catch (error) {
      console.error('❌ Error creating verification request:', error);
      throw error;
    }
  }

  /**
   * Verify order with code
   */
  async verifyOrder(orderId, verificationCode, verificationType = 'phone') {
    try {
      const { data, error } = await supabase
        .from('order_verifications')
        .select('*')
        .eq('order_id', orderId)
        .eq('verification_type', verificationType)
        .eq('verification_code', verificationCode)
        .eq('verification_status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error('Invalid or expired verification code');
      }

      // Mark as verified using the secure function
      const { error: updateError } = await supabase.rpc('update_verification_status', {
        p_verification_id: data.id,
        p_status: 'verified',
        p_verification_code: verificationCode
      });

      if (updateError) throw updateError;

      // Update order verification status
      const { error: orderError } = await supabase
        .from('orders')
        .update({ 
          verification_status: 'verified',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (orderError) throw orderError;

      console.log('✅ Order verification successful');
      return true;
    } catch (error) {
      console.error('❌ Error verifying order:', error);
      throw error;
    }
  }

  /**
   * Get order fraud analysis
   */
  async getOrderFraudAnalysis(orderId) {
    try {
      const { data, error } = await supabase
        .from('order_fraud_analysis')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching fraud analysis:', error);
      return [];
    }
  }
}

export default new OrderScamPreventionService();