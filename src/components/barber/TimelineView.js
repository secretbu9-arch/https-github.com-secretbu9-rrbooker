// components/barber/TimelineView.js
import React, { useState, useEffect } from 'react';
import SmartTimelineService from '../../services/SmartTimelineService';
import LoadingSpinner from '../common/LoadingSpinner';
import '../../styles/timeline-view.css';

const TimelineView = ({ barberId, selectedDate, onAppointmentClick }) => {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (barberId && selectedDate) {
      fetchTimeline();
    }
  }, [barberId, selectedDate]);

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      setError(null);

      const dateString = typeof selectedDate === 'string' 
        ? selectedDate 
        : `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

      const result = await SmartTimelineService.getUnifiedTimeline(barberId, dateString);
      setTimeline(result);

      console.log('📊 Timeline loaded:', result);
    } catch (err) {
      console.error('Error loading timeline:', err);
      setError('Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  const getBlockColor = (type, status) => {
    if (type === 'scheduled') {
      switch (status) {
        case 'ongoing': return '#28a745';
        case 'scheduled': return '#007bff';
        case 'pending': return '#ffc107';
        default: return '#6c757d';
      }
    } else if (type === 'queue') {
      return '#17a2b8';
    } else if (type === 'lunch') {
      return '#fd7e14';
    } else if (type === 'gap') {
      return '#f8f9fa';
    }
    return '#e9ecef';
  };

  const getBlockIcon = (type, status) => {
    if (type === 'scheduled') {
      return status === 'ongoing' ? '🟢' : '📅';
    } else if (type === 'queue') {
      return '👥';
    } else if (type === 'lunch') {
      return '🍽️';
    } else if (type === 'gap') {
      return '⏰';
    }
    return '📋';
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${period}`;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="alert alert-danger">
        <i className="bi bi-exclamation-triangle me-2"></i>
        {error}
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className="alert alert-info">
        <i className="bi bi-info-circle me-2"></i>
        No timeline data available
      </div>
    );
  }

  return (
    <div className="timeline-view">
      {/* Timeline Summary */}
      <div className="timeline-summary mb-4">
        <div className="row g-3">
          <div className="col-6 col-md-3">
            <div className="stat-card">
              <div className="stat-icon scheduled">📅</div>
              <div className="stat-value">{timeline.summary.totalScheduled}</div>
              <div className="stat-label">Scheduled</div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="stat-card">
              <div className="stat-icon queue">👥</div>
              <div className="stat-value">{timeline.summary.totalQueue}</div>
              <div className="stat-label">In Queue</div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="stat-card">
              <div className="stat-icon gap">⏰</div>
              <div className="stat-value">{timeline.summary.totalGapTime}m</div>
              <div className="stat-label">Available Time</div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="stat-card">
              <div className={`stat-icon ${timeline.summary.queueFitsInGaps.fits ? 'success' : 'warning'}`}>
                {timeline.summary.queueFitsInGaps.fits ? '✅' : '⚠️'}
              </div>
              <div className="stat-value">
                {timeline.summary.queueFitsInGaps.fits ? 'All Fit' : 'Overflow'}
              </div>
              <div className="stat-label">Queue Status</div>
            </div>
          </div>
        </div>
      </div>

      {/* Conflicts Warning */}
      {timeline.conflicts && timeline.conflicts.length > 0 && (
        <div className="alert alert-warning mb-4">
          <i className="bi bi-exclamation-triangle me-2"></i>
          <strong>⚠️ {timeline.conflicts.length} Conflict(s) Detected</strong>
          <ul className="mb-0 mt-2">
            {timeline.conflicts.map((conflict, idx) => (
              <li key={idx}>
                Overlap between {conflict.block1.type} and {conflict.block2.type} 
                ({conflict.overlapMinutes} minutes)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Timeline Blocks */}
      <div className="timeline-blocks">
        <div className="timeline-header">
          <h5 className="mb-0">
            <i className="bi bi-clock-history me-2"></i>
            Daily Timeline
          </h5>
          <small className="text-muted">
            {formatTime(SmartTimelineService.BUSINESS_HOURS.start)} - {formatTime(SmartTimelineService.BUSINESS_HOURS.end)}
          </small>
        </div>

        <div className="timeline-content">
          {timeline.timeline.map((block, index) => (
            <div
              key={index}
              className={`timeline-block ${block.type} ${block.status || ''}`}
              style={{
                backgroundColor: getBlockColor(block.type, block.status),
                borderLeft: `4px solid ${getBlockColor(block.type, block.status)}`,
                cursor: block.appointment ? 'pointer' : 'default'
              }}
              onClick={() => block.appointment && onAppointmentClick && onAppointmentClick(block.appointment)}
            >
              <div className="block-header">
                <div className="block-time">
                  <span className="block-icon">{getBlockIcon(block.type, block.status)}</span>
                  <strong>{formatTime(block.startTime)}</strong>
                  <span className="text-muted mx-1">→</span>
                  <span>{formatTime(block.endTime)}</span>
                  <span className="badge bg-secondary ms-2">{block.duration}m</span>
                </div>
                <div className="block-type">
                  {block.type === 'scheduled' && <span className="badge bg-primary">SCHEDULED</span>}
                  {block.type === 'queue' && (
                    <span className="badge bg-info">
                      QUEUE #{block.queuePosition}
                    </span>
                  )}
                  {block.type === 'lunch' && <span className="badge bg-warning">LUNCH</span>}
                  {block.type === 'gap' && <span className="badge bg-light text-dark">AVAILABLE</span>}
                </div>
              </div>

              {block.appointment && (
                <div className="block-details mt-2">
                  <div className="customer-name">
                    <i className="bi bi-person-fill me-1"></i>
                    <strong>{block.appointment.customer?.full_name || 'Unknown'}</strong>
                  </div>
                  <div className="service-name text-muted">
                    <i className="bi bi-scissors me-1"></i>
                    {block.appointment.service?.name || 'Service'}
                  </div>
                  {block.estimatedTime && block.type === 'queue' && (
                    <div className="estimated-time text-muted small mt-1">
                      <i className="bi bi-clock me-1"></i>
                      Estimated: {formatTime(block.estimatedTime)}
                    </div>
                  )}
                  {block.appointment.status && (
                    <div className="appointment-status mt-1">
                      <span className={`badge bg-${
                        block.appointment.status === 'ongoing' ? 'success' :
                        block.appointment.status === 'scheduled' ? 'primary' :
                        block.appointment.status === 'pending' ? 'warning' :
                        'secondary'
                      }`}>
                        {block.appointment.status.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {block.type === 'lunch' && (
                <div className="block-details mt-2">
                  <div className="text-center text-white">
                    <i className="bi bi-cup-hot me-2"></i>
                    Lunch Break
                  </div>
                </div>
              )}

              {block.type === 'gap' && (
                <div className="block-details mt-2">
                  <div className="text-center text-muted">
                    <i className="bi bi-hourglass-split me-2"></i>
                    Available for walk-ins or queue
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Queue Fits Status */}
      {!timeline.summary.queueFitsInGaps.fits && (
        <div className="alert alert-warning mt-4">
          <i className="bi bi-exclamation-triangle me-2"></i>
          <strong>Queue Overflow Warning:</strong> Current queue requires {timeline.summary.queueFitsInGaps.totalQueueTime} minutes 
          but only {timeline.summary.queueFitsInGaps.totalGapTime} minutes available. 
          Overflow: {timeline.summary.queueFitsInGaps.overflow} minutes.
        </div>
      )}

      {/* Legend */}
      <div className="timeline-legend mt-4">
        <h6 className="mb-3">Legend:</h6>
        <div className="row g-2">
          <div className="col-6 col-md-3">
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#007bff'}}></div>
              <span>Scheduled (Fixed Time)</span>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#17a2b8'}}></div>
              <span>Queue (Estimated Time)</span>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#fd7e14'}}></div>
              <span>Lunch Break</span>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="legend-item">
              <div className="legend-color" style={{backgroundColor: '#f8f9fa', border: '1px solid #dee2e6'}}></div>
              <span>Available Gap</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimelineView;

