ALTER TABLE `song_pdf` ADD `is_notation` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `song_notation` ADD `pdf_url` text;--> statement-breakpoint
ALTER TABLE `song_notation` ADD `pdf_pathname` text;--> statement-breakpoint
ALTER TABLE `song_notation` ADD `pdf_status` text;