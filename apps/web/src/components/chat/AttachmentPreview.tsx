import type { AttachmentResponse } from '@pulse-chat/shared';

import { useAuthenticatedObjectUrl } from '../../hooks/useAuthenticatedObjectUrl';

interface AttachmentPreviewProps {
  readonly attachments: readonly AttachmentResponse[];
}

function isImageAttachment(attachment: AttachmentResponse): boolean {
  return attachment.mimeType.startsWith('image/');
}

function AttachmentLink({ attachment }: { readonly attachment: AttachmentResponse }) {
  const objectUrl = useAuthenticatedObjectUrl(attachment.url);

  if (objectUrl === undefined) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">Loading {attachment.filename}…</p>
    );
  }

  if (isImageAttachment(attachment)) {
    return (
      <a
        href={objectUrl}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-md border border-slate-200 dark:border-slate-700"
      >
        <img
          src={objectUrl}
          alt={attachment.filename}
          className="max-h-48 max-w-full object-contain"
        />
      </a>
    );
  }

  return (
    <a
      href={objectUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      <span className="truncate font-medium">{attachment.filename}</span>
      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
        {attachment.mimeType}
      </span>
    </a>
  );
}

export function AttachmentPreview({ attachments }: AttachmentPreviewProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <ul className="mt-2 space-y-2" aria-label="Attachments">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <AttachmentLink attachment={attachment} />
        </li>
      ))}
    </ul>
  );
}
