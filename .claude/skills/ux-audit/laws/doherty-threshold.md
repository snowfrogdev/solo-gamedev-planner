# Doherty Threshold

Productivity soars when a computer and its users interact at a pace that ensures neither has to wait on the other.

## Description

The Doherty Threshold establishes that system response times must remain under 400 milliseconds to maintain user engagement and productivity. When interactions meet this threshold, the experience feels fluid and engaging — almost "addicting." Above this threshold, user attention wanes, frustration builds, and productivity drops significantly. The principle applies to all interactive computing: web applications, mobile apps, desktop software, and any system where humans and computers take turns.

## Key Takeaways

- Deliver system feedback within 400ms to maintain user focus and boost productivity.
- Leverage perceived performance techniques to enhance response times and reduce wait perception.
- Use animation to engage users visually during background processing or loading.
- Apply progress indicators to make waiting periods feel more manageable.
- Strategic delays can paradoxically increase perceived value and build user trust when used appropriately.

## Origins

Published in 1982 in the IBM Systems Journal, Walter J. Doherty and Ahrvind J. Thadani's research paper "The Economic Value of Rapid Response Time" established 400 milliseconds as the optimal response-time threshold for interactive computing — replacing the previous industry standard of 2 seconds. Their core finding was elegantly simple: "When a computer and its users interact at a pace that ensures that neither has to wait on the other, productivity soars, the cost of the work done on the computer drops, and its quality tends to improve." Systems meeting this threshold were considered "addicting" to users, as the rapid interaction pace created seamless human-computer engagement.

The research built on earlier work by Robert B. Miller (1968), who studied response time requirements in man-computer conversational transactions and identified various response time categories based on task type.

## Practical Implications for UI Design

- **Optimize for sub-400ms responses**: Ensure that common interactions (button clicks, form submissions, navigation) provide feedback within 400ms.
- **Use perceived performance**: When actual response time cannot meet the threshold, use skeleton screens, optimistic UI updates, progressive loading, and animations to make the wait feel shorter.
- **Progress indicators are essential**: Brad Myers' research demonstrated that percent-done progress indicators significantly improve the user experience during longer operations by giving users a sense of control and predictability.
- **Loading states prevent abandonment**: Never leave users staring at a blank screen. Immediate visual feedback (even before data loads) maintains the sense of responsiveness.
- **Performance is an economic issue**: Slow response times don't just frustrate users — they measurably reduce productivity, engagement, and revenue.

## Further Reading Insights

**Dave Rupert** — Though the Doherty Threshold research was published over 40 years ago, it remains strikingly relevant to modern web performance. The threshold applies directly to website optimization efforts — load times, interaction responsiveness, and perceived performance all hinge on meeting the 400ms expectation. The principle underscores that web performance isn't merely a technical consideration but an economic one.

**Brad Myers (Carnegie Mellon)** — Research on percent-done progress indicators for computer-human interfaces demonstrated that progress bars significantly improve user satisfaction during longer operations. Users prefer operations that show clear progress over those that provide no feedback, even when actual completion time is identical. This directly supports the Doherty Threshold by providing a mechanism to maintain engagement when the 400ms target cannot be met.

**Robert B. Miller (1968)** — Miller's earlier research on response time in man-computer conversational transactions identified that different types of tasks require different response time expectations, laying the groundwork for Doherty and Thadani's more specific threshold.
