import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';

const RatingForm = ({ appointment, onRatingSubmitted, onCancel }) => {
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('Submitting rating for appointment:', appointment.id);
      console.log('Rating:', rating);
      console.log('Review:', review);

      // Update the appointment with rating
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          customer_rating: rating,
          review_text: review.trim() || null,
          is_reviewed: true,
          rating_created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointment.id);

      if (updateError) {
        console.error('Error updating appointment:', updateError);
        throw updateError;
      }

      console.log('Appointment rating updated successfully');

      // Update barber's average rating
      const { data: barberData, error: barberError } = await supabase
        .from('users')
        .select('average_rating, total_ratings')
        .eq('id', appointment.barber_id)
        .single();

      if (barberError) {
        console.error('Error fetching barber data:', barberError);
        // Don't throw here, rating was saved successfully
      } else if (barberData) {
        const currentTotal = barberData.total_ratings || 0;
        const currentAverage = barberData.average_rating || 0;
        
        const newTotal = currentTotal + 1;
        const newAverage = ((currentAverage * currentTotal) + rating) / newTotal;

        const { error: barberUpdateError } = await supabase
          .from('users')
          .update({
            average_rating: Math.round(newAverage * 100) / 100,
            total_ratings: newTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', appointment.barber_id);

        if (barberUpdateError) {
          console.error('Error updating barber rating:', barberUpdateError);
          // Don't throw here, appointment rating was saved
        } else {
          console.log('Barber rating updated successfully');
        }
      }

      // Call success callback
      onRatingSubmitted();
      
    } catch (err) {
      console.error('Error submitting rating:', err);
      setError('Failed to submit rating. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border rounded p-3 bg-light">
      <div className="d-flex align-items-center mb-3">
        <i className="bi bi-star-fill text-warning me-2"></i>
        <h6 className="mb-0">Rate Your Experience</h6>
      </div>
      <div>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="alert alert-danger">
              <i className="bi bi-exclamation-triangle me-2"></i>
              {error}
            </div>
          )}

          <div className="mb-3">
            <label className="form-label fw-bold">How was your experience?</label>
            <div className="d-flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`btn btn-outline-warning p-2 ${
                    star <= rating ? 'btn-warning text-white' : ''
                  }`}
                  onClick={() => setRating(star)}
                  disabled={loading}
                  style={{ minWidth: '45px', height: '45px' }}
                >
                  <i className={`bi bi-star-fill ${star <= rating ? '' : 'text-muted'}`}></i>
                </button>
              ))}
            </div>
            <small className="text-muted">
              {rating === 0 && 'Select a rating'}
              {rating === 1 && 'Poor - Very dissatisfied'}
              {rating === 2 && 'Fair - Somewhat dissatisfied'}
              {rating === 3 && 'Good - Satisfied'}
              {rating === 4 && 'Very Good - Very satisfied'}
              {rating === 5 && 'Excellent - Extremely satisfied'}
            </small>
          </div>

          <div className="mb-3">
            <label htmlFor="review" className="form-label fw-bold">
              Share your experience (Optional)
            </label>
            <textarea
              id="review"
              className="form-control"
              rows="3"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Tell others about your experience with this barber..."
              disabled={loading}
              maxLength="500"
            />
            <small className="text-muted">
              {review.length}/500 characters
            </small>
          </div>

          <div className="d-flex gap-2">
            <button
              type="submit"
              className="btn btn-warning"
              disabled={rating === 0 || loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                  Submitting...
                </>
              ) : (
                <>
                  <i className="bi bi-check-circle me-2"></i>
                  Submit Rating
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onCancel}
              disabled={loading}
            >
              <i className="bi bi-x-circle me-2"></i>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RatingForm;
