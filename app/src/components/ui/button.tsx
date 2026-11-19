import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 active:translate-y-px',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:shadow-lift',
        destructive: 'bg-destructive text-destructive-foreground hover:-translate-y-0.5',
        outline: 'border bg-card hover:bg-secondary',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-muted',
        ghost: 'hover:bg-secondary',
        link: 'rounded-md px-2 underline-offset-4 hover:underline',
      },
      size: {
        default: 'min-h-11 px-5',
        sm: 'min-h-11 px-4 text-sm',
        lg: 'min-h-12 px-7',
        icon: 'size-11 min-w-11 p-0',
        'icon-sm': 'size-11 min-w-11 p-0',
        'icon-lg': 'size-12 min-w-12 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({ className, variant = 'default', size = 'default', asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
