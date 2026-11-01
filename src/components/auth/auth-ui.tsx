import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="w-full max-w-md rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.04),0_1px_2px_rgba(0,0,0,.02)] sm:p-8">
      <h1 className="text-3xl font-medium tracking-[-0.04em] text-heading">{title}</h1>
      {description && <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{description}</p>}
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 border-t border-line pt-5 text-sm text-fg-muted">{footer}</div>}
    </section>
  );
}

/** Same footprint as a card, so streaming a page in causes no layout shift. */
export function AuthCardFallback() {
  return <div aria-hidden className="h-[28rem] w-full max-w-md rounded-[18px] border border-line bg-surface" />;
}

type TextFieldProps = Omit<React.ComponentProps<typeof Input>, "id"> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

/** Label + input + reserved error line (fixed height, so validation never shifts the layout). */
export function TextField({ id, label, error, hint, className, ...props }: TextFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="mono-label mb-1.5 block">
        {label}
      </label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined}
        className={cn("h-11 bg-background text-base", className)}
        {...props}
      />
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-faint">
          {hint}
        </p>
      )}
      <p id={errorId} role={error ? "alert" : undefined} className="mt-1 min-h-4 text-xs text-danger">
        {error}
      </p>
    </div>
  );
}

/** Form-level message with a reserved line for errors. */
export function FormMessage({ tone, children }: { tone: "error" | "success"; children?: React.ReactNode }) {
  return (
    <p
      role={tone === "error" && children ? "alert" : undefined}
      aria-live={tone === "success" ? "polite" : undefined}
      className={cn("min-h-5 text-sm", tone === "error" ? "text-danger" : "text-success")}
    >
      {children}
    </p>
  );
}
