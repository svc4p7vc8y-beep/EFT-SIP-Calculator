CREATE TABLE IF NOT EXISTS eft_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(80) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','manager','estimator','viewer') NOT NULL DEFAULT 'manager',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_eft_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eft_projects (
  id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status ENUM('new','calculation','approval','completed','archived') NOT NULL DEFAULT 'new',
  owner_id BIGINT UNSIGNED NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  payload LONGTEXT NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eft_projects_updated (updated_at),
  KEY idx_eft_projects_status (status),
  CONSTRAINT fk_eft_projects_owner FOREIGN KEY (owner_id) REFERENCES eft_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_eft_projects_created FOREIGN KEY (created_by) REFERENCES eft_users(id),
  CONSTRAINT fk_eft_projects_updated FOREIGN KEY (updated_by) REFERENCES eft_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eft_project_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id CHAR(36) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  payload LONGTEXT NOT NULL,
  saved_by BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(120) NOT NULL DEFAULT 'autosave',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_eft_project_revision (project_id, revision),
  KEY idx_eft_versions_created (project_id, created_at),
  CONSTRAINT fk_eft_versions_project FOREIGN KEY (project_id) REFERENCES eft_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_eft_versions_user FOREIGN KEY (saved_by) REFERENCES eft_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eft_questionnaires (
  id CHAR(36) NOT NULL,
  public_number VARCHAR(32) NOT NULL,
  status ENUM('new','reviewed','imported','archived') NOT NULL DEFAULT 'new',
  customer_name VARCHAR(180) NOT NULL DEFAULT '',
  phone VARCHAR(80) NOT NULL DEFAULT '',
  email VARCHAR(190) NOT NULL DEFAULT '',
  payload LONGTEXT NOT NULL,
  source_ip_hash CHAR(64) NOT NULL,
  consent_at DATETIME NULL,
  imported_project_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_eft_questionnaire_number (public_number),
  KEY idx_eft_questionnaires_status (status, created_at),
  CONSTRAINT fk_eft_questionnaire_project FOREIGN KEY (imported_project_id) REFERENCES eft_projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eft_shared_documents (
  document_key VARCHAR(80) NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  payload LONGTEXT NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_key),
  CONSTRAINT fk_eft_shared_user FOREIGN KEY (updated_by) REFERENCES eft_users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS eft_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action_name VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NOT NULL DEFAULT '',
  details LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eft_audit_created (created_at),
  KEY idx_eft_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_eft_audit_user FOREIGN KEY (user_id) REFERENCES eft_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
