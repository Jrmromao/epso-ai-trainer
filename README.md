# EPSO AI Trainer

Personal study trainer for **EPSO/AD/430/26 (AD 8 — Artificial Intelligence)**.
Generates and grades practice MCQs for the field-knowledge topics and the
text-based reasoning tests using an LLM (DeepSeek, OpenAI-compatible).

> Personal project. Not affiliated with EPSO. Sample questions are self-authored,
> not official EPSO material.

## What it trains
- Field MCQ topics: AI Act, ML fundamentals, GenAI/RAG, MLOps, Trustworthy AI, Policy
- Verbal reasoning (text passage + True/False/Cannot-say)
- Numerical reasoning (with mandatory worked solution shown)

## What it does NOT train (reminder built into the UI)
- **Abstract reasoning** — visual figures; practise on the official EPSO mock
  tests + a validated platform. The app links out and tracks self-reported scores.

## Setup
1. Install deps: `npm install`
2. Copy env: `cp .env.example .env.local` and fill in values.
   - Get a DeepSeek API key at https://platform.deepseek.com (`LLM_API_KEY`).
   - Set `APP_ACCESS_CODE` (the code you'll enter to use the app) and
     `SESSION_SECRET` (any long random string).
3. Run: `npm run dev` → http://localhost:3000

## Security
- `/api/*` is gated by a server-checked access code (httpOnly signed cookie).
- Daily LLM-call cap (`LLM_DAILY_LIMIT`) bounds cost even if the gate is bypassed.
- Never commit `.env.local` (gitignored).

## Stack
Next.js (App Router) + TypeScript + Tailwind. Deploys to Vercel.
