import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import nodemailer from 'npm:nodemailer'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html } = await req.json()

    // Environment Variables se details nikalna
    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com'
    const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '587')
    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPass = Deno.env.get('SMTP_PASS')

    console.log(`Connecting to SMTP Host: ${smtpHost} via User: ${smtpUser}`);

    if (!smtpUser || !smtpPass) {
      throw new Error("SMTP Credentials (USER or PASS) are missing in .env file")
    }

    // SMTP Configuration
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: false, // Port 587 ke liye hamesha false (STARTTLS)
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        // Outlook aur Gmail dono ke liye ye settings safe hain
        ciphers: 'TLSv1.2',
        rejectUnauthorized: false 
      }
    })

    console.log(`Sending email to ${to}...`);

    const info = await transporter.sendMail({
      from: smtpUser, // Gmail/Outlook dono login wali email mangte hain
      to: to,
      subject: subject,
      html: html,
    })

    console.log("SUCCESS: Message sent with ID: %s", info.messageId);

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error("SMTP ERROR:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
