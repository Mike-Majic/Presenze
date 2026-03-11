// ==============================
// CONFIG
// ==============================

const SUPABASE_URL = "INSERISCI_URL_SUPABASE"
const SUPABASE_KEY = "INSERISCI_ANON_KEY"

const ADMIN_EMAIL = "m.colurci@gmail.com"

// ==============================
// SUPABASE CLIENT
// ==============================

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

// ==============================
// GLOBAL STATE
// ==============================

let currentUser = null
let isAdmin = false
let loginInCorso = false

let showAppInCorso = false
let lastShownUserId = null

// ==============================
// UTILS
// ==============================

function qs(id){
  return document.getElementById(id)
}

function setAuthStatus(msg){
  const el = qs("authStatus")
  if(el) el.textContent = msg || ""
}

function showLogin(){
  const login = qs("loginPage")
  const app = qs("appPage")

  if(login) login.style.display = "block"
  if(app) app.style.display = "none"

  showAppInCorso = false
  lastShownUserId = null
}

function showAppPage(){
  const login = qs("loginPage")
  const app = qs("appPage")

  if(login) login.style.display = "none"
  if(app) app.style.display = "block"
}

// ==============================
// LOGIN
// ==============================

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

      if(msg.includes("rate limit") || msg.includes("too many requests")){
        setAuthStatus("Troppi tentativi .. aspetta qualche secondo")
        return
      }

      setAuthStatus("Errore login: " + error.message)
      return
    }

    const user = data?.session?.user || data?.user

    if(!user){
      setAuthStatus("Login riuscito ma sessione non disponibile")
      return
    }

    await showApp(user)

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

// ==============================
// SHOW APP
// ==============================

async function showApp(user){

  if(!user?.id) return

  if(showAppInCorso && lastShownUserId === user.id){
    return
  }

  showAppInCorso = true
  lastShownUserId = user.id

  try{

    currentUser = user
    isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()

    showAppPage()

    if(qs("userEmail")){
      qs("userEmail").textContent = user.email
    }

    await loadPresenze()

  }catch(err){

    console.error("SHOW APP ERROR", err)

  }finally{

    showAppInCorso = false

  }
}

// ==============================
// LOGOUT
// ==============================

async function logout(){

  await sb.auth.signOut()

  currentUser = null
  showLogin()

}

// ==============================
// AUTH STATE LISTENER
// ==============================

sb.auth.onAuthStateChange(async (event, session) => {

  if(event === "SIGNED_IN" || event === "TOKEN_REFRESHED"){

    if(session?.user){
      await showApp(session.user)
    }

    return
  }

  if(event === "SIGNED_OUT"){
    showLogin()
  }

})

// ==============================
// PRESENZE
// ==============================

async function loadPresenze(){

  const { data, error } = await sb
    .from("presenze")
    .select("*")
    .order("data", { ascending:false })

  if(error){
    console.error(error)
    return
  }

  renderPresenze(data || [])

}

function renderPresenze(rows){

  const tabella = qs("tabella")
  if(!tabella) return

  tabella.innerHTML = ""

  if(!rows.length){
    tabella.innerHTML = `<tr><td colspan="7">Nessuna presenza</td></tr>`
    return
  }

  rows.forEach(r => {

    const tr = document.createElement("tr")

    tr.innerHTML = `
      <td>${r.nome || ""}</td>
      <td>${r.data || ""}</td>
      <td>${r.stato || ""}</td>
      <td>${r.ore || 0}</td>
      <td>${r.sede || ""}</td>
      <td>${r.note || ""}</td>
      <td>${r.email || ""}</td>
    `

    tabella.appendChild(tr)

  })

}

// ==============================
// EVENTI
// ==============================

document.addEventListener("DOMContentLoaded", async () => {

  const btnLogin = qs("btnLogin")
  const btnLogout = qs("btnLogout")

  if(btnLogin){
    btnLogin.addEventListener("click", login)
  }

  if(btnLogout){
    btnLogout.addEventListener("click", logout)
  }

  const { data } = await sb.auth.getSession()

  if(data?.session?.user){
    await showApp(data.session.user)
  }else{
    showLogin()
  }

})
