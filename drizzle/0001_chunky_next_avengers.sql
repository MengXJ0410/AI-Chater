ALTER TABLE `users` MODIFY COLUMN `username` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` datetime;