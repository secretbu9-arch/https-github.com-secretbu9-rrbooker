# Gmail Email Service Setup Guide

This guide will help you set up Gmail API to send emails from your Supabase Edge Function.

## Prerequisites

1. A Google account (Gmail account)
2. Access to Google Cloud Console
3. A Supabase project with Edge Functions enabled

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "R&R Booker Email")
5. Click "Create"

## Step 2: Enable Gmail API

1. In your Google Cloud project, go to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click on "Gmail API"
4. Click "Enable"

## Step 3: Create OAuth 2.0 Credentials

### Important: Web vs Mobile App OAuth

**For Email Sending (OTP Feature):**
- ✅ **Only Web OAuth credentials are needed**
- The Supabase Edge Function (server-side) uses web OAuth credentials
- Your mobile app calls the Supabase Edge Function, so it doesn't need its own Gmail OAuth
- **One set of web OAuth credentials works for both web and mobile apps**

**If You Need Mobile App OAuth:**
- Android/iOS OAuth credentials are only needed if you want to use Gmail API directly from the mobile app
- For the email sending feature, mobile app OAuth is **not required**
- See "Optional: Mobile App OAuth Setup" section below

### Create Web Application OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" (unless you have a Google Workspace account)
   - Fill in the required fields:
     - App name: "R&R Booker"
     - User support email: Your email
     - Developer contact information: Your email
   - Click "Save and Continue"
   - Add scopes: `https://www.googleapis.com/auth/gmail.send`
   - Click "Save and Continue"
   - Add test users (your Gmail address) if needed
   - Click "Save and Continue"
   - Review and click "Back to Dashboard"

4. Create OAuth Client ID for Web:
   - Application type: **"Web application"**
   - Name: "R&R Booker Email Sender (Web)"
   - Authorized redirect URIs: 
     - `https://developers.google.com/oauthplayground` (for OAuth Playground - **add this!**)
     - `http://localhost:8080` (optional, for local testing)
   - Click "Create"
   - Copy the **Client ID** and **Client Secret** (you'll need these later)

**Note:** These web OAuth credentials will be used by the Supabase Edge Function to send emails. Both your web app and mobile app will use the same edge function, so they don't need separate OAuth credentials.

## Step 4: Get Refresh Token

You need to get a refresh token to authenticate with Gmail API. Here are two methods:

### Method 1: Using OAuth 2.0 Playground (Recommended)

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your **Client ID** and **Client Secret** from Step 3
5. In the left panel, find "Gmail API v1"
6. Select the scope: `https://www.googleapis.com/auth/gmail.send`
7. Click "Authorize APIs"
8. Sign in with your Gmail account
9. Click "Allow" to grant permissions
10. Click "Exchange authorization code for tokens"
11. Copy the **Refresh token** (you'll need this)

### Method 2: Using a Simple Script

1. Create a file `get-gmail-token.js`:
```javascript
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'http://localhost:3000/oauth/callback'
);

const scopes = ['https://www.googleapis.com/auth/gmail.send'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

console.log('Authorize this app by visiting this url:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', (code) => {
  oauth2Client.getToken(code, (err, token) => {
    if (err) return console.error('Error retrieving access token', err);
    console.log('Refresh Token:', token.refresh_token);
    rl.close();
  });
});
```

2. Install dependencies: `npm install googleapis`
3. Run the script: `node get-gmail-token.js`
4. Follow the instructions to get your refresh token

## Step 5: Configure Supabase Edge Function Secrets

1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions** → **Settings** → **Secrets**
3. Add the following environment variables:

   - `GMAIL_CLIENT_ID`: Your OAuth Client ID from Step 3
   - `GMAIL_CLIENT_SECRET`: Your OAuth Client Secret from Step 3
   - `GMAIL_REFRESH_TOKEN`: Your Refresh Token from Step 4
   - `FROM_EMAIL`: Your Gmail address (e.g., `your-email@gmail.com`)
   - `FROM_NAME`: Display name for emails (e.g., `R&R Booker`)

## Step 6: Deploy the Edge Function

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

## Step 7: Test the Setup

1. Try booking a child appointment in your app
2. Enter a child's email address
3. Click "Send Verification Code"
4. Check the email inbox for the OTP code

## Troubleshooting

### Issue: "Failed to get Gmail access token"

**Solution:**
- Verify your Client ID and Client Secret are correct
- Ensure the refresh token is valid and not expired
- Check that Gmail API is enabled in Google Cloud Console

### Issue: "Gmail API error: insufficient permissions"

**Solution:**
- Verify the OAuth consent screen is configured correctly
- Ensure the scope `https://www.googleapis.com/auth/gmail.send` is included
- If using a test account, make sure it's added to test users in OAuth consent screen

### Issue: "Refresh token expired"

**Solution:**
- Generate a new refresh token using OAuth 2.0 Playground
- Update the `GMAIL_REFRESH_TOKEN` in Supabase Edge Functions secrets
- Redeploy the edge function if needed

### Issue: Emails going to spam

**Solution:**
- Verify your Gmail account is not flagged for spam
- Ensure the "From" email matches your Gmail address
- Check Gmail's sending limits (500 emails/day for free accounts)

## Optional: Mobile App OAuth Setup

**Important:** This section is only needed if you want to use Gmail API directly from your mobile app for features other than email sending. For the OTP email feature, mobile app OAuth is **not required** because the mobile app calls the Supabase Edge Function which uses web OAuth credentials.

### For Android App

1. Go to **APIs & Services** → **Credentials**
2. Click "Create Credentials" → "OAuth client ID"
3. Select Application type: **Android**
4. Fill in the required fields:
   - Name: "R&R Booker (Android)"
   - Package name: Your Android app's package name (e.g., `com.rnrbooker.app`)
     - You can find this in `android/app/build.gradle` in the `applicationId` field
   - SHA-1 certificate fingerprint: Your app's SHA-1 fingerprint
     - **For debug keystore:**
       ```bash
       keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
       ```
     - **For release keystore:**
       ```bash
       keytool -list -v -keystore your-release-keystore.jks -alias your-key-alias
       ```
     - Copy the SHA-1 fingerprint from the output
5. Click "Create"
6. Copy the **Client ID** (for Android, no client secret is needed)

### For iOS App

1. Go to **APIs & Services** → **Credentials**
2. Click "Create Credentials" → "OAuth client ID"
3. Select Application type: **iOS**
4. Fill in the required fields:
   - Name: "R&R Booker (iOS)"
   - Bundle ID: Your iOS app's bundle identifier (e.g., `com.rnrbooker.app`)
     - You can find this in your Xcode project settings or `ios/YourApp/Info.plist`
5. Click "Create"
6. Copy the **Client ID** (for iOS, no client secret is needed)

### Using Mobile App OAuth in Your App

If you create mobile app OAuth credentials, you can use them in your mobile app code to access Gmail API directly:

**Android (Kotlin):**
```kotlin
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.Scope
import com.google.api.services.gmail.GmailScopes

val googleSignInOptions = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
    .requestScopes(Scope(GmailScopes.GMAIL_SEND))
    .requestIdToken("YOUR_ANDROID_CLIENT_ID")
    .requestEmail()
    .build()

val googleSignInClient = GoogleSignIn.getClient(context, googleSignInOptions)
```

**iOS (Swift):**
```swift
import GoogleSignIn

let config = GIDConfiguration(clientID: "YOUR_IOS_CLIENT_ID")
GIDSignIn.sharedInstance.configuration = config
GIDSignIn.sharedInstance.scopes = ["https://www.googleapis.com/auth/gmail.send"]

GIDSignIn.sharedInstance.signIn(withPresenting: self) { result, error in
    // Handle sign-in result
}
```

**React Native (if using Expo or React Native):**
```javascript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: 'YOUR_WEB_CLIENT_ID', // Use web client ID, not mobile
  scopes: ['https://www.googleapis.com/auth/gmail.send'],
});
```

### When to Use Mobile App OAuth

**Use Mobile App OAuth if:**
- You want to access Gmail API directly from the mobile app
- You want to read emails, manage labels, or other Gmail features
- You need user-specific Gmail access in the mobile app

**Don't Use Mobile App OAuth if:**
- You only need to send emails (like OTP codes)
- Your app calls a backend/edge function to send emails
- You want to keep OAuth credentials server-side

**For the OTP email feature:**
- ✅ Use web OAuth credentials in Supabase Edge Function
- ✅ Mobile app calls the edge function (no mobile OAuth needed)
- ✅ Works for both web and mobile apps

## Gmail Sending Limits

- **Free Gmail accounts**: 500 emails per day
- **Google Workspace accounts**: 2,000 emails per day (can be increased)

## Security Notes

1. **Never commit credentials to git**: Always use Supabase Edge Functions secrets
2. **Rotate credentials**: Regularly rotate your OAuth credentials
3. **Monitor usage**: Check Gmail API usage in Google Cloud Console
4. **Use service account for production**: For production, consider using a service account instead of OAuth

## Additional Resources

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [OAuth 2.0 for Web Server Applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gmail API Sending Emails](https://developers.google.com/gmail/api/guides/sending)

## Next Steps

1. Monitor email delivery in Gmail API logs
2. Set up email templates for different types of emails
3. Implement email tracking and analytics
4. Consider upgrading to Google Workspace for higher sending limits

