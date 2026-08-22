import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UnreadBadge } from './UnreadBadge';

describe('UnreadBadge', () => {
  it('hides when there are no unread messages', () => {
    const { container } = render(<UnreadBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the count and caps large values', () => {
    const { rerender } = render(<UnreadBadge count={3} />);
    expect(screen.getByLabelText('3 unread messages')).toHaveTextContent('3');

    rerender(<UnreadBadge count={120} />);
    expect(screen.getByLabelText('99+ unread messages')).toHaveTextContent('99+');
  });
});
