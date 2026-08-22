import type { InfiniteData } from '@tanstack/react-query';

import type { MessageListResponse, MessageResponse } from '@pulse-chat/shared';

import { isOptimisticMessage } from './message-utils';

export type MessagesInfiniteData = InfiniteData<MessageListResponse, string | undefined>;

/** Flattens cursor pages (newest-first) into chronological oldest→newest order. */
export function flattenMessagesChronological(
  data: MessagesInfiniteData | undefined,
): MessageResponse[] {
  if (data === undefined) {
    return [];
  }

  return data.pages
    .slice()
    .reverse()
    .flatMap((page) => page.items.slice().reverse());
}

export function hasMessageInPages(
  data: MessagesInfiniteData | undefined,
  message: Pick<MessageResponse, 'id' | 'clientMessageId'>,
): boolean {
  if (data === undefined) {
    return false;
  }

  return data.pages.some((page) =>
    page.items.some(
      (item) => item.id === message.id || item.clientMessageId === message.clientMessageId,
    ),
  );
}

function isSameMessage(
  item: Pick<MessageResponse, 'id' | 'clientMessageId'>,
  message: Pick<MessageResponse, 'id' | 'clientMessageId'>,
): boolean {
  return item.id === message.id || item.clientMessageId === message.clientMessageId;
}

function replaceMatchingItems(
  items: readonly MessageResponse[],
  message: MessageResponse,
): { readonly items: MessageResponse[]; readonly found: boolean } {
  let found = false;
  const next: MessageResponse[] = [];

  for (const item of items) {
    if (!isSameMessage(item, message)) {
      next.push(item);
      continue;
    }

    if (!found) {
      next.push(message);
      found = true;
    }
  }

  return { items: next, found };
}

export function upsertMessageInPages(
  data: MessagesInfiniteData | undefined,
  message: MessageResponse,
): MessagesInfiniteData | undefined {
  if (data === undefined || data.pages.length === 0) {
    return {
      pages: [{ items: [message] }],
      pageParams: [undefined],
    };
  }

  let found = false;
  const pages = data.pages.map((page) => {
    const replaced = replaceMatchingItems(page.items, message);
    if (!replaced.found) {
      return page;
    }

    found = true;
    return { ...page, items: replaced.items };
  });

  if (found) {
    return { ...data, pages };
  }

  const [first, ...rest] = pages;
  if (first === undefined) {
    return data;
  }

  return {
    ...data,
    pages: [{ ...first, items: [message, ...first.items] }, ...rest],
  };
}

export function mergePendingOptimisticMessages(
  fetched: MessagesInfiniteData | undefined,
  previous: MessagesInfiniteData | undefined,
): MessagesInfiniteData | undefined {
  if (previous === undefined) {
    return fetched;
  }

  if (fetched === undefined) {
    return previous;
  }

  const fetchedClientIds = new Set(
    flattenMessagesChronological(fetched).map((item) => item.clientMessageId),
  );
  let merged = fetched;

  for (const message of flattenMessagesChronological(previous)) {
    if (!isOptimisticMessage(message) || fetchedClientIds.has(message.clientMessageId)) {
      continue;
    }

    const next = upsertMessageInPages(merged, message);
    if (next !== undefined) {
      merged = next;
    }
  }

  return merged;
}

export function replaceMessageInPages(
  data: MessagesInfiniteData | undefined,
  message: MessageResponse,
): MessagesInfiniteData | undefined {
  if (data === undefined) {
    return data;
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === message.id || item.clientMessageId === message.clientMessageId ? message : item,
      ),
    })),
  };
}
