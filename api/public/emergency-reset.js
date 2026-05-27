const { sendJson, readBody, supabaseFetch } = require("../admin/_common")

const ADMIN_EMAIL = (process.env.ADMIN_NOTIFY_EMAIL || "m.colurci@gmail.com").toLowerCase()
const EMERGENCY_RESET_CODE = process.env.EMERGENCY_RESET_CODE || "Mike00"

module.exports = async (req, res) => {
  if(req.method !== "POST"){
    return sendJson(res, 405, { error: "Metodo non consentito" })
  }

  try{
    const body = await readBody(req)
    const email = String(body?.email || "").trim().toLowerCase()
    const emergencyCode = String(body?.emergency_code || "").trim()
    const newPassword = String(body?.new_password || "").trim()

    if(email !== ADMIN_EMAIL){
      return sendJson(res, 403, { error: "Reset diretto consentito solo all'account proprietario" })
    }

    if(!emergencyCode || emergencyCode !== EMERGENCY_RESET_CODE){
      return sendJson(res, 401, { error: "Codice emergenza non valido" })
    }

    if(!newPassword || newPassword.length < 6){
      return sendJson(res, 400, { error: "Nuova password non valida (minimo 6 caratteri)" })
    }

    const listResponse = await supabaseFetch(`/auth/v1/admin/users?email=${encodeURIComponent(email)}`)
    if(!listResponse.ok){
      return sendJson(res, listResponse.status, { error: "Errore ricerca utente", details: listResponse.data })
    }

    const user = Array.isArray(listResponse.data?.users) ? listResponse.data.users[0] : null
    if(!user?.id){
      return sendJson(res, 404, { error: "Utente non trovato" })
    }

    const updateResponse = await supabaseFetch(`/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      body: {
        password: newPassword
      }
    })

    if(!updateResponse.ok){
      return sendJson(res, updateResponse.status, { error: "Errore aggiornamento password", details: updateResponse.data })
    }

    return sendJson(res, 200, { ok: true, email })
  }catch(err){
    console.error("EMERGENCY RESET ERROR", err)
    return sendJson(res, 500, { error: "Errore interno reset emergenza" })
  }
}
