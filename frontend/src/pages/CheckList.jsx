import { useState, useCallback, useEffect, useContext } from 'react';
import {
  FiPlus, FiX, FiEye, FiEdit2, FiTrash2, FiSearch,
  FiPrinter, FiRefreshCw, FiClipboard,
  FiChevronLeft, FiChevronRight,
} from 'react-icons/fi';
import { jsPDF } from 'jspdf';
import api from '../api/axios';
import Navbar from '../components/Navbar';
import { AuthContext } from '../context/AuthContext';
import './CheckList.css';

// ── helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function fmtFecha(str) {
  if (!str) return '—';
  const d = new Date(String(str).split('T')[0] + 'T12:00:00');
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── definición de los 16 documentos ──────────────────────────────────────────
const DOCS = [
  { key: 'orden_pago_da',          label: 'Orden de Pago D.A.' },
  { key: 'validacion_factura_sar', label: 'Validación de Factura SAR' },
  { key: 'formato_sap',            label: 'Formato SAP' },
  { key: 'orden_compra',           label: 'Orden de Compra' },
  { key: 'acta_recepcion',         label: 'Acta de Recepción' },
  { key: 'resumen_cotizacion',     label: 'Resumen Cotización' },
  { key: 'acta_entrega',           label: 'Acta de Entrega' },
  { key: 'cotizaciones',           label: 'Cotizaciones' },
  { key: 'factura_original',       label: 'Factura Original' },
  { key: 'memo_requisicion',       label: 'Memo de Requisición' },
  { key: 'solicitud_eventos',      label: 'Solicitud de Eventos' },
  { key: 'informe_tecnico',        label: 'Informe Técnico' },
  { key: 'validacion_rtn',         label: 'Validación RTN Proveedores' },
  { key: 'constancia_legal',       label: 'Constancia Inf. Legal Proveedores' },
  { key: 'solvencia_fiscal',       label: 'Solvencia Fiscal' },
  { key: 'otros',                  label: 'Otros' },
];

function buildEmpty() {
  const base = { numero_folios: '', numero_expediente: '', observaciones: '' };
  for (const d of DOCS) base[d.key] = false;
  return base;
}

function countDocs(item) {
  return DOCS.filter(d => item[d.key] == 1 || item[d.key] === true).length;
}

const PAGE_SIZE = 10;

// ─── FormFields — definido FUERA del componente para evitar remount en cada render ──
function FormFields({ values, onChange }) {
  return (
    <>
      <div className="cl-form-row">
        <div className="cl-form-group">
          <label>N° de Folios Expediente</label>
          <input
            className="cl-input"
            value={values.numero_folios}
            onChange={e => onChange('numero_folios', e.target.value)}
            maxLength={100}
            placeholder="Ej. 25"
          />
        </div>
        <div className="cl-form-group">
          <label>N° de Expediente</label>
          <input
            className="cl-input"
            value={values.numero_expediente}
            onChange={e => onChange('numero_expediente', e.target.value)}
            maxLength={100}
            placeholder="Ej. EXP-2026-001"
          />
        </div>
      </div>

      <div>
        <p className="cl-checks-title">Documentación incluida</p>
        <div className="cl-checks-grid">
          {DOCS.map(d => (
            <label
              key={d.key}
              className={`cl-check-label ${values[d.key] ? 'checked' : ''}`}
            >
              <input
                type="checkbox"
                checked={!!values[d.key]}
                onChange={e => onChange(d.key, e.target.checked)}
              />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="cl-form-group">
        <label>Observaciones</label>
        <textarea
          className="cl-textarea"
          value={values.observaciones}
          onChange={e => onChange('observaciones', e.target.value)}
          maxLength={2000}
          placeholder="Observaciones adicionales..."
        />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CheckList() {
  const { user } = useContext(AuthContext);
  const canDelete = ['SUPER_ADMIN', 'ADMIN', 'ASISTENTE'].includes(user?.rol);

  const [lista,   setLista]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast,   setToast]   = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [page,    setPage]    = useState(1);

  // modales
  const [modalCrear, setModalCrear] = useState(false);
  const [form,       setForm]       = useState(buildEmpty());
  const [formErr,    setFormErr]    = useState('');
  const [saving,     setSaving]     = useState(false);

  const [editItem,   setEditItem]   = useState(null);
  const [editForm,   setEditForm]   = useState(buildEmpty());
  const [editErr,    setEditErr]    = useState('');
  const [editing,    setEditing]    = useState(false);

  const [verItem,    setVerItem]    = useState(null);
  const [delItem,    setDelItem]    = useState(null);
  const [deleting,   setDeleting]   = useState(false);

  // ── toast helper ─────────────────────────────────────────────────────────
  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchLista = useCallback(() => {
    setLoading(true);
    api.get('/checklist', { headers: authHeaders() })
      .then(r => setLista(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLista(); }, [fetchLista]);

  // ── filtro / paginación ──────────────────────────────────────────────────
  const listaMostrada = (() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter(cl =>
      String(cl.numero).includes(q) ||
      (cl.numero_expediente || '').toLowerCase().includes(q) ||
      (cl.numero_folios     || '').toLowerCase().includes(q) ||
      (cl.creado_por_nombre || '').toLowerCase().includes(q)
    );
  })();

  const totalPages    = Math.max(1, Math.ceil(listaMostrada.length / PAGE_SIZE));
  const listaPaginada = listaMostrada.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── crear ─────────────────────────────────────────────────────────────────
  const handleCrear = async (e) => {
    e.preventDefault();
    setFormErr('');
    setSaving(true);
    try {
      await api.post('/checklist', form, { headers: authHeaders() });
      setModalCrear(false);
      setForm(buildEmpty());
      fetchLista();
      showToast('Check list creado correctamente.', 'ok');
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setSaving(false);
    }
  };

  // ── editar ────────────────────────────────────────────────────────────────
  const openEditar = (cl) => {
    const f = buildEmpty();
    f.numero_folios     = cl.numero_folios     || '';
    f.numero_expediente = cl.numero_expediente || '';
    f.observaciones     = cl.observaciones     || '';
    for (const d of DOCS) f[d.key] = cl[d.key] == 1;
    setEditItem(cl);
    setEditForm(f);
    setEditErr('');
  };

  const handleEditar = async (e) => {
    e.preventDefault();
    setEditErr('');
    setEditing(true);
    try {
      await api.put(`/checklist/${editItem.id}`, editForm, { headers: authHeaders() });
      setEditItem(null);
      fetchLista();
      showToast('Check list actualizado correctamente.', 'ok');
    } catch (err) {
      setEditErr(err.response?.data?.message || 'Error al guardar.');
    } finally {
      setEditing(false);
    }
  };

  // ── eliminar ──────────────────────────────────────────────────────────────
  const handleEliminar = async () => {
    if (!delItem) return;
    setDeleting(true);
    try {
      await api.delete(`/checklist/${delItem.id}`, { headers: authHeaders() });
      setDelItem(null);
      fetchLista();
      showToast('Check list eliminado.', 'ok');
    } catch (err) {
      showToast(err.response?.data?.message || 'Error al eliminar.');
      setDelItem(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── PDF ───────────────────────────────────────────────────────────────────
  const generarPDF = async (cl, print = false) => {
    const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const PW     = doc.internal.pageSize.getWidth();
    const PH     = doc.internal.pageSize.getHeight();
    const L      = 10;
    const R      = PW - 10;
    const CW     = R - L;
    const AZUL   = [39, 76, 141];
    const NEGRO  = [20, 20, 20];
    const BLANCO = [255, 255, 255];
    const GBKG   = [237, 241, 250];

    const sa = s => s || '';   // fuente Roboto soporta acentos, no se necesita transformar

    // cargar fuente Roboto con soporte de acentos
    const loadFont = async (url) => {
      const resp   = await fetch(url);
      const buffer = await resp.arrayBuffer();
      const uint8  = new Uint8Array(buffer);
      let bin = '';
      for (let i = 0; i < uint8.length; i++) bin += String.fromCharCode(uint8[i]);
      return btoa(bin);
    };
    const [fontNormal, fontBold] = await Promise.all([
      loadFont('/fonts/Roboto-Regular.ttf'),
      loadFont('/fonts/Roboto-Bold.ttf'),
    ]);
    doc.addFileToVFS('Roboto-Regular.ttf', fontNormal);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', fontBold);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');

    const loadImg = (url) => new Promise(async (resolve) => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) { resolve(null); return; }
        const blob   = await resp.blob();
        const burl   = URL.createObjectURL(blob);
        const img    = new Image();
        img.onload = () => {
          try {
            const scale  = Math.min(220 / img.naturalWidth, 220 / img.naturalHeight, 1);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.naturalWidth  * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(burl);
            resolve({ data: canvas.toDataURL('image/jpeg', 0.95), w: img.naturalWidth, h: img.naturalHeight });
          } catch { URL.revokeObjectURL(burl); resolve(null); }
        };
        img.onerror = () => { URL.revokeObjectURL(burl); resolve(null); };
        img.src = burl;
      } catch { resolve(null); }
    });

    const logoRes = await loadImg('/logo-congreso.png.png');

    // ── borde exterior ────────────────────────────────────────────────────
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(1.2);
    doc.rect(L - 4, 5, CW + 8, PH - 10, 'S');

    let y = 10;

    // ════════════════════════════════════════════════════
    //  ENCABEZADO — [LOGO | INSTITUCIÓN | INFO PANEL]
    // ════════════════════════════════════════════════════
    const LOGO_W = 50;
    const INFO_W = 62;
    const CENT_W = CW - LOGO_W - INFO_W;
    const HDR_H  = 42;

    doc.setFillColor(...BLANCO);
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.5);
    doc.rect(L, y, CW, HDR_H, 'FD');

    if (logoRes) {
      const lSize = HDR_H - 6;
      doc.addImage(logoRes.data, 'JPEG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
    }

    doc.setDrawColor(180, 200, 235);
    doc.setLineWidth(0.3);
    doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);

    const hdrCX = L + LOGO_W + CENT_W / 2;
    doc.setTextColor(...AZUL);
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(13);
    doc.text('REPÚBLICA DE HONDURAS', hdrCX, y + 11, { align: 'center' });
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    doc.text('CONGRESO NACIONAL', hdrCX, y + 18, { align: 'center' });
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(15);
    doc.text('DIRECCIÓN ADMINISTRATIVA', hdrCX, y + 28, { align: 'center' });

    doc.setDrawColor(180, 200, 235);
    doc.setLineWidth(0.3);
    doc.line(L + LOGO_W + CENT_W, y + 4, L + LOGO_W + CENT_W, y + HDR_H - 4);

    // Panel derecho: CHECK LIST + año + caja número + GENERADO POR
    const infoX   = L + LOGO_W + CENT_W;
    const infoMid = infoX + INFO_W / 2;
    const now      = new Date();
    const fGen = now.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hGen = now.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const anio    = now.getFullYear();
    const genPor  = sa((user?.nombre || 'Sistema').toUpperCase());

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...AZUL);
    doc.text('CHECK LIST', infoMid, y + 8, { align: 'center' });

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 10, infoX + INFO_W - 3, y + 10);

    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 120, 160);
    doc.text('/' + anio, infoMid, y + 15, { align: 'center' });

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 17, infoX + INFO_W - 3, y + 17);

    // caja con número
    const NB_X = infoX + 4;
    const NB_W = INFO_W - 8;
    const NB_Y = y + 19;
    const NB_H = 9;
    doc.setFillColor(...BLANCO);
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.5);
    doc.rect(NB_X, NB_Y, NB_W, NB_H, 'FD');
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...AZUL);
    doc.text(String(cl.numero || 0).padStart(4, '0'), infoMid, NB_Y + NB_H - 1.5, { align: 'center' });

    doc.setDrawColor(210, 220, 235);
    doc.setLineWidth(0.2);
    doc.line(infoX + 3, y + 30, infoX + INFO_W - 3, y + 30);

    doc.setFont('Roboto', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 120, 160);
    doc.text('GENERADO POR', infoMid, y + 34.5, { align: 'center' });
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...AZUL);
    doc.text(genPor, infoMid, y + 40, { align: 'center' });

    // ════════════════════════════════════════════════════
    //  BARRA TÍTULO AZUL
    // ════════════════════════════════════════════════════
    y += HDR_H;
    const TBAR_H = 11;
    doc.setFillColor(...AZUL);
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0);
    doc.rect(L, y, CW, TBAR_H, 'FD');
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...BLANCO);
    doc.text('CHECK LIST DE EXPEDIENTE DE PAGO', L + CW / 2, y + 7.5, { align: 'center' });

    y += TBAR_H + 6;

    // ════════════════════════════════════════════════════
    //  CAMPOS DE CABECERA con línea debajo del valor
    // ════════════════════════════════════════════════════
    // campo folios y expediente — valores alineados en la misma columna
    const VALX = L + 76;
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...NEGRO);
    doc.text('Número de Folios Expediente:', L, y);
    doc.setFont('Roboto', 'bold');
    const val1 = sa(cl.numero_folios || '');
    doc.text(val1, VALX, y);
    const lw1 = (val1 ? doc.getTextWidth(val1) : 0) + 4;
    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.4);
    doc.line(VALX, y + 1, VALX + lw1, y + 1);
    y += 8;
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...NEGRO);
    doc.text('Número de Expediente:', L, y);
    doc.setFont('Roboto', 'bold');
    const val2 = sa(cl.numero_expediente || '');
    doc.text(val2, VALX, y);
    const lw2 = (val2 ? doc.getTextWidth(val2) : 0) + 4;
    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.4);
    doc.line(VALX, y + 1, VALX + lw2, y + 1);
    y += 9;

    // texto introductorio
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...NEGRO);
    const intro = sa(
      'La Dirección Administrativa del Congreso Nacional, hace constar que, ' +
      'el presente expediente de pago va con la siguiente documentación:'
    );
    const introLines = doc.splitTextToSize(intro, CW);
    doc.text(introLines, L, y);
    y += introLines.length * 5 + 5;

    // ════════════════════════════════════════════════════
    //  TABLA DE CHECKBOXES — 2 columnas estilo formulario
    // ════════════════════════════════════════════════════
    const colW = CW / 2;
    const rowH = 10;
    const CB_S = 6;   // tamaño cuadro

    const pairs = [];
    for (let i = 0; i < DOCS.length; i += 2) pairs.push([DOCS[i], DOCS[i + 1] || null]);

    for (const [left, right] of pairs) {
      // fondo de fila
      doc.setFillColor(...GBKG);
      doc.rect(L, y, CW, rowH, 'F');

      // borde filas
      doc.setDrawColor(210, 220, 235);
      doc.setLineWidth(0.2);
      doc.rect(L, y, CW, rowH, 'S');
      doc.line(L + colW, y, L + colW, y + rowH);

      const midY = y + rowH / 2;

      // columna izquierda
      const chkL = left && (cl[left.key] == 1 || cl[left.key] === true);
      doc.setFillColor(...BLANCO);
      doc.setDrawColor(...NEGRO);
      doc.setLineWidth(0.45);
      doc.rect(L + 3, midY - CB_S / 2, CB_S, CB_S, 'FD');
      if (chkL) {
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...NEGRO);
        doc.text('X', L + 3 + CB_S / 2, midY + 2.2, { align: 'center' });
      }
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...NEGRO);
      doc.text(sa(left.label), L + 3 + CB_S + 3, midY + 2);

      // columna derecha
      if (right) {
        const chkR = cl[right.key] == 1 || cl[right.key] === true;
        doc.setFillColor(...BLANCO);
        doc.setDrawColor(...NEGRO);
        doc.setLineWidth(0.45);
        doc.rect(L + colW + 3, midY - CB_S / 2, CB_S, CB_S, 'FD');
        if (chkR) {
          doc.setFont('Roboto', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(...NEGRO);
          doc.text('X', L + colW + 3 + CB_S / 2, midY + 2.2, { align: 'center' });
        }
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...NEGRO);
        doc.text(sa(right.label), L + colW + 3 + CB_S + 3, midY + 2);
      }

      y += rowH;
    }

    y += 6;

    // ════════════════════════════════════════════════════
    //  CUADRO OBSERVACIONES
    // ════════════════════════════════════════════════════
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NEGRO);
    doc.text('Observaciones:', L, y);
    y += 5;
    const obsH = 32;
    doc.setFillColor(...BLANCO);
    doc.setDrawColor(...NEGRO);
    doc.setLineWidth(0.4);
    doc.rect(L, y, CW, obsH, 'FD');
    if (cl.observaciones) {
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(50, 50, 70);
      const obsLines = doc.splitTextToSize(sa(cl.observaciones), CW - 6);
      doc.text(obsLines, L + 3, y + 5);
    }
    y += obsH + 6;

    // ════════════════════════════════════════════════════
    //  NOTAS AL PIE
    // ════════════════════════════════════════════════════
    doc.setFont('Roboto', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NEGRO);
    doc.text('Observación:', L, y);
    y += 5;
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...NEGRO);
    const n1Lines = doc.splitTextToSize(sa(
      '1. Los expedientes para pago, dependiente de su naturaleza del gasto, son armados con la información ' +
      'requerida para la emisión de pago, por lo que no todos los expedientes deben llevar la misma información ' +
      '(como parte del proceso o como anexo del mismo)'
    ), CW);
    doc.text(n1Lines, L, y);
    y += n1Lines.length * 5 + 3;
    doc.setFont('Roboto', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...NEGRO);
    const n2Lines = doc.splitTextToSize(sa(
      '2. Las casillas de documentación que no estén marcadas, es porque esa información no aplica para el presente expediente.'
    ), CW);
    doc.text(n2Lines, L, y);

    // ════════════════════════════════════════════════════
    //  PIE DE PÁGINA — barra azul igual que autorizaciones
    // ════════════════════════════════════════════════════
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      const FH = 9;
      const FY = PH - 5 - FH;
      doc.setFillColor(...AZUL);
      doc.rect(L - 4, FY, CW + 8, FH, 'F');
      doc.setFont('Roboto', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...BLANCO);
      doc.text('Congreso Nacional - Dirección Administrativa', L - 1, FY + 5.8);
      doc.text('Página ' + p + ' de ' + pageCount, L + CW / 2, FY + 5.8, { align: 'center' });
      doc.text('Generado: ' + fGen + ' ' + hGen, L + CW + 1, FY + 5.8, { align: 'right' });
    }

    if (print) {
      const blobUrl = doc.output('bloburl');
      const iframe  = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
      document.body.appendChild(iframe);
      iframe.src = blobUrl;
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(blobUrl); }, 1500);
        }, 300);
      };
    } else {
      doc.save(`checklist-${cl.numero}.pdf`);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="cl-page">
      <Navbar />

      <div className="cl-content">

        {/* ── HEADER oscuro con stats ── */}
        <div className="cl-header">
          <div className="cl-header-brand">
            <div className="cl-header-icon"><FiClipboard size={22} /></div>
            <div>
              <h1 className="cl-header-title">Check List Expedientes</h1>
              <p className="cl-header-sub">Control de documentación para expedientes de pago</p>
            </div>
          </div>
          <div className="cl-header-stats">
            <div className="cl-hstat">
              <span className="cl-hstat-val">{lista.length}</span>
              <span className="cl-hstat-lbl">Registros</span>
            </div>
          </div>
        </div>

        {/* ── TOOLBAR ── */}
        <div className="cl-toolbar">
          <div className="cl-toolbar-left">
            <div className="cl-search-wrap">
              <FiSearch size={14} className="cl-search-icon" />
              <input
                className="cl-search-input"
                placeholder="Buscar por N°, expediente, responsable..."
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setPage(1); }}
              />
            </div>
          </div>
          <div className="cl-toolbar-right">
            <button className="cl-tool-icon" onClick={fetchLista} title="Actualizar">
              <FiRefreshCw size={15} />
            </button>
            <button className="cl-tool-btn-new"
              onClick={() => { setForm(buildEmpty()); setFormErr(''); setModalCrear(true); }}>
              <FiPlus size={13} /> Nuevo Check List
            </button>
          </div>
        </div>

        {/* ── TABLA ── */}
        <div className="cl-table-wrap">
          {loading ? (
            <div className="cl-empty"><FiClipboard size={40} /><p>Cargando…</p></div>
          ) : listaMostrada.length === 0 ? (
            <div className="cl-empty"><FiClipboard size={40} /><p>No hay check lists registrados.</p></div>
          ) : (
            <>
              <table className="cl-table">
                <thead>
                  <tr>
                    <th><span className="cl-th-inner">#</span></th>
                    <th><span className="cl-th-inner">N° Expediente</span></th>
                    <th><span className="cl-th-inner">N° Folios</span></th>
                    <th><span className="cl-th-inner">Documentos</span></th>
                    <th><span className="cl-th-inner">Fecha</span></th>
                    <th><span className="cl-th-inner">Creado por</span></th>
                    <th><span className="cl-th-inner">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {listaPaginada.map((cl, idx) => {
                    const n = countDocs(cl);
                    return (
                      <tr key={cl.id} className={idx % 2 === 1 ? 'cl-tr-alt' : ''}>
                        <td className="cl-td-num">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                        <td style={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#274C8D' }}>
                          {String(cl.numero).padStart(4, '0')}
                          {cl.numero_expediente ? <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{cl.numero_expediente}</div> : null}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{cl.numero_folios || '—'}</td>
                        <td>
                          <div className="cl-docs-bar">
                            <div className="cl-docs-fill">
                              <div className="cl-docs-fill-inner"
                                style={{ width: `${Math.round((n / DOCS.length) * 100)}%` }} />
                            </div>
                            <span className="cl-docs-label">{n}/{DOCS.length}</span>
                          </div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(cl.fecha_creacion)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{cl.creado_por_nombre || '—'}</td>
                        <td>
                          <div className="cl-actions">
                            <button className="cl-act-btn cl-act-btn--view" title="Ver detalle" onClick={() => setVerItem(cl)}><FiEye size={13}/></button>
                            <button className="cl-act-btn cl-act-btn--print" title="Imprimir PDF" onClick={() => generarPDF(cl, true)}><FiPrinter size={13}/></button>
                            <button className="cl-act-btn cl-act-btn--dl" title="Descargar PDF" onClick={() => generarPDF(cl, false)}><FiClipboard size={13}/></button>
                            <button className="cl-act-btn cl-act-btn--edit" title="Editar" onClick={() => openEditar(cl)}><FiEdit2 size={13}/></button>
                            {canDelete && (
                              <button className="cl-act-btn cl-act-btn--del" title="Eliminar" onClick={() => setDelItem(cl)}><FiTrash2 size={13}/></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="cl-tfoot-row">
                    <td colSpan={7}>
                      Mostrando <strong>{listaPaginada.length}</strong> de <strong>{listaMostrada.length}</strong> registros
                    </td>
                  </tr>
                </tfoot>
              </table>

              {totalPages > 1 && (
                <div className="std-pg">
                  <span className="std-pg-info">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, listaMostrada.length)} de <strong>{listaMostrada.length}</strong>
                  </span>
                  <div className="std-pg-controls">
                    <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                    <button className="std-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                    {(() => {
                      const maxBtns = 7;
                      let start = Math.max(1, page - Math.floor(maxBtns / 2));
                      let end   = Math.min(totalPages, start + maxBtns - 1);
                      if (end - start < maxBtns - 1) start = Math.max(1, end - maxBtns + 1);
                      const pages = [];
                      if (start > 1) {
                        pages.push(<button key={1} className="std-pg-btn std-pg-num" onClick={() => setPage(1)}>1</button>);
                        if (start > 2) pages.push(<span key="el" className="std-pg-ellipsis">…</span>);
                      }
                      for (let p = start; p <= end; p++) {
                        pages.push(<button key={p} className={`std-pg-btn std-pg-num${page === p ? ' std-pg-num--active' : ''}`} onClick={() => setPage(p)}>{p}</button>);
                      }
                      if (end < totalPages) {
                        if (end < totalPages - 1) pages.push(<span key="er" className="std-pg-ellipsis">…</span>);
                        pages.push(<button key={totalPages} className="std-pg-btn std-pg-num" onClick={() => setPage(totalPages)}>{totalPages}</button>);
                      }
                      return pages;
                    })()}
                    <button className="std-pg-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                    <button className="std-pg-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
                  </div>
                  <span className="std-pg-total">Pág. <strong>{page}</strong> / {totalPages}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          MODAL CREAR
      ══════════════════════════════════════════════════════════ */}
      {modalCrear && (
        <div className="cl-backdrop" onClick={e => e.target === e.currentTarget && setModalCrear(false)}>
          <div className="cl-modal">
            <div className="cl-modal-header">
              <div className="cl-modal-icon"><FiClipboard size={20} color="#274C8D" /></div>
              <div>
                <h3>Nuevo Check List</h3>
                <p>Complete la documentación del expediente</p>
              </div>
              <button className="cl-modal-close" onClick={() => setModalCrear(false)}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleCrear}>
              <div className="cl-form">
                <FormFields values={form} onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))} />
                {formErr && <div className="cl-server-err">{formErr}</div>}
              </div>
              <div className="cl-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalCrear(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Crear Check List'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL EDITAR
      ══════════════════════════════════════════════════════════ */}
      {editItem && (
        <div className="cl-backdrop" onClick={e => e.target === e.currentTarget && setEditItem(null)}>
          <div className="cl-modal">
            <div className="cl-modal-header">
              <div className="cl-modal-icon"><FiEdit2 size={20} color="#274C8D" /></div>
              <div>
                <h3>Editar Check List #{String(editItem.numero).padStart(4, '0')}</h3>
                <p>Modifique los campos necesarios</p>
              </div>
              <button className="cl-modal-close" onClick={() => setEditItem(null)}><FiX size={18} /></button>
            </div>
            <form onSubmit={handleEditar}>
              <div className="cl-form">
                <FormFields values={editForm} onChange={(k, v) => setEditForm(p => ({ ...p, [k]: v }))} />
                {editErr && <div className="cl-server-err">{editErr}</div>}
              </div>
              <div className="cl-modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditItem(null)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={editing}>
                  {editing ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL VER DETALLE
      ══════════════════════════════════════════════════════════ */}
      {verItem && (
        <div className="cl-backdrop" onClick={e => e.target === e.currentTarget && setVerItem(null)}>
          <div className="cl-modal">
            {/* header azul */}
            <div className="cl-ver-header">
              <div>
                <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>N° Check List</div>
                <div className="cl-ver-num">{String(verItem.numero).padStart(4, '0')}</div>
              </div>
              <div className="cl-ver-meta" style={{ flex: 1 }}>
                <span className="cl-ver-meta-fecha">{fmtFecha(verItem.fecha_creacion)}</span>
                <span className="cl-ver-meta-user">{verItem.creado_por_nombre || '—'}</span>
                <div className="cl-ver-progress-wrap">
                  <span className="cl-ver-progress-label">{countDocs(verItem)} de {DOCS.length} documentos</span>
                  <div className="cl-ver-progress-bar">
                    <div className="cl-ver-progress-inner"
                      style={{ width: `${Math.round((countDocs(verItem) / DOCS.length) * 100)}%` }} />
                  </div>
                </div>
              </div>
              <button className="cl-modal-close" style={{ color: 'rgba(255,255,255,0.7)' }}
                onClick={() => setVerItem(null)}><FiX size={18} /></button>
            </div>

            <div className="cl-ver-body">
              {/* campos */}
              <div className="cl-ver-fields">
                <div className="cl-ver-field">
                  <div className="cl-ver-field-label">N° Folios</div>
                  <div className="cl-ver-field-value">{verItem.numero_folios || '—'}</div>
                </div>
                <div className="cl-ver-field">
                  <div className="cl-ver-field-label">N° Expediente</div>
                  <div className="cl-ver-field-value">{verItem.numero_expediente || '—'}</div>
                </div>
              </div>

              {/* documentos */}
              <div className="cl-ver-section-title">Documentación</div>
              <div className="cl-ver-checks">
                {DOCS.map(d => {
                  const on = verItem[d.key] == 1 || verItem[d.key] === true;
                  return (
                    <div key={d.key} className={`cl-ver-check-item ${on ? 'on' : 'off'}`}>
                      <span className={`dot ${on ? 'on' : 'off'}`} />
                      {d.label}
                    </div>
                  );
                })}
              </div>

              {/* observaciones */}
              {verItem.observaciones && (
                <>
                  <div className="cl-ver-section-title">Observaciones</div>
                  <div className="cl-ver-obs">{verItem.observaciones}</div>
                </>
              )}

              <div className="cl-modal-footer" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <button className="btn-secondary" onClick={() => generarPDF(verItem, false)}>
                  <FiClipboard size={14} /> Descargar PDF
                </button>
                <button className="btn-primary" onClick={() => generarPDF(verItem, true)}>
                  <FiPrinter size={14} /> Imprimir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL CONFIRMAR ELIMINAR
      ══════════════════════════════════════════════════════════ */}
      {delItem && (
        <div className="cl-backdrop" onClick={e => e.target === e.currentTarget && setDelItem(null)}>
          <div className="cl-modal cl-modal-sm">
            <div className="cl-modal-header cl-modal-header-danger">
              <div className="cl-modal-icon"><FiTrash2 size={20} color="#e11d48" /></div>
              <div>
                <h3>Eliminar Check List</h3>
                <p>Esta acción no se puede deshacer.</p>
              </div>
              <button className="cl-modal-close" onClick={() => setDelItem(null)}><FiX size={18} /></button>
            </div>
            <div className="cl-form" style={{ paddingBottom: 4 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
                ¿Eliminar el check list&nbsp;
                <strong>#{String(delItem.numero).padStart(4, '0')}</strong>
                {delItem.numero_expediente ? ` — ${delItem.numero_expediente}` : ''}?
              </p>
            </div>
            <div className="cl-modal-footer">
              <button className="btn-secondary" onClick={() => setDelItem(null)}>Cancelar</button>
              <button className="btn-danger" onClick={handleEliminar} disabled={deleting}>
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && <div className={`cl-toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

