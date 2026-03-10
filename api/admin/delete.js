const { sendJson, readBody, requireAdmin, supabaseFetch } = require("./_common")

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    return sendJson(res, 405, { error: "Metodo non consentito" })
  }

  const admin = await requireAdmin(req, res)
  if(!admin) return

  try{
    const body = await readBody(req)
    const userId = body.user_id

    if(!userId){
      return sendJson(res, 400, { error: "user_id mancante" })
    }

    const deleteAuthUser = await supabaseFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    })

    if(!deleteAuthUser.ok){
      return sendJson(res, deleteAuthUser.status, { error: "Errore eliminazione utente auth", details: deleteAuthUser.data })
    }

    await supabaseFetch(`/rest/v1/user_admin_meta?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE"
    })

    await supabaseFetch(`/rest/v1/presenze?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE"
    })

    return sendJson(res, 200, {
      ok: true,
      user_id: userId
    })
  }catch(err){
    console.error("DELETE USER ERROR", err)
    return sendJson(res, 500, { error: "Errore interno espulsione utente" })
  }
}
