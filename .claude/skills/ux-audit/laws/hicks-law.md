# Hick's Law

The time it takes to make a decision increases with the number and complexity of choices.

## Description

Hick's Law (or the Hick-Hyman Law) describes the relationship between the number of available choices and the time a person needs to make a decision. Decision time increases logarithmically — not linearly — with the number of options. This means adding choices increases decision time, but each additional choice adds proportionally less time than the previous one. The principle is fundamental to interface design: too many options overwhelm users, while too few may not serve their needs. The goal is finding the right balance through progressive disclosure, smart defaults, and thoughtful information architecture.

## Key Takeaways

- Minimize choices when response times are critical to decrease decision time.
- Break complex tasks into smaller steps in order to decrease cognitive load.
- Avoid overwhelming users by highlighting recommended options.
- Use progressive onboarding to minimize cognitive load for new users.
- Be careful not to simplify to the point of abstraction — oversimplification can make things harder to understand.

## Origins

Hick's Law is named after British psychologist William Edmund Hick and American psychologist Ray Hyman. In 1952, they examined the relationship between the number of stimuli present and an individual's reaction time to any given stimulus. The research confirmed that increased stimulus options correlate with longer decision times. Users facing numerous choices require additional time to interpret and decide among them. The mathematical relationship is logarithmic: T = b × log₂(n + 1), where T is decision time, b is a constant, and n is the number of equally probable choices.

## Practical Implications for UI Design

- **Reduce options in critical paths**: For actions where speed matters (checkout, emergency interfaces, primary navigation), minimize the number of choices presented simultaneously.
- **Progressive disclosure**: Reveal options in stages rather than all at once. Start with the most common or important options and let users drill down for more.
- **Highlight recommendations**: When presenting multiple options (pricing tiers, product variants), visually emphasize the recommended choice to reduce decision paralysis.
- **Smart defaults**: Pre-select the most common option to reduce the cognitive burden of choosing.
- **Card sorting for navigation**: Use card sorting exercises to organize information architecture so that navigation categories are intuitive and minimize the choices at each level.
- **Don't oversimplify**: Hick's Law doesn't mean "fewer is always better." Combining too many functions into a single ambiguous control can increase cognitive load. The goal is clarity, not minimalism for its own sake.
- **Search as an escape hatch**: For large option sets (e-commerce catalogs, documentation), provide search functionality alongside browsable categories.

## Further Reading Insights

**Interaction Design Foundation (Mads Soegaard)** — Hick's Law should be applied thoughtfully: it governs decision time for equally weighted choices, but doesn't apply when users already know what they want. The article emphasizes that designers should distinguish between browsing (where fewer choices help) and searching (where comprehensive options are needed). Progressive disclosure is the primary technique for managing choice complexity.

**Jon Yablonski (UX Psychology: Google Search)** — Google's search interface exemplifies Hick's Law: the homepage presents essentially one choice (the search box), minimizing decision time. As users type, autocomplete suggestions reduce the option space further. The simplicity is carefully engineered to guide users toward their goal as quickly as possible.

**Choice Overload Effect (Jennifer Clinehens)** — Related to Hick's Law, choice overload occurs when too many options lead to decision paralysis, lower satisfaction with the eventual choice, and even decision avoidance. Sheena Iyengar's famous jam study demonstrated that displays with 24 flavors attracted more interest but resulted in far fewer purchases than displays with 6 flavors. Simplicity in choice presentation directly increases conversion rates.
