/**
 * Docs copy. `{brand}` and `{envKey}` are placeholders filled by `fillDict`; `**bold**` and `` `code` `` are
 * rendered by FormattedText. Indonesian is the source text, English must keep the same keys and array lengths.
 */
export interface DocsDict {
  common: {
    copy: string;
    copied: string;
    copiedAnnounce: string;
    switchLanguage: string;
    showKey: string;
    hideKey: string;
  };
  nav: {
    rail: string;
    mobile: string;
    toolsHeading: string;
    main: Array<{ id: string; number: string; label: string }>;
  };
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    setupCta: string;
    integrationsCta: string;
  };
  start: {
    number: string;
    eyebrow: string;
    title: string;
    description: string;
    beforeTitle: string;
    before: Array<{ text: string; href: string; cta: string }>;
  };
  config: {
    title: string;
    description: string;
    gatewayLabel: string;
    gatewayHint: string;
    apiKeyLabel: string;
    apiKeyHint: string;
    modelLabel: string;
    modelHint: string;
  };
  endpoint: {
    number: string;
    eyebrow: string;
    title: string;
    description: string;
    openaiBadge: string;
    openaiEyebrow: string;
    openaiTitle: string;
    openaiDescription: string;
    anthropicBadge: string;
    anthropicEyebrow: string;
    anthropicTitle: string;
    anthropicDescription: string;
    warningTitle: string;
    warningDescription: string;
  };
  integrasi: {
    number: string;
    eyebrow: string;
    title: string;
    description: string;
    shortcuts: string;
    router: { description: string; protocol: string; intro: string; steps: string[]; note: string };
    claude: { description: string; protocol: string; intro: string; tabs: { windows: string; unix: string; json: string }; note: string };
    codex: { description: string; protocol: string; intro: string; note: string };
    opencode: { description: string; protocol: string; intro: string; note: string };
    cursor: { description: string; protocol: string; steps: string[]; warningTitle: string; warningDescription: string };
    sdk: { description: string; protocol: string };
  };
  troubleshooting: {
    number: string;
    eyebrow: string;
    title: string;
    description: string;
    items: Array<{ code: string; title: string; description: string; link: { label: string; href: string }[] }>;
    cta: { title: string; button: string };
  };
}
