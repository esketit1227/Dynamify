const LOGOS = ["Northwind", "Basalt", "Lumen", "Peregrine", "Ostro"];

export function LandingLogos() {
  return (
    <section className="relative z-[3] -mt-[2px] bg-[#fdfdfe] px-6 py-14">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-10">
        <div className="text-[11.5px] font-bold tracking-[-.01em] text-[#9d9ba4]">
          In use across a few hundred sites
        </div>
        {LOGOS.map((logo) => (
          <div key={logo} className="text-[21px] font-bold tracking-[-.04em] text-[#c3c1ca]">
            {logo}
          </div>
        ))}
      </div>
    </section>
  );
}
