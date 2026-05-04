import { useEffect, useState, useCallback, useContext, useMemo, useRef } from 'react';
import {
  FiPlus, FiTrash2, FiEdit2, FiX, FiSearch, FiDownload,
  FiPackage, FiCalendar, FiUsers, FiFilter, FiRefreshCw,
  FiChevronLeft, FiChevronRight,
} from 'react-icons/fi';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './Bodegas.css';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtFecha(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(String(fechaStr).split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('es-HN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtFechaCorta(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(String(fechaStr).split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

const EMPTY_FORM = {
  diputado_id:       '',
  diputado_nombre:   '',
  departamento:      '',
  partido:           '',
  persona_retiro:    '',
  fecha_entrega:     today(),
  cantidad_recibida: '',
  numero_orden:      '',
  observaciones:     '',
};

function clientValidate(form) {
  const errors = {};

  const nombre = (form.diputado_nombre || '').trim();
  if (!nombre) errors.diputado_nombre = 'El nombre del diputado es requerido.';
  else if (nombre.length < 2) errors.diputado_nombre = 'Mínimo 2 caracteres.';
  else if (nombre.length > 200) errors.diputado_nombre = 'Máximo 200 caracteres.';

  const depto = (form.departamento || '').trim();
  if (!depto) errors.departamento = 'El departamento es requerido.';

  const persona = (form.persona_retiro || '').trim();
  if (!persona) errors.persona_retiro = 'La persona que retiró es requerida.';
  else if (persona.length < 2) errors.persona_retiro = 'Mínimo 2 caracteres.';
  else if (persona.length > 200) errors.persona_retiro = 'Máximo 200 caracteres.';

  if (!form.fecha_entrega || !DATE_REGEX.test(form.fecha_entrega)) {
    errors.fecha_entrega = 'La fecha de entrega es requerida.';
  } else {
    const d   = new Date(form.fecha_entrega + 'T12:00:00');
    const now = new Date();
    const max = new Date(now); max.setFullYear(now.getFullYear() + 1);
    const min = new Date(now); min.setFullYear(now.getFullYear() - 10);
    if (isNaN(d.getTime())) errors.fecha_entrega = 'Fecha inválida.';
    else if (d > max) errors.fecha_entrega = 'No puede estar más de un año en el futuro.';
    else if (d < min) errors.fecha_entrega = 'Fecha demasiado antigua (máx. 10 años).';
  }

  const cant = parseInt(form.cantidad_recibida, 10);
  if (form.cantidad_recibida === '' || isNaN(cant))
    errors.cantidad_recibida = 'La cantidad recibida es requerida.';
  else if (cant <= 0) errors.cantidad_recibida = 'Debe ser mayor a cero.';
  else if (cant > 9_999_999) errors.cantidad_recibida = 'Supera el máximo permitido.';

  const orden = (form.numero_orden || '').trim();
  if (!orden) errors.numero_orden = 'El número de orden es requerido.';
  else if (orden.length > 30) errors.numero_orden = 'Máximo 30 caracteres.';

  const obs = (form.observaciones || '').trim();
  if (obs.length > 500) errors.observaciones = 'Máximo 500 caracteres.';

  return errors;
}

export default function Bodegas() {
  const { user } = useContext(AuthContext);

  const [registros, setRegistros]       = useState([]);
  const [diputados, setDiputados]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [modal, setModal]               = useState(false);
  const [editing, setEditing]           = useState(null);
  const [form, setForm]                 = useState({ ...EMPTY_FORM });
  const [formErrors, setFormErrors]     = useState({});
  const [saving, setSaving]             = useState(false);
  const [confirmDel, setConfirmDel]     = useState(null);
  const [toast, setToast]               = useState(null);
  const [busqueda, setBusqueda]         = useState('');
  const [filtroDesde, setFiltroDesde]   = useState('');
  const [filtroHasta, setFiltroHasta]   = useState('');
  const [page, setPage]                 = useState(1);

  // Autocomplete
  const [dipQuery, setDipQuery]         = useState('');
  const [dipSuggestions, setDipSuggestions] = useState([]);
  const [dipOpen, setDipOpen]           = useState(false);
  const autocompleteRef                 = useRef(null);

  const PAGE_SIZE = 10;
  const canEdit   = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(user?.rol);

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  // ── Fetch data ────────────────────────────────────────────
  const fetchRegistros = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/bodegas', { headers: authHeaders() });
      setRegistros(res.data);
    } catch {
      showToast('Error al cargar los registros.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDiputados = useCallback(async () => {
    try {
      const res = await api.get('/diputados', { headers: authHeaders() });
      setDiputados(res.data || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    fetchRegistros();
    fetchDiputados();
  }, [fetchRegistros, fetchDiputados]);

  useEffect(() => { setPage(1); }, [busqueda, filtroDesde, filtroHasta]);

  // ── Click fuera del autocomplete ──────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
        setDipOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Autocomplete: filtrar diputados ───────────────────────
  useEffect(() => {
    const q = dipQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      setDipSuggestions([]);
      setDipOpen(false);
      return;
    }
    const matches = diputados
      .filter(d => d.nombre.toLowerCase().includes(q))
      .slice(0, 8);
    setDipSuggestions(matches);
    setDipOpen(matches.length > 0);
  }, [dipQuery, diputados]);

  const handleDipSelect = (dip) => {
    setForm(prev => ({
      ...prev,
      diputado_id:     dip.id,
      diputado_nombre: dip.nombre,
      departamento:    dip.departamento || '',
      partido:         dip.partido      || '',
    }));
    setDipQuery(dip.nombre);
    setDipSuggestions([]);
    setDipOpen(false);
    setFormErrors(prev => ({
      ...prev,
      diputado_nombre: undefined,
      departamento:    undefined,
    }));
  };

  const handleDipInput = (e) => {
    const val = e.target.value;
    setDipQuery(val);
    setForm(prev => ({
      ...prev,
      diputado_nombre: val,
      diputado_id:     '',
      departamento:    prev.departamento, // no limpiar hasta seleccionar otro
      partido:         prev.partido,
    }));
    setFormErrors(prev => ({ ...prev, diputado_nombre: undefined }));
  };

  // ── Filtrado y paginación ─────────────────────────────────
  const filtered = useMemo(() => {
    let f = [...registros];
    const q = busqueda.trim().toLowerCase();
    if (q) f = f.filter(r =>
      r.diputado_nombre.toLowerCase().includes(q) ||
      r.persona_retiro.toLowerCase().includes(q)  ||
      (r.departamento || '').toLowerCase().includes(q) ||
      (r.partido || '').toLowerCase().includes(q) ||
      (r.numero_orden || '').toLowerCase().includes(q)
    );
    if (filtroDesde) {
      const desde = new Date(filtroDesde + 'T00:00:00');
      f = f.filter(r => new Date(String(r.fecha_entrega).split('T')[0] + 'T12:00:00') >= desde);
    }
    if (filtroHasta) {
      const hasta = new Date(filtroHasta + 'T23:59:59');
      f = f.filter(r => new Date(String(r.fecha_entrega).split('T')[0] + 'T12:00:00') <= hasta);
    }
    return f;
  }, [registros, busqueda, filtroDesde, filtroHasta]);

  const totalPages    = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated     = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalCantidad = registros.reduce((s, r) => s + (r.cantidad_recibida || 0), 0);
  const hayFiltros    = busqueda || filtroDesde || filtroHasta;
  const limpiarFiltros = () => { setBusqueda(''); setFiltroDesde(''); setFiltroHasta(''); setPage(1); };

  // ── Modal ─────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDipQuery('');
    setFormErrors({});
    setModal(true);
  };

  const openEdit = (r) => {
    setEditing(r.id);
    setForm({
      diputado_id:       r.diputado_id   || '',
      diputado_nombre:   r.diputado_nombre,
      departamento:      r.departamento  || '',
      partido:           r.partido       || '',
      persona_retiro:    r.persona_retiro,
      fecha_entrega:     String(r.fecha_entrega).split('T')[0],
      cantidad_recibida: String(r.cantidad_recibida),
      numero_orden:      r.numero_orden  || '',
      observaciones:     r.observaciones || '',
    });
    setDipQuery(r.diputado_nombre);
    setFormErrors({});
    setModal(true);
  };

  const closeModal = () => { setModal(false); setEditing(null); setDipOpen(false); };

  const handleField = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setFormErrors(prev => ({ ...prev, [name]: undefined }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const errors = clientValidate(form);
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setSaving(true);
    try {
      const payload = {
        diputado_id:       form.diputado_id     || null,
        diputado_nombre:   form.diputado_nombre.trim(),
        departamento:      form.departamento.trim(),
        partido:           form.partido.trim()  || null,
        persona_retiro:    form.persona_retiro.trim(),
        fecha_entrega:     form.fecha_entrega,
        cantidad_recibida: parseInt(form.cantidad_recibida, 10),
        numero_orden:      form.numero_orden.trim(),
        observaciones:     form.observaciones.trim() || null,
      };
      if (editing) {
        await api.put(`/bodegas/${editing}`, payload, { headers: authHeaders() });
        showToast('Registro actualizado correctamente.', 'ok');
      } else {
        await api.post('/bodegas', payload, { headers: authHeaders() });
        showToast('Registro creado correctamente.', 'ok');
      }
      closeModal();
      fetchRegistros();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al guardar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/bodegas/${confirmDel.id}`, { headers: authHeaders() });
      showToast('Registro eliminado correctamente.', 'ok');
      setConfirmDel(null);
      fetchRegistros();
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al eliminar.', 'error');
      setConfirmDel(null);
    }
  };

  // ── Exportar PDF ──────────────────────────────────────────
  const exportPDF = async () => {
    let logoDataUrl = null;
    try {
      const resp = await fetch('/logo-congreso.png.png');
      if (resp.ok) {
        const blob    = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        logoDataUrl   = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const MAX = 200;
              const w = img.naturalWidth || img.width;
              const h = img.naturalHeight || img.height;
              const scale  = Math.min(MAX / w, MAX / h, 1);
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
    } catch { /* sin logo */ }

    const sa = s => (s || '').replace(/[ÁÉÍÓÚÑáéíóúñ]/g,
      c => ({ Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ñ:'N',
               á:'a',é:'e',í:'i',ó:'o',ú:'u',ñ:'n' }[c] || c));

    const now      = new Date();
    const fechaGen = now.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaGen  = now.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const genPor   = sa((user?.nombre || 'Sistema').toUpperCase());

    const doc  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    const PW   = doc.internal.pageSize.getWidth();
    const PH   = doc.internal.pageSize.getHeight();
    const L    = 10;
    const CW   = PW - L - 10;
    const AZUL   = [39, 76, 141];
    const NEGRO  = [20, 20, 20];
    const BLANCO = [255, 255, 255];

    doc.setDrawColor(...AZUL);
    doc.setLineWidth(1.2);
    doc.rect(L - 4, 5, CW + 8, PH - 10, 'S');

    let y = 10;

    // Encabezado
    const LOGO_W = 50;
    const INFO_W = 62;
    const CENT_W = CW - LOGO_W - INFO_W;
    const HDR_H  = 42;

    doc.setFillColor(...BLANCO);
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.5);
    doc.rect(L, y, CW, HDR_H, 'FD');

    if (logoDataUrl) {
      const lSize = HDR_H - 6;
      doc.addImage(logoDataUrl, 'JPEG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
    }

    doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
    doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);

    const instCX = L + LOGO_W + CENT_W / 2;
    doc.setTextColor(...AZUL);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text('REPUBLICA DE HONDURAS', instCX, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('CONGRESO NACIONAL', instCX, y + 18, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('PAGADURIA ESPECIAL', instCX, y + 28, { align: 'center' });

    doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
    doc.line(L + LOGO_W + CENT_W, y + 4, L + LOGO_W + CENT_W, y + HDR_H - 4);

    const infoX   = L + LOGO_W + CENT_W;
    const infoMid = infoX + INFO_W / 2;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
    doc.setTextColor(100, 120, 160);
    doc.text('REGISTROS', infoMid, y + 7, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.setTextColor(...AZUL);
    doc.text(String(filtered.length), infoMid, y + 15, { align: 'center' });

    doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 17, infoX + INFO_W - 3, y + 17);

    const col1 = infoX + 4; const col2 = infoX + INFO_W / 2 + 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
    doc.text('GENERADO', col1, y + 22); doc.text('HORA', col2, y + 22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...NEGRO);
    doc.text(fechaGen, col1, y + 27.5); doc.text(horaGen, col2, y + 27.5);

    doc.setDrawColor(210, 220, 235); doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 30, infoX + INFO_W - 3, y + 30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(100, 120, 160);
    doc.text('GENERADO POR', infoMid, y + 34.5, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...AZUL);
    doc.text(genPor, infoMid, y + 40, { align: 'center' });

    y += HDR_H;
    const TBAR_H = 11;
    doc.setFillColor(...AZUL); doc.setDrawColor(...AZUL); doc.setLineWidth(0);
    doc.rect(L, y, CW, TBAR_H, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...BLANCO);
    doc.text('RETIRO DE BODEGAS - DIPUTADOS', L + CW / 2, y + 7.5, { align: 'center' });
    y += TBAR_H + 4;

    autoTable(doc, {
      startY: y,
      margin: { left: L, right: 10 },
      head: [[
        { content: 'N°',                  styles: { halign: 'center', cellWidth: 10 } },
        { content: 'Diputado Responsable',styles: { cellWidth: 52 } },
        { content: 'Persona que Retiró',  styles: { cellWidth: 52 } },
        { content: 'Departamento',        styles: { cellWidth: 32 } },
        { content: 'Partido Político',    styles: { cellWidth: 48 } },
        { content: 'Fecha de Entrega',    styles: { cellWidth: 38 } },
        { content: 'Cant.',               styles: { halign: 'center', cellWidth: 16 } },
        { content: '# Orden',             styles: { halign: 'center', cellWidth: 22 } },
      ]],
      body: filtered.map((r, i) => [
        { content: i + 1,                              styles: { halign: 'center' } },
        sa(r.diputado_nombre),
        sa(r.persona_retiro),
        sa(r.departamento),
        sa(r.partido || '—'),
        sa(fmtFechaCorta(r.fecha_entrega)),
        { content: r.cantidad_recibida,                styles: { halign: 'center' } },
        { content: r.numero_orden,                     styles: { halign: 'center' } },
      ]),
      headStyles: {
        fillColor: AZUL, textColor: BLANCO,
        fontStyle: 'bold', fontSize: 7.5,
      },
      bodyStyles: { fontSize: 7.2, textColor: NEGRO },
      alternateRowStyles: { fillColor: [237, 241, 250] },
      styles: { cellPadding: 2.5, lineColor: [180, 200, 235], lineWidth: 0.2 },
    });

    doc.save(`retiro_bodegas_${now.toISOString().slice(0, 10)}.pdf`);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="page-shell">
      <Navbar />
      <div className="bod-container">

        {/* Toast */}
        {toast && (
          <div className={`bod-toast ${toast.type === 'ok' ? 'bod-toast--ok' : 'bod-toast--err'}`}>
            {toast.msg}
          </div>
        )}

        {/* Encabezado */}
        <div className="bod-page-header">
          <div className="bod-page-header__left">
            <div className="bod-page-icon"><FiPackage size={22} /></div>
            <div>
              <h1 className="bod-page-title">Retiro de Bodegas</h1>
              <p className="bod-page-sub">Control de retiro de materiales por diputado</p>
            </div>
          </div>
          <div className="bod-page-header__right">
            <button className="bod-btn bod-btn--outline" onClick={fetchRegistros} title="Actualizar">
              <FiRefreshCw size={15} />
            </button>
            <button className="bod-btn bod-btn--outline" onClick={exportPDF} title="Exportar PDF">
              <FiDownload size={15} /> PDF
            </button>
            {canEdit && (
              <button className="bod-btn bod-btn--primary" onClick={openNew}>
                <FiPlus size={15} /> Nuevo Registro
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="bod-stats">
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--blue"><FiUsers size={20} /></div>
            <div className="bod-stat__body">
              <span className="bod-stat__label">Total Registros</span>
              <span className="bod-stat__value">{registros.length}</span>
            </div>
          </div>
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--green"><FiPackage size={20} /></div>
            <div className="bod-stat__body">
              <span className="bod-stat__label">Total Cant. Recibida</span>
              <span className="bod-stat__value bod-stat__value--green">
                {totalCantidad.toLocaleString('es-HN')}
              </span>
            </div>
          </div>
          <div className="bod-stat">
            <div className="bod-stat__icon bod-stat__icon--amber"><FiCalendar size={20} /></div>
            <div className="bod-stat__body">
              <span className="bod-stat__label">Filtrados</span>
              <span className="bod-stat__value">{filtered.length}</span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bod-toolbar">
          <div className="bod-toolbar__search">
            <FiSearch className="bod-toolbar__search-icon" size={15} />
            <input
              className="bod-toolbar__input"
              placeholder="Buscar por diputado, persona, departamento, orden…"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>
          <div className="bod-toolbar__filters">
            <label className="bod-date-label">
              Desde
              <input type="date" className="bod-toolbar__date" value={filtroDesde}
                onChange={e => setFiltroDesde(e.target.value)} />
            </label>
            <label className="bod-date-label">
              Hasta
              <input type="date" className="bod-toolbar__date" value={filtroHasta}
                onChange={e => setFiltroHasta(e.target.value)} />
            </label>
            {hayFiltros && (
              <button className="bod-btn bod-btn--ghost bod-btn--sm" onClick={limpiarFiltros}>
                <FiX size={13} /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="bod-card">
          <div className="bod-table-info">
            <span>
              Mostrando <strong>{paginated.length}</strong> de <strong>{filtered.length}</strong> registros
            </span>
            <span>Página {page} de {totalPages}</span>
          </div>

          <div className="bod-table-wrap">
            {loading ? (
              <div className="bod-loading">Cargando registros…</div>
            ) : filtered.length === 0 ? (
              <div className="bod-empty">
                <FiPackage size={36} style={{ opacity: .3 }} />
                <p>No hay registros{hayFiltros ? ' con los filtros aplicados' : ''}.</p>
              </div>
            ) : (
              <table className="bod-table">
                <thead>
                  <tr>
                    <th style={{ width: 46 }}>N°</th>
                    <th>Diputado Responsable</th>
                    <th>Persona que Retiró en las Bodegas</th>
                    <th>Departamento</th>
                    <th>Partido Político</th>
                    <th>Fecha de Entrega</th>
                    <th style={{ textAlign: 'center' }}>Cant. Recibida</th>
                    <th style={{ textAlign: 'center' }}># Orden</th>
                    {canEdit && <th style={{ width: 90 }}>Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((r, idx) => (
                    <tr key={r.id}>
                      <td style={{ textAlign: 'center', color: '#9ca3af', fontWeight: 600 }}>
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td>
                        <span className="bod-name">{r.diputado_nombre}</span>
                      </td>
                      <td>{r.persona_retiro}</td>
                      <td>{r.departamento || '—'}</td>
                      <td>{r.partido || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha_entrega)}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#274C8D' }}>
                        {(r.cantidad_recibida || 0).toLocaleString('es-HN')}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="bod-badge-orden">{r.numero_orden}</span>
                      </td>
                      {canEdit && (
                        <td>
                          <div style={{ display: 'flex', gap: '.35rem' }}>
                            <button className="bod-btn bod-btn--ghost bod-btn--sm"
                              title="Editar" onClick={() => openEdit(r)}>
                              <FiEdit2 size={13} />
                            </button>
                            <button className="bod-btn bod-btn--ghost bod-btn--sm"
                              title="Eliminar"
                              style={{ color: '#dc2626' }}
                              onClick={() => setConfirmDel(r)}>
                              <FiTrash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Paginación */}
          {!loading && filtered.length > PAGE_SIZE && (
            <div className="bod-pagination">
              <button className="bod-btn bod-btn--ghost bod-btn--sm"
                disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <FiChevronLeft size={15} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce((acc, p, i, arr) => {
                  if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="bod-pagination__dots">…</span>
                  ) : (
                    <button key={p}
                      className={`bod-btn bod-btn--sm ${page === p ? 'bod-btn--primary' : 'bod-btn--ghost'}`}
                      onClick={() => setPage(p)}>
                      {p}
                    </button>
                  )
                )}
              <button className="bod-btn bod-btn--ghost bod-btn--sm"
                disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <FiChevronRight size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Modal crear / editar */}
        {modal && (
          <div className="bod-modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <div className="bod-modal">
              <div className="bod-modal__header">
                <h2 className="bod-modal__title">
                  {editing ? 'Editar Registro' : 'Nuevo Registro de Bodega'}
                </h2>
                <button className="bod-btn bod-btn--ghost" onClick={closeModal}>
                  <FiX size={18} />
                </button>
              </div>

              <form className="bod-modal__body" onSubmit={handleSave} noValidate>

                {/* Diputado — autocomplete */}
                <div className="bod-field bod-field--full" ref={autocompleteRef}>
                  <label className="bod-label">Diputado Responsable *</label>
                  <div className="bod-autocomplete">
                    <input
                      className={`bod-input ${formErrors.diputado_nombre ? 'bod-input--error' : ''}`}
                      placeholder="Escriba el nombre del diputado…"
                      value={dipQuery}
                      onChange={handleDipInput}
                      onFocus={() => dipSuggestions.length > 0 && setDipOpen(true)}
                      autoComplete="off"
                    />
                    {dipOpen && dipSuggestions.length > 0 && (
                      <ul className="bod-autocomplete__list">
                        {dipSuggestions.map(d => (
                          <li key={d.id} className="bod-autocomplete__item"
                            onMouseDown={() => handleDipSelect(d)}>
                            <span className="bod-autocomplete__name">{d.nombre}</span>
                            <span className="bod-autocomplete__sub">
                              {d.departamento}{d.partido ? ` · ${d.partido}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {formErrors.diputado_nombre && (
                    <span className="bod-error">{formErrors.diputado_nombre}</span>
                  )}
                </div>

                {/* Departamento (auto-llenado, editable) */}
                <div className="bod-field">
                  <label className="bod-label">Departamento *</label>
                  <input className={`bod-input ${formErrors.departamento ? 'bod-input--error' : ''}`}
                    name="departamento" value={form.departamento} onChange={handleField}
                    placeholder="Departamento" />
                  {formErrors.departamento && <span className="bod-error">{formErrors.departamento}</span>}
                </div>

                {/* Partido (auto-llenado, editable) */}
                <div className="bod-field">
                  <label className="bod-label">Partido Político</label>
                  <input className="bod-input"
                    name="partido" value={form.partido} onChange={handleField}
                    placeholder="Partido político (opcional)" />
                </div>

                {/* Persona que retiró */}
                <div className="bod-field bod-field--full">
                  <label className="bod-label">Persona que Retiró en las Bodegas *</label>
                  <input className={`bod-input ${formErrors.persona_retiro ? 'bod-input--error' : ''}`}
                    name="persona_retiro" value={form.persona_retiro} onChange={handleField}
                    placeholder="Nombre completo de quien retiró" />
                  {formErrors.persona_retiro && <span className="bod-error">{formErrors.persona_retiro}</span>}
                </div>

                {/* Fecha de entrega */}
                <div className="bod-field">
                  <label className="bod-label">Fecha de Entrega *</label>
                  <input type="date"
                    className={`bod-input ${formErrors.fecha_entrega ? 'bod-input--error' : ''}`}
                    name="fecha_entrega" value={form.fecha_entrega} onChange={handleField} />
                  {formErrors.fecha_entrega && <span className="bod-error">{formErrors.fecha_entrega}</span>}
                </div>

                {/* Cantidad recibida */}
                <div className="bod-field">
                  <label className="bod-label">Cant. Recibida *</label>
                  <input type="number" min="1" step="1"
                    className={`bod-input ${formErrors.cantidad_recibida ? 'bod-input--error' : ''}`}
                    name="cantidad_recibida" value={form.cantidad_recibida} onChange={handleField}
                    placeholder="0" />
                  {formErrors.cantidad_recibida && <span className="bod-error">{formErrors.cantidad_recibida}</span>}
                </div>

                {/* # Orden */}
                <div className="bod-field">
                  <label className="bod-label"># Orden *</label>
                  <input className={`bod-input ${formErrors.numero_orden ? 'bod-input--error' : ''}`}
                    name="numero_orden" value={form.numero_orden} onChange={handleField}
                    placeholder="Ej. 0001" />
                  {formErrors.numero_orden && <span className="bod-error">{formErrors.numero_orden}</span>}
                </div>

                {/* Observaciones */}
                <div className="bod-field bod-field--full">
                  <label className="bod-label">Observaciones</label>
                  <textarea className="bod-textarea"
                    name="observaciones" value={form.observaciones} onChange={handleField}
                    placeholder="Observaciones adicionales (opcional)" rows={3} />
                  {formErrors.observaciones && <span className="bod-error">{formErrors.observaciones}</span>}
                </div>

                <div className="bod-modal__footer">
                  <button type="button" className="bod-btn bod-btn--outline" onClick={closeModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="bod-btn bod-btn--primary" disabled={saving}>
                    {saving
                      ? <><span className="bod-btn-spinner" /> Guardando…</>
                      : editing ? 'Actualizar' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirmar eliminación */}
        {confirmDel && (
          <div className="bod-modal-overlay">
            <div className="bod-confirm">
              <div className="bod-confirm__icon"><FiTrash2 size={26} /></div>
              <h3 className="bod-confirm__title">¿Eliminar registro?</h3>
              <p className="bod-confirm__msg">
                Se eliminará el registro de <strong>{confirmDel.diputado_nombre}</strong>.
                Esta acción no se puede deshacer.
              </p>
              <div className="bod-confirm__actions">
                <button className="bod-btn bod-btn--outline" onClick={() => setConfirmDel(null)}>
                  Cancelar
                </button>
                <button className="bod-btn bod-btn--danger" onClick={handleDelete}>
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
