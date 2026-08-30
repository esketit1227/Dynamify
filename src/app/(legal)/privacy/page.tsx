import type { Metadata } from "next";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy — Dynamify",
  description: "How Dynamify handles data — draft structure, not final legal text.",
};

// The section list is real, not generic — it's the actual data map of
// this product (docs/visitor-data.md), so counsel is filling in language
// against what the system really does rather than a boilerplate template.
const SECTIONS: LegalSection[] = [
  {
    heading: "1. Who this covers",
    body: (
      <>
        <p>
          Two different groups of people, and this policy needs to speak to both clearly: people who use the
          Dynamify dashboard directly (our customers and their team members), and visitors to a website our
          customer has connected to Dynamify.
        </p>
        <p className="mt-3">
          [Placeholder — counsel to confirm and formalize:] for visitor-facing data collected on a customer&apos;s
          site, our customer is the data controller and Dynamify acts as a processor on their behalf. This
          relationship, and what it means for each party&apos;s obligations, needs to be stated precisely here and
          mirrored in the Terms of Service and any data processing agreement.
        </p>
      </>
    ),
  },
  {
    heading: "2. What we collect, and when",
    body: (
      <>
        <p>Collection is layered by consent, not all-or-nothing. As implemented today:</p>
        <ul className="mt-3 list-disc pl-5 [&>li]:mt-2">
          <li>
            <strong>Always, no consent required:</strong> anonymous page-view and interaction events — device
            type, approximate context from UTM parameters and referrer, which content variant was shown. Never
            linked to a persistent visitor identity.
          </li>
          <li>
            <strong>Only with analytics consent:</strong> a persistent, random, non-identifying first-party
            cookie recognizing a returning visitor across sessions, and the session history that comes with it.
            Off by default for every site; a customer must explicitly turn it on.
          </li>
          <li>
            <strong>Only with personalization consent:</strong> which audience a visitor was matched to and why,
            recorded against their session.
          </li>
          <li>
            <strong>Only if a customer enables it:</strong> company-level identification from IP address (never
            the visitor&apos;s own identity) via a third-party lookup, cached briefly and only ever stored as an
            irreversible hash of the address, never the address itself.
          </li>
          <li>
            <strong>Dashboard account data:</strong> name, email, and organization details for people who sign up
            to use Dynamify directly.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "3. Cookies",
    body: (
      <p>
        A session cookie for the Dynamify dashboard itself (required for the product to function). On a
        customer&apos;s own site, a first-party visitor-recognition cookie is set only when that customer has
        turned on visitor tracking for that site — never by default. [Placeholder — a full cookie table (name,
        purpose, duration, first/third-party) belongs here.]
      </p>
    ),
  },
  {
    heading: "4. AI processing",
    body: (
      <p>
        Where a customer uses AI-assisted content generation, the content and context involved (existing page
        copy, an anonymized visitor-segment description) are sent to our AI providers for that purpose only.
        Generated content is checked against the customer&apos;s own existing site content before it can be shown
        to anyone, and never goes live without a human approving it first. [Placeholder — name the specific AI
        sub-processors and confirm their own data-handling terms here.]
      </p>
    ),
  },
  {
    heading: "5. How long we keep data",
    body: (
      <p>
        Retention windows for raw events, session detail, and visitor-level data are configurable per customer,
        with defaults enforced automatically. [Placeholder — state the actual default windows and the maximum a
        customer can extend them to, and confirm this section matches whatever retention settings exist at the
        time this is finalized.]
      </p>
    ),
  },
  {
    heading: "6. Your rights",
    id: "gdpr-ccpa-rights",
    body: (
      <p>
        Where applicable law grants you rights over your data — access, export, deletion, and objection to
        processing among them — our customers can act on a request for their own site&apos;s visitors directly
        from their dashboard, including a full data export and permanent deletion. [Placeholder — describe how a
        visitor who isn&apos;t able to go through our customer directly can reach us, and the process and timeline
        for handling that request.]
      </p>
    ),
  },
  {
    heading: "7. Sharing and sub-processors",
    body: (
      <p>
        We don&apos;t sell data. We share it only with the service providers necessary to run the product — hosting
        and database infrastructure, AI providers for generation and enrichment features a customer has turned
        on, and any provider a customer explicitly connects. [Placeholder — the finalized list of named
        sub-processors belongs here, kept current.]
      </p>
    ),
  },
  {
    heading: "8. Contact",
    body: <p>[Placeholder — a real contact address for privacy questions and data subject requests.]</p>,
  },
  {
    heading: "9. Changes to this policy",
    body: (
      <p>[Placeholder — how and where updates will be communicated, and what happens to prior consent on a material change.]</p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      intro="This describes what Dynamify collects, why, and what control you have over it — for people using the Dynamify dashboard, and for visitors to a website that uses Dynamify."
      sections={SECTIONS}
    />
  );
}
