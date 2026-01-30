// supabase/functions/reset-password-with-otp/index.ts
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the request body
    const requestBody = await req.json()
    const { email, code, newPassword } = requestBody

    if (!email || !code || !newPassword) {
      return new Response(
        JSON.stringify({ error: 'Email, code, and newPassword are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate password length
    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters long' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()
    const trimmedCode = code.trim()

    // Verify OTP code from database
    const now = new Date().toISOString()
    const { data: otpData, error: otpError } = await supabaseAdmin
      .from('password_reset_otps')
      .select('id, email')
      .eq('email', normalizedEmail)
      .eq('code', trimmedCode)
      .is('verified_at', null)
      .gt('expires_at', now)
      .maybeSingle()

    if (otpError) {
      console.error('Error verifying OTP:', otpError)
      return new Response(
        JSON.stringify({ error: 'Unable to verify code. Please try again.' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!otpData) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired verification code. Please check the code and try again.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Mark OTP as verified
    await supabaseAdmin
      .from('password_reset_otps')
      .update({
        verified_at: now,
        verification_status: 'verified'
      })
      .eq('id', otpData.id)

    // Find user by email using admin API
    const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (userError) {
      console.error('Error listing users:', userError)
      return new Response(
        JSON.stringify({ error: 'Unable to find user. Please try again.' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const user = users?.users?.find(u => u.email?.toLowerCase() === normalizedEmail)
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User not found with this email address.' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update user password using admin API
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    )

    if (updateError) {
      console.error('Error updating password:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update password. Please try again.' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('✅ Password reset successful for user:', normalizedEmail)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password has been reset successfully'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('❌ Error in reset-password-with-otp function:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An unexpected error occurred',
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})


