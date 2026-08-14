CREATE TABLE `user_ai_configs` (
	`user_id` varchar(36) NOT NULL,
	`provider` enum('openai','openai-compatible','xai','anthropic','google') NOT NULL,
	`base_url` varchar(512),
	`model` varchar(160) NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`api_key_iv` varchar(32) NOT NULL,
	`api_key_auth_tag` varchar(32) NOT NULL,
	`encryption_key_id` varchar(64) NOT NULL,
	`api_key_last4` varchar(4) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_ai_configs_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `user_ai_configs` ADD CONSTRAINT `user_ai_configs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;