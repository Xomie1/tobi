# The constant that faked my model's edge

> A research project, not betting advice. A betting market is simply a hard, public benchmark to test a probability model against.

## The setup

The **EV Selection Pipeline** is five agents in a row:

1. **Fixture coordinator**: finds the day's fixtures on FotMob and resolves each league's odds-feed key.
2. **Team profiler**: pulls each team's last 10 same-tier matches and averages their real per-match xG.
3. **Quantitative modeller**: turns those attack and defence numbers into Poisson goal projections.
4. **Market evaluator**: prices the same markets from real bookmaker odds, removing the bookmaker's margin ("de-vigging") wherever a genuine two-sided market exists.
5. **Risk reporter**: compares model and market probabilities, applies a divergence guard and selects positive-EV picks.

One rule ran through the whole build: **every number is pulled from a live API or computed from one.** If real data isn't there, the pipeline writes down why and walks away from the pick rather than inventing a fallback.

That rule ended up mattering most in the one place I'd quietly broken it.

## The symptom

The model kept finding its biggest edges in the same place: **Over 3.5 goals**. The example that made me stop was Everton vs Crystal Palace, Over 3.5 at odds of 3.19:

| source | probability | expected value |
|---|---|---|
| my model | 39.07% | **+24.7%** (selected) |
| de-vigged market | 29.37% | −6.3% |
| league base rate | 30.90% | −1.4% |

The market sat almost exactly on the league base rate: it priced the game as roughly average. My model claimed two low-scoring sides would produce a far-above-average goals game. Each team had gone over 3.5 in just 8 of its 38 league matches that season.

The divergence guard *nearly* caught it: divergence was 0.097 against a 0.10 threshold.

## Three defects that compound

I backtested the goal model walk-forward on **7,082 real matches** (Premier League, La Liga, Serie A, Ligue 1 and Bundesliga, 2022-23 to 2025-26) and found three problems.

### 1. A hardcoded normaliser

```python
LEAGUE_AVG_GOALS = 1.35
home_lam = (h["xg_for"] / 1.35) * (a["xg_against"] / 1.35) * 1.35
```

That constant is the pivot of a multiplicative model, so it has to equal the actual league mean. The measured mean was **1.405** goals per team per match. Because the constant appears once on top and twice underneath, the error doesn't cancel. It inflates every projection.

Result: a projected mean of 2.973 total goals against an actual 2.820, a **+5.5% bias**, with 54.4% of matches over-projected.

### 2. No home advantage

The home and away formulas were the same expression with the teams swapped. In the data, home sides average about **0.28** more goals per match than away sides. My model's average home-minus-away gap was **−0.025**: very slightly favouring the away team.

### 3. No shrinkage on a 10-match sample

Ten matches is a small sample. Multiplying one team's noisy attack figure by another team's noisy defence figure squares the noise. Projected totals ranged from **0.74 to 8.86 goals**. An 8.86 isn't a football match.

## Why the bias only ever pointed one way

This is the part I find most interesting. The model wasn't just noisy. The selection policy only ever bet **Overs**, so it acted as a **one-way filter on the error**. Matches the model over-projected became bets, and matches it under-projected were silently ignored. Every bit of upward bias turned straight into claimed edge.

The bias doesn't spread evenly across lines, either. It amplifies in the tail, where a small shift in the mean moves a large share of the remaining probability:

| line | true P | biased P | phantom EV |
|---|---|---|---|
| Over 1.5 | 0.7723 | 0.7971 | +3.2% |
| Over 2.5 | 0.5353 | 0.5712 | +6.7% |
| Over 3.5 | 0.3125 | 0.3472 | **+11.1%** |

"Phantom EV" is the edge the model reports at a perfectly fair price, purely from the bias. The same underlying error manufactures **3.5× more fake edge at Over 3.5** than at Over 1.5. That's why the two biggest claimed edges in the run were both Over 3.5. Five of the eight selections claimed an edge *smaller* than their own line's phantom EV, so the bias alone was enough to explain them.

## The fix

- **Measured, venue-split normalisers** instead of one shared 1.35, later measured separately for each league.
- **Shrinkage toward the league mean**, `f = n / (n + K)`, so a team's rate becomes a blend of its own sample and what the league actually does. A clamp means no arithmetic accident can produce an 8.86 again.
- **Over 3.5 dropped.** Fixing the normaliser removes the known bias. Restricting the lines limits the damage from whatever bias remains. I wanted both, not either.

Log loss improved by 8–9% on every line. Re-running live produced far fewer selections, no Over 3.5 picks and only modest claimed edges, exactly what the analysis predicted.

## The guess I had to un-guess

My first shrinkage constant was `K = 6`: a "conservative middle" I *picked* rather than measured. When I compared the model against a simple per-league baseline at real scale (10,286 matches), it was still **losing**.

So I grid-searched K from 1 to 100 against that dataset:

| K | Over 1.5 log loss | Over 2.5 log loss |
|---|---|---|
| 6 (my guess) | 0.56231 | 0.70523 |
| 20 | 0.55284 | 0.69094 |
| **40** | **0.55184** | **0.68895** |
| 100 | 0.55250 | 0.68934 |
| per-league baseline | 0.55384 | 0.69080 |

At K=6 the model lost to the baseline on both lines. At K=40 it beat it on both, by +0.36% and +0.27%. That's small, but real and reproducible. I then re-ran the test on **real xG instead of goals** (1,670 matches across the Championship, League One and League Two) and it landed close to the same optimum. Two datasets and two input signals agreed.

## What's still not proven

Log loss shows the model describes football reasonably well. It doesn't show the model can beat a market. The only real evidence for that is **beating the closing line**, so every selection is now logged with everything needed to grade it against the closing price. That check is the next milestone. Until it's done, I treat every "edge" as unconfirmed.

## What I took away

- **Selection policies amplify bias.** A symmetric error becomes a one-directional one the moment you only act on one side of it.
- **Tails magnify small errors.** A 5.5% shift in the mean became an 11% fake edge at Over 3.5.
- **Measure constants, don't pick them.** The two numbers that hurt most, 1.35 and K = 6, were both chosen instead of measured.
- **Write down null results.** Several fixes made no measurable difference at small sample sizes. Those notes saved me from "fixing" the same thing twice.
