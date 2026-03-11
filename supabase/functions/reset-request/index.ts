import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Resend } from "https://esm.sh/resend@2.0.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const resend = new Resend(Deno.env.get("RESEND_API_KEY"))

const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL")!
const APP_NAME = Deno.env.get("APP_NAME") || "Presenze"

const RESET_COOLDOWN = 48 * 60 * 60 * 1000

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Metodo non consentito" }),
      { status: 405, headers: corsHeaders }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))

    const email = String(body?.email || "").trim().toLowerCase()
    const note = String(body?.note || "").trim()
    const source = String(body?.source || "login").trim()

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email mancante" }),
        { status: 400, headers: corsHeaders }
      )
    }

    const { data, error: selectError } = await supabase
      .from("support_requests")
      .select("created_at")
      .eq("request_type", "reset_password")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)

    if (selectError) {
      console.error("RESET SELECT ERROR", selectError)

      return new Response(
        JSON.stringify({ error: selectError.message || "Errore lettura richieste precedenti" }),
        { status: 500, headers: corsHeaders }
      )
    }

    if (data && data.length) {
      const last = new Date(data[0].created_at).getTime()
      const now = Date.now()
      const diff = now - last

      if (diff < RESET_COOLDOWN) {
        return new Response(
          JSON.stringify({
            ok: true,
            remaining_ms: RESET_COOLDOWN - diff
          }),
          { status: 200, headers: corsHeaders }
        )
      }
    }

    const { error: insertError } = await supabase
      .from("support_requests")
      .insert({
        request_type: "reset_password",
        email,
        note,
        source,
        status: "new"
      })

    if (insertError) {
      console.error("RESET INSERT ERROR", insertError)

      return new Response(
        JSON.stringify({ error: insertError.message || "Errore salvataggio richiesta" }),
        { status: 500, headers: corsHeaders }
      )
    }

    const message = `
Richiesta RESET PASSWORD

Email account: ${email}

Note:
${note}

App: ${APP_NAME}
`

    const { error: resendError } = await resend.emails.send({
      from: "Support <onboarding@resend.dev>",
      to: ADMIN_EMAIL,
      subject: `Richiesta RESET PASSWORD - ${APP_NAME}`,
      text: message
    })

    if (resendError) {
      console.error("RESET RESEND ERROR", resendError)

      return new Response(
        JSON.stringify({ error: "Richiesta salvata ma invio email fallito" }),
        { status: 500, headers: corsHeaders }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, remaining_ms: 0 }),
      { status: 200, headers: corsHeaders }
    )
  } catch (err) {
    console.error("RESET FUNCTION ERROR", err)

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Errore interno" }),
      { status: 500, headers: corsHeaders }
    )
  }
})
