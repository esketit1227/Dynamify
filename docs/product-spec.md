# PRODUCT MASTER DESCRIPTION

## AI-Powered Website Personalization Layer

### General Introduction

The product is an **AI-powered website personalization platform that automatically adapts an existing website to different visitors without changing its underlying design, layout, branding, or theme.**

A company connects its existing website to the platform.

The platform reads and understands the website — including its pages, copy, images, products, CTAs, value propositions, navigation, and overall brand context.

It then uses available visitor context to determine what messaging is most relevant to that particular person.

Instead of creating a new website, rebuilding landing pages, or manually creating dozens of variants, the platform **changes the content inside the existing website while preserving the original design.**

For example, the original website might say:

> **The smarter way to manage your projects.**

A startup founder could see:

> **Move your startup from idea to execution faster.**

An enterprise visitor could see:

> **Give your entire organization a smarter way to manage projects.**

A creative agency could see:

> **Keep every client project organized from brief to delivery.**

The layout remains exactly the same.

The typography remains the same.

The colors remain the same.

The navigation remains the same.

The components remain the same.

Only the content is intelligently adapted.

---

# 1. THE CORE IDEA

The fundamental product concept is:

> **Don't rebuild the website. Make the existing website smarter.**

Traditional personalization often requires marketers to create:

* separate landing pages
* separate campaigns
* separate designs
* separate URLs
* separate layouts
* separate content variants

This product eliminates most of that work.

The company keeps its existing website.

The platform sits on top of it and intelligently modifies the content.

Conceptually:

```text
Existing Website
       ↓
AI reads and understands website
       ↓
Visitor arrives
       ↓
AI determines relevant visitor context
       ↓
Personalization engine selects appropriate content
       ↓
Existing website is dynamically adapted
       ↓
Visitor sees personalized experience
```

---

# 2. THE PRODUCT DOES NOT CHANGE THE DESIGN

This is one of the most important principles of the product.

The platform should **preserve the existing website's visual identity.**

It should not redesign the website.

It should not rearrange the page.

It should not randomly change the theme.

It should not replace the company's branding.

It should not create a different layout for every audience.

Instead:

> **The website stays visually the same. The content becomes more relevant.**

If the original website has:

* a large hero
* black background
* white typography
* orange CTA
* three-column feature section
* testimonial carousel

those elements remain.

The system simply determines what content should appear inside them.

---

# 3. WHAT THE AI READS

When a company connects its website, the platform crawls and analyzes the available content.

It should understand:

### Text

* Headlines
* Subheadlines
* Paragraphs
* Feature descriptions
* Product descriptions
* Testimonials
* CTAs
* Navigation labels
* Pricing copy
* FAQ content
* Microcopy

### Visual content

* Hero images
* Product images
* Supporting images
* Illustrations
* Videos
* Logos

### Structural context

The system should understand which content belongs to which part of the page.

For example:

```text
Hero
 ├── Headline
 ├── Supporting copy
 ├── CTA
 └── Image

Features
 ├── Feature 1
 ├── Feature 2
 └── Feature 3

Social Proof
 ├── Testimonial
 └── Customer logos

CTA Section
 ├── Headline
 └── Button
```

The platform is not simply scraping text.

It needs to understand **what each element is doing commercially.**

---

# 4. WEBSITE UNDERSTANDING

The AI should build an internal representation of the website.

For example:

```text
Company:
Acme

Product:
Project management software

Target customers:
Businesses and teams

Brand tone:
Professional
Minimal
Confident

Primary CTA:
Start Free Trial

Hero:
Headline
Subheadline
CTA
Hero image

Primary value propositions:
- Collaboration
- Automation
- Reporting
```

This becomes the foundation for personalization.

The AI understands:

> What the company sells.

> Who it is for.

> What the important benefits are.

> What the brand sounds like.

> What the important actions are.

> Which content can safely be personalized.

---

# 5. VISITOR UNDERSTANDING

When a visitor arrives, the system evaluates available context.

Possible signals include:

### Traffic source

* Google
* LinkedIn
* Instagram
* Facebook
* Direct
* Email
* Referral

### Campaign

* UTM source
* UTM medium
* UTM campaign
* UTM content
* UTM term

### Geographic context

Where legally available:

* Country
* Region
* City

### Device

* Desktop
* Mobile
* Tablet

### Behavioral context

* New visitor
* Returning visitor
* Previous pages viewed
* Previous interactions
* Previous conversions

### Customer information

When legitimately available through integrations:

* Company
* Industry
* Company size
* Customer status
* Subscription
* CRM attributes

The platform combines these signals to build a contextual understanding of the visitor.

---

# 6. THE AI DECIDES WHAT MATTERS

The system should not simply apply primitive rules such as:

```text
if country = Finland
show Finnish headline
```

The long-term product should understand the **intent and commercial relevance** of the visitor.

For example:

A visitor arrives from a Google search:

> "best project management software for creative agencies"

The system can infer:

```text
Likely intent:
Project management software

Potential audience:
Creative agency

Potential priority:
Client/project workflow

Messaging opportunity:
Creative workflow + client management
```

The existing website can then adapt its messaging accordingly.

---

# 7. CONTENT PERSONALIZATION

The system can personalize individual content elements.

### Original

> **Project management for modern teams.**

### Creative agency visitor

> **Project management built for creative teams and client work.**

### Enterprise visitor

> **Project management built to scale across your organization.**

### Startup visitor

> **Everything your startup needs to keep moving fast.**

The design remains unchanged.

---

# 8. CTA PERSONALIZATION

CTAs are especially important.

The system can adapt the CTA based on visitor context.

For example:

### Generic

> Get Started

### High-intent visitor

> Start Your Free Trial

### Enterprise visitor

> Talk to Sales

### Existing customer

> Go to Your Dashboard

### Agency visitor

> See How Agencies Use It

The system should understand that CTA personalization is not merely changing words.

It is changing the **desired next action** while respecting the company's business rules.

---

# 9. IMAGE PERSONALIZATION

The platform can also personalize images where appropriate.

For example:

Original website:

> Generic product image

Agency visitor:

> Creative-team/product workflow image

Enterprise visitor:

> Enterprise dashboard image

International visitor:

> Regionally relevant imagery

The system should never arbitrarily replace images.

It should understand:

* what the image represents
* why it is being used
* what alternative assets are available
* whether the replacement is brand-safe

The user should be able to approve or restrict image personalization.

---

# 10. IMAGE GENERATION

Eventually, the platform could generate or modify imagery when appropriate.

For example:

> Create a version of this hero image that better communicates the product to enterprise buyers.

However, generated imagery must respect:

* brand identity
* visual style
* product accuracy
* composition
* existing website dimensions

AI-generated visual changes should be optional and controlled.

---

# 11. COPY PERSONALIZATION

The system should be able to rewrite copy while preserving:

* brand voice
* factual accuracy
* meaning
* product claims
* tone
* length constraints
* component dimensions

For example:

Original:

> Powerful analytics for growing businesses.

Personalized:

> Powerful analytics for agencies managing dozens of client campaigns.

The personalized copy should still sound like it belongs to the original company.

---

# 12. BRAND VOICE

During onboarding, the platform should learn the company's brand.

It can analyze the existing website to determine:

* tone
* vocabulary
* sentence length
* level of formality
* positioning
* personality
* terminology
* messaging hierarchy

The system should create a persistent **brand profile**.

This prevents personalization from producing copy that sounds like a completely different company.

---

# 13. BRAND SAFETY

The AI must never invent important company information.

It should not fabricate:

* customers
* statistics
* testimonials
* certifications
* product features
* pricing
* partnerships
* guarantees
* claims

If the required information does not exist, the system should use safe existing messaging.

---

# 14. PERSONALIZATION BOUNDARIES

The user should be able to control what the AI is allowed to change.

For example:

### Allowed

* Headlines
* Subheadlines
* CTA copy
* Supporting copy
* Testimonials
* Images

### Restricted

* Pricing
* Legal text
* Navigation
* Terms
* Product specifications

### Never change

* Logo
* Brand colors
* Typography
* Layout
* Core navigation
* Legal disclosures

This gives companies confidence that the AI will not accidentally alter critical parts of their website.

---

# 15. USER EXPERIENCE

The company should have an extremely simple setup.

### Step 1

Enter website URL.

> `https://company.com`

### Step 2

The platform scans the website.

It identifies:

* pages
* sections
* content
* images
* CTAs
* brand characteristics

### Step 3

The AI produces a website understanding report.

For example:

> We found 14 pages, 63 editable content elements and 18 images.

> Your primary positioning appears to be productivity software for growing teams.

### Step 4

Connect available data sources.

Optional:

* Google Analytics
* HubSpot
* Salesforce
* Shopify
* advertising platforms
* CRM
* customer database

### Step 5

Enable personalization.

The platform begins generating recommendations.

---

# 16. AI RECOMMENDATIONS

Instead of forcing users to manually build rules, the platform should proactively suggest opportunities.

For example:

> **We found an opportunity.**

> 38% of your traffic comes from LinkedIn.

> Most of this traffic appears to be B2B visitors.

> We recommend adapting your hero messaging for LinkedIn visitors.

Then:

### Current

> Build better products.

### Recommended

> Give your product team one place to plan, build and launch.

The user can:

> Accept

or:

> Edit

or:

> Ignore

---

# 17. AUTOMATIC PERSONALIZATION

The eventual goal is for the system to automatically identify personalization opportunities.

Instead of requiring the marketer to manually specify:

> Change this headline for this audience.

The AI should determine:

> This visitor segment responds better to this value proposition.

The platform can then recommend or, if explicitly enabled, automatically deploy the change.

---

# 18. HUMAN CONTROL

The system should not feel like an uncontrollable AI.

Users should always be able to see:

* what changed
* why it changed
* who sees it
* what the original content was
* what the new content is
* what data triggered the change
* whether the change is active

Example:

> **Personalized for:** Creative Agencies

> **Signal:** Visitor arrived from campaign "Creative Agencies"

> **Original:** Project management for modern teams.

> **New:** Project management built for creative teams.

> **Reason:** Emphasizes client/project workflow relevance.

Actions:

> Approve
> Edit
> Disable

---

# 19. VERSION HISTORY

Every personalized change should be reversible.

Users should be able to see:

```text
Original
↓
Personalized version
↓
Updated version
```

They should be able to restore the original content instantly.

---

# 20. ANALYTICS

The platform must prove that personalization creates value.

Track:

* visitors
* personalized visitors
* non-personalized visitors
* engagement
* CTA clicks
* conversions
* conversion rate
* revenue where available

Compare:

```text
Generic experience
vs.
Personalized experience
```

Example:

```text
Generic:
3.8% conversion

Personalized:
6.7% conversion

+76% relative improvement
```

The platform should clearly communicate the business impact.

---

# 21. THE PRODUCT LOOP

The complete product loop is:

```text
READ
↓
UNDERSTAND
↓
IDENTIFY VISITOR
↓
UNDERSTAND INTENT
↓
SELECT RELEVANT MESSAGE
↓
PERSONALIZE CONTENT
↓
SERVE EXISTING WEBSITE
↓
MEASURE RESULT
↓
LEARN
↓
IMPROVE
```

This loop is the heart of the product.

---

# 22. WHAT THE PLATFORM DOES NOT DO

The product is NOT:

* a traditional website builder
* a page builder
* a CMS replacement
* a complete website redesign tool
* a visual theme generator
* a generic AI copywriter
* a chatbot
* a CRM

Its purpose is much narrower and more valuable:

> **Make an existing website dynamically more relevant to each visitor.**

---

# 23. LONG-TERM VISION

The long-term vision is to become the **intelligence layer between a website and its visitors.**

The website remains the company's website.

The brand remains the company's brand.

The layout remains the company's layout.

The platform continuously determines:

> What should this visitor see?

The future could include personalization of:

* copy
* images
* CTAs
* product recommendations
* offers
* testimonials
* navigation labels
* videos
* case studies
* pricing presentation
* promotional messaging

while maintaining the underlying design system.

---

# 24. SIMPLE EXAMPLE

A company has a website:

```text
acme.com
```

The original hero says:

> **The future of team collaboration.**

CTA:

> Get Started

The platform identifies a visitor coming from a campaign targeting marketing agencies.

It understands:

```text
Source:
LinkedIn

Campaign:
Marketing Agencies

Likely audience:
Agency

Intent:
Team collaboration / client work
```

The visitor sees:

> **The collaboration platform built for busy marketing teams.**

CTA:

> See How Agencies Use Acme

The image can also change to an approved agency-relevant image.

Everything else remains visually identical.

Same:

* website
* layout
* theme
* colors
* fonts
* navigation
* components
* URL

Different:

* message
* image
* CTA

---

# 25. THE FUNDAMENTAL DIFFERENTIATOR

Most personalization products ask the marketer to define the experience.

This product should increasingly allow the **AI to understand the website and determine the experience automatically.**

That creates a much simpler proposition:

### Traditional approach

```text
Create audience
↓
Create landing page
↓
Write copy
↓
Choose image
↓
Create campaign
↓
Track performance
↓
Repeat
```

### This product

```text
Connect website
↓
AI understands website
↓
AI understands visitor
↓
AI adapts content
↓
Measure
↓
AI improves
```

The goal is to make website personalization **automatic rather than manual**.

---

# 26. ONE-SENTENCE PRODUCT DEFINITION

> **An AI-powered personalization layer that reads and understands your existing website, then dynamically adapts its copy, images, CTAs and other content to make the experience more relevant to every visitor — without changing your website's design or layout.**

That sentence should guide the entire product.

If a feature does not strengthen this core promise, it should not be prioritized.
