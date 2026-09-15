PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_deck_reports` (
	`deck_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'uploaded' NOT NULL,
	`stage` text DEFAULT '文件已接收' NOT NULL,
	`progress` integer DEFAULT 5 NOT NULL,
	`model` text DEFAULT 'claude-sonnet-5' NOT NULL,
	`provider` text DEFAULT 'anthropic' NOT NULL,
	`provider_file_id` text,
	`provider_job_id` text,
	`openai_file_id` text,
	`response_id` text,
	`report_json_key` text,
	`markdown_key` text,
	`pptx_key` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
INSERT INTO `__new_deck_reports`("deck_id", "state", "stage", "progress", "model", "provider", "provider_file_id", "provider_job_id", "openai_file_id", "response_id", "report_json_key", "markdown_key", "pptx_key", "error_message", "created_at", "updated_at", "completed_at") SELECT "deck_id", "state", "stage", "progress", 'claude-sonnet-5', 'anthropic', NULL, NULL, "openai_file_id", "response_id", "report_json_key", "markdown_key", "pptx_key", "error_message", "created_at", "updated_at", "completed_at" FROM `deck_reports`;--> statement-breakpoint
DROP TABLE `deck_reports`;--> statement-breakpoint
ALTER TABLE `__new_deck_reports` RENAME TO `deck_reports`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
