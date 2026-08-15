ALTER TABLE `users` ADD `avatar_storage_key` varchar(80);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_mime_type` varchar(80);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_updated_at` datetime;