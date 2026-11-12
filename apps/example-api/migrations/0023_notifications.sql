-- Notifications storage (ADR-0019, ADR-0020).
CREATE TABLE kit_notifications (
  id TEXT NOT NULL CHECK (id IS NULL OR (typeof(id) = 'text' AND instr(id, char(0)) = 0 AND length(id) BETWEEN 1 AND 256 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9._-]*')),
  org_id TEXT NOT NULL CHECK (org_id IS NULL OR (typeof(org_id) = 'text' AND instr(org_id, char(0)) = 0 AND length(org_id) BETWEEN 1 AND 256)),
  user_id TEXT NOT NULL CHECK (user_id IS NULL OR (typeof(user_id) = 'text' AND instr(user_id, char(0)) = 0 AND length(user_id) BETWEEN 1 AND 256)),
  type_key TEXT NOT NULL CHECK (type_key IS NULL OR (typeof(type_key) = 'text' AND instr(type_key, char(0)) = 0 AND length(type_key) BETWEEN 1 AND 128 AND substr(type_key,1,1) GLOB '[a-z]' AND type_key NOT GLOB '*[^a-z0-9._-]*')),
  source_kind TEXT NOT NULL CHECK (source_kind IS NULL OR (typeof(source_kind) = 'text' AND instr(source_kind, char(0)) = 0 AND length(source_kind) BETWEEN 1 AND 64)),
  source_id TEXT NOT NULL CHECK (source_id IS NULL OR (typeof(source_id) = 'text' AND instr(source_id, char(0)) = 0 AND length(source_id) BETWEEN 1 AND 1024)),
  params_json TEXT NOT NULL CHECK (json_valid(params_json)),
  module_id TEXT CHECK (module_id IS NULL OR (typeof(module_id) = 'text' AND instr(module_id, char(0)) = 0 AND length(module_id) BETWEEN 1 AND 256)),
  created_at INTEGER NOT NULL CHECK (created_at IS NULL OR (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991)),
  read_at INTEGER CHECK (read_at IS NULL OR (typeof(read_at) = 'integer' AND read_at BETWEEN 0 AND 9007199254740991)),
  resolved_at INTEGER CHECK (resolved_at IS NULL OR (typeof(resolved_at) = 'integer' AND resolved_at BETWEEN 0 AND 9007199254740991)),
  PRIMARY KEY (id),
  UNIQUE (id, org_id)
);
CREATE TABLE kit_notification_deliveries (
  id TEXT NOT NULL CHECK (id IS NULL OR (typeof(id) = 'text' AND instr(id, char(0)) = 0 AND length(id) BETWEEN 1 AND 256 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9._-]*')),
  org_id TEXT NOT NULL CHECK (org_id IS NULL OR (typeof(org_id) = 'text' AND instr(org_id, char(0)) = 0 AND length(org_id) BETWEEN 1 AND 256)),
  notification_id TEXT NOT NULL CHECK (notification_id IS NULL OR (typeof(notification_id) = 'text' AND instr(notification_id, char(0)) = 0 AND length(notification_id) BETWEEN 1 AND 256 AND substr(notification_id,1,1) GLOB '[A-Za-z0-9]' AND notification_id NOT GLOB '*[^A-Za-z0-9._-]*')),
  channel TEXT NOT NULL CHECK (channel IS NULL OR (typeof(channel) = 'text' AND instr(channel, char(0)) = 0 AND length(channel) BETWEEN 1 AND 64 AND substr(channel,1,1) GLOB '[a-z]' AND channel NOT GLOB '*[^a-z0-9._-]*')) CHECK (channel <> 'in_app'),
  status TEXT NOT NULL CHECK (status IN ('pending','sent','failed','skipped')),
  created_at INTEGER NOT NULL CHECK (created_at IS NULL OR (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991)),
  workflow_id TEXT NOT NULL UNIQUE CHECK (length(workflow_id) = 70 AND instr(workflow_id,char(0)) = 0 AND substr(workflow_id,1,6) = 'nd-v1-' AND substr(workflow_id,7) NOT GLOB '*[^a-f0-9]*'),
  admission_status TEXT NOT NULL CHECK (admission_status IN ('pending','admitted','unknown','expired')),
  admission_deadline_at INTEGER NOT NULL CHECK (admission_deadline_at IS NULL OR (typeof(admission_deadline_at) = 'integer' AND admission_deadline_at BETWEEN 0 AND 9007199254740991)),
  admitted_at INTEGER CHECK (admitted_at IS NULL OR (typeof(admitted_at) = 'integer' AND admitted_at BETWEEN 0 AND 9007199254740991)),
  last_admission_check_at INTEGER CHECK (last_admission_check_at IS NULL OR (typeof(last_admission_check_at) = 'integer' AND last_admission_check_at BETWEEN 0 AND 9007199254740991)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(attempt_count) = 'integer' AND attempt_count BETWEEN 0 AND 9007199254740991),
  last_attempt_at INTEGER CHECK (last_attempt_at IS NULL OR (typeof(last_attempt_at) = 'integer' AND last_attempt_at BETWEEN 0 AND 9007199254740991)),
  error_code TEXT CHECK (error_code IS NULL OR (typeof(error_code) = 'text' AND instr(error_code, char(0)) = 0 AND length(error_code) BETWEEN 1 AND 256)),
  finished_at INTEGER CHECK (finished_at IS NULL OR (typeof(finished_at) = 'integer' AND finished_at BETWEEN 0 AND 9007199254740991)),
  CHECK (substr(id,1,2) = 'u_' AND length(id) > 2 AND substr(id,3,1) GLOB '[A-Za-z0-9]'),
  CHECK (created_at <= 9007199168340991 AND admission_deadline_at = created_at + 86400000),
  PRIMARY KEY (id),
  UNIQUE (org_id, notification_id, channel),
  FOREIGN KEY (notification_id, org_id) REFERENCES kit_notifications(id, org_id) ON DELETE CASCADE
);
CREATE TABLE kit_notification_organization_deliveries (
  id TEXT NOT NULL CHECK (id IS NULL OR (typeof(id) = 'text' AND instr(id, char(0)) = 0 AND length(id) BETWEEN 1 AND 256 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9._-]*')),
  org_id TEXT NOT NULL CHECK (org_id IS NULL OR (typeof(org_id) = 'text' AND instr(org_id, char(0)) = 0 AND length(org_id) BETWEEN 1 AND 256)),
  destination_id TEXT NOT NULL CHECK (destination_id IS NULL OR (typeof(destination_id) = 'text' AND instr(destination_id, char(0)) = 0 AND length(destination_id) BETWEEN 1 AND 256 AND substr(destination_id,1,1) GLOB '[A-Za-z0-9]' AND destination_id NOT GLOB '*[^A-Za-z0-9._-]*')),
  channel TEXT NOT NULL CHECK (channel IS NULL OR (typeof(channel) = 'text' AND instr(channel, char(0)) = 0 AND length(channel) BETWEEN 1 AND 64 AND substr(channel,1,1) GLOB '[a-z]' AND channel NOT GLOB '*[^a-z0-9._-]*')) CHECK (channel <> 'in_app'),
  type_key TEXT NOT NULL CHECK (type_key IS NULL OR (typeof(type_key) = 'text' AND instr(type_key, char(0)) = 0 AND length(type_key) BETWEEN 1 AND 128 AND substr(type_key,1,1) GLOB '[a-z]' AND type_key NOT GLOB '*[^a-z0-9._-]*')),
  source_kind TEXT NOT NULL CHECK (source_kind IS NULL OR (typeof(source_kind) = 'text' AND instr(source_kind, char(0)) = 0 AND length(source_kind) BETWEEN 1 AND 64)),
  source_id TEXT NOT NULL CHECK (source_id IS NULL OR (typeof(source_id) = 'text' AND instr(source_id, char(0)) = 0 AND length(source_id) BETWEEN 1 AND 1024)),
  params_json TEXT NOT NULL CHECK (json_valid(params_json)),
  module_id TEXT CHECK (module_id IS NULL OR (typeof(module_id) = 'text' AND instr(module_id, char(0)) = 0 AND length(module_id) BETWEEN 1 AND 256)),
  status TEXT NOT NULL CHECK (status IN ('pending','sent','failed','skipped')),
  created_at INTEGER NOT NULL CHECK (created_at IS NULL OR (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991)),
  resolved_at INTEGER CHECK (resolved_at IS NULL OR (typeof(resolved_at) = 'integer' AND resolved_at BETWEEN 0 AND 9007199254740991)),
  workflow_id TEXT NOT NULL UNIQUE CHECK (length(workflow_id) = 70 AND instr(workflow_id,char(0)) = 0 AND substr(workflow_id,1,6) = 'nd-v1-' AND substr(workflow_id,7) NOT GLOB '*[^a-f0-9]*'),
  admission_status TEXT NOT NULL CHECK (admission_status IN ('pending','admitted','unknown','expired')),
  admission_deadline_at INTEGER NOT NULL CHECK (admission_deadline_at IS NULL OR (typeof(admission_deadline_at) = 'integer' AND admission_deadline_at BETWEEN 0 AND 9007199254740991)),
  admitted_at INTEGER CHECK (admitted_at IS NULL OR (typeof(admitted_at) = 'integer' AND admitted_at BETWEEN 0 AND 9007199254740991)),
  last_admission_check_at INTEGER CHECK (last_admission_check_at IS NULL OR (typeof(last_admission_check_at) = 'integer' AND last_admission_check_at BETWEEN 0 AND 9007199254740991)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (typeof(attempt_count) = 'integer' AND attempt_count BETWEEN 0 AND 9007199254740991),
  last_attempt_at INTEGER CHECK (last_attempt_at IS NULL OR (typeof(last_attempt_at) = 'integer' AND last_attempt_at BETWEEN 0 AND 9007199254740991)),
  error_code TEXT CHECK (error_code IS NULL OR (typeof(error_code) = 'text' AND instr(error_code, char(0)) = 0 AND length(error_code) BETWEEN 1 AND 256)),
  finished_at INTEGER CHECK (finished_at IS NULL OR (typeof(finished_at) = 'integer' AND finished_at BETWEEN 0 AND 9007199254740991)),
  CHECK (substr(id,1,2) = 'o_' AND length(id) > 2 AND substr(id,3,1) GLOB '[A-Za-z0-9]'),
  CHECK (created_at <= 9007199168340991 AND admission_deadline_at = created_at + 86400000),
  PRIMARY KEY (id)
);
CREATE TABLE kit_notification_destinations (
  id TEXT NOT NULL CHECK (id IS NULL OR (typeof(id) = 'text' AND instr(id, char(0)) = 0 AND length(id) BETWEEN 1 AND 256 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9._-]*')),
  org_id TEXT NOT NULL CHECK (org_id IS NULL OR (typeof(org_id) = 'text' AND instr(org_id, char(0)) = 0 AND length(org_id) BETWEEN 1 AND 256)),
  channel TEXT NOT NULL CHECK (channel IS NULL OR (typeof(channel) = 'text' AND instr(channel, char(0)) = 0 AND length(channel) BETWEEN 1 AND 64 AND substr(channel,1,1) GLOB '[a-z]' AND channel NOT GLOB '*[^a-z0-9._-]*')) CHECK (channel <> 'in_app'),
  external_id TEXT NOT NULL CHECK (external_id IS NULL OR (typeof(external_id) = 'text' AND instr(external_id, char(0)) = 0 AND length(external_id) BETWEEN 1 AND 1024)),
  selector_kind TEXT NOT NULL CHECK (selector_kind IN ('all','type','category')),
  selector_value TEXT NOT NULL CHECK (selector_value IS NULL OR (typeof(selector_value) = 'text' AND instr(selector_value, char(0)) = 0 AND length(selector_value) BETWEEN 1 AND 128 AND (selector_value = '*' OR substr(selector_value,1,1) GLOB '[a-z]') AND (selector_value = '*' OR selector_value NOT GLOB '*[^a-z0-9._-]*'))),
  created_at INTEGER NOT NULL CHECK (created_at IS NULL OR (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991)),
  updated_at INTEGER NOT NULL CHECK (updated_at IS NULL OR (typeof(updated_at) = 'integer' AND updated_at BETWEEN 0 AND 9007199254740991)),
  CHECK ((selector_kind = 'all' AND selector_value = '*') OR (selector_kind IN ('type','category') AND selector_value <> '*')),
  PRIMARY KEY (id),
  UNIQUE (id, org_id),
  UNIQUE (org_id, channel, external_id)
);
CREATE TABLE kit_notification_deployment_rules (
  id TEXT NOT NULL CHECK (id IS NULL OR (typeof(id) = 'text' AND instr(id, char(0)) = 0 AND length(id) BETWEEN 1 AND 256 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9._-]*')),
  selector_kind TEXT NOT NULL CHECK (selector_kind IN ('all','type','category')),
  selector_value TEXT NOT NULL CHECK (selector_value IS NULL OR (typeof(selector_value) = 'text' AND instr(selector_value, char(0)) = 0 AND length(selector_value) BETWEEN 1 AND 128 AND (selector_value = '*' OR substr(selector_value,1,1) GLOB '[a-z]') AND (selector_value = '*' OR selector_value NOT GLOB '*[^a-z0-9._-]*'))),
  channel TEXT NOT NULL CHECK (channel IS NULL OR (typeof(channel) = 'text' AND instr(channel, char(0)) = 0 AND length(channel) BETWEEN 1 AND 64 AND substr(channel,1,1) GLOB '[a-z]' AND channel NOT GLOB '*[^a-z0-9._-]*')) CHECK (channel <> 'in_app'),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  locked INTEGER NOT NULL CHECK (locked IN (0,1)),
  created_at INTEGER NOT NULL CHECK (created_at IS NULL OR (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991)),
  updated_at INTEGER NOT NULL CHECK (updated_at IS NULL OR (typeof(updated_at) = 'integer' AND updated_at BETWEEN 0 AND 9007199254740991)),
  CHECK ((selector_kind = 'all' AND selector_value = '*') OR (selector_kind IN ('type','category') AND selector_value <> '*')),
  CHECK (NOT (channel = 'email' AND enabled = 1 AND locked = 1)),
  PRIMARY KEY (id),
  UNIQUE (selector_kind, selector_value, channel)
);
CREATE TABLE kit_notification_organization_rules (
  id TEXT NOT NULL CHECK (id IS NULL OR (typeof(id) = 'text' AND instr(id, char(0)) = 0 AND length(id) BETWEEN 1 AND 256 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9._-]*')),
  org_id TEXT NOT NULL CHECK (org_id IS NULL OR (typeof(org_id) = 'text' AND instr(org_id, char(0)) = 0 AND length(org_id) BETWEEN 1 AND 256)),
  selector_kind TEXT NOT NULL CHECK (selector_kind IN ('all','type','category')),
  selector_value TEXT NOT NULL CHECK (selector_value IS NULL OR (typeof(selector_value) = 'text' AND instr(selector_value, char(0)) = 0 AND length(selector_value) BETWEEN 1 AND 128 AND (selector_value = '*' OR substr(selector_value,1,1) GLOB '[a-z]') AND (selector_value = '*' OR selector_value NOT GLOB '*[^a-z0-9._-]*'))),
  channel TEXT NOT NULL CHECK (channel IS NULL OR (typeof(channel) = 'text' AND instr(channel, char(0)) = 0 AND length(channel) BETWEEN 1 AND 64 AND substr(channel,1,1) GLOB '[a-z]' AND channel NOT GLOB '*[^a-z0-9._-]*')) CHECK (channel <> 'in_app'),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  locked INTEGER NOT NULL CHECK (locked IN (0,1)),
  created_at INTEGER NOT NULL CHECK (created_at IS NULL OR (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991)),
  updated_at INTEGER NOT NULL CHECK (updated_at IS NULL OR (typeof(updated_at) = 'integer' AND updated_at BETWEEN 0 AND 9007199254740991)),
  CHECK ((selector_kind = 'all' AND selector_value = '*') OR (selector_kind IN ('type','category') AND selector_value <> '*')),
  CHECK (NOT (channel = 'email' AND enabled = 1 AND locked = 1)),
  PRIMARY KEY (id),
  UNIQUE (org_id, selector_kind, selector_value, channel)
);
CREATE TABLE kit_notification_user_rules (
  id TEXT NOT NULL CHECK (id IS NULL OR (typeof(id) = 'text' AND instr(id, char(0)) = 0 AND length(id) BETWEEN 1 AND 256 AND substr(id,1,1) GLOB '[A-Za-z0-9]' AND id NOT GLOB '*[^A-Za-z0-9._-]*')),
  user_id TEXT NOT NULL CHECK (user_id IS NULL OR (typeof(user_id) = 'text' AND instr(user_id, char(0)) = 0 AND length(user_id) BETWEEN 1 AND 256)),
  selector_kind TEXT NOT NULL CHECK (selector_kind IN ('all','type','category')),
  selector_value TEXT NOT NULL CHECK (selector_value IS NULL OR (typeof(selector_value) = 'text' AND instr(selector_value, char(0)) = 0 AND length(selector_value) BETWEEN 1 AND 128 AND (selector_value = '*' OR substr(selector_value,1,1) GLOB '[a-z]') AND (selector_value = '*' OR selector_value NOT GLOB '*[^a-z0-9._-]*'))),
  channel TEXT NOT NULL CHECK (channel IS NULL OR (typeof(channel) = 'text' AND instr(channel, char(0)) = 0 AND length(channel) BETWEEN 1 AND 64 AND substr(channel,1,1) GLOB '[a-z]' AND channel NOT GLOB '*[^a-z0-9._-]*')) CHECK (channel <> 'in_app'),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  locked INTEGER NOT NULL CHECK (locked IN (0,1)),
  created_at INTEGER NOT NULL CHECK (created_at IS NULL OR (typeof(created_at) = 'integer' AND created_at BETWEEN 0 AND 9007199254740991)),
  updated_at INTEGER NOT NULL CHECK (updated_at IS NULL OR (typeof(updated_at) = 'integer' AND updated_at BETWEEN 0 AND 9007199254740991)),
  CHECK ((selector_kind = 'all' AND selector_value = '*') OR (selector_kind IN ('type','category') AND selector_value <> '*')),
  CHECK (NOT (channel = 'email' AND enabled = 1 AND locked = 1)),
  CHECK (locked = 0),
  PRIMARY KEY (id),
  UNIQUE (user_id, selector_kind, selector_value, channel)
);
CREATE UNIQUE INDEX kit_notifications_active_unique ON kit_notifications(org_id,type_key,source_kind,source_id,user_id) WHERE resolved_at IS NULL;
CREATE INDEX kit_notifications_inbox ON kit_notifications(org_id,user_id,created_at DESC,id DESC);
CREATE INDEX kit_notifications_source ON kit_notifications(org_id,source_kind,source_id);
CREATE UNIQUE INDEX kit_notification_org_deliveries_active_unique ON kit_notification_organization_deliveries(org_id,destination_id,channel,type_key,source_kind,source_id) WHERE resolved_at IS NULL;
CREATE INDEX kit_notification_org_deliveries_source ON kit_notification_organization_deliveries(org_id,source_kind,source_id);
CREATE INDEX kit_notification_deliveries_status_date ON kit_notification_deliveries(org_id,status,created_at);
CREATE INDEX kit_notification_deliveries_admission ON kit_notification_deliveries(org_id,admission_status,admission_deadline_at);
CREATE INDEX kit_notification_deliveries_finished ON kit_notification_deliveries(org_id,finished_at);
CREATE INDEX kit_notification_organization_deliveries_status_date ON kit_notification_organization_deliveries(org_id,status,created_at);
CREATE INDEX kit_notification_organization_deliveries_admission ON kit_notification_organization_deliveries(org_id,admission_status,admission_deadline_at);
CREATE INDEX kit_notification_organization_deliveries_finished ON kit_notification_organization_deliveries(org_id,finished_at);
