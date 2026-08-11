---
name: ravonroad-design
description: Use this skill to generate well-branded interfaces and assets for RavonRoad, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for protoyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Non-negotiables for RavonRoad:
- Mobile-first, one-handed, outdoors. Primary action lives in the bottom third; 44px minimum touch target, 52px for the primary CTA.
- Font must cover Cyrillic AND U+02BB (ʻ) / U+02BC (ʼ) in one family. Test string: «Mirzo Ulugʻbek tumani · Чиланзарский район». Never substitute ' or ’.
- uz-Latn is the default locale, ru second. Uzbek runs 15-20% longer — design to the Uzbek string.
- Status is never carried by colour alone: every status owns a shape. DONE is blue-green, never pure green.
- The signal-yellow accent means action only, and never matches a status colour.
- Text on a coloured fill is chosen by contrast, never white by default.
- No auth, no account, no moderation admin, no comments, no likes, no ratings — the product has none.
