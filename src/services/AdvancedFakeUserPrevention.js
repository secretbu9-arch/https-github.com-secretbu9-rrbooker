// services/AdvancedFakeUserPrevention.js
import { supabase } from '../supabaseClient';

class AdvancedFakeUserPrevention {
  constructor() {
    this.rateLimits = {
      registration: { max: 3, window: 3600000 }, // 3 per hour
      login: { max: 5, window: 900000 }, // 5 per 15 minutes
      booking: { max: 10, window: 3600000 } // 10 per hour
    };
    
    this.deviceFingerprint = {
      enabled: true,
      trackingFields: ['userAgent', 'language', 'timezone', 'screenResolution']
    };
    
    this.behavioralAnalysis = {
      enabled: true,
      suspiciousPatterns: [
        'rapid_registrations',
        'identical_data_patterns',
        'bot_like_behavior',
        'suspicious_timing'
      ]
    };
  }

  /**
   * CAPTCHA Integration
   */
  async verifyCaptcha(captchaToken) {
    try {
      // Google reCAPTCHA v3 verification
      const response = await fetch('/api/verify-captcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: captchaToken })
      });
      
      const result = await response.json();
      return result.success && result.score > 0.5; // Score > 0.5 is human-like
    } catch (error) {
      console.error('CAPTCHA verification failed:', error);
      return false;
    }
  }

  /**
   * Device Fingerprinting
   */
  generateDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
    
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      colorDepth: window.screen.colorDepth,
      canvasFingerprint: canvas.toDataURL(),
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      hardwareConcurrency: navigator.hardwareConcurrency,
      maxTouchPoints: navigator.maxTouchPoints,
      webglVendor: this.getWebGLVendor(),
      webglRenderer: this.getWebGLRenderer()
    };
    
    return this.hashFingerprint(fingerprint);
  }

  getWebGLVendor() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return gl ? gl.getParameter(gl.VENDOR) : 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  getWebGLRenderer() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return gl ? gl.getParameter(gl.RENDERER) : 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  hashFingerprint(fingerprint) {
    const str = JSON.stringify(fingerprint);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Rate Limiting
   */
  async checkRateLimit(userId, action, ipAddress = null) {
    try {
      const limit = this.rateLimits[action];
      if (!limit) return { allowed: true };

      const now = Date.now();
      const windowStart = now - limit.window;

      // Check database for recent attempts
      const { data: recentAttempts } = await supabase
        .from('rate_limit_logs')
        .select('*')
        .or(`user_id.eq.${userId},ip_address.eq.${ipAddress}`)
        .eq('action', action)
        .gte('created_at', new Date(windowStart).toISOString());

      const attemptCount = recentAttempts?.length || 0;

      if (attemptCount >= limit.max) {
        // Log the rate limit violation
        await this.logRateLimitViolation(userId, action, ipAddress, attemptCount);
        return { 
          allowed: false, 
          reason: 'rate_limit_exceeded',
          retryAfter: Math.ceil((recentAttempts[0]?.created_at - windowStart) / 1000)
        };
      }

      // Log this attempt
      await this.logRateLimitAttempt(userId, action, ipAddress);

      return { allowed: true, remaining: limit.max - attemptCount - 1 };
    } catch (error) {
      console.error('Rate limit check failed:', error);
      return { allowed: true }; // Fail open
    }
  }

  /**
   * IP Address Analysis
   */
  async analyzeIPAddress(ipAddress) {
    try {
      // Check if IP is in known VPN/Proxy databases
      const vpnCheck = await this.checkVPNProxy(ipAddress);
      
      // Check geographic location
      const geoData = await this.getGeoLocation(ipAddress);
      
      // Check for suspicious patterns
      const suspiciousPatterns = await this.checkSuspiciousIPPatterns(ipAddress);
      
      return {
        isVPN: vpnCheck.isVPN,
        isProxy: vpnCheck.isProxy,
        country: geoData.country,
        city: geoData.city,
        isp: geoData.isp,
        suspiciousPatterns,
        riskScore: this.calculateIPRiskScore(vpnCheck, geoData, suspiciousPatterns)
      };
    } catch (error) {
      console.error('IP analysis failed:', error);
      return { riskScore: 0 };
    }
  }

  async checkVPNProxy(ipAddress) {
    // This would integrate with services like:
    // - IPQualityScore
    // - ProxyCheck
    // - IPHub
    // For now, return mock data
    return {
      isVPN: false,
      isProxy: false,
      confidence: 0.8
    };
  }

  async getGeoLocation(ipAddress) {
    try {
      const response = await fetch(`https://ipapi.co/${ipAddress}/json/`);
      const data = await response.json();
      return {
        country: data.country_name,
        city: data.city,
        isp: data.org,
        timezone: data.timezone
      };
    } catch (error) {
      return { country: 'Unknown', city: 'Unknown', isp: 'Unknown' };
    }
  }

  async checkSuspiciousIPPatterns(ipAddress) {
    try {
      // Check for recent registrations from same IP
      const { data: recentRegistrations } = await supabase
        .from('users')
        .select('id, created_at')
        .eq('ip_address', ipAddress)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      return {
        recentRegistrations: recentRegistrations?.length || 0,
        isHighVolume: (recentRegistrations?.length || 0) > 5,
        isSuspicious: (recentRegistrations?.length || 0) > 10
      };
    } catch (error) {
      return { recentRegistrations: 0, isHighVolume: false, isSuspicious: false };
    }
  }

  calculateIPRiskScore(vpnCheck, geoData, suspiciousPatterns) {
    let score = 0;
    
    if (vpnCheck.isVPN) score += 30;
    if (vpnCheck.isProxy) score += 25;
    if (suspiciousPatterns.isHighVolume) score += 20;
    if (suspiciousPatterns.isSuspicious) score += 40;
    
    return Math.min(score, 100);
  }

  /**
   * Behavioral Analysis
   */
  async analyzeUserBehavior(userId, action, metadata = {}) {
    try {
      const behaviors = [];
      
      // Check for rapid actions
      const rapidActions = await this.checkRapidActions(userId, action);
      if (rapidActions.isRapid) {
        behaviors.push({
          type: 'rapid_actions',
          severity: 'high',
          details: rapidActions
        });
      }
      
      // Check for bot-like patterns
      const botPatterns = await this.checkBotPatterns(userId, metadata);
      if (botPatterns.isBotLike) {
        behaviors.push({
          type: 'bot_like_behavior',
          severity: 'high',
          details: botPatterns
        });
      }
      
      // Check for suspicious timing
      const timingAnalysis = this.analyzeTiming(metadata);
      if (timingAnalysis.isSuspicious) {
        behaviors.push({
          type: 'suspicious_timing',
          severity: 'medium',
          details: timingAnalysis
        });
      }
      
      return {
        behaviors,
        riskScore: this.calculateBehaviorRiskScore(behaviors),
        isSuspicious: behaviors.some(b => b.severity === 'high')
      };
    } catch (error) {
      console.error('Behavioral analysis failed:', error);
      return { behaviors: [], riskScore: 0, isSuspicious: false };
    }
  }

  async checkRapidActions(userId, action) {
    const now = Date.now();
    const timeWindow = 60000; // 1 minute
    
    const { data: recentActions } = await supabase
      .from('user_behavior_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('action', action)
      .gte('created_at', new Date(now - timeWindow).toISOString());
    
    return {
      isRapid: (recentActions?.length || 0) > 5,
      actionCount: recentActions?.length || 0,
      timeWindow: timeWindow
    };
  }

  async checkBotPatterns(userId, metadata) {
    const patterns = [];
    
    // Check for identical form submission times
    if (metadata.formSubmissionTime) {
      const { data: similarSubmissions } = await supabase
        .from('user_behavior_logs')
        .select('*')
        .eq('action', 'form_submission')
        .eq('metadata->formSubmissionTime', metadata.formSubmissionTime)
        .gte('created_at', new Date(Date.now() - 3600000).toISOString());
      
      if ((similarSubmissions?.length || 0) > 3) {
        patterns.push('identical_submission_times');
      }
    }
    
    // Check for lack of mouse movement
    if (metadata.mouseMovements === 0) {
      patterns.push('no_mouse_movement');
    }
    
    // Check for perfect form completion speed
    if (metadata.formCompletionTime && metadata.formCompletionTime < 2000) {
      patterns.push('too_fast_completion');
    }
    
    return {
      isBotLike: patterns.length > 0,
      patterns,
      confidence: patterns.length / 3
    };
  }

  analyzeTiming(metadata) {
    const now = new Date();
    const hour = now.getHours();
    
    // Suspicious if registering at unusual hours (2-6 AM)
    const isUnusualHour = hour >= 2 && hour <= 6;
    
    // Suspicious if registering on weekends (for business apps)
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    
    return {
      isSuspicious: isUnusualHour || isWeekend,
      hour,
      isWeekend,
      isUnusualHour
    };
  }

  calculateBehaviorRiskScore(behaviors) {
    let score = 0;
    
    behaviors.forEach(behavior => {
      switch (behavior.severity) {
        case 'high': score += 40; break;
        case 'medium': score += 20; break;
        case 'low': score += 10; break;
      }
    });
    
    return Math.min(score, 100);
  }

  /**
   * Social Media Verification
   */
  async verifySocialMedia(provider, accessToken) {
    try {
      const verificationData = await this.fetchSocialProfile(provider, accessToken);
      
      return {
        verified: true,
        profile: verificationData,
        riskScore: this.calculateSocialRiskScore(verificationData)
      };
    } catch (error) {
      return {
        verified: false,
        error: error.message,
        riskScore: 50 // Medium risk if verification fails
      };
    }
  }

  async fetchSocialProfile(provider, accessToken) {
    const endpoints = {
      google: 'https://www.googleapis.com/oauth2/v2/userinfo',
      facebook: 'https://graph.facebook.com/me?fields=id,name,email,verified',
      twitter: 'https://api.twitter.com/1.1/account/verify_credentials.json'
    };
    
    const response = await fetch(endpoints[provider], {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    return await response.json();
  }

  calculateSocialRiskScore(profile) {
    let score = 0;
    
    // Lower risk for verified accounts
    if (profile.verified) score -= 20;
    
    // Lower risk for accounts with profile pictures
    if (profile.picture) score -= 10;
    
    // Lower risk for accounts with many followers/friends
    if (profile.followers_count > 100) score -= 15;
    
    return Math.max(score, 0);
  }

  /**
   * Phone Number Verification
   */
  async verifyPhoneNumber(phoneNumber) {
    try {
      // This would integrate with services like:
      // - Twilio Verify
      // - Firebase Phone Auth
      // - AWS SNS
      
      // For now, return mock verification
      return {
        verified: true,
        carrier: 'Unknown',
        country: 'Unknown',
        riskScore: 0
      };
    } catch (error) {
      return {
        verified: false,
        error: error.message,
        riskScore: 30
      };
    }
  }

  /**
   * Email Domain Analysis
   */
  async analyzeEmailDomain(email) {
    const domain = email.split('@')[1];
    
    try {
      // Check domain age
      const domainAge = await this.getDomainAge(domain);
      
      // Check domain reputation
      const reputation = await this.getDomainReputation(domain);
      
      // Check for disposable email services
      const isDisposable = await this.checkDisposableEmail(domain);
      
      return {
        domain,
        age: domainAge,
        reputation,
        isDisposable,
        riskScore: this.calculateDomainRiskScore(domainAge, reputation, isDisposable)
      };
    } catch (error) {
      return {
        domain,
        riskScore: 20 // Default medium risk
      };
    }
  }

  async getDomainAge(domain) {
    // This would use WHOIS data or domain age APIs
    // For now, return mock data
    return {
      years: 5,
      isNew: false
    };
  }

  async getDomainReputation(domain) {
    // This would check against reputation databases
    return {
      score: 0.8, // 0-1 scale
      isBlacklisted: false
    };
  }

  async checkDisposableEmail(domain) {
    const disposableDomains = [
      '10minutemail.com', 'tempmail.org', 'guerrillamail.com',
      'mailinator.com', 'yopmail.com', 'temp-mail.org',
      'throwaway.email', 'getnada.com', 'maildrop.cc'
    ];
    
    return disposableDomains.includes(domain.toLowerCase());
  }

  calculateDomainRiskScore(age, reputation, isDisposable) {
    let score = 0;
    
    if (isDisposable) score += 50;
    if (age.isNew) score += 20;
    if (reputation.score < 0.5) score += 30;
    if (reputation.isBlacklisted) score += 40;
    
    return Math.min(score, 100);
  }

  /**
   * Logging Functions
   */
  async logRateLimitAttempt(userId, action, ipAddress) {
    try {
      await supabase.from('rate_limit_logs').insert({
        user_id: userId,
        action,
        ip_address: ipAddress,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to log rate limit attempt:', error);
    }
  }

  async logRateLimitViolation(userId, action, ipAddress, attemptCount) {
    try {
      await supabase.from('security_violations').insert({
        user_id: userId,
        violation_type: 'rate_limit_exceeded',
        action,
        ip_address: ipAddress,
        details: { attemptCount },
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to log rate limit violation:', error);
    }
  }

  async logBehavioralAnalysis(userId, analysis) {
    try {
      await supabase.from('user_behavior_logs').insert({
        user_id: userId,
        action: 'behavioral_analysis',
        metadata: analysis,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to log behavioral analysis:', error);
    }
  }

  /**
   * Comprehensive Risk Assessment
   */
  async performComprehensiveRiskAssessment(userData, metadata = {}) {
    try {
      const assessments = await Promise.all([
        this.analyzeEmailDomain(userData.email),
        this.analyzeIPAddress(metadata.ipAddress),
        this.analyzeUserBehavior(userData.userId, 'registration', metadata),
        this.verifyPhoneNumber(userData.phone)
      ]);

      const [emailAnalysis, ipAnalysis, behaviorAnalysis, phoneAnalysis] = assessments;

      const totalRiskScore = (
        emailAnalysis.riskScore * 0.3 +
        ipAnalysis.riskScore * 0.25 +
        behaviorAnalysis.riskScore * 0.25 +
        phoneAnalysis.riskScore * 0.2
      );

      return {
        totalRiskScore: Math.round(totalRiskScore),
        riskLevel: this.determineRiskLevel(totalRiskScore),
        assessments: {
          email: emailAnalysis,
          ip: ipAnalysis,
          behavior: behaviorAnalysis,
          phone: phoneAnalysis
        },
        recommendations: this.generateAdvancedRecommendations(totalRiskScore, assessments),
        isSuspicious: totalRiskScore >= 60
      };
    } catch (error) {
      console.error('Comprehensive risk assessment failed:', error);
      return {
        totalRiskScore: 0,
        riskLevel: 'unknown',
        isSuspicious: false,
        error: error.message
      };
    }
  }

  determineRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'very_low';
  }

  generateAdvancedRecommendations(score, assessments) {
    const recommendations = [];
    
    if (score >= 80) {
      recommendations.push('Immediate manual review required');
      recommendations.push('Block registration and flag for investigation');
    } else if (score >= 60) {
      recommendations.push('Require additional verification');
      recommendations.push('Implement CAPTCHA challenge');
      recommendations.push('Monitor user behavior closely');
    } else if (score >= 40) {
      recommendations.push('Require email verification');
      recommendations.push('Implement phone verification');
    } else if (score >= 20) {
      recommendations.push('Standard verification process');
    } else {
      recommendations.push('Low risk - standard processing');
    }
    
    return recommendations;
  }
}

export const advancedFakeUserPrevention = new AdvancedFakeUserPrevention();
export default advancedFakeUserPrevention;
