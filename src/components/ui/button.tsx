import { TextClassContext } from '@/src/components/ui/text';
import { cn } from '@/src/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { Platform, Pressable } from 'react-native';

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-md shadow-none',
    Platform.select({
      web: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive whitespace-nowrap outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
      default: 'min-h-11 min-w-11',
    }),
  ),
  {
    variants: {
      variant: {
        // Nightfall: tonal layers instead of outlines; one solid accent.
        default: cn('bg-primary active:bg-primary/90', Platform.select({ web: 'hover:bg-primary/90' })),
        destructive: cn('bg-destructive active:bg-destructive/90', Platform.select({ web: 'hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40' })),
        outline: cn('bg-card active:bg-raised', Platform.select({ web: 'hover:bg-raised' })),
        secondary: cn('bg-raised active:bg-overlay', Platform.select({ web: 'hover:bg-overlay' })),
        ghost: cn('active:bg-raised', Platform.select({ web: 'hover:bg-raised' })),
        link: '',
      },
      size: {
        default: cn(
          Platform.select({
            web: 'h-10 px-4 py-0 sm:h-9',
            default: 'h-11 px-4 py-0',
          }),
          Platform.select({ web: 'has-[>svg]:px-3' }),
        ),
        sm: cn(
          Platform.select({
            web: 'h-9 gap-1.5 rounded-md px-3 sm:h-8',
            default: 'h-11 gap-1.5 rounded-md px-3',
          }),
          Platform.select({ web: 'has-[>svg]:px-2.5' }),
        ),
        lg: cn(
          Platform.select({
            web: 'h-11 rounded-md px-6 sm:h-10',
            default: 'h-12 rounded-md px-6',
          }),
          Platform.select({ web: 'has-[>svg]:px-4' }),
        ),
        icon: Platform.select({
          web: 'h-10 w-10 sm:h-9 sm:w-9',
          default: 'h-11 w-11',
        }),
        content: '',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

const buttonTextVariants = cva('text-foreground text-[14.5px] font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      destructive: 'text-destructive-foreground',
      outline: '',
      secondary: 'text-secondary-foreground',
      ghost: '',
      link: cn('text-primary group-active:underline', Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' })),
    },
    size: { default: '', sm: '', lg: '', icon: '', content: '' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type ButtonProps = React.ComponentProps<typeof Pressable> & React.RefAttributes<typeof Pressable> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(props.disabled && 'opacity-50', buttonVariants({ variant, size }), className)}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
