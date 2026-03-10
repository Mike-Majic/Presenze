const { sendJson, readBody, requireAdmin, supabaseFetch } = require("./_common")

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    return sendJson(res, 405, { error: "Metodo non consentito" })
  }

  const admin = await requireAdmin(req, res)
  if(!admin) return

  try{
    const body = await readBody(req)
    const email = (body.email || "").trim().toLowerCase()

    if(!email){
      return sendJson(res, 400, { error: "email mancante" })
    }

    const response = await supabaseFetch("/auth/v1/recover", {
      method: "POST",
      body: {
        email
      }
    })

    if(!response.ok){
      return sendJson(res, response.status, {
        error: "Errore invio reset password",
        details: response.data
      })
    }

    return sendJson(res, 200, {
      ok: true,
      email
    })
  }catch(err){
    console.error("RESET USER PASSWORD ERROR", err)
    return sendJson(res, 500, { error: "Errore interno reset password utente" })
  }
}
