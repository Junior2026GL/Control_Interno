import jsPDF from 'jspdf';
import printJS from 'print-js';

async function loadImg(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function generarCompromisoLiquidacionPdf(data, printMode = false) {
  const logoData = await loadImg('/logo-congreso.png.png');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const PW  = doc.internal.pageSize.getWidth();
  const PH  = doc.internal.pageSize.getHeight();
  const L   = 10;
  const CW  = PW - L * 2;
  const ML  = L;

  const AZUL     = [39, 76, 141];
  const AZUL_OSC = [15, 39, 68];
  const NEGRO    = [20, 20, 20];
  const BLANCO   = [255, 255, 255];
  const GRIS     = [150, 150, 150];

  const now      = new Date();
  const fechaGen = now.toLocaleDateString('es-HN', { day:'2-digit', month:'2-digit', year:'numeric' });
  const horaGen  = now.toLocaleTimeString('es-HN', { hour:'2-digit', minute:'2-digit' });

  const drawMarco = () => {
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(1.2);
    doc.rect(L - 4, 5, CW + 8, PH - 10, 'S');
  };

  const drawFooter = (pageNum, totalPages) => {
    const FH = 9;
    const FY = PH - 5 - FH;
    doc.setFillColor(...AZUL);
    doc.rect(L - 4, FY, CW + 8, FH, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...BLANCO);
    doc.text('Congreso Nacional - Pagaduría Especial', L - 1, FY + 5.8);
    doc.text('Página ' + pageNum + ' de ' + totalPages, PW / 2, FY + 5.8, { align: 'center' });
    doc.text('Generado: ' + fechaGen + ' ' + horaGen, L + CW + 1, FY + 5.8, { align: 'right' });
  };

  const bold   = (s = 9) => { doc.setFont('helvetica', 'bold');   doc.setFontSize(s); };
  const normal = (s = 9) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(s); };
  const hline  = (x1, y1, x2, col = GRIS, w = 0.25) => {
    doc.setDrawColor(...col); doc.setLineWidth(w); doc.line(x1, y1, x2, y1);
  };

  const drawField = (label, value, x, y, w) => {
    const H = 9.5;
    doc.setFillColor(245, 247, 252);
    doc.rect(x, y - 2.5, w, H, 'F');
    doc.setFillColor(...AZUL);
    doc.rect(x, y - 2.5, 1.5, H, 'F');
    normal(7); doc.setTextColor(120, 130, 150);
    doc.text(label.toUpperCase(), x + 3.5, y + 0.8);
    bold(9.5); doc.setTextColor(...AZUL_OSC);
    const shown = value ? (doc.splitTextToSize(String(value), w - 5)[0] || '') : '—';
    doc.text(shown, x + 3.5, y + 5.5);
  };

  const ROW = 10.5;
  const LOGO_W = 50;
  const HDR_H  = 42;
  const TBAR_H = 11;

  drawMarco();
  let y = 10;

  doc.setFillColor(...BLANCO);
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.rect(L, y, CW, HDR_H, 'FD');
  if (logoData) {
    const lSize = HDR_H - 6;
    doc.addImage(logoData, 'PNG', L + (LOGO_W - lSize) / 2, y + 3, lSize, lSize);
  }
  doc.setDrawColor(180, 200, 235); doc.setLineWidth(0.3);
  doc.line(L + LOGO_W, y + 4, L + LOGO_W, y + HDR_H - 4);
  const instCX = L + LOGO_W + (CW - LOGO_W) / 2;
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');   doc.setFontSize(13);
  doc.text('REPÚBLICA DE HONDURAS', instCX, y + 10, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('CONGRESO NACIONAL', instCX, y + 17, { align: 'center' });
  doc.setFont('helvetica', 'bold');   doc.setFontSize(16);
  doc.text('PAGADURÍA ESPECIAL', instCX, y + 27, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text('Despacho del Pagador Especial', instCX, y + 34, { align: 'center' });

  y += HDR_H;
  doc.setFillColor(...AZUL);
  doc.rect(L, y, CW, TBAR_H, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.setTextColor(...BLANCO);
  doc.text('COMPROMISO DE LIQUIDACIÓN, DEVOLUCIÓN Y RECIBO', PW / 2, y + 7.2, { align: 'center' });
  y += TBAR_H + 10;

  const montoStr = data.monto
    ? `L. ${parseFloat(data.monto).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';
  const plazo = data.plazoDias || 30;

  normal(9.5); doc.setTextColor(...NEGRO);
  const p1 = 'Yo,';
  doc.text(p1, ML, y);
  let x = ML + doc.getTextWidth(p1) + 2;
  bold(9.5); doc.setTextColor(...AZUL_OSC);
  const nombreTxt = data.representanteNombre || '';
  doc.text(nombreTxt, x, y);
  hline(x, y + 0.5, x + Math.max(doc.getTextWidth(nombreTxt), 60), AZUL, 0.4);
  y += 8;

  normal(9.5); doc.setTextColor(...NEGRO);
  doc.text('con Documento Nacional de Identificación (DNI) No.', ML, y);
  x = ML + doc.getTextWidth('con Documento Nacional de Identificación (DNI) No.') + 2;
  bold(9.5); doc.setTextColor(...AZUL_OSC);
  const dniTxt = data.representanteDni || '';
  doc.text(dniTxt, x, y);
  hline(x, y + 0.5, x + Math.max(doc.getTextWidth(dniTxt), 40), AZUL, 0.4);
  y += 8;

  normal(9.5); doc.setTextColor(...NEGRO);
  doc.text('en representación de', ML, y);
  x = ML + doc.getTextWidth('en representación de') + 2;
  bold(9.5); doc.setTextColor(...AZUL_OSC);
  const institTxt = data.institucion || '';
  doc.text(institTxt, x, y);
  hline(x, y + 0.5, ML + CW, AZUL, 0.4);
  y += 10;

  normal(9.5); doc.setTextColor(...NEGRO);
  const parrafo1 = 'y en el pleno uso de mis facultades, libre y espontáneamente, HAGO CONSTAR QUE RECIBÍ DEL ' +
    `CONGRESO NACIONAL de la República de Honduras la cantidad de ${montoStr || '________________'} como ayuda ` +
    `social, y me comprometo con Pagaduría Especial del Congreso Nacional a liquidar dichos fondos en un plazo ` +
    `no mayor de ${plazo} días calendario a partir de la fecha de entrega.`;
  doc.splitTextToSize(parrafo1, CW).forEach(l => { doc.text(l, ML, y); y += 5.5; });
  y += 4;

  const parrafo2 = 'En caso de no cumplir con lo anterior, cualquiera que fuere la causa, me comprometo con el ' +
    'Congreso Nacional a devolver el monto total recibido o el saldo no justificado, cubriendo además los gastos ' +
    'administrativos, civiles o penales que correspondan, así como los respectivos intereses a la tasa bancaria ' +
    'activa del sistema financiero nacional vigente a la fecha de pago del valor adeudado.';
  doc.splitTextToSize(parrafo2, CW).forEach(l => { doc.text(l, ML, y); y += 5.5; });
  y += 14;

  const sigW = 80;
  const sigC = PW / 2 - sigW / 2;
  hline(sigC, y, sigC + sigW, AZUL, 0.5);
  y += 6;
  normal(11); doc.setTextColor(...NEGRO);
  doc.text('Firma y huella', PW / 2, y, { align: 'center' });
  y += 12;

  const halfL = CW * 0.5;
  drawField('Monto recibido:', montoStr, ML, y, halfL);
  drawField('Plazo de liquidación:', `${plazo} días`, ML + halfL + 4, y, halfL - 4);
  y += ROW;
  drawField('Correo electrónico:', data.correo, ML, y, halfL);
  drawField('No. de celular:', data.celular, ML + halfL + 4, y, halfL - 4);
  y += ROW;
  const fechaStr = data.fechaCompromiso
    ? new Date(data.fechaCompromiso + 'T00:00:00').toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  drawField('Fecha:', fechaStr, ML, y, halfL);

  normal(7.5); doc.setTextColor(120, 130, 150);
  doc.text('Nota: esta autorización deberá ser firmada únicamente por el representante legal de la',
    ML, PH - 22);
  doc.text('organización, institución o beneficiario.', ML, PH - 18);

  drawFooter(1, 1);

  const nombreFile = (data.institucion || data.representanteNombre || 'compromiso_liquidacion').replace(/\s+/g, '_');
  if (printMode) {
    const base64 = doc.output('datauristring').split(',')[1];
    printJS({ printable: base64, type: 'pdf', base64: true });
  } else {
    doc.save(`Compromiso_Liquidacion_${nombreFile}.pdf`);
  }
}
