// Sugestão de solução para um atendimento (Claude): diagnóstico, caminho mais rápido e mensagem pronta.
// A mensagem nunca é enviada daqui: a equipe revisa no portal e decide.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { env, HttpError } from "./common.ts";

const MODEL = () => Deno.env.get("AI_MODEL_ATENDIMENTO") || "claude-sonnet-5";

const SYSTEM = `Você é o analista de pós-venda da Compra Store, loja de brinquedos que vende no Mercado Livre, Shopee e Magalu.
Equipe pequena: o objetivo é resolver cada caso no menor tempo, preservando a reputação da conta e a margem.
Regras:
- Responda em português do Brasil, tom cordial, objetivo e humano. Nunca culpe o cliente.
- Siga as políticas do marketplace: sem telefone, e-mail, links externos ou pedido de avaliação/nota; não ofereça nada fora da plataforma.
- Mensagem pós-venda do Mercado Livre: no máximo 350 caracteres. Resposta a pergunta: até 2.000 caracteres, direta.
- Em reclamação, prefira resolver antes de virar mediação: a mediação e o atraso pesam na reputação.
- Se o valor do produto for baixo perto do custo de logística reversa (ex.: até ~R$ 60), considere reembolso sem devolução.
- Produto com defeito/avaria/faltando peça: peça fotos só se ainda não houver; ofereça troca, envio da peça ou reembolso parcial conforme o caso.
- "Não recebi": verifique o rastreio; se entregue, informe com gentileza e abra apoio; se atrasado, tranquilize com o prazo.
- Nunca invente dados (prazos, rastreios, estoque). Se faltar informação, diga o que conferir.
Devolva APENAS um JSON válido, sem texto fora dele, com as chaves:
{"diagnostico": "1-2 frases", "solucao": "caminho recomendado em 1 frase", "passos": ["até 4 passos curtos"], "mensagem": "texto pronto para enviar ao cliente", "urgencia": "alta|media|baixa", "reembolso_sem_devolucao": true|false}`;

export async function sugerirAtendimento(db: SupabaseClient, ws: string, userId: string, id: string) {
  const { data: a } = await db.from("atendimentos").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!a) throw new HttpError(404, "Atendimento não encontrado.");
  const since = new Date(Date.now() - 86400_000).toISOString();
  const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("workspace_id", ws).gte("created_at", since);
  if ((count ?? 0) >= Number(Deno.env.get("AI_DAILY_LIMIT") || 400)) throw new HttpError(429, "Limite diário da IA atingido.");
  const caso = {
    canal: a.canal, tipo: a.tipo, etapa: a.etapa, motivo: a.motivo, produto: a.produto, valor_pedido: a.valor,
    prazo_para_agir: a.prazo, acoes_disponiveis: a.acoes, devolucao: a.devolucao, conversa: (a.mensagens ?? []).slice(-15),
    estoque_anuncio: a.dados?.estoque ?? null, notas_da_equipe: a.notas ?? null, hoje: new Date().toISOString().slice(0, 10),
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL(), max_tokens: 1200, system: SYSTEM, messages: [{ role: "user", content: `Caso:\n${JSON.stringify(caso, null, 1)}` }] }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `IA indisponível: ${j?.error?.message ?? r.status}`);
  await db.from("ai_usage").insert({ workspace_id: ws, user_id: userId, model: j.model ?? MODEL(), input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0 });
  const txt = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
  let s: any;
  try { s = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); } catch { throw new HttpError(502, "A IA não devolveu uma sugestão legível. Tente de novo."); }
  const sugestao = { ...s, em: new Date().toISOString(), modelo: j.model ?? MODEL() };
  await db.from("atendimentos").update({ sugestao }).eq("workspace_id", ws).eq("id", id);
  return sugestao;
}
