const db = require('./db');
const bcrypt = require('bcryptjs');

const createSuperAdmin = async () => {
  try {
    const nombre   = 'Super Administrador';
    const username = 'superadmin';          // nombre de usuario para el login
    const email    = 'superadmin@control.com';
    const password = 'Superadmin@2026';      // cambia esto después del primer login
    const rol      = 'SUPER_ADMIN';

    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO usuarios (nombre, username, email, password, rol, activo)
      VALUES (?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        nombre   = VALUES(nombre),
        password = VALUES(password),
        rol      = VALUES(rol),
        activo   = 1
    `;

    db.query(query, [nombre, username, email, hashedPassword, rol], (err) => {
      if (err) {
        console.error('Error al crear el super admin:', err);
      } else {
        console.log('✅ Usuario Super Administrador creado / actualizado exitosamente');
        console.log('👤 Username :', username);
        console.log('🔑 Password :', password);
        console.log('🛡️  Rol     :', rol);
      }
      process.exit();
    });
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createSuperAdmin();
