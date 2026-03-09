const SUPABASE_URL = "https://nzmgjuwmrvjxpykzawkp.supabase.co"
const SUPABASE_KEY = "sb_publishable_lwd5Lahd5CirK_RlQmhcBA_PTo6c14v"
const ADMIN_EMAIL = "m.colurci@gmail.com"
const BOSS_EMAIL = "m.colurci@gmail.com"

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let currentUser = null
let isAdmin = false
let presenze = []
let editingId = null
let lastReportText = ""

function qs(id){
  return document.getElementById(id)
}

function setAuthStatus(msg){
  const el = qs("authStatus")
  if(el) el.textContent = msg || ""
  console.log("[AUTH]", msg || "")
}

function setAppStatus(msg){
  const el = qs("appStatus")
  if(el) el.textContent = msg || ""
  console.log("[APP]", msg || "")
}

function escapeHtml(value){
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;")
}

function todayISO(){
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2,"0")
  const day = String(d.getDate()).padStart(2,"0")
  return `${year}-${month}-${day}`
}

function currentMonthValue(){
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2,"0")
  return `${year}-${month}`
}

function formatDate(dateString){
  if(!dateString) return ""
  const [y,m,d] = dateString.split("-")
  if(!y || !m || !d) return dateString
  return `${d}/${m}/${y}`
}

function extractNameFromEmail(email){
  if(!email) return ""
  const local = String(email).split("@")[0]
  return local.replaceAll(".", " ").replaceAll("_", " ")
}

function getBadgeClass(stato){
  if(stato === "Presente") return "badge badge-presente"
  if(stato === "Assente") return "badge badge-assente"
  if(stato === "Ferie") return "badge badge-ferie"
  if(stato === "Permesso") return "badge badge-permesso"
  return "badge"
}

function showLogin(){
  currentUser = null
  isAdmin = false
  presenze = []
  editingId = null

  qs("loginBox").classList.remove("hidden")
  qs("app").classList.add("hidden")
  qs("userInfo").textContent = "Utente: -"
  qs("roleInfo").textContent = "Ruolo: -"
  qs("tabella").innerHTML = ""
  qs("reportBox").textContent = 'Premi "Genera report"'
  qs("chartBars").innerHTML = ""
}

function applyRoleUi(){
  qs("userInfo").textContent = `Utente: ${currentUser?.email || "-"}`
  qs("roleInfo").innerHTML = isAdmin
    ? `Ruolo: <span class="role-admin">ADMIN</span>`
    : `Ruolo: <span class="role-user">UTENTE</span>`

  if(isAdmin){
    qs("adminFilterWrap").classList.remove("hidden")
  }else{
    qs("adminFilterWrap").classList.add("hidden")
    qs("filterEmployee").value = ""
  }
}

function showApp(user){
  currentUser = user
  isAdmin = String(user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()

  qs("loginBox").classList.add("hidden")
  qs("app").classList.remove("hidden")

  applyRoleUi()

  if(!qs("filterMonth").value){
    qs("filterMonth").value = currentMonthValue()
  }

  clearForm()
  loadPresenze()
}

function clearForm(){
  qs("nome").value = isAdmin ? "" : extractNameFromEmail(currentUser?.email || "")
  qs("data").value = todayISO()
  qs("stato").value = "Presente"
  qs("ore").value = ""
  qs("sede").value = ""
  qs("note").value = ""
}

function setEditMode(row){
  editingId = row.id
  qs("formTitle").textContent = "Modifica presenza"
  qs("saveBtn").textContent = "Aggiorna presenza"
  qs("cancelEditBtn").classList.remove("hidden")

  qs("nome").value = row.nome || ""
  qs("data").value = row.data || todayISO()
  qs("stato").value = row.stato || "Presente"
  qs("ore").value = row.ore ?? ""
  qs("sede").value = row.sede || ""
  qs("note").value = row.note || ""

  window.scrollTo({ top: 0, behavior: "smooth" })
}

function cancelEdit(){
  editingId = null
  qs("formTitle").textContent = "Inserisci presenza"
  qs("saveBtn").textContent = "Salva presenza"
  qs("cancelEditBtn").classList.add("hidden")
  clearForm()
  setAppStatus("")
}

async function checkSession(){
  const { data, error } = await sb.auth.getSession()

  if(error){
    setAuthStatus("Errore sessione: " + error.message)
    showLogin()
    return
  }

  const user = data?.session?.user || null

  if(user){
    showApp(user)
    setAuthStatus("")
  }else{
    showLogin()
  }
}

async function login(){
  try{
    const email = qs("email").value.trim()
    const password = qs("password").value.trim()

    setAuthStatus("Tentativo di login...")

    if(!email || !password){
      setAuthStatus("Inserisci email e password")
      return
    }

    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password
    })

    if(error){
      setAuthStatus("Errore login: " + error.message)
      return
    }

    if(!data?.user){
      setAuthStatus("Login non riuscito")
      return
    }

    setAuthStatus("Login riuscito")
    showApp(data.user)
  }catch(err){
    setAuthStatus("Errore JS login: " + err.message)
  }
}

async function registerUser(){
  try{
    const email = qs("email").value.trim()
    const password = qs("password").value.trim()

    setAuthStatus("Tentativo di registrazione...")

    if(!email || !password){
      setAuthStatus("Inserisci email e password")
      return
    }

    if(password.length < 6){
      setAuthStatus("La password deve avere almeno 6 caratteri")
      return
    }

    const { data, error } = await sb.auth.signUp({
      email,
      password
    })

    if(error){
      setAuthStatus("Errore registrazione: " + error.message)
      return
    }

    if(data?.session?.user){
      setAuthStatus("Registrazione completata e login effettuato")
      showApp(data.session.user)
      return
    }

    setAuthStatus("Utente creato. Se non entra subito, disattiva la conferma email in Supabase.")
  }catch(err){
    setAuthStatus("Errore JS registrazione: " + err.message)
  }
}

async function resetPassword(){
  try{
    const email = qs("email").value.trim()

    if(!email){
      setAuthStatus("Inserisci prima l'email")
      return
    }

    const { error } = await sb.auth.resetPasswordForEmail(email)

    if(error){
      setAuthStatus("Errore reset password: " + error.message)
      return
    }

    setAuthStatus("Mail di reset inviata")
  }catch(err){
    setAuthStatus("Errore JS reset password: " + err.message)
  }
}

async function logout(){
  await sb.auth.signOut()
  showLogin()
  setAuthStatus("Logout effettuato")
}

async function savePresenza(){
  try{
    setAppStatus("")

    if(!currentUser){
      setAppStatus("Devi fare login")
      return
    }

    const nome = qs("nome").value.trim()
    const data = qs("data").value
    const stato = qs("stato").value
    const ore = Number(qs("ore").value || 0)
    const sede = qs("sede").value.trim()
    const note = qs("note").value.trim()

    if(!nome || !data){
      setAppStatus("Compila almeno nome e data")
      return
    }

    if(editingId){
      const { error } = await sb
        .from("presenze")
        .update({
          nome,
          data,
          stato,
          ore,
          sede,
          note
        })
        .eq("id", editingId)

      if(error){
        setAppStatus("Errore aggiornamento: " + error.message)
        return
      }

      setAppStatus("Presenza aggiornata")
      cancelEdit()
      await loadPresenze()
      return
    }

    const { error } = await sb
      .from("presenze")
      .insert([{
        user_id: currentUser.id,
        email: currentUser.email,
        nome,
        data,
        stato,
        ore,
        sede,
        note
      }])

    if(error){
      setAppStatus("Errore inserimento: " + error.message)
      return
    }

    clearForm()
    setAppStatus("Presenza salvata")
    await loadPresenze()
  }catch(err){
    setAppStatus("Errore JS salvataggio: " + err.message)
  }
}

async function deletePresenza(id){
  if(!confirm("Vuoi eliminare questa presenza?")) return

  const { error } = await sb
    .from("presenze")
    .delete()
    .eq("id", id)

  if(error){
    setAppStatus("Errore eliminazione: " + error.message)
    return
  }

  if(editingId === id){
    cancelEdit()
  }

  setAppStatus("Presenza eliminata")
  await loadPresenze()
}

async function loadPresenze(){
  if(!currentUser) return

  const { data, error } = await sb
    .from("presenze")
    .select("*")
    .order("data", { ascending:false })
    .order("id", { ascending:false })

  if(error){
    qs("tabella").innerHTML = `<tr><td colspan="7" class="empty">Errore caricamento: ${escapeHtml(error.message)}</td></tr>`
    return
  }

  presenze = data || []
  populateEmployeeFilter()
  renderAll()
}

function populateEmployeeFilter(){
  const select = qs("filterEmployee")
  const currentValue = select.value

  select.innerHTML = `<option value="">Tutti</option>`

  if(!isAdmin) return

  const uniqueNames = [...new Set(
    presenze.map(r => String(r.nome || "").trim()).filter(Boolean)
  )].sort((a,b) => a.localeCompare(b, "it"))

  uniqueNames.forEach(name => {
    const option = document.createElement("option")
    option.value = name
    option.textContent = name
    select.appendChild(option)
  })

  select.value = currentValue
}

function getFilteredPresenze(){
  const month = qs("filterMonth").value
  const state = qs("filterState").value
  const nameSearch = qs("filterName").value.trim().toLowerCase()
  const employee = isAdmin ? qs("filterEmployee").value : ""

  return presenze.filter(r => {
    const okMonth = !month || String(r.data || "").startsWith(month)
    const okState = !state || r.stato === state
    const okName = !nameSearch || String(r.nome || "").toLowerCase().includes(nameSearch)
    const okEmployee = !employee || String(r.nome || "") === employee
    return okMonth && okState && okName && okEmployee
  })
}

function renderSummary(rows){
  const totalRecord = rows.length
  const totalOre = rows.reduce((acc, r) => acc + Number(r.ore || 0), 0)
  const presenti = rows.filter(r => r.stato === "Presente").length
  const assenti = rows.filter(r => r.stato === "Assente").length
  const ferie = rows.filter(r => r.stato === "Ferie").length
  const permessi = rows.filter(r => r.stato === "Permesso").length

  qs("sumRecord").textContent = totalRecord
  qs("sumOre").textContent = totalOre.toFixed(2).replace(".00","")
  qs("sumPresenti").textContent = presenti
  qs("sumAssenti").textContent = assenti
  qs("sumFerie").textContent = ferie
  qs("sumPermessi").textContent = permessi
}

function renderTable(rows){


function editPresenza(id){
  const row = presenze.find(x => x.id === id)
  if(!row) return
  setEditMode(row)
}

function renderChart(rows){
  const chart = qs("chartBars")

  const totals = {
    Presente: 0,
    Assente: 0,
    Ferie: 0,
    Permesso: 0
  }

  rows.forEach(r => {
    totals[r.stato] = (totals[r.stato] || 0) + Number(r.ore || 0)
  })

  const maxValue = Math.max(...Object.values(totals), 1)

  const items = [
    { label:"Presente", value:totals.Presente, cls:"bar-presente" },
    { label:"Assente", value:totals.Assente, cls:"bar-assente" },
    { label:"Ferie", value:totals.Ferie, cls:"bar-ferie" },
    { label:"Permesso", value:totals.Permesso, cls:"bar-permesso" }
  ]

  chart.innerHTML = items.map(item => {
    const width = (item.value / maxValue) * 100
    return `
      <div class="bar-row">
        <div class="bar-label">${item.label}</div>
        <div class="bar-track">
          <div class="bar-fill ${item.cls}" style="width:${width}%"></div>
        </div>
        <div class="bar-value">${item.value.toFixed(2).replace(".00","")}</div>
      </div>
    `
  }).join("")
}

function generateReport(){
  const rows = getFilteredPresenze()

  const month = qs("filterMonth").value || "Tutti"
  const state = qs("filterState").value || "Tutti"
  const nameSearch = qs("filterName").value.trim() || "Tutti"
  const employee = isAdmin ? (qs("filterEmployee").value || "Tutti") : "Solo proprie"

  const totalOre = rows.reduce((acc, r) => acc + Number(r.ore || 0), 0)
  const presenti = rows.filter(r => r.stato === "Presente").length
  const assenti = rows.filter(r => r.stato === "Assente").length
  const ferie = rows.filter(r => r.stato === "Ferie").length
  const permessi = rows.filter(r => r.stato === "Permesso").length

  let text = ""
  text += `RIEPILOGO PRESENZE\n`
  text += `Utente: ${currentUser?.email || "-"}\n`
  text += `Ruolo: ${isAdmin ? "ADMIN" : "UTENTE"}\n`
  text += `Mese: ${month}\n`
  text += `Filtro stato: ${state}\n`
  text += `Ricerca nome: ${nameSearch}\n`
  text += `Filtro dipendente: ${employee}\n\n`
  text += `Totale record: ${rows.length}\n`
  text += `Totale ore: ${totalOre.toFixed(2).replace(".00","")}\n`
  text += `Presenti: ${presenti}\n`
  text += `Assenti: ${assenti}\n`
  text += `Ferie: ${ferie}\n`
  text += `Permessi: ${permessi}\n\n`
  text += `DETTAGLIO\n`
  text += `----------------------------------------\n`

  if(!rows.length){
    text += `Nessuna presenza trovata\n`
  }else{
    rows.forEach(r => {
      text += `${formatDate(r.data)} | ${r.nome} | ${r.stato} | Ore: ${Number(r.ore || 0).toFixed(2).replace(".00","")} | Sede: ${r.sede || "-"} | Note: ${r.note || "-"}\n`
    })
  }

  lastReportText = text
  qs("reportBox").textContent = text
}

async function copyReport(){
  if(!lastReportText){
    generateReport()
  }

  try{
    await navigator.clipboard.writeText(lastReportText)
    setAppStatus("Report copiato negli appunti")
  }catch(err){
    setAppStatus("Non sono riuscito a copiare il report")
  }
}

function sendMailReport(){
  if(!lastReportText){
    generateReport()
  }

  const subject = encodeURIComponent("Riepilogo presenze")
  const body = encodeURIComponent(lastReportText)
  window.location.href = `mailto:${BOSS_EMAIL}?subject=${subject}&body=${body}`
}

function exportCsv(){
  const rows = getFilteredPresenze()

  if(!rows.length){
    setAppStatus("Nessun dato da esportare")
    return
  }

  const headers = ["Nome","Data","Stato","Ore","Sede","Note","Email"]
  const csvRows = [headers.join(";")]

  rows.forEach(r => {
    const values = [
      r.nome || "",
      r.data || "",
      r.stato || "",
      String(r.ore ?? ""),
      r.sede || "",
      r.note || "",
      r.email || ""
    ].map(value => `"${String(value).replaceAll('"','""')}"`)
    csvRows.push(values.join(";"))
  })

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `presenze_${qs("filterMonth").value || "tutte"}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  setAppStatus("CSV esportato")
}

function resetFilters(){
  qs("filterMonth").value = currentMonthValue()
  qs("filterState").value = ""
  qs("filterName").value = ""
  if(isAdmin){
    qs("filterEmployee").value = ""
  }
  renderAll()
}

function renderAll(){
  const rows = getFilteredPresenze()
  renderSummary(rows)
  renderTable(rows)
  renderChart(rows)
  generateReport()
}

function bindEvents(){
  qs("btnLogin").addEventListener("click", login)
  qs("btnRegister").addEventListener("click", registerUser)
  qs("btnResetPassword").addEventListener("click", resetPassword)
  qs("btnLogout").addEventListener("click", logout)
  qs("saveBtn").addEventListener("click", savePresenza)
  qs("cancelEditBtn").addEventListener("click", cancelEdit)
  qs("btnResetFilters").addEventListener("click", resetFilters)
  qs("btnGenerateReport").addEventListener("click", generateReport)
  qs("btnCopyReport").addEventListener("click", copyReport)
  qs("btnSendReport").addEventListener("click", sendMailReport)
  qs("btnExportCsv").addEventListener("click", exportCsv)

  qs("filterMonth").addEventListener("change", renderAll)
  qs("filterState").addEventListener("change", renderAll)
  qs("filterName").addEventListener("input", renderAll)
  qs("filterEmployee").addEventListener("change", renderAll)
}

window.addEventListener("error", function(event){
  setAuthStatus("Errore JavaScript: " + event.message)
})

sb.auth.onAuthStateChange((_event, session) => {
  if(session?.user){
    showApp(session.user)
  }else{
    showLogin()
  }
})

window.addEventListener("DOMContentLoaded", () => {
  bindEvents()
  checkSession()
})
