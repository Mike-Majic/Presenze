const SUPABASE_URL = "https://nzmgjuwmrvjxpykzawkp.supabase.co"
const SUPABASE_KEY = "sb_publishable_lwd5Lahd5CirK_RlQmhcBA_PTo6c14v"
const ADMIN_EMAIL = "m.colurci@gmail.com"

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let currentUser = null
let isAdmin = false
let presenze = []

function qs(id){
  return document.getElementById(id)
}

function setLogStatus(message){
  const el = qs("logStatus")
  if(el) el.textContent = message || ""
}

function formatDate(value){
  if(!value) return ""
  const [year, month, day] = String(value).split("-")
  if(!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

function renderLogTable(rows){
  const tbody = qs("logTable")
  if(!tbody) return

  tbody.innerHTML = ""

  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="8">Nessuna presenza</td></tr>`
    return
  }

  rows.forEach(row => {
    const safeId = String(row.id)
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td data-label="Nome">${row.nome || ""}</td>
      <td data-label="Data">${formatDate(row.data || "")}</td>
      <td data-label="Stato">${row.stato || ""}</td>
      <td data-label="Ore">${Number(row.ore || 0)}</td>
      <td data-label="Ore extra">${Number(row.ore_extra || 0)}</td>
      <td data-label="Sede">${row.sede || ""}</td>
      <td data-label="Note">${row.note || ""}</td>
      <td data-label="Azioni">
        <div class="table-buttons">
          <button type="button" class="btn-blue" data-edit-id="${safeId}">Modifica</button>
          <button type="button" class="btn-red" data-delete-id="${safeId}">Elimina</button>
        </div>
      </td>
    `
    tbody.appendChild(tr)
  })

  tbody.querySelectorAll("[data-edit-id]").forEach(btn => {
    btn.onclick = () => editPresenza(btn.dataset.editId)
  })

  tbody.querySelectorAll("[data-delete-id]").forEach(btn => {
    btn.onclick = () => deletePresenza(btn.dataset.deleteId)
  })
}

async function loadPresenze(){
  setLogStatus("Caricamento log in corso...")

  const { data, error } = await sb
    .from("presenze")
    .select("*")
    .order("data", { ascending: false })

  if(error){
    presenze = []
    renderLogTable([])
    setLogStatus("Errore caricamento log: " + error.message)
    return
  }

  presenze = (data || []).filter(row => isAdmin || row.email === currentUser?.email)
  renderLogTable(presenze)
  setLogStatus("Log aggiornato")
}

function editPresenza(id){
  sessionStorage.setItem("presenze_edit_id", id)
  window.location.href = "/index.html"
}

async function deletePresenza(id){
  const { error } = await sb
    .from("presenze")
    .delete()
    .eq("id", id)

  if(error){
    setLogStatus("Errore eliminazione: " + error.message)
    return
  }

  await loadPresenze()
  setLogStatus("Presenza eliminata")
}

async function logout(){
  await sb.auth.signOut({ scope: "local" })
  window.location.href = "/index.html"
}

function bindEvents(){
  if(qs("btnBackDashboard")) qs("btnBackDashboard").onclick = () => { window.location.href = "/index.html" }
  if(qs("btnLogoutLog")) qs("btnLogoutLog").onclick = logout
}

async function init(){
  bindEvents()

  const { data, error } = await sb.auth.getSession()
  if(error || !data?.session?.user){
    window.location.href = "/index.html"
    return
  }

  currentUser = data.session.user
  isAdmin = (currentUser.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()

  if(qs("logUserInfo")) qs("logUserInfo").textContent = `Utente: ${currentUser.email || "-"}`
  if(qs("logRoleInfo")) qs("logRoleInfo").innerHTML = isAdmin
    ? 'Ruolo: <span class="role-admin">ADMIN</span>'
    : 'Ruolo: <span class="role-user">UTENTE</span>'

  await loadPresenze()
}

init()
