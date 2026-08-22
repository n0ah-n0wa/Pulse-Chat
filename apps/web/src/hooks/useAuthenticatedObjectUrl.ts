import { useEffect, useState } from 'react';

import { fetchAuthenticatedObjectUrl } from '../lib/authenticated-media';

/** Loads a protected file with the access token and exposes a revocable object URL. */
export function useAuthenticatedObjectUrl(url: string | undefined): string | undefined {
  const [loaded, setLoaded] = useState<{ url: string; objectUrl: string } | undefined>(undefined);

  useEffect(() => {
    if (url === undefined || url.length === 0) {
      return;
    }

    const requestedUrl = url;
    let revoked = false;
    let created: string | undefined;

    void fetchAuthenticatedObjectUrl(requestedUrl)
      .then((next) => {
        if (revoked) {
          URL.revokeObjectURL(next);
          return;
        }

        created = next;
        setLoaded({ url: requestedUrl, objectUrl: next });
      })
      .catch(() => {
        if (!revoked) {
          setLoaded((current) => (current?.url === requestedUrl ? undefined : current));
        }
      });

    return () => {
      revoked = true;
      if (created !== undefined) {
        URL.revokeObjectURL(created);
      }
    };
  }, [url]);

  if (url === undefined || url.length === 0 || loaded?.url !== url) {
    return undefined;
  }

  return loaded.objectUrl;
}
