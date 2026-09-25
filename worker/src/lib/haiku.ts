import { env } from './env.js'
import { COST } from './cost.js'

export interface HaikuTool { name: string; description: string; input_schema: Record<string, unknown> }

/** One forced tool call to the cheap model; returns the tool input and its cost. Throws on any failure. */
export async function callHaikuTool({ system, user, tool, maxTokens, timeoutMs = 60_000 }: { system: string; user: string; tool: HaikuTool; maxTokens: number; timeoutMs?: number }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: env.screenModel,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await res.json() as any
  if (!res.ok) throw new Error(`${res.status} ${body?.error?.message ?? 'request failed'}`)
  const costUsd = ((body.usage?.input_tokens ?? 0) * COST.haikuInputPerMTok + (body.usage?.output_tokens ?? 0) * COST.haikuOutputPerMTok) / 1_000_000
  return { input: body.content?.find((b: any) => b.type === 'tool_use')?.input as unknown, costUsd }
}
