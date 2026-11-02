/** What the logo needs from the site settings. Plain data, so it can cross into client components. */
export type BrandInfo = {
  name: string;
  /** Only honoured while a custom logo exists: without one, the name is the only thing that identifies the site. */
  hideWordmark: boolean;
  logo: { src: string; width: number; height: number } | null;
};
