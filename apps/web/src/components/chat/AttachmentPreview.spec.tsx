import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachmentPreview } from './AttachmentPreview';
import { useAuthStore } from '../../store/auth-store';

function okFileResponse(): Response {
  return {
    ok: true,
    status: 200,
    blob: () => Promise.resolve(new Blob()),
  } as Response;
}

describe('AttachmentPreview', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: null,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okFileResponse());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('loads image attachments with an authenticated object URL', async () => {
    render(
      <AttachmentPreview
        attachments={[
          {
            id: '507f1f77bcf86cd799439071',
            filename: 'photo.png',
            mimeType: 'image/png',
            sizeBytes: 12,
            url: '/api/files/photo.png',
            createdAt: '2026-08-18T00:00:00.000Z',
          },
        ]}
      />,
    );

    const image = await screen.findByRole('img', { name: 'photo.png' });
    expect(image).toHaveAttribute('src', 'blob:preview');

    expect(globalThis.fetch).toHaveBeenCalled();
    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token');
  });

  it('does not expose the unauthenticated file URL on download links', async () => {
    render(
      <AttachmentPreview
        attachments={[
          {
            id: '507f1f77bcf86cd799439072',
            filename: 'notes.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 24,
            url: '/api/files/notes.pdf',
            createdAt: '2026-08-18T00:00:00.000Z',
          },
        ]}
      />,
    );

    const link = await screen.findByRole('link', { name: /notes\.pdf/i });
    expect(link).toHaveAttribute('href', 'blob:preview');
    expect(link).not.toHaveAttribute('href', '/api/files/notes.pdf');
  });
});
