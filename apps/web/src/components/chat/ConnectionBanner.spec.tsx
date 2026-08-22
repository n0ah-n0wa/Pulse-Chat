import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ConnectionBanner } from './ConnectionBanner';

describe('ConnectionBanner', () => {
  it('hides while connected and shows offline and reconnecting copy', () => {
    const { rerender } = render(<ConnectionBanner connectionState="connected" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<ConnectionBanner connectionState="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting...');

    rerender(<ConnectionBanner connectionState="disconnected" />);
    expect(screen.getByRole('status')).toHaveTextContent('You are offline');
  });
});
