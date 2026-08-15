CREATE TABLE `image_generations` (
	`id` varchar(36) NOT NULL,
	`request_id` varchar(36) NOT NULL,
	`request_hash` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`conversation_id` varchar(36) NOT NULL,
	`user_message_id` varchar(36) NOT NULL,
	`assistant_message_id` varchar(36),
	`image_preset_id` varchar(64) NOT NULL,
	`provider` enum('xai-compatible','openai-compatible') NOT NULL,
	`model` varchar(160) NOT NULL,
	`prompt` text NOT NULL,
	`aspect_ratio` varchar(16) NOT NULL,
	`resolution` enum('1k','2k') NOT NULL,
	`quality` enum('low','medium','high') NOT NULL,
	`source` enum('image-mode') NOT NULL,
	`status` enum('queued','running','cancel_requested','completed','failed','cancelled') NOT NULL,
	`error_code` varchar(64),
	`started_at` datetime,
	`completed_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `image_generations_id` PRIMARY KEY(`id`),
	CONSTRAINT `image_generations_user_request_unique` UNIQUE(`user_id`,`request_id`)
);
--> statement-breakpoint
CREATE TABLE `user_image_configs` (
	`user_id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`provider` enum('xai-compatible','openai-compatible') NOT NULL,
	`base_url` varchar(512) NOT NULL,
	`model` varchar(160) NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`api_key_iv` varchar(32) NOT NULL,
	`api_key_auth_tag` varchar(32) NOT NULL,
	`encryption_key_id` varchar(64) NOT NULL,
	`api_key_last4` varchar(4) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_image_configs_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD `generation_id` varchar(36);--> statement-breakpoint
ALTER TABLE `attachments` ADD `origin` enum('upload','generated') DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `image_generations` ADD CONSTRAINT `image_generations_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `image_generations` ADD CONSTRAINT `image_generations_conversation_id_conversations_id_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `image_generations` ADD CONSTRAINT `image_generations_user_message_id_messages_id_fk` FOREIGN KEY (`user_message_id`) REFERENCES `messages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_image_configs` ADD CONSTRAINT `user_image_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `image_generations_user_created_idx` ON `image_generations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `image_generations_queue_idx` ON `image_generations` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `attachments_generation_id_idx` ON `attachments` (`generation_id`);