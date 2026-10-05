CREATE TABLE `song_pdf` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`song_id` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`url` text NOT NULL,
	`pathname` text NOT NULL,
	`filename` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`page_count` integer,
	`thumbnail_url` text,
	`thumbnail_pathname` text,
	`share_code` text NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `song`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `song_pdf_pathname_unique` ON `song_pdf` (`pathname`);--> statement-breakpoint
CREATE UNIQUE INDEX `song_pdf_share_code_unique` ON `song_pdf` (`share_code`);--> statement-breakpoint
CREATE INDEX `song_pdf_song_idx` ON `song_pdf` (`song_id`);--> statement-breakpoint
CREATE INDEX `song_pdf_account_idx` ON `song_pdf` (`account_id`);--> statement-breakpoint
CREATE INDEX `song_pdf_uploaded_by_idx` ON `song_pdf` (`uploaded_by`);