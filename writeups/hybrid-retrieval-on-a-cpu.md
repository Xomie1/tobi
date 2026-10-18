# Hybrid retrieval on a CPU: shipping an offline RAG assistant

For my MSc practicum at Trivera Labs, our nine-person team built an **AI Lecture Explainer** for an external client, NexusGuard. I was a backend engineer and the sprint lead across three Agile sprints. The brief came with two hard constraints:

1. **Fully on-premise.** No document, question or answer could leave the machine, so there could be zero external API calls.
2. **CPU only.** It had to run on ordinary hardware without a GPU.

You upload a lecture file (PDF, DOCX, TXT or Markdown), ask a question by typing or speaking, and get a streamed answer grounded in that document, read aloud if you want.

## The stack

| piece | choice | footprint |
|---|---|---|
| API | FastAPI | async, streaming, easy to test |
| LLM | `qwen2.5:3b` via Ollama | ~2 GB |
| embeddings | `nomic-embed-text` via Ollama | ~270 MB |
| vector store | ChromaDB, persisted to disk | no server to run |
| keyword index | BM25 (`rank_bm25`), persisted to disk | tiny |
| speech out | Kokoro TTS | ~82 MB |
| speech in | Whisper `base` | ~150 MB |

Everything runs on CPU. On first run the app starts Ollama and pulls the models itself, so setup is a `pip install` and one `uvicorn` command.

## Why a small model needs better retrieval, not a bigger prompt

On CPU, `qwen2.5:3b` generates roughly 8–15 tokens a second. Swapping in a bigger model wasn't an option, so the context we handed the model had to be right the first time. Small models benefit the most from high-quality context.

Pure vector search kept missing one kind of question: anything that hinges on an exact token. People ask both kinds:

- **Keyword-specific:** *"What is Task T-2.03?"* Embeddings blur `T-2.03` into "some task", while BM25 matches it exactly.
- **Paraphrased:** *"Who handles audio output?"* The document says "text-to-speech". BM25 sees no word overlap, while embeddings get it.

So every query runs **both** searches, and the results are fused.

## Reciprocal Rank Fusion in ten lines

BM25 scores and cosine distances live on completely different scales, so you can't just add them. Reciprocal Rank Fusion ignores the scores and uses only the **rank** each retriever gave a chunk:

```python
RRF_K = 60  # damping constant: higher = gentler rank weighting

def _rrf(vector_ids, bm25_ids):
    scores = {}
    for rank, doc_id in enumerate(vector_ids, 1):
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
    for rank, doc_id in enumerate(bm25_ids, 1):
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
    return sorted(scores, key=lambda x: scores[x], reverse=True)
```

A chunk both retrievers like rises to the top, and a chunk only one of them likes still gets a fair shot. There's nothing to train and only one knob; `k = 60` is the common default from the original RRF paper.

Around that function sit three small guards that came out of testing on real lecture files:

- **12 candidates** are pulled from each retriever before fusion.
- A vector hit with a very poor distance (above 0.92) is dropped **unless BM25 also found it**. The threshold is deliberately lenient because slide-based PDFs produce high distances even for good matches.
- **At most 5 chunks per source file**, so one long document can't crowd out the others.

## Not every question is a search

Some questions aren't looking for a passage at all: *"summarise the document"*, *"list all the team members"*, *"how many sprints are there?"* Retrieval returns a handful of chunks, and the honest answer needs all of them.

So the pipeline routes those **broad** questions differently. It skips retrieval, sends the whole indexed text (capped at 40,000 characters) and lets the model read it end to end. A small set of unit tests pins down which phrasings count as broad and which don't.

## The ingestion path

```
upload → extract text → clean → split into chunks
       → embed each chunk (nomic-embed-text)
       → ChromaDB.add()  +  BM25Index.add()
```

Details that mattered:

- **Tiny chunks are dropped.** Anything under 30 characters is usually a page number or a stray heading, and it pollutes BM25.
- **Every chunk is stored with its source file and a section label** taken from its first short line. Both go into the prompt as `[file — section]` above the chunk, so the model knows where each passage came from.
- **The two indexes stay in sync.** BM25 is pickled to disk next to ChromaDB, and if the BM25 file is missing on start-up it's rebuilt from what's already in Chroma.

## Streaming, because 10 tokens a second feels slow

A 300-token answer at 10 tokens a second takes 30 seconds. A spinner for 30 seconds feels broken. Streaming the same answer token by token over **Server-Sent Events** feels responsive, because the first words show up almost immediately.

Speech follows the same principle. Kokoro turns the answer into a WAV the browser can auto-play, and holding the mic button records a question for Whisper to transcribe.

## Testing a system built on models

The tests come in three layers:

- **unit**: text extraction and chunking, plus broad-query detection
- **integration**: ingest a known document, then check that retrieval finds the relevant chunk and that answers carry their sources
- **API / end-to-end**: every endpoint, upload → ask → stream

## Honest limitations

- **Scanned PDFs** with no embedded text produce no chunks, because there's no OCR yet.
- **Chat history lives in RAM**, so a server restart forgets the conversation.
- **Whisper's first call** takes about 10 seconds while the model loads.
- **A 3B model will sometimes answer generically** instead of from the document. That's the price of staying small and local, and the main reason retrieval quality got so much attention.

## What I'd tell someone starting the same project

1. **Start hybrid.** BM25 is cheap, needs no GPU, and covers exactly the cases where embeddings are weakest.
2. **Try RRF before you reach for a reranker.** It's a ten-line function with no model to download.
3. **Route broad questions separately.** "Summarise this" isn't a retrieval problem.
4. **Stream everything.** Perceived latency matters more than measured latency.

The code is on [GitHub](https://github.com/Xomie1/Ai-lecturer).
