const DEFAULT_SEDI = ["Sielte Pomezia", "Sielte Spinaceto"]
const SEDI_STORAGE_KEY = "presenze_sedi"

let editingIndex = null

function qs(id){
  return document.getElementById(id)
}

function setSedeStatus(message){
  const el = qs("sedeStatus")
  if(el) el.textContent = message || ""
}

function getSedi(){
  try{
    const stored = JSON.parse(localStorage.getItem(SEDI_STORAGE_KEY) || "[]")
    const sedi = Array.isArray(stored) ? stored.map(s => String(s || "").trim()).filter(Boolean) : []
    return sedi.length ? [...new Set(sedi)] : DEFAULT_SEDI.slice()
  }catch(err){
    console.warn("SEDI STORAGE ERROR", err)
    return DEFAULT_SEDI.slice()
  }
}

function saveSedi(sedi){
  localStorage.setItem(SEDI_STORAGE_KEY, JSON.stringify([...new Set(sedi.map(s => s.trim()).filter(Boolean))]))
}

function resetSedeForm(){
  editingIndex = null
  if(qs("sedeName")) qs("sedeName").value = ""
  if(qs("sedeFormTitle")) qs("sedeFormTitle").textContent = "Aggiungi sede"
  if(qs("btnCancelSedeEdit")) qs("btnCancelSedeEdit").classList.add("hidden")
}

function renderSedi(){
  const tbody = qs("sediTable")
  if(!tbody) return

  const sedi = getSedi()
  tbody.innerHTML = ""

  sedi.forEach((sede, index) => {
    const tr = document.createElement("tr")
    tr.innerHTML = `
      <td data-label="Sede">${sede}</td>
      <td data-label="Azioni">
        <div class="table-buttons">
          <button type="button" class="btn-blue" data-edit-index="${index}">Modifica</button>
          <button type="button" class="btn-red" data-delete-index="${index}">Rimuovi</button>
        </div>
      </td>
    `
    tbody.appendChild(tr)
  })

  tbody.querySelectorAll("[data-edit-index]").forEach(btn => {
    btn.onclick = () => editSede(Number(btn.dataset.editIndex))
  })

  tbody.querySelectorAll("[data-delete-index]").forEach(btn => {
    btn.onclick = () => deleteSede(Number(btn.dataset.deleteIndex))
  })
}

function saveSede(){
  const name = qs("sedeName")?.value.trim() || ""
  if(!name){
    setSedeStatus("Inserisci il nome della sede")
    return
  }

  const sedi = getSedi()
  const duplicateIndex = sedi.findIndex(s => s.toLowerCase() === name.toLowerCase())

  if(duplicateIndex !== -1 && duplicateIndex !== editingIndex){
    setSedeStatus("Questa sede esiste già")
    return
  }

  if(editingIndex === null){
    sedi.push(name)
    setSedeStatus("Sede aggiunta")
  }else{
    sedi[editingIndex] = name
    setSedeStatus("Sede modificata")
  }

  saveSedi(sedi)
  resetSedeForm()
  renderSedi()
}

function editSede(index){
  const sedi = getSedi()
  if(!sedi[index]) return

  editingIndex = index
  if(qs("sedeName")) qs("sedeName").value = sedi[index]
  if(qs("sedeFormTitle")) qs("sedeFormTitle").textContent = "Modifica sede"
  if(qs("btnCancelSedeEdit")) qs("btnCancelSedeEdit").classList.remove("hidden")
  setSedeStatus("Modifica il nome della sede e salva")
}

function deleteSede(index){
  const sedi = getSedi()
  if(sedi.length <= 1){
    setSedeStatus("Deve rimanere almeno una sede")
    return
  }

  sedi.splice(index, 1)
  saveSedi(sedi)
  resetSedeForm()
  renderSedi()
  setSedeStatus("Sede rimossa")
}

function bindEvents(){
  if(qs("btnBackDashboard")) qs("btnBackDashboard").onclick = () => { window.location.href = "/index.html" }
  if(qs("btnSaveSede")) qs("btnSaveSede").onclick = saveSede
  if(qs("btnCancelSedeEdit")) qs("btnCancelSedeEdit").onclick = () => {
    resetSedeForm()
    setSedeStatus("")
  }
}

bindEvents()
renderSedi()
