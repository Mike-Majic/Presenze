const SUPABASE_URL = "https://nzmgjuwmrvjxpykzawkp.supabase.co"
const SUPABASE_KEY = "sb_publishable_lwd5Lahd5CirK_RlQmhcBA_PTo6c14v"

const ADMIN_EMAIL = "m.colurci@gmail.com"

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
}

function setAppStatus(msg){
  const el = qs("appStatus")
  if(el) el.textContent = msg || ""
}

function todayISO(){
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function formatDate(dateString){
  if(!dateString) return ""
  const [y, m, d] = dateString.split("-")
  return `${d}/${m}/${y}`
}

function showLogin(){
  const loginBox = qs("loginBox")
  const app = qs("app")

  if(loginBox) loginBox.classList.remove("hidden")
  if(app) app.classList.add("hidden")
}

async function showApp(user){
  currentUser = user
  isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()

  const loginBox = qs("loginBox")
  const app = qs("app")
  const userInfo = qs("userInfo")
  const roleInfo = qs("roleInfo")

  if(loginBox) loginBox.classList.add("hidden")
  if(app) app.classList.remove("hidden")

  if(userInfo){
    userInfo.textContent = `Utente: ${user.email || ""}`
  }

  if(roleInfo){
    roleInfo.innerHTML = isAdmin
      ? 'Ruolo: <span class="role-admin">ADMIN</span>'
      : 'Ruolo: <span class="role-user">UTENTE</span>'
  }

  await loadPresenze()
}

async function login(){
  const email = qs("email")?.value.trim() || ""
  const password = qs("password")?.value.trim() || ""

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

  setAuthStatus("")
  await showApp(data.user)
}

async function registerUser(){
  const email = qs("email")?.value.trim() || ""
  const password = qs("password")?.value.trim() || ""

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

  if(data?.user && !data?.session){
    setAuthStatus("Utente creato .. controlla la mail per confermare l'account")
    return
  }

  setAuthStatus("Utente creato con successo")
}

async function resetPassword(){
  const email = qs("email")?.value.trim() || ""

  if(!email){
    setAuthStatus("Inserisci l'email")
    return
  }

  const { error } = await sb.auth.resetPasswordForEmail(email)

  if(error){
    setAuthStatus("Errore reset password: " + error.message)
    return
  }

  setAuthStatus("Email reset inviata")
}

async function logout(){
  const { error } = await sb.auth.signOut()

  if(error){
    setAppStatus("Errore logout: " + error.message)
    return
  }

  currentUser = null
  presenze = []
  editingId = null
  showLogin()
}

async function savePresenza(){
  if(!currentUser){
    setAppStatus("Utente non autenticato")
    return
  }

  const nome = qs("nome")?.value.trim() || ""
  const data = qs("data")?.value || ""
  const stato = qs("stato")?.value || ""
  const ore = Number(qs("ore")?.value || 0)
  const sede = qs("sede")?.value.trim() || ""
  const note = qs("note")?.value.trim() || ""

  if(!nome || !data || !stato){
    setAppStatus("Compila almeno nome, data e stato")
    return
  }

  let result

  if(editingId){
    result = await sb
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

    editingId = null
  } else {
    result = await sb
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
  }

  if(result.error){
    setAppStatus("Errore salvataggio: " + result.error.message)
    return
  }

  clearForm()
  await loadPresenze()
  setAppStatus("Presenza salvata")
}

async function deletePresenza(id){
  const { error } = await sb
    .from("presenze")
    .delete()
    .eq("id", id)

  if(error){
    setAppStatus("Errore eliminazione: " + error.message)
    return
  }

  await loadPresenze()
  setAppStatus("Presenza eliminata")
}

async function loadPresenze(){
  const { data, error } = await sb
    .from("presenze")
    .select("*")
    .order("data", { ascending: false })

  if(error){
    presenze = []
    renderTable([])
    setAppStatus("Errore caricamento presenze: " + error.message)
    return
  }

  presenze = data || []
  renderTable(presenze)
}

function renderTable(rows){
  const tabella = qs("tabella")
  if(!tabella) return

  tabella.innerHTML = ""

  if(!rows.length){
    tabella.innerHTML = `<tr><td colspan="7">Nessuna presenza</td></tr>`
    return
  }

  rows.forEach(r => {
    const safeId = String(r.id)

    tabella.innerHTML += `
      <tr>
        <td data-label="Nome">${r.nome || ""}</td>
        <td data-label="Data">${formatDate(r.data || "")}</td>
        <td data-label="Stato">${r.stato || ""}</td>
        <td data-label="Ore">${r.ore ?? 0}</td>
        <td data-label="Sede">${r.sede || ""}</td>
        <td data-label="Note">${r.note || ""}</td>
        <td data-label="Azioni">
          <button type="button" class="btn-blue" onclick="editPresenza('${safeId}')">Modifica</button>
          <button type="button" class="btn-red" onclick="deletePresenza('${safeId}')">Elimina</button>
        </td>
      </tr>
    `
  })
}

function editPresenza(id){
  const r = presenze.find(x => String(x.id) === String(id))
  if(!r) return

  editingId = id

  if(qs("nome")) qs("nome").value = r.nome || ""
  if(qs("data")) qs("data").value = r.data || ""
  if(qs("stato")) qs("stato").value = r.stato || ""
  if(qs("ore")) qs("ore").value = r.ore ?? 0
  if(qs("sede")) qs("sede").value = r.sede || ""
  if(qs("note")) qs("note").value = r.note || ""

  setAppStatus("Modifica presenza in corso")
}

function clearForm(){
  if(qs("nome")) qs("nome").value = ""
  if(qs("data")) qs("data").value = todayISO()
  if(qs("stato")) qs("stato").value = "Presente"
  if(qs("ore")) qs("ore").value = "0"
  if(qs("sede")) qs("sede").value = ""
  if(qs("note")) qs("note").value = ""
}

function generateReport(){
  let text = "RIEPILOGO PRESENZE\n\n"

  presenze.forEach(r => {
    text += `${formatDate(r.data)} - ${r.nome} - ${r.stato} - Ore:${r.ore}\n`
  })

  lastReportText = text

  const reportBox = qs("reportBox")
  if(reportBox) reportBox.textContent = text
}

async function copyReport(){
  if(!lastReportText){
    setAppStatus("Genera prima il report")
    return
  }

  await navigator.clipboard.writeText(lastReportText)
  setAppStatus("Report copiato")
}

function sendMailReport(){
  if(!lastReportText){
    setAppStatus("Genera prima il report")
    return
  }

  const subject = encodeURIComponent("Riepilogo presenze")
  const body = encodeURIComponent(lastReportText)

  window.location.href = `mailto:${BOSS_EMAIL}?subject=${subject}&body=${body}`
}

function exportCsv(){
  const rows = presenze

  if(!rows.length){
    setAppStatus("Nessun dato")
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
    ].map(value => `"${String(value).replaceAll('"', '""')}"`)

    csvRows.push(values.join(";"))
  })

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = "presenze.csv"
  a.click()

  URL.revokeObjectURL(url)
  setAppStatus("CSV esportato")
}

function bindEvents(){
  if(qs("btnLogin")) qs("btnLogin").onclick = login
  if(qs("btnRegister")) qs("btnRegister").onclick = registerUser
  if(qs("btnResetPassword")) qs("btnResetPassword").onclick = resetPassword
  if(qs("btnLogout")) qs("btnLogout").onclick = logout
  if(qs("saveBtn")) qs("saveBtn").onclick = savePresenza
  if(qs("btnGenerateReport")) qs("btnGenerateReport").onclick = generateReport
  if(qs("btnCopyReport")) qs("btnCopyReport").onclick = copyReport
  if(qs("btnSendReport")) qs("btnSendReport").onclick = sendMailReport
  if(qs("btnExportCsv")) qs("btnExportCsv").onclick = exportCsv
}

window.addEventListener("DOMContentLoaded", async () => {
  bindEvents()

  if(qs("data")) qs("data").value = todayISO()

  const { data } = await sb.auth.getSession()

  if(data?.session?.user){
    await showApp(data.session.user)
  } else {
    showLogin()
  }
})

sb.auth.onAuthStateChange(async (_event, session) => {
  if(session?.user){
    await showApp(session.user)
  } else {
    showLogin()
  }
})
