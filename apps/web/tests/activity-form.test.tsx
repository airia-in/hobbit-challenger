import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityForm } from '../src/components/activities/ActivityForm';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ActivityForm', () => {
  it('shows checkbox XP fields by default and number fields after kind switch', async () => {
    render(<ActivityForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/xp on complete/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/xp on miss/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/unit label/i)).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText(/input type/i),
      'NUMBER',
    );

    expect(screen.getByLabelText(/unit label/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/xp per unit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/xp cap/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/miss xp/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/xp on complete/i)).not.toBeInTheDocument();
  });

  it('blocks submit and shows validation errors for invalid checkbox input', async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm onSubmit={onSubmit} />);

    const titleInput = screen.getByLabelText(/^title$/i);
    await userEvent.clear(titleInput);

    const xpMissInput = screen.getByLabelText(/xp on miss/i);
    await userEvent.clear(xpMissInput);
    await userEvent.type(xpMissInput, '50');

    await userEvent.click(
      screen.getByRole('button', { name: /create activity/i }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
    const errorRegion = await screen.findByTestId('form-validation-errors');
    expect(errorRegion.textContent).toMatch(/too small/i);
    expect(errorRegion.textContent).toMatch(/too big|<=0/i);
  });

  it('submits checkbox payload with correct shape', async () => {
    const onSubmit = vi.fn();
    render(
      <ActivityForm
        onSubmit={onSubmit}
        initialValues={{
          title: 'Journal',
          emoji: '📝',
          xpComplete: '25',
          xpMiss: '-10',
          deductMultiplier: '3',
          sortOrder: '8',
        }}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /create activity/i }),
    );

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Journal',
      emoji: '📝',
      kind: 'CHECKBOX',
      xpComplete: 25,
      xpMiss: -10,
      deductMultiplier: 3,
      sortOrder: 8,
    });
  });

  it('submits number payload with correct shape', async () => {
    const onSubmit = vi.fn();
    render(<ActivityForm onSubmit={onSubmit} />);

    await userEvent.selectOptions(
      screen.getByLabelText(/input type/i),
      'NUMBER',
    );

    await userEvent.clear(screen.getByLabelText(/^title$/i));
    await userEvent.type(screen.getByLabelText(/^title$/i), 'Weight');
    await userEvent.type(screen.getByLabelText(/emoji/i), '⚖️');
    await userEvent.clear(screen.getByLabelText(/unit label/i));
    await userEvent.type(screen.getByLabelText(/unit label/i), 'kg');
    await userEvent.clear(screen.getByLabelText(/xp per unit/i));
    await userEvent.type(screen.getByLabelText(/xp per unit/i), '12.5');
    await userEvent.clear(screen.getByLabelText(/xp cap/i));
    await userEvent.type(screen.getByLabelText(/xp cap/i), '50');
    await userEvent.clear(screen.getByLabelText(/miss xp/i));
    await userEvent.type(screen.getByLabelText(/miss xp/i), '-20');

    await userEvent.click(
      screen.getByRole('button', { name: /create activity/i }),
    );

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Weight',
      emoji: '⚖️',
      kind: 'NUMBER',
      unitLabel: 'kg',
      xpPerUnit: 12.5,
      xpCap: 50,
      missXp: -20,
      deductMultiplier: 2,
    });
  });

  it('hides sort order and deduct multiplier when configured off', () => {
    render(
      <ActivityForm
        onSubmit={vi.fn()}
        showSortOrder={false}
        showDeductMultiplier={false}
      />,
    );

    expect(screen.queryByLabelText(/sort order/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/deduct multiplier/i),
    ).not.toBeInTheDocument();
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn();
    render(<ActivityForm onSubmit={vi.fn()} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
