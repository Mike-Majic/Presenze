const { sendJson, readBody, requireAdmin, supabaseFetch } = require("./_common")

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    return sendJson(res, 405, { error: "Metodo non consentito" })
  }

  const admin = await requireAdmin(req, res)
  if(!admin) return

  try{
    const body = await readBody(req) || {}
    console.log("SUPPORT STATUS BODY", body)

    const rawId = body.id
    const rawStatus = body.status

    const id = String(rawId ?? "").trim()
    const status = String(rawStatus ?? "").trim().toLowerCase()

    console.log("SUPPORT STATUS PARSED", {
      rawId,
      rawStatus,
      id,
      status
    })

    if(!id){
      return sendJson(res, 400, {
        error: "id mancante",
        received: body
      })
    }

    if(!["new", "done", "archived"].includes(status)){
      return sendJson(res, 400, {
        error: "status non valido",
        receivedStatus: rawStatus,
        received: body
      })
    }

    const path = `/rest/v1/support_requests?id=eq.${encodeURIComponent(id)}`

    console.log("SUPPORT STATUS PATCH PATH", path)

    const response = await supabaseFetch(path, {
      method: "PATCH",
      headers: {
        "Prefer": "return=representation"
      },
      body: {
        status
      }
    })

    console.log("SUPPORT STATUS SUPABASE RESPONSE", {
      ok: response.ok,
      statusCode: response.status,
      data: response.data
    })

    if(!response.ok){
      return sendJson(res, response.status, {
        error: "Errore aggiornamento stato richiesta",
        details: response.data,
        id,
        status
      })
    }

    const updatedRows = Array.isArray(response.data) ? response.data : []

    if(updatedRows.length === 0){
      return sendJson(res, 404, {
        error: "Richiesta non trovata o nessuna riga aggiornata",
        id,
        status
      })
    }

    return sendJson(res, 200, {
      ok: true,
      id,
      status,
      updated: updatedRows
    })
  }catch(err){
    console.error("SUPPORT STATUS ERROR", err)

    return sendJson(res, 500, {
      error: "Errore interno aggiornamento richiesta",
      details: err?.message || String(err)
    })
  }
}
