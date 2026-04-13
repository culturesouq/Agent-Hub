# Vael — Knowledge Inbox

Drop `.md` or `.txt` files here. On her next sweep, Vael will read every file,
decide what is worth learning from it, validate each candidate against her
existing knowledge, and seed what passes into her DNA corpus.

She processes each file herself. No admin approval. No filter between her and the content.

## How to use

1. Save any document as a `.md` or `.txt` file and place it in this folder.
2. Vael will pick it up automatically on her next full sweep (1 AM or 1 PM UTC),
   or you can trigger a manual sweep from the Vael Workspace tab.
3. After she processes a file, it moves to the `processed/` subfolder.
   You can check what she extracted from the sweep logs.

## What works well as inbox content

- Research papers or articles (paste the text)
- Framework documentation excerpts
- Interview transcripts about AI behaviour
- Case studies about operator–user dynamics
- Anything you believe would strengthen Vael's understanding

## What she will do with each file

Vael reads the full content, extracts 3–8 knowledge candidates she considers
relevant, validates each one against her existing corpus for accuracy and
non-redundancy, and seeds any that pass into her permanent knowledge base.
She rejects anything that conflicts with what she already knows or that she
cannot verify as sound.

## Notes

- Files must be UTF-8 text (`.md` or `.txt`).
- Max ~50,000 characters per file — anything longer gets trimmed to first 8,000 chars.
- She will not duplicate entries she has already learned.
