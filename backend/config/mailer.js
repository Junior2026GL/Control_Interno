const nodemailer = require('nodemailer');
const path       = require('path');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Ruta absoluta al logo (frontend/public)
const LOGO_PATH = path.join(__dirname, '../../frontend/public/logo-congreso.png.png');

/**
 * Envía un correo con enlace de recuperación de contraseña.
 * @param {string} toEmail   - Correo destino
 * @param {string} nombre    - Nombre del usuario
 * @param {string} resetUrl  - URL completa con el token
 */
exports.sendPasswordReset = async (toEmail, nombre, resetUrl) => {
  const html = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Recuperación de contraseña</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f0f4f8;padding:32px 0;">
    <tr>
      <td align="center">

        <!-- Card (600px) -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border-radius:12px;overflow:hidden;">

          <!-- ── Barra superior accent ── -->
          <tr>
            <td height="6" bgcolor="#1a3a6e" style="font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- ── HEADER oscuro con logo ── -->
          <tr>
            <td bgcolor="#0f2744" align="center"
                style="padding:36px 40px 28px;">

              <!-- Logo -->
              <img src="cid:logo_congreso"
                   alt="Congreso Nacional"
                   width="86" height="86"
                   style="display:block;margin:0 auto 18px;border-radius:50%;
                          border:3px solid rgba(255,255,255,0.18);" />

              <!-- Badge SCICN -->
              <table cellpadding="0" cellspacing="0" border="0"
                     style="margin:0 auto 14px;">
                <tr>
                  <td bgcolor="#1e4a9a"
                      style="padding:5px 18px;border-radius:4px;
                             color:#ffffff;font-family:Arial,sans-serif;
                             font-size:12px;font-weight:bold;
                             letter-spacing:4px;text-transform:uppercase;">
                    SCICN
                  </td>
                </tr>
              </table>

              <!-- Título -->
              <p style="margin:0 0 4px;font-family:Arial,sans-serif;
                        font-size:22px;font-weight:bold;color:#ffffff;
                        letter-spacing:-0.3px;">
                Recuperar contraseña
              </p>
              <p style="margin:0;font-family:Arial,sans-serif;
                        font-size:11px;color:rgba(255,255,255,0.55);
                        text-transform:uppercase;letter-spacing:2px;">
                Sistema de Control Interno
              </p>
            </td>
          </tr>

          <!-- ── BODY ── -->
          <tr>
            <td bgcolor="#ffffff" style="padding:36px 48px 12px;">

              <!-- Saludo -->
              <p style="margin:0 0 14px;font-family:Arial,sans-serif;
                        font-size:15px;color:#1e293b;line-height:1.6;">
                Hola, <strong>${nombre}</strong>.
              </p>

              <!-- Descripción -->
              <p style="margin:0 0 28px;font-family:Arial,sans-serif;
                        font-size:14px;color:#475569;line-height:1.75;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta.
                Haz clic en el botón de abajo para crear una nueva contraseña.
                Este enlace es válido por&nbsp;<strong style="color:#0f2744;">15&nbsp;minutos</strong>.
              </p>

              <!-- ── CTA BUTTON (tabla para máxima compatibilidad) ── -->
              <table cellpadding="0" cellspacing="0" border="0"
                     style="margin:0 auto 32px;">
                <tr>
                  <td bgcolor="#1a3a6e"
                      style="border-radius:8px;padding:0;">
                    <a href="${resetUrl}"
                       target="_blank"
                       style="display:inline-block;padding:15px 42px;
                              font-family:Arial,sans-serif;font-size:15px;
                              font-weight:bold;color:#ffffff;text-decoration:none;
                              border-radius:8px;letter-spacing:0.3px;">
                      🔑&nbsp; Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #e2e8f0;padding-bottom:20px;
                             font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>

              <!-- Enlace alternativo -->
              <p style="margin:0 0 6px;font-family:Arial,sans-serif;
                        font-size:12px;color:#94a3b8;line-height:1.6;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:0 0 24px;font-family:Arial,monospace;
                        font-size:11px;color:#2563eb;word-break:break-all;
                        line-height:1.5;">
                ${resetUrl}
              </p>

              <!-- Aviso -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="#f8fafc"
                      style="padding:14px 18px;border-radius:8px;
                             border-left:4px solid #e2e8f0;">
                    <p style="margin:0;font-family:Arial,sans-serif;
                              font-size:12px;color:#64748b;line-height:1.6;">
                      Si <strong>no solicitaste</strong> este cambio, puedes ignorar este correo.
                      Tu contraseña no cambiará a menos que hagas clic en el enlace.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── FOOTER ── -->
          <tr>
            <td bgcolor="#f8fafc"
                style="padding:18px 48px;border-top:1px solid #e2e8f0;
                       text-align:center;">
              <p style="margin:0;font-family:Arial,sans-serif;
                        font-size:11px;color:#94a3b8;line-height:1.6;">
                © 2026 Sistema de Control Interno · Congreso Nacional<br/>
                Este es un mensaje automático, por favor no respondas a este correo.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>

</body>
</html>`;

  await transporter.sendMail({
    from: `"Sistema Control Interno" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: '🔑 Recuperación de contraseña – SCICN',
    html,
    attachments: [
      {
        filename: 'logo-congreso.png',
        path: LOGO_PATH,
        cid: 'logo_congreso',
      },
    ],
  });
};

// ── Template base compartida ─────────────────────────────────
function buildBackupEmail({ accentColor, headerBg, iconHtml, titleText, subtitleText, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${titleText}</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f0f4f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Barra accent -->
          <tr>
            <td height="6" bgcolor="${accentColor}" style="font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td bgcolor="${headerBg}" align="center" style="padding:32px 40px 24px;">
              <img src="cid:logo_congreso" alt="Congreso Nacional" width="72" height="72"
                   style="display:block;margin:0 auto 14px;border-radius:50%;
                          border:3px solid rgba(255,255,255,0.18);" />
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;">
                <tr>
                  <td bgcolor="#1e4a9a" style="padding:4px 16px;border-radius:4px;
                       color:#ffffff;font-family:Arial,sans-serif;font-size:11px;
                       font-weight:bold;letter-spacing:4px;text-transform:uppercase;">
                    SCICN
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:20px;
                        font-weight:bold;color:#ffffff;">
                ${iconHtml}&nbsp; ${titleText}
              </p>
              <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;
                        color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:2px;">
                ${subtitleText}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td bgcolor="#ffffff" style="padding:32px 48px 28px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="padding:16px 48px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#94a3b8;line-height:1.6;">
                © 2026 Sistema de Control Interno · Congreso Nacional<br/>
                Este es un mensaje automático, por favor no respondas a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Notificación de backup automático exitoso.
 * @param {string} toEmail
 * @param {string} filename  - Nombre del archivo generado
 * @param {number} sizeBytes - Tamaño del archivo en bytes
 */
exports.sendBackupSuccess = async (toEmail, filename, sizeBytes) => {
  const sizeKb = sizeBytes > 0 ? (sizeBytes / 1024).toFixed(1) + ' KB' : 'N/D';
  const dateStr = new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' });

  const bodyHtml = `
    <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:15px;color:#1e293b;line-height:1.6;">
      El backup programado se completó correctamente.
    </p>

    <!-- Tabla de detalles -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:24px;">
      <tr bgcolor="#f8fafc">
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:12px;
                   font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;
                   border-bottom:1px solid #e2e8f0;" width="140">
          Archivo
        </td>
        <td style="padding:10px 16px;font-family:Arial,monospace;font-size:13px;
                   color:#1e293b;border-bottom:1px solid #e2e8f0;">
          ${filename}
        </td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:12px;
                   font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;
                   border-bottom:1px solid #e2e8f0;">
          Tamaño
        </td>
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;
                   color:#1e293b;border-bottom:1px solid #e2e8f0;">
          ${sizeKb}
        </td>
      </tr>
      <tr bgcolor="#f8fafc">
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:12px;
                   font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:1px;">
          Fecha / Hora
        </td>
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;color:#1e293b;">
          ${dateStr}
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td bgcolor="#f0fdf4" style="padding:14px 18px;border-radius:8px;border-left:4px solid #16a34a;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#166534;line-height:1.6;">
            No se requiere ninguna acción. Este correo es solo informativo.
          </p>
        </td>
      </tr>
    </table>`;

  const html = buildBackupEmail({
    accentColor: '#16a34a',
    headerBg: '#14532d',
    iconHtml: '✅',
    titleText: 'Backup exitoso',
    subtitleText: 'Sistema de Control Interno',
    bodyHtml,
  });

  await transporter.sendMail({
    from: `"Sistema Control Interno" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `✅ Backup completado – ${filename}`,
    html,
    attachments: [{ filename: 'logo-congreso.png', path: LOGO_PATH, cid: 'logo_congreso' }],
  });
};

/**
 * Notificación de backup automático fallido.
 * @param {string} toEmail
 * @param {string} errorMessage - Mensaje de error
 * @param {string|null} lastBackup - ISO string del último backup exitoso (puede ser null)
 */
exports.sendBackupFailure = async (toEmail, errorMessage, lastBackup) => {
  const dateStr = new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' });
  const lastOk  = lastBackup
    ? new Date(lastBackup).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })
    : 'Sin registros';

  const bodyHtml = `
    <p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:15px;color:#1e293b;line-height:1.6;">
      El backup automático programado <strong>no pudo completarse</strong>.
      Revisa el servidor o la configuración de respaldo.
    </p>

    <!-- Tabla de detalles -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border-radius:8px;overflow:hidden;border:1px solid #fecaca;margin-bottom:24px;">
      <tr bgcolor="#fef2f2">
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:12px;
                   font-weight:bold;color:#991b1b;text-transform:uppercase;letter-spacing:1px;
                   border-bottom:1px solid #fecaca;" width="160">
          Fecha / Hora del fallo
        </td>
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;
                   color:#1e293b;border-bottom:1px solid #fecaca;">
          ${dateStr}
        </td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:12px;
                   font-weight:bold;color:#991b1b;text-transform:uppercase;letter-spacing:1px;
                   border-bottom:1px solid #fecaca;">
          Error
        </td>
        <td style="padding:10px 16px;font-family:Arial,monospace;font-size:12px;
                   color:#7f1d1d;word-break:break-all;border-bottom:1px solid #fecaca;">
          ${errorMessage}
        </td>
      </tr>
      <tr bgcolor="#fef2f2">
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:12px;
                   font-weight:bold;color:#991b1b;text-transform:uppercase;letter-spacing:1px;">
          Último backup exitoso
        </td>
        <td style="padding:10px 16px;font-family:Arial,sans-serif;font-size:13px;color:#1e293b;">
          ${lastOk}
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td bgcolor="#fef2f2" style="padding:14px 18px;border-radius:8px;border-left:4px solid #dc2626;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#991b1b;line-height:1.6;">
            <strong>Acción requerida:</strong> Ingresa al sistema y realiza un backup manual,
            o revisa la configuración desde el módulo <em>Base de Datos</em>.
          </p>
        </td>
      </tr>
    </table>`;

  const html = buildBackupEmail({
    accentColor: '#dc2626',
    headerBg: '#7f1d1d',
    iconHtml: '🚨',
    titleText: 'Backup fallido',
    subtitleText: 'Sistema de Control Interno',
    bodyHtml,
  });

  await transporter.sendMail({
    from: `"Sistema Control Interno" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `🚨 [ALERTA] Backup automático falló – ${dateStr}`,
    html,
    attachments: [{ filename: 'logo-congreso.png', path: LOGO_PATH, cid: 'logo_congreso' }],
  });
};
