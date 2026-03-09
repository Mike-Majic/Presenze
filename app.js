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
}

function setAppStatus(msg){
  const el = qs("appStatus")
  if(el) el.textContent = msg || ""
}

function todayISO(){
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,"0")
  const day = String(d.getDate()).padStart(2,"0")
  return `${y}-${m}-${day}`
}

function currentMonthValue(){
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,"0")
  return `${y}-${m}`
}

function formatDate(dateString){
  if(!dateString) return ""
  const [y,m,d] = dateString.split("-")
  return `${d}/${m}/${y}`
}

function showLogin(){
  qs("loginBox").classList.remove("hidden")
  qs("app").classList.add("hidden")
}

function showApp(user){

  currentUser = user
  isAdmin = user.email === ADMIN_EMAIL

  qs("loginBox").classList.add("hidden")
  qs("app").classList.remove("hidden")

  qs("userInfo").textContent = `Utente: ${user.email}`

  qs("roleInfo").innerHTML = isAdmin
  ? 'Ruolo: <span class="role-admin">ADMIN</span>'
  : 'Ruolo: <span class="role-user">UTENTE</span>'

  loadPresenze()
}

async function login(){

  const email = qs("email").value.trim()
  const password = qs("password").value.trim()

  const { data,error } = await sb.auth.signInWithPassword({
    email,
    password
  })

  if(error){
    setAuthStatus("Errore login: " + error.message)
    return
  }

  showApp(data.user)
}

async function registerUser(){

  const email = qs("email").value.trim()
  const password = qs("password").value.trim()

  const { error } = await sb.auth.signUp({
    email,
    password
  })

  if(error){
    setAuthStatus("Errore registrazione: " + error.message)
    return
  }

  setAuthStatus("Utente creato")
}

async function resetPassword(){

  const email = qs("email").value.trim()

  const { error } = await sb.auth.resetPasswordForEmail(email)

  if(error){
    setAuthStatus(error.message)
    return
  }

  setAuthStatus("Email reset inviata")
}

async function logout(){
  await sb.auth.signOut()
  showLogin()
}

async function savePresenza(){

  const nome = qs("nome").value
  const data = qs("data").value
  const stato = qs("stato").value
  const ore = Number(qs("ore").value || 0)
  const sede = qs("sede").value
  const note = qs("note").value

  if(editingId){

    await sb
      .from("presenze")
      .update({
        nome,
        data,
        stato,
        ore,
        sede,
        note
      })
      .eq("id",editingId)

    editingId = null

  }else{

    await sb
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

  loadPresenze()
}

async function deletePresenza(id){

  await sb
    .from("presenze")
    .delete()
    .eq("id",id)

  loadPresenze()
}

async function loadPresenze(){

  const { data } = await sb
    .from("presenze")
    .select("*")
    .order("data",{ascending:false})

  presenze = data || []

  renderTable(presenze)
}

function renderTable(rows){

  const tabella = qs("tabella")
  tabella.innerHTML = ""

  if(!rows.length){
    tabella.innerHTML = `<tr><td colspan="7">Nessuna presenza</td></tr>`
    return
  }

  rows.forEach(r=>{

    tabella.innerHTML += `
      <tr>
        <td data-label="Nome">${r.nome}</td>
        <td data-label="Data">${formatDate(r.data)}</td>
        <td data-label="Stato">${r.stato}</td>
        <td data-label="Ore">${r.ore}</td>
        <td data-label="Sede">${r.sede}</td>
        <td data-label="Note">${r.note}</td>
        <td data-label="Azioni">
          <button class="btn-blue" onclick="editPresenza(${r.id})">Modifica</button>
          <button class="btn-red" onclick="deletePresenza(${r.id})">Elimina</button>
        </td>
      </tr>
    `
  })
}

function editPresenza(id){

  const r = presenze.find(x=>x.id===id)

  editingId = id

  qs("nome").value = r.nome
  qs("data").value = r.data
  qs("stato").value = r.stato
  qs("ore").value = r.ore
  qs("sede").value = r.sede
  qs("note").value = r.note
}

function generateReport(){

  let text = "RIEPILOGO PRESENZE\n\n"

  presenze.forEach(r=>{
    text += `${formatDate(r.data)} - ${r.nome} - ${r.stato} - Ore:${r.ore}\n`
  })

  lastReportText = text

  qs("reportBox").textContent = text
}

async function copyReport(){

  await navigator.clipboard.writeText(lastReportText)

  setAppStatus("Report copiato")
}

function sendMailReport(){

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

  rows.forEach(r=>{
    csvRows.push([
      r.nome,
      r.data,
      r.stato,
      r.ore,
      r.sede,
      r.note,
      r.email
    ].join(";"))
  })

  const blob = new Blob([csvRows.join("\n")])
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = "presenze.csv"
  a.click()

  URL.revokeObjectURL(url)
}

function bindEvents(){

  qs("btnLogin").onclick = login
  qs("btnRegister").onclick = registerUser
  qs("btnResetPassword").onclick = resetPassword
  qs("btnLogout").onclick = logout

  qs("saveBtn").onclick = savePresenza

  qs("btnGenerateReport").onclick = generateReport
  qs("btnCopyReport").onclick = copyReport
  qs("btnSendReport").onclick = sendMailReport
  qs("btnExportCsv").onclick = exportCsv
}

window.addEventListener("DOMContentLoaded",()=>{
  bindEvents()
})

sb.auth.onAuthStateChange((_event,session)=>{
  if(session?.user){
    showApp(session.user)
  }else{
    showLogin()
  }
})
