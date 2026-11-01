import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { Alibaba, Anthropic, DeepSeek, Google, Minimax, Moonshot, OpenAI, ZAI } from "./icons";

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string };

// Unknown providers fall back to an initial letter.
const ICONS: Record<string, ComponentType<IconProps>> = {
  openai: OpenAI,
  anthropic: Anthropic,
  google: Google,
  deepseek: DeepSeek,
  moonshot: Moonshot,
  zai: ZAI,
  minimax: Minimax,
  alibaba: Alibaba,
};

export function ProviderLogo({
  id,
  name,
  size = 20,
  className,
}: {
  id: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[id];
  if (!Icon) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size, fontSize: size * 0.6 }}
        className={cn("inline-flex items-center justify-center rounded-full bg-line font-medium", className)}
      >
        {name.charAt(0)}
      </span>
    );
  }
  return <Icon size={size} aria-hidden className={cn("shrink-0", className)} />;
}
