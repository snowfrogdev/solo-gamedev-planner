# Tesler's Law

For any system there is a certain amount of complexity which cannot be reduced.

## Description

Tesler's Law, also known as the Law of Conservation of Complexity, states that every application has an inherent amount of irreducible complexity. This complexity cannot be eliminated — it can only be moved between the system and the user. The central design question is: who bears the burden of that complexity? Tesler argued that engineers should invest extra development effort to absorb complexity into the system rather than pushing it onto millions of users. Every hour of engineering work that simplifies the user experience saves exponentially more time across the entire user base.

## Key Takeaways

- All processes contain irreducible complexity that must be managed by either the system or the user.
- Designers should prioritize shifting complexity burden away from users and into the system during development.
- Products should serve real users with realistic behaviors, not idealized rational actors.
- Helpful guidance should be contextually available (such as tooltips) to support users across different usage paths.
- Simplification has limits — at some point, removing complexity from the user creates complexity elsewhere.

## Origins

Larry Tesler developed this concept while working at Xerox PARC in the mid-1980s, recognizing that user interaction patterns were as critical as application design itself. His perspective — detailed in Dan Saffer's *Designing for Interaction* — suggests that engineers should invest extra development time to reduce complexity rather than multiplying user friction across millions of people. Bruce Tognazzini (also of Apple and NN/g) offered a notable counterpoint: people sometimes resist complexity reductions, attempting more advanced tasks when applications are simplified, effectively maintaining the same overall complexity level. Tesler later worked at Apple, Amazon, and Yahoo, applying his principle across diverse product contexts.

## Practical Implications for UI Design

- **Absorb complexity into the system**: Auto-detect settings, infer defaults, and automate repetitive tasks. If the system can figure something out, don't ask the user.
- **Smart defaults**: Provide sensible default values that work for most users. Let power users change them, but don't force everyone through the configuration.
- **Progressive complexity**: Start simple and reveal advanced features as needed. Don't expose all complexity upfront "just in case."
- **Don't oversimplify**: Removing too many controls can make simple tasks easy but common tasks impossible. Honor the irreducible complexity — some tasks genuinely require user decisions.
- **Contextual help**: When complexity must be exposed to users, provide tooltips, inline help, and guided workflows to support them through complex tasks.
- **Invest engineering effort**: A simpler user experience often requires more complex engineering. This is a worthwhile trade-off — engineering effort scales once, while user friction multiplies across every user, every time.

## Further Reading Insights

**Farnam Street** — Why life can't be simpler: Tesler's Law explains that complexity is conserved — you can move it but not destroy it. When applications are simplified, users often attempt more ambitious tasks, maintaining the same effective complexity. The insight is that simplification efforts should focus on the most common user paths while preserving capability for complex tasks.

**Nielsen Norman Group (Lola Famulegun)** — Tesler's Law means shifting complexity to simplify UX. Engineers should invest extra development effort rather than pushing configuration burden onto users. The video emphasizes that the goal isn't zero complexity but appropriate distribution — the system should handle what it can, and the user should handle only what requires human judgment.

**Smashing Magazine (Goran Peuc)** — Nobody wants to use your product — they want to accomplish their goals. Tesler's Law reinforces that every unit of complexity exposed to users is friction between them and their goal. Designers should ruthlessly evaluate whether each complexity point is truly irreducible or whether engineering investment could absorb it.

**Nielsen Norman Group (Kate Kaplan)** — 8 design guidelines for complex applications: even when complexity is genuinely irreducible, the design can still manage how users experience it through progressive disclosure, clear information hierarchy, consistent patterns, and contextual guidance.
