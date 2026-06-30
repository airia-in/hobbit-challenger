import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QueryErrorState } from '../src/components/common/QueryErrorState';

describe('QueryErrorState', () => {
  it('renders default message when no message prop is provided', () => {
    render(<QueryErrorState />);

    expect(
      screen.getByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
  });

  it('renders custom message and Retry calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<QueryErrorState message="Network error" onRetry={onRetry} />);

    expect(screen.getByText('Network error')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
