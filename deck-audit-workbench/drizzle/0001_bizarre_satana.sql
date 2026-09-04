CREATE TABLE `deck_reports` (
	`deck_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'uploaded' NOT NULL,
	`stage` text DEFAULT '文件已接收' NOT NULL,
	`progress` integer DEFAULT 5 NOT NULL,
	`model` text DEFAULT 'gpt-5.6-terra' NOT NULL,
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
