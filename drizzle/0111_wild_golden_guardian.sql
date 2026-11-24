ALTER TABLE `drum_kit` ADD `multisampled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `drum_sample` ADD `layer` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `drum_sample` ADD `rr` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `drum_sample` ADD `loudness` real;