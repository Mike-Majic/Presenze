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

  let data = null
  try{
    data = await response.json()
  }catch(err){
    console.warn("API JSON PARSE WARNING", err)
  }

  if(!response.ok){
    const message = data?.error || `Errore richiesta (${response.status})`
    throw new Error(message)
  }

  return data || {}
}

function supportTypeLabel(type){
  switch(type){
    case "help":
      return "Aiuto"
    case "reset_password":
      return "Reset password"
    default:
      return type || "Supporto"
  }
}

function getDisplayName(profile, fallbackEmail = ""){
  const nome = (profile?.nome || "").trim()
  const cognome = (profile?.cognome || "").trim()
  const fullName = `${nome} ${cognome}`.trim()

  if(fullName) return fullName
  return fallbackEmail || "-"
}

function todayISO(){
  return new Date().toISOString().slice(0, 10)
}

function currentMonthValue(){
  return new Date().toISOString().slice(0, 7)
}

function formatDate(value){
  if(!value) return "-"
  const [y, m, d] = value.split("-")
  if(!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function formatDateTime(value){
  if(!value) return "-"
  const date = new Date(value)
  if(Number.isNaN(date.getTime())) return value

  return date.toLocaleString("it-IT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}

function setOverlayVisible(visible){
  const overlay = qs("overlay")
  if(!overlay) return
  overlay.classList.toggle("hidden", !visible)
}

function openHelpModal(){
  const modal = qs("helpModal")
  if(!modal) return

  if(qs("helpNome") && !qs("helpNome").value){
    qs("helpNome").value = getDisplayName(currentProfile, "")
  }

  if(qs("helpEmail") && !qs("helpEmail").value){
    qs("helpEmail").value = currentUser?.email || qs("email")?.value || ""
  }

  setModalStatus("helpStatus", "")
  modal.classList.remove("hidden")
  setOverlayVisible(true)
}

function closeHelpModal(){
  const modal = qs("helpModal")
  if(!modal) return

  modal.classList.add("hidden")
  setOverlayVisible(false)
}

function openResetRequestModal(){
  const modal = qs("resetRequestModal")
  if(!modal) return

  if(qs("resetRequestEmail") && !qs("resetRequestEmail").value){
    qs("resetRequestEmail").value = currentUser?.email || qs("email")?.value || ""
  }

  setModalStatus("resetRequestStatus", "")
  modal.classList.remove("hidden")
  setOverlayVisible(true)
}

function closeResetRequestModal(){
  const modal = qs("resetRequestModal")
  if(!modal) return

  modal.classList.add("hidden")
  setOverlayVisible(false)
}

function showLogin(){
  const loginBox = qs("loginBox")
  const app = qs("app")

  if(loginBox) loginBox.classList.remove("hidden")
  if(app) app.classList.add("hidden")

  setOverlayVisible(false)
  closeHelpModal()
  closeResetRequestModal()
  setRegisterMode(false)
}

function showApp(){
  if(showAppInCorso) return
  showAppInCorso = true

  try{
    const loginBox = qs("loginBox")
    const app = qs("app")

    if(loginBox) loginBox.classList.add("hidden")
    if(app) app.classList.remove("hidden")

    if(qs("userInfo")){
      qs("userInfo").textContent = `Dipendente: ${getDisplayName(currentProfile, currentUser?.email || "-")}`
    }

    if(qs("roleInfo")){
      qs("roleInfo").textContent = isAdmin ? "Ruolo: Admin" : "Ruolo: Dipendente"
    }

    if(qs("adminFilterWrap")){
      qs("adminFilterWrap").classList.toggle("hidden", !isAdmin)
    }

    if(qs("btnManageUsers")){
      qs("btnManageUsers").classList.toggle("hidden", !isAdmin)
    }

    if(qs("adminSupportCard")){
      qs("adminSupportCard").classList.toggle("hidden", !isAdmin)
    }

    if(qs("nome")){
      qs("nome").value = getDisplayName(currentProfile, "")
      qs("nome").readOnly = true
    }

    if(qs("data") && !qs("data").value){
      qs("data").value = todayISO()
    }

    if(qs("filterMonth") && !qs("filterMonth").value){
      qs("filterMonth").value = currentMonthValue()
    }

    if(qs("formTitle")) qs("formTitle").textContent = "Inserisci presenza"
    if(qs("cancelEditBtn")) qs("cancelEditBtn").classList.add("hidden")

    clearForm()
    applyFilters()

    if(isAdmin){
      loadSupportRequests()
      startSupportRealtime()
      updateAdminPageTitle()
    }else{
      stopSupportRealtime()
      supportRequests = []
      updateAdminPageTitle()
    }
  }finally{
    showAppInCorso = false
  }
}

function setRegisterMode(enabled){
  isRegisterMode = enabled

  if(qs("registerFields")){
    qs("registerFields").classList.toggle("hidden", !enabled)
  }

  if(qs("btnRegisterMode")){
    qs("btnRegisterMode").classList.toggle("hidden", enabled)
  }

  if(qs("btnRegister")){
    qs("btnRegister").classList.toggle("hidden", !enabled)
  }

  if(qs("btnCancelRegister")){
    qs("btnCancelRegister").classList.toggle("hidden", !enabled)
  }

  if(qs("password")){
    qs("password").setAttribute("autocomplete", enabled ? "new-password" : "current-password")
  }

  setAuthStatus("")
}

function resetAppState(){
  currentUser = null
  currentProfile = null
  isAdmin = false
  presenze = []
  editingId = null
  supportRequests = []
  showingClosedRequests = false
  stopSupportRealtime()
  updateAdminPageTitle()
}

async function loadProfile(user){
  if(!user) return null

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if(error){
    console.error("LOAD PROFILE ERROR", error)
    return null
  }

  return data
}

async function resolveCurrentUser(){
  const { data, error } = await sb.auth.getUser()

  if(error){
    console.error("GET USER ERROR", error)
    return null
  }

  return data?.user || null
}

async function checkSessionAndBoot(){
  const { data, error } = await sb.auth.getSession()

  if(error){
    console.error("SESSION ERROR", error)
    showLogin()
    return
  }

  if(!data?.session){
    showLogin()
    return
  }

  currentUser = data.session.user || null
  currentProfile = await loadProfile(currentUser)
  isAdmin = (currentUser?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()

  await loadPresenze()
  showApp()
}

async function doRegister(){
  if(registerInCorso) return
  registerInCorso = true

  const btn = qs("btnRegister")
  if(btn) btn.disabled = true

  try{
    const nome = qs("nomeRegister")?.value.trim() || ""
    const cognome = qs("cognomeRegister")?.value.trim() || ""
    const email = qs("email")?.value.trim() || ""
    const password = qs("password")?.value || ""

    if(!nome || !cognome || !email || !password){
      setAuthStatus("Compila nome, cognome, email e password")
      return
    }

    const redirectUrl = `${window.location.origin}/`

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          nome,
          cognome
        }
      }
    })

    if(error){
      setAuthStatus("Errore registrazione: " + error.message)
      return
    }

    const user = data?.user
    if(user){
      const { error: profileError } = await sb
        .from("profiles")
        .upsert({
          id: user.id,
          email,
          nome,
          cognome
        })

      if(profileError){
        console.error("PROFILE UPSERT REGISTER ERROR", profileError)
      }
    }

    setAuthStatus("Registrazione inviata. Controlla la mail di conferma")
    setRegisterMode(false)

    if(qs("nomeRegister")) qs("nomeRegister").value = ""
    if(qs("cognomeRegister")) qs("cognomeRegister").value = ""
  }catch(err){
    console.error("REGISTER ERROR", err)
    setAuthStatus("Errore registrazione")
  }finally{
    registerInCorso = false
    if(btn) btn.disabled = false
  }
}

async function doLogin(){
  if(loginInCorso) return
  loginInCorso = true

  const btn = qs("btnLogin")
  if(btn) btn.disabled = true

  try{
    const email = qs("email")?.value.trim() || ""
    const password = qs("password")?.value || ""

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

    currentUser = data?.user || null
    currentProfile = await loadProfile(currentUser)
    isAdmin = (currentUser?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()

    await loadPresenze()
    showApp()
    setAuthStatus("")
  }catch(err){
    console.error("LOGIN ERROR", err)
    setAuthStatus("Errore login")
  }finally{
    loginInCorso = false
    if(btn) btn.disabled = false
  }
}

async function sendResetRequest(){
  if(resetRequestInCorso) return
  resetRequestInCorso = true

  const btn = qs("btnSendResetRequest")
  if(btn) btn.disabled = true

  try{
    const email = qs("resetRequestEmail")?.value.trim() || ""
    const note = qs("resetRequestNote")?.value.trim() || ""

    if(!email){
      setModalStatus("resetRequestStatus", "Inserisci la mail")
      return
    }

    await invokeEdgeFunction("support-request", {
      request_type: "reset_password",
      email,
      note,
      nome: currentUser ? getDisplayName(currentProfile, email) : "",
      source: currentUser ? "app" : "login"
    })

    setModalStatus("resetRequestStatus", "Richiesta reset password inviata")
    setAuthStatus("Richiesta reset password inviata")

    setTimeout(() => {
      closeResetRequestModal()
      if(qs("resetRequestNote")) qs("resetRequestNote").value = ""
    }, 500)
  }catch(err){
    console.error("RESET REQUEST ERROR", err)
    setModalStatus("resetRequestStatus", err?.message || "Errore invio richiesta reset")
    setAuthStatus(err?.message || "Errore invio richiesta reset")
  }finally{
    resetRequestInCorso = false
    if(btn) btn.disabled = false
  }
}

async function sendHelpRequest(){
  if(helpRequestInCorso) return
  helpRequestInCorso = true

  const btn = qs("btnSendHelp")
  if(btn) btn.disabled = true

  try{
    const nome = qs("helpNome")?.value.trim() || ""
    const email = qs("helpEmail")?.value.trim() || ""
    const note = qs("helpNote")?.value.trim() || ""

    if(!nome || !email || !note){
      setModalStatus("helpStatus", "Compila nome, mail e note")
      return
    }

    await invokeEdgeFunction("support-request", {
      request_type: "help",
      nome,
      email,
      note,
      source: currentUser ? "app" : "login"
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
    const ore_extra = Number(qs("oreExtra")?.value || 0)
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
          ore_extra,
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
          ore_extra,
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
        <td data-label="Ore">${r.ore ?? 0}</td>
        <td data-label="Ore Extra">${r.ore_extra ?? 0}</td>
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

        const actions = document.getElementById(`support-actions-open-${r.id}`)
        if(actions){
          const doneBtn = document.createElement("button")
          doneBtn.className = "btn-green"
          doneBtn.textContent = "Chiudi"
          doneBtn.onclick = () => updateSupportStatus(r.id, "done")

          actions.appendChild(doneBtn)
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

        const actions = document.getElementById(`support-actions-closed-${r.id}`)
        if(actions){
          const reopenBtn = document.createElement("button")
          reopenBtn.className = "btn-blue"
          reopenBtn.textContent = "Riapri"
          reopenBtn.onclick = () => updateSupportStatus(r.id, "new")

          actions.appendChild(reopenBtn)
        }
      })
    }
  }

  if(qs("supportCountNew")){
    qs("supportCountNew").textContent = String(openRows.length)
  }

  if(qs("supportCountDone")){
    qs("supportCountDone").textContent = String(closedRows.length)
  }

  updateAdminPageTitle()
}

async function loadSupportRequests(){
  if(!isAdmin) return

  try{
    const { data, error } = await sb
      .from("support_requests")
      .select("*")
      .order("created_at", { ascending: false })

    if(error){
      console.error("LOAD SUPPORT ERROR", error)
      return
    }

    supportRequests = data || []
    renderSupportRequests()
  }catch(err){
    console.error("LOAD SUPPORT ERROR", err)
  }
}

async function updateSupportStatus(id, status){
  try{
    const { error } = await sb
      .from("support_requests")
      .update({ status })
      .eq("id", id)

    if(error){
      console.error("UPDATE SUPPORT STATUS ERROR", error)
      return
    }

    await loadSupportRequests()
  }catch(err){
    console.error("UPDATE SUPPORT STATUS ERROR", err)
  }
}

function openClosedRequestsView(){
  showingClosedRequests = true

  if(qs("openSupportWrap")) qs("openSupportWrap").classList.add("hidden")
  if(qs("closedSupportWrap")) qs("closedSupportWrap").classList.remove("hidden")

  if(qs("btnOpenClosedRequests")) qs("btnOpenClosedRequests").classList.add("hidden")
  if(qs("btnBackToOpenRequests")) qs("btnBackToOpenRequests").classList.remove("hidden")
}

function openOpenRequestsView(){
  showingClosedRequests = false

  if(qs("openSupportWrap")) qs("openSupportWrap").classList.remove("hidden")
  if(qs("closedSupportWrap")) qs("closedSupportWrap").classList.add("hidden")

  if(qs("btnOpenClosedRequests")) qs("btnOpenClosedRequests").classList.remove("hidden")
  if(qs("btnBackToOpenRequests")) qs("btnBackToOpenRequests").classList.add("hidden")
}

function editPresenza(id){
  const r = presenze.find(p => String(p.id) === String(id))
  if(!r) return

  editingId = id

  if(qs("nome")) qs("nome").value = r.nome || ""
  if(qs("data")) qs("data").value = r.data || ""
  if(qs("stato")) qs("stato").value = r.stato || ""
  if(qs("ore")) qs("ore").value = r.ore ?? 0
  if(qs("oreExtra")) qs("oreExtra").value = r.ore_extra ?? 0
  if(qs("sede")) qs("sede").value = r.sede || "Sielte Pomezia"
  if(qs("note")) qs("note").value = r.note || ""

  if(qs("formTitle")) qs("formTitle").textContent = "Modifica presenza"
  if(qs("cancelEditBtn")) qs("cancelEditBtn").classList.remove("hidden")
}

function clearForm(){
  editingId = null

  if(qs("data")) qs("data").value = todayISO()
  if(qs("stato")) qs("stato").value = "Presente"
  if(qs("ore")) qs("ore").value = "0"
  if(qs("oreExtra")) qs("oreExtra").value = "0"
  if(qs("sede")) qs("sede").value = "Sielte Pomezia"
  if(qs("note")) qs("note").value = ""

  if(qs("formTitle")) qs("formTitle").textContent = "Inserisci presenza"
  if(qs("cancelEditBtn")) qs("cancelEditBtn").classList.add("hidden")
}

function updateSummary(rows){
  const totalRecords = rows.length
  const totalOre = rows.reduce((acc, r) => acc + Number(r.ore || 0), 0)
  const totalOreExtra = rows.reduce((acc, r) => acc + Number(r.ore_extra || 0), 0)

  const presenti = rows.filter(r => r.stato === "Presente").length
  const ferie = rows.filter(r => r.stato === "Ferie").length
  const permessi = rows.filter(r => r.stato === "Permesso").length

  const assenti = rows.filter(r =>
    r.stato !== "Presente"
  ).length

  if(qs("sumRecord")) qs("sumRecord").textContent = String(totalRecords)
  if(qs("sumOre")) qs("sumOre").textContent = String(totalOre)
  if(qs("sumOreExtra")) qs("sumOreExtra").textContent = String(totalOreExtra)
  if(qs("sumPresenti")) qs("sumPresenti").textContent = String(presenti)
  if(qs("sumAssenti")) qs("sumAssenti").textContent = String(assenti)
  if(qs("sumFerie")) qs("sumFerie").textContent = String(ferie)
  if(qs("sumPermessi")) qs("sumPermessi").textContent = String(permessi)
}

document.addEventListener("DOMContentLoaded", () => {

  if(qs("btnLogin")) qs("btnLogin").onclick = doLogin
  if(qs("btnRegister")) qs("btnRegister").onclick = doRegister
  if(qs("btnRegisterMode")) qs("btnRegisterMode").onclick = () => setRegisterMode(true)
  if(qs("btnCancelRegister")) qs("btnCancelRegister").onclick = () => setRegisterMode(false)

  if(qs("btnLogout")) qs("btnLogout").onclick = logout
  if(qs("saveBtn")) qs("saveBtn").onclick = savePresenza
  if(qs("cancelEditBtn")) qs("cancelEditBtn").onclick = clearForm

  if(qs("btnResetFilters")) qs("btnResetFilters").onclick = () => {
    if(qs("filterMonth")) qs("filterMonth").value = currentMonthValue()
    if(qs("filterState")) qs("filterState").value = ""
    if(qs("filterName")) qs("filterName").value = ""
    if(qs("filterEmployee")) qs("filterEmployee").value = ""
    applyFilters()
  }

  if(qs("filterMonth")) qs("filterMonth").onchange = applyFilters
  if(qs("filterState")) qs("filterState").onchange = applyFilters
  if(qs("filterName")) qs("filterName").oninput = applyFilters
  if(qs("filterEmployee")) qs("filterEmployee").onchange = applyFilters

  if(qs("btnHelp")) qs("btnHelp").onclick = openHelpModal
  if(qs("btnCloseHelp")) qs("btnCloseHelp").onclick = closeHelpModal
  if(qs("btnSendHelp")) qs("btnSendHelp").onclick = sendHelpRequest

  if(qs("btnRequestReset")) qs("btnRequestReset").onclick = openResetRequestModal
  if(qs("btnCloseResetRequest")) qs("btnCloseResetRequest").onclick = closeResetRequestModal
  if(qs("btnSendResetRequest")) qs("btnSendResetRequest").onclick = sendResetRequest

  if(qs("btnRefreshSupport")) qs("btnRefreshSupport").onclick = loadSupportRequests
  if(qs("btnOpenClosedRequests")) qs("btnOpenClosedRequests").onclick = openClosedRequestsView
  if(qs("btnBackToOpenRequests")) qs("btnBackToOpenRequests").onclick = openOpenRequestsView

  if(qs("btnTogglePassword")){
    qs("btnTogglePassword").onclick = () => {
      const input = qs("password")
      if(!input) return
      input.type = input.type === "password" ? "text" : "password"
    }
  }

  checkSessionAndBoot()
})
