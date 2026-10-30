# Project Blurb Guide

Use this guide for every `blurb` in `src/data/projects.ts`. The goal is a
consistent body of writing that is professional, clear, and specific without
reading like marketing copy or a résumé.

## The standard

- Write **two paragraphs totaling roughly 90–115 words**.
- Keep each paragraph to **two sentences when possible**.
- Open with the work itself, not its name, title, or year. They already appear
  in the detail heading.
- Use a calm, confident, matter-of-fact voice. Prefer precise nouns and verbs to
  promotional adjectives.
- Write in an object-first voice rather than repeatedly beginning with “I.”
  Ownership should still be explicit when it matters: “Designed and developed
  end to end” is clearer than leaving the reader to infer the role.
- Explain why a decision mattered instead of only listing features or tools.
- Never invent outcomes, metrics, clients, responsibilities, or technical
  details. If a fact is unknown, omit it.
- Avoid em dashes. Use a period, comma, or colon instead.

## Names and descriptive titles

Every project has a required `name`: its proper identity, such as `Rinse UI` or
`Sodo Athletic Lab`. The optional `title` is a short plain-language description
of what the project or product is.

- Describe the **subject of the work**, not the list of services delivered.
- Prefer a concrete category or proposition a visitor understands immediately.
- Keep it concise, usually two to five words.
- Do not repeat the project name or year.
- Avoid generic portfolio labels such as “Brand Identity,” “Case Study,” or
  “Design System” unless that phrase genuinely describes the product itself.

For example:

- **Prefer:** `Sodo Athletic Lab — Premium Men’s Activewear (2023)`
- **Avoid:** `Sodo Athletic Lab — Brand Identity & Packaging System (2023)`
- **Prefer:** `Rinse UI — Design System Documentation Tool (2024)`

The blurb can explain the actual scope, including art direction, identity,
packaging, product design, or development. Keeping those deliverables out of the
title makes the heading more specific to the project and less like a résumé
category.

## Paragraph structure

### Paragraph one: what, why, and ownership

Establish:

1. What the project is.
2. Who it served or what problem it addressed.
3. Jin’s role or degree of ownership, when meaningful.
4. The practical outcome for the people using it.

This paragraph should make the project understandable without relying on the
images.

### Paragraph two: approach and decisions

Explain:

1. The central design or technical approach.
2. The constraint or principle that shaped it.
3. Why the implementation was appropriate.
4. How the system could grow, adapt, or support the work over time.

Mention technology only when it clarifies an intentional decision. A tool list
without a reason does not belong in the blurb.

## Canonical example

### Rinse UI — Design System Documentation Tool (2024)

Designed and developed end to end, this internal documentation tool gave the
team a shared source of truth for its design system and component library. It
brought design decisions, component behavior, and implementation guidance into
one place, keeping ideas aligned and making the handoff from design to
development more direct and consistent.

Its architecture was deliberately lightweight, scalable, and adaptable, using a
minimal static-site stack to generate fast previews directly from Markdown. The
low setup cost made it easy to adopt, while the flexible structure could
accommodate custom documentation needs as the system and team evolved.

## Source notes to provide

Before generating a blurb, gather as many of these facts as are known:

- What the project is and who it was for.
- The problem, need, or opportunity.
- Jin’s role: design, development, direction, or a combination.
- Whether the work was independent, collaborative, or internal.
- The most important design or technical decision.
- Relevant constraints, materials, tools, or platform choices.
- The practical outcome or change it enabled.

Fragments and rough notes are enough. Missing facts should stay missing rather
than being filled with assumptions.

## Reusable writing prompt

> Write a project blurb from the notes below. Use two paragraphs totaling 90–115
> words, with approximately two sentences per paragraph. Paragraph one should
> explain what the project is, why it existed, Jin’s ownership, and the practical
> outcome. Paragraph two should explain the key design or technical approach and
> why it was appropriate. Keep the voice professional, clear, precise, and
> restrained. Open with the work rather than its name, avoid first person unless
> it is necessary for clarity, do not repeat the name, title, or year, do not use
> em dashes, and do not invent facts. Match the tone of the Rinse UI example in
> `PROJECT-BLURB-GUIDE.md`.
>
> Notes: [paste raw project notes here]

## Catalogue formatting

Separate the two paragraphs with `\n\n` inside the string:

```ts
blurb: 'First paragraph.\n\nSecond paragraph.',
```

`ProjectReveal` turns that blank-line pair into two visible paragraphs. Leave
`blurb: ''` when a project has not been written yet; empty copy is preferable to
generic or speculative copy.

## Final review

Before adding a blurb, confirm:

- A reader can understand the project without seeing the images.
- Ownership is accurate and clear.
- Each technical detail has a reason for being mentioned.
- Claims are supported by the source notes.
- The name, title, and year are not repeated.
- The copy sounds specific to this project and could not be pasted onto another.
- The two paragraphs follow the same density and restraint as Rinse UI.
