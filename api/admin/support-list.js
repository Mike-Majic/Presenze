const { sendJson, requireAdmin, supabaseFetch } = require("./_common")

module.exports = async (req, res) => {
  if(req.method !== "GET"){
    return sendJson(res, 405, { error: "Metodo non consentito" })
  }

  const admin = await requireAdmin(req, res)
  if(!admin) return

  try{
    const response = await supabaseFetch(
      "/rest/v1/support_requests?select=*&order=created_at.desc&limit=200"
    )

    if(!response.ok){
      return sendJson(res, response.status, {
        error: "Errore recupero richieste supporto",
        details: response.data
      })
    }

    const requests = Array.isArray(response.data) ? response.data : []

    return sendJson(res, 200, { requests })
  }catch(err){
    console.error("SUPPORT LIST ERROR", err)
    return sendJson(res, 500, { error: "Errore interno lista richieste supporto" })
  }
}
