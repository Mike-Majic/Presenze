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

serve(async (req) => {

  try{

    const body = await req.json()

    const nome = (body.nome || "").trim()
    const email = (body.email || "").trim()
    const note = (body.note || "").trim()
    const source = body.source || "login"

    if(!nome || !email || !note){
      return new Response(
        JSON.stringify({ error: "Campi mancanti" }),
        { status: 400 }
      )
    }

    await supabase
      .from("support_requests")
      .insert({
        request_type: "help",
        nome,
        email,
        note,
        source
      })

    const message = `
Nuova richiesta AIUTO

Nome: ${nome}
Email: ${email}

Note:
${note}

App: ${APP_NAME}
`

    await resend.emails.send({
      from: "Support <onboarding@resend.dev>",
      to: ADMIN_EMAIL,
      subject: `Richiesta AIUTO - ${APP_NAME}`,
      text: message
    })

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200 }
    )

  }catch(err){

    console.error(err)

    return new Response(
      JSON.stringify({ error: "Errore interno" }),
      { status: 500 }
    )
  }

})
