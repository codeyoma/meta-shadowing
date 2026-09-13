# XP progression motivation review

Research date: 2026-09-13. Research only; no implementation recommendation here has been approved. No existing research directory was present, so this note follows the existing `docs/design/` convention.

## Current design and corrected assumptions

The proposed reward is 1 XP for each explicitly confirmed sentence cycle, including optional repeats. The level cap is 999, with `required(L) = round(100 × 1.0055^(L − 1) / 10) × 10` for each transition from level L to L+1. The main review independently checked the cumulative requirement: 4,316,210 XP.

The user's clarified planning baseline is 500 sentences/book × 3 cycles × 3 full runs per day × 16 stages: 4,500 XP per such day and 72,000 XP per book. At that baseline, 50 books yield 3,600,000 XP, reaching level 966; level 999 corresponds to about 59.95 books. These are arithmetic consequences of the proposed workflow, not observed learner behavior. Optional repeats also mean books and XP are not interchangeable measures.

The schedule needs separate validation: if a complete listen–speak–confirm cycle took a hypothetical 5–10 seconds, 4,500 cycles would occupy 6.25–12.5 hours, before breaks. Those timings are illustrative, not measured. A roughly 50–60-book lifetime target can be numerically coherent while the daily schedule remains unsuitable.

## What the primary evidence supports

### 1. Separate lifetime effort from meaningful accomplishments

Riot's lead systems designer described its January 2024 Champion Mastery redesign as combining accumulated experience with demonstrated accomplishments. It proposed uncapped levels while also introducing shorter seasonal milestones, explicitly explaining that infinite progression can feel like a grind. This is a historical design rationale, not a statement about the live 2026 game or evidence of increased retention. [Riot: /dev: Updating Champion Mastery](https://www.leagueoflegends.com/en-us/news/dev/dev-updating-champion-mastery/)

**Application, as design inference:** The app can retain lifetime XP as an honest record of confirmed practice while highlighting sentence-set, stage, and book completions as nearer goals. Repeated practice deserves recognition, but equal XP for all repeats cannot establish language proficiency. Any separate mastery indicator would require a defined assessment; a confirmed cycle alone is not that assessment. There is no need to copy competitive grades, reward locks, or seasonal resets.

### 2. More counted activity does not establish more intrinsic motivation

Mekler and colleagues' experiment assigned points, levels, or leaderboards to an image annotation task. The authors report increased tag quantity, without significant improvements in intrinsic motivation or competence satisfaction relative to control. This supports distinguishing activity counts from motivation and quality; it does not establish that points are harmful. [Mekler et al., 2017, author institution repository](https://edoc.unibas.ch/entities/publication/ccec8ccc-aa54-417d-b205-334b518d6eed/full)

**Access and scope:** The complete author abstract and bibliographic record were inspected on the University of Basel site. The publisher page returned 403; the full study text was not inspected. This was an image annotation experiment, not a longitudinal language-learning study. No sample-size or effect-size claims are made from the abstract.

**Application, as design inference:** Evaluate whether XP changes help learners return, advance through intended content, and retain what they practiced. Total XP alone could rise because someone repeatedly selects a quicker sentence. That is a possible incentive consequence of fixed XP per differently timed action, not evidence that current users are abusing the system.

### 3. Feedback design matters beyond adding points

Sailer and colleagues randomized participants across an online order-picking simulation. Points existed even in the control condition. Adding badges, leaderboards, and performance graphs together improved reported competence satisfaction and task meaningfulness compared with points alone. The analyzed sample was 331 after treatment-awareness exclusions. The competence effect across conditions was small (partial eta squared .020). [Sailer et al., 2017, author-hosted full paper, sections 6.2–6.5](https://www.researchgate.net/profile/Michael-Sailer-2/publication/311879391_How_gamification_motivates_An_experimental_study_of_the_effects_of_specific_game_design_elements_on_psychological_need_satisfaction/links/5874ebdc08ae329d62202795/How-gamification-motivates-An-experimental-study-of-the-effects-of-specific-game-design-elements-on-psychological-need-satisfaction.pdf)

**Limits:** This tests a bundle, so it cannot identify which individual element caused the effect. Post-assignment exclusions and the simulated task limit generalization. It does not validate this app's XP curve, a particular level cap, language proficiency, or long-term retention.

**Application, as design inference:** Show intelligible evidence of progress alongside XP: how much of today's chosen task is complete, which stage was finished, and how much of a book has been covered. Treat proposed feedback as a testable product hypothesis, not a scientifically guaranteed motivation boost.

## Decision for this economy

### Additional first-party product cases

ArenaNet's September 2014 Guild Wars 2 new-player redesign explains that level-up feedback should celebrate the reward, preview the next reward, and teach a system. It also groups some rewards into noticeable milestones rather than small imperceptible increments. This is historical design rationale, not a controlled effectiveness study. [ArenaNet: A Fresh Start](https://www.guildwars2.com/en/news/a-fresh-start-the-new-player-experience-in-guild-wars-2/)

Duolingo describes how counting completed sessions favored shorter, easier activities and how XP-based monthly challenges invited bulk XP farming. It moved those challenges toward quests and rebalanced path rewards to encourage curriculum progress. These are company-reported product findings, not independent proof that the same interventions will work here. [Duolingo: Time Spent Learning Well](https://blog.duolingo.com/time-spent-learning-well/)

### Computed pacing scenarios

At the proposed 0.55% rate, the next-level requirement is 100 XP at level 1, 1,540 at 500, 13,850 at 900, and 23,710 at 998. With an illustrative 300 XP/day (not an observed user median), the last three transitions require approximately 5.1, 46.2, and 79.0 days respectively. Across all 998 transitions, the mean requirement is about 4,325 XP, or 14.4 days at that hypothetical daily rate. Redistributing the same total cannot make every level quick at that earning rate.

If the owner wants the cap closer to 50 baseline books, the same formula with a 0.53% growth rate yields 3,669,390 cumulative XP, approximately 50.96 books. This is only a calibration alternative, not an approved change or a remedy for the underlying workload and pacing issues. Book-equivalent calculations assume all sixteen stages cover the same 500 sentences and the same three-cycle rule, no optional extra cycles, and a single language's XP pool. Only methods 1/stages 1–2 currently have implemented playback, so later-method workloads need validation.

The 999 cap and roughly 60-book total are defensible as a long-term collection or practice record. They are insufficient as the main day-to-day motivator. With a fixed earning unit, the exponential curve makes later level-ups require roughly 237 times the first transition's effort; later-stage feedback therefore needs a shorter horizon than the next lifetime level.

First validate observed cycle duration and sustainable session volume. Then tune near-term milestones against those observations. Changing the growth rate merely to make the total closer to 50 books does not solve daily workload or late-level pacing. Keep the distinction between practice effort, curriculum completion, and independently demonstrated learning explicit.

No cited source identifies an optimal universal XP growth rate, level count, daily cycle count, or number of books. A small learner trial should measure continued voluntary use and meaningful content progress alongside XP, with a separate learning measure if learning effectiveness is claimed.
