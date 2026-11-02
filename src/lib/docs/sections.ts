export const SECTION_IDS = ["mulai", "endpoint", "integrasi", "troubleshooting"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/** Anchor ids of the integration cards. The accordion item value is the id without the "tool-" prefix. */
export const TOOLS = [
  { id: "tool-9router", mark: "9R", name: "9Router" },
  { id: "tool-claude", mark: "CC", name: "Claude Code" },
  { id: "tool-codex", mark: "CX", name: "Codex CLI" },
  { id: "tool-opencode", mark: "OC", name: "OpenCode" },
  { id: "tool-cursor", mark: "CU", name: "Cursor" },
  { id: "tool-sdk", mark: "{}", name: "SDK & cURL" },
] as const;

/**
 * Scrollspy rule: the active section is the last one whose top edge has passed `offset`
 * (viewport pixels). `tops` is in document order. Before the first section passes, the first stays active.
 */
export function pickActiveSection<T extends string>(sections: readonly { id: T; top: number }[], offset: number): T | null {
  if (sections.length === 0) return null;
  let active = sections[0].id;
  for (const s of sections) if (s.top <= offset) active = s.id;
  return active;
}
