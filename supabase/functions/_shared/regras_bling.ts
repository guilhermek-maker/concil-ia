// Engenharia reversa das regras fiscais que o Bling aplica hoje: lê o XML de notas de venda autorizadas
// (uma ou duas por UF de destino) e resume CFOP, CST, alíquotas, DIFAL/FCP, PIS/COFINS, IPI, frete,
// presença, intermediador e regime do emitente. O resultado vira a base da parametrização fiscal do EcomBalance.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { fetchJson, sleep } from "./common.ts";
import { validSecret } from "./store.ts";

const API = () => Deno.env.get("BLING_API_BASE") || "https://api.bling.com.br/Api/v3";
const tag = (x: string, t: string) => x.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? null;
const bloco = (x: string, t: string) => x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "";
const num = (v: string | null) => (v == null ? null : Number(v));

function lerXml(xml: string) {
  const ide = bloco(xml, "ide"), emit = bloco(xml, "emit"), dest = bloco(xml, "dest"), inter = bloco(xml, "infIntermed");
  const dets = [...xml.matchAll(/<det nItem="\d+">([\s\S]*?)<\/det>/g)].map((m) => m[1]);
  const itens = dets.map((d) => {
    const prod = bloco(d, "prod"), imp = bloco(d, "imposto"), icms = bloco(imp, "ICMS"), dif = bloco(imp, "ICMSUFDest"), ibs = bloco(imp, "IBSCBS");
    const icmsGrupo = icms.match(/<(ICMS\w+)>/)?.[1] ?? null;
    return {
      cfop: tag(prod, "CFOP"), ncm: tag(prod, "NCM"), cest: tag(prod, "CEST"), ean: tag(prod, "cEAN"),
      icms_grupo: icmsGrupo, orig: tag(icms, "orig"), cst: tag(icms, "CST") ?? tag(icms, "CSOSN"), modBC: tag(icms, "modBC"),
      pRedBC: num(tag(icms, "pRedBC")), pICMS: num(tag(icms, "pICMS")), vBC: num(tag(icms, "vBC")), pFCP: num(tag(icms, "pFCP")),
      pICMSST: num(tag(icms, "pICMSST")), mva: num(tag(icms, "pMVAST")),
      difal: dif ? { pFCPUFDest: num(tag(dif, "pFCPUFDest")), pICMSUFDest: num(tag(dif, "pICMSUFDest")), pICMSInter: num(tag(dif, "pICMSInter")), pICMSInterPart: num(tag(dif, "pICMSInterPart")) } : null,
      pis: { cst: tag(bloco(imp, "PIS"), "CST"), p: num(tag(bloco(imp, "PIS"), "pPIS")) }, cofins: { cst: tag(bloco(imp, "COFINS"), "CST"), p: num(tag(bloco(imp, "COFINS"), "pCOFINS")) },
      ipi: { cst: tag(bloco(imp, "IPI"), "CST"), p: num(tag(bloco(imp, "IPI"), "pIPI")), cEnq: tag(bloco(imp, "IPI"), "cEnq") },
      vProd: num(tag(prod, "vProd")), vFrete: num(tag(prod, "vFrete")), vDesc: num(tag(prod, "vDesc")), vICMS: num(tag(icms, "vICMS")), vBCICMS: num(tag(icms, "vBC")),
      vBCPIS: num(tag(bloco(imp, "PIS"), "vBC")), vPIS: num(tag(bloco(imp, "PIS"), "vPIS")), vBCCOFINS: num(tag(bloco(imp, "COFINS"), "vBC")), vCOFINS: num(tag(bloco(imp, "COFINS"), "vCOFINS")),
      vDIFAL: dif ? num(tag(dif, "vICMSUFDest")) : null, vFCPDest: dif ? num(tag(dif, "vFCPUFDest")) : null,
      vIBS: ibs ? num(tag(ibs, "vIBS")) : null, vCBS: ibs ? num(tag(bloco(ibs, "gCBS"), "vCBS")) : null,
      ibscbs: ibs ? { cst: tag(ibs, "CST"), cClassTrib: tag(ibs, "cClassTrib"), vBC: num(tag(ibs, "vBC")), pIBSUF: num(tag(bloco(ibs, "gIBSUF"), "pIBSUF")), pIBSMun: num(tag(bloco(ibs, "gIBSMun"), "pIBSMun")), pCBS: num(tag(bloco(ibs, "gCBS"), "pCBS")) } : null,
    };
  });
  return {
    natOp: tag(ide, "natOp"), serie: tag(ide, "serie"), indPres: tag(ide, "indPres"), indFinal: tag(ide, "indFinal"), idDest: tag(ide, "idDest"),
    indIntermed: tag(ide, "indIntermed"), intermediador: inter ? { cnpj: tag(inter, "CNPJ"), id: tag(inter, "idCadIntTran") } : null,
    crt: tag(emit, "CRT"), uf_emit: tag(bloco(emit, "enderEmit"), "UF"), ie_emit: tag(emit, "IE"),
    uf_dest: tag(bloco(dest, "enderDest"), "UF"), indIEDest: tag(dest, "indIEDest"), modFrete: tag(bloco(xml, "transp"), "modFrete"),
    tPag: [...xml.matchAll(/<tPag>(\d+)<\/tPag>/g)].map((m) => m[1]), infCpl: tag(bloco(xml, "infAdic"), "infCpl")?.slice(0, 300) ?? null, itens,
  };
}

export async function lerRegrasFiscaisBling(db: SupabaseClient, ws: string, deadline = Date.now() + 100_000) {
  const sec = await validSecret(db, ws, "bling");
  const H = { Authorization: `Bearer ${sec.access_token}`, Accept: "application/json" };
  const get = async (p: string) => { await sleep(350); return fetchJson(`${API()}${p}`, { headers: H }); };
  const ini = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10), fim = new Date().toISOString().slice(0, 10);
  const lista: any[] = [];
  for (let pg = 1; pg <= 4; pg++) {
    const q = new URLSearchParams({ pagina: String(pg), limite: "100", tipo: "1", dataEmissaoInicial: `${ini} 00:00:00`, dataEmissaoFinal: `${fim} 23:59:59` });
    const l = (await get(`/nfe?${q}`))?.data ?? [];
    lista.push(...l);
    if (l.length < 100) break;
  }
  const porUF = new Map<string, any[]>(), amostras: any[] = [];
  const natureza = new Map<string, number>();
  for (const n of lista) {
    if (Date.now() > deadline || amostras.length >= 70) break;
    const d = (await get(`/nfe/${n.id}`).catch(() => null))?.data;
    if (!d || ![5, 6, 7].includes(Number(d.situacao))) continue; // autorizada/emitida
    const uf = d.contato?.endereco?.uf ?? null;
    if (uf && (porUF.get(uf)?.length ?? 0) >= 2) continue;
    const link = d.xml || d.linkXML || null;
    if (!link) continue;
    const r = await fetch(link).catch(() => null);
    const xml = r?.ok ? await r.text() : "";
    if (!xml.includes("<infNFe")) continue;
    const x = lerXml(xml);
    amostras.push({ numero: d.numero, loja: d.loja?.id ?? null, ...x });
    if (x.uf_dest) (porUF.get(x.uf_dest) ?? porUF.set(x.uf_dest, []).get(x.uf_dest)!).push(x);
    if (x.natOp) natureza.set(x.natOp, (natureza.get(x.natOp) ?? 0) + 1);
  }
  const moda = (a: (string | number | null | undefined)[]) => { const c = new Map<string, number>(); for (const v of a) if (v != null) c.set(String(v), (c.get(String(v)) ?? 0) + 1); return [...c].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null; };
  const itens = amostras.flatMap((a) => a.itens.map((i: any) => ({ ...i, uf: a.uf_dest })));
  const regrasUF: Record<string, unknown> = {};
  for (const [uf, l] of porUF) {
    const it = l.flatMap((a) => a.itens);
    regrasUF[uf] = { cfop: moda(it.map((i: any) => i.cfop)), cst: moda(it.map((i: any) => i.cst)), pICMS: moda(it.map((i: any) => i.pICMS)), pRedBC: moda(it.map((i: any) => i.pRedBC)),
      pICMSUFDest: moda(it.map((i: any) => i.difal?.pICMSUFDest)), pFCPUFDest: moda(it.map((i: any) => i.difal?.pFCPUFDest)), pICMSInter: moda(it.map((i: any) => i.difal?.pICMSInter)), notas: l.length };
  }
  const intermed: Record<string, string> = {};
  for (const a of amostras) if (a.intermediador?.cnpj && a.intermediador?.id) intermed[a.intermediador.cnpj] = a.intermediador.id;
  let naturezas: unknown[] = [];
  try { naturezas = ((await get(`/naturezas-operacoes?limite=100`))?.data ?? []).map((n: any) => ({ id: n.id, descricao: n.descricao, situacao: n.situacao, padrao: n.padrao })); } catch { /* opcional */ }
  return {
    em: new Date().toISOString(), notas_lidas: amostras.length, periodo: { ini, fim },
    geral: {
      crt: moda(amostras.map((a) => a.crt)), uf_emitente: moda(amostras.map((a) => a.uf_emit)), serie: moda(amostras.map((a) => a.serie)), natOp: moda(amostras.map((a) => a.natOp)),
      indPres: moda(amostras.map((a) => a.indPres)), indFinal: moda(amostras.map((a) => a.indFinal)), modFrete: moda(amostras.map((a) => a.modFrete)), tPag: moda(amostras.flatMap((a) => a.tPag)),
      cst_icms: moda(itens.map((i) => i.cst)), icms_grupo: moda(itens.map((i) => i.icms_grupo)), orig: moda(itens.map((i) => i.orig)),
      cfop_interno: moda(itens.filter((i) => i.cfop?.startsWith("5")).map((i) => i.cfop)), cfop_interestadual: moda(itens.filter((i) => i.cfop?.startsWith("6")).map((i) => i.cfop)),
      pis_cst: moda(itens.map((i) => i.pis.cst)), pis_p: moda(itens.map((i) => i.pis.p)), cofins_cst: moda(itens.map((i) => i.cofins.cst)), cofins_p: moda(itens.map((i) => i.cofins.p)),
      ipi_cst: moda(itens.map((i) => i.ipi.cst)), ipi_enq: moda(itens.map((i) => i.ipi.cEnq)), pICMS_interno: moda(itens.filter((i) => i.cfop?.startsWith("5")).map((i) => i.pICMS)),
      com_difal: itens.filter((i) => i.difal).length,
      ibs_cst: moda(itens.map((i) => i.ibscbs?.cst)), ibs_cclass: moda(itens.map((i) => i.ibscbs?.cClassTrib)), p_cbs: moda(itens.map((i) => i.ibscbs?.pCBS)), p_ibs_uf: moda(itens.map((i) => i.ibscbs?.pIBSUF)), p_ibs_mun: moda(itens.map((i) => i.ibscbs?.pIBSMun)),
      ibs_itens: itens.filter((i) => i.ibscbs).length,
      ibs_exemplos: itens.filter((i) => i.ibscbs).slice(0, 5).map((i) => ({ uf: i.uf, vProd: i.vProd, vFrete: i.vFrete, vDesc: i.vDesc, vBCICMS: i.vBCICMS, vICMS: i.vICMS, vDIFAL: i.vDIFAL, vFCPDest: i.vFCPDest, vBCPIS: i.vBCPIS, vPIS: i.vPIS, vBCCOFINS: i.vBCCOFINS, vCOFINS: i.vCOFINS, vBCIBS: i.ibscbs.vBC, vIBS: i.vIBS, vCBS: i.vCBS })), com_st: itens.filter((i) => i.pICMSST).length, infCpl: moda(amostras.map((a) => a.infCpl)),
    },
    por_uf: regrasUF, intermediadores: intermed, naturezas: Object.fromEntries(natureza), naturezas_bling: naturezas,
    ncm: Object.fromEntries([...new Set(itens.map((i) => i.ncm).filter(Boolean))].map((n) => [n, itens.filter((i) => i.ncm === n).length])),
  };
}
