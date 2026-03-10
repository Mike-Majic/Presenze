const { sendJson, supabaseFetch, requireAdmin } = require("./_common")

module.exports = async (req, res) => {
  if(req.method !== "GET"){
    return sendJson(res, 405, { error: "Metodo non consentito" })
  }

  const admin = await requireAdmin(req, res)
  if(!admin) return

  try{
    const authUsersResponse = await supabaseFetch("/auth/v1/admin/users?page=1&per_page=1000")
    if(!authUsersResponse.ok){
      return sendJson(res, authUsersResponse.status, { error: "Errore recupero utenti auth", details: authUsersResponse.data })
    }

    const metaResponse = await supabaseFetch("/rest/v1/user_admin_meta?select=user_id,email,is_blocked,note_admin,created_at,updated_at")
    if(!metaResponse.ok){
      return sendJson(res, metaResponse.status, { error: "Errore recupero meta utenti", details: metaResponse.data })
    }

    const authUsers = authUsersResponse.data.users || []
    const metas = Array.isArray(metaResponse.data) ? metaResponse.data : []

    const metaMap = new Map(metas.map(row => [row.user_id, row]))

    const users = authUsers.map(user => {
      const meta = metaMap.get(user.id) || null

      return {
        id: user.id,
        email: user.email || "",
        created_at: user.created_at || meta?.created_at || null,
        last_sign_in_at: user.last_sign_in_at || null,
        is_blocked: !!meta?.is_blocked,
        note_admin: meta?.note_admin || ""
      }
    })

    users.sort((a, b) => {
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    })

    return sendJson(res, 200, { users })
  }catch(err){
    console.error("LIST USERS ERROR", err)
    return sendJson(res, 500, { error: "Errore interno lista utenti" })
  }
}
