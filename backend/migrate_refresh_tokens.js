const db = require('./db');

const sql = `
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT          NOT NULL,
  token      VARCHAR(512) NOT NULL UNIQUE,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked    TINYINT(1)   NOT NULL DEFAULT 0,
  CONSTRAINT fk_rt_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_rt_token (token(64)),
  INDEX idx_rt_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

db.query(sql, (err) => {
  if (err) { console.error('Error:', err); process.exit(1); }
  console.log('✅ Tabla refresh_tokens creada correctamente.');
  process.exit(0);
});
