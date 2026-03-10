import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { Resend } from "https://esm.sh/resend@2.0.0"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const resend = new Resend(Deno.env.get("RESEND_API_KEY"))

const ADMIN_EMAIL = Deno.env.get("ADMIN_NOTIFY_EMAIL")!
const APP_NAME = Deno.env.get("APP_NAME") || "Presenze"

const RESET_COOLDOWN = 48 * 60 * 60 * 1000

serve(async (req) => {

  try{

    const body = await req.json()

    const email = (body.email || "").trim()
    const note = (body.note || "").trim()
    const source = body.source || "login"

    if(!email){
      return new Response(
        JSON.stringify({ error: "Email mancante" }),
        { status: 400 }
      )
    }

    const { data } = await supabase
      .from("support_requests")
      .select("created_at")
      .eq("request_type","reset_password")
      .eq("email",email)
      .order("created_at",{ ascending:false })
      .limit(1)

    if(data && data.length){

      const last = new Date(data[0].created_at).getTime()
      const now = Date.now()

      const diff = now - last

      if(diff < RESET_COOLDOWN){

        return new Response(
          JSON.stringify({
            remaining_ms: RESET_COOLDOWN - diff
          }),
          { status: 200 }
        )
      }
    }

    await supabase
      .from("support_requests")
      .insert({
        request_type:"reset_password",
        email,
        note,
        source
      })

    const message = `
Richiesta RESET PASSWORD

Email account: ${email}

Note:
${note}

App: ${APP_NAME}
`

    await resend.emails.send({
      from: "Support <onboarding@resend.dev>",
      to: ADMIN_EMAIL,
      subject: `Richiesta RESET PASSWORD - ${APP_NAME}`,
      text: message
    })

    return new Response(
      JSON.stringify({ ok:true }),
      { status:200 }
    )

  }catch(err){

    console.error(err)

    return new Response(
      JSON.stringify({ error:"Errore interno" }),
      { status:500 }
    )
  }

})
