import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service — Dynamify",
  description: "The terms for using Dynamify — draft structure, not final legal text.",
};

const SECTIONS: LegalSection[] = [
  {
    heading: "1. What Dynamify does",
    body: (
      <p>
        Dynamify reads a customer&apos;s existing website, and — with the customer&apos;s explicit setup and approval —
        shows different, more relevant content to different visitors, without changing the site&apos;s design,
        layout, or the site itself. We don&apos;t host the customer&apos;s website. Content changes only ever apply to
        elements the customer has allowed, and never go live without human approval.
      </p>
    ),
  },
  {
    heading: "2. Accounts",
    body: (
      <p>
        You&apos;re responsible for the accuracy of your account information and for activity on your account.
        [Placeholder — minimum age, account-sharing policy, and what happens on suspected unauthorized access.]
      </p>
    ),
  },
  {
    heading: "3. Your responsibilities",
    body: (
      <>
        <p>By connecting a site, you confirm that:</p>
        <ul className="mt-3 list-disc pl-5 [&>li]:mt-2">
          <li>You&apos;re authorized to make content changes to the site you connect.</li>
          <li>
            You&apos;ll review generated or suggested content before approving it — Dynamify checks generated copy
            against your site&apos;s own existing content before it&apos;s ever offered for approval, but the decision
            to publish is yours.
          </li>
          <li>
            You won&apos;t use Dynamify to show visitors content that&apos;s misleading, discriminatory, or unlawful in
            the jurisdictions your visitors are in.
          </li>
          <li>
            You&apos;re responsible for any visitor-facing disclosure your own use of personalization or tracking
            features requires under applicable law. [Placeholder — this needs a precise, counsel-drafted
            allocation of responsibility; see docs/decisions.md D5, which flags this exact question as open.]
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "4. AI-generated content",
    body: (
      <p>
        Generated copy and images are produced by third-party AI models and checked against your own existing
        site content before being offered to you — that check reduces, but does not eliminate, the chance of an
        inaccurate or inappropriate suggestion. [Placeholder — a precise disclaimer of liability for AI output,
        and confirmation of who bears responsibility once a human has approved a suggestion, needs counsel.]
      </p>
    ),
  },
  {
    heading: "5. Fees and billing",
    body: (
      <p>
        [Placeholder — billing isn&apos;t live yet. This section needs real terms once payment collection exists:
        pricing, billing cycle, upgrades/downgrades, refunds, and what happens to your data if a subscription
        lapses.]
      </p>
    ),
  },
  {
    heading: "6. Termination",
    body: (
      <p>
        You can stop using Dynamify and disconnect your site at any time. [Placeholder — our own right to suspend
        or terminate an account, notice periods, and data handling after termination.]
      </p>
    ),
  },
  {
    heading: "7. Disclaimers and limitation of liability",
    body: <p>[Placeholder — standard limitation-of-liability and warranty-disclaimer language, sized to this product&apos;s actual risk profile, needs counsel — not boilerplate copied from an unrelated product.]</p>,
  },
  {
    heading: "8. Governing law",
    body: <p>[Placeholder — jurisdiction and governing law, to be set once the company&apos;s own legal domicile is finalized.]</p>,
  },
  {
    heading: "9. Changes to these terms",
    body: <p>[Placeholder — how and where updates will be communicated, and notice period before they take effect.]</p>,
  },
  {
    heading: "10. Contact",
    body: <p>[Placeholder — a real contact address for questions about these terms.]</p>,
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      intro="The terms for using Dynamify, whether you're a customer running personalization on your own site or a member of a customer's team."
      sections={SECTIONS}
    />
  );
}
