# Building an AI DJ that learns from your skips

I wanted something like Spotify's DJ that I could actually look inside. **Vibe DJ** is the result. Pick a starting song (or hit "Surprise me") and it keeps choosing the next track to hold the vibe: similar sound, a mixable tempo, a compatible key, and energy that moves smoothly instead of jumping around. Skip something, and it adjusts.

## Step zero: where's the data?

Spotify no longer gives new apps tempo, energy or key, and a DJ can't work without them. So I compute them myself.

Music comes from [Audius](https://audius.co), an open catalogue you can stream from legally and for free. An ingest script pulls tracks and runs [librosa](https://librosa.org) over the first ~60 seconds of each one, skipping the intro:

- **BPM** from beat tracking, folded into a 70–180 range
- **Key** from chroma features matched against Krumhansl key profiles, stored in **Camelot notation** (8A, 5B…), which is how DJs think about harmonic mixing
- **Energy, brightness and percussiveness**
- a **timbre vector** (MFCC + chroma) for "sounds like" similarity

If the uploader supplied BPM or key metadata, that wins over my estimate. Everything lands in a SQLite catalogue, and re-running the ingest only analyses new tracks.

```
Audius API ──> ingest.py ──> librosa analysis ──> SQLite catalogue
                                                        │
 Browser player <── FastAPI <── Recommender <───────────┘
      │                              ▲
      └── skip / finish / like ──────┘  (online learning)
```

## Picking the next track

I deliberately didn't train one big model. Every candidate gets scored on components you can explain:

| component | meaning |
|---|---|
| `sim` | cosine similarity to the session's recent sound (last 5 tracks, recency-weighted) |
| `bpm` | tempo fit with the current track; half and double time count |
| `key` | Camelot-wheel compatibility: same key, neighbours, relative major/minor |
| `energy` | fit to the *target* energy: current level + recent trend + your vibe setting |
| `genre` | share of recent tracks in the same genre |
| `fresh_artist` | 0 if the artist played in the last 3 tracks |
| `skip_sim` | similarity to tracks you just skipped (negative weight) |
| `popularity` | log play count, a light prior |

Tempo fit, for example, is 1.0 for a matching tempo and falls off quickly past about 6%. Half and double time count as a match, because a 70 BPM track mixes fine into a 140 BPM one:

```python
def bpm_fit(a, b):
    if not a or not b:
        return 0.5
    best = min(abs(b * r - a) / a for r in (0.5, 1.0, 2.0))
    return math.exp(-((best / 0.06) ** 2))
```

The score is a weighted sum. Instead of always taking the winner, the DJ samples from the top 10 with a softmax (temperature 0.15), so two sessions from the same seed don't come out identical.

Why components plus weights instead of a model?

1. **It works on day one** with zero training data. The starting weights are just sensible guesses: sound similarity 2.0, tempo 1.5, energy 1.5, key 0.8, "sounds like what you skipped" −1.5.
2. **Every pick is explainable.** The player shows reasons like *"124 BPM (+2), key 8A mixes clean, lifting the energy"*, generated straight from the components.
3. **The skip signal has something concrete to learn from.**

## Learning from skips

Skipping in the first 30 seconds is a negative label. Finishing a track is positive, and a like counts double. Each event runs **one SGD step of logistic regression** on the components of the track that was played:

```python
def learn(self, comps, liked):
    """One SGD step of logistic regression: P(listened) = sigmoid(w . x)."""
    x = np.array([comps[c] for c in COMPONENTS])
    w = np.array([self.weights[c] for c in COMPONENTS])
    z = float(x @ w + self.weights["bias"])
    p = 1 / (1 + math.exp(-np.clip(z, -30, 30)))
    g = (1.0 if liked else 0.0) - p
    for c, xi in zip(COMPONENTS, x):
        self.weights[c] += self.lr * g * xi
    self.weights["bias"] += self.lr * g
```

The weights drift toward what *you* care about. Maybe you don't mind key clashes but hate tempo jumps. The weights are saved, so the DJ gets better the more you use it.

## Sections, like a real DJ set

Before building more, I read up on what Spotify has actually published about its DJ. Not the recommender internals, which aren't public. What is public: their personalisation stack picks the music, generative AI writes the commentary, a voice model speaks it, and a session plays in **sections** you can skip between.

So Vibe DJ plays in themed blocks of 4 to 6 tracks. A theme is a genre plus an energy band (Chilled, Warm or Peak-time, splitting your catalogue into thirds). Picks stay inside the section's theme. When a section ends, the next one starts on the closest-sounding *different* theme, so the move feels smooth.

**"Switch it up"** does the opposite. It jumps to a section in another genre, picked from the 40% of tracks that sound *least* like what's playing. "Turn up" and "Wind down" nudge the target energy one notch per track, and "Hold" keeps it steady.

## Logging for later

Every pick also records the probability it was chosen with. That sounds like bookkeeping, but it's what makes **off-policy evaluation** possible: replay logged sessions and estimate how a *different* set of weights would have done, without shipping it to anyone. Spotify Research describes the same idea for BaRT, the contextual-bandit system behind their Home page, and their public streaming-sessions dataset treats skips as a core implicit signal for the same reason.

## Small engineering details

- **API key rotation.** Each free Audius key has its own rate limit, so the client rotates through as many keys as you give it, one per request. A key that gets a 429 or 401 sits out for a while and the next takes over. Only the public key reaches the browser; bearer tokens stay on the server.
- **Tests without the network.** The suite runs on a synthetic catalogue, so `pytest -q` passes offline.
- **A small API.** Start a session, ask for the next pick (with its reason and scoring components), report skip/finish/like, and change the vibe. That's it.

## What's next

1. **Better embeddings.** Swap the MFCC vector for CLAP or MERT audio embeddings, the biggest expected quality jump.
2. **A DJ voice.** `explain()` already produces a reason for every pick. An LLM can turn that into a one-line intro, and TTS can speak it between tracks.
3. **Offline evaluation** from the logged propensities, measuring skip rate per weight setting.
4. **Postgres + pgvector** and **per-user weights** once the catalogue reaches tens of thousands of tracks.
5. **Crossfades** with two audio elements, timed off the BPM.

The code is on [GitHub](https://github.com/Xomie1/VibeDj). If you build something similar, credit the artists. Audius asks apps to, and it's the right thing to do.
