// Pluggable AI-draft provider for the inbox composer's "Suggest reply" button. No AI
// credentials are configured on this server as of writing (checked ANTHROPIC_API_KEY /
// OPENAI_API_KEY — neither is set) — this is real integration code, not a stub, but it is
// genuinely inert until one of those env vars is added to apps/api/.env and the service is
// restarted. isAiConfigured() lets the route give an honest "not set up" response instead of
// pretending to work.

export function isAiConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

type DraftInput = {
  contactName: string;
  history: { direction: "in" | "out"; body: string }[]; // most recent last
};

const SYSTEM_PROMPT =
  "You are a customer support agent's drafting assistant for a WhatsApp Business inbox. " +
  "Given the recent conversation, draft ONE short, polite, ready-to-send reply as the business. " +
  "Match the customer's language. No greeting fluff, no signature, no quotation marks — just the message body. " +
  "If the conversation doesn't have enough context to draft a specific reply, draft a brief clarifying question instead.";

function buildTranscript(input: DraftInput): string {
  return input.history
    .map((m) => `${m.direction === "in" ? input.contactName : "Business"}: ${m.body}`)
    .join("\n");
}

export async function draftReply(input: DraftInput): Promise<{ draft: string } | { error: string }> {
  const transcript = buildTranscript(input);

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 200,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Conversation so far:\n${transcript}\n\nDraft the next reply.` }],
        }),
      });
      if (!res.ok) return { error: `Anthropic API error ${res.status}: ${await res.text()}` };
      const data = await res.json();
      const draft = data.content?.[0]?.text?.trim();
      return draft ? { draft } : { error: "Anthropic returned an empty draft" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 200,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Conversation so far:\n${transcript}\n\nDraft the next reply.` },
          ],
        }),
      });
      if (!res.ok) return { error: `OpenAI API error ${res.status}: ${await res.text()}` };
      const data = await res.json();
      const draft = data.choices?.[0]?.message?.content?.trim();
      return draft ? { draft } : { error: "OpenAI returned an empty draft" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { error: "not_configured" };
}
