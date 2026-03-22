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
