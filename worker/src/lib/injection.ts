/** Heuristic detector for prompt-injection text in scraped pages. Detection only — content is always treated as data. */
const PATTERNS: RegExp[] = [
  /ignore (all |any )?(the )?(previous|prior|above) (instructions|prompts|messages)/i,
  /disregard (all |any )?(the )?(previous|prior|above|your) (instructions|rules)/i,
  /you are now (a|an|the) /i,
  /(reveal|export|print|show|send) (your|the) (system prompt|api[ _-]?key|secrets?|credentials)/i,
  /new instructions?:/i,
  /(email|contact|message) (all|every) (the )?leads/i,
  /\b(assistant|ai|agent|llm)s?,? (must|should) (now )?(ignore|email|send|contact)/i,
  /<\/?(system|instructions?)>/i,
]

export function detectInjection(text: string): string[] {
  const hits: string[] = []
  for (const re of PATTERNS) {
    const m = text.match(re)
    if (m) hits.push(m[0].slice(0, 120))
  }
  return hits
}

/** Wraps untrusted text so the model sees an explicit data boundary. Strips any attempt to close the wrapper early. */
export function wrapUntrusted(text: string, source: string): string {
  const safe = text.replace(/<\/?untrusted_website_content[^>]*>/gi, '')
  return `<untrusted_website_content source="${source}">\n${safe}\n</untrusted_website_content>`
}
