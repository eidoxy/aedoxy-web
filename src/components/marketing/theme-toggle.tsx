"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Flips the `dark` class set by the inline script in the root layout. Both icons render; CSS picks one. */
export function ThemeToggle() {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Storage can be blocked; the choice then lasts for this page view only.
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      aria-label="Ganti tema terang atau gelap"
      className="size-10 bg-surface p-0"
    >
      <Sun className="hidden size-[18px] dark:block" aria-hidden />
      <Moon className="size-[18px] dark:hidden" aria-hidden />
    </Button>
  );
}
