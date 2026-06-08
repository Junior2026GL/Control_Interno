const db = require('./db');

const sql = `
INSERT IGNORE INTO modulos (clave, nombre)
VALUES ('busqueda-ayudas', 'Consulta de Ayudas');
`;

db.query(sql, (err, result) => {
  if (err) {
    console.error('Error al insertar módulo:', err);
    process.exit(1);
  }
  if (result.affectedRows > 0) {
    console.log('✅ Módulo "Consulta de Ayudas" (busqueda-ayudas) insertado correctamente.');
  } else {
    console.log('ℹ️  El módulo ya existía en la base de datos.');
  }
  process.exit(0);
});
