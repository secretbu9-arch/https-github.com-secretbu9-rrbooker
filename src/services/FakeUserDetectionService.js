// services/FakeUserDetectionService.js
import { supabase } from '../supabaseClient';

class FakeUserDetectionService {
  constructor() {
    this.thresholds = {
      highRisk: 70,    // Block registrations
      mediumRisk: 40,  // Require verification
      lowRisk: 20      // Monitor closely
    };
    
    this.riskFactors = {
      emailRisk: 30,
      phoneRisk: 20,
      nameRisk: 15,
      behaviorRisk: 25,
      deviceRisk: 10
    };
    
    this.suspiciousPatterns = {
      fakeEmailPatterns: [
        /^test\d*@/i,
        /^fake\d*@/i,
        /^dummy\d*@/i,
        /^temp\d*@/i,
        /^demo\d*@/i,
        /^sample\d*@/i,
        /^user\d*@/i,
        /^admin\d*@/i,
        /^guest\d*@/i,
        /^trial\d*@/i
      ],
      
      disposableEmailDomains: [
        '10minutemail.com',
        'tempmail.org',
        'guerrillamail.com',
        'mailinator.com',
        'throwaway.email',
        'temp-mail.org',
        'getnada.com',
        'maildrop.cc',
        'yopmail.com',
        'sharklasers.com'
      ],
      
      fakePhonePatterns: [
        /^1234567890$/,
        /^0000000000$/,
        /^1111111111$/,
        /^2222222222$/,
        /^3333333333$/,
        /^4444444444$/,
        /^5555555555$/,
        /^6666666666$/,
        /^7777777777$/,
        /^8888888888$/,
        /^9999999999$/
      ],
      
      suspiciousNamePatterns: [
        /^test\d*$/i,
        /^fake\d*$/i,
        /^dummy\d*$/i,
        /^user\d*$/i,
        /^admin\d*$/i,
        /^guest\d*$/i,
        /^demo\d*$/i,
        /^sample\d*$/i,
        /^temp\d*$/i,
        /^trial\d*$/i
      ]
    };
  }

  /**
   * Main analysis function for user registration
   */
  async analyzeUserRegistration(userData) {
    try {
      console.log('🔍 Starting fake user analysis for:', userData.email);
      
      const analysis = {
        email: userData.email,
        fullName: userData.fullName,
        phone: userData.phone,
        riskScore: 0,
        riskLevel: 'very_low',
        flags: [],
        recommendations: [],
        isSuspicious: false,
        analysisDate: new Date().toISOString()
      };

      // Analyze email
      const emailAnalysis = this.analyzeEmail(userData.email);
      analysis.riskScore += emailAnalysis.riskScore;
      analysis.flags.push(...emailAnalysis.flags);

      // Analyze phone
      const phoneAnalysis = this.analyzePhone(userData.phone);
      analysis.riskScore += phoneAnalysis.riskScore;
      analysis.flags.push(...phoneAnalysis.flags);

      // Analyze name
      const nameAnalysis = this.analyzeName(userData.fullName);
      analysis.riskScore += nameAnalysis.riskScore;
      analysis.flags.push(...nameAnalysis.flags);

      // Check for duplicate accounts
      const duplicateAnalysis = await this.checkDuplicateAccounts(userData);
      analysis.riskScore += duplicateAnalysis.riskScore;
      analysis.flags.push(...duplicateAnalysis.flags);

      // Determine risk level
      analysis.riskLevel = this.determineRiskLevel(analysis.riskScore);
      analysis.isSuspicious = analysis.riskLevel === 'high' || analysis.riskLevel === 'medium';

      // Generate recommendations
      analysis.recommendations = this.generateRecommendations(analysis);

      // Log analysis to database
      await this.logUserAnalysis(analysis);

      console.log('✅ Analysis complete:', {
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        flags: analysis.flags.length,
        isSuspicious: analysis.isSuspicious
      });

      return analysis;

    } catch (error) {
      console.error('❌ Error in fake user analysis:', error);
      
      // Return safe default analysis
      return {
        email: userData.email,
        fullName: userData.fullName,
        phone: userData.phone,
        riskScore: 0,
        riskLevel: 'very_low',
        flags: ['analysis_error'],
        recommendations: ['Manual review recommended due to analysis error'],
        isSuspicious: false,
        analysisDate: new Date().toISOString(),
        error: error.message
      };
    }
  }

  /**
   * Analyze email for suspicious patterns
   */
  analyzeEmail(email) {
    const analysis = {
      riskScore: 0,
      flags: []
    };

    if (!email || typeof email !== 'string') {
      analysis.flags.push('invalid_email_format');
      analysis.riskScore += this.riskFactors.emailRisk;
      return analysis;
    }

    const emailLower = email.toLowerCase();

    // Check for fake email patterns
    for (const pattern of this.suspiciousPatterns.fakeEmailPatterns) {
      if (pattern.test(emailLower)) {
        analysis.flags.push('suspicious_email_pattern');
        analysis.riskScore += this.riskFactors.emailRisk;
        break;
      }
    }

    // Check for disposable email domains
    const domain = emailLower.split('@')[1];
    if (domain && this.suspiciousPatterns.disposableEmailDomains.includes(domain)) {
      analysis.flags.push('disposable_email');
      analysis.riskScore += this.riskFactors.emailRisk * 0.8;
    }

    // Check for invalid email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      analysis.flags.push('invalid_email_format');
      analysis.riskScore += this.riskFactors.emailRisk * 0.6;
    }

    return analysis;
  }

  /**
   * Analyze phone number for suspicious patterns
   */
  analyzePhone(phone) {
    const analysis = {
      riskScore: 0,
      flags: []
    };

    if (!phone || typeof phone !== 'string') {
      analysis.flags.push('invalid_phone_format');
      analysis.riskScore += this.riskFactors.phoneRisk;
      return analysis;
    }

    // Remove all non-digit characters
    const phoneDigits = phone.replace(/\D/g, '');

    // Check for fake phone patterns
    for (const pattern of this.suspiciousPatterns.fakePhonePatterns) {
      if (pattern.test(phoneDigits)) {
        analysis.flags.push('suspicious_phone_pattern');
        analysis.riskScore += this.riskFactors.phoneRisk;
        break;
      }
    }

    // Check for repeated digits
    if (/(\d)\1{4,}/.test(phoneDigits)) {
      analysis.flags.push('repeated_digits');
      analysis.riskScore += this.riskFactors.phoneRisk * 0.7;
    }

    // Check for invalid phone length
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      analysis.flags.push('invalid_phone_length');
      analysis.riskScore += this.riskFactors.phoneRisk * 0.5;
    }

    return analysis;
  }

  /**
   * Analyze name for suspicious patterns
   */
  analyzeName(name) {
    const analysis = {
      riskScore: 0,
      flags: []
    };

    if (!name || typeof name !== 'string') {
      analysis.flags.push('invalid_name_format');
      analysis.riskScore += this.riskFactors.nameRisk;
      return analysis;
    }

    const nameTrimmed = name.trim();

    // Check for suspicious name patterns
    for (const pattern of this.suspiciousPatterns.suspiciousNamePatterns) {
      if (pattern.test(nameTrimmed)) {
        analysis.flags.push('suspicious_name_pattern');
        analysis.riskScore += this.riskFactors.nameRisk;
        break;
      }
    }

    // Check for very short names
    if (nameTrimmed.length < 2) {
      analysis.flags.push('very_short_name');
      analysis.riskScore += this.riskFactors.nameRisk * 0.8;
    }

    // Check for numeric-only names
    if (/^\d+$/.test(nameTrimmed)) {
      analysis.flags.push('numeric_only_name');
      analysis.riskScore += this.riskFactors.nameRisk * 0.9;
    }

    // Check for excessive special characters
    const specialCharCount = (nameTrimmed.match(/[^a-zA-Z0-9\s]/g) || []).length;
    if (specialCharCount > nameTrimmed.length * 0.3) {
      analysis.flags.push('excessive_special_characters');
      analysis.riskScore += this.riskFactors.nameRisk * 0.6;
    }

    return analysis;
  }

  /**
   * Check for duplicate accounts
   */
  async checkDuplicateAccounts(userData) {
    const analysis = {
      riskScore: 0,
      flags: []
    };

    try {
      // Check for duplicate email
      const { data: emailMatches, error: emailError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', userData.email)
        .limit(1);

      if (emailError) {
        console.error('Error checking duplicate email:', emailError);
        return analysis;
      }

      if (emailMatches && emailMatches.length > 0) {
        analysis.flags.push('duplicate_email');
        analysis.riskScore += this.riskFactors.emailRisk * 0.5;
      }

      // Check for duplicate phone
      const { data: phoneMatches, error: phoneError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', userData.phone)
        .limit(1);

      if (phoneError) {
        console.error('Error checking duplicate phone:', phoneError);
        return analysis;
      }

      if (phoneMatches && phoneMatches.length > 0) {
        analysis.flags.push('duplicate_phone');
        analysis.riskScore += this.riskFactors.phoneRisk * 0.5;
      }

    } catch (error) {
      console.error('Error in duplicate account check:', error);
      analysis.flags.push('duplicate_check_error');
    }

    return analysis;
  }

  /**
   * Determine risk level based on score
   */
  determineRiskLevel(score) {
    if (score >= this.thresholds.highRisk) {
      return 'high';
    } else if (score >= this.thresholds.mediumRisk) {
      return 'medium';
    } else if (score >= this.thresholds.lowRisk) {
      return 'low';
    } else {
      return 'very_low';
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (analysis.riskLevel === 'high') {
      recommendations.push('Block registration - High risk detected');
      recommendations.push('Manual review required');
    } else if (analysis.riskLevel === 'medium') {
      recommendations.push('Require email verification');
      recommendations.push('Monitor user activity closely');
    } else if (analysis.riskLevel === 'low') {
      recommendations.push('Allow registration with monitoring');
    } else {
      recommendations.push('Allow registration - Low risk');
    }

    // Add specific recommendations based on flags
    if (analysis.flags.includes('suspicious_email_pattern')) {
      recommendations.push('Verify email address legitimacy');
    }
    if (analysis.flags.includes('disposable_email')) {
      recommendations.push('Require permanent email address');
    }
    if (analysis.flags.includes('suspicious_phone_pattern')) {
      recommendations.push('Verify phone number legitimacy');
    }
    if (analysis.flags.includes('suspicious_name_pattern')) {
      recommendations.push('Verify name legitimacy');
    }

    return recommendations;
  }

  /**
   * Log user analysis to database
   */
  async logUserAnalysis(analysis) {
    try {
      // Only log suspicious users to avoid cluttering the database
      if (analysis.riskLevel === 'high' || analysis.riskLevel === 'medium') {
        const { error } = await supabase
          .from('fake_user_analysis')
          .insert({
            email: analysis.email,
            full_name: analysis.fullName,
            phone: analysis.phone,
            risk_score: analysis.riskScore,
            risk_level: analysis.riskLevel,
            flags: analysis.flags,
            recommendations: analysis.recommendations,
            analysis_date: analysis.analysisDate,
            ip_address: null, // Could be added if needed
            user_agent: navigator.userAgent || null
          });

        if (error) {
          console.error('Error logging fake user analysis:', error);
        } else {
          console.log('✅ Logged suspicious user analysis to database');
        }
      }
    } catch (error) {
      console.error('Error in logUserAnalysis:', error);
    }
  }
}

// Create and export a singleton instance
export const fakeUserDetectionService = new FakeUserDetectionService();
