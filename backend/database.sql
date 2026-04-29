-- ============================================================
--  Control Interno - Script completo de Base de Datos
--  Fecha: 2026-03-21
-- ============================================================

CREATE DATABASE IF NOT EXISTS control_interno
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE control_interno;

-- ------------------------------------------------------------
-- Tabla: roles
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          INT          AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(50)  NOT NULL UNIQUE COMMENT 'SUPER_ADMIN | ADMIN | ASISTENTE',
  descripcion VARCHAR(255) NULL,
  creado_en   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabla: usuarios
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id              INT           AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(100)  NOT NULL                     COMMENT 'Nombre completo',
  username        VARCHAR(50)   NOT NULL UNIQUE               COMMENT 'Nombre de usuario para login',
  email           VARCHAR(150)  NOT NULL UNIQUE,
  password        VARCHAR(255)  NOT NULL,
  rol             ENUM('SUPER_ADMIN','ADMIN','ASISTENTE') NOT NULL DEFAULT 'ASISTENTE',
  activo          TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Datos: roles
-- ------------------------------------------------------------
INSERT INTO roles (nombre, descripcion) VALUES
  ('SUPER_ADMIN', 'Super Administrador con acceso total al sistema, incluida la gestión de administradores'),
  ('ADMIN',       'Administrador con acceso a gestión de usuarios y configuraciones generales'),
  ('ASISTENTE',   'Asistente con acceso limitado a operaciones básicas del sistema');

-- ------------------------------------------------------------
-- Datos: usuario Super Administrador
--
--  username : superadmin
--  password : Superadmin@2026   ← cámbiala al primer inicio de sesión
-- ------------------------------------------------------------
INSERT INTO usuarios (nombre, username, email, password, rol, activo) VALUES
  (
    'Super Administrador',
    'superadmin',
    'superadmin@control.com',
    '$2a$10$KudSLoqr0qYfaK9Zhwb3fO8RWCFBGofoml8rqnfttyoDI5ytEsEdy',
    'SUPER_ADMIN',
    1
  );

-- ------------------------------------------------------------
-- Tabla: caja_chica
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caja_chica (
  id          INT              AUTO_INCREMENT PRIMARY KEY,
  fecha       DATE             NOT NULL,
  descripcion VARCHAR(255)     NOT NULL,
  tipo        ENUM('INGRESO','RECARGA','EGRESO') NOT NULL,
  monto       DECIMAL(12, 2)   NOT NULL,
  categoria   VARCHAR(100)     NULL       COMMENT 'Categoría del gasto (solo egresos)',
  usuario_id  INT              NOT NULL,
  creado_en   TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_caja_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Migración: agregar columna categoria si la tabla ya existe
-- Ejecutar solo si la tabla fue creada sin esta columna
-- ------------------------------------------------------------
-- ALTER TABLE caja_chica ADD COLUMN categoria VARCHAR(100) NULL AFTER monto;
-- ALTER TABLE caja_chica MODIFY COLUMN tipo ENUM('INGRESO','RECARGA','EGRESO') NOT NULL;

-- ------------------------------------------------------------
-- Tabla: modulos  (catálogo fijo de módulos del sistema)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS modulos (
  id     INT          AUTO_INCREMENT PRIMARY KEY,
  clave  VARCHAR(50)  NOT NULL UNIQUE COMMENT 'Identificador usado en el frontend',
  nombre VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO modulos (clave, nombre) VALUES
  ('caja',          'Caja Chica'),
  ('usuarios',      'Gestión de Usuarios'),
  ('base-datos',    'Base de Datos'),
  ('autorizaciones','Autorizaciones de Pago'),
  ('asistente-ia',  'Asistente IA');

-- ------------------------------------------------------------
-- Tabla: usuario_modulos  (permisos individuales por usuario)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario_modulos (
  usuario_id INT NOT NULL,
  modulo_id  INT NOT NULL,
  PRIMARY KEY (usuario_id, modulo_id),
  CONSTRAINT fk_um_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_um_modulo  FOREIGN KEY (modulo_id)  REFERENCES modulos(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- El SUPER_ADMIN (id=1) obtiene todos los módulos por defecto
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos;

-- Módulo de autorizaciones
INSERT IGNORE INTO modulos (nombre, clave) VALUES ('Autorizaciones de Pago', 'autorizaciones');
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'autorizaciones';

-- ------------------------------------------------------------
-- Tabla: autorizaciones_pago
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS autorizaciones_pago (
  id                 INT           AUTO_INCREMENT PRIMARY KEY,
  numero             VARCHAR(10)   NOT NULL UNIQUE COMMENT 'Número correlativo ej. 0074',
  tipo_pago          ENUM('CHEQUE','CONTRA_ENTREGA','TRANSFERENCIA','PAGO_LINEA') NOT NULL,
  beneficiario       VARCHAR(200)  NOT NULL,
  monto              DECIMAL(15,2) NOT NULL,
  monto_letras       VARCHAR(600)  NOT NULL,
  detalle            TEXT          NOT NULL,
  anio               YEAR          NOT NULL,
  org                VARCHAR(20)   NOT NULL DEFAULT '',
  fondo              VARCHAR(20)   NOT NULL DEFAULT '',
  estado             ENUM('PENDIENTE','AUTORIZADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  creado_por         INT           NOT NULL,
  autorizado_por     INT           NULL,
  fecha_creacion     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_autorizacion DATETIME      NULL,
  motivo_rechazo     TEXT          NULL,
  firma_nombre       VARCHAR(200)  NULL COMMENT 'Nombre del autorizador al momento de firmar',
  CONSTRAINT fk_ap_creado   FOREIGN KEY (creado_por)     REFERENCES usuarios(id),
  CONSTRAINT fk_ap_autor    FOREIGN KEY (autorizado_por) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabla: auditoria  (registro de eventos de seguridad y acciones)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id              BIGINT        AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT           NULL          COMMENT 'NULL si el usuario no está autenticado',
  usuario_nombre  VARCHAR(100)  NULL,
  accion          VARCHAR(50)   NOT NULL      COMMENT 'LOGIN_OK|LOGIN_FAIL|CREAR|ACTUALIZAR|ELIMINAR|IP_BLOQUEADA|ACCESO_DENEGADO',
  modulo          VARCHAR(50)   NULL          COMMENT 'Módulo afectado (auth, caja, usuarios, etc.)',
  detalle         TEXT          NULL          COMMENT 'Información adicional del evento',
  ip              VARCHAR(45)   NOT NULL,
  metodo          VARCHAR(10)   NULL,
  ruta            VARCHAR(255)  NULL,
  resultado       ENUM('EXITO','FALLO','BLOQUEADO') NOT NULL DEFAULT 'EXITO',
  creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_accion    (accion),
  INDEX idx_audit_resultado (resultado),
  INDEX idx_audit_ip        (ip),
  INDEX idx_audit_fecha     (creado_en),
  INDEX idx_audit_usuario   (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Tabla: ip_whitelist  (control de acceso por IP)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ip_whitelist (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  ip          VARCHAR(50)   NOT NULL UNIQUE COMMENT 'IP exacta o rango CIDR (ej. 192.168.1.10 o 192.168.1.0/24)',
  descripcion VARCHAR(120)  NULL     COMMENT 'Etiqueta para identificar la máquina o red',
  activo      TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  creado_por  INT           NULL,
  CONSTRAINT fk_ipwl_usuario FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Módulo: diputados
-- ------------------------------------------------------------
-- Si la tabla diputados ya existe sin la columna activo, ejecutar:
-- ALTER TABLE diputados ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1;

-- Registrar módulo y asignarlo al SUPER_ADMIN
INSERT IGNORE INTO modulos (clave, nombre) VALUES ('diputados', 'Diputados');
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'diputados';

-- Módulo: Reportes de Presupuesto Social
INSERT IGNORE INTO modulos (clave, nombre) VALUES ('reportes-presupuesto', 'Reportes Presupuesto');
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'reportes-presupuesto';

-- Módulo: Ayudas Alcaldías
INSERT IGNORE INTO modulos (clave, nombre) VALUES ('ayudas_alcaldias', 'Ayudas Alcaldías');
INSERT IGNORE INTO usuario_modulos (usuario_id, modulo_id)
  SELECT 1, id FROM modulos WHERE clave = 'ayudas_alcaldias';
