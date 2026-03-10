const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "m.colurci@gmail.com"

function sendJson(res, status, payload){
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.end(JSON.stringify(payload))
}

async function readBody(req){
  if(req.method === "GET") return {}

  return await new Promise((resolve, reject) => {
    let data = ""

    req.on("data", chunk => {
      data += chunk
    })

    req.on("end", () => {
      if(!data) return resolve({})
      try{
        resolve(JSON.parse(data))
      }catch(err){
        reject(err)
      }
    })

    req.on("error", reject)
  })
}

async function supabaseFetch(path, options = {}){
  const url = `${SUPABASE_URL}${path}`

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const text = await response.text()
  let data = {}

  try{
    data = text ? JSON.parse(text) : {}
  }catch{
    data = { raw: text }
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  }
}

async function getCurrentUserFromToken(accessToken){
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${accessToken}`
    }
  })

  if(!response.ok){
    return null
  }

  return await response.json()
}

async function requireAdmin(req, res){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){
    sendJson(res, 500, { error: "Variabili server mancanti" })
    return null
  }

  const authHeader = req.headers.authorization || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  if(!token){
    sendJson(res, 401, { error: "Token mancante" })
    return null
  }

  const user = await getCurrentUserFromToken(token)

  if(!user){
    sendJson(res, 401, { error: "Sessione non valida" })
    return null
  }

  const email = (user.email || "").toLowerCase()
  if(email !== ADMIN_EMAIL.toLowerCase()){
    sendJson(res, 403, { error: "Non autorizzato" })
    return null
  }

  return user
}

async function getUserMeta(userId){
  const response = await supabaseFetch(`/rest/v1/user_admin_meta?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email,is_blocked,note_admin,created_at,updated_at`)
  if(!response.ok) return null
  return Array.isArray(response.data) ? response.data[0] || null : null
}

async function upsertUserMeta(payload){
  return await supabaseFetch("/rest/v1/user_admin_meta", {
    method: "POST",
    headers: {
      "Prefer": "resolution=merge-duplicates,return=representation"
    },
    body: [payload]
  })
}

module.exports = {
  sendJson,
  readBody,
  supabaseFetch,
  requireAdmin,
  getUserMeta,
  upsertUserMeta
}
