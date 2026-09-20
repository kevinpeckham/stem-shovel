/** Images on an account, an artist or a song: what the browser sends after resizing, and what the server accepts. */
export const IMAGE_MAX_SIDE = 1024;
export const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
/** What a file picker offers; HEIC and the like are decoded by the browser before resizing. */
export const IMAGE_ACCEPT = "image/*";
