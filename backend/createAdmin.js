const db = require('./db');
const bcrypt = require('bcryptjs');

const createAdmin = async () => {
  try {
    // Datos del admin a crear
    const nombre = 'Administrador';
    const email = 'admin@test.com';
    const password = 'Admin123'; // Cambia esto por la contraseña que desees
    const rol = 'ADMIN';

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar en la base de datos
    const query = 'INSERT INTO usuarios (nombre, email, password, rol, activo) VALUES (?, ?, ?, ?, 1)';
    
    db.query(query, [nombre, email, hashedPassword, rol], (err, result) => {
      if (err) {
        console.error('Error al crear el usuario:', err);
      } else {
        console.log('✅ Usuario administrador creado exitosamente');
        console.log('📧 Email:', email);
        console.log('🔑 Contraseña:', password);
        console.log('👤 Rol:', rol);
      }
      process.exit();
    });
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createAdmin();
