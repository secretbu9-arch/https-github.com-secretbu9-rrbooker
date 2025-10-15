// services/BarberRecommendationService.js
import { supabase } from '../supabaseClient';

class BarberRecommendationService {
  
  /**
   * Get real reviews for a barber
   * @param {string} barberId - Barber ID
   * @returns {Promise<Array>} - Array of recent reviews
   */
  async getBarberReviews(barberId) {
    try {
      const { data: reviews, error } = await supabase
        .from('appointments')
        .select(`
          customer_rating,
          review_text,
          customer_feedback,
          customer:customer_id(full_name),
          appointment_date,
          created_at
        `)
        .eq('barber_id', barberId)
        .not('customer_rating', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return reviews || [];
    } catch (error) {
      console.error('Error fetching barber reviews:', error);
      return [];
    }
  }

  /**
   * Get barber recommendations for a customer
   * @param {string} customerId - Customer ID
   * @param {string} selectedDate - Selected appointment date
   * @param {Array} selectedServices - Selected service IDs
   * @returns {Promise<Array>} - Array of recommended barbers with scores
   */
  async getBarberRecommendations(customerId, selectedDate, selectedServices = []) {
    try {
      console.log('🔍 Getting barber recommendations for customer:', customerId);
      
      // Get all available barbers
      const { data: barbers, error: barbersError } = await supabase
        .from('users')
        .select('id, full_name, average_rating, total_ratings, barber_status')
        .eq('role', 'barber')
        .eq('barber_status', 'available');

      if (barbersError) throw barbersError;

      // Get customer's appointment history
      const { data: customerHistory, error: historyError } = await supabase
        .from('appointments')
        .select('barber_id, customer_rating, status, appointment_date')
        .eq('customer_id', customerId)
        .in('status', ['completed', 'done']);

      if (historyError) throw historyError;

      // Get today's queue status for each barber
      const { data: todayAppointments, error: queueError } = await supabase
        .from('appointments')
        .select('barber_id, status, queue_position')
        .eq('appointment_date', selectedDate)
        .in('status', ['scheduled', 'ongoing', 'pending']);

      if (queueError) throw queueError;

      // Get reviews for each barber
      const barbersWithReviews = await Promise.all(
        barbers.map(async (barber) => {
          const reviews = await this.getBarberReviews(barber.id);
          return { 
            ...barber, 
            reviews,
            average_rating: barber.total_ratings > 0 ? barber.average_rating : 0.0
          };
        })
      );

      // Calculate recommendations
      const recommendations = this.calculateRecommendations(
        barbersWithReviews,
        customerHistory || [],
        todayAppointments || [],
        selectedServices
      );

      console.log('✅ Barber recommendations calculated:', recommendations.length);
      return recommendations;

    } catch (error) {
      console.error('❌ Error getting barber recommendations:', error);
      return [];
    }
  }

  /**
   * Calculate barber recommendations based on multiple factors
   * @param {Array} barbers - Available barbers
   * @param {Array} customerHistory - Customer's appointment history
   * @param {Array} todayAppointments - Today's appointments
   * @param {Array} selectedServices - Selected services
   * @returns {Array} - Sorted recommendations
   */
  calculateRecommendations(barbers, customerHistory, todayAppointments, selectedServices) {
    const recommendations = barbers.map(barber => {
      let score = 0;
      const reasons = [];

      // 1. Customer History Score (40% weight)
      const customerAppointments = customerHistory.filter(apt => apt.barber_id === barber.id);
      if (customerAppointments.length > 0) {
        const avgRating = customerAppointments.reduce((sum, apt) => sum + (apt.customer_rating || 3), 0) / customerAppointments.length;
        const historyScore = (avgRating / 5) * 40;
        score += historyScore;
        reasons.push(`Previous experience: ${avgRating.toFixed(1)}/5 stars`);
      } else {
        // New barber bonus
        score += 10;
        reasons.push('New barber - try something different!');
      }

      // 2. Barber Rating Score (30% weight)
      const barberRating = barber.total_ratings > 0 ? barber.average_rating : 0.0;
      const ratingScore = (barberRating / 5) * 30;
      score += ratingScore;
      reasons.push(`Barber rating: ${barberRating.toFixed(1)}/5 (${barber.total_ratings} reviews)`);

      // 3. Availability Score (20% weight)
      const todayBarberAppointments = todayAppointments.filter(apt => apt.barber_id === barber.id);
      const queueCount = todayBarberAppointments.filter(apt => apt.status === 'scheduled').length;
      
      let availabilityScore = 20;
      if (queueCount === 0) {
        availabilityScore = 20;
        reasons.push('No queue - immediate availability');
      } else if (queueCount < 5) {
        availabilityScore = 15;
        reasons.push(`Short queue: ${queueCount} customers`);
      } else if (queueCount < 10) {
        availabilityScore = 10;
        reasons.push(`Medium queue: ${queueCount} customers`);
      } else {
        availabilityScore = 5;
        reasons.push(`Long queue: ${queueCount} customers`);
      }
      score += availabilityScore;

      // 4. Recent Activity Bonus (10% weight)
      const recentAppointments = customerHistory.filter(apt => 
        apt.barber_id === barber.id && 
        new Date(apt.appointment_date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      );
      if (recentAppointments.length > 0) {
        score += 10;
        reasons.push('Recent customer - familiar with your style');
      }

      return {
        barber: barber,
        score: Math.round(score),
        reasons,
        queueCount,
        isRecommended: score >= 70,
        priority: score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'
      };
    });

    // Sort by recommendation score (highest first)
    return recommendations.sort((a, b) => b.score - a.score);
  }

  /**
   * Get top 3 recommended barbers
   * @param {string} customerId - Customer ID
   * @param {string} selectedDate - Selected appointment date
   * @param {Array} selectedServices - Selected service IDs
   * @returns {Promise<Array>} - Top 3 recommended barbers
   */
  async getTopRecommendations(customerId, selectedDate, selectedServices = []) {
    const recommendations = await this.getBarberRecommendations(customerId, selectedDate, selectedServices);
    return recommendations.slice(0, 3);
  }

  /**
   * Rate a barber after appointment
   * @param {string} appointmentId - Appointment ID
   * @param {number} rating - Rating 1-5
   * @param {string} feedback - Optional feedback
   * @returns {Promise<boolean>} - Success status
   */
  async rateBarber(appointmentId, rating, feedback = '') {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({
          customer_rating: rating,
          customer_feedback: feedback || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      console.log('✅ Barber rated successfully');
      return true;
    } catch (error) {
      console.error('❌ Error rating barber:', error);
      return false;
    }
  }
}

export const barberRecommendationService = new BarberRecommendationService();
