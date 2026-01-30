# Send Booking Email Edge Function

This Supabase Edge Function handles sending emails for the booking system, including OTP verification codes for "Book A Child" feature.

## Email Service Options

This function supports multiple email service providers. Choose one of the following:

### Option 1: Mailgun (Recommended - Free Tier Available)
- **Free Tier**: 100 emails/day for 3 months
- **Setup**: Sign up at [Mailgun](https://www.mailgun.com/)
- **Required**: `MAILGUN_API_KEY` and `MAILGUN_DOMAIN`

### Option 2: SendGrid (Popular Choice)
- **Free Tier**: 100 emails/day
- **Setup**: Sign up at [SendGrid](https://sendgrid.com/)
- **Required**: `SENDGRID_API_KEY`

### Option 3: Gmail (Free but Requires OAuth Setup)
- **Free**: Unlimited emails (within Gmail limits)
- **Setup**: Requires OAuth2 setup in Google Cloud Console
- **Required**: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

## Setup Instructions

### Step 1: Choose an Email Service

Select one of the email services above and sign up for an account.

### Step 2: Configure Environment Variables in Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions** → **Settings** → **Secrets**
3. Add the environment variables based on your chosen service:

#### For Mailgun:
   - `MAILGUN_API_KEY`: Your Mailgun API key (required)
   - `MAILGUN_DOMAIN`: Your Mailgun domain (required)
   - `FROM_EMAIL`: Your sender email (optional, defaults to `noreply@yourdomain.com`)
   - `FROM_NAME`: Display name for emails (optional, defaults to `R&R Booker`)

#### For SendGrid:
   - `SENDGRID_API_KEY`: Your SendGrid API key (required)
   - `FROM_EMAIL`: Your sender email (optional)
   - `FROM_NAME`: Display name for emails (optional, defaults to `R&R Booker`)

#### For Gmail:
   - `GMAIL_CLIENT_ID`: Your Google OAuth client ID (required)
   - `GMAIL_CLIENT_SECRET`: Your Google OAuth client secret (required)
   - `GMAIL_REFRESH_TOKEN`: Your Gmail refresh token (required)
   - `FROM_EMAIL`: Your Gmail address (optional)
   - `FROM_NAME`: Display name for emails (optional, defaults to `R&R Booker`)

### Step 3: Deploy the Edge Function

```bash
# Install Supabase CLI if you haven't already
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy the function
supabase functions deploy send-booking-email
```

### Step 4: Test the Function

You can test the function by sending a test request:

```bash
curl -X POST https://your-project-ref.supabase.co/functions/v1/send-booking-email \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "booking_confirmation_code",
    "customer": {
      "email": "test@example.com",
      "full_name": "Test User"
    },
    "confirmation_code": "123456",
    "metadata": {
      "friendName": "Child Name",
      "expiresAt": "2024-01-01T12:00:00Z"
    }
  }'
```

## Email Types Supported

- `booking_confirmation_code`: OTP verification code for friend/child bookings
- `booking_confirmation`: Standard booking confirmation
- `status_update`: Appointment status updates (cancelled, etc.)
- `appointment_reminder`: Appointment reminders
- `queue_notification`: Queue position updates

## Troubleshooting

### Emails not being sent

1. **Check Email Service Configuration**: Make sure your chosen email service credentials are set correctly in Supabase Edge Functions secrets
2. **Check From Email**: Ensure your sender email is verified/authorized in your email service
3. **Check Logs**: View Edge Function logs in Supabase dashboard for error messages
4. **Check Console**: Check browser console for error messages when sending OTP

### OTP Code not received

1. Check spam folder
2. Verify email address is correct
3. Check Supabase Edge Function logs
4. Verify your email service API key/credentials are valid and have sending permissions
5. Check your email service dashboard for delivery status

### Service-Specific Issues

#### Mailgun
- Verify your domain is verified in Mailgun dashboard
- Check API key permissions
- Ensure you haven't exceeded free tier limits

#### SendGrid
- Verify sender email is authenticated in SendGrid
- Check API key permissions
- Ensure you haven't exceeded free tier limits

#### Gmail
- Verify OAuth credentials are correct
- Check refresh token is valid and not expired
- Ensure Gmail API is enabled in Google Cloud Console
- Verify the Gmail account has permission to send emails

## Fallback Behavior

If no email service is configured, the function will:
- Log the email details to the console
- Return an error response for OTP emails
- Display warnings in the browser console

This ensures users know emails cannot be sent until an email service is configured.

## Production Checklist

- [ ] Email service is chosen and configured (Mailgun, SendGrid, or Gmail)
- [ ] Email service API keys/credentials are configured in Supabase Edge Functions secrets
- [ ] From email address is verified/authorized in your email service
- [ ] Edge function is deployed
- [ ] Test email is sent successfully
- [ ] OTP emails are received by users
- [ ] Email service limits are monitored (free tiers have daily limits)

