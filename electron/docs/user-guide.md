# OpSoul — User Guide

Version 0.1.0 · Last updated June 2026
[Screenshots to be added]

---

## What is OpSoul?

OpSoul is your own private AI platform that runs entirely on your computer.
No subscription. No cloud dependency. No data leaving your machine.

You install it once. It runs silently in the background. You open it like a
website in your browser — but it is 100% yours, running locally.

Each "operator" is a distinct AI assistant you build with its own name,
personality, knowledge base, tools, and purpose. They remember context, use
real tools (search the web, read files, call APIs), and grow over time. You
control everything.

---

## What You Need

- A Mac with Apple Silicon (M1, M2, M3, or M4 chip)
- macOS 12 Ventura or later
- An API key from an AI provider (OpenAI, Anthropic, or similar) — you bring
  your own; OpSoul does not include one by default
- Internet connection only for the AI calls and any tools that need the web;
  the platform itself runs fully offline

[Note: Windows installer coming soon]

---

## Installation

### Step 1 — Download

Go to the download page and click the Mac button. You will download a file
called something like `OpSoul-0.1.0-arm64.dmg`.

[Screenshot: download page with Mac button highlighted]

### Step 2 — Open the installer

Double-click the `.dmg` file you downloaded. A window appears showing the
OpSoul icon and an Applications folder shortcut.

[Screenshot: DMG window]

### Step 3 — Drag to Applications

Drag the OpSoul icon onto the Applications folder icon. Wait a few seconds
for the copy to complete.

[Screenshot: drag gesture]

### Step 4 — Open OpSoul

Open your Applications folder. Double-click OpSoul.

The first time you open it, macOS will ask if you want to open an app
downloaded from the internet. Click Open. This is normal — OpSoul is signed
and approved by Apple.

[Screenshot: macOS open confirmation dialog]

---

## First Launch

OpSoul takes about 15–30 seconds to start the first time. It is setting up
its built-in database. You will see a small loading screen.

[Screenshot: loading screen]

When it finishes, your browser opens automatically at:
`http://localhost:3001`

---

## Setup Wizard

The first time OpSoul starts, it will ask you to create your admin account.
This is the account you use to log in and manage everything.

### Step 1 — Create your admin account

Enter a username and a strong password. This stays on your computer — it is
not sent anywhere.

[Screenshot: account creation form]

### Step 2 — Add your AI model

OpSoul needs an API key to talk to an AI. You bring your own — this keeps
your conversations private and your costs under your control.

Choose your provider:
- **OpenAI** — paste your OpenAI API key (starts with `sk-`)
- **Anthropic** — paste your Anthropic API key (starts with `sk-ant-`)
- **OpenRouter** — paste your OpenRouter key (access to many models at once)
- **Azure OpenAI** — paste your Azure endpoint and key
- **Custom** — any OpenAI-compatible endpoint

Where to get an API key:
- OpenAI: platform.openai.com → API keys
- Anthropic: console.anthropic.com → API keys
- OpenRouter: openrouter.ai → Keys

[Screenshot: model configuration panel]

### Step 3 — Done

You are in. The main console opens.

[Screenshot: main console]

---

## The Console

The console is the control panel for your OpSoul platform. From here you can:

- **Create operators** — each operator is a separate AI assistant
- **Configure operators** — name, personality, knowledge, tools
- **Chat with operators** — open conversations
- **See GROW metrics** — how each operator is developing over time
- **Manage your account** — change password, update model settings

[Screenshot: console overview with labels]

---

## Creating Your First Operator

An operator is an AI with a specific purpose — a customer support assistant,
a research helper, a writing partner, whatever you need.

1. Click **New Operator** in the console
2. Give it a name (example: "Research Assistant")
3. The setup wizard will guide you through:
   - Basic identity and purpose
   - What it knows (you can upload documents)
   - What it can do (web search, file reading, etc.)
4. Click **Save**

Your operator is ready. Click its name to open a chat.

[Screenshot: new operator creation flow]

---

## Chatting With an Operator

Open an operator and start typing. The operator:

- Remembers your conversation
- Can search the web if you ask it to
- Can read files you upload
- Learns from your interactions over time (the GROW system)

[Screenshot: chat interface]

---

## Adding Knowledge to an Operator

You can give an operator documents to read and remember — PDFs, Word files,
plain text. The operator uses this knowledge when answering questions.

1. Open an operator
2. Go to the **Knowledge Base** tab
3. Click **Upload Document**
4. Choose your file

[Screenshot: knowledge base panel]

---

## GROW — How Operators Develop

Each operator has a GROW score that measures how it is developing:

- **Knowledge** — how much useful information it has absorbed
- **Growth** — how much it has learned from interactions
- **Integrity** — how consistent and reliable its behaviour is

You can see this score in the operator settings. You can also lock an
operator at different levels:

- **Open** — the operator continues to develop from conversations
- **Controlled** — development is limited; behaviour is more stable
- **Frozen** — no further development; the operator behaves identically
  every time

[Screenshot: GROW panel]

---

## Connecting Your Own AI Model (Per Operator)

You can give each operator its own AI model — different from the platform
default. For example, one operator uses GPT-4o for detailed analysis, another
uses a fast model for quick replies.

1. Open an operator
2. Go to **Settings**
3. Scroll to **AI Model**
4. Choose provider, paste your key, enter the model name
5. Click **Test Connection** — should return a response in under 2 seconds
6. Click **Save**

[Screenshot: BYO model panel]

---

## The Tray Icon

When OpSoul is running, a small icon appears in your Mac menu bar (top right).

- Click it to open the console in your browser
- Right-click for options: Open Console / Getting Started / Stop OpSoul / Quit

OpSoul runs silently — you can close the browser and it stays running in the
background until you quit from the tray.

[Screenshot: tray menu]

---

## Quitting OpSoul

Right-click the tray icon → Quit.

This stops the server and the database. The next time you open OpSoul from
Applications it starts fresh (your data is saved — only the process stops).

---

## Updating OpSoul

When a new version is released, download the new `.dmg` and repeat the
installation steps. Your data and operators are kept — they live in a
separate database folder that survives updates.

---

## Troubleshooting

**OpSoul says "startup failed" or times out**

1. Quit OpSoul from the tray (or force-quit from Activity Monitor)
2. Wait 10 seconds
3. Open OpSoul again from Applications

If it keeps failing, the database may need a reset. Contact support.

**The browser does not open**

Open your browser manually and go to: `http://localhost:3001`

**I forgot my admin password**

Currently the admin password can only be reset by clearing the local database.
This will erase all operators and data. Contact support before doing this.

**Something else**

Open a new chat on the OpSoul console and describe the issue — the built-in
support operator will help diagnose it.

---

## Privacy

Everything stays on your machine:
- Your operators, conversations, and knowledge base: stored locally
- Your API key: stored encrypted on your disk, never sent to OpSoul
- AI calls: sent directly from your machine to your chosen AI provider
- No telemetry, no analytics, no "phone home"

OpSoul itself makes no outbound connections. Your API calls go to your
provider (OpenAI, Anthropic, etc.) directly.

---

## About OpSoul

OpSoul is built by Mohamed Al Hajeri.
