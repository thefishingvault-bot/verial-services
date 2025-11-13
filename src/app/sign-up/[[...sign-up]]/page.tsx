import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-verial-light p-4">
      <SignUp
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/dashboard"
        appearance={{
          baseTheme: undefined, // Use our default theme
          elements: {
            rootBox: 'w-full max-w-md',
            card: 'shadow-lg bg-card text-card-foreground border-border rounded-lg',
            headerTitle: 'text-2xl font-semibold',
            headerSubtitle: 'text-muted-foreground',
            socialButtonsBlock: 'space-y-2',
            socialButton: 'border border-border h-10',
            socialButtonIcon: 'h-4 w-4',
            dividerLine: 'bg-border',
            dividerText: 'text-muted-foreground text-sm',
            formFieldLabel: 'text-sm font-medium',
            formFieldInput: 'h-10 border-border bg-background focus:ring-primary focus:ring-1',
            formButtonPrimary: 'bg-primary text-primary-foreground h-10 hover:bg-primary/90',
            footerActionText: 'text-muted-foreground',
            footerActionLink: 'text-primary hover:text-primary/90 font-medium',
          },
        }}
      />
    </div>
  );
}

