/** Topics / name stems that signal AI affinity. Lowercase. */
export const AI_KEYWORDS: readonly string[] = [
  'ai',
  'llm',
  'llms',
  'gpt',
  'openai',
  'anthropic',
  'claude',
  'gemini',
  'ollama',
  'vllm',
  'langchain',
  'llamaindex',
  'rag',
  'embedding',
  'embeddings',
  'vector',
  'vectorstore',
  'transformer',
  'transformers',
  'machine-learning',
  'machinelearning',
  'deep-learning',
  'deeplearning',
  'neural',
  'agent',
  'agents',
  'agentic',
  'mcp',
  'model-context-protocol',
  'prompt',
  'prompts',
  'chatbot',
  'copilot',
  'inference',
  'fine-tune',
  'finetune',
  'finetuning',
  'huggingface',
  'hugging-face',
  'pytorch',
  'tensorflow',
  'diffusion',
  'stable-diffusion',
  'whisper',
  'tts',
  'stt',
  'nlp',
  'computer-vision',
] as const

/**
 * Returns a 0..1 affinity from free text + topics.
 * Simple hit count, not ML.
 */
export function keywordAffinity(texts: string[], topics: string[] = []): number {
  const haystack = [...texts, ...topics]
    .join(' ')
    .toLowerCase()
    .replace(/[_\-/]+/g, ' ')

  let hits = 0
  for (const kw of AI_KEYWORDS) {
    // word-ish match: avoid matching "ai" inside "email" via boundaries
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(kw)}(?:[^a-z0-9]|$)`, 'i')
    if (re.test(haystack)) hits += 1
  }

  // ~6 distinct keyword families is "very AI-aligned"
  return Math.min(1, hits / 6)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
