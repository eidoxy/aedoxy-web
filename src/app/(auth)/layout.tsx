import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <Logo className="mb-8" />
      {children}
    </main>
  );
}
