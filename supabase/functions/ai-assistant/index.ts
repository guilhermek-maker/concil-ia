// Assistente de conciliação com Claude.
// O navegador conduz o ciclo de ferramentas: esta função faz UMA chamada ao modelo por vez, com o
// system prompt e a lista de ferramentas fixos (definidos aqui, não pelo cliente). As ferramentas são
// executadas no navegador sobre os dados do workspace; vínculos financeiros só viram PROPOSTAS que o
// usuário confirma na tela.
import Anthropic from "npm:@anthropic-ai/sdk@0.128.0";
import { authorize, env, handler, HttpError, json } from "../_shared/common.ts";
import { SYSTEM, TOOLS } from "./prompt.ts";

const MODEL = () => Deno.env.get("AI_MODEL") || "claude-opus-5";
const EFFORT = () => Deno.env.get("AI_EFFORT") || "medium";
const DAILY_LIMIT = () => Number(Deno.env.get("AI_DAILY_LIMIT") || 400);

Deno.serve(handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const ws = String(body.workspace_id ?? "");
  const { user, db } = await authorize(req, ws);

  const messages = body.messages;
  if (!Array.isArray(messages) || !messages.length) throw new HttpError(400, "Envie a conversa.");
  if (messages.some((m: any) => m?.role !== "user" && m?.role !== "assistant")) throw new HttpError(400, "Mensagem inválida.");
  if (JSON.stringify(messages).length > 900_000) throw new HttpError(413, "Conversa muito longa. Comece uma nova conversa.");

  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT()) throw new HttpError(429, "Limite diário do assistente atingido. Ajuste AI_DAILY_LIMIT no Supabase se precisar de mais.");

  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  let response;
  try {
    // @ts-expect-error — `fallbacks` (beta server-side-fallback) ainda não está nos tipos do SDK
    response = await client.beta.messages.create({
      model: MODEL(),
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT() },
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, "O serviço de IA está ocupado. Tente em alguns segundos.");
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(500, "Chave da Anthropic inválida no servidor (ANTHROPIC_API_KEY).");
    if (e instanceof Anthropic.BadRequestError) throw new HttpError(400, `Requisição recusada pela API: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new HttpError(502, `Falha na API de IA: ${e.message}`);
    throw e;
  }

  await db.from("ai_usage").insert({
    workspace_id: ws, user_id: user.id, model: response.model,
    input_tokens: response.usage?.input_tokens ?? 0, output_tokens: response.usage?.output_tokens ?? 0,
  });

  return json({ content: response.content, stop_reason: response.stop_reason, model: response.model });
}));
