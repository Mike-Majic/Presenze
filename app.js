const SUPABASE_URL = "https://nzmgjuwmrvjxpykzawkp.supabase.co"
const SUPABASE_KEY = "sb_publishable_lwd5Lahd5CirK_RlQmhcBA_PTo6c14v"

const ADMIN_EMAIL = "m.colurci@gmail.com"

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

let currentUser = null
let currentProfile = null
let isAdmin = false
let presenze = []
let editingId = null
let isRegisterMode = false
let loginInCorso = false
let registerInCorso = false
let helpRequestInCorso = false
let resetRequestInCorso = false
let supportRequests = []
let showAppInCorso = false
let lastShownUserId = null

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

function setModalStatus(id, msg){
  const el = qs(id)
  if(el) el.textContent = msg || ""
}

function formatRemainingTime(ms){
  const totalMinutes = Math.ceil(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if(hours <= 0) return `${minutes} minuti`
  if(minutes === 0) return `${hours} ore`
  return `${hours} ore e ${minutes} minuti`
}

async function invokeEdgeFunction(functionName, payload){
  const { data, error } = await sb.functions.invoke(functionName, {
    body: payload
  })

  if(error) throw error
  if(data?.error) throw new Error(data.error)

  return data || {}
}

async function apiFetch(path, options = {}){
  const { data: sessionData, error: sessionError } = await sb.auth.getSession()

  if(sessionError || !sessionData?.session){
    throw new Error("Sessione non valida")
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${sessionData.session.access_token}`
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const data = await response.json().catch(() => ({}))

  if(!response.ok){
    throw new Error(data.error || "Errore API")
  }

  return data
}

function showOverlay(){
  if(qs("overlay")) qs("overlay").classList.remove("hidden")
}

function hideOverlay(){
  if(qs("overlay")) qs("overlay").classList.add("hidden")
}

function openModal(modalId){
  const modal = qs(modalId)
  if(!modal) return
  modal.classList.remove("hidden")
  showOverlay()
}

function closeModal(modalId){
  const modal = qs(modalId)
  if(!modal) return
  modal.classList.add("hidden")

  const helpHidden = qs("helpModal")?.classList.contains("hidden") !== false
  const resetHidden = qs("resetRequestModal")?.classList.contains("hidden") !== false

  if(helpHidden && resetHidden){
    hideOverlay()
  }
}

function fillLoginSupportDefaults(){
  const email = qs("email")?.value.trim() || ""

  if(qs("helpEmail") && !qs("helpEmail").value.trim()){
    qs("helpEmail").value = email
  }

  if(qs("resetRequestEmail") && !qs("resetRequestEmail").value.trim()){
    qs("resetRequestEmail").value = email
  }
}

function togglePasswordVisibility(){
  const input = qs("password")
  const btn = qs("btnTogglePassword")
  if(!input || !btn) return

  const show = input.type === "password"
  input.type = show ? "text" : "password"
  btn.textContent = show ? "🙈" : "👁"
}

function openHelpModal(){
  fillLoginSupportDefaults()
  setModalStatus("helpStatus", "")
  openModal("helpModal")
}

function closeHelpModal(){
  closeModal("helpModal")
}

function openResetRequestModal(){
  fillLoginSupportDefaults()
  setModalStatus("resetRequestStatus", "")
  openModal("resetRequestModal")
}

function closeResetRequestModal(){
  closeModal("resetRequestModal")
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

function formatDateTime(value){
  if(!value) return "-"
  const d = new Date(value)
  if(Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString("it-IT")
}

function supportTypeLabel(type){
  if(type === "help") return "AIUTO"
  if(type === "reset_password") return "RESET PASSWORD"
  return type || "-"
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

  showAppInCorso = false
  lastShownUserId = null

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
  console.log("SHOW APP START", user)

  if(!user?.id) return

  if(showAppInCorso && lastShownUserId === user.id){
    console.log("SHOW APP BLOCCATA PER DOPPIO AVVIO")
    return
  }

  showAppInCorso = true
  lastShownUserId = user.id

  try{
    currentUser = user
    isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
    console.log("SHOW APP STEP 1 OK", { email: user.email, isAdmin })

    const blocked = await checkBlockedStatus(user)
    console.log("SHOW APP STEP 2 BLOCK CHECK", blocked)

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
    console.log("SHOW APP STEP 3 PROFILE", currentProfile)

    const loginBox = qs("loginBox")
    const app = qs("app")
    const userInfo = qs("userInfo")
    const roleInfo = qs("roleInfo")
    const adminFilterWrap = qs("adminFilterWrap")
    const btnManageUsers = qs("btnManageUsers")
    const adminSupportCard = qs("adminSupportCard")

    if(loginBox) loginBox.classList.add("hidden")
    if(app) app.classList.remove("hidden")
    console.log("SHOW APP STEP 4 UI OK")

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

    if(adminSupportCard){
      adminSupportCard.classList.toggle("hidden", !isAdmin)
    }

    clearForm()
    console.log("SHOW APP STEP 5 CLEAR FORM OK")

    if(qs("filterMonth") && !qs("filterMonth").value){
      qs("filterMonth").value = currentMonthValue()
    }

    await loadPresenze()
    console.log("SHOW APP STEP 6 LOAD PRESENZE OK")

    if(isAdmin){
      await loadSupportRequests()
      console.log("SHOW APP STEP 7 SUPPORT OK")
    }

    console.log("SHOW APP FINE OK")
  }catch(err){
    console.error("SHOW APP ERROR", err)
    setAuthStatus("Errore nel caricamento dell'app")
    showLogin()
  }finally{
    showAppInCorso = false
  }
}

async function login(){
  if(loginInCorso) return

  try{
    const email = qs("email")?.value.trim() || ""
    const password = qs("password")?.value || ""
    const btn = qs("btnLogin")

    if(!email || !password){
      setAuthStatus("Inserisci email e password")
      return
    }

    loginInCorso = true
    if(btn) btn.disabled = true
    setAuthStatus("Accesso in corso ..")

    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password
    })

    console.log("LOGIN RESULT", { data, error })

    if(error){
      const msg = (error.message || "").toLowerCase()

      if(msg.includes("invalid login credentials")){
        setAuthStatus("Email o password non corrette")
        return
      }

      if(msg.includes("email not confirmed")){
        setAuthStatus("Devi prima confermare la mail dell'account")
        return
      }

      if(msg.includes("too many requests") || msg.includes("rate limit")){
        setAuthStatus("Troppi tentativi ravvicinati .. aspetta un attimo e riprova")
        return
      }

      setAuthStatus("Errore login: " + error.message)
      return
    }

    const user = data?.session?.user || data?.user

    if(!user){
      setAuthStatus("Login riuscito ma sessione non disponibile .. riprova")
      return
    }

    setAuthStatus("")
  }catch(err){
    console.error("LOGIN ERROR", err)
    setAuthStatus("Errore login")
  }finally{
    loginInCorso = false
    const btn = qs("btnLogin")
    if(btn) btn.disabled = false
  }
}

async function registerUser(){
  if(registerInCorso) return

  try{
    const nome = qs("nomeRegister")?.value.trim() || ""
    const cognome = qs("cognomeRegister")?.value.trim() || ""
    const email = qs("email")?.value.trim() || ""
    const password = qs("password")?.value || ""
    const btn = qs("btnRegister")

    if(!nome || !cognome || !email || !password){
      setAuthStatus("Compila nome, cognome, email e password")
      return
    }

    if(password.length < 6){
      setAuthStatus("La password deve avere almeno 6 caratteri")
      return
    }

    registerInCorso = true
    if(btn) btn.disabled = true

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome,
          cognome
        }
      }
    })

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
  }finally{
    registerInCorso = false
    const btn = qs("btnRegister")
    if(btn) btn.disabled = false
  }
}

async function sendResetRequest(){
  if(resetRequestInCorso) return

  const email = qs("resetRequestEmail")?.value.trim() || qs("email")?.value.trim() || ""
  const note = qs("resetRequestNote")?.value.trim() || ""
  const btn = qs("btnSendResetRequest")

  if(!email){
    setModalStatus("resetRequestStatus", "Inserisci la mail dell'account")
    return
  }

  try{
    resetRequestInCorso = true
    if(btn) btn.disabled = true
    setModalStatus("resetRequestStatus", "Invio richiesta in corso ..")

    await invokeEdgeFunction("reset-request", {
      email,
      note
    })

    setModalStatus("resetRequestStatus", "Richiesta inviata .. verrai ricontattato appena possibile.")
    if(qs("resetRequestNote")) qs("resetRequestNote").value = ""
  }catch(err){
    console.error("RESET REQUEST ERROR", err)
    setModalStatus("resetRequestStatus", "Errore invio richiesta: " + (err.message || "errore sconosciuto"))
  }finally{
    resetRequestInCorso = false
    if(btn) btn.disabled = false
  }
}

async function sendHelpRequest(){
  if(helpRequestInCorso) return

  const email = qs("helpEmail")?.value.trim() || qs("email")?.value.trim() || ""
  const note = qs("helpMessage")?.value.trim() || ""
  const btn = qs("btnSendHelp")

  if(!email){
    setModalStatus("helpStatus", "Inserisci la mail dell'account")
    return
  }

  if(!note){
    setModalStatus("helpStatus", "Scrivi il problema che stai riscontrando")
    return
  }

  try{
    helpRequestInCorso = true
    if(btn) btn.disabled = true
    setModalStatus("helpStatus", "Invio richiesta in corso ..")

    await invokeEdgeFunction("help-request", {
      email,
      message: note
    })

    setModalStatus("helpStatus", "Richiesta inviata con successo")
    if(qs("helpMessage")) qs("helpMessage").value = ""
  }catch(err){
    console.error("HELP REQUEST ERROR", err)
    setModalStatus("helpStatus", "Errore invio richiesta: " + (err.message || "errore sconosciuto"))
  }finally{
    helpRequestInCorso = false
    if(btn) btn.disabled = false
  }
}

async function loadSupportRequests(){
  if(!isAdmin) return

  try{
    const data = await apiFetch("/api/support-requests")
    supportRequests = Array.isArray(data?.requests) ? data.requests : []
    renderSupportRequests()
  }catch(err){
    console.error("LOAD SUPPORT REQUESTS ERROR", err)
    setAppStatus("Errore caricamento richieste supporto")
  }
}

function renderSupportRequests(){
  const tbody = qs("supportTableBody")
  if(!tbody) return

  tbody.innerHTML = ""

  if(!supportRequests.length){
    tbody.innerHTML = `<tr><td colspan="7">Nessuna richiesta</td></tr>`
    return
  }

  supportRequests.forEach(item => {
    const tr = document.createElement("tr")
    const statusBadge = item.status === "done"
      ? '<span class="status done">Completata</span>'
      : item.status === "in_progress"
        ? '<span class="status pending">In lavorazione</span>'
        : '<span class="status assente">Aperta</span>'

    tr.innerHTML = `
      <td>${supportTypeLabel(item.type)}</td>
      <td>${item.email || "-"}</td>
      <td>${item.message || item.note || "-"}</td>
      <td>${statusBadge}</td>
      <td>${formatDateTime(item.created_at)}</td>
      <td>${item.handled_by || "-"}</td>
      <td>
        <div class="actions">
          <button class="btn secondary" onclick="updateSupportRequest('${item.id}','in_progress')">In lavorazione</button>
          <button class="btn success" onclick="updateSupportRequest('${item.id}','done')">Chiudi</button>
        </div>
      </td>
    `
    tbody.appendChild(tr)
  })
}

async function updateSupportRequest(id, status){
  if(!isAdmin) return

  try{
    await apiFetch(`/api/support-requests/${id}`, {
      method: "PATCH",
      body: { status }
    })

    await loadSupportRequests()
    setAppStatus("Richiesta aggiornata")
  }catch(err){
    console.error("UPDATE SUPPORT REQUEST ERROR", err)
    setAppStatus("Errore aggiornamento richiesta")
  }
}

function clearForm(){
  if(qs("nome")) qs("nome").value = currentProfile ? getDisplayName(currentProfile, currentUser?.email || "") : ""
  if(qs("data")) qs("data").value = todayISO()
  if(qs("stato")) qs("stato").value = "Presente"
  if(qs("ore")) qs("ore").value = ""
  if(qs("sede")) qs("sede").value = ""
  if(qs("note")) qs("note").value = ""
  editingId = null
  if(qs("saveBtn")) qs("saveBtn").textContent = "Salva presenza"
  if(qs("cancelEditBtn")) qs("cancelEditBtn").classList.add("hidden")
}

async function loadPresenze(){
  console.log("LOAD PRESENZE START")
  setAppStatus("Caricamento in corso ..")

  let query = sb
    .from("presenze")
    .select("*")
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })

  if(!isAdmin && currentUser?.email){
    query = query.eq("email", currentUser.email)
  }

  const { data, error } = await query
  console.log("LOAD PRESENZE RESULT", { data, error })

  if(error){
    console.error("LOAD PRESENZE ERROR", error)
    setAppStatus("Errore caricamento dati")
    return
  }

  presenze = data || []
  renderTable(getFilteredPresenze())
  populateEmployeeFilter()
  setAppStatus("")
}

function getFilteredPresenze(){
  const month = qs("filterMonth")?.value || ""
  const state = qs("filterState")?.value || ""
  const name = (qs("filterName")?.value || "").trim().toLowerCase()
  const employee = qs("filterEmployee")?.value || ""

  return presenze.filter(r => {
    if(month && !String(r.data || "").startsWith(month)) return false
    if(state && (r.stato || "") !== state) return false
    if(employee && (r.email || "") !== employee) return false

    if(name){
      const target = `${r.nome || ""} ${r.email || ""}`.toLowerCase()
      if(!target.includes(name)) return false
    }

    return true
  })
}

function populateEmployeeFilter(){
  const select = qs("filterEmployee")
  if(!select) return

  const currentValue = select.value || ""
  const employees = [...new Set(
    presenze
      .map(r => ({ email: r.email || "", nome: r.nome || r.email || "" }))
      .filter(r => r.email)
      .map(r => JSON.stringify(r))
  )]
    .map(item => JSON.parse(item))
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"))

  select.innerHTML = `<option value="">Tutti i dipendenti</option>`

  employees.forEach(item => {
    const option = document.createElement("option")
    option.value = item.email
    option.textContent = item.nome
    select.appendChild(option)
  })

  if([...select.options].some(opt => opt.value === currentValue)){
    select.value = currentValue
  }
}

function applyFilters(){
  const rows = getFilteredPresenze()
  renderTable(rows)
  updateSummary(rows)
}

function updateSummary(rows){
  const totalRecords = rows.length
  const totalOre = rows.reduce((acc, r) => acc + Number(r.ore || 0), 0)
  const presenti = rows.filter(r => r.stato === "Presente").length
  const ferie = rows.filter(r => r.stato === "Ferie").length
  const permessi = rows.filter(r => r.stato === "Permesso").length
  const assenti = rows.filter(r => r.stato !== "Presente").length

  if(qs("totalRecords")) qs("totalRecords").textContent = totalRecords
  if(qs("totalOre")) qs("totalOre").textContent = totalOre.toFixed(1)
  if(qs("totalPresenti")) qs("totalPresenti").textContent = presenti
  if(qs("totalFerie")) qs("totalFerie").textContent = ferie
  if(qs("totalPermessi")) qs("totalPermessi").textContent = permessi
  if(qs("totalAssenti")) qs("totalAssenti").textContent = assenti
}

function renderTable(rows){
  const tabella = qs("tabella")
  if(!tabella) return

  tabella.innerHTML = ""

  if(!rows.length){
    tabella.innerHTML = `<tr><td colspan="7">Nessuna presenza</td></tr>`
    updateSummary(rows)
    return
  }

  rows.forEach(r => {
    const tr = document.createElement("tr")

    tr.innerHTML = `
      <td>${formatDate(r.data)}</td>
      <td>${r.nome || ""}</td>
      <td><span class="status ${getStatusClass(r.stato)}">${r.stato || ""}</span></td>
      <td>${Number(r.ore || 0).toFixed(1)}</td>
      <td>${r.sede || ""}</td>
      <td>${r.note || ""}</td>
      <td class="actions">
        <button class="btn secondary" onclick="editPresenza('${r.id}')">Modifica</button>
        <button class="btn danger" onclick="deletePresenza('${r.id}')">Elimina</button>
      </td>
    `

    tabella.appendChild(tr)
  })

  updateSummary(rows)
}

function getStatusClass(stato){
  if(stato === "Presente") return "presente"
  if(stato === "Ferie") return "ferie"
  if(stato === "Permesso") return "permesso"
  return "assente"
}

async function savePresenza(){
  if(!currentUser) return

  const nome = qs("nome")?.value.trim() || getDisplayName(currentProfile, currentUser.email || "")
  const data = qs("data")?.value || ""
  const stato = qs("stato")?.value || "Presente"
  const ore = Number(qs("ore")?.value || 0)
  const sede = qs("sede")?.value.trim() || ""
  const note = qs("note")?.value.trim() || ""

  if(!nome || !data){
    setAppStatus("Compila almeno nome e data")
    return
  }

  const payload = {
    nome,
    data,
    stato,
    ore,
    sede,
    note,
    email: currentUser.email
  }

  let query = sb.from("presenze")

  if(editingId){
    query = query.update(payload).eq("id", editingId)
  }else{
    query = query.insert(payload)
  }

  const { error } = await query

  if(error){
    console.error("SAVE PRESENZA ERROR", error)
    setAppStatus("Errore salvataggio presenza")
    return
  }

  setAppStatus(editingId ? "Presenza aggiornata" : "Presenza salvata")
  clearForm()
  await loadPresenze()
}

function editPresenza(id){
  const row = presenze.find(item => item.id === id)
  if(!row) return

  editingId = id

  if(qs("nome")) qs("nome").value = row.nome || ""
  if(qs("data")) qs("data").value = row.data || ""
  if(qs("stato")) qs("stato").value = row.stato || "Presente"
  if(qs("ore")) qs("ore").value = row.ore ?? ""
  if(qs("sede")) qs("sede").value = row.sede || ""
  if(qs("note")) qs("note").value = row.note || ""

  if(qs("saveBtn")) qs("saveBtn").textContent = "Aggiorna presenza"
  if(qs("cancelEditBtn")) qs("cancelEditBtn").classList.remove("hidden")
}

function cancelEdit(){
  clearForm()
  setAppStatus("")
}

async function deletePresenza(id){
  if(!confirm("Vuoi eliminare questa presenza?")) return

  const { error } = await sb
    .from("presenze")
    .delete()
    .eq("id", id)

  if(error){
    console.error("DELETE PRESENZA ERROR", error)
    setAppStatus("Errore eliminazione presenza")
    return
  }

  setAppStatus("Presenza eliminata")
  await loadPresenze()
}

function resetFilters(){
  if(qs("filterMonth")) qs("filterMonth").value = currentMonthValue()
  if(qs("filterState")) qs("filterState").value = ""
  if(qs("filterName")) qs("filterName").value = ""
  if(qs("filterEmployee")) qs("filterEmployee").value = ""
  applyFilters()
}

function generateReport(){
  const rows = getFilteredPresenze()

  if(!rows.length){
    setAppStatus("Nessun dato per generare il report")
    return
  }

  const byEmployee = rows.reduce((acc, row) => {
    const key = row.email || row.nome || "Sconosciuto"
    if(!acc[key]){
      acc[key] = {
        nome: row.nome || row.email || "Sconosciuto",
        email: row.email || "",
        records: 0,
        ore: 0,
        presenti: 0,
        ferie: 0,
        permessi: 0,
        assenze: 0
      }
    }

    acc[key].records += 1
    acc[key].ore += Number(row.ore || 0)

    if(row.stato === "Presente") acc[key].presenti += 1
    else if(row.stato === "Ferie") acc[key].ferie += 1
    else if(row.stato === "Permesso") acc[key].permessi += 1
    else acc[key].assenze += 1

    return acc
  }, {})

  const lines = Object.values(byEmployee)
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"))
    .map(item =>
      `${item.nome} (${item.email || "-"}) .. Giorni: ${item.records} .. Ore: ${item.ore.toFixed(1)} .. Presenti: ${item.presenti} .. Ferie: ${item.ferie} .. Permessi: ${item.permessi} .. Assenze: ${item.assenze}`
    )

  if(qs("reportOutput")) qs("reportOutput").value = lines.join("\n")
  setAppStatus("Report generato")
}

async function copyReport(){
  const output = qs("reportOutput")?.value || ""
  if(!output){
    setAppStatus("Genera prima un report")
    return
  }

  try{
    await navigator.clipboard.writeText(output)
    setAppStatus("Report copiato")
  }catch(err){
    console.error("COPY REPORT ERROR", err)
    setAppStatus("Impossibile copiare il report")
  }
}

function sendToBoss(){
  const output = qs("reportOutput")?.value || ""
  if(!output){
    setAppStatus("Genera prima un report")
    return
  }

  const mailto = `mailto:${ADMIN_EMAIL}?subject=Report%20Presenze&body=${encodeURIComponent(output)}`
  window.location.href = mailto
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
  a.download = `presenze_${qs("filterMonth")?.value || "tutte"}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  setAppStatus("CSV esportato")
}

function bindEvents(){
  if(qs("btnLogin")) qs("btnLogin").onclick = login
  if(qs("btnRegisterMode")) qs("btnRegisterMode").onclick = showRegisterMode
  if(qs("btnCancelRegister")) qs("btnCancelRegister").onclick = hideRegisterMode
  if(qs("btnRegister")) qs("btnRegister").onclick = registerUser
  if(qs("btnOpenHelp")) qs("btnOpenHelp").onclick = openHelpModal
  if(qs("btnCloseHelp")) qs("btnCloseHelp").onclick = closeHelpModal
  if(qs("btnSendHelp")) qs("btnSendHelp").onclick = sendHelpRequest
  if(qs("btnOpenResetRequest")) qs("btnOpenResetRequest").onclick = openResetRequestModal
  if(qs("btnCloseResetRequest")) qs("btnCloseResetRequest").onclick = closeResetRequestModal
  if(qs("btnSendResetRequest")) qs("btnSendResetRequest").onclick = sendResetRequest
  if(qs("btnTogglePassword")) qs("btnTogglePassword").onclick = togglePasswordVisibility
  if(qs("btnLogout")) qs("btnLogout").onclick = async () => {
    await sb.auth.signOut()
    currentUser = null
    currentProfile = null
    isAdmin = false
    showLogin()
  }

  if(qs("btnExportCsv")) qs("btnExportCsv").onclick = exportCsv
  if(qs("saveBtn")) qs("saveBtn").onclick = savePresenza
  if(qs("cancelEditBtn")) qs("cancelEditBtn").onclick = cancelEdit

  if(qs("btnResetFilters")) qs("btnResetFilters").onclick = resetFilters
  if(qs("btnGenerateReport")) qs("btnGenerateReport").onclick = generateReport
  if(qs("btnCopyReport")) qs("btnCopyReport").onclick = copyReport
  if(qs("btnSendToBoss")) qs("btnSendToBoss").onclick = sendToBoss
  if(qs("btnRefreshSupport")) qs("btnRefreshSupport").onclick = loadSupportRequests

  if(qs("filterMonth")) qs("filterMonth").onchange = applyFilters
  if(qs("filterState")) qs("filterState").onchange = applyFilters
  if(qs("filterName")) qs("filterName").oninput = applyFilters
  if(qs("filterEmployee")) qs("filterEmployee").onchange = applyFilters

  if(qs("overlay")){
    qs("overlay").onclick = () => {
      closeHelpModal()
      closeResetRequestModal()
    }
  }

  document.addEventListener("keydown", event => {
    if(event.key === "Escape"){
      closeHelpModal()
      closeResetRequestModal()
    }
  })
}

window.editPresenza = editPresenza
window.deletePresenza = deletePresenza
window.updateSupportRequest = updateSupportRequest

window.addEventListener("DOMContentLoaded", async () => {
  bindEvents()
  clearForm()

  if(qs("filterMonth")) qs("filterMonth").value = currentMonthValue()

  const { data, error } = await sb.auth.getSession()

  if(data?.session?.user){
    await showApp(data.session.user)
  }else{
    showLogin()
  }

  if(error){
    console.error("SESSION CHECK ERROR", error)
  }
})

sb.auth.onAuthStateChange(async (event, session) => {
  console.log("AUTH STATE CHANGE", event, session)

  if(event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED"){
    if(session?.user){
      await showApp(session.user)
    }
    return
  }

  if(event === "SIGNED_OUT"){
    showLogin()
  }
})
