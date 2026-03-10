const SUPABASE_URL = "https://nzmgjuwmrvjxpykzawkp.supabase.co"
const SUPABASE_KEY = "sb_publishable_lwd5Lahd5CirK_RlQmhcBA_PTo6c14v"
const ADMIN_EMAIL = "m.colurci@gmail.com"

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let currentSession = null
let usersRows = []

function qs(id){
  return document.getElementById(id)
}

function setStatus(msg){
  const el = qs("usersStatus")
  if(el) el.textContent = msg || ""
}

function formatDateTime(value){
  if(!value) return "-"
  const d = new Date(value)
  if(Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString("it-IT")
}

async function getValidSession(){
  const { data, error } = await sb.auth.getSession()

  if(error || !data?.session){
    window.location.href = "/"
    return null
  }

  currentSession = data.session
  return data.session
}

async function requireAdminPage(){
  const session = await getValidSession()
  if(!session) return false

  const email = session.user?.email || ""
  if(email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()){
    alert("Accesso non autorizzato")
    window.location.href = "/"
    return false
  }

  if(qs("adminUserInfo")){
    qs("adminUserInfo").textContent = `Utente: ${email}`
  }

  return true
}

async function apiFetch(path, options = {}){
  const session = currentSession || await getValidSession()
  if(!session) throw new Error("Sessione non valida")

  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const data = await response.json().catch(() => ({}))

  if(!response.ok){
    throw new Error(data.error || "Errore API")
  }

  return data
}

function buildActionButton(text, className, onClick){
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = className
  btn.textContent = text
  btn.onclick = onClick
  return btn
}

function renderUsers(rows){
  const tbody = qs("usersTable")
  if(!tbody) return

  tbody.innerHTML = ""

  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="6">Nessun utente trovato</td></tr>`
    return
  }

  rows.forEach(user => {
    const tr = document.createElement("tr")

    const tdEmail = document.createElement("td")
    tdEmail.textContent = user.email || "-"

    const tdCreated = document.createElement("td")
    tdCreated.textContent = formatDateTime(user.created_at)

    const tdLastSignIn = document.createElement("td")
    tdLastSignIn.textContent = formatDateTime(user.last_sign_in_at)

    const tdStatus = document.createElement("td")
    tdStatus.textContent = user.is_blocked ? "Bloccato" : "Attivo"

    const tdNotes = document.createElement("td")
    const noteInput = document.createElement("input")
    noteInput.type = "text"
    noteInput.value = user.note_admin || ""
    noteInput.placeholder = "Note admin"
    noteInput.style.minWidth = "220px"
    noteInput.dataset.userId = user.id
    noteInput.dataset.email = user.email || ""
    tdNotes.appendChild(noteInput)

    const tdActions = document.createElement("td")
    tdActions.style.whiteSpace = "nowrap"

    const btnSaveNote = buildActionButton("Salva nota", "btn-blue", async () => {
      try{
        setStatus("Salvataggio nota in corso ..")
        await apiFetch("/api/admin/note", {
          method: "POST",
          body: {
            user_id: user.id,
            email: user.email,
            note_admin: noteInput.value.trim()
          }
        })
        setStatus("Nota salvata")
      }catch(err){
        console.error(err)
        setStatus("Errore salvataggio nota: " + err.message)
      }
    })

    const btnToggleBlock = buildActionButton(
      user.is_blocked ? "Sblocca" : "Blocca",
      user.is_blocked ? "btn-green" : "btn-orange",
      async () => {
        try{
          setStatus(user.is_blocked ? "Sblocco in corso .." : "Blocco in corso ..")
          await apiFetch("/api/admin/block", {
            method: "POST",
            body: {
              user_id: user.id,
              email: user.email,
              is_blocked: !user.is_blocked
            }
          })
          await loadUsers()
          setStatus(user.is_blocked ? "Utente sbloccato" : "Utente bloccato")
        }catch(err){
          console.error(err)
          setStatus("Errore blocco/sblocco: " + err.message)
        }
      }
    )

    const btnDelete = buildActionButton("Espelli", "btn-red", async () => {
      const ok = window.confirm(`Vuoi davvero espellere ${user.email}?`)
      if(!ok) return

      try{
        setStatus("Espulsione in corso ..")
        await apiFetch("/api/admin/delete", {
          method: "POST",
          body: {
            user_id: user.id
          }
        })
        await loadUsers()
        setStatus("Utente espulso")
      }catch(err){
        console.error(err)
        setStatus("Errore espulsione: " + err.message)
      }
    })

const buttonsWrap = document.createElement("div")
buttonsWrap.className = "table-buttons"

buttonsWrap.appendChild(btnSaveNote)
buttonsWrap.appendChild(btnToggleBlock)
buttonsWrap.appendChild(btnDelete)

tdActions.appendChild(buttonsWrap)

    tr.appendChild(tdEmail)
    tr.appendChild(tdCreated)
    tr.appendChild(tdLastSignIn)
    tr.appendChild(tdStatus)
    tr.appendChild(tdNotes)
    tr.appendChild(tdActions)

    tbody.appendChild(tr)
  })
}

async function loadUsers(){
  try{
    setStatus("Caricamento utenti ..")
    const result = await apiFetch("/api/admin/list")
    usersRows = result.users || []
    renderUsers(usersRows)
    setStatus(`Utenti caricati: ${usersRows.length}`)
  }catch(err){
    console.error(err)
    setStatus("Errore caricamento utenti: " + err.message)
  }
}

async function logoutAdmin(){
  await sb.auth.signOut()
  window.location.href = "/"
}

function goBack(){
  window.location.href = "/"
}

function bindEvents(){
  if(qs("btnRefreshUsers")) qs("btnRefreshUsers").onclick = loadUsers
  if(qs("btnLogoutAdmin")) qs("btnLogoutAdmin").onclick = logoutAdmin
  if(qs("btnBackDashboard")) qs("btnBackDashboard").onclick = goBack
}

window.addEventListener("DOMContentLoaded", async () => {
  bindEvents()

  const ok = await requireAdminPage()
  if(!ok) return

  await loadUsers()
})
