// Retorno do OAuth das plataformas. Público (sem JWT): a segurança vem do "state" assinado.
// Redireciona de volta ao site com o resultado em #integracoes?ok=… ou ?erro=… (o Supabase não serve HTML).
import { admin, readState } from "../_shared/common.ts";
import { provider, saveTokens } from "../_shared/store.ts";

const back = (ret: string | undefined, params: Record<string, string>) => {
  const q = new URLSearchParams(params).toString();
  if (!ret) return new Response(params.erro ? `Erro: ${params.erro}` : "Conectado. Pode fechar esta aba.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(null, { status: 302, headers: { Location: `${ret.split("#")[0]}#integracoes?${q}` } });
};

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams;
  let ret: string | undefined;
  let id = "";
  try {
    const st = await readState(q.get("state") ?? "");
    ret = /^https?:\/\//.test(st.ret) ? st.ret : undefined;
    id = st.provider;
    if (q.get("error")) throw new Error(q.get("error_description") ?? q.get("error") ?? "Autorização recusada.");
    const p = provider(st.provider);
    const tokens = await p.exchange(q);
    const db = admin();
    await saveTokens(db, st.ws, p.id, tokens);
    await db.from("integrations").upsert({
      workspace_id: st.ws, provider: p.id, status: "conectado", account_name: tokens.account_name ?? p.label,
      last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,provider" });
    return back(ret, { ok: p.id });
  } catch (e) {
    console.error(e);
    return back(ret, { provedor: id, erro: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
  }
});
