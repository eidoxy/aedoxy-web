export function SectionHeading({ number, eyebrow, title, description }: { number: string; eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-8 sm:mb-10">
      <p className="eyebrow">
        <span className="mr-2 text-faint">{number}</span>
        {eyebrow}
      </p>
      <h2 className="mt-4 max-w-2xl text-[30px] leading-[1.1] font-medium tracking-[-0.035em] text-heading sm:text-[40px]">{title}</h2>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-fg-muted">{description}</p>
    </div>
  );
}
