// supabase/functions/send-notification/index.ts
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

interface NotificationPayload {
  userId: string
  title: string
  body: string
  data?: Record<string, any>
  type?: string
}

interface FCMResponse {
  success: boolean
  messageId?: string
  error?: string
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
    const requestBody = await req.json()
    console.log('📥 Request body received:', JSON.stringify(requestBody, null, 2))
    
    const { userId, title, body, type = 'general' } = requestBody
    const data = requestBody.data && typeof requestBody.data === 'object' ? requestBody.data : {}
    
    console.log('📊 Processed data:', JSON.stringify(data, null, 2))

    if (!userId || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, title, body' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get user's device tokens
    const { data: devices, error: devicesError } = await supabaseClient
      .from('user_devices')
      .select('token, platform')
      .eq('user_id', userId)

    if (devicesError) {
      throw new Error(`Error fetching devices: ${devicesError.message}`)
    }

    if (!devices || devices.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No devices found for user',
          devices: []
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Send notifications to each device
    const results: FCMResponse[] = []
    
    for (const device of devices) {
      try {
        // Safely prepare the data object without spread syntax
        let safeData = {}
        try {
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            // Manually copy properties to avoid spread syntax issues
            safeData = {}
            for (const key in data) {
              if (data.hasOwnProperty(key)) {
                safeData[key] = data[key]
              }
            }
          }
        } catch (error) {
          console.error('Error processing data object:', error)
          safeData = {}
        }
        
        // Create the final data object without spread syntax
        const finalData = Object.assign({}, safeData, {
          type,
          userId,
          timestamp: new Date().toISOString()
        })
        
        const result = await sendToDevice(device.token, device.platform, {
          title,
          body,
          data: finalData
        })
        results.push(result)
      } catch (error) {
        console.error(`Error sending to device ${device.token}:`, error)
        results.push({
          success: false,
          error: error.message
        })
      }
    }

    // REMOVED: Database notification creation to prevent duplicates
    // Only CentralizedNotificationService should create database notifications
    // This Edge Function now only handles push notifications

    const successCount = results.filter(r => r.success).length
    const totalCount = results.length

    return new Response(
      JSON.stringify({
        success: true,
        message: `Notifications sent to ${successCount}/${totalCount} devices`,
        results,
        devices: devices.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in send-notification function:', error)
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

async function sendToDevice(token: string, platform: string, payload: any): Promise<FCMResponse> {
  // Prefer HTTP v1 if service account is configured
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT')
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID')

  console.log('🔧 sendToDevice called with:', { 
    tokenLength: token?.length || 0, 
    platform, 
    hasServiceAccount: !!serviceAccountJson,
    hasProjectId: !!projectId 
  })

  if (!serviceAccountJson || !projectId) {
    const error = 'GOOGLE_SERVICE_ACCOUNT and FIREBASE_PROJECT_ID must be set for HTTP v1 messaging'
    console.error('❌ Environment variables missing:', { 
      hasServiceAccount: !!serviceAccountJson, 
      hasProjectId: !!projectId 
    })
    throw new Error(error)
  }
  return await sendViaHttpV1({ token, projectId, payload })
}

async function sendViaHttpV1({ token, projectId, payload }: { token: string, projectId: string, payload: any }): Promise<FCMResponse> {
  const accessToken = await getGoogleAccessToken()
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

  const v1Message = {
    message: {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data,
      android: {
        priority: 'HIGH',
        notification: {
          sound: 'default',
          channel_id: 'default',
          color: '#488AFF',
        }
      },
      webpush: {
        fcm_options: { link: getClickAction(payload.data?.type) }
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } }
      }
    }
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(v1Message)
  })

  const text = await resp.text()
  console.log('FCM Response Status:', resp.status)
  console.log('FCM Response Headers:', Object.fromEntries(resp.headers.entries()))
  console.log('FCM Response Body:', text)
  
  let data: any
  try {
    data = JSON.parse(text)
  } catch (parseError) {
    console.error('FCM v1 non-JSON response:', text)
    console.error('Parse error:', parseError)
    console.error('Response status:', resp.status)
    console.error('Response headers:', Object.fromEntries(resp.headers.entries()))
    return { 
      success: false, 
      error: `FCM v1 invalid response (${resp.status}): ${text.substring(0, 200)}` 
    }
  }

  if (resp.ok && data?.name) {
    console.log('✅ FCM message sent successfully:', data.name)
    return { success: true, messageId: data.name }
  }
  
  const errorMessage = data?.error?.message || `FCM v1 error (${resp.status})`
  console.error('❌ FCM error:', errorMessage)
  console.error('❌ Full error data:', data)
  return { success: false, error: errorMessage }
}

async function getGoogleAccessToken(): Promise<string> {
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT')
  if (!saJson) {
    console.error('GOOGLE_SERVICE_ACCOUNT environment variable is not set')
    throw new Error('GOOGLE_SERVICE_ACCOUNT is not set')
  }
  
  console.log('GOOGLE_SERVICE_ACCOUNT found, length:', saJson.length)
  
  let sa: any
  try {
    sa = JSON.parse(saJson)
    console.log('Service account parsed successfully, project_id:', sa.project_id)
  } catch (error) {
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT JSON:', error)
    throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT JSON format')
  }

  const now = Math.floor(Date.now() / 1000)
  const jwtHeader = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const jwtClaimSet = base64UrlEncode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }))
  const unsignedJwt = `${jwtHeader}.${jwtClaimSet}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedJwt))
  const jwt = `${unsignedJwt}.${base64UrlEncode(new Uint8Array(signature))}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    })
  })
  
  console.log('OAuth token request status:', resp.status)
  const json = await resp.json()
  console.log('OAuth token response:', json)
  
  if (!resp.ok) {
    console.error('OAuth token request failed:', json)
    throw new Error(json?.error || 'Failed to obtain access token')
  }
  
  console.log('Access token obtained successfully')
  return json.access_token
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const b64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s+/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function getClickAction(type?: string): string {
  const baseUrl = Deno.env.get('SITE_URL') || 'http://localhost:3000'
  
  switch (type) {
    case 'appointment':
      return `${baseUrl}/appointments`
    case 'queue':
      return `${baseUrl}/queue`
    case 'booking':
      return `${baseUrl}/book`
    default:
      return `${baseUrl}/dashboard`
  }
}
