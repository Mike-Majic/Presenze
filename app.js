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
let loginInCorso = false
let registerInCorso = false
let helpRequestInCorso = false
let resetRequestInCorso = false
let supportRequests = []
let showAppInCorso = false
let authReady = false
let showingClosedRequests = false
let supportRealtimeChannel = null
let lastSupportNotificationAt = 0
let baseDocumentTitle = document.title

let appliedFilters = {
  month: "",
  state: "",
  name: "",
  employee: "",
  from: "",
  to: ""
}

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

function updateAdminPageTitle(){
  const newCount = (supportRequests || []).filter(r => (r.status || "new") === "new").length

  if(isAdmin && newCount > 0){
    document.title = `(${newCount}) Gestione Presenze V5`
  }else{
    document.title = baseDocumentTitle
  }
}

async function ensureNotificationPermission(){
  if(!("Notification" in window)) return false
  if(Notification.permission === "granted") return true
  if(Notification.permission === "denied") return false

  try{
    const permission = await Notification.requestPermission()
    return permission === "granted"
  }catch(err){
    console.error("NOTIFICATION PERMISSION ERROR", err)
    return false
  }
}

function playAdminNotificationSound(){
  const audio = qs("adminNotificationSound")
  if(!audio) return

  try{
    audio.currentTime = 0
    audio.play().catch(err => {
      console.warn("NOTIFICATION SOUND ERROR", err)
    })
  }catch(err){
    console.warn("NOTIFICATION SOUND PLAY ERROR", err)
  }
}

async function showAdminSupportNotification(row){
  if(!isAdmin) return

  const now = Date.now()
  if(now - lastSupportNotificationAt < 1500){
    return
  }
  lastSupportNotificationAt = now

  playAdminNotificationSound()

  const permissionGranted = await ensureNotificationPermission()

  if(permissionGranted){
    const tipo = supportTypeLabel(row?.request_type)
    const nome = row?.nome || row?.email || "Richiesta supporto"

    try{
      const notification = new Notification("Nuova richiesta supporto", {
        body: `${tipo} .. ${nome}`,
        icon: "icon-512.png",
        badge: "icon-512.png",
        tag: `support-request-${row?.id || Date.now()}`
      })

      notification.onclick = () => {
        window.focus()
        openOpenRequestsView()
      }
    }catch(err){
      console.error("BROWSER NOTIFICATION ERROR", err)
    }
  }
}

function stopSupportRealtime(){
  if(supportRealtimeChannel){
    try{
      sb.removeChannel(supportRealtimeChannel)
    }catch(err){
      console.warn("REMOVE REALTIME CHANNEL ERROR", err)
    }
    supportRealtimeChannel = null
  }
}

function startSupportRealtime(){
  if(!isAdmin) return

  stopSupportRealtime()

  supportRealtimeChannel = sb
    .channel("support-requests-admin")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "support_requests"
      },
      async (payload) => {
        console.log("SUPPORT REQUEST INSERT REALTIME", payload)

        await loadSupportRequests()
        await showAdminSupportNotification(payload.new)
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "support_requests"
      },
      async () => {
        await loadSupportRequests()
      }
    )
    .subscribe((status) => {
      console.log("SUPPORT REALTIME STATUS", status)
    })
}

async function invokeEdgeFunction(functionName, payload){
  const { data, error } = await sb.functions.invoke(functionName, {
    body: payload
  })

  if(error){
    console.error(`EDGE FUNCTION ERROR [${functionName}]`, error)

    let extra = ""
    try{
      const response = error?.context?.response
      if(response){
        const text = await response.text()
        extra = text || ""
        console.error(`EDGE FUNCTION RAW RESPONSE [${functionName}]`, text)
      }
    }catch(readErr){
      console.error(`EDGE FUNCTION RESPONSE READ ERROR [${functionName}]`, readErr)
    }

    throw new Error(extra || error.message || `Errore funzione ${functionName}`)
  }

  if(data?.error){
    throw new Error(data.error)
  }

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
    console.error("API FETCH ERROR", {
      path,
      status: response.status,
      data
    })

    const detailText =
      data?.details
        ? ` - ${typeof data.details === "string" ? data.details : JSON.stringify(data.details)}`
        : ""

    throw new Error((data.error || "Errore API") + detailText)
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

function openClosedRequestsView(){
  showingClosedRequests = true

  if(qs("openSupportWrap")) qs("openSupportWrap").classList.add("hidden")
  if(qs("closedSupportWrap")) qs("closedSupportWrap").classList.remove("hidden")
  if(qs("btnOpenClosedRequests")) qs("btnOpenClosedRequests").classList.add("hidden")
  if(qs("btnBackToOpenRequests")) qs("btnBackToOpenRequests").classList.remove("hidden")

  renderSupportRequests()
}

function openOpenRequestsView(){
  showingClosedRequests = false

  if(qs("openSupportWrap")) qs("openSupportWrap").classList.remove("hidden")
  if(qs("closedSupportWrap")) qs("closedSupportWrap").classList.add("hidden")
  if(qs("btnOpenClosedRequests")) qs("btnOpenClosedRequests").classList.remove("hidden")
  if(qs("btnBackToOpenRequests")) qs("btnBackToOpenRequests").classList.add("hidden")

  renderSupportRequests()
}

function openLogView(){
  if(qs("logCard")) qs("logCard").classList.remove("hidden")
  if(qs("btnOpenLog")) qs("btnOpenLog").classList.add("hidden")
  if(qs("btnCloseLog")) qs("btnCloseLog").classList.remove("hidden")
}

function closeLogView(){
  if(qs("logCard")) qs("logCard").classList.add("hidden")
  if(qs("btnOpenLog")) qs("btnOpenLog").classList.remove("hidden")
  if(qs("btnCloseLog")) qs("btnCloseLog").classList.add("hidden")
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

  hideRegisterMode()
}

function resetAppState(){
  currentUser = null
  currentProfile = null
  isAdmin = false
  presenze = []
  supportRequests = []
  editingId = null
  showingClosedRequests = false

  renderTable([])
  renderSupportRequests()
  updateSupportSummary()
  clearForm()
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
  if(!user?.id) return
  if(showAppInCorso) return

  showAppInCorso = true

  try{
    currentUser = user
    isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()

    const blocked = await checkBlockedStatus(user)
    if(blocked){
      await sb.auth.signOut({ scope: "local" })
      resetAppState()
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
    const adminSupportCard = qs("adminSupportCard")

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

    if(adminSupportCard){
      adminSupportCard.classList.toggle("hidden", !isAdmin)
    }

    clearForm()
    openOpenRequestsView()
    closeLogView()

    if(qs("filterMonth") && !qs("filterMonth").value){
      qs("filterMonth").value = currentMonthValue()
    }

    await loadPresenze()

    if(isAdmin){
      await loadSupportRequests()
    }
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

    const result = await invokeEdgeFunction("reset-request", {
      email,
      note,
      source: "login"
    })

    const remainingMs = Number(result?.remaining_ms || 0)
    if(remainingMs > 0){
      setModalStatus("resetRequestStatus", `Richiesta già inviata .. riprova tra ${formatRemainingTime(remainingMs)}`)
      return
    }

    setModalStatus("resetRequestStatus", "Richiesta inviata all'amministratore")
    setAuthStatus("Richiesta reset password inviata all'amministratore")

    setTimeout(() => {
      closeResetRequestModal()
      if(qs("resetRequestNote")) qs("resetRequestNote").value = ""
    }, 500)
  }catch(err){
    console.error("RESET REQUEST ERROR", err)
    setModalStatus("resetRequestStatus", err?.message || "Errore invio richiesta reset password")
    setAuthStatus(err?.message || "Errore invio richiesta reset password")
  }finally{
    resetRequestInCorso = false
    if(btn) btn.disabled = false
  }
}

async function sendHelpRequest(){
  if(helpRequestInCorso) return

  const nome = qs("helpNome")?.value.trim() || ""
  const email = qs("helpEmail")?.value.trim() || qs("email")?.value.trim() || ""
  const note = qs("helpNote")?.value.trim() || ""
  const btn = qs("btnSendHelp")

  if(!nome || !email || !note){
    setModalStatus("helpStatus", "Compila nome e cognome, mail e note")
    return
  }

  try{
    helpRequestInCorso = true
    if(btn) btn.disabled = true
    setModalStatus("helpStatus", "Invio richiesta in corso ..")

    await invokeEdgeFunction("help-request", {
      nome,
      email,
      note,
      source: "login"
    })

    setModalStatus("helpStatus", "Richiesta inviata all'amministratore")
    setAuthStatus("Richiesta aiuto inviata all'amministratore")

    setTimeout(() => {
      closeHelpModal()
      if(qs("helpNome")) qs("helpNome").value = ""
      if(qs("helpNote")) qs("helpNote").value = ""
    }, 500)
  }catch(err){
    console.error("HELP REQUEST ERROR", err)
    setModalStatus("helpStatus", err?.message || "Errore invio richiesta aiuto")
    setAuthStatus(err?.message || "Errore invio richiesta aiuto")
  }finally{
    helpRequestInCorso = false
    if(btn) btn.disabled = false
  }
}

async function logout(){
  try{
    resetAppState()

    const { error } = await sb.auth.signOut({ scope: "local" })

    if(error){
      setAppStatus("Errore logout: " + error.message)
      return
    }

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
    const oreExtra = Number(qs("oreExtra")?.value || 0)
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
          ore_extra: oreExtra,
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
          ore_extra: oreExtra,
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

function getFilterValuesFromInputs(){
  return {
    month: qs("filterMonth")?.value || "",
    state: qs("filterState")?.value || "",
    name: (qs("filterName")?.value || "").trim().toLowerCase(),
    employee: qs("filterEmployee")?.value || "",
    from: qs("filterFrom")?.value || "",
    to: qs("filterTo")?.value || ""
  }
}

function getFilteredPresenze(filters = appliedFilters){
  const month = filters?.month || ""
  const state = filters?.state || ""
  const name = filters?.name || ""
  const employee = filters?.employee || ""
  const from = filters?.from || ""
  const to = filters?.to || ""

  return presenze.filter(r => {
    const rowMonth = String(r.data || "").slice(0, 7)
    const rowState = r.stato || ""
    const rowName = (r.nome || "").toLowerCase()

    if(month && rowMonth !== month) return false
    if(state && rowState !== state) return false
    if(name && !rowName.includes(name)) return false
    if(employee && (r.nome || "") !== employee) return false
    if(from && String(r.data || "") < from) return false
    if(to && String(r.data || "") > to) return false

    if(!isAdmin && currentUser?.email && r.email !== currentUser.email){
      return false
    }

    return true
  })
}

function syncFilterInputLimits(){
  const from = appliedFilters.from || ""
  const to = appliedFilters.to || ""

  if(qs("filterFrom")) qs("filterFrom").max = to || ""
  if(qs("filterTo")) qs("filterTo").min = from || ""
}

function applyFilters(showMessage = true){
  syncFilterInputLimits()

  const nextFilters = getFilterValuesFromInputs()

  if(nextFilters.from && nextFilters.to && nextFilters.from > nextFilters.to){
    setAppStatus("Intervallo date non valido")
    return
  }

  appliedFilters = { ...nextFilters }

  const rows = getFilteredPresenze(appliedFilters)
  renderTable(rows)
  updateSummary(rows)

  if(showMessage){
    const hasCustomPeriod = appliedFilters.from || appliedFilters.to
    setAppStatus(hasCustomPeriod ? "Filtro applicato" : "Filtri aggiornati")
  }
}

function renderTable(rows){
  const tabella = qs("tabella")
  if(!tabella) return

  tabella.innerHTML = ""

  if(!rows.length){
    tabella.innerHTML = `<tr><td colspan="8">Nessuna presenza</td></tr>`
    return
  }

  rows.forEach(r => {
    const safeId = String(r.id)

    tabella.innerHTML += `
      <tr>
        <td data-label="Nome">${r.nome || ""}</td>
        <td data-label="Data">${formatDate(r.data || "")}</td>
        <td data-label="Stato">${r.stato || ""}</td>
        <td data-label="Ore">${Number(r.ore || 0)}</td>
        <td data-label="Ore extra">${Number(r.ore_extra || 0)}</td>
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

function renderSupportRequests(){
  const openBody = qs("supportTable")
  const closedBody = qs("supportClosedTable")

  if(openBody) openBody.innerHTML = ""
  if(closedBody) closedBody.innerHTML = ""

  const openRows = supportRequests.filter(r => (r.status || "new") === "new")
  const closedRows = supportRequests.filter(r => r.status === "done")

  if(openBody){
    if(!openRows.length){
      openBody.innerHTML = `<tr><td colspan="9">Nessuna richiesta aperta</td></tr>`
    }else{
      openRows.forEach(r => {
        const tr = document.createElement("tr")

        tr.innerHTML = `
          <td data-label="ID">${r.id}</td>
          <td data-label="Tipo">${supportTypeLabel(r.request_type)}</td>
          <td data-label="Nome">${r.nome || "-"}</td>
          <td data-label="Email">${r.email || "-"}</td>
          <td data-label="Note">${r.note || "-"}</td>
          <td data-label="Origine">${r.source || "-"}</td>
          <td data-label="Data">${formatDateTime(r.created_at)}</td>
          <td data-label="Stato">${r.status || "-"}</td>
          <td data-label="Azioni">
            <div class="table-buttons" id="support-actions-open-${r.id}"></div>
          </td>
        `

        openBody.appendChild(tr)

        const wrap = qs(`support-actions-open-${r.id}`)
        if(!wrap) return

        const btnDone = document.createElement("button")
        btnDone.type = "button"
        btnDone.className = "btn-green"
        btnDone.textContent = "Chiudi"
        btnDone.onclick = () => updateSupportStatus(r.id, "done")
        wrap.appendChild(btnDone)

        if(r.request_type === "reset_password"){
          const btnDirectReset = document.createElement("button")
          btnDirectReset.type = "button"
          btnDirectReset.className = "btn-orange"
          btnDirectReset.textContent = "Invia reset diretto"
          btnDirectReset.onclick = () => adminDirectReset(r.email, r.id)
          wrap.appendChild(btnDirectReset)
        }
      })
    }
  }

  if(closedBody){
    if(!closedRows.length){
      closedBody.innerHTML = `<tr><td colspan="9">Nessuna richiesta chiusa</td></tr>`
    }else{
      closedRows.forEach(r => {
        const tr = document.createElement("tr")

        tr.innerHTML = `
          <td data-label="ID">${r.id}</td>
          <td data-label="Tipo">${supportTypeLabel(r.request_type)}</td>
          <td data-label="Nome">${r.nome || "-"}</td>
          <td data-label="Email">${r.email || "-"}</td>
          <td data-label="Note">${r.note || "-"}</td>
          <td data-label="Origine">${r.source || "-"}</td>
          <td data-label="Data">${formatDateTime(r.created_at)}</td>
          <td data-label="Stato">${r.status || "-"}</td>
          <td data-label="Azioni">
            <div class="table-buttons" id="support-actions-closed-${r.id}"></div>
          </td>
        `

        closedBody.appendChild(tr)

        const wrap = qs(`support-actions-closed-${r.id}`)
        if(!wrap) return

        const btnNew = document.createElement("button")
        btnNew.type = "button"
        btnNew.className = "btn-blue"
        btnNew.textContent = "Riapri"
        btnNew.onclick = () => updateSupportStatus(r.id, "new")
        wrap.appendChild(btnNew)
      })
    }
  }
}

function editPresenza(id){
  const r = presenze.find(x => String(x.id) === String(id))
  if(!r) return

  editingId = id

  if(qs("nome")) qs("nome").value = r.nome || ""
  if(qs("data")) qs("data").value = r.data || ""
  if(qs("stato")) qs("stato").value = r.stato || "Presente"
  if(qs("ore")) qs("ore").value = r.ore ?? 0
  if(qs("oreExtra")) qs("oreExtra").value = r.ore_extra ?? 0
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
  if(qs("oreExtra")) qs("oreExtra").value = "0"
  if(qs("sede")) qs("sede").value = "Sielte Pomezia"
  if(qs("note")) qs("note").value = ""
}

function resetFilters(){
  if(qs("filterMonth")) qs("filterMonth").value = currentMonthValue()
  if(qs("filterState")) qs("filterState").value = ""
  if(qs("filterName")) qs("filterName").value = ""
  if(qs("filterEmployee")) qs("filterEmployee").value = ""
  if(qs("filterFrom")) qs("filterFrom").value = ""
  if(qs("filterTo")) qs("filterTo").value = ""
  syncFilterInputLimits()
  applyFilters(false)
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
  const totalOreExtra = rows.reduce((acc, r) => acc + Number(r.ore_extra || 0), 0)
  const totalOreComplessive = totalOre + totalOreExtra
  const presenti = rows.filter(r => r.stato === "Presente").length
  const ferie = rows.filter(r => r.stato === "Ferie").length
  const permessi = rows.filter(r => r.stato === "Permesso").length
  const assenti = rows.filter(r => r.stato !== "Presente").length

  if(qs("sumRecord") ) qs("sumRecord").textContent = String(totalRecords)
  if(qs("sumOre")) qs("sumOre").textContent = String(totalOre)
  if(qs("sumOreExtra")) qs("sumOreExtra").textContent = String(totalOreExtra)
  if(qs("sumOreComplessive")) qs("sumOreComplessive").textContent = String(totalOreComplessive)
  if(qs("sumPresenti")) qs("sumPresenti").textContent = String(presenti)
  if(qs("sumAssenti")) qs("sumAssenti").textContent = String(assenti)
  if(qs("sumFerie")) qs("sumFerie").textContent = String(ferie)
  if(qs("sumPermessi")) qs("sumPermessi").textContent = String(permessi)
}

function buildReportText(){
  const rows = getFilteredPresenze()

  const totale = rows.length
  const ore = rows.reduce((acc, r) => acc + Number(r.ore || 0), 0)
  const oreExtra = rows.reduce((acc, r) => acc + Number(r.ore_extra || 0), 0)
  const oreComplessive = ore + oreExtra
  const presenti = rows.filter(r => r.stato === "Presente").length
  const assenti = rows.filter(r => r.stato !== "Presente").length
  const ferie = rows.filter(r => r.stato === "Ferie").length
  const permessi = rows.filter(r => r.stato === "Permesso").length

  const mese = appliedFilters.month || "tutte"
  const dipendente = appliedFilters.employee || "Tutti"
  const dal = appliedFilters.from || "-"
  const al = appliedFilters.to || "-"

  return [
    `Report presenze`,
    `Mese: ${mese}`,
    `Periodo personalizzato: ${dal} / ${al}`,
    `Dipendente: ${dipendente}`,
    ``,
    `Totale record: ${totale}`,
    `Totale ore ordinarie: ${ore}`,
    `Totale ore extra: ${oreExtra}`,
    `Totale ore complessive: ${oreComplessive}`,
    `Presenti: ${presenti}`,
    `Assenti: ${assenti}`,
    `Ferie: ${ferie}`,
    `Permessi: ${permessi}`
  ].join("\n")
}

function generateReport(){
  const text = buildReportText()
  if(qs("reportBox")) qs("reportBox").textContent = text
  setAppStatus("Report generato")
}

async function copyReport(){
  try{
    const text = buildReportText()

    if(navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text)
    }else{
      const temp = document.createElement("textarea")
      temp.value = text
      temp.setAttribute("readonly", "readonly")
      temp.style.position = "fixed"
      temp.style.opacity = "0"
      document.body.appendChild(temp)
      temp.select()
      document.execCommand("copy")
      document.body.removeChild(temp)
    }

    if(qs("reportBox")) qs("reportBox").textContent = text
    setAppStatus("Report copiato")
  }catch(err){
    console.error("COPY REPORT ERROR", err)
    setAppStatus("Errore copia report")
  }
}

function sendToBoss(){
  const text = buildReportText()
  const from = qs("filterFrom")?.value || ""
  const to = qs("filterTo")?.value || ""
  const subjectLabel = from || to ? `Report presenze ${from || "inizio"} - ${to || "fine"}` : "Report presenze"
  const subject = encodeURIComponent(subjectLabel)
  const body = encodeURIComponent(text)
  window.location.href = `mailto:${ADMIN_EMAIL}?subject=${subject}&body=${body}`
}

function updateSupportSummary(){
  const rows = supportRequests || []

  const newCount = rows.filter(r => (r.status || "new") === "new").length
  const doneCount = rows.filter(r => r.status === "done").length

  if(qs("supportCountNew")) qs("supportCountNew").textContent = String(newCount)
  if(qs("supportCountDone")) qs("supportCountDone").textContent = String(doneCount)
  if(qs("supportBadgeNew")) qs("supportBadgeNew").textContent = String(newCount)

  updateAdminPageTitle()
}

async function loadSupportRequests(){
  if(!isAdmin) return

  try{
    const result = await apiFetch("/api/admin/support-list")
    supportRequests = result.requests || []
    renderSupportRequests()
    updateSupportSummary()
  }catch(err){
    console.error("LOAD SUPPORT REQUESTS ERROR", err)
    setAppStatus("Errore caricamento richieste supporto: " + err.message)
  }
}

async function updateSupportStatus(id, status){
  try{
    await apiFetch("/api/admin/support-status", {
      method: "POST",
      body: { id, status }
    })

    await loadSupportRequests()
    setAppStatus(`Richiesta ${id} aggiornata`)
  }catch(err){
    console.error("UPDATE SUPPORT STATUS ERROR", err)
    setAppStatus("Errore aggiornamento richiesta: " + err.message)
  }
}

async function adminDirectReset(email, requestId = null){
  const ok = window.confirm(`Inviare la mail di reset password a ${email}?`)
  if(!ok) return

  try{
    await apiFetch("/api/admin/reset-password", {
      method: "POST",
      body: { email }
    })

    if(requestId){
      await apiFetch("/api/admin/support-status", {
        method: "POST",
        body: { id: requestId, status: "done" }
      })
    }

    await loadSupportRequests()
    setAppStatus("Mail reset password inviata")
  }catch(err){
    console.error("ADMIN DIRECT RESET ERROR", err)
    setAppStatus("Errore invio reset diretto: " + err.message)
  }
}

function exportCsv(){
  const rows = getFilteredPresenze()

  if(!rows.length){
    setAppStatus("Nessun dato")
    return
  }

  const headers = ["Nome","Data","Stato","Ore","Ore extra","Sede","Note","Email"]
  const csvRows = [headers.join(";")]

  rows.forEach(r => {
    const values = [
      r.nome || "",
      r.data || "",
      r.stato || "",
      String(r.ore ?? ""),
      String(r.ore_extra ?? ""),
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
  const monthPart = qs("filterMonth")?.value || "tutte"
  const fromPart = appliedFilters.from || "inizio"
  const toPart = appliedFilters.to || "fine"
  a.download = `presenze_${monthPart}_${fromPart}_${toPart}.csv`
  a.click()

  URL.revokeObjectURL(url)
  setAppStatus("CSV esportato")
}

function goManageUsers(){
  window.location.href = "/users.html"
}

function bindEvents(){
  if(qs("btnTogglePassword")) qs("btnTogglePassword").onclick = togglePasswordVisibility

  if(qs("btnHelp")) qs("btnHelp").onclick = openHelpModal
  if(qs("btnCloseHelp")) qs("btnCloseHelp").onclick = closeHelpModal
  if(qs("btnSendHelp")) qs("btnSendHelp").onclick = sendHelpRequest

  if(qs("btnRequestReset")) qs("btnRequestReset").onclick = openResetRequestModal
  if(qs("btnCloseResetRequest")) qs("btnCloseResetRequest").onclick = closeResetRequestModal
  if(qs("btnSendResetRequest")) qs("btnSendResetRequest").onclick = sendResetRequest

  if(qs("btnLogin")) qs("btnLogin").onclick = login
  if(qs("btnRegisterMode")) qs("btnRegisterMode").onclick = showRegisterMode
  if(qs("btnRegister")) qs("btnRegister").onclick = registerUser
  if(qs("btnCancelRegister")) qs("btnCancelRegister").onclick = hideRegisterMode

  if(qs("btnLogout")) qs("btnLogout").onclick = logout
  if(qs("btnManageUsers")) qs("btnManageUsers").onclick = goManageUsers
  if(qs("btnOpenClosedRequests")) qs("btnOpenClosedRequests").onclick = openClosedRequestsView
  if(qs("btnBackToOpenRequests")) qs("btnBackToOpenRequests").onclick = openOpenRequestsView
  if(qs("btnOpenLog")) qs("btnOpenLog").onclick = openLogView
  if(qs("btnCloseLog")) qs("btnCloseLog").onclick = closeLogView

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
  if(qs("filterFrom")) qs("filterFrom").onchange = applyFilters
  if(qs("filterTo")) qs("filterTo").onchange = applyFilters

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

window.addEventListener("DOMContentLoaded", async () => {
  bindEvents()
  clearForm()
  closeLogView()
  openOpenRequestsView()

  if(qs("filterMonth")) qs("filterMonth").value = currentMonthValue()

  try{
    const { data, error } = await sb.auth.getSession()

    if(error){
      console.error("SESSION CHECK ERROR", error)
    }

    authReady = true

    if(data?.session?.user){
      await showApp(data.session.user)
    }else{
      resetAppState()
      showLogin()
    }
  }catch(err){
    console.error("SESSION BOOT ERROR", err)
    authReady = true
    resetAppState()
    showLogin()
  }
})

sb.auth.onAuthStateChange(async (_event, session) => {
  if(!authReady) return

  if(session?.user){
    await showApp(session.user)
  }else{
    resetAppState()
    showLogin()
  }
})

let deferredPrompt

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault()
  deferredPrompt = e

  const installBtn = document.createElement("button")
  installBtn.textContent = "Installa App"
  installBtn.className = "btn-green"

  installBtn.onclick = async () => {
    installBtn.remove()

    deferredPrompt.prompt()

    const { outcome } = await deferredPrompt.userChoice
    console.log("Install result:", outcome)

    deferredPrompt = null
  }

  const topbar = document.querySelector(".topbar")
  if(topbar){
    topbar.appendChild(installBtn)
  }
})
