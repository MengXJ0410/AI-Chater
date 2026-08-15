-- Upgrade the original one-config-per-user tables without rewriting encrypted
-- credential payloads. UUID() is evaluated by MySQL for every existing row.
ALTER TABLE `user_ai_configs` DROP FOREIGN KEY `user_ai_configs_user_id_users_id_fk`;--> statement-breakpoint
ALTER TABLE `user_ai_configs` ADD COLUMN `id` varchar(36);--> statement-breakpoint
UPDATE `user_ai_configs` SET `id` = UUID() WHERE `id` IS NULL;--> statement-breakpoint
ALTER TABLE `user_ai_configs` MODIFY COLUMN `id` varchar(36) NOT NULL, DROP PRIMARY KEY, ADD PRIMARY KEY (`id`), ADD COLUMN `connection_preset_id` varchar(64), ADD INDEX `user_ai_configs_user_updated_idx` (`user_id`,`updated_at`);--> statement-breakpoint
UPDATE `user_ai_configs` SET `name` = '我的对话配置' WHERE `name` IS NULL OR TRIM(`name`) = '';--> statement-breakpoint
ALTER TABLE `user_ai_configs` MODIFY COLUMN `name` varchar(80) NOT NULL, ADD CONSTRAINT `user_ai_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade;--> statement-breakpoint

ALTER TABLE `user_image_configs` DROP FOREIGN KEY `user_image_configs_user_id_users_id_fk`;--> statement-breakpoint
ALTER TABLE `user_image_configs` ADD COLUMN `id` varchar(36);--> statement-breakpoint
UPDATE `user_image_configs` SET `id` = UUID() WHERE `id` IS NULL;--> statement-breakpoint
ALTER TABLE `user_image_configs` MODIFY COLUMN `id` varchar(36) NOT NULL, DROP PRIMARY KEY, ADD PRIMARY KEY (`id`), ADD INDEX `user_image_configs_user_updated_idx` (`user_id`,`updated_at`), ADD CONSTRAINT `user_image_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade;--> statement-breakpoint

ALTER TABLE `image_generations` ADD COLUMN `image_config_id` varchar(36), ADD INDEX `image_generations_config_status_idx` (`image_config_id`,`status`), ADD CONSTRAINT `image_generations_image_config_id_user_image_configs_id_fk` FOREIGN KEY (`image_config_id`) REFERENCES `user_image_configs`(`id`) ON DELETE SET NULL;--> statement-breakpoint
UPDATE `image_generations` AS generations INNER JOIN `user_image_configs` AS configs ON configs.`user_id` = generations.`user_id` SET generations.`image_config_id` = configs.`id` WHERE generations.`image_preset_id` = 'user-image-config';--> statement-breakpoint

CREATE TABLE `model_config_audit_events` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `config_id` varchar(36),
  `kind` enum('chat','image') NOT NULL,
  `action` enum('created','updated','deleted','tested','generation_requested','generation_completed','generation_failed','generation_cancelled','rate_limited') NOT NULL,
  `outcome` enum('success','failed','rejected') NOT NULL,
  `provider` varchar(32), `model` varchar(160), `runtime_preset_id` varchar(64),
  `request_id` varchar(64), `error_code` varchar(64),
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `model_config_audit_events_id` PRIMARY KEY (`id`),
  CONSTRAINT `model_config_audit_events_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `model_config_audit_user_created_idx` ON `model_config_audit_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `model_config_audit_config_created_idx` ON `model_config_audit_events` (`config_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limit_states` (
  `user_id` varchar(36) NOT NULL, `scope` enum('config_mutation','chat_test','image_test','image_generation') NOT NULL,
  `window_started_at` datetime NOT NULL, `count` int unsigned NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `rate_limit_user_scope_unique` UNIQUE (`user_id`,`scope`),
  CONSTRAINT `rate_limit_states_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
