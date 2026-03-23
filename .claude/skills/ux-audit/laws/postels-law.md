# Postel's Law

Be liberal in what you accept, and conservative in what you send.

## Description

Postel's Law (also called the Robustness Principle) advocates for systems that accept a wide range of inputs gracefully while producing consistent, well-formatted outputs. In interface design, this means being tolerant of varied user behaviors, input formats, and interaction patterns while providing clear, predictable responses. A robust interface doesn't punish users for entering data in unexpected formats — it adapts, translates, and provides helpful feedback rather than rigid rejection.

## Key Takeaways

- Demonstrate empathy, flexibility, and tolerance for varied user actions and input.
- Anticipate diverse input types, access patterns, and user capabilities while maintaining reliable and accessible interfaces.
- Thorough design planning increases interface resilience.
- Process variable user input by translating it to meet system requirements, establishing input boundaries, and delivering clear feedback.

## Origins

Postel's Law is named after Jon Postel, an internet pioneer who formulated the principle in the context of TCP (Transmission Control Protocol) and network software. In RFC 761 (1980), Postel wrote: "Be conservative in what you do, be liberal in what you accept from others." Originally, this meant that systems sending network messages should strictly follow specifications, while systems receiving messages should accept non-conformant input when the intent remained clear. The principle proved so valuable for building resilient network systems that it was adopted broadly in software engineering and later in user interface design.

## Practical Implications for UI Design

- **Accept varied input formats**: Phone numbers with or without dashes, dates in multiple formats, names with diacritics and special characters, addresses in various conventions. Parse and normalize on the backend rather than rejecting at the input.
- **Flexible form validation**: Validate progressively and helpfully. Show what format is expected, auto-format as users type, and provide clear guidance rather than cryptic error messages.
- **Handle edge cases gracefully**: Design for unusual screen sizes, unexpected content lengths, missing data, and non-standard interaction patterns. The system should degrade gracefully rather than break.
- **Design with difficult data**: Test with edge-case content — very long names, empty states, special characters, RTL text, and extreme values. Design systems should handle these cases without breaking layout.
- **Conservative output**: While accepting varied input, produce consistent, well-formatted output. Normalize dates, format phone numbers consistently, and present data in a predictable way regardless of how it was entered.
- **Internationalization**: Accept input in various languages, character sets, and cultural formats. Don't assume all users share the same conventions for names, addresses, dates, or numbers.

## Further Reading Insights

**A List Apart (Your Website has Two Faces)** — Websites have two faces: the one presented to users and the one presented to their data. Postel's Law requires designing for both — presenting clean, consistent output to users while accepting messy, varied input from them. This dual nature is fundamental to resilient design.

**A List Apart (Steven Garrity — Design with Difficult Data)** — Real-world data is messy. Names can be extremely long or contain unexpected characters. Content can be missing, truncated, or formatted inconsistently. Designing with difficult data means testing with edge cases early and building interfaces that handle them gracefully rather than breaking.

**Adactio** — The robustness principle extends to front-end development: write strict, valid HTML and CSS (be conservative in what you send) while ensuring your designs work across a wide range of browsers, devices, and user configurations (be liberal in what you accept). This approach builds resilient experiences that reach the widest possible audience.
