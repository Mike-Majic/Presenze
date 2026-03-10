const { sendJson, readBody, requireAdmin, supabaseFetch } = require("./_common")

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    return sendJson(res, 405, { error: "Metodo non consentito" })
  }

  const admin = await requireAdmin(req, res)
  if(!admin) return

  try{
    const body = await readBody(req)
    const id = body.id
    const status = (body.status || "").trim()

    if(!id){
      return sendJson(res, 400, { error: "id mancante" })
    }

    if(!["new", "done", "archived"].includes(status)){
      return sendJson(res, 400, { error: "status non valido" })
    }

    const response = await supabaseFetch(`/rest/v1/support_requests?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Prefer": "return=representation"
      },
      body: {
        status
      }
    })

    if(!response.ok){
      return sendJson(res, response.status, {
        error: "Errore aggiornamento stato richiesta",
        details: response.data
      })
    }

    return sendJson(res, 200, {
      ok: true,
      id,
      status
    })
  }catch(err){
    console.error("SUPPORT STATUS ERROR", err)
    return sendJson(res, 500, { error: "Errore interno aggiornamento richiesta" })
  }
}
