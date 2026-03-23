# Fitts's Law

The time to acquire a target is a function of the distance to and size of the target.

## Description

Fitts's Law is a predictive model of human movement that describes the time required to rapidly move to a target area as a function of the distance to the target and the size of the target. In practical terms: the bigger and closer a target is, the faster it can be reached. Fast movements toward small targets result in greater error rates due to the speed-accuracy trade-off. This principle is fundamental to interaction design, influencing everything from button sizing to menu placement to touch target design.

## Key Takeaways

- Touch targets should be large enough for users to accurately select them.
- Touch targets should have ample spacing between them to prevent accidental activation.
- Touch targets should be placed in areas of an interface that allow them to be easily acquired.
- The bigger the distance to the target, the longer it will take to reach.
- The larger the target, the shorter the movement time to it.

## Origins

In 1954, psychologist Paul Fitts examined the human motor system and demonstrated that the time needed to move to a target depends on its distance while being inversely related to its size. His research, published as "The Information Capacity of the Human Motor System in Controlling the Amplitude of Movement," revealed that fast movements and small targets result in greater error rates due to the speed-accuracy trade-off. Multiple variants of Fitts's Law exist, but all share this foundational concept. The principle has become central to UX and UI design, influencing practices like creating larger interactive buttons (especially for mobile touch interfaces) and minimizing distance between user attention areas and related actions.

## Practical Implications for UI Design

### Target Size

- **Make targets larger**: Bigger targets reduce both interaction time and error rates. Minimum recommended touch target size is 48x48dp (Google Material Design) or 44x44pt (Apple HIG).
- **Combine icons with labels**: Text labels expand clickable areas beyond icons alone, improving acquisition speed.
- **Invisible padding has limits**: While padding increases active areas, users who don't perceive it will still approach cautiously, limiting efficiency gains.

### Distance Optimization

- **Proximity principle**: Place sequentially-used controls nearby. Submit buttons belong beside the final form field, not at the top of the page.
- **Menu structure matters**: Pie menus offer equal distances to all items. Linear menus benefit from frequency-based ordering with most-used items nearest the trigger point.
- **Screen edges as infinite targets**: In desktop/pointer interfaces, screen edges function as infinite targets since cursors cannot overshoot them. macOS places menus at the top edge; Windows positions the taskbar at the bottom. Note: this advantage does NOT apply to touchscreens.

### Touch-Specific Considerations

- **Center-screen advantage**: On mobile, people touch the center faster and more accurately than the edges — this reverses desktop conventions where edge placement exploited infinite boundaries.
- **Hand position variability**: People hold mobile devices in numerous ways and constantly shift their grip, making it impossible to predict hand position relative to targets.
- **Separate destructive actions**: Don't place Cancel directly adjacent to Submit. On touch interfaces, separate destructive actions from positive ones to prevent accidental taps.
- **Avoid crowding**: Closely spaced targets invite accidental overshooting, especially when targets are small.

## Further Reading Insights

**Nielsen Norman Group** — Fitts's Law establishes two key variables for pointer movement: distance and size. Designers should leverage screen edges as infinite targets (desktop only), combine icons with labels to expand clickable areas, and avoid crowding interactive elements. Invisible padding helps but has limits — users who can't see the expanded target will still approach cautiously.

**Smashing Magazine (Fitts' Law in the Touch Era)** — Traditional Fitts's Law principles don't directly transfer to touch interfaces. The original research assumed limb movement and a known cursor position — neither exists in touch scenarios. Key findings: center-screen content performs best on mobile (reversing desktop conventions); after tapping, users often disengage completely from the device; designers should question assumptions rather than blindly applying desktop conventions to touch.

**Steven Hoober (UX Matters)** — Research on how people actually hold and touch mobile devices reveals enormous variability in grip and finger position. Design for the full range of hand positions rather than assuming a single dominant grip pattern.
