const { sendJson, readBody, requireAdmin, getUserMeta, upsertUserMeta } = require("./_common")

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    return sendJson(res, 405, { error: "Metodo non consentito" })
  }

  const admin = await requireAdmin(req, res)
  if(!admin) return

  try{
    const body = await readBody(req)
    const userId = body.user_id
    const email = body.email || ""
    const isBlocked = !!body.is_blocked

    if(!userId){
      return sendJson(res, 400, { error: "user_id mancante" })
    }

    const currentMeta = await getUserMeta(userId)

    const response = await upsertUserMeta({
      user_id: userId,
      email: email || currentMeta?.email || "",
      is_blocked: isBlocked,
      note_admin: currentMeta?.note_admin || ""
    })

    if(!response.ok){
      return sendJson(res, response.status, { error: "Errore aggiornamento blocco", details: response.data })
    }

    return sendJson(res, 200, {
      ok: true,
      user_id: userId,
      is_blocked: isBlocked
    })
  }catch(err){
    console.error("BLOCK USER ERROR", err)
    return sendJson(res, 500, { error: "Errore interno blocco utente" })
  }
}
