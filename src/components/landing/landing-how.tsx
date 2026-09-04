import { Reveal } from "@/components/landing/reveal";

type Step = {
  label: string;
  d: string;
};

const STEPS: Step[] = [
  { label: "Understand the site", d: "Crawls it and builds a real model of what it sells and who it's for." },
  { label: "Read the visitor", d: "Source, campaign, device, intent — recomputed on every visit." },
  { label: "Personalize", d: "Matches the visitor to the right message, inside your own components." },
  { label: "Serve it live", d: "Same site, same URL, same layout. Only the wording moves." },
  { label: "Measure & improve", d: "Checked against a holdout. What doesn't win rolls back on its own." },
];

const RING_R = 37; // percent
const LABEL_R = 46; // percent

function stepPosition(i: number) {
  const angle = ((-90 + i * (360 / STEPS.length)) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    nodeLeft: 50 + RING_R * cos,
    nodeTop: 50 + RING_R * sin,
    labelLeft: 50 + LABEL_R * cos,
    labelTop: 50 + LABEL_R * sin,
    side: cos > 0.3 ? "right" : cos < -0.3 ? "left" : "center",
  } as const;
}

export function LandingHow() {
  return (
    <section id="how" className="px-6 pt-5 pb-20 md:pb-[130px]">
      <div className="mx-auto max-w-[1180px]">
        <h2 className="m-0 text-center text-[clamp(34px,4.2vw,56px)] leading-none font-bold tracking-[-.05em]">
          How it tends <span className="text-[#83808c]">to go.</span>
        </h2>

        {/* Circular loop: desktop/tablet */}
        <Reveal className="mx-auto mt-16 hidden aspect-square w-full max-w-[640px] md:block">
          <div className="relative h-full w-full">
            <div className="absolute top-1/2 left-1/2 h-[74%] w-[74%] -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-[#2a2830]" />
            {STEPS.map((step, i) => {
              const pos = stepPosition(i);
              return (
                <div key={step.label}>
                  <div
                    className="absolute z-[1] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#1b1a20] text-[13px] font-bold text-[#83808c] ring-1 ring-[#2a2830]"
                    style={{ left: `${pos.nodeLeft}%`, top: `${pos.nodeTop}%` }}
                  >
                    {i + 1}
                  </div>
                  <div
                    className={`absolute w-[190px] ${
                      pos.side === "right"
                        ? "text-left"
                        : pos.side === "left"
                          ? "-translate-x-full text-right"
                          : "-translate-x-1/2 -translate-y-full text-center"
                    }`}
                    style={{
                      left: `${pos.labelLeft}%`,
                      top: `${pos.labelTop}%`,
                      transform:
                        pos.side === "right"
                          ? "translateY(-50%)"
                          : pos.side === "left"
                            ? "translate(-100%, -50%)"
                            : "translate(-50%, -100%)",
                    }}
                  >
                    <div className="text-[16px] leading-[1.2] font-bold tracking-[-.025em] text-[#f5f4f7]">
                      {step.label}
                    </div>
                    <div className="mt-1 text-[13px] leading-[1.4] tracking-[-.01em] text-[#a5a2ae] text-pretty">
                      {step.d}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>

        {/* Simple stacked list: mobile */}
        <ol className="mx-auto mt-12 flex max-w-[480px] list-none flex-col gap-7 p-0 md:hidden">
          {STEPS.map((step, i) => (
            <li key={step.label} className="flex gap-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1b1a20] text-[13px] font-bold text-[#83808c] ring-1 ring-[#2a2830]">
                {i + 1}
              </div>
              <div>
                <div className="text-[17px] leading-[1.2] font-bold tracking-[-.025em] text-[#f5f4f7]">
                  {step.label}
                </div>
                <div className="mt-1 text-[14.5px] leading-[1.4] tracking-[-.01em] text-[#a5a2ae] text-pretty">
                  {step.d}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
