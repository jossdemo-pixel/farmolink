import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";
import { encodeBase64 } from "https://deno.land/std@0.203.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const processShim = {
  env: {
    get API_KEY() {
      return (globalThis as any).Deno.env.get("API_KEY");
    },
  },
};
// @ts-ignore
globalThis.process = processShim;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KB_CONFIG_KEYS = [
  "app_name",
  "support_whatsapp",
  "support_email",
  "min_order_value",
  "financial_settlement_cycle",
  "legal_privacy_policy",
  "legal_terms_of_use",
];

const STOPWORDS = new Set([
  "com",
  "para",
  "uma",
  "umas",
  "uns",
  "dos",
  "das",
  "que",
  "como",
  "sobre",
  "onde",
  "quero",
  "preciso",
  "meu",
  "minha",
  "me",
  "tem",
  "por",
  "favor",
  "esta",
  "esse",
  "isso",
  "isto",
  "de",
  "da",
  "do",
  "na",
  "no",
  "a",
  "o",
  "e",
]);

type ProductContextItem = {
  id: string;
  name: string;
  price: number;
  stock: number;
  requiresPrescription: boolean;
  pharmacyId: string | null;
  pharmacyName: string;
  pharmacyStatus: string;
  pharmacyAvailable: boolean;
};

const normalize = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const safeJsonParse = (value: string, fallback: any) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const extractBearerToken = (headerValue: string) => {
  const parts = String(headerValue || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i--) {
    const match = parts[i].match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) return match[1].trim();
  }

  return "";
};

const createAdminClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const resolveUserFromToken = async (admin: any, token: string) => {
  if (!admin || !token) return null;

  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
};

const extractKeywords = (text: string, max = 6): string[] => {
  const words = normalize(text)
    .split(/[^a-z0-9]+/g)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  return Array.from(new Set(words)).slice(0, max);
};

const isProductIntent = (message: string) => {
  const msg = normalize(message);
  return /(medicamento|remedio|farmacia|preco|valor|quanto|custa|tem|stock|disponiv|reservar|comprar)/.test(msg);
};

const wantsKnowledgeSources = (message: string) => {
  const msg = normalize(message);
  return /(document|fontes|fonte|base de conhecimento|faq|origem da informacao|termos|privacidade)/.test(msg);
};

const shouldGreet = (history: any[]) => !Array.isArray(history) || history.length === 0;

const extractFirstName = (name: string) => {
  const value = String(name || "").trim();
  if (!value) return "";
  return value.split(/\s+/)[0] || "";
};

const formatKz = (value: unknown) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  return String(Math.round(num));
};

const sanitizeProducts = (items: any[]): ProductContextItem[] =>
  (items || [])
    .map((item: any) => ({
      id: String(item?.id || ""),
      name: String(item?.name || "").trim(),
      price: Number(item?.price || 0),
      stock: Number(item?.stock || 0),
      requiresPrescription: !!item?.requiresPrescription,
      pharmacyId: item?.pharmacyId ? String(item.pharmacyId) : null,
      pharmacyName: String(item?.pharmacyName || item?.pharmacy?.name || "Farmacia"),
      pharmacyStatus: String(item?.pharmacyStatus || item?.pharmacy?.status || ""),
      pharmacyAvailable:
        item?.pharmacyAvailable === undefined ? true : !!item?.pharmacyAvailable,
    }))
    .filter((item) => item.id && item.name);

const matchProducts = (message: string, products: ProductContextItem[]) => {
  if (!Array.isArray(products) || products.length === 0) return [];

  const msg = normalize(message);
  const keywords = extractKeywords(message, 8);

  const scored = products
    .map((product) => {
      const productName = normalize(product.name);
      let score = 0;
      if (productName && msg.includes(productName)) score += 5;
      keywords.forEach((term) => {
        if (productName.includes(term)) score += 2;
      });
      return { product, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.product);

  const dedup = new Map<string, ProductContextItem>();
  scored.forEach((item) => {
    if (!dedup.has(item.id)) dedup.set(item.id, item);
  });

  return Array.from(dedup.values());
};

const buildProductReply = (
  message: string,
  products: ProductContextItem[],
  userName: string,
  history: any[],
) => {
  if (!isProductIntent(message)) return null;

  const matches = matchProducts(message, products);
  if (matches.length === 0) return null;

  const firstName = extractFirstName(userName);
  const greeting = shouldGreet(history) ? `Ola${firstName ? ` ${firstName}` : ""}. ` : "";

  const details = matches
    .map((item) => {
      const status = item.stock > 0 ? "com stock" : "sem stock";
      const pharmacyState =
        item.pharmacyAvailable && normalize(item.pharmacyStatus) === "approved"
          ? ""
          : " (farmacia indisponivel)";
      return `${item.name} na ${item.pharmacyName}${pharmacyState}: Kz ${formatKz(item.price)}, ${status}`;
    })
    .join("; ");

  const hasRx = matches.some((item) => item.requiresPrescription);
  const safety = hasRx ? " Se exigir receita, a validacao e feita pela farmacia." : "";

  return `${greeting}Encontrei isto no catalogo: ${details}.${safety} Quer que eu te ajude a reservar ou ver mais opcoes?`;
};

const cleanupReply = (text: string, fallback = "Posso ajudar com isso. Queres que eu detalhe em passos simples?") => {
  let output = String(text || "").replace(/\s+/g, " ").trim();
  if (!output) output = fallback;

  output = output.replace(/^(ola[.!?\s]+){2,}/i, "Ola. ");
  output = output.replace(/^ola\.\s*ola\./i, "Ola.");

  const sentences = output.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 4) output = sentences.slice(0, 4).join(" ");
  if (output.length > 700) output = `${output.slice(0, 697)}...`;

  return output.trim();
};

const rankFaqEntries = (message: string, faqItems: any[]) => {
  const keywords = extractKeywords(message, 8);
  if (keywords.length === 0 || !Array.isArray(faqItems)) return [];

  return faqItems
    .map((entry: any) => {
      const haystack = normalize(`${entry?.question || ""} ${entry?.answer || ""}`);
      let score = 0;
      keywords.forEach((term) => {
        if (haystack.includes(term)) score += 1;
      });
      return { entry, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.entry);
};

const buildKnowledgeContext = async (admin: any, message: string) => {
  if (!admin) return "";

  try {
    const [faqResp, configResp] = await Promise.all([
      admin
        .from("admin_faq")
        .select("question, answer, is_active, order")
        .eq("is_active", true)
        .order("order", { ascending: true })
        .limit(40),
      admin
        .from("system_config")
        .select("config_key, config_value")
        .in("config_key", KB_CONFIG_KEYS),
    ]);

    const faqItems = (faqResp?.data || []) as any[];
    const configItems = (configResp?.data || []) as any[];
    const topFaq = rankFaqEntries(message, faqItems);
    const configMap = new Map<string, string>(
      configItems.map((item: any) => [String(item.config_key), String(item.config_value || "")]),
    );

    const chunks: string[] = [];
    if (topFaq.length > 0) {
      chunks.push(
        `FAQ relevante:\n${topFaq
          .map((item: any, idx: number) => `${idx + 1}. Q: ${item.question}\nA: ${item.answer}`)
          .join("\n")}`,
      );
    }

    const supportWhatsApp = configMap.get("support_whatsapp");
    const supportEmail = configMap.get("support_email");
    const minOrderValue = configMap.get("min_order_value");
    const settlementCycle = configMap.get("financial_settlement_cycle");
    const appName = configMap.get("app_name");

    const systemLines = [
      appName ? `App: ${appName}` : "",
      supportWhatsApp ? `WhatsApp suporte: ${supportWhatsApp}` : "",
      supportEmail ? `Email suporte: ${supportEmail}` : "",
      minOrderValue ? `Pedido minimo: ${minOrderValue} Kz` : "",
      settlementCycle ? `Ciclo financeiro: ${settlementCycle}` : "",
    ].filter(Boolean);

    if (systemLines.length > 0) {
      chunks.push(`Dados do sistema:\n${systemLines.join("\n")}`);
    }

    const msg = normalize(message);
    const asksLegal = /(termos|privacidade|dados|politica|legal)/.test(msg);
    if (asksLegal) {
      const privacy = String(configMap.get("legal_privacy_policy") || "");
      const terms = String(configMap.get("legal_terms_of_use") || "");
      if (privacy) chunks.push(`Resumo privacidade: ${privacy.slice(0, 650)}`);
      if (terms) chunks.push(`Resumo termos: ${terms.slice(0, 650)}`);
    }

    return chunks.join("\n\n");
  } catch (error) {
    console.warn("KB_CONTEXT_ERROR", (error as any)?.message || error);
    return "";
  }
};

const buildSourcesReply = () =>
  [
    "Uso estas fontes internas para responder melhor:",
    "1. FAQ publica do app (admin_faq).",
    "2. Configuracoes do sistema (system_config), como contactos e regras gerais.",
    "3. Catalogo de produtos e disponibilidade enviada no contexto do chat.",
    "Se um dado nao estiver nessas fontes, eu aviso e encaminho para suporte.",
  ].join(" ");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = (globalThis as any).process.env.API_KEY;
    if (!apiKey) throw new Error("Chave API_KEY nao encontrada nos Secrets do Supabase.");

    const ai = new GoogleGenAI({ apiKey });
    const payload = await req.json().catch(() => ({} as Record<string, any>));

    const rawAction = String(payload?.action || "").trim();
    const normalizedAction = normalize(rawAction).replace(/\s+/g, "_");
    const action =
      normalizedAction === "chatbot" || normalizedAction === "farmobot"
        ? "chat"
        : normalizedAction === "health" || normalizedAction === "heartbeat"
          ? "ping"
          : normalizedAction;

    const { message, imageUrl } = payload;

    if (action === "chat" || action === "farmobot_message") {
      const admin = createAdminClient();
      const authHeader = req.headers.get("authorization") || "";
      const token = extractBearerToken(authHeader);
      const user = await resolveUserFromToken(admin, token);

      const userMessage = String(message || "").trim();
      if (!userMessage) {
        return new Response(JSON.stringify({ error: "Mensagem vazia" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const history = Array.isArray(payload?.history) ? payload.history : [];
      const productsContext = sanitizeProducts(Array.isArray(payload?.productsContext) ? payload.productsContext : []);

      let userName = String(payload?.userName || user?.user_metadata?.name || "").trim();
      if (!userName && admin && user?.id) {
        try {
          const { data } = await admin
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .maybeSingle();
          userName = String(data?.name || "").trim();
        } catch {
          userName = "";
        }
      }

      if (wantsKnowledgeSources(userMessage)) {
        const text = buildSourcesReply();
        return new Response(
          JSON.stringify({
            text,
            user_id: user?.id || null,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const directProductReply = buildProductReply(userMessage, productsContext, userName, history);
      if (directProductReply) {
        return new Response(
          JSON.stringify({
            text: directProductReply,
            user_id: user?.id || null,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const knowledgeContext = await buildKnowledgeContext(admin, userMessage);
      const historyParts = history.slice(-8).map((item: any) => ({
        role: normalize(String(item?.role || "")) === "model" ? "model" : "user",
        parts: [{ text: String(item?.content || item?.text || "").slice(0, 700) }],
      }));

      const firstName = extractFirstName(userName);
      const greetRule = shouldGreet(history)
        ? `Primeira resposta da conversa: pode cumprimentar com "Ola${firstName ? ` ${firstName}` : ""}" apenas uma vez.`
        : "Nao repita saudacao, continue a conversa naturalmente.";

      const prompt = [
        `Mensagem do utente: ${userMessage}`,
        `Nome do utente: ${firstName || "nao informado"}`,
        `Contexto de produtos (quando relevante): ${JSON.stringify(productsContext).slice(0, 5000)}`,
        knowledgeContext ? `Base de conhecimento interna:\n${knowledgeContext}` : "Sem base interna relevante para esta pergunta.",
      ].join("\n\n");

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...historyParts,
          { role: "user", parts: [{ text: prompt }] },
        ],
        config: {
          temperature: 0.55,
          systemInstruction: [
            "Voce e o FarmoBot da FarmoLink Angola.",
            "Objetivo: responder de forma simples, clara, objetiva e humana.",
            greetRule,
            "Use portugues de Angola e frases curtas (1 a 4 frases).",
            "Pode responder perguntas gerais normalmente, mesmo fora do app.",
            "Nao invente preco, stock, farmacia ou informacoes legais.",
            "Quando nao souber, diga de forma direta e ofereca proximo passo.",
            "Evite respostas roboticas, repetitivas ou muito formais.",
            "Seguranca clinica: nunca prescreva dose personalizada, antibiotico ou diagnostico.",
            "Se o tema for clinico sensivel, inclua 1 frase de cautela e orientacao para medico/farmaceutico.",
          ].join(" "),
        },
      });

      const text = cleanupReply(result.text || "");
      return new Response(
        JSON.stringify({
          text,
          user_id: user?.id || null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "vision") {
      if (!imageUrl) throw new Error("URL da imagem nao fornecida.");

      const imageResp = await fetch(imageUrl);
      const arrayBuffer = await imageResp.arrayBuffer();
      const base64Data = encodeBase64(new Uint8Array(arrayBuffer));
      const mimeType = imageResp.headers.get("content-type") || "image/jpeg";

      const schema = {
        type: Type.OBJECT,
        properties: {
          confidence: { type: Type.NUMBER },
          extracted_text: { type: Type.STRING },
          suggested_items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
              },
              required: ["name", "quantity"],
            },
          },
        },
        required: ["confidence", "extracted_text", "suggested_items"],
      };

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              text:
                "Extraia os medicamentos e quantidades desta receita. Responda somente em JSON. Se nao conseguir ler claramente, devolva confidence baixa.",
            },
            { inlineData: { data: base64Data, mimeType } },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      return new Response(JSON.stringify(safeJsonParse(result.text || "{}", {})), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "ping") {
      return new Response(JSON.stringify({ status: "ok", env: "Deno/Edge" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        error: "Acao nao reconhecida",
        action_received: rawAction,
        action_normalized: action,
        accepted_actions: ["chat", "farmobot_message", "vision", "ping"],
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("CRITICAL_IA_ERROR:", error?.message || error);
    return new Response(
      JSON.stringify({
        error: "Falha na Execucao da IA",
        details: error?.message || String(error),
        type: error?.name || "UnknownError",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
