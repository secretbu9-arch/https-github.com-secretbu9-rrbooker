// supabase/functions/send-booking-email/index.ts
// @ts-ignore - Deno import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore - Deno import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deno type declarations
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailPayload {
  appointment?: any
  type: string
  customer?: {
    email: string
    full_name?: string
  }
  confirmation_code?: string
  metadata?: any
  status?: string
  reminderType?: string
  queuePosition?: number
}

// Simple email sending function using HTTP-based services
async function sendEmailViaSMTP(config: {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  from: string
  to: string
  subject: string
  html: string
}): Promise<{ messageId: string }> {
  const messageId = `<${Date.now()}@${config.host || 'email'}>`
  
  // Try different email services in order of preference
  // Option 1: Gmail API (OAuth2) - Prioritized for user preference
  const gmailClientId = Deno.env.get('GMAIL_CLIENT_ID')
  const gmailClientSecret = Deno.env.get('GMAIL_CLIENT_SECRET')
  const gmailRefreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN')
  
  if (gmailClientId && gmailClientSecret && gmailRefreshToken) {
    try {
      console.log('📧 Using Gmail API to send email...', {
        to: config.to,
        subject: config.subject.substring(0, 50) + '...'
      })
      
      // Get access token using refresh token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: gmailClientId,
          client_secret: gmailClientSecret,
          refresh_token: gmailRefreshToken,
          grant_type: 'refresh_token'
        })
      })
      
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        console.error('❌ Gmail token error:', errorData)
        throw new Error(`Failed to get Gmail access token: ${errorData}`)
      }
      
      const tokenData = await tokenResponse.json()
      
      if (!tokenData.access_token) {
        throw new Error('No access token received from Gmail API')
      }
      
      const accessToken = tokenData.access_token
      console.log('✅ Gmail access token obtained')
      
      // Create properly formatted email message for Gmail API
      // Gmail API requires RFC 5322 format with the entire message base64url encoded
      const date = new Date().toUTCString()
      
      // Create email message in RFC 5322 format
      // Note: Subject and other headers might contain non-ASCII characters, so we need to handle encoding
      const emailContent = [
        `Date: ${date}`,
        `From: ${config.from}`,
        `To: ${config.to}`,
        `Subject: ${config.subject}`,  // Gmail API handles UTF-8 in Subject
        `MIME-Version: 1.0`,
        `Content-Type: text/html; charset=UTF-8`,
        ``,
        config.html
      ].join('\r\n')
      
      // Encode the entire message in base64url format (Gmail API requirement)
      // Convert UTF-8 string to base64, then to base64url
      // Note: In Deno, we can use TextEncoder to get UTF-8 bytes, then encode to base64
      const encoder = new TextEncoder()
      const bytes = encoder.encode(emailContent)
      
      // Simple base64 encoding function
      const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      let base64 = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const b1 = bytes[i]
        const b2 = bytes[i + 1] || 0
        const b3 = bytes[i + 2] || 0
        const bitmap = (b1 << 16) | (b2 << 8) | b3
        base64 += base64Chars.charAt((bitmap >> 18) & 63)
        base64 += base64Chars.charAt((bitmap >> 12) & 63)
        if (i + 1 < bytes.length) {
          base64 += base64Chars.charAt((bitmap >> 6) & 63)
        } else {
          base64 += '='
        }
        if (i + 2 < bytes.length) {
          base64 += base64Chars.charAt(bitmap & 63)
        } else {
          base64 += '='
        }
      }
      
      // Convert base64 to base64url (Gmail API requirement)
      const rawMessage = base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      
      console.log('📧 Sending email via Gmail API to:', config.to)
      
      // Send via Gmail API
      const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ raw: rawMessage })
      })
      
      if (!gmailResponse.ok) {
        const errorText = await gmailResponse.text()
        let errorMessage = `Gmail API error (${gmailResponse.status}): ${errorText}`
        
        try {
          const errorJson = JSON.parse(errorText)
          if (errorJson.error) {
            errorMessage = `Gmail API error: ${errorJson.error.message || errorJson.error}`
            
            // Provide helpful error messages for common issues
            if (errorJson.error.message?.includes('insufficient')) {
              errorMessage += '. Please check that Gmail API is enabled and the OAuth scope includes gmail.send'
            } else if (errorJson.error.message?.includes('invalid_grant')) {
              errorMessage += '. Please check that your refresh token is valid and not expired'
            } else if (errorJson.error.message?.includes('unauthorized')) {
              errorMessage += '. Please check your OAuth credentials'
            }
          }
        } catch (e) {
          // Error is not JSON, use text as-is
        }
        
        console.error('❌ Gmail API error:', errorMessage)
        throw new Error(errorMessage)
      }
      
      const gmailData = await gmailResponse.json()
      console.log('✅ Email sent successfully via Gmail API:', {
        messageId: gmailData.id,
        to: config.to,
        subject: config.subject
      })
      return { messageId: gmailData.id || messageId }
    } catch (error) {
      console.error('❌ Gmail API failed:', error)
      throw error
    }
  }
  
  // Option 2: Mailgun (simple HTTP API)
  const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY')
  const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN')
  
  if (mailgunApiKey && mailgunDomain) {
    try {
      const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`
      const formData = new FormData()
      formData.append('from', config.from)
      formData.append('to', config.to)
      formData.append('subject', config.subject)
      formData.append('html', config.html)
      
      const response = await fetch(mailgunUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}`
        },
        body: formData
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Mailgun error: ${error}`)
      }
      
      const data = await response.json()
      return { messageId: data.id || messageId }
    } catch (error) {
      console.error('Mailgun failed:', error)
      throw error
    }
  }
  
  // Option 3: SendGrid (simple HTTP API)
  const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')
  
  if (sendgridApiKey) {
    try {
      const sendgridData = {
        personalizations: [{
          to: [{ email: config.to }]
        }],
        from: { email: config.from },
        subject: config.subject,
        content: [{
          type: 'text/html',
          value: config.html
        }]
      }
      
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sendgridData)
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`SendGrid error: ${error}`)
      }
      
      return { messageId: response.headers.get('x-message-id') || messageId }
    } catch (error) {
      console.error('SendGrid failed:', error)
      throw error
    }
  }
  
  // If no email service is configured, throw an error
  throw new Error(
    'No email service configured. Please configure one of the following:\n' +
    '1. Gmail (Recommended): Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN\n' +
    '   See GMAIL_SETUP.md for detailed setup instructions\n' +
    '2. Mailgun: Set MAILGUN_API_KEY and MAILGUN_DOMAIN\n' +
    '3. SendGrid: Set SENDGRID_API_KEY\n\n' +
    'Note: Direct SMTP is not supported in Deno Edge Functions. Use an HTTP-based email service instead.'
  )
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the request body
    let requestBody
    try {
      requestBody = await req.json()
      console.log('📥 Email request received:', JSON.stringify(requestBody, null, 2))
    } catch (parseError) {
      console.error('❌ Error parsing request body:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected JSON.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    const { appointment, type, customer, confirmation_code, metadata, status, reminderType, queuePosition } = requestBody as EmailPayload

    if (!type) {
      return new Response(
        JSON.stringify({ error: 'Email type is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract email address
    const recipientEmail = customer?.email || appointment?.customer?.email || appointment?.customer_email
    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'Recipient email is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get email service configuration from environment
    // Support multiple email services: Mailgun, SendGrid, Gmail
    const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY')
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN')
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')
    const gmailClientId = Deno.env.get('GMAIL_CLIENT_ID')
    const gmailClientSecret = Deno.env.get('GMAIL_CLIENT_SECRET')
    const gmailRefreshToken = Deno.env.get('GMAIL_REFRESH_TOKEN')
    
    // Get from email and name
    const fromEmail = Deno.env.get('FROM_EMAIL') || Deno.env.get('SMTP_FROM_EMAIL') || 
                      (mailgunDomain ? `noreply@${mailgunDomain}` : 'noreply@example.com')
    const fromName = Deno.env.get('FROM_NAME') || Deno.env.get('SMTP_FROM_NAME') || 'R&R Booker'
    
    // Check if any email service is configured (prioritize Gmail)
    const isEmailServiceConfigured = 
      (gmailClientId && gmailClientSecret && gmailRefreshToken) ||
      (mailgunApiKey && mailgunDomain) || 
      sendgridApiKey
    
    if (!isEmailServiceConfigured) {
      console.error('❌ Email service not configured in environment variables')
      console.error('❌ Please configure one of the following:')
      console.error('   1. Gmail (Recommended): Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN')
      console.error('      See GMAIL_SETUP.md for detailed setup instructions')
      console.error('   2. Mailgun: Set MAILGUN_API_KEY and MAILGUN_DOMAIN')
      console.error('   3. SendGrid: Set SENDGRID_API_KEY')
      console.error('❌ Optional: FROM_EMAIL, FROM_NAME')
      console.error('❌ Email details:', JSON.stringify({ 
        type, 
        recipientEmail, 
        confirmation_code, 
        status, 
        reminderType, 
        queuePosition, 
        metadata 
      }, null, 2))
      
      // For OTP emails, return an error so the user knows the email cannot be sent
      if (type === 'booking_confirmation_code' || type === 'password_reset_otp') {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Email service is not configured. Please configure Gmail, Mailgun, or SendGrid in Supabase Edge Functions secrets. See GMAIL_SETUP.md for Gmail setup instructions.',
            simulated: true
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      // For other email types, return a warning but still success
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email service not configured. Email was not sent.',
          simulated: true
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // Get SMTP-like configuration (for compatibility, but we'll use HTTP APIs)
    const smtpHost = Deno.env.get('SMTP_HOST') || mailgunDomain || 'email-service'
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587')
    const smtpUser = Deno.env.get('SMTP_USER') || fromEmail
    const smtpPassword = Deno.env.get('SMTP_PASSWORD') || ''
    const smtpSecure = Deno.env.get('SMTP_SECURE') === 'true'

    // Prepare email content based on type
    let subject = ''
    let htmlContent = ''

    switch (type) {
      case 'booking_confirmation_code':
        if (!confirmation_code) {
          return new Response(
            JSON.stringify({ error: 'Confirmation code is required for booking_confirmation_code type' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        
        const friendName = metadata?.friendName || customer?.full_name || 'Friend/Child'
        const codeExpiresAt = metadata?.expiresAt ? new Date(metadata.expiresAt).toLocaleString() : '10 minutes'
        
        subject = 'Your Booking Verification Code'
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Verification Code</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
              <h1 style="color: #488AFF; margin-bottom: 20px;">Booking Verification Code</h1>
              
              <p style="font-size: 16px; margin-bottom: 30px;">
                Hello ${friendName},
              </p>
              
              <p style="font-size: 16px; margin-bottom: 20px;">
                A booking verification code has been requested for your appointment.
              </p>
              
              <div style="background-color: #ffffff; border: 2px solid #488AFF; border-radius: 8px; padding: 20px; margin: 30px 0; display: inline-block;">
                <div style="font-size: 32px; font-weight: bold; color: #488AFF; letter-spacing: 5px; font-family: 'Courier New', monospace;">
                  ${confirmation_code}
                </div>
              </div>
              
              <p style="font-size: 14px; color: #666; margin-top: 20px;">
                This code will expire in ${codeExpiresAt}.
              </p>
              
              <p style="font-size: 14px; color: #666; margin-top: 20px;">
                If you did not request this code, please ignore this email.
              </p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              
              <p style="font-size: 12px; color: #999; margin-top: 20px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </body>
          </html>
        `
        break

      case 'booking_confirmation':
        subject = 'Appointment Booking Confirmation'
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Confirmation</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
              <h1 style="color: #488AFF; margin-bottom: 20px;">Appointment Confirmed</h1>
              <p>Your appointment has been successfully booked.</p>
              <!-- Add more booking details here -->
            </div>
          </body>
          </html>
        `
        break

      case 'status_update':
        const statusText = status === 'cancelled' ? 'Cancelled' : status || 'Updated'
        subject = `Appointment ${statusText}`
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Appointment ${statusText}</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
              <h1 style="color: #488AFF; margin-bottom: 20px;">Appointment ${statusText}</h1>
              <p>Your appointment status has been updated to: ${statusText}</p>
            </div>
          </body>
          </html>
        `
        break

      case 'appointment_reminder':
        subject = `Appointment Reminder - ${reminderType || '24 hours'}`
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Appointment Reminder</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
              <h1 style="color: #488AFF; margin-bottom: 20px;">Appointment Reminder</h1>
              <p>This is a reminder about your upcoming appointment.</p>
            </div>
          </body>
          </html>
        `
        break

      case 'queue_notification':
        subject = `Queue Position Update - Position ${queuePosition}`
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Queue Notification</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px;">
              <h1 style="color: #488AFF; margin-bottom: 20px;">Queue Position Update</h1>
              <p>Your position in the queue: ${queuePosition}</p>
            </div>
          </body>
          </html>
        `
        break

      case 'password_reset_otp':
        console.log('📧 Processing password_reset_otp email:', {
          hasConfirmationCode: !!confirmation_code,
          hasCustomer: !!customer,
          customerEmail: customer?.email,
          metadata: metadata
        });
        
        if (!confirmation_code) {
          console.error('❌ Missing confirmation_code for password_reset_otp');
          return new Response(
            JSON.stringify({ error: 'Confirmation code is required for password_reset_otp type' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        
        if (!customer?.email) {
          console.error('❌ Missing customer email for password_reset_otp');
          return new Response(
            JSON.stringify({ error: 'Customer email is required for password_reset_otp type' }),
            { 
              status: 400, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
        
        const passwordResetExpiresAt = metadata?.expiresAt ? new Date(metadata.expiresAt).toLocaleString() : '10 minutes'
        
        subject = 'Your Password Reset Code'
        htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Code</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center;">
              <h1 style="color: #488AFF; margin-bottom: 20px;">Password Reset Code</h1>
              
              <p style="font-size: 16px; margin-bottom: 30px;">
                Hello,
              </p>
              
              <p style="font-size: 16px; margin-bottom: 20px;">
                You have requested to reset your password. Use the code below to complete the process.
              </p>
              
              <div style="background-color: #ffffff; border: 2px solid #488AFF; border-radius: 8px; padding: 20px; margin: 30px 0; display: inline-block;">
                <div style="font-size: 32px; font-weight: bold; color: #488AFF; letter-spacing: 5px; font-family: 'Courier New', monospace;">
                  ${confirmation_code}
                </div>
              </div>
              
              <p style="font-size: 14px; color: #666; margin-top: 20px;">
                This code will expire in ${passwordResetExpiresAt}.
              </p>
              
              <p style="font-size: 14px; color: #666; margin-top: 20px;">
                If you did not request this password reset, please ignore this email and your password will remain unchanged.
              </p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
              
              <p style="font-size: 12px; color: #999; margin-top: 20px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </div>
          </body>
          </html>
        `
        break

      default:
        return new Response(
          JSON.stringify({ error: `Unknown email type: ${type}` }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }

    // Send email via email service (Gmail/Mailgun/SendGrid)
    try {
      console.log('📧 Attempting to send email...', {
        type,
        to: recipientEmail,
        subject,
        hasEmailService: isEmailServiceConfigured
      })
      
      const emailResult = await sendEmailViaSMTP({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        username: smtpUser,
        password: smtpPassword,
        from: `${fromName} <${fromEmail}>`,
        to: recipientEmail,
        subject: subject,
        html: htmlContent,
      })

      console.log('✅ Email sent successfully:', {
        messageId: emailResult.messageId,
        to: recipientEmail,
        type
      })

      return new Response(
        JSON.stringify({
          success: true,
          messageId: emailResult.messageId,
          message: 'Email sent successfully'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } catch (smtpError) {
      console.error('❌ Email sending error:', {
        error: smtpError.message,
        type,
        to: recipientEmail
      })
      
      // For password reset OTP, make sure we throw a clear error
      if (type === 'password_reset_otp') {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to send OTP email: ${smtpError.message || 'Email service error'}. Please check your email service configuration (Gmail, Mailgun, or SendGrid) in Supabase Edge Functions secrets.`,
            simulated: false
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
      
      throw new Error(`Failed to send email: ${smtpError.message || 'Unknown error'}`)
    }

  } catch (error) {
    console.error('❌ Error in send-booking-email function:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

