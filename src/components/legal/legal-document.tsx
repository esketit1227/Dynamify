export type LegalSection = {
  heading: string;
  body: React.ReactNode;
  id?: string;
};

// The structural scaffold requested in docs' own launch-plan item ("routes,
// layout, and clearly marked placeholder copy — legal only has to supply
// words, not wait on engineering"). The DRAFT banner is not decorative —
// this content has not been through counsel, and a page like this reading
// as authoritative to a real visitor would be actively misleading. See
// docs/decisions.md D5, which flags exactly this class of legal question
// as unresolved.
export function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <div className="mx-auto max-w-[720px] px-6 py-16 sm:py-24">
      <div className="rounded-2xl border border-[#e7c88a] bg-[#fdf6e8] px-6 py-5 text-[14.5px] leading-[1.55] text-[#7a5b16]">
        <p className="font-bold tracking-[-.01em]">Draft — not final, not legal advice.</p>
        <p className="mt-1.5">
          This page is a structural placeholder: real section headings for what a {title.toLowerCase()} needs to
          cover, based on how Dynamify actually works today, with the legal language itself intentionally left
          unwritten. It has not been drafted or reviewed by a lawyer and is not a binding agreement. Do not rely
          on it as your actual {title.toLowerCase()} until qualified counsel has reviewed and replaced this
          content.
        </p>
      </div>

      <h1 className="mt-12 text-[clamp(32px,5vw,44px)] leading-[1.02] font-bold tracking-[-.045em] text-[#111014]">
        {title}
      </h1>
      <p className="mt-4 text-[16px] leading-[1.6] tracking-[-.01em] text-[#56545e]">{intro}</p>

      <div className="mt-12 flex flex-col gap-10">
        {sections.map((section) => (
          <section key={section.heading} id={section.id} className={section.id ? "scroll-mt-8" : undefined}>
            <h2 className="text-[19px] font-bold tracking-[-.025em] text-[#111014]">{section.heading}</h2>
            <div className="mt-2.5 text-[15px] leading-[1.65] tracking-[-.01em] text-[#56545e]">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
