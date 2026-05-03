import { useEffect, useState, useCallback, useContext } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FiPlus, FiTrendingUp, FiTrendingDown,
  FiList, FiX, FiCalendar,
  FiFileText, FiTag, FiTrash2, FiAlertTriangle, FiDownload, FiUser, FiEdit2,
} from 'react-icons/fi';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './CajaChica.css';

const CATEGORIAS_EGRESO = [
  'Papelería / Útiles',
  'Transporte / Viáticos',
  'Limpieza',
  'Mantenimiento',
  'Servicios',
  'Alimentación',
  'Otros',
];

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmt(num) {
  return 'Lps. ' + new Intl.NumberFormat('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num ?? 0);
}

function fmtFecha(fechaStr) {
  const dateOnly = String(fechaStr).split('T')[0];
  const d = new Date(dateOnly + 'T12:00:00');
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const EMPTY_RECARGA = { fecha: today(), descripcion: '', monto: '' };
const EMPTY_EGRESO  = { fecha: today(), descripcion: '', categoria: 'Papelería / Útiles', monto: '' };

const MONTO_MAX = 9_999_999;

// Returns object with per-field errors; empty object = valid
function clientValidate(form, tipo) {
  const errors = {};
  const desc = (form.descripcion || '').trim();

  // fecha
  if (!form.fecha) {
    errors.fecha = 'La fecha es requerida.';
  } else {
    const fechaD = new Date(form.fecha + 'T12:00:00');
    if (isNaN(fechaD.getTime())) {
      errors.fecha = 'La fecha no es válida.';
    } else {
      const now = new Date();
      const oneYearAhead = new Date(now); oneYearAhead.setFullYear(now.getFullYear() + 1);
      const tenYearsBack = new Date(now); tenYearsBack.setFullYear(now.getFullYear() - 10);
      if (fechaD > oneYearAhead) errors.fecha = 'No puede estar más de un año en el futuro.';
      else if (fechaD < tenYearsBack) errors.fecha = 'Fecha demasiado antigua (máx. 10 años).';
    }
  }

  // monto
  const montoNum = parseFloat(form.monto);
  if (form.monto === '' || form.monto === undefined || form.monto === null || isNaN(montoNum)) {
    errors.monto = 'El monto es requerido.';
  } else if (montoNum <= 0) {
    errors.monto = 'El monto debe ser mayor a cero.';
  } else if (montoNum > MONTO_MAX) {
    errors.monto = `No puede superar Lps. ${MONTO_MAX.toLocaleString('es-HN')}.`;
  }

  // descripcion
  if (!desc) {
    errors.descripcion = 'La descripción es requerida.';
  } else if (desc.length < 3) {
    errors.descripcion = 'Mínimo 3 caracteres.';
  } else if (desc.length > 200) {
    errors.descripcion = 'Máximo 200 caracteres.';
  }

  // categoria (solo egreso)
  if (tipo === 'egreso' && !CATEGORIAS_EGRESO.includes(form.categoria)) {
    errors.categoria = 'Categoría inválida.';
  }

  return errors;
}

export default function CajaChica() {
  const { user } = useContext(AuthContext);
  const esSuperAdmin = user?.rol === 'SUPER_ADMIN';
  const puedeVerOtros = ['SUPER_ADMIN', 'ADMIN'].includes(user?.rol);

  const [movimientos, setMovimientos] = useState([]);
  const [stats, setStats]             = useState({ saldo: 0, total_recargas: 0, total_egresos: 0 });
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('TODOS');
  const [modal, setModal]             = useState(null);   // null | 'recarga' | 'egreso'
  const [form, setForm]               = useState({});
  const [formErrors, setFormErrors]   = useState({});
  const [saving, setSaving]           = useState(false);
  const [confirmDel, setConfirmDel]   = useState(null);  // id to delete
  const [pdfModal, setPdfModal]       = useState(false);
  const [pdfDesde, setPdfDesde]       = useState('');
  const [pdfHasta, setPdfHasta]       = useState('');
  const [toast, setToast]             = useState(null); // { msg, type: 'warn'|'error'|'info'|'ok' }
  const [busqueda, setBusqueda]       = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(10);

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Selector de usuario (solo SUPER_ADMIN)
  const [usuarios, setUsuarios]       = useState([]);
  const [selectedUid, setSelectedUid] = useState(null); // null = propio

  // Para SUPER_ADMIN y ADMIN: cargar lista de usuarios con caja
  useEffect(() => {
    if (!puedeVerOtros) return;
    api.get('/caja/usuarios', { headers: authHeaders() })
      .then(r => setUsuarios(r.data))
      .catch(() => {});
  }, [puedeVerOtros]);

  // uidParam: query param a enviar en las peticiones
  const uidParam = puedeVerOtros && selectedUid ? `?usuario_id=${selectedUid}` : '';
  const uidForPost = puedeVerOtros && selectedUid ? selectedUid : undefined;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [movRes, statsRes] = await Promise.all([
        api.get('/caja' + uidParam,        { headers: authHeaders() }),
        api.get('/caja/saldo' + uidParam,  { headers: authHeaders() }),
      ]);
      setMovimientos(movRes.data);
      setStats(statsRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [uidParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calculate running balance (oldest → newest), then reverse for newest-first display
  const movimientosConSaldo = (() => {
    const sorted = [...movimientos].sort(
      (a, b) => new Date(a.fecha) - new Date(b.fecha) || a.id - b.id
    );
    let running = 0;
    const withBal = sorted.map(m => {
      const amount = parseFloat(m.monto);
      running += m.tipo === 'EGRESO' ? -amount : amount;
      return { ...m, saldo_acum: running };
    });
    return withBal.reverse();
  })();

  const filtered = (() => {
    let f = filter === 'TODOS' ? movimientosConSaldo : movimientosConSaldo.filter(m => m.tipo === filter);
    const q = busqueda.trim().toLowerCase();
    if (q) f = f.filter(m =>
      (m.descripcion || '').toLowerCase().includes(q) ||
      (m.categoria || '').toLowerCase().includes(q)
    );
    if (filtroDesde) {
      const desde = new Date(filtroDesde + 'T00:00:00');
      f = f.filter(m => new Date(String(m.fecha).split('T')[0] + 'T12:00:00') >= desde);
    }
    if (filtroHasta) {
      const hasta = new Date(filtroHasta + 'T23:59:59');
      f = f.filter(m => new Date(String(m.fecha).split('T')[0] + 'T12:00:00') <= hasta);
    }
    return f;
  })();

  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const totalFiltered = filtered.length;
  const totalPages    = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const paginated     = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── Modal helpers ──────────────────────────────────────
  const openRecarga = () => { setForm({ ...EMPTY_RECARGA }); setFormErrors({}); setModal('recarga'); };
  const openEgreso  = () => { setForm({ ...EMPTY_EGRESO  }); setFormErrors({}); setModal('egreso'); };
  const openEditar  = (m) => {
    setForm({
      fecha:       String(m.fecha).split('T')[0],
      descripcion: m.descripcion || '',
      monto:       parseFloat(m.monto).toFixed(2),
      categoria:   m.categoria || CATEGORIAS_EGRESO[0],
      _id:         m.id,
      _tipo:       m.tipo,
    });
    setFormErrors({});
    setModal('editar');
  };
  const closeModal  = () => { setModal(null); setFormErrors({}); };

  const handleSave = async (e) => {
    e.preventDefault();
    const tipoValidacion = modal === 'editar'
      ? (form._tipo === 'EGRESO' ? 'egreso' : 'recarga')
      : modal;
    const errors = clientValidate(form, tipoValidacion);
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    setSaving(true);
    try {
      if (modal === 'editar') {
        const payload = {
          fecha:       form.fecha,
          descripcion: form.descripcion.trim(),
          monto:       parseFloat(parseFloat(form.monto).toFixed(2)),
          ...(form._tipo === 'EGRESO' ? { categoria: form.categoria } : {}),
        };
        await api.put(`/caja/${form._id}`, payload, { headers: authHeaders() });
        closeModal();
        fetchData();
        showToast('Movimiento actualizado correctamente.', 'ok');
      } else {
        const tipo = modal === 'recarga' ? 'RECARGA' : 'EGRESO';
        const payload = {
          fecha:       form.fecha,
          descripcion: form.descripcion.trim(),
          monto:       parseFloat(parseFloat(form.monto).toFixed(2)),
          tipo,
          ...(modal === 'egreso' ? { categoria: form.categoria } : {}),
          ...(uidForPost ? { usuario_id: uidForPost } : {}),
        };
        await api.post('/caja', payload, { headers: authHeaders() });
        closeModal();
        fetchData();
        showToast(modal === 'recarga' ? 'Recarga registrada correctamente.' : 'Egreso registrado correctamente.', 'ok');
      }
    } catch (err) {
      setFormErrors({ _server: err.response?.data?.message || 'Error al guardar. Intente de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/caja/${confirmDel.id}`, { headers: authHeaders() });
      setConfirmDel(null);
      fetchData();
      showToast('Movimiento eliminado.', 'ok');
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al eliminar.');
    }
  };

  const isPositive = (tipo) => tipo !== 'EGRESO';

  // ── PDF generation ───────────────────────────────────
  const generarPDF = async () => {
    try {
      const desde = pdfDesde ? new Date(pdfDesde + 'T00:00:00') : null;
      const hasta = pdfHasta ? new Date(pdfHasta + 'T23:59:59') : null;

      const data = movimientosConSaldo.filter(m => {
        const fm = new Date(String(m.fecha).split('T')[0] + 'T12:00:00');
        if (desde && fm < desde) return false;
        if (hasta && fm > hasta) return false;
        return true;
      });

      if (data.length === 0) {
        showToast('No hay movimientos en el rango de fechas seleccionado.', 'warn');
        return;
      }

      // Validar que desde <= hasta si ambos están definidos
      if (pdfDesde && pdfHasta && pdfDesde > pdfHasta) {
        showToast('La fecha de inicio no puede ser mayor a la fecha de fin.', 'warn');
        return;
      }

      const totalRecargas = data
        .filter(m => m.tipo !== 'EGRESO')
        .reduce((s, m) => s + parseFloat(m.monto), 0);
      const totalEgresos = data
        .filter(m => m.tipo === 'EGRESO')
        .reduce((s, m) => s + parseFloat(m.monto), 0);
      const saldoPeriodo = totalRecargas - totalEgresos;

      // ── Logo: fetch as blob then canvas resize ──────
      let logoDataUrl = null;
      try {
        const resp = await fetch('/logo-congreso.png.png');
        if (resp.ok) {
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          logoDataUrl = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              try {
                const MAX = 200;
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                const scale = Math.min(MAX / w, MAX / h, 1);
                const canvas = document.createElement('canvas');
                canvas.width  = Math.round(w * scale);
                canvas.height = Math.round(h * scale);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(blobUrl);
                resolve(canvas.toDataURL('image/jpeg', 0.95));
              } catch { URL.revokeObjectURL(blobUrl); resolve(null); }
            };
            img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
            img.src = blobUrl;
          });
        }
      } catch (e) { console.warn('Logo fetch error:', e); }

      // ── Generation metadata ─────────────────────────
      const now = new Date();
      const fechaGen = now.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const horaGen  = now.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
      // Nombre del usuario que genera (si SUPER_ADMIN está viendo otra caja, mostrar su nombre)
      const generadoPor = (user?.nombre || 'Sistema').replace(/[^\x00-\xFF]/g, (c) => {
        const map = { 'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n','Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ñ':'N' };
        return map[c] || '';
      });

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
      const PW    = doc.internal.pageSize.getWidth();   // 215.9 mm
      const PH    = doc.internal.pageSize.getHeight();  // 279.4 mm
      const L     = 10;
      const R     = PW - 10;
      const CW    = R - L;
      const AZUL   = [39, 76, 141];
      const NEGRO  = [20, 20, 20];
      const BLANCO = [255, 255, 255];
      const GBKG   = [237, 241, 250];
      const C_VERDE = [5, 150, 105];
      const C_ROJO  = [200, 30, 50];

      const sa = s => (s || '').replace(/[ÁÉÍÓÚÑáéíóúñ]/g,
        c => ({ Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ñ:'N',
                á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n' }[c] || c));

      // ── Outer border ──────────────────────────────────
      doc.setDrawColor(...AZUL);
      doc.setLineWidth(1.2);
      doc.rect(L - 4, 5, CW + 8, PH - 10, 'S');

      let y = 10;

      // ════ HEADER: [LOGO | INSTITUCIÓN | INFO PANEL] ════
      const LOGO_W = 50;
      const INFO_W = 62;
      const CENT_W = CW - LOGO_W - INFO_W;
      const HDR_H  = 42;

      doc.setFillColor(...BLANCO);
      doc.setDrawColor(...AZUL);
      doc.setLineWidth(0.5);
      doc.rect(L, y, CW, HDR_H, 'FD');

      // Logo
      if (logoDataUrl) {
        const lSize = HDR_H - 6;
        doc.addImage(logoDataUrl, 'JPEG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
      }

      // Divider: logo | institution
      doc.setDrawColor(180, 200, 235);
      doc.setLineWidth(0.3);
      doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);

      // Institution names
      const instCX = L + LOGO_W + CENT_W / 2;
      doc.setTextColor(...AZUL);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('REPÚBLICA DE HONDURAS', instCX, y + 11, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('CONGRESO NACIONAL', instCX, y + 18, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('PAGADURÍA ESPECIAL', instCX, y + 28, { align: 'center' });

      // Divider: institution | info panel
      doc.setDrawColor(180, 200, 235);
      doc.setLineWidth(0.3);
      doc.line(L + LOGO_W + CENT_W, y + 4, L + LOGO_W + CENT_W, y + HDR_H - 4);

      // Info panel (right section of header)
      const infoX    = L + LOGO_W + CENT_W;
      const desdeStr = pdfDesde ? fmtFecha(pdfDesde).replace(/[^\x00-\xFF]/g, '') : 'Inicio';
      const hastaStr = pdfHasta ? fmtFecha(pdfHasta).replace(/[^\x00-\xFF]/g, '') : 'Hoy';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 120, 160);
      doc.text('PERÍODO', infoX + INFO_W / 2, y + 7, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...AZUL);
      doc.text(desdeStr + ' - ' + hastaStr, infoX + INFO_W / 2, y + 13, { align: 'center' });

      doc.setDrawColor(210, 220, 235);
      doc.setLineWidth(0.2);
      doc.line(infoX + 3, y + 16, infoX + INFO_W - 3, y + 16);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 120, 160);
      doc.text('GENERADO', infoX + 5, y + 21);
      doc.text('HORA', infoX + INFO_W / 2 + 2, y + 21);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...NEGRO);
      doc.text(fechaGen, infoX + 5, y + 26.5);
      doc.text(horaGen, infoX + INFO_W / 2 + 2, y + 26.5);

      doc.setDrawColor(210, 220, 235);
      doc.setLineWidth(0.2);
      doc.line(infoX + 3, y + 29, infoX + INFO_W - 3, y + 29);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 120, 160);
      doc.text('GENERADO POR', infoX + INFO_W / 2, y + 33.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...AZUL);
      doc.text(generadoPor, infoX + INFO_W / 2, y + 39, { align: 'center' });

      // ════ TITLE BAR ════
      y += HDR_H;
      const TBAR_H = 11;
      doc.setFillColor(...AZUL);
      doc.setDrawColor(...AZUL);
      doc.setLineWidth(0);
      doc.rect(L, y, CW, TBAR_H, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...BLANCO);
      doc.text('REPORTE DE CAJA CHICA', L + CW / 2, y + 7.5, { align: 'center' });

      // ════ SUMMARY CARDS ════
      y += TBAR_H + 6;
      const cardH = 20;
      const cardW = (CW - 12) / 3;
      const cards = [
        { label: 'TOTAL RECARGAS', value: fmt(totalRecargas), color: C_VERDE  },
        { label: 'TOTAL EGRESOS',  value: fmt(totalEgresos),  color: C_ROJO   },
        { label: 'SALDO PERÍODO',  value: fmt(saldoPeriodo),  color: saldoPeriodo >= 0 ? C_VERDE : C_ROJO },
      ];
      cards.forEach((card, i) => {
        const cx = L + i * (cardW + 6);
        doc.setFillColor(...GBKG);
        doc.setDrawColor(200, 210, 228);
        doc.setLineWidth(0.3);
        doc.rect(cx, y, cardW, cardH, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 120, 160);
        doc.text(card.label, cx + cardW / 2, y + 7, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...card.color);
        doc.text(card.value, cx + cardW / 2, y + 15.5, { align: 'center' });
      });

      // ════ TABLE ════
      autoTable(doc, {
        startY: y + cardH + 6,
        head: [['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto', 'Saldo Acum.']],
        body: data.map(m => [
          fmtFecha(m.fecha).replace(/[^\x00-\xFF]/g, ''),
          sa(m.descripcion || ''),
          sa(m.categoria  || '-'),
          m.tipo,
          (isPositive(m.tipo) ? '+' : '-') + fmt(m.monto),
          fmt(m.saldo_acum),
        ]),
        styles: {
          fontSize: 8,
          cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
          textColor: NEGRO,
          lineColor: [210, 220, 235],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: AZUL, textColor: BLANCO,
          fontStyle: 'bold', fontSize: 8.5,
          cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
          lineColor: AZUL,
          lineWidth: 0.2,
        },
        alternateRowStyles: { fillColor: GBKG },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 28 },
          3: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
          5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
        },
        margin: { left: L, right: 14 },
        didParseCell: ({ row, cell, column }) => {
          if (row.section !== 'body') return;
          const rawTipo = row.cells[3]?.raw || '';
          const isPos = rawTipo === 'RECARGA';
          if (column.index === 3) {
            cell.styles.textColor = isPos ? C_VERDE : C_ROJO;
          }
          if (column.index === 4) {
            cell.styles.textColor = isPos ? C_VERDE : C_ROJO;
          }
          if (column.index === 5) {
            cell.styles.textColor = [22, 51, 110];
          }
        },
      });

      // ════ FOOTER (every page) — barra azul con texto blanco ════
      const pageCount = doc.internal.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        const FH = 9;
        const FY = PH - 5 - FH;
        doc.setFillColor(...AZUL);
        doc.rect(L - 4, FY, CW + 8, FH, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...BLANCO);
        doc.text('Congreso Nacional - Pagaduría Especial', L - 1, FY + 5.8);
        doc.text('Página ' + p + ' de ' + pageCount, L + CW / 2, FY + 5.8, { align: 'center' });
        doc.text('Generado: ' + fechaGen + ' ' + horaGen, L + CW + 1, FY + 5.8, { align: 'right' });
      }

      const filename = 'caja_chica_' + (pdfDesde || 'inicio') + '_' + (pdfHasta || 'hoy') + '.pdf';
      doc.save(filename);
      setPdfModal(false);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      showToast('Error al generar el PDF: ' + err.message);
    }
  };

  return (
    <div className="page-shell">
      <Navbar />

      {/* ── Toast notification ───────────────────────── */}
      {toast && (
        <div className={`caja-toast caja-toast--${toast.type}`} role="alert">
          <span className="caja-toast-msg">{toast.msg}</span>
          <button className="caja-toast-close" onClick={() => setToast(null)} aria-label="Cerrar">×</button>
        </div>
      )}

      <div className="page-content">
        {/* ── Page header ──────────────────────────────── */}
        <div className="usr-page-header">
          <div>
            <h1>Caja Chica</h1>
            <p>
              {puedeVerOtros && selectedUid
                ? `Viendo caja de: ${usuarios.find(u => u.id === selectedUid)?.nombre || '...'}`
                : 'Gestión de fondos y movimientos'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn-pdf" onClick={() => { setPdfDesde(''); setPdfHasta(''); setPdfModal(true); }}>
              <FiDownload size={15} /> Reporte PDF
            </button>
            <button className="btn-success" onClick={openRecarga}>
              <FiTrendingUp size={15} /> Recargar Caja
            </button>
            <button className="btn-primary" onClick={openEgreso}>
              <FiPlus size={15} /> Registrar Egreso
            </button>
          </div>
        </div>

        {/* ── Selector de usuario (SUPER_ADMIN y ADMIN) ─── */}
        {puedeVerOtros && (
          <div className="caja-user-selector">
            <FiUser size={15} />
            <select
              value={selectedUid ?? ''}
              onChange={e => setSelectedUid(e.target.value ? parseInt(e.target.value) : null)}
            >
              <option value="">{esSuperAdmin ? 'Mi caja (Super Admin)' : 'Mi caja'}</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Stats ────────────────────────────────────── */}
        <div className="caja-stats">
          <div className="caja-stat-card">
            <div>
              <div className="caja-stat-label">Saldo Disponible</div>
              <div className={`caja-stat-value ${parseFloat(stats.saldo) >= 0 ? 'positive' : 'negative'}`}>
                {fmt(stats.saldo)}
              </div>
            </div>
          </div>

          <div className="caja-stat-card">
            <div className="caja-stat-icon" style={{ background: '#f0fdf4' }}>
              <FiTrendingUp size={22} color="#16a34a" />
            </div>
            <div>
              <div className="caja-stat-label">Total Recargas</div>
              <div className="caja-stat-value positive">{fmt(stats.total_recargas)}</div>
            </div>
          </div>

          <div className="caja-stat-card">
            <div className="caja-stat-icon" style={{ background: '#fff1f2' }}>
              <FiTrendingDown size={22} color="#e11d48" />
            </div>
            <div>
              <div className="caja-stat-label">Total Egresos</div>
              <div className="caja-stat-value negative">{fmt(stats.total_egresos)}</div>
            </div>
          </div>

          <div className="caja-stat-card">
            <div className="caja-stat-icon" style={{ background: '#f0f2ff' }}>
              <FiList size={22} color="#667eea" />
            </div>
            <div>
              <div className="caja-stat-label">Movimientos</div>
              <div className="caja-stat-value">{movimientos.length}</div>
            </div>
          </div>
        </div>

        {/* ── Toolbar ──────────────────────────────────── */}
        <div className="caja-toolbar">
          <div className="caja-filters">
            {[
              { key: 'TODOS',   label: 'Todos' },
              { key: 'RECARGA', label: 'Recargas' },
              { key: 'EGRESO',  label: 'Egresos' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`caja-filter-btn ${filter === key ? 'active' : ''}`}
                onClick={() => { setFilter(key); setPage(1); }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="caja-date-filters">
            <div className="caja-date-field">
              <span className="caja-date-label"><FiCalendar size={11} /> Desde</span>
              <input
                type="date"
                className="caja-date-input"
                value={filtroDesde}
                onChange={e => {
                  const val = e.target.value;
                  if (filtroHasta && val > filtroHasta) {
                    showToast('La fecha de inicio no puede ser mayor a la fecha de fin.', 'warn');
                    return;
                  }
                  setFiltroDesde(val); setPage(1);
                }}
              />
            </div>
            <span className="caja-date-sep">—</span>
            <div className="caja-date-field">
              <span className="caja-date-label"><FiCalendar size={11} /> Hasta</span>
              <input
                type="date"
                className="caja-date-input"
                value={filtroHasta}
                onChange={e => {
                  const val = e.target.value;
                  if (filtroDesde && val < filtroDesde) {
                    showToast('La fecha de fin no puede ser menor a la fecha de inicio.', 'warn');
                    return;
                  }
                  setFiltroHasta(val); setPage(1);
                }}
              />
            </div>
            {(filtroDesde || filtroHasta) && (
              <button
                className="caja-date-clear"
                title="Limpiar rango de fechas"
                onClick={() => { setFiltroDesde(''); setFiltroHasta(''); setPage(1); }}
              >
                <FiX size={13} />
              </button>
            )}
          </div>
          <input
            type="text"
            className="caja-search-input"
            placeholder="Buscar descripción o categoría…"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
          />
        </div>

        {/* ── Table ────────────────────────────────────── */}
        <div className="caja-table-wrap">
          {loading ? (
            <div className="caja-empty">Cargando movimientos…</div>
          ) : filtered.length === 0 ? (
            <div className="caja-empty">No hay movimientos registrados.</div>
          ) : (
            <table className="caja-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th style={{ textAlign: 'right' }}>Saldo Acum.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(m => (
                  <tr key={m.id}>
                    <td className="caja-id">#{m.id}</td>
                    <td className="caja-fecha">{fmtFecha(m.fecha)}</td>
                    <td>{m.descripcion}</td>
                    <td>
                      {m.categoria
                        ? <span className="caja-categoria">{m.categoria}</span>
                        : <span className="caja-no-cat">—</span>}
                    </td>
                    <td>
                      <span className={`tipo-badge tipo-${m.tipo.toLowerCase()}`}>
                        {m.tipo}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={isPositive(m.tipo) ? 'monto-positive' : 'monto-negative'}>
                        {isPositive(m.tipo) ? '+' : '-'}{fmt(m.monto)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={parseFloat(m.saldo_acum) >= 0 ? 'monto-positive' : 'monto-negative'}>
                        {fmt(m.saldo_acum)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="action-btn edit"
                          title="Editar movimiento"
                          onClick={() => openEditar(m)}
                        >
                          <FiEdit2 size={14} />
                        </button>
                        <button
                          className="action-btn deactivate"
                          title="Eliminar movimiento"
                          onClick={() => setConfirmDel(m)}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ─────────────────────────────────── */}
        {totalFiltered > 0 && (
          <div className="caja-pagination">
            <span className="caja-pg-info">
              {Math.min((page - 1) * pageSize + 1, totalFiltered)}–{Math.min(page * pageSize, totalFiltered)} de <strong>{totalFiltered}</strong> movimientos
            </span>
            <div className="caja-pg-controls">
              <select
                className="caja-pg-size-select"
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              >
                {PAGE_SIZE_OPTIONS.map(s => <option key={s} value={s}>{s} por pág.</option>)}
              </select>
              <button className="caja-pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
              <button className="caja-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                .reduce((acc, n, i, arr) => {
                  if (i > 0 && n - arr[i - 1] > 1) acc.push('…');
                  acc.push(n); return acc;
                }, [])
                .map((n, i) => n === '…'
                  ? <span key={`e${i}`} className="caja-pg-ellipsis">…</span>
                  : <button key={n} className={`caja-pg-btn caja-pg-num${page === n ? ' caja-pg-num--active' : ''}`} onClick={() => setPage(n)}>{n}</button>
                )}
              <button className="caja-pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <button className="caja-pg-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
            <span className="caja-pg-total">Pág. <strong>{page}</strong> / {totalPages}</span>
          </div>
        )}

        {/* ── Modal: Recargar ────────────────────────────── */}
        {modal === 'recarga' && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="caja-modal" onClick={e => e.stopPropagation()}>
              <div className="caja-modal-header recarga">
                <div className="caja-modal-icon">
                  <FiTrendingUp size={20} color="#059669" />
                </div>
                <div>
                  <h3>Recargar Caja</h3>
                  <p>Agregar fondos a caja chica</p>
                </div>
                <button className="modal-close-btn" onClick={closeModal}>
                  <FiX size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="caja-form">
                <div className="caja-form-row">
                  <div className="caja-form-group">
                    <label><FiCalendar size={12} /> Fecha</label>
                    <input
                      type="date"
                      className={`caja-input${formErrors.fecha ? ' input-error' : ''}`}
                      value={form.fecha}
                      onChange={e => { setForm({ ...form, fecha: e.target.value }); setFormErrors(p => ({ ...p, fecha: '' })); }}
                    />
                    {formErrors.fecha && <span className="field-error">{formErrors.fecha}</span>}
                  </div>
                  <div className="caja-form-group">
                    <label>Monto (Lps.)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={MONTO_MAX}
                      className={`caja-input${formErrors.monto ? ' input-error' : ''}`}
                      placeholder="0.00"
                      value={form.monto}
                      onChange={e => { setForm({ ...form, monto: e.target.value }); setFormErrors(p => ({ ...p, monto: '' })); }}
                    />
                    {formErrors.monto && <span className="field-error">{formErrors.monto}</span>}
                  </div>
                </div>
                <div className="caja-form-group">
                  <label><FiFileText size={12} /> Descripción / Referencia</label>
                  <input
                    type="text"
                    className={`caja-input${formErrors.descripcion ? ' input-error' : ''}`}
                    placeholder="Ej. Recarga inicial del mes de marzo"
                    maxLength={200}
                    value={form.descripcion}
                    onChange={e => { setForm({ ...form, descripcion: e.target.value }); setFormErrors(p => ({ ...p, descripcion: '' })); }}
                  />
                  {formErrors.descripcion && <span className="field-error">{formErrors.descripcion}</span>}
                </div>

                {formErrors._server && <div className="caja-form-error">{formErrors._server}</div>}

                <div className="caja-modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-success" disabled={saving}>
                    {saving ? 'Guardando…' : 'Recargar Caja'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Registrar Egreso ───────────────────── */}
        {modal === 'egreso' && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="caja-modal" onClick={e => e.stopPropagation()}>
              <div className="caja-modal-header egreso">
                <div className="caja-modal-icon">
                  <FiTrendingDown size={20} color="#e11d48" />
                </div>
                <div>
                  <h3>Registrar Egreso</h3>
                  <p>Registrar un gasto de caja chica</p>
                </div>
                <button className="modal-close-btn" onClick={closeModal}>
                  <FiX size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="caja-form">
                <div className="caja-form-row">
                  <div className="caja-form-group">
                    <label><FiCalendar size={12} /> Fecha</label>
                    <input
                      type="date"
                      className={`caja-input${formErrors.fecha ? ' input-error' : ''}`}
                      value={form.fecha}
                      onChange={e => { setForm({ ...form, fecha: e.target.value }); setFormErrors(p => ({ ...p, fecha: '' })); }}
                    />
                    {formErrors.fecha && <span className="field-error">{formErrors.fecha}</span>}
                  </div>
                  <div className="caja-form-group">
                    <label>Monto (Lps.)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={MONTO_MAX}
                      className={`caja-input${formErrors.monto ? ' input-error' : ''}`}
                      placeholder="0.00"
                      value={form.monto}
                      onChange={e => { setForm({ ...form, monto: e.target.value }); setFormErrors(p => ({ ...p, monto: '' })); }}
                    />
                    {formErrors.monto && <span className="field-error">{formErrors.monto}</span>}
                  </div>
                </div>
                <div className="caja-form-group">
                  <label><FiTag size={12} /> Categoría</label>
                  <select
                    className={`caja-input${formErrors.categoria ? ' input-error' : ''}`}
                    value={form.categoria}
                    onChange={e => { setForm({ ...form, categoria: e.target.value }); setFormErrors(p => ({ ...p, categoria: '' })); }}
                  >
                    {CATEGORIAS_EGRESO.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {formErrors.categoria && <span className="field-error">{formErrors.categoria}</span>}
                </div>
                <div className="caja-form-group">
                  <label><FiFileText size={12} /> Descripción</label>
                  <input
                    type="text"
                    className={`caja-input${formErrors.descripcion ? ' input-error' : ''}`}
                    placeholder="Describe el gasto realizado"
                    maxLength={200}
                    value={form.descripcion}
                    onChange={e => { setForm({ ...form, descripcion: e.target.value }); setFormErrors(p => ({ ...p, descripcion: '' })); }}
                  />
                  {formErrors.descripcion && <span className="field-error">{formErrors.descripcion}</span>}
                </div>

                {formErrors._server && <div className="caja-form-error">{formErrors._server}</div>}

                <div className="caja-modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Guardando…' : 'Registrar Egreso'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* ── Modal: Editar Movimiento ──────────────────────── */}
        {modal === 'editar' && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="caja-modal" onClick={e => e.stopPropagation()}>
              <div className="caja-modal-header" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)' }}>
                <div className="caja-modal-icon">
                  <FiEdit2 size={20} color="#d97706" />
                </div>
                <div>
                  <h3>Editar Movimiento</h3>
                  <p>
                    <span className={`tipo-badge tipo-${(form._tipo || '').toLowerCase()}`} style={{ fontSize: 11 }}>
                      {form._tipo}
                    </span>
                  </p>
                </div>
                <button className="modal-close-btn" onClick={closeModal}>
                  <FiX size={18} />
                </button>
              </div>

              <form onSubmit={handleSave} className="caja-form">
                <div className="caja-form-row">
                  <div className="caja-form-group">
                    <label><FiCalendar size={12} /> Fecha</label>
                    <input
                      type="date"
                      className={`caja-input${formErrors.fecha ? ' input-error' : ''}`}
                      value={form.fecha}
                      onChange={e => { setForm({ ...form, fecha: e.target.value }); setFormErrors(p => ({ ...p, fecha: '' })); }}
                    />
                    {formErrors.fecha && <span className="field-error">{formErrors.fecha}</span>}
                  </div>
                  <div className="caja-form-group">
                    <label>Monto (Lps.)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={MONTO_MAX}
                      className={`caja-input${formErrors.monto ? ' input-error' : ''}`}
                      placeholder="0.00"
                      value={form.monto}
                      onChange={e => { setForm({ ...form, monto: e.target.value }); setFormErrors(p => ({ ...p, monto: '' })); }}
                    />
                    {formErrors.monto && <span className="field-error">{formErrors.monto}</span>}
                  </div>
                </div>
                {form._tipo === 'EGRESO' && (
                  <div className="caja-form-group">
                    <label><FiTag size={12} /> Categoría</label>
                    <select
                      className={`caja-input${formErrors.categoria ? ' input-error' : ''}`}
                      value={form.categoria}
                      onChange={e => { setForm({ ...form, categoria: e.target.value }); setFormErrors(p => ({ ...p, categoria: '' })); }}
                    >
                      {CATEGORIAS_EGRESO.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {formErrors.categoria && <span className="field-error">{formErrors.categoria}</span>}
                  </div>
                )}
                <div className="caja-form-group">
                  <label><FiFileText size={12} /> Descripción</label>
                  <input
                    type="text"
                    className={`caja-input${formErrors.descripcion ? ' input-error' : ''}`}
                    placeholder="Descripción del movimiento"
                    maxLength={200}
                    value={form.descripcion}
                    onChange={e => { setForm({ ...form, descripcion: e.target.value }); setFormErrors(p => ({ ...p, descripcion: '' })); }}
                  />
                  {formErrors.descripcion && <span className="field-error">{formErrors.descripcion}</span>}
                </div>

                {formErrors._server && <div className="caja-form-error">{formErrors._server}</div>}

                <div className="caja-modal-actions">
                  <button type="button" className="btn-secondary" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn-warning" disabled={saving}>
                    {saving ? 'Guardando…' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* ── Modal: Reporte PDF ───────────────────────── */}
        {pdfModal && (
          <div className="modal-overlay" onClick={() => setPdfModal(false)}>
            <div className="caja-modal" onClick={e => e.stopPropagation()}>
              <div className="caja-modal-header" style={{ background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)' }}>
                <div className="caja-modal-icon">
                  <FiDownload size={20} color="#274C8D" />
                </div>
                <div>
                  <h3>Generar Reporte PDF</h3>
                  <p>Selecciona el rango de fechas a incluir</p>
                </div>
                <button className="modal-close-btn" onClick={() => setPdfModal(false)}>
                  <FiX size={18} />
                </button>
              </div>

              <div className="caja-form">
                <div className="caja-form-row">
                  <div className="caja-form-group">
                    <label><FiCalendar size={12} /> Fecha desde</label>
                    <div className="caja-input-group">
                      <span className="caja-input-icon"><FiCalendar size={14} /></span>
                      <input
                        type="date"
                        className="caja-input caja-input-with-icon"
                        value={pdfDesde}
                        onChange={e => setPdfDesde(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="caja-form-group">
                    <label><FiCalendar size={12} /> Fecha hasta</label>
                    <div className="caja-input-group">
                      <span className="caja-input-icon"><FiCalendar size={14} /></span>
                      <input
                        type="date"
                        className="caja-input caja-input-with-icon"
                        value={pdfHasta}
                        onChange={e => setPdfHasta(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <p className="pdf-hint">Deja ambos campos vacíos para incluir todos los movimientos.</p>
                <div className="caja-modal-actions">
                  <button className="btn-secondary" onClick={() => setPdfModal(false)}>
                    Cancelar
                  </button>
                  <button className="btn-pdf" onClick={generarPDF}>
                    <FiDownload size={14} /> Descargar PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm Delete ───────────────────────────── */}
        {confirmDel && (
          <div className="modal-overlay" onClick={() => setConfirmDel(null)}>
            <div className="caja-confirm-modal" onClick={e => e.stopPropagation()}>
              <div className="caja-confirm-icon">
                <FiAlertTriangle size={28} color="#f59e0b" />
              </div>
              <h3>¿Eliminar movimiento?</h3>
              <p style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4 }}>{confirmDel.descripcion}</p>
              <p style={{ color: confirmDel.tipo === 'EGRESO' ? '#e11d48' : '#059669', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                {isPositive(confirmDel.tipo) ? '+' : '-'}{fmt(confirmDel.monto)}
              </p>
              <p style={{ color: '#64748b', fontSize: 13 }}>Esta acción no se puede deshacer y afectará el saldo.</p>
              <div className="caja-modal-actions" style={{ justifyContent: 'center' }}>
                <button className="btn-secondary" onClick={() => setConfirmDel(null)}>
                  Cancelar
                </button>
                <button className="btn-danger" onClick={handleDelete}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}