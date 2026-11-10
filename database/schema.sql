-- =====================================================================
--  CAPA DE DATOS - Sistema de Automatización NASDAQ
--  Motor: MySQL 8.x
--  Ejecutar:  mysql -u root -p < database/schema.sql
-- =====================================================================

CREATE DATABASE IF NOT EXISTS nasdaq_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nasdaq_system;

-- ---------------------------------------------------------------------
-- Empresas / acciones que el sistema sigue automáticamente
-- (límites de caracteres definidos: SP-106)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stocks (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  symbol      VARCHAR(10)  NOT NULL,           -- Ej: AAPL, MSFT, NVDA
  name        VARCHAR(120) NULL,               -- Nombre de la empresa
  exchange    VARCHAR(30)  NULL,               -- NasdaqGS, NasdaqGM...
  currency    CHAR(3)      NOT NULL DEFAULT 'USD',
  active      TINYINT(1)   NOT NULL DEFAULT 1, -- 1 = se actualiza automáticamente
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_stocks_symbol UNIQUE (symbol),
  CONSTRAINT chk_symbol_format CHECK (symbol REGEXP '^[A-Z0-9.\\-]{1,10}$')
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Histórico diario de precios (valores decimales exactos: SP-103)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_history (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_id    INT UNSIGNED   NOT NULL,
  trade_date  DATE           NOT NULL,
  open_price  DECIMAL(14,4)  NULL,
  high_price  DECIMAL(14,4)  NULL,
  low_price   DECIMAL(14,4)  NULL,
  close_price DECIMAL(14,4)  NOT NULL,
  volume      BIGINT UNSIGNED NULL,
  CONSTRAINT fk_history_stock FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE,
  CONSTRAINT uq_history_day UNIQUE (stock_id, trade_date)
) ENGINE=InnoDB;

CREATE INDEX idx_history_stock_date ON price_history (stock_id, trade_date);

-- ---------------------------------------------------------------------
-- Última cotización en tiempo (casi) real
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  stock_id        INT UNSIGNED  PRIMARY KEY,
  price           DECIMAL(14,4) NOT NULL,
  previous_close  DECIMAL(14,4) NULL,
  change_amount   DECIMAL(14,4) NULL,
  change_percent  DECIMAL(9,4)  NULL,
  day_high        DECIMAL(14,4) NULL,
  day_low         DECIMAL(14,4) NULL,
  volume          BIGINT UNSIGNED NULL,
  market_time     DATETIME      NULL,
  fetched_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_quotes_stock FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Recomendaciones de inversión generadas por el backend
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendations (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stock_id        INT UNSIGNED  NOT NULL,
  recommendation  ENUM('COMPRAR','MANTENER','VENDER') NOT NULL,
  score           DECIMAL(6,2)  NOT NULL,        -- -100 a 100
  price           DECIMAL(14,4) NOT NULL,
  sma20           DECIMAL(14,4) NULL,
  sma50           DECIMAL(14,4) NULL,
  rsi14           DECIMAL(7,3)  NULL,
  volatility      DECIMAL(9,4)  NULL,            -- % anualizada
  reasons         VARCHAR(1000) NOT NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reco_stock FOREIGN KEY (stock_id) REFERENCES stocks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_reco_stock_created ON recommendations (stock_id, created_at);

-- ---------------------------------------------------------------------
-- Bitácora de la automatización (cada ejecución del job)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  started_at   DATETIME     NOT NULL,
  finished_at  DATETIME     NULL,
  symbols_ok   INT UNSIGNED NOT NULL DEFAULT 0,
  symbols_fail INT UNSIGNED NOT NULL DEFAULT 0,
  message      VARCHAR(1000) NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Usuarios del sistema (login). La contraseña se guarda como hash scrypt
-- con sal aleatoria, nunca en texto plano.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Datos iniciales: principales empresas del NASDAQ-100
-- ---------------------------------------------------------------------
INSERT IGNORE INTO stocks (symbol, name) VALUES
  ('AAPL',  'Apple Inc.'),
  ('MSFT',  'Microsoft Corporation'),
  ('NVDA',  'NVIDIA Corporation'),
  ('AMZN',  'Amazon.com Inc.'),
  ('GOOGL', 'Alphabet Inc.'),
  ('META',  'Meta Platforms Inc.'),
  ('TSLA',  'Tesla Inc.'),
  ('NFLX',  'Netflix Inc.');
