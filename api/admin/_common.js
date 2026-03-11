const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_EMAIL = (process.env.ADMIN_NOTIFY_EMAIL || "m.colurci@gmail.com").toLowerCase()

function sendJson(res, status, payload){
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.end(JSON.stringify(payload))
}

function readBody(req){
  return new Promise((resolve, reject) => {
    try{
      if(req.body && typeof req.body === "object"){
        return resolve(req.body)
      }

      if(typeof req.body === "string"){
        if(!req.body.trim()) return resolve({})
        try{
          return resolve(JSON.parse(req.body))
        }catch(err){
          return reject(err)
        }
      }

      let raw = ""

      req.on("data", chunk => {
        raw += chunk
      })

      req.on("end", () => {
        if(!raw || !raw.trim()) return resolve({})

        try{
          resolve(JSON.parse(raw))
        }catch(err){
          reject(err)
        }
      })

      req.on("error", reject)
    }catch(err){
      reject(err)
    }
  })
}

async function supabaseFetch(path, options = {}){
  if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){
    return {
      ok: false,
      status: 500,
      data: {
        error: "Variabili ambiente Supabase mancanti"
      }
    }
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  })

  const data = await response.json().catch(() => ({}))

  return {
    ok: response.ok,
    status: response.status,
    data
  }
}

async function requireAdmin(req, res){
  try{
    const authHeader = req.headers.authorization || ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

    if(!token){
      sendJson(res, 401, { error: "Token mancante" })
      return null
    }

    if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){
      sendJson(res, 500, { error: "Variabili ambiente Supabase mancanti" })
      return null
    }

    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${token}`
      }
    })

    const user = await userResponse.json().catch(() => null)

    if(!userResponse.ok || !user){
      sendJson(res, 401, { error: "Sessione non valida" })
      return null
    }

    if((user.email || "").toLowerCase() !== ADMIN_EMAIL){
      sendJson(res, 403, { error: "Non autorizzato" })
      return null
    }

    return user
  }catch(err){
    console.error("REQUIRE ADMIN ERROR", err)
    sendJson(res, 500, { error: "Errore verifica admin" })
    return null
  }
}

async function getUserMeta(userId){
  const response = await supabaseFetch(
    `/rest/v1/user_admin_meta?user_id=eq.${encodeURIComponent(userId)}&select=user_id,email,is_blocked,note_admin,created_at,updated_at`
  )

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
