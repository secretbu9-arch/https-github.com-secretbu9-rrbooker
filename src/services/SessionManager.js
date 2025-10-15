// services/SessionManager.js
import { supabase } from '../supabaseClient';

class SessionManager {
  constructor() {
    this.timeout = null;
    this.warningTimeout = null;
    this.inactivityPeriod = 30 * 60 * 1000; // 30 minutes
    this.warningPeriod = 5 * 60 * 1000; // 5 minutes before logout
  }

  // Initialize session management
  initialize() {
    // Start activity tracking
    this.startActivityTracking();

    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        this.resetInactivityTimer();
      }
    });

    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        this.resetInactivityTimer();
      } else if (event === 'SIGNED_OUT') {
        this.clearTimers();
      }
    });
  }

  // Start tracking user activity
  startActivityTracking() {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    
    events.forEach(event => {
      document.addEventListener(event, () => {
        this.resetInactivityTimer();
      });
    });
  }

  // Reset the inactivity timer
  resetInactivityTimer() {
    this.clearTimers();

    // Set warning timer (5 minutes before logout)
    this.warningTimeout = setTimeout(() => {
      this.showLogoutWarning();
    }, this.inactivityPeriod - this.warningPeriod);

    // Set logout timer
    this.timeout = setTimeout(() => {
      this.handleInactiveLogout();
    }, this.inactivityPeriod);
  }

  // Clear all timers
  clearTimers() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
      this.warningTimeout = null;
    }
  }

  // Show logout warning modal
  showLogoutWarning() {
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'modal fade show';
    modal.style.display = 'block';
    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    modal.setAttribute('tabindex', '-1');
    
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Session Expiring</h5>
          </div>
          <div class="modal-body">
            <p>Your session will expire in 5 minutes due to inactivity.</p>
            <div class="text-center mb-3">
              <h3 id="countdown">5:00</h3>
            </div>
            <p>Click "Stay Logged In" to continue your session.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="logout-now">Logout Now</button>
            <button type="button" class="btn btn-primary" id="stay-logged-in">Stay Logged In</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Start countdown
    let timeLeft = 300; // 5 minutes in seconds
    const countdownEl = document.getElementById('countdown');
    
    const countdownInterval = setInterval(() => {
      timeLeft--;
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;
      countdownEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    // Handle button clicks
    document.getElementById('stay-logged-in').onclick = () => {
      clearInterval(countdownInterval);
      modal.remove();
      this.resetInactivityTimer();
    };

    document.getElementById('logout-now').onclick = () => {
      clearInterval(countdownInterval);
      modal.remove();
      this.handleInactiveLogout();
    };

    // Auto-close on outside click
    modal.onclick = (e) => {
      if (e.target === modal) {
        clearInterval(countdownInterval);
        modal.remove();
        this.resetInactivityTimer();
      }
    };
  }

  // Handle logout due to inactivity
  async handleInactiveLogout() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Log the auto-logout event
      if (user) {
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: 'auto_logout',
          details: { reason: 'inactivity' }
        });
      }

      // Sign out user
      await supabase.auth.signOut();

      // Show logout notification
      this.showLogoutNotification();

      // Redirect to login page
      window.location.href = '/login';
    } catch (error) {
      console.error('Error during auto-logout:', error);
    }
  }

  // Show logout notification
  showLogoutNotification() {
    // Create notification
    const notification = document.createElement('div');
    notification.className = 'alert alert-warning alert-dismissible fade show position-fixed';
    notification.style.top = '20px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.zIndex = '9999';
    notification.style.minWidth = '400px';
    
    notification.innerHTML = `
      <h6 class="alert-heading">Session Expired</h6>
      <p class="mb-0">You have been logged out due to inactivity. Please log in again to continue.</p>
      <button type="button" class="btn-close" aria-label="Close" onclick="this.parentElement.remove()"></button>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 10000);
  }

  // Manually extend session
  async extendSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Refresh the session
        const { data: { session: newSession }, error } = await supabase.auth.refreshSession();
        
        if (error) throw error;
        
        // Reset inactivity timer
        this.resetInactivityTimer();
        
        return newSession;
      }
    } catch (error) {
      console.error('Error extending session:', error);
      throw error;
    }
  }

  // Get time until logout
  getTimeUntilLogout() {
    if (!this.timeout) return 0;
    
    const currentTime = Date.now();
    const logoutTime = this.timeout._idleStart + this.timeout._idleTimeout;
    
    return Math.max(0, logoutTime - currentTime);
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();