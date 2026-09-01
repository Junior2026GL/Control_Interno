import { useEffect, useState, useCallback, useContext, useMemo } from 'react';
import {
  FiPlus, FiTrash2, FiEdit2, FiX, FiSearch, FiPrinter,
  FiUsers, FiRefreshCw, FiEye, FiCalendar, FiDollarSign,
  FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight,
} from 'react-icons/fi';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Bodegas.css';
import './ViaticosNacionales.css';

/* ── Utilidades ──────────────────────────────────────────── */
function today() { return new Date().toISOString().split('T')[0]; }

function fmtFecha(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtFechaLarga(s) {
  if (!s) return '—';
  const d = new Date(String(s).split('T')[0] + 'T12:00:00');
  const r = d.toLocaleDateString('es-HN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function fmtMonto(v) {
  return 'L ' + (parseFloat(v) || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 });
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function getDayName(iso) {
  const [y,m,d] = String(iso).split('T')[0].split('-');
  return ['DOMINGO','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO'][new Date(+y,+m-1,+d).getDay()];
}

function getAllDates(desde, hasta) {
  if (!desde || !hasta || hasta < desde) return [];
  const dates = [];
  let cur = desde;
  while (cur <= hasta) {
    dates.push(cur);
    const d = new Date(cur + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    cur = d.toISOString().split('T')[0];
  }
  return dates;
}

/* ── Número a letras (Lempiras) ─────────────────────────── */
function enteroALetras(n) {
  if (n === 0) return 'CERO';
  if (n < 0)  return 'MENOS ' + enteroALetras(-n);
  const U = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
    'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE',
    'DIECIOCHO','DIECINUEVE','VEINTE','VEINTIUN','VEINTIDOS','VEINTITRES',
    'VEINTICUATRO','VEINTICINCO','VEINTISEIS','VEINTISIETE','VEINTIOCHO','VEINTINUEVE'];
  const D = ['','DIEZ','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const C = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
    'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  if (n === 100) return 'CIEN';
  if (n < 30)    return U[n];
  if (n < 100) { const dec=Math.floor(n/10),uni=n%10; return uni===0?D[dec]:D[dec]+' Y '+U[uni]; }
  if (n < 1000) { const cen=Math.floor(n/100),r=n%100; return r===0?C[cen]:C[cen]+' '+enteroALetras(r); }
  if (n < 1000000) { const mil=Math.floor(n/1000),r=n%1000; const pre=mil===1?'MIL':enteroALetras(mil)+' MIL'; return r===0?pre:pre+' '+enteroALetras(r); }
  const mill=Math.floor(n/1000000),r=n%1000000; const pre=mill===1?'UN MILLON':enteroALetras(mill)+' MILLONES';
  return r===0?pre:pre+' '+enteroALetras(r);
}

function numeroALetras(monto) {
  const total=Math.round(parseFloat(monto||0)*100);
  const lempiras=Math.floor(total/100); const centavos=total%100;
  const base=enteroALetras(lempiras);
  return centavos===0?`${base} LEMPIRAS EXACTOS`:`${base} LEMPIRAS CON ${String(centavos).padStart(2,'0')}/100 CENTAVOS`;
}

/* ── Form vacío ──────────────────────────────────────────── */
const EMPTY_FORM = {
  numero_identidad:'', nombre_beneficiario:'', mision:'', lugar:'',
  dependencia:'', cargo:'', encargado_mision:'',
  periodo_desde:today(), periodo_hasta:today(), sabado:false,
  hora_salida:'', hora_regreso:'',
  monto_hospedaje:'', monto_combustible:'', monto_depreciacion:'',
  monto_imprevistos:'', otros_descripcion:'', monto_otros:'',
  dias_detalle:[], observaciones:'',
};

function clientValidate(form) {
  const e = {};
  if ((form.numero_identidad||'').replace(/\D/g,'').length !== 13) e.numero_identidad = 'El DNI debe tener 13 digitos.';
  if (!(form.nombre_beneficiario||'').trim()) e.nombre_beneficiario = 'Busque el DNI para obtener el nombre.';
  if (!(form.mision||'').trim()) e.mision = 'La mision es requerida.';
  if (!(form.lugar||'').trim())  e.lugar  = 'El lugar es requerido.';
  if (!form.periodo_desde) e.periodo_desde = 'Fecha de inicio requerida.';
  if (!form.periodo_hasta) e.periodo_hasta = 'Fecha de fin requerida.';
  if (form.periodo_hasta && form.periodo_desde && form.periodo_hasta < form.periodo_desde)
    e.periodo_hasta = 'La fecha fin no puede ser anterior al inicio.';
  return e;
}

/* ══ GENERADOR PDF RECIBO DE VIATICOS (landscape, 1 pagina) ══ */
async function generarReciboViatico(rec, logoDataUrl) {
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'letter' });
  const W=279.4, H=215.9, M=10, CW=W-2*M;
  const AZUL=[39,76,141], NEGRO=[20,20,20], BLANCO=[255,255,255];
  const GRIS=[238,242,250], GRIS2=[248,250,254], AZUL_L=[210,224,245];
  const sa = s=>(s||'').replace(/[AEIOUNaeiouns]/g,c=>c).replace(/[ÁÉÍÓÚÑáéíóúñ]/g,c=>({Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ñ:'N',á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n'}[c]||c));
  const fmt = v=>`L ${parseFloat(v||0).toFixed(2)}`;
  const dash= v=>parseFloat(v||0)>0?fmt(v):'-';
  let y=M;

  /* ─ ENCABEZADO ─ */
  const HH=20, LW=30, TW=88, MIDW=CW-LW-TW;
  doc.setFillColor(255,255,255); doc.setDrawColor(...AZUL); doc.setLineWidth(0.6);
  doc.rect(M,y,CW,HH,'FD');
  if (logoDataUrl) doc.addImage(logoDataUrl,'PNG',M+1,y+1,LW-2,HH-2);
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.3);
  doc.line(M+LW,y+2,M+LW,y+HH-2);
  doc.line(M+LW+MIDW,y+2,M+LW+MIDW,y+HH-2);
  const mX=M+LW+MIDW/2;
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...AZUL);
  doc.text('REPUBLICA DE HONDURAS',mX,y+7,{align:'center'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text('CONGRESO NACIONAL DE HONDURAS',mX,y+12,{align:'center'});
  doc.setFont('helvetica','bold'); doc.setFontSize(9);
  doc.text('PAGADURIA ESPECIAL',mX,y+17,{align:'center'});
  const tX=M+LW+MIDW;
  doc.setFillColor(...AZUL); doc.rect(tX,y,TW,HH,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...BLANCO);
  doc.text('RECIBO DE',tX+TW/2,y+8,{align:'center'});
  doc.setFontSize(15); doc.text('VIATICOS',tX+TW/2,y+17,{align:'center'});
  y+=HH;

  /* ─ "RECIBI DE LA PAGADURIA..." ─ */
  const montoVal=parseFloat(rec.gran_total||0);
  const montoStr=`(L${montoVal.toLocaleString('es-HN',{minimumFractionDigits:2})})`;
  const letras=sa(numeroALetras(montoVal));
  doc.setFillColor(...GRIS2); doc.setDrawColor(...AZUL); doc.setLineWidth(0.4);
  doc.rect(M,y,CW,9,'FD');
  doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(70,70,70);
  doc.text('Recibi de la Pagaduria Especial, la cantidad de:',M+2,y+3.5);
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...AZUL);
  doc.text((doc.splitTextToSize(letras,CW-55)[0]||letras),M+2,y+7.5);
  doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...AZUL);
  doc.text(montoStr,M+CW-1,y+7.5,{align:'right'});
  y+=10;

  /* ─ CAMPOS ─ */
  const RH=5, LBL=40;
  const cell=(lbl,val,ox,w,h=RH,bigVal=false)=>{
    doc.setFillColor(...GRIS); doc.rect(M+ox,y,LBL,h,'F');
    doc.setFillColor(255,255,255); doc.rect(M+ox+LBL,y,w-LBL,h,'F');
    doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2);
    doc.rect(M+ox,y,w,h,'S'); doc.line(M+ox+LBL,y,M+ox+LBL,y+h);
    doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(55,85,145);
    doc.text(sa(lbl+':'),M+ox+1.5,y+h*0.73);
    if(val!==null){
      doc.setFont('helvetica',bigVal?'bold':'normal'); doc.setFontSize(bigVal?10:8.5);
      doc.setTextColor(...NEGRO);
      const v=(doc.splitTextToSize(sa(val||''),w-LBL-3)[0]||'');
      if(bigVal) doc.text(v,M+ox+LBL+(w-LBL)/2,y+h*0.73,{align:'center'});
      else doc.text(v,M+ox+LBL+2,y+h*0.73);
    }
  };

  cell('MISION',rec.mision||'',0,CW); y+=RH;
  cell('LUGAR',rec.lugar||'',0,CW/2); cell('DEPENDENCIA',rec.dependencia||'',CW/2,CW/2); y+=RH;
  // NOMBRE DE QUIEN RECIBE — label
  doc.setFillColor(...GRIS); doc.rect(M,y,CW,RH,'F');
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2); doc.rect(M,y,CW,RH,'S');
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(55,85,145);
  doc.text('NOMBRE DE QUIEN RECIBE:',M+1.5,y+RH*0.73); y+=RH;
  // Nombre — valor grande centrado
  doc.setFillColor(255,255,255); doc.setDrawColor(...AZUL); doc.setLineWidth(0.5);
  doc.rect(M,y,CW,7,'FD');
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...AZUL);
  doc.text(sa((rec.nombre_beneficiario||'').toUpperCase()),M+CW/2,y+5,{align:'center'}); y+=7;
  cell('CARGO',rec.cargo||'',0,CW/2); cell('ENCARGADO DE LA MISION',rec.encargado_mision||'',CW/2,CW/2); y+=RH;
  // Período: 2 filas (DESDE/HASTA y HORA SALIDA/REGRESO) + columna SABADO que abarca ambas
  const PLBL=38, SABW=24, restW=CW-PLBL-SABW, halfW=restW/2, rowsH=RH*2;
  doc.setFillColor(...GRIS); doc.rect(M,y,PLBL,rowsH,'F');
  doc.setDrawColor(...AZUL_L); doc.setLineWidth(0.2); doc.rect(M,y,PLBL,rowsH,'S');
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(55,85,145);
  doc.text('PERIODO DE',M+1.5,y+rowsH/2-1); doc.text('TIEMPO:',M+1.5,y+rowsH/2+3);
  doc.setFillColor(...GRIS); doc.rect(M+PLBL+restW,y,SABW,rowsH,'F');
  doc.rect(M+PLBL+restW,y,SABW,rowsH,'S');
  doc.text('SABADO',M+PLBL+restW+SABW/2,y+4,{align:'center'});
  doc.setDrawColor(0,0,0); doc.setLineWidth(0.3);
  doc.setFillColor(rec.sabado?0:255,rec.sabado?0:255,rec.sabado?0:255);
  doc.rect(M+PLBL+restW+SABW/2-2,y+rowsH/2,4,4,rec.sabado?'FD':'S');
  cell('DESDE',fmtFecha(rec.periodo_desde),PLBL,halfW);
  cell('HASTA',fmtFecha(rec.periodo_hasta),PLBL+halfW,halfW);
  y+=RH;
  cell('HORA DE SALIDA',rec.hora_salida||'—',PLBL,halfW);
  cell('HORA DE REGRESO',rec.hora_regreso||'—',PLBL+halfW,halfW);
  y+=RH+1;

  /* ─ TABLA GASTOS ─ */
  autoTable(doc,{
    startY:y, margin:{left:M,right:M},
    head:[['No.','Detalle','TOTAL']],
    body:[
      ['1','HOSPEDAJE Y ALIMENTACION',dash(rec.monto_hospedaje)],
      ['2','COMBUSTIBLE',dash(rec.monto_combustible)],
      ['3','DEPRECIACION',dash(rec.monto_depreciacion)],
      ['4','IMPREVISTOS',dash(rec.monto_imprevistos)],
      ['5',rec.otros_descripcion?`OTROS  ${sa(rec.otros_descripcion.toUpperCase())}`:'OTROS',dash(rec.monto_otros)],
    ],
    foot:[[
      '',
      {content:'GRAN TOTAL:',styles:{halign:'right',fontStyle:'bold',fontSize:9}},
      {content:fmt(rec.gran_total),styles:{fontStyle:'bold',halign:'right',fontSize:9.5,textColor:AZUL}},
    ]],
    headStyles:{fillColor:AZUL,textColor:BLANCO,fontStyle:'bold',fontSize:7.5,cellPadding:{top:1.5,bottom:1.5,left:2.5,right:2.5}},
    bodyStyles:{fontSize:7.5,textColor:NEGRO,cellPadding:{top:1.5,bottom:1.5,left:2.5,right:2.5}},
    footStyles:{fillColor:GRIS,textColor:NEGRO,fontSize:7.5,cellPadding:{top:1.5,bottom:1.5,left:2.5,right:2.5}},
    alternateRowStyles:{fillColor:GRIS2},
    styles:{lineColor:AZUL_L,lineWidth:0.2},
    columnStyles:{0:{cellWidth:12,halign:'center'},1:{cellWidth:'auto'},2:{cellWidth:40,halign:'right'}},
  });
  y=doc.lastAutoTable.finalY+2;

  /* ─ DETALLE ALIMENTACION HOSPEDAJE ─ */
  const dias=rec.dias_detalle||[], nDias=Math.min(dias.length,12);
  const fw=nDias>0?Math.max(14,Math.floor((CW-12-52-32-28)/nDias)):0;
  autoTable(doc,{
    startY:y, margin:{left:M,right:M},
    head:[
      [{content:'DETALLE DE ALIMENTACIO HOSPEDAJE',colSpan:4+nDias,
        styles:{fillColor:[40,40,40],textColor:BLANCO,fontStyle:'bold',fontSize:8,cellPadding:{top:2,bottom:2,left:3,right:3}}}],
      ['#','Nombre','Cargo',
        ...dias.slice(0,nDias).map(d=>{const[yy,mm,dd]=String(d.fecha).split('-');return `${getDayName(d.fecha)}\n${parseInt(dd)}/${parseInt(mm)}/${yy}`;}),
        'TOTAL'],
    ],
    body:[[
      '1',sa((rec.nombre_beneficiario||'').toUpperCase()),sa((rec.cargo||'').toUpperCase()),
      ...dias.slice(0,nDias).map(d=>d.monto>0?`L ${parseFloat(d.monto).toFixed(2)}`:''),
      fmt(rec.monto_hospedaje),
    ]],
    foot:[['','TOTAL:','',
      ...dias.slice(0,nDias).map(d=>d.monto>0?`L ${parseFloat(d.monto).toFixed(2)}`:''),
      '',
    ]],
    headStyles:{fillColor:AZUL,textColor:BLANCO,fontStyle:'bold',fontSize:6.5,halign:'center',cellPadding:{top:1.5,bottom:1.5,left:1,right:1}},
    bodyStyles:{fontSize:6.5,textColor:NEGRO,cellPadding:{top:1.5,bottom:1.5,left:1,right:1}},
    footStyles:{fillColor:GRIS,textColor:NEGRO,fontSize:6.5,fontStyle:'bold',cellPadding:{top:1.5,bottom:1.5,left:1,right:1}},
    alternateRowStyles:{fillColor:GRIS2},
    styles:{lineColor:AZUL_L,lineWidth:0.2,overflow:'linebreak'},
    columnStyles:{0:{cellWidth:10,halign:'center'},1:{cellWidth:48},2:{cellWidth:30},
      ...Object.fromEntries(dias.slice(0,nDias).map((_,i)=>[i+3,{cellWidth:fw,halign:'center'}])),
      [3+nDias]:{cellWidth:28,halign:'right'}},
  });
  y=doc.lastAutoTable.finalY+2;

  /* ─ DETALLE COMBUSTIBLE ─ */
  autoTable(doc,{
    startY:y, margin:{left:M,right:M},
    head:[
      [{content:'DETALLE DE COMBUSTIBLE',colSpan:4,
        styles:{fillColor:[40,40,40],textColor:BLANCO,fontStyle:'bold',fontSize:8,cellPadding:{top:2,bottom:2,left:3,right:3}}}],
      ['#','Nombre','DETALLE/VEHICULOS','TOTAL'],
    ],
    body:[
      ['1',sa(rec.nombre_beneficiario||''),'',rec.monto_combustible>0?fmt(rec.monto_combustible):''],
      ['2','','',''],
    ],
    foot:[['','TOTAL:','',rec.monto_combustible>0?fmt(rec.monto_combustible):'-']],
    headStyles:{fillColor:AZUL,textColor:BLANCO,fontStyle:'bold',fontSize:6.5,cellPadding:{top:1.5,bottom:1.5,left:1.5,right:1.5}},
    bodyStyles:{fontSize:6.5,textColor:NEGRO,cellPadding:{top:1.5,bottom:1.5,left:1.5,right:1.5}},
    footStyles:{fillColor:GRIS,textColor:NEGRO,fontSize:6.5,fontStyle:'bold',cellPadding:{top:1.5,bottom:1.5,left:1.5,right:1.5}},
    styles:{lineColor:AZUL_L,lineWidth:0.2},
    alternateRowStyles:{fillColor:GRIS2},
    columnStyles:{0:{cellWidth:10,halign:'center'},1:{cellWidth:'auto'},2:{cellWidth:80},3:{cellWidth:30,halign:'right'}},
  });
  y=doc.lastAutoTable.finalY+3;

  /* ─ FIRMA (IDENTIDAD / NOMBRE / FIRMA apiladas, como el formato fisico) ─ */
  if(y>H-24){doc.addPage();y=M;}
  const lineEnd=M+CW-2, lblW=24;
  doc.setDrawColor(0,0,0); doc.setLineWidth(0.3);
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...NEGRO);
  doc.text('IDENTIDAD:',M,y+3.5);
  doc.setFont('helvetica','normal'); doc.text(sa(rec.numero_identidad||''),M+lblW,y+3.5);
  doc.line(M+lblW,y+5,lineEnd,y+5); y+=8;
  doc.setFont('helvetica','bold'); doc.text('NOMBRE:',M,y+3.5);
  doc.setFont('helvetica','normal'); doc.text(sa((rec.nombre_beneficiario||'').toUpperCase()),M+lblW,y+3.5);
  doc.line(M+lblW,y+5,lineEnd,y+5); y+=8;
  doc.setFont('helvetica','bold'); doc.text('FIRMA:',M,y+3.5);
  doc.line(M+lblW,y+5,lineEnd,y+5);

  doc.save(`recibo_viaticos_${(rec.numero_identidad||'').slice(-6)}_${String(rec.periodo_desde||'').slice(0,10)}.pdf`);
}

/* ══════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════ */
export default function ViaticosNacionales() {
  const { user } = useContext(AuthContext);

  const [registros, setRegistros]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [editing, setEditing]       = useState(null);
  const [viewing, setViewing]       = useState(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast]           = useState(null);
  const [busqueda, setBusqueda]     = useState('');
  const [filtroAnio, setFiltroAnio] = useState(String(new Date().getFullYear()));
  const [page, setPage]             = useState(1);
  const [dniLoading, setDniLoading] = useState(false);
  const [dniError, setDniError]     = useState('');
  const [printLoading, setPrintLoading] = useState(null);

  const PAGE_SIZE = 10;
  const canEdit   = ['SUPER_ADMIN','ADMIN','ASISTENTE'].includes(user?.rol);

  const showToast = (msg, type='error') => { setToast({msg,type}); setTimeout(()=>setToast(null),4500); };

  const fetchRegistros = useCallback(async () => {
    setLoading(true);
    try { const res=await api.get('/viaticos-nacionales',{headers:authHeaders()}); setRegistros(res.data); }
    catch { showToast('Error al cargar los registros.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ fetchRegistros(); },[fetchRegistros]);
  useEffect(()=>{ setPage(1); },[busqueda,filtroAnio]);

  useEffect(()=>{
    const h=(e)=>{
      if(e.key!=='Escape')return;
      if(modal){closeModal();return;} if(viewing){setViewing(null);return;} if(confirmDel){setConfirmDel(null);}
    };
    document.addEventListener('keydown',h); return ()=>document.removeEventListener('keydown',h);
  },[modal,viewing,confirmDel]);

  useEffect(()=>{
    const desde=form.periodo_desde, hasta=form.periodo_hasta;
    if(!desde||!hasta||hasta<desde)return;
    const fechas=getAllDates(desde,hasta);
    setForm(f=>({...f, dias_detalle:fechas.map(fecha=>{
      const exist=f.dias_detalle.find(d=>d.fecha===fecha);
      return exist||{fecha,monto:''};
    })}));
  },[form.periodo_desde,form.periodo_hasta]);

  const handleDniSearch = async () => {
    const dni=(form.numero_identidad||'').replace(/\D/g,'');
    if(dni.length!==13){setDniError('Ingrese los 13 digitos del DNI.');return;}
    setDniLoading(true); setDniError('');
    try {
      const res=await api.get(`/censo/${encodeURIComponent(dni)}`,{headers:authHeaders()});
      setForm(f=>({...f,nombre_beneficiario:res.data.nombreCompleto}));
      setFormErrors(prev=>({...prev,nombre_beneficiario:undefined,numero_identidad:undefined}));
    } catch(err){ setDniError(err.response?.data?.message||'Persona no encontrada en el censo.'); }
    finally { setDniLoading(false); }
  };

  const granTotal = useMemo(()=>
    ['monto_hospedaje','monto_combustible','monto_depreciacion','monto_imprevistos','monto_otros']
      .reduce((s,k)=>s+(parseFloat(form[k])||0),0),
    [form.monto_hospedaje,form.monto_combustible,form.monto_depreciacion,form.monto_imprevistos,form.monto_otros]
  );

  const availableYears = useMemo(()=>{
    const s=new Set(registros.map(r=>String(r.periodo_desde).slice(0,4)));
    return [...s].sort((a,b)=>b-a);
  },[registros]);

  const filtered = useMemo(()=>{
    let f=[...registros];
    if(filtroAnio) f=f.filter(r=>String(r.periodo_desde).slice(0,4)===filtroAnio);
    const q=busqueda.trim().toLowerCase();
    if(q) f=f.filter(r=>
      (r.nombre_beneficiario||'').toLowerCase().includes(q)||
      (r.numero_identidad||'').includes(q)||
      (r.lugar||'').toLowerCase().includes(q)||
      (r.mision||'').toLowerCase().includes(q));
    return f;
  },[registros,busqueda,filtroAnio]);

  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const paginated=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  const openNew=()=>{ setEditing(null); setForm({...EMPTY_FORM}); setDniError(''); setFormErrors({}); setModal(true); };

  const openEdit=async(id)=>{
    try {
      const res=await api.get(`/viaticos-nacionales/${id}`,{headers:authHeaders()});
      const r=res.data;
      setEditing(id);
      setForm({
        numero_identidad:r.numero_identidad||'', nombre_beneficiario:r.nombre_beneficiario||'',
        mision:r.mision||'', lugar:r.lugar||'', dependencia:r.dependencia||'',
        cargo:r.cargo||'', encargado_mision:r.encargado_mision||'',
        periodo_desde:String(r.periodo_desde).split('T')[0],
        periodo_hasta:String(r.periodo_hasta).split('T')[0],
        sabado:!!r.sabado, hora_salida:r.hora_salida||'', hora_regreso:r.hora_regreso||'',
        monto_hospedaje:r.monto_hospedaje||'', monto_combustible:r.monto_combustible||'',
        monto_depreciacion:r.monto_depreciacion||'', monto_imprevistos:r.monto_imprevistos||'',
        otros_descripcion:r.otros_descripcion||'', monto_otros:r.monto_otros||'',
        dias_detalle:Array.isArray(r.dias_detalle)?r.dias_detalle:[],
        observaciones:r.observaciones||'',
      });
      setDniError(''); setFormErrors({}); setModal(true);
    } catch { showToast('Error al cargar el registro.'); }
  };

  const closeModal=()=>{ setModal(false); setEditing(null); setDniError(''); };

  const handleField=(e)=>{
    const{name,value,type,checked}=e.target;
    setForm(prev=>({...prev,[name]:type==='checkbox'?checked:value}));
    setFormErrors(prev=>({...prev,[name]:undefined}));
  };

  const handleDiasMonto=(fecha,value)=>{
    setForm(prev=>({...prev,dias_detalle:prev.dias_detalle.map(d=>d.fecha===fecha?{...d,monto:value}:d)}));
  };

  const handleSave=async(e)=>{
    e.preventDefault();
    const errors=clientValidate(form);
    if(Object.keys(errors).length>0){setFormErrors(errors);return;}
    setSaving(true);
    try {
      const payload={
        ...form,
        numero_identidad:form.numero_identidad.replace(/\D/g,''),
        nombre_beneficiario:form.nombre_beneficiario.trim().toUpperCase(),
        mision:form.mision.trim().toUpperCase(), lugar:form.lugar.trim().toUpperCase(),
        dependencia:form.dependencia.trim().toUpperCase(), cargo:form.cargo.trim().toUpperCase(),
        encargado_mision:form.encargado_mision.trim().toUpperCase()||null,
        monto_hospedaje:parseFloat(form.monto_hospedaje)||0,
        monto_combustible:parseFloat(form.monto_combustible)||0,
        monto_depreciacion:parseFloat(form.monto_depreciacion)||0,
        monto_imprevistos:parseFloat(form.monto_imprevistos)||0,
        monto_otros:parseFloat(form.monto_otros)||0,
        dias_detalle:form.dias_detalle.map(d=>({fecha:d.fecha,monto:parseFloat(d.monto)||0})),
      };
      if(editing){ await api.put(`/viaticos-nacionales/${editing}`,payload,{headers:authHeaders()}); showToast('Registro actualizado correctamente.','ok'); }
      else        { await api.post('/viaticos-nacionales',payload,{headers:authHeaders()}); showToast('Viatico registrado correctamente.','ok'); }
      closeModal(); fetchRegistros();
    } catch(err){ showToast(err.response?.data?.message||'Error al guardar.','error'); }
    finally { setSaving(false); }
  };

  const handleDelete=async()=>{
    if(!confirmDel||deleting)return;
    setDeleting(true);
    try {
      await api.delete(`/viaticos-nacionales/${confirmDel.id}`,{headers:authHeaders()});
      showToast('Registro eliminado.','ok'); setConfirmDel(null); fetchRegistros();
    } catch(err){ showToast(err.response?.data?.message||'Error al eliminar.','error'); setConfirmDel(null); }
    finally { setDeleting(false); }
  };

  const handlePrint=async(id)=>{
    setPrintLoading(id);
    try {
      const res=await api.get(`/viaticos-nacionales/${id}`,{headers:authHeaders()});
      let logoData=null;
      try {
        const resp=await fetch('/logo-congreso.png.png');
        if(resp.ok){
          const blob=await resp.blob(); const blobUrl=URL.createObjectURL(blob);
          logoData=await new Promise(resolve=>{
            const img=new Image();
            img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);URL.revokeObjectURL(blobUrl);resolve(c.toDataURL('image/png'));};
            img.onerror=()=>{URL.revokeObjectURL(blobUrl);resolve(null);}; img.src=blobUrl;
          });
        }
      } catch { /* logo opcional */ }
      await generarReciboViatico(res.data,logoData);
      showToast('PDF generado correctamente.','ok');
    } catch { showToast('Error al generar el PDF.','error'); }
    finally { setPrintLoading(null); }
  };

  return (
    <div className="page-shell">
      <Navbar />
      <div className="bod-container">

        {toast && <div className={`bod-toast ${toast.type==='ok'?'bod-toast--ok':'bod-toast--err'}`}>{toast.msg}</div>}

        <div className="bod-page-header">
          <div className="bod-page-header__left">
            <div className="bod-page-icon"><FiDollarSign size={22}/></div>
            <div>
              <h1 className="bod-page-title">Viaticos Nacionales</h1>
              <p className="bod-page-sub">Recibos de viaticos para empleados — Pagaduria Especial</p>
            </div>
          </div>
          <div className="bod-page-header__right">
            <button className="bod-btn bod-btn--outline" onClick={fetchRegistros} title="Actualizar"><FiRefreshCw size={15}/></button>
            {canEdit && <button className="bod-btn bod-btn--primary" onClick={openNew}><FiPlus size={15}/> Nuevo Recibo</button>}
          </div>
        </div>

        <div className="bod-stats">
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--blue"><FiUsers size={20}/></div>
            <div className="bod-stat__body"><span className="bod-stat__label">Total Registros</span><span className="bod-stat__value">{registros.length}</span></div>
          </div>
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--green"><FiDollarSign size={20}/></div>
            <div className="bod-stat__body">
              <span className="bod-stat__label">Total Pagado</span>
              <span className="bod-stat__value bod-stat__value--green">{fmtMonto(registros.reduce((s,r)=>s+(parseFloat(r.gran_total)||0),0))}</span>
            </div>
          </div>
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--amber"><FiCalendar size={20}/></div>
            <div className="bod-stat__body"><span className="bod-stat__label">Registros {filtroAnio||'todos'}</span><span className="bod-stat__value">{filtered.length}</span></div>
          </div>
        </div>

        <div className="bod-filter-card">
          <div className="bod-filter-row">
            <div className="bod-toolbar__search">
              <FiSearch className="bod-toolbar__search-icon" size={15}/>
              <input className="bod-toolbar__input" placeholder="Buscar por nombre, DNI, lugar, mision…" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
            </div>
            <div className="bod-filter-dates">
              <div className="bod-filter-date-group">
                <FiCalendar size={13} className="bod-filter-date-icon"/>
                <span className="bod-filter-date-label">Año</span>
                <select className="bod-filter-date-input" value={filtroAnio} onChange={e=>setFiltroAnio(e.target.value)} style={{width:80}}>
                  <option value="">Todos</option>
                  {availableYears.map(y=><option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {(busqueda||filtroAnio) && <button className="bod-btn bod-btn--ghost bod-btn--sm bod-btn--clear" onClick={()=>{setBusqueda('');setFiltroAnio('');setPage(1);}}><FiX size={13}/> Limpiar</button>}
            </div>
          </div>
        </div>

        <div className="bod-card">
          <div className="bod-table-info">
            <span className="bod-table-info__range">
              {filtered.length===0?<span>0 registros</span>:<><strong>{(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filtered.length)}</strong> de <strong>{filtered.length}</strong></>}
            </span>
            {filtered.length>0&&<span className="bod-table-info__page">Pag. <strong>{page}</strong> / {totalPages}</span>}
          </div>
          <div className="bod-table-wrap">
            {loading?<div className="bod-loading">Cargando registros…</div>
             :filtered.length===0?<div className="bod-empty"><FiDollarSign size={36} style={{opacity:.3}}/><p>No hay registros.</p></div>
             :(
              <table className="bod-table">
                <thead><tr>
                  <th className="bod-th-num">N°</th>
                  <th>Identidad</th><th>Nombre del Beneficiario</th>
                  <th>Mision / Lugar</th><th>Periodo</th>
                  <th className="bod-th-center">Gran Total</th>
                  <th className="bod-th-actions">Acciones</th>
                </tr></thead>
                <tbody>
                  {paginated.map((r,idx)=>(
                    <tr key={r.id}>
                      <td className="bod-td-num">{(page-1)*PAGE_SIZE+idx+1}</td>
                      <td><span className="vn-dni">{r.numero_identidad}</span></td>
                      <td><span className="bod-name">{r.nombre_beneficiario}</span></td>
                      <td><div className="vn-mision">{r.mision}</div><span className="bod-depto-chip">{r.lugar}</span></td>
                      <td><span className="bod-fecha">{fmtFecha(r.periodo_desde)}</span><span className="vn-sep">→</span><span className="bod-fecha">{fmtFecha(r.periodo_hasta)}</span></td>
                      <td className="bod-td-center"><span className="vn-total">{fmtMonto(r.gran_total)}</span></td>
                      <td>
                        <div className="bod-actions">
                          <button className="bod-btn-action bod-btn-action--view" title="Ver" onClick={()=>setViewing(r)}><FiEye size={13}/></button>
                          <button className="bod-btn-action bod-btn-action--view" title="Imprimir recibo"
                            disabled={printLoading===r.id} onClick={()=>handlePrint(r.id)} style={{color:'#16a34a'}}>
                            {printLoading===r.id?<span className="bod-btn-spinner" style={{borderTopColor:'#16a34a'}}/>:<FiPrinter size={13}/>}
                          </button>
                          {canEdit&&<>
                            <button className="bod-btn-action bod-btn-action--edit" title="Editar" onClick={()=>openEdit(r.id)}><FiEdit2 size={13}/></button>
                            <button className="bod-btn-action bod-btn-action--del" title="Eliminar" onClick={()=>setConfirmDel(r)}><FiTrash2 size={13}/></button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!loading&&filtered.length>0&&totalPages>1&&(
            <div className="bod-pagination">
              <button className="bod-pgn-btn" disabled={page===1} onClick={()=>setPage(1)}><FiChevronsLeft size={14}/></button>
              <button className="bod-pgn-btn" disabled={page===1} onClick={()=>setPage(p=>p-1)}><FiChevronLeft size={14}/></button>
              <div className="bod-pgn-pages">
                {Array.from({length:totalPages},(_,i)=>i+1)
                  .filter(p=>p===1||p===totalPages||Math.abs(p-page)<=2)
                  .reduce((acc,p,i,arr)=>{if(i>0&&p-arr[i-1]>1)acc.push('…');acc.push(p);return acc;},[])
                  .map((p,i)=>typeof p==='string'
                    ?<span key={i} className="bod-pgn-dots">…</span>
                    :<button key={p} className={`bod-pgn-btn bod-pgn-btn--num ${page===p?'bod-pgn-btn--active':''}`} onClick={()=>setPage(p)}>{p}</button>
                  )}
              </div>
              <button className="bod-pgn-btn" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}><FiChevronRight size={14}/></button>
              <button className="bod-pgn-btn" disabled={page===totalPages} onClick={()=>setPage(totalPages)}><FiChevronsRight size={14}/></button>
            </div>
          )}
        </div>

        {/* Modal Ver */}
        {viewing&&(
          <div className="bod-modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setViewing(null);}}>
            <div className="bod-modal bod-modal--view">
              <div className="bod-modal__header">
                <h2 className="bod-modal__title">Detalle del Recibo</h2>
                <button className="bod-btn bod-btn--ghost" onClick={()=>setViewing(null)}><FiX size={18}/></button>
              </div>
              <div className="bod-view-body">
                <div className="bod-view-hero">
                  <div className="bod-view-hero__icon"><FiDollarSign size={26}/></div>
                  <div>
                    <p className="bod-view-hero__name">{viewing.nombre_beneficiario}</p>
                    <p className="bod-view-hero__sub">DNI: {viewing.numero_identidad} · {viewing.cargo}</p>
                  </div>
                </div>
                <div className="bod-view-grid">
                  <div className="bod-view-field"><span className="bod-view-label">Mision</span><span className="bod-view-value">{viewing.mision}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Lugar</span><span className="bod-view-value">{viewing.lugar}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Periodo</span><span className="bod-view-value">{fmtFechaLarga(viewing.periodo_desde)} → {fmtFechaLarga(viewing.periodo_hasta)}</span></div>
                  <div className="bod-view-field"><span className="bod-view-label">Gran Total</span><span className="bod-view-value bod-view-value--big">{fmtMonto(viewing.gran_total)}</span></div>
                </div>
                <div className="bod-view-footer">
                  <button className="bod-btn bod-btn--outline" onClick={()=>handlePrint(viewing.id)}><FiPrinter size={14}/> Imprimir</button>
                  {canEdit&&<button className="bod-btn bod-btn--outline" onClick={()=>{setViewing(null);openEdit(viewing.id);}}><FiEdit2 size={14}/> Editar</button>}
                  <button className="bod-btn bod-btn--primary" onClick={()=>setViewing(null)}>Cerrar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal Crear/Editar */}
        {modal&&(
          <div className="bod-modal-overlay" onClick={e=>{if(e.target===e.currentTarget)closeModal();}}>
            <div className="bod-modal vn-modal">
              <div className="bod-modal__header">
                <h2 className="bod-modal__title">{editing?'Editar Recibo de Viaticos':'Nuevo Recibo de Viaticos'}</h2>
                <button className="bod-btn bod-btn--ghost" onClick={closeModal}><FiX size={18}/></button>
              </div>
              <form className="bod-modal__body" onSubmit={handleSave} noValidate>

                {/* DNI */}
                <div className="vn-dni-section">
                  <div className="vn-dni-title">IDENTIFICACION DEL BENEFICIARIO</div>
                  <div className="vn-dni-row">
                    <div className="vn-dni-field">
                      <label className="bod-label">Numero de Identidad (DNI) *</label>
                      <div className="vn-dni-input-wrap">
                        <input className={`bod-input vn-dni-input ${formErrors.numero_identidad?'bod-input--error':''}`}
                          name="numero_identidad" value={form.numero_identidad}
                          onChange={e=>{handleField(e);setDniError('');}}
                          onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),handleDniSearch())}
                          placeholder="0000-0000-00000  (13 digitos)" maxLength={20}/>
                        <button type="button" className="bod-btn bod-btn--primary vn-btn-buscar" onClick={handleDniSearch} disabled={dniLoading}>
                          {dniLoading?<span className="bod-btn-spinner"/>:<FiSearch size={15}/>}
                          {dniLoading?' Buscando…':' Buscar'}
                        </button>
                      </div>
                      {formErrors.numero_identidad&&<span className="bod-error">{formErrors.numero_identidad}</span>}
                      {dniError&&<span className="bod-error">{dniError}</span>}
                    </div>
                    <div className="vn-nombre-found">
                      <label className="bod-label">Nombre del Beneficiario *</label>
                      <div className={`vn-nombre-display ${form.nombre_beneficiario?'vn-nombre-display--found':''}`}>
                        {form.nombre_beneficiario||'Busque el DNI para auto-completar el nombre'}
                      </div>
                      {formErrors.nombre_beneficiario&&<span className="bod-error">{formErrors.nombre_beneficiario}</span>}
                    </div>
                  </div>
                </div>

                <div className="vn-section-title">DATOS DEL VIAJE</div>
                <div className="bod-field bod-field--full">
                  <label className="bod-label">Mision *</label>
                  <textarea className={`bod-textarea ${formErrors.mision?'bod-input--error':''}`} name="mision" value={form.mision} onChange={handleField} rows={2} placeholder="Descripcion de la mision…"/>
                  {formErrors.mision&&<span className="bod-error">{formErrors.mision}</span>}
                </div>
                <div className="bod-field"><label className="bod-label">Lugar *</label>
                  <input className={`bod-input ${formErrors.lugar?'bod-input--error':''}`} name="lugar" value={form.lugar} onChange={handleField} placeholder="Ciudad / Departamento"/>
                  {formErrors.lugar&&<span className="bod-error">{formErrors.lugar}</span>}
                </div>
                <div className="bod-field"><label className="bod-label">Dependencia</label><input className="bod-input" name="dependencia" value={form.dependencia} onChange={handleField}/></div>
                <div className="bod-field"><label className="bod-label">Cargo</label><input className="bod-input" name="cargo" value={form.cargo} onChange={handleField}/></div>
                <div className="bod-field"><label className="bod-label">Encargado de la Mision</label><input className="bod-input" name="encargado_mision" value={form.encargado_mision} onChange={handleField}/></div>
                <div className="bod-field"><label className="bod-label">Periodo Desde *</label>
                  <input type="date" className={`bod-input ${formErrors.periodo_desde?'bod-input--error':''}`} name="periodo_desde" value={form.periodo_desde} onChange={handleField}/>
                  {formErrors.periodo_desde&&<span className="bod-error">{formErrors.periodo_desde}</span>}
                </div>
                <div className="bod-field"><label className="bod-label">Periodo Hasta *</label>
                  <input type="date" className={`bod-input ${formErrors.periodo_hasta?'bod-input--error':''}`} name="periodo_hasta" value={form.periodo_hasta} onChange={handleField}/>
                  {formErrors.periodo_hasta&&<span className="bod-error">{formErrors.periodo_hasta}</span>}
                </div>
                <div className="bod-field"><label className="bod-label">Hora de Salida</label><input type="time" className="bod-input" name="hora_salida" value={form.hora_salida} onChange={handleField}/></div>
                <div className="bod-field"><label className="bod-label">Hora de Regreso</label><input type="time" className="bod-input" name="hora_regreso" value={form.hora_regreso} onChange={handleField}/></div>
                <div className="bod-field vn-sabado-field"><label className="vn-check-label"><input type="checkbox" name="sabado" checked={form.sabado} onChange={handleField}/> Incluye Sabado</label></div>

                <div className="vn-section-title bod-field--full">DETALLE DE GASTOS</div>
                <div className="bod-field"><label className="bod-label">Hospedaje y Alimentacion</label><input type="number" min="0" step="0.01" className="bod-input" name="monto_hospedaje" value={form.monto_hospedaje} onChange={handleField} placeholder="0.00"/></div>
                <div className="bod-field"><label className="bod-label">Combustible</label><input type="number" min="0" step="0.01" className="bod-input" name="monto_combustible" value={form.monto_combustible} onChange={handleField} placeholder="0.00"/></div>
                <div className="bod-field"><label className="bod-label">Depreciacion</label><input type="number" min="0" step="0.01" className="bod-input" name="monto_depreciacion" value={form.monto_depreciacion} onChange={handleField} placeholder="0.00"/></div>
                <div className="bod-field"><label className="bod-label">Imprevistos</label><input type="number" min="0" step="0.01" className="bod-input" name="monto_imprevistos" value={form.monto_imprevistos} onChange={handleField} placeholder="0.00"/></div>
                <div className="bod-field"><label className="bod-label">Otros — Descripcion</label><input className="bod-input" name="otros_descripcion" value={form.otros_descripcion} onChange={handleField} placeholder="Ej. OTROS 4 PEAJES LPS. 22.00"/></div>
                <div className="bod-field"><label className="bod-label">Otros — Monto</label><input type="number" min="0" step="0.01" className="bod-input" name="monto_otros" value={form.monto_otros} onChange={handleField} placeholder="0.00"/></div>

                <div className="bod-field bod-field--full vn-gran-total">
                  <span className="vn-gran-total__label">GRAN TOTAL</span>
                  <span className="vn-gran-total__value">{fmtMonto(granTotal)}</span>
                </div>

                {form.dias_detalle.length>0&&(
                  <div className="bod-field bod-field--full">
                    <div className="vn-section-title">DETALLE DIARIO — HOSPEDAJE</div>
                    <div className="vn-dias-table">
                      <div className="vn-dias-header"><span>Dia</span><span>Fecha</span><span>Monto (L)</span></div>
                      {form.dias_detalle.map(d=>(
                        <div key={d.fecha} className="vn-dias-row">
                          <span className="vn-dias-day">{getDayName(d.fecha)}</span>
                          <span className="vn-dias-fecha">{fmtFecha(d.fecha)}</span>
                          <input type="number" min="0" step="0.01" className="bod-input vn-dias-monto"
                            value={d.monto} onChange={e=>handleDiasMonto(d.fecha,e.target.value)} placeholder="0.00"/>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bod-field bod-field--full">
                  <label className="bod-label">Observaciones</label>
                  <textarea className="bod-textarea" name="observaciones" value={form.observaciones} onChange={handleField} rows={2} maxLength={500}/>
                </div>

                <div className="bod-modal__footer">
                  <button type="button" className="bod-btn bod-btn--outline" onClick={closeModal}>Cancelar</button>
                  <button type="submit" className="bod-btn bod-btn--primary" disabled={saving}>
                    {saving?<><span className="bod-btn-spinner"/> Guardando…</>:editing?'Actualizar':'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirmar eliminar */}
        {confirmDel&&(
          <div className="bod-modal-overlay">
            <div className="bod-confirm">
              <div className="bod-confirm__icon"><FiTrash2 size={26}/></div>
              <h3 className="bod-confirm__title">Eliminar recibo?</h3>
              <p className="bod-confirm__msg">Se eliminara el viatico de <strong>{confirmDel.nombre_beneficiario}</strong>. Esta accion no se puede deshacer.</p>
              <div className="bod-confirm__actions">
                <button className="bod-btn bod-btn--outline" disabled={deleting} onClick={()=>setConfirmDel(null)}>Cancelar</button>
                <button className="bod-btn bod-btn--danger" disabled={deleting} onClick={handleDelete}>
                  {deleting?<><span className="bod-btn-spinner"/> Eliminando…</>:'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
