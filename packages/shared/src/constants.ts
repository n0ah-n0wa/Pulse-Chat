/**
 * Values that both the frontend and the backend must agree on.
 *
 * The backend is the only authority for validation, but the frontend needs the
 * same numbers to give immediate feedback, so they live here instead of being
 * duplicated. Every value is taken directly from SPECIFICATION.md.
 */

/** Product name, used in page titles, API metadata and logs. */
export const APP_NAME = 'Pulse Chat';

/** Maximum length of a chat message, in characters (specification section 13). */
export const MESSAGE_MAX_LENGTH = 4000;

/** Default page size for cursor-paginated message history (section 20). */
export const MESSAGE_PAGE_SIZE_DEFAULT = 50;

/** Largest page size a client may request for message history (section 20). */
export const MESSAGE_PAGE_SIZE_MAX = 100;

/** Maximum length of a room message search query, in characters (section 19). */
export const MESSAGE_SEARCH_QUERY_MAX_LENGTH = 200;

/** Maximum length of a user or room directory search query. */
export const DIRECTORY_SEARCH_QUERY_MAX_LENGTH = 64;

/** Default page size for directory search (users). */
export const DIRECTORY_SEARCH_LIMIT_DEFAULT = 20;

/** Largest page size a client may request for directory search. */
export const DIRECTORY_SEARCH_LIMIT_MAX = 50;

/** Maximum attachments a single message may reference (section 18). */
export const MESSAGE_MAX_ATTACHMENTS = 10;

/** Username length bounds (section 7). */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

/** Milliseconds of inactivity after which a typing indicator expires (section 28). */
export const TYPING_TIMEOUT_MS = 1500;

/** Maximum attachment size in bytes — 10 MiB (specification section 18). */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Maximum length of a sanitized attachment filename, in characters (section 18). */
export const ATTACHMENT_FILENAME_MAX_LENGTH = 255;
