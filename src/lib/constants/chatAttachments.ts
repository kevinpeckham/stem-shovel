/**
 * Files on chat messages (docs/chat.md, "Attachments"): how many one
 * message may carry, and how long an uploaded file nobody sent waits
 * before its uploader's next upload removes it (a day).
 */
export const MAX_CHAT_ATTACHMENTS = 10;
export const CHAT_ATTACHMENT_STALE_MS = 24 * 60 * 60 * 1000;
