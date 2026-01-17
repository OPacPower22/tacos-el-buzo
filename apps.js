import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/* ================= CONFIG ================= */
const firebaseConfig = {
  apiKey: "AIzaSyD98FezUsS6uT65a0cGI8-oW0ptIEz37HU",
  authDomain: "tacos-el-buzo.firebaseapp.com",
  projectId: "tacos-el-buzo",
  storageBucket: "tacos-el-buzo.firebasestorage.app",
  messagingSenderId: "257186386764",
  appId: "1:257186386764:web:ff68c0442c914ca3e035e9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentRol = null;
let ordenes = [];
let unsub = null;

/* ================= AUTH ================= */
window.login = async () => {
  await signInWithEmailAndPassword(
    auth,
    email.value,
    pass.value
  );
};

window.logout = async () => {
  if (unsub) unsub();
  await signOut(auth);
};

/* ================= ROUTER ================= */
onAuthStateChanged(auth, async user => {
  if (!user) {
    loginModal.style.display = "flex";
    return;
  }

  currentUser = user;
  loginModal.style.display = "none";

  const snap = await getDoc(doc(db, "usuarios", user.uid));
  currentRol = snap.data().rol;

  dashboard.style.display = ["admin"].includes(currentRol) ? "block" : "none";
  vistaCaja.style.display = ["admin","caja"].includes(currentRol) ? "block" : "none";
  vistaCocina.style.display = ["admin","cocina"].includes(currentRol) ? "block" : "none";

  escucharOrdenes();
});

/* ================= ORDENES ================= */
function escucharOrdenes() {
  const q = query(collection(db, "ordenes"), orderBy("createdAt"));
  unsub = onSnapshot(q, snap => {
    ordenes = [];
    snap.forEach(d => ordenes.push({ id: d.id, ...d.data() }));
    render();
  });
}

window.crearOrdenDesdeUI = async () => {
  await addDoc(collection(db, "ordenes"), {
    tipo: tipo.value,
    cantidad: Number(cantidad.value),
    queso: conQueso.checked,
    nota: nota.value,
    estatus: "activa",
    createdAt: serverTimestamp()
  });
};

window.cambiarEstatus = async (id, est, motivo="") => {
  if (est === "cancelada" && !motivo) return;
  await updateDoc(doc(db,"ordenes",id),{estatus:est,motivo});
};

/* ================= RENDER ================= */
function render() {
  tablaCaja.innerHTML = "";
  listaCocina.innerHTML = "";

  ordenes.forEach(o => {
    if (vistaCaja.style.display !== "none") {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${o.tipo}</td>
        <td>${o.cantidad}</td>
        <td>${o.queso ? "🧀" : ""}</td>
        <td>${o.estatus}</td>
        <td>
          <button onclick="cambiarEstatus('${o.id}','en_preparacion')">Prep</button>
          <button onclick="cambiarEstatus('${o.id}','entregada')">OK</button>
          <button onclick="cancelar('${o.id}')">X</button>
        </td>`;
      tablaCaja.appendChild(tr);
    }

    if (vistaCocina.style.display !== "none" && !["entregada","cancelada"].includes(o.estatus)) {
      const d = document.createElement("div");
      d.innerHTML = `<strong>${o.tipo}</strong> x${o.cantidad} ${o.queso?"🧀":""}<br>${o.nota||""}`;
      listaCocina.appendChild(d);
    }
  });

  kpiOrdenes.innerText = ordenes.length;
  kpiEntregadas.innerText = ordenes.filter(o=>o.estatus==="entregada").length;
  kpiCanceladas.innerText = ordenes.filter(o=>o.estatus==="cancelada").length;
}

window.cancelar = id => {
  const m = prompt("Motivo de cancelación");
  if (m) cambiarEstatus(id,"cancelada",m);
};

/* ================= CORTE DIARIO ================= */
window.corteDiarioManual = async () => {
  const hoy = new Date().toISOString().split("T")[0];
  const ref = doc(db,"cierres_diarios",hoy);

  const snap = await getDoc(ref);
  if (snap.exists()) return alert("Corte ya realizado");

  await setDoc(ref,{
    fecha:hoy,
    totalOrdenes:ordenes.length,
    entregadas:ordenes.filter(o=>o.estatus==="entregada").length,
    canceladas:ordenes.filter(o=>o.estatus==="cancelada").length,
    ejecutadoPor:currentUser.uid,
    createdAt:serverTimestamp()
  });

  alert("Corte guardado");
};

/* ================= PDF ================= */
function generarPDF(titulo,data){
  const pdf = new window.jspdf.jsPDF();
  pdf.text(titulo,10,10);
  let y=20;
  data.forEach(d=>{
    pdf.text(`${d.fecha} - Órdenes:${d.totalOrdenes}`,10,y);
    y+=6;
  });
  return pdf;
}

async function obtenerCierres(inicio,fin){
  const q = query(
    collection(db,"cierres_diarios"),
    where("fecha",">=",inicio),
    where("fecha","<=",fin)
  );
  const snap = await getDocs(q);
  const r=[];
  snap.forEach(d=>r.push(d.data()));
  return r;
}

window.pdfSemanal = async ()=>{
  const h=new Date();
  const i=new Date(h.setDate(h.getDate()-7)).toISOString().split("T")[0];
  const f=new Date().toISOString().split("T")[0];
  const data=await obtenerCierres(i,f);
  generarPDF("Reporte semanal",data).save("reporte_semanal.pdf");
};

window.pdfMensualActual = async ()=>{
  const d=new Date();
  const m=d.getMonth()+1;
  const y=d.getFullYear();
  const i=`${y}-${String(m).padStart(2,"0")}-01`;
  const f=`${y}-${String(m).padStart(2,"0")}-31`;
  const data=await obtenerCierres(i,f);
  generarPDF("Reporte mensual",data).save("reporte_mensual.pdf");
};