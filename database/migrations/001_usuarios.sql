-- Migración para bases creadas antes del login: agrega la tabla de usuarios.
-- Ejecutar con un usuario que tenga permiso CREATE (por ejemplo root):
--   mysql -u root -p < database/migrations/001_usuarios.sql
USE nasdaq_system;

CREATE TABLE IF NOT EXISTS users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(80)  NOT NULL,
  email          VARCHAR(120) NOT NULL,
  password_hash  VARCHAR(200) NOT NULL,
  role           ENUM('admin','analista') NOT NULL DEFAULT 'analista',
  last_login     DATETIME     NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%'),
  CONSTRAINT chk_users_name CHECK (CHAR_LENGTH(full_name) >= 3)
) ENGINE=InnoDB;
