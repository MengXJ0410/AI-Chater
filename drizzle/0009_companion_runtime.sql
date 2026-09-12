ALTER TABLE `conversations`
  ADD COLUMN `kind` enum('chat','companion') NOT NULL DEFAULT 'chat',
  ADD INDEX `conversations_user_kind_updated_idx` (`user_id`,`kind`,`updated_at`);--> statement-breakpoint

CREATE TABLE `companion_launch_tickets` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `nonce` varchar(64) NOT NULL,
  `target` varchar(120) NOT NULL,
  `expires_at` datetime NOT NULL,
  `consumed_at` datetime,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `companion_launch_tickets_id` PRIMARY KEY (`id`),
  CONSTRAINT `companion_launch_tickets_token_hash_unique` UNIQUE (`token_hash`),
  CONSTRAINT `companion_launch_tickets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  CONSTRAINT `companion_launch_tickets_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `companion_launch_user_expires_idx` ON `companion_launch_tickets` (`user_id`,`expires_at`);--> statement-breakpoint

CREATE TABLE `companion_runtime_tokens` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `session_id` varchar(36) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `companion_runtime_tokens_id` PRIMARY KEY (`id`),
  CONSTRAINT `companion_runtime_tokens_token_hash_unique` UNIQUE (`token_hash`),
  CONSTRAINT `companion_runtime_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  CONSTRAINT `companion_runtime_tokens_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `companion_runtime_user_expires_idx` ON `companion_runtime_tokens` (`user_id`,`expires_at`);
