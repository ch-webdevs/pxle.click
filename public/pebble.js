/* Pebble puzzle — local 3-slot saves + preview toggle + autoload/manage */
const CFG = window.PEBBLE || {};
const b = document.getElementById("board");
const ctx = b.getContext("2d");
const stats = document.getElementById("stats");
const saveBtn = document.getElementById("saveBtn");
const loadBtn = document.getElementById("loadBtn");
const resetBtn = document.getElementById("resetBtn");
const previewBtn = document.getElementById("previewBtn");

const ROWS = CFG.ROWS || 24, COLS = CFG.COLS || 25;
const KEY = new URL(location.href).searchParams.get("key") || (CFG.DEFAULT_KEY || "puzzle");
const STORAGE_KEY = `pebbleSlots::${KEY}`;

let img = new Image();
let tiles = [], solved = [], sel = null, moves = 0, start = null, elapsed = 0;
let tw = 0, th = 0;
let preview = false;

// ---------- Canvas + draw ----------
function fit(){
  const r = b.getBoundingClientRect();
  const s = Math.min(r.width, r.height || r.width);
  const px = Math.round(Math.min(1024, Math.max(400, s))*devicePixelRatio);
  b.width = px; b.height = px;
}
function timeText(){
  const t = Math.floor((start ? Date.now()-start : 0)/1000) + elapsed;
  const m = Math.floor(t/60), s = t%60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function draw(){
  tw = Math.floor(b.width/COLS); th = Math.floor(b.height/ROWS);
  ctx.clearRect(0,0,b.width,b.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";

  if(preview){
    ctx.drawImage(img, 0,0, img.width, img.height, 0,0, b.width, b.height);
  }else{
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const i=r*COLS+c, s=tiles[i], sr=Math.floor(s/COLS), sc=s%COLS;
        const sx=Math.floor(sc*img.width/COLS), sy=Math.floor(sr*img.height/ROWS);
        const sw=Math.ceil(img.width/COLS), sh=Math.ceil(img.height/ROWS);
        ctx.drawImage(img, sx, sy, sw, sh, c*tw, r*th, tw, th);
      }
    }
    if(sel!==null){
      ctx.lineWidth = Math.max(2, Math.floor(tw*.06));
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim() || "#94a3b8";
      const c = sel%COLS, r = Math.floor(sel/COLS);
      ctx.strokeRect(c*tw+1, r*th+1, tw-2, th-2);
    }
  }
  stats && (stats.textContent = `Moves: ${moves} · Time: ${timeText()}`);
}

// ---------- Board logic ----------
function shuffle(){
  tiles = Array.from({length:ROWS*COLS},(_,i)=>i);
  for(let i=tiles.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [tiles[i],tiles[j]] = [tiles[j],tiles[i]];
  }
  moves = 0; sel = null; start = Date.now(); elapsed = 0;
  draw();
}
function indexFromXY(x,y){
  const rect = b.getBoundingClientRect();
  const cx = (x-rect.left) * (b.width/rect.width);
  const cy = (y-rect.top)  * (b.height/rect.height);
  const c = Math.floor(cx/tw), r = Math.floor(cy/th);
  if(c<0||r<0||c>=COLS||r>=ROWS) return null;
  return r*COLS+c;
}
function tap(i){
  if(preview) { togglePreview(false); return; }
  if(sel===null){ sel=i; draw(); return; }
  if(sel===i){ sel=null; draw(); return; }
  [tiles[sel], tiles[i]] = [tiles[i], tiles[sel]];
  moves++; sel=null; draw();
}

// ---------- Save/Load (3 slots) ----------
function readSlots(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [null,null,null]; } catch{ return [null,null,null]; } }
function writeSlots(slots){ localStorage.setItem(STORAGE_KEY, JSON.stringify(slots)); }

function slotThumb(){
  const c = document.createElement("canvas");
  c.width = 140; c.height = 140;
  const cctx = c.getContext("2d");
  cctx.drawImage(img, 0,0, img.width, img.height, 0,0, 140,140);
  return c.toDataURL("image/jpeg", 0.7);
}
function makeState(){
  return {
    name: null,
    imgUrl: CFG.IMG_URL,
    rows: ROWS, cols: COLS,
    tiles: tiles, moves: moves,
    elapsed: Math.floor((start ? Date.now()-start : 0)/1000)+elapsed,
    updatedAt: Date.now(), createdAt: Date.now(),
    thumb: slotThumb(),
  };
}
function applyState(s){
  if(!s || s.imgUrl !== CFG.IMG_URL || s.rows!==ROWS || s.cols!==COLS){
    toast("Different image or empty save"); return;
  }
  tiles = s.tiles.slice();
  moves = s.moves|0;
  elapsed = s.elapsed|0;
  start = Date.now();
  sel = null;
  draw();
}

function openSlots(mode){
  const modal = document.getElementById("modal");
  const grid = document.getElementById("slotGrid");
  const title = document.getElementById("modalTitle");
  title.textContent = mode==="save" ? "Save — choose a slot" : "Load — choose a slot";
  grid.innerHTML = "";
  const slots = readSlots();
  for(let i=0;i<3;i++){
    const s = slots[i];
    const el = document.createElement("div");
    el.className = "slot";
    const name = s?.name || `Empty Slot ${i+1}`;
    const meta = s ? `Updated ${new Date(s.updatedAt).toLocaleString()} • ${s.moves} moves • ${fmtSecs(s.elapsed)}` : "Empty";
    el.innerHTML = `
      <div class="name">${escapeHtml(name)}</div>
      <div class="meta">${meta}</div>
      <div class="actions">
        <button class="btn small" data-role="choose">${mode==="save"?"Save here":"Load"}</button>
        <button class="btn small" data-role="rename">Rename</button>
        <button class="btn small warn" data-role="delete">Delete</button>
      </div>
    `;
    el.style.backgroundImage = s?.thumb ? `url(${s.thumb})` : "";
    el.style.backgroundSize = "cover"; el.style.backgroundPosition="center";

    el.querySelector('[data-role="choose"]').onclick = ()=>{
      if(mode==="save"){
        if(s){
          if(!confirm(`Overwrite ${s.moves||0} moves / ${fmtSecs(s.elapsed||0)}?`)) return;
        }
        const next = makeState();
        const nm = s?.name || prompt("Name this slot","Slot "+(i+1)) || ("Slot "+(i+1));
        next.name = nm; next.createdAt = s?.createdAt || Date.now();
        slots[i] = next; writeSlots(slots);
        toast("Saved"); closeModal();
      }else{
        if(!s){ toast("Empty slot"); return; }
        applyState(s); toast("Loaded"); closeModal();
      }
    };
    el.querySelector('[data-role="rename"]').onclick = ()=>{
      const nm = prompt("New name", s?.name || ("Slot "+(i+1)));
      if(!nm) return;
      if(!slots[i]) slots[i] = makeState();
      slots[i].name = nm; slots[i].updatedAt = Date.now();
      writeSlots(slots); openSlots(mode);
    };
    el.querySelector('[data-role="delete"]').onclick = ()=>{
      if(confirm("Delete this slot?")){ slots[i]=null; writeSlots(slots); openSlots(mode); }
    };
    grid.appendChild(el);
  }
  openModal();
}
function openModal(){ document.getElementById("modal").classList.add("show"); }
function closeModal(){ document.getElementById("modal").classList.remove("show"); }
function fmtSecs(t){ const m=Math.floor(t/60), s=t%60; return `${m}m ${String(s).padStart(2,"0")}s`; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

// ---------- Reset ----------
function resetBoard(){
  const t = Math.floor((start ? Date.now()-start : 0)/1000) + elapsed;
  if(!confirm(`Reset and clear (${moves} moves, ${fmtSecs(t)})?`)) return;
  shuffle(); toast("New shuffle");
}

// ---------- Preview ----------
function togglePreview(force){
  const next = typeof force==="boolean" ? force : !preview;
  preview = next;
  if(previewBtn){
    previewBtn.classList.toggle("active", preview);
    previewBtn.textContent = preview ? "Hide Preview" : "Preview";
  }
  draw();
}

// ---------- Misc ----------
function toast(m){
  let t=document.getElementById("toast");
  if(!t){ t=document.createElement("div"); t.id="toast"; document.body.appendChild(t); }
  t.textContent=m; t.className="show"; setTimeout(()=>t.className="",1500);
}

// ---------- Events ----------
b.addEventListener("pointerdown", e=>{
  const i = indexFromXY(e.clientX, e.clientY);
  if(i!==null) tap(i);
});
addEventListener("resize", ()=>{ fit(); draw(); });

saveBtn?.addEventListener("click", ()=>openSlots("save"));
loadBtn?.addEventListener("click", ()=>openSlots("load"));
resetBtn?.addEventListener("click", resetBoard);
previewBtn?.addEventListener("click", ()=>togglePreview());

document.getElementById("modalClose")?.addEventListener("click", closeModal);
document.getElementById("modal")?.addEventListener("click", (e)=>{ if(e.target.id==="modal") closeModal(); });

// ---------- Boot ----------
img.onload = ()=>{
  fit();
  solved = Array.from({length:ROWS*COLS},(_,i)=>i);
  shuffle();

  // Optional query flags from index.html
  const q = new URL(location.href).searchParams;
  if(q.get('autoload')==='1'){
    const slots = readSlots();
    let idx=-1, ts=0;
    for(let i=0;i<3;i++) if(slots[i] && slots[i].updatedAt>ts){ ts=slots[i].updatedAt; idx=i; }
    if(idx>-1) applyState(slots[idx]);
  }
  if(q.get('manage')==='1'){ openSlots('load'); }
};
img.onerror = ()=> alert("Image not found at "+CFG.IMG_URL+" — put your photo there.");
img.src = CFG.IMG_URL;
