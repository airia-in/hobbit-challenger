import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-semibold uppercase tracking-wider transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-red)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'rounded-full border border-transparent bg-[var(--accent-red)] text-[var(--text-on-accent)] text-sm shadow-[0_16px_40px_rgba(230,51,41,0.18)] hover:-translate-y-0.5 hover:bg-[var(--accent-red-hover)]',
        outline:
          'rounded border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] hover:border-[var(--accent-red)]',
        ghost:
          'border-transparent bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]',
        destructive:
          'rounded-full border border-transparent bg-[var(--accent-red)] text-[var(--text-on-accent)] text-sm shadow-[0_16px_40px_rgba(230,51,41,0.18)] hover:-translate-y-0.5 hover:bg-[var(--accent-red-hover)]',
      },
      size: {
        sm: 'h-9 px-4 text-xs tracking-wider',
        md: 'h-11 px-5 text-sm',
        lg: 'h-14 px-7 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
