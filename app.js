const SUPABASE_URL = "https://nzmgjuwmrvjxpykzawkp.supabase.co"
const SUPABASE_KEY = "sb_publishable_lwd5Lahd5CirK_RlQmhcBA_PTo6c14v"

const ADMIN_EMAIL = "m.colurci@gmail.com"

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let currentUser = null
let currentProfile = null
let isAdmin = false
let presenze = []
let editingId = null
let isRegisterMode = false

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

function currentMonthValue(){
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

function formatDate(dateString){
  if(!dateString) return ""
  const [y, m, d] = dateString.split("-")
  return `${d}/${m}/${y}`
}

function getDisplayName(profile, fallbackEmail = ""){
  const nome = (profile?.nome || "").trim()
  const cognome = (profile?.cognome || "").trim()
  const full = `${nome} ${cognome}`.trim()
  return full || fallbackEmail || "-"
}

function showRegisterMode(){
  isRegisterMode = true
  if(qs("registerFields")) qs("registerFields").classList.remove("hidden")
  if(qs("btnRegister")) qs("btnRegister").classList.remove("hidden")
  if(qs("btnCancelRegister")) qs("btnCancelRegister").classList.remove("hidden")
  if(qs("btnRegisterMode")) qs("btnRegisterMode").classList.add("hidden")
  setAuthStatus("Compila nome, cognome, email e password per registrarti")
}

function hideRegisterMode(){
  isRegisterMode = false
  if(qs("registerFields")) qs("registerFields").classList.add("hidden")
  if(qs("btnRegister")) qs("btnRegister").classList.add("hidden")
  if(qs("btnCancelRegister")) qs("btnCancelRegister").classList.add("hidden")
  if(qs("btnRegisterMode")) qs("btnRegisterMode").classList.remove("hidden")
  setAuthStatus("")
}

function showLogin(){
  const loginBox = qs("loginBox")
  const app = qs("app")

  if(loginBox) loginBox.classList.remove("hidden")
  if(app) app.classList.add("hidden")

  hideRegisterMode()
}

async function loadMyProfile(user){
  if(!user?.id) return null

  const { data, error } = await sb
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  if(error){
    console.error("LOAD PROFILE ERROR", error)
    return null
  }

  return data || null
}

async function createOrUpdateMyProfile(user, nome, cognome){
  const payload = {
    user_id: user.id,
    email: user.email,
    nome: (nome || "").trim(),
    cognome: (cognome || "").trim()
  }

  const { data, error } = await sb
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single()

  if(error){
    console.error("UPSERT PROFILE ERROR", error)
    throw error
  }

  return data
}

async function ensureProfileFromMetadata(user){
  if(!user?.id) return null

  let profile = await loadMyProfile(user)
  if(profile) return profile

  const nome = user.user_metadata?.nome || ""
  const cognome = user.user_metadata?.cognome || ""

  if(nome || cognome){
    try{
      profile = await createOrUpdateMyProfile(user, nome, cognome)
      return profile
    }catch(err){
      console.error("ENSURE PROFILE FROM METADATA ERROR", err)
    }
  }

  return null
}

async function checkBlockedStatus(user){
  if(!user?.id) return false
  if((user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()) return false

  const { data, error } = await sb
    .from("user_admin_meta")
    .select("is_blocked")
    .eq("user_id", user.id)
    .single()

  if(error){
    console.warn("BLOCK CHECK ERROR", error)
    return false
  }

  return !!data?.is_blocked
}

async function showApp(user){
  currentUser = user
  isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()

  const blocked = await checkBlockedStatus(user)
  if(blocked){
    await sb.auth.signOut()
    currentUser = null
    currentProfile = null
    isAdmin = false
    showLogin()
    setAuthStatus("Il tuo account è stato bloccato dall'amministratore")
    return
  }

  currentProfile = await ensureProfileFromMetadata(user)

  const loginBox = qs("loginBox")
  const app = qs("app")
  const userInfo = qs("userInfo")
  const roleInfo = qs("roleInfo")
  const adminFilterWrap = qs("adminFilterWrap")
  const btnManageUsers = qs("btnManageUsers")

  if(loginBox) loginBox.classList.add("hidden")
  if(app) app.classList.remove("hidden")

  if(userInfo){
    userInfo.textContent = `Dipendente: ${getDisplayName(currentProfile, user.email || "")}`
  }

  if(roleInfo){
    roleInfo.innerHTML = isAdmin
      ? 'Ruolo: <span class="role-admin">ADMIN</span>'
      : 'Ruolo: <span class="role-user">UTENTE</span>'
  }

  if(adminFilterWrap){
    adminFilterWrap.classList.toggle("hidden", !isAdmin)
  }

  if(btnManageUsers){
    btnManageUsers.classList.toggle("hidden", !isAdmin)
  }

  clearForm()

  if(qs("filterMonth") && !qs("filterMonth").value){
    qs("filterMonth").value = currentMonthValue()
  }

  await loadPresenze()
}

async function login(){
  try{
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
  }catch(err){
    console.error("LOGIN ERROR", err)
    setAuthStatus("Errore login")
  }
}

async function registerUser(){
  try{
    const nome = qs("nomeRegister")?.value.trim() || ""
    const cognome = qs("cognomeRegister")?.value.trim() || ""
    const email = qs("email")?.value.trim() || ""
    const password = qs("password")?.value.trim() || ""

    if(!nome || !cognome || !email || !password){
      setAuthStatus("Compila nome, cognome, email e password")
      return
    }

    if(password.length < 6){
      setAuthStatus("La password deve avere almeno 6 caratteri")
      return
    }

    const result = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
          cognome
        }
      }
    })

    const { data, error } = result

    if(error){
      const msg = (error.message || "").toLowerCase()

      if(msg.includes("email rate limit exceeded") || msg.includes("rate limit")){
        setAuthStatus("Hai fatto troppe richieste in poco tempo .. aspetta un attimo e riprova.")
        return
      }

      setAuthStatus("Errore registrazione: " + error.message)
      return
    }

    if(data?.user){
      try{
        await createOrUpdateMyProfile(data.user, nome, cognome)
      }catch(profileError){
        console.error("PROFILE CREATE ERROR", profileError)
      }
    }

    if(data?.user && !data?.session){
      setAuthStatus("Utente creato .. controlla la mail per confermare l'account")
      hideRegisterMode()
      return
    }

    setAuthStatus("Utente creato con successo")
    hideRegisterMode()
  }catch(err){
    console.error("REGISTER ERROR", err)
    setAuthStatus("Errore registrazione")
  }
}

async function resetPassword(){
  try{
    const email = qs("email")?.value.trim() || ""

    if(!email){
      setAuthStatus("Inserisci l'email dell'account")
      return
    }

    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    })

    if(error){
      setAuthStatus("Errore reset password: " + error.message)
      return
    }

    setAuthStatus("Email reset inviata .. controlla la posta")
  }catch(err){
    console.error("RESET PASSWORD ERROR", err)
    setAuthStatus("Errore reset password")
  }
}

async function logout(){
  try{
    const { error } = await sb.auth.signOut({ scope: "local" })

    if(error){
      setAppStatus("Errore logout: " + error.message)
      return
    }

    currentUser = null
    currentProfile = null
    isAdmin = false
    presenze = []
    editingId = null

    renderTable([])
    clearForm()
    showLogin()
    setAuthStatus("Logout effettuato")
  }catch(err){
    console.error("LOGOUT ERROR", err)
    setAppStatus("Errore logout")
  }
}

async function savePresenza(){
  try{
    if(!currentUser){
      setAppStatus("Utente non autenticato")
      return
    }

    const nome = qs("nome")?.value.trim() || getDisplayName(currentProfile, "")
    const data = qs("data")?.value || ""
    const stato = qs("stato")?.value || ""
    const ore = Number(qs("ore")?.value || 0)
    const sede = qs("sede")?.value || "Sielte Pomezia"
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
        .select()
    }else{
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
        .select()
    }

    if(result.error){
      setAppStatus("Errore salvataggio: " + result.error.message)
      return
    }

    editingId = null
    clearForm()
    await loadPresenze()
    setAppStatus("Presenza salvata")
  }catch(err){
    console.error("SAVE ERROR", err)
    setAppStatus("Errore salvataggio")
  }
}

async function deletePresenza(id){
  try{
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
  }catch(err){
    console.error("DELETE ERROR", err)
    setAppStatus("Errore eliminazione")
  }
}

async function loadPresenze(){
  try{
    const { data, error } = await sb
      .from("presenze")
      .select("*")
      .order("data", { ascending: false })

    if(error){
      presenze = []
      renderTable([])
      updateSummary([])
      fillEmployeeFilter([])
      setAppStatus("Errore caricamento presenze: " + error.message)
      return
    }

    presenze = data || []
    fillEmployeeFilter(presenze)
    applyFilters()
  }catch(err){
    console.error("LOAD ERROR", err)
    presenze = []
    renderTable([])
    updateSummary([])
    setAppStatus("Errore caricamento presenze")
  }
}

function getFilteredPresenze(){
  const month = qs("filterMonth")?.value || ""
  const state = qs("filterState")?.value || ""
  const name = (qs("filterName")?.value || "").trim().toLowerCase()
  const employee = qs("filterEmployee")?.value || ""

  return presenze.filter(r => {
    const rowMonth = String(r.data || "").slice(0, 7)
    const rowState = r.stato || ""
    const rowName = (r.nome || "").toLowerCase()

    if(month && rowMonth !== month) return false
    if(state && rowState !== state) return false
    if(name && !rowName.includes(name)) return false
    if(employee && (r.nome || "") !== employee) return false

    if(!isAdmin && currentUser?.email && r.email !== currentUser.email){
      return false
    }

    return true
  })
}

function applyFilters(){
  const rows = getFilteredPresenze()
  renderTable(rows)
  updateSummary(rows)
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
          <div class="table-buttons">
            <button type="button" class="btn-blue" onclick="editPresenza('${safeId}')">Modifica</button>
            <button type="button" class="btn-red" onclick="deletePresenza('${safeId}')">Elimina</button>
          </div>
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
  if(qs("stato")) qs("stato").value = r.stato || "Presente"
  if(qs("ore")) qs("ore").value = r.ore ?? 0
  if(qs("sede")) qs("sede").value = r.sede || "Sielte Pomezia"
  if(qs("note")) qs("note").value = r.note || ""

  if(qs("formTitle")) qs("formTitle").textContent = "Modifica presenza"
  if(qs("cancelEditBtn")) qs("cancelEditBtn").classList.remove("hidden")
}

function cancelEdit(){
  editingId = null
  clearForm()
  if(qs("formTitle")) qs("formTitle").textContent = "Inserisci presenza"
  if(qs("cancelEditBtn")) qs("cancelEditBtn").classList.add("hidden")
}

function clearForm(){
  if(qs("nome")) qs("nome").value = getDisplayName(currentProfile, "")
  if(qs("data")) qs("data").value = todayISO()
  if(qs("stato")) qs("stato").value = "Presente"
  if(qs("ore")) qs("ore").value = "0"
  if(qs("sede")) qs("sede").value = "Sielte Pomezia"
  if(qs("note")) qs("note").value = ""
}

function resetFilters(){
  if(qs("filterMonth")) qs("filterMonth").value = currentMonthValue()
  if(qs("filterState")) qs("filterState").value = ""
  if(qs("filterName")) qs("filterName").value = ""
  if(qs("filterEmployee")) qs("filterEmployee").value = ""
  applyFilters()
}

function fillEmployeeFilter(rows){
  const select = qs("filterEmployee")
  if(!select) return

  const current = select.value
  const names = [...new Set(rows.map(r => r.nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"))

  select.innerHTML = `<option value="">Tutti</option>`

  names.forEach(name => {
    const opt = document.createElement("option")
    opt.value = name
    opt.textContent = name
    select.appendChild(opt)
  })

  select.value = names.includes(current) ? current : ""
}

function updateSummary(rows){
  const totalRecords = rows.length
  const totalOre = rows.reduce((acc, r) => acc + Number(r.ore || 0), 0)
  const presenti = rows.filter(r => r.stato === "Presente").length
  const ferie = rows.filter(r => r.stato === "Ferie").length
  const permessi = rows.filter(r => r.stato === "Permesso").length
  const malattia = rows.filter(r => r.stato === "Malattia").length
  const lutto = rows.filter(r => r.stato === "Lutto").length
  const maternita = rows.filter(r => r.stato === "Maternità").length
  const legge104 = rows.filter(r => r.stato === "104").length

  if(qs("sumRecord")) qs("sumRecord").textContent = String(totalRecords)
  if(qs("sumOre")) qs("sumOre").textContent = String(totalOre)
  if(qs("sumPresenti")) qs("sumPresenti").textContent = String(presenti)
  if(qs("sumFerie")) qs("sumFerie").textContent = String(ferie)
  if(qs("sumPermessi")) qs("sumPermessi").textContent = String(permessi)
  if(qs("sumMalattia")) qs("sumMalattia").textContent = String(malattia)
  if(qs("sumLutto")) qs("sumLutto").textContent = String(lutto)
  if(qs("sumMaternita")) qs("sumMaternita").textContent = String(maternita)
  if(qs("sum104")) qs("sum104").textContent = String(legge104)
}

function exportCsv(){
  const rows = getFilteredPresenze()

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
  a.download = `presenze_${qs("filterMonth")?.value || "tutte"}.csv`
  a.click()

  URL.revokeObjectURL(url)
  setAppStatus("CSV esportato")
}

function goManageUsers(){
  window.location.href = "/users.html"
}

function bindEvents(){
  if(qs("btnLogin")) qs("btnLogin").onclick = login
  if(qs("btnRegisterMode")) qs("btnRegisterMode").onclick = showRegisterMode
  if(qs("btnRegister")) qs("btnRegister").onclick = registerUser
  if(qs("btnCancelRegister")) qs("btnCancelRegister").onclick = hideRegisterMode
  if(qs("btnResetPassword")) qs("btnResetPassword").onclick = resetPassword
  if(qs("btnLogout")) qs("btnLogout").onclick = logout
  if(qs("btnManageUsers")) qs("btnManageUsers").onclick = goManageUsers

  if(qs("saveBtn")) qs("saveBtn").onclick = savePresenza
  if(qs("cancelEditBtn")) qs("cancelEditBtn").onclick = cancelEdit

  if(qs("btnExportCsv")) qs("btnExportCsv").onclick = exportCsv
  if(qs("btnResetFilters")) qs("btnResetFilters").onclick = resetFilters

  if(qs("filterMonth")) qs("filterMonth").onchange = applyFilters
  if(qs("filterState")) qs("filterState").onchange = applyFilters
  if(qs("filterName")) qs("filterName").oninput = applyFilters
  if(qs("filterEmployee")) qs("filterEmployee").onchange = applyFilters
}

window.addEventListener("DOMContentLoaded", async () => {
  bindEvents()
  clearForm()

  if(qs("filterMonth")) qs("filterMonth").value = currentMonthValue()

  const { data, error } = await sb.auth.getSession()

  if(data?.session?.user){
    await showApp(data.session.user)
  } else {
    showLogin()
  }

  if(error){
    console.error("SESSION CHECK ERROR", error)
  }
})

sb.auth.onAuthStateChange(async (_event, session) => {
  if(session?.user){
    await showApp(session.user)
  } else {
    showLogin()
  }
})
