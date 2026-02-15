import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";
import { encodeBase64 } from "https://deno.land/std@0.203.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

// Keep process.env shim for compatibility with current deployment constraints.
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

type BotMode = "COMMERCIAL" | "EDUCATIONAL" | "SENSITIVE" | "NAVIGATION";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type EscalationTarget = "BOT" | "PHARMACY" | "ADMIN";
type ConversationStatus = "bot_active" | "escalated_pharmacy" | "escalated_admin" | "resolved";

type TriggerSet = {
  clinical: string[];
  frustration: string[];
  complexity: string[];
  emergency: string[];
  all: string[];
};

type EscalationDecision = {
  target: EscalationTarget;
  level: 1 | 2 | 3;
  reasonCode: string;
  reasonText: string;
};

type ConversationRecord = {
  id: string;
  user_id: string;
  pharmacy_id: string | null;
  status: ConversationStatus;
  current_mode: BotMode;
  risk_level: RiskLevel;
  escalation_level: number;
  frustration_score: number;
  unresolved_turns: number;
};

const ACTION_ALIASES: Record<string, string> = {
  upload_prescription: "OPEN_UPLOAD_RX",
  reserve_product: "ADD_TO_CART",
  find_nearby_pharmacies: "OPEN_PHARMACIES_NEARBY",
  view_other_pharmacies: "OPEN_PHARMACIES_NEARBY",
  open_support: "OPEN_SUPPORT",
  open_cart: "OPEN_CART",
  open_prescriptions: "OPEN_PRESCRIPTIONS",
  escalate_pharmacy: "ESCALATE_PHARMACY",
  escalate_admin: "ESCALATE_ADMIN",
};

const CLINICAL_KEYWORDS = [
  "gravida",
  "gestante",
  "amamentando",
  "lactante",
  "crianca",
  "bebe",
  "antibiotico",
  "dose",
  "problema renal",
  "renal",
  "rim",
  "interacao medicamentosa",
  "interacao",
  "alergia grave",
  "efeito adverso grave",
];

const FRUSTRATION_KEYWORDS = [
  "reclamar",
  "voces erraram",
  "nao resolveu",
  "pessimo servico",
  "pessimo atendimento",
  "vou denunciar",
];

const COMPLEXITY_KEYWORDS = [
  "ajuste de dose",
  "ajustar dose",
  "efeitos adversos graves",
  "substituicao de medicamento prescrito",
  "trocar medicamento prescrito",
];

const EMERGENCY_KEYWORDS = [
  "falta de ar",
  "dor no peito",
  "desmaio",
  "convulsao",
  "anafilaxia",
  "sangramento intenso",
];

const NAVIGATION_KEYWORDS = [
  "como enviar receita",
  "enviar receita",
  "onde clico",
  "abrir carrinho",
  "ver farmacias",
  "minhas receitas",
  "meus pedidos",
];

const COMMERCIAL_KEYWORDS = [
  "preco",
  "valor",
  "stock",
  "tem disponivel",
  "entrega",
  "reservar",
  "comprar",
  "carrinho",
];

const normalize = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const includesAny = (text: string, words: string[]) =>
  words.filter((w) => text.includes(w)).filter((v, i, arr) => arr.indexOf(v) === i);

const mapActionType = (rawType: string) => {
  const cleaned = normalize(rawType).replace(/\s+/g, "_");
  if (!cleaned) return "";
  return ACTION_ALIASES[cleaned] || cleaned.toUpperCase();
};

const safeJsonParse = (value: string, fallback: any) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const detectTriggers = (rawMessage: string): TriggerSet => {
  const msg = normalize(rawMessage);
  const clinical = includesAny(msg, CLINICAL_KEYWORDS);
  const frustration = includesAny(msg, FRUSTRATION_KEYWORDS);
  const complexity = includesAny(msg, COMPLEXITY_KEYWORDS);
  const emergency = includesAny(msg, EMERGENCY_KEYWORDS);
  const all = [...clinical, ...frustration, ...complexity, ...emergency].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );
  return { clinical, frustration, complexity, emergency, all };
};

const computeRisk = (
  triggers: TriggerSet,
  message: string,
  frustrationScore: number,
  unresolvedTurns: number,
): RiskLevel => {
  if (triggers.emergency.length > 0) return "CRITICAL";

  const msg = normalize(message);
  let score = 0;
  if (triggers.clinical.length > 0) score += 60;
  if (triggers.complexity.length > 0) score += 50;
  if (triggers.frustration.length > 0) score += 35;
  if (msg.includes("dose")) score += 25;
  if (msg.includes("antibiotico")) score += 25;
  score += Math.min(frustrationScore * 10, 20);
  score += Math.min(unresolvedTurns * 8, 16);

  if (score >= 80) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
};

const pickMode = (message: string, triggers: TriggerSet): BotMode => {
  const msg = normalize(message);
  if (triggers.clinical.length > 0 || triggers.complexity.length > 0 || msg.includes("dose") || msg.includes("antibiotico")) {
    return "SENSITIVE";
  }
  if (includesAny(msg, NAVIGATION_KEYWORDS).length > 0) return "NAVIGATION";
  if (includesAny(msg, COMMERCIAL_KEYWORDS).length > 0) return "COMMERCIAL";
  return "EDUCATIONAL";
};

const decideEscalation = (
  risk: RiskLevel,
  triggers: TriggerSet,
  frustrationScore: number,
  unresolvedTurns: number,
): EscalationDecision => {
  if (triggers.emergency.length > 0) {
    return {
      target: "ADMIN",
      level: 3,
      reasonCode: "EMERGENCY_SIGNAL",
      reasonText: "Sinal de urgencia clinica",
    };
  }

  if (risk === "CRITICAL") {
    return {
      target: "ADMIN",
      level: 3,
      reasonCode: "CLINICAL_CRITICAL",
      reasonText: "Risco clinico critico",
    };
  }

  if (triggers.frustration.length > 0 && (frustrationScore >= 1 || unresolvedTurns >= 1)) {
    return {
      target: "ADMIN",
      level: 3,
      reasonCode: "FRUSTRATION_REPEATED",
      reasonText: "Frustracao recorrente",
    };
  }

  if (risk === "HIGH") {
    return {
      target: "PHARMACY",
      level: 2,
      reasonCode: "CLINICAL_HIGH",
      reasonText: "Risco clinico alto",
    };
  }

  if (risk === "MEDIUM" && (triggers.clinical.length > 0 || triggers.complexity.length > 0)) {
    return {
      target: "PHARMACY",
      level: 2,
      reasonCode: "CLINICAL_SENSITIVE",
      reasonText: "Caso sensivel para validacao",
    };
  }

  return {
    target: "BOT",
    level: 1,
    reasonCode: "BOT_HANDLED",
    reasonText: "Atendimento automatico",
  };
};

const buildEscalationReply = (target: EscalationTarget, risk: RiskLevel) => {
  const base = {
    greeting: "Ola.",
    objective:
      target === "PHARMACY"
        ? "Vou encaminhar este caso para validacao com a farmacia parceira."
        : "Vou encaminhar este caso para a administracao de suporte.",
    safety: "Nao posso indicar dose nem substituir orientacao medica.",
    cta: "Enquanto isso, pode enviar a receita para acelerar a analise.",
  };
  if (risk === "CRITICAL") {
    base.safety = "Se houver sinais graves, procure urgencia imediatamente. Nao posso indicar dose.";
  }
  return base;
};

const composeText = (reply: { greeting?: string; objective?: string; safety?: string; cta?: string }) => {
  const blocks = [reply.greeting, reply.objective, reply.safety, reply.cta]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  return blocks.join(" ");
};

const hasResolvedIntent = (message: string) => {
  const msg = normalize(message);
  return /(obrigad|resolveu|resolvido|funcionou|ja esta bom)/.test(msg);
};

const fallbackActionsFromMessage = (message: string, productsContext: any[]) => {
  const msg = normalize(message);
  const actions: any[] = [];

  if (msg.includes("receita")) actions.push({ type: "OPEN_UPLOAD_RX" });
  if (msg.includes("farmacia") || msg.includes("farmacias")) actions.push({ type: "OPEN_PHARMACIES_NEARBY" });
  if (msg.includes("carrinho")) actions.push({ type: "OPEN_CART" });
  if (msg.includes("reclamar") || msg.includes("suporte")) actions.push({ type: "OPEN_SUPPORT" });

  if (msg.includes("reserv") || msg.includes("compr")) {
    const match = (productsContext || []).find((p: any) => {
      const name = normalize(p?.name || "");
      return name && name.length > 3 && msg.includes(name);
    });
    if (match) {
      actions.push({ type: "ADD_TO_CART", payload: { productId: match.id, productName: match.name } });
    }
  }

  return actions;
};

const sanitizeActions = (rawActions: any[]) =>
  (rawActions || [])
    .map((item) => {
      const type = mapActionType(item?.type || "");
      if (!type) return null;
      const payload: Record<string, unknown> = {};
      if (item?.productId) payload.productId = item.productId;
      if (item?.productName) payload.productName = item.productName;
      if (item?.pharmacyId) payload.pharmacyId = item.pharmacyId;
      return { type, payload };
    })
    .filter((x: any) => !!x);

const createAdminClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

const getOrCreateConversation = async (
  admin: any,
  userId: string,
  conversationId?: string,
  pharmacyId?: string,
): Promise<{ conversation: ConversationRecord; persisted: boolean }> => {
  const fallbackConversation: ConversationRecord = {
    id: crypto.randomUUID(),
    user_id: userId,
    pharmacy_id: pharmacyId || null,
    status: "bot_active",
    current_mode: "NAVIGATION",
    risk_level: "LOW",
    escalation_level: 1,
    frustration_score: 0,
    unresolved_turns: 0,
  };

  try {
    if (conversationId) {
      const { data } = await admin
        .from("conversations")
        .select("*")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();
      if (data) return { conversation: data, persisted: true };
    }

    const { data: openConversation } = await admin
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "resolved")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openConversation) return { conversation: openConversation, persisted: true };

    const { data: created } = await admin
      .from("conversations")
      .insert([{
        user_id: userId,
        pharmacy_id: pharmacyId || null,
        status: "bot_active",
        current_mode: "NAVIGATION",
        risk_level: "LOW",
        escalation_level: 1,
        frustration_score: 0,
        unresolved_turns: 0,
      }])
      .select("*")
      .maybeSingle();

    if (created) return { conversation: created, persisted: true };
  } catch (e) {
    console.error("Conversation bootstrap fallback:", (e as any)?.message || e);
  }

  return { conversation: fallbackConversation, persisted: false };
};

const insertMessage = async (
  admin: any,
  persisted: boolean,
  payload: any,
) => {
  if (!persisted) return;
  try {
    await admin.from("conversation_messages").insert([payload]);
  } catch (e) {
    console.error("Insert message skipped:", (e as any)?.message || e);
  }
};

const createEscalation = async (
  admin: any,
  persisted: boolean,
  payload: any,
) => {
  if (!persisted) return null;
  try {
    const { data } = await admin.from("conversation_escalations").insert([payload]).select("id").maybeSingle();
    return data?.id || null;
  } catch (e) {
    console.error("Create escalation skipped:", (e as any)?.message || e);
    return null;
  }
};

const mirrorEscalationToSupport = async (
  admin: any,
  user: any,
  decision: EscalationDecision,
  risk: RiskLevel,
  message: string,
) => {
  try {
    const { data: ticket } = await admin
      .from("support_tickets")
      .insert([{
        user_id: user.id,
        user_name: user.user_metadata?.name || "Utente",
        user_email: user.email || "",
        subject: `[FarmoBot] ${decision.reasonText}`,
        status: "OPEN",
      }])
      .select("id")
      .maybeSingle();

    if (!ticket?.id) return null;

    await admin.from("support_messages").insert([{
      ticket_id: ticket.id,
      sender_id: null,
      sender_name: "FarmoBot",
      sender_role: "SYSTEM",
      message: `Escalacao automatica (${decision.target}) | risco ${risk} | motivo ${decision.reasonCode}. Mensagem: ${message}`,
    }]);

    return ticket.id;
  } catch (e) {
    console.error("Support mirror skipped:", (e as any)?.message || e);
    return null;
  }
};

const notifyEscalation = async (
  admin: any,
  userId: string,
  pharmacyId: string | null,
  decision: EscalationDecision,
  risk: RiskLevel,
) => {
  try {
    let recipients: string[] = [];

    if (decision.target === "PHARMACY" && pharmacyId) {
      const { data } = await admin.from("profiles").select("id").eq("pharmacy_id", pharmacyId);
      recipients = (data || []).map((r: any) => r.id);
    } else if (decision.target === "ADMIN") {
      const { data } = await admin.from("profiles").select("id").eq("role", "ADMIN");
      recipients = (data || []).map((r: any) => r.id);
    }

    if (recipients.length === 0) return;

    await admin.from("notifications").insert(
      recipients.map((id) => ({
        user_id: id,
        title: "ESCALACAO FARMOBOT",
        message: `Nova escalacao ${decision.target} com risco ${risk}.`,
        type: "BOT_ESCALATION",
        is_read: false,
      })),
    );
  } catch (e) {
    console.error("Escalation notifications skipped:", (e as any)?.message || e);
  }
};

const generateBotReply = async (
  ai: GoogleGenAI,
  message: string,
  mode: BotMode,
  risk: RiskLevel,
  triggers: string[],
  history: any[],
  productsContext: any[],
) => {
  const schema = {
    type: Type.OBJECT,
    properties: {
      reply: {
        type: Type.OBJECT,
        properties: {
          objective: { type: Type.STRING },
          safety: { type: Type.STRING },
          cta: { type: Type.STRING },
        },
        required: ["objective", "cta"],
      },
      actions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            productId: { type: Type.STRING },
            productName: { type: Type.STRING },
            pharmacyId: { type: Type.STRING },
          },
          required: ["type"],
        },
      },
    },
    required: ["reply"],
  };

  const historyParts = (history || [])
    .slice(-6)
    .map((h: any) => ({
      role: h?.role === "model" ? "model" : "user",
      parts: [{ text: String(h?.content || h?.text || "").slice(0, 500) }],
    }));

  const prompt = [
    `Mensagem do utente: ${message}`,
    `Modo operacional: ${mode}`,
    `Risco: ${risk}`,
    `Gatilhos detectados: ${triggers.join(", ") || "nenhum"}`,
    `Produtos de contexto: ${JSON.stringify((productsContext || []).slice(0, 10))}`,
    "Responda em portugues de Angola, objetivo e institucional.",
    "Nunca prescreva antibioticos.",
    "Nunca sugira dose personalizada.",
    "Nao substitua medico.",
    "Se clinico sensivel, inclua alerta de seguranca.",
    "Actions permitidas: OPEN_UPLOAD_RX, OPEN_PRESCRIPTIONS, OPEN_PHARMACIES_NEARBY, OPEN_CART, ADD_TO_CART, OPEN_SUPPORT.",
  ].join("\n");

  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [...historyParts, { role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: schema,
      systemInstruction:
        "Voce e o FarmoBot da FarmoLink. Sempre entregue saudacao neutra, resposta objetiva, aviso de seguranca quando aplicavel e CTA unico. Nao use girias.",
    },
  });

  const parsed = safeJsonParse(result.text || "{}", {});
  const reply = parsed?.reply || {};
  const actions = sanitizeActions(parsed?.actions || []);
  return { reply, actions };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = (globalThis as any).process.env.API_KEY;
    if (!apiKey) throw new Error("Chave API_KEY nao encontrada nos Secrets do Supabase.");

    const ai = new GoogleGenAI({ apiKey });
    const payload = await req.json();
    const { action, message, imageUrl, history, productsContext } = payload;

    if (action === "farmobot_message") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
      if (!token) {
        return new Response(JSON.stringify({ error: "Nao autenticado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const admin = createAdminClient();
      const { data: authData, error: authError } = await admin.auth.getUser(token);
      if (authError || !authData?.user) {
        return new Response(JSON.stringify({ error: "Sessao invalida" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const user = authData.user;
      const userMessage = String(message || "").trim();
      if (!userMessage) {
        return new Response(JSON.stringify({ error: "Mensagem vazia" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { conversation, persisted } = await getOrCreateConversation(
        admin,
        user.id,
        payload?.conversationId,
        payload?.pharmacyId,
      );

      const triggers = detectTriggers(userMessage);
      const mode = pickMode(userMessage, triggers);
      const risk = computeRisk(triggers, userMessage, conversation.frustration_score || 0, conversation.unresolved_turns || 0);
      const decision = decideEscalation(risk, triggers, conversation.frustration_score || 0, conversation.unresolved_turns || 0);

      const start = Date.now();
      await insertMessage(admin, persisted, {
        conversation_id: conversation.id,
        user_id: user.id,
        role: "USER",
        content: userMessage,
        mode,
        risk_level: risk,
        trigger_flags: triggers.all,
        action_events: [],
      });

      let replyBlocks = {
        greeting: "Ola.",
        objective: "Posso ajudar com informacoes sobre compra, receita e navegacao no app.",
        safety: "",
        cta: "Diga o que pretende fazer agora.",
      };
      let actions: any[] = [];

      if (decision.target === "BOT") {
        try {
          const modelResult = await generateBotReply(
            ai,
            userMessage,
            mode,
            risk,
            triggers.all,
            history || [],
            productsContext || [],
          );
          replyBlocks = {
            greeting: "Ola.",
            objective: String(modelResult.reply?.objective || "").trim() || replyBlocks.objective,
            safety: String(modelResult.reply?.safety || "").trim(),
            cta: String(modelResult.reply?.cta || "").trim() || "Posso continuar a ajudar por aqui.",
          };
          actions = modelResult.actions;
        } catch (e) {
          console.error("Structured bot generation fallback:", (e as any)?.message || e);
        }
      } else {
        replyBlocks = buildEscalationReply(decision.target, risk);
        actions = [
          { type: decision.target === "PHARMACY" ? "ESCALATE_PHARMACY" : "ESCALATE_ADMIN", payload: {} },
          { type: "OPEN_SUPPORT", payload: {} },
          { type: "OPEN_UPLOAD_RX", payload: {} },
        ];
      }

      if ((mode === "SENSITIVE" || risk === "HIGH" || risk === "CRITICAL") && !String(replyBlocks.safety || "").trim()) {
        replyBlocks.safety = "Nao posso indicar dose nem substituir avaliacao medica.";
      }

      const fallbackActions = fallbackActionsFromMessage(userMessage, productsContext || []);
      const mergedActions = sanitizeActions([...actions, ...fallbackActions]);
      const text = composeText(replyBlocks);

      await insertMessage(admin, persisted, {
        conversation_id: conversation.id,
        user_id: null,
        role: "BOT",
        content: text,
        mode,
        risk_level: risk,
        trigger_flags: triggers.all,
        action_events: mergedActions,
        model_name: "gemini-3-flash-preview",
        latency_ms: Date.now() - start,
      });

      const resolvedIntent = hasResolvedIntent(userMessage);
      const nextStatus: ConversationStatus = resolvedIntent
        ? "resolved"
        : decision.target === "PHARMACY"
        ? "escalated_pharmacy"
        : decision.target === "ADMIN"
        ? "escalated_admin"
        : "bot_active";
      const nextEscalationLevel = decision.target === "BOT" ? 1 : decision.level;
      const nextFrustration = triggers.frustration.length > 0
        ? Math.min(5, (conversation.frustration_score || 0) + 1)
        : Math.max(0, (conversation.frustration_score || 0) - 1);
      const nextUnresolved = nextStatus === "bot_active" ? Math.min(10, (conversation.unresolved_turns || 0) + 1) : 0;

      if (persisted) {
        await admin
          .from("conversations")
          .update({
            status: nextStatus,
            current_mode: mode,
            risk_level: risk,
            escalation_level: nextEscalationLevel,
            frustration_score: nextFrustration,
            unresolved_turns: nextUnresolved,
            last_message_at: new Date().toISOString(),
            resolved_at: nextStatus === "resolved" ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }

      let escalationId: string | null = null;
      if (decision.target !== "BOT") {
        escalationId = await createEscalation(admin, persisted, {
          conversation_id: conversation.id,
          from_level: 1,
          to_level: decision.level,
          target: decision.target,
          reason_code: decision.reasonCode,
          reason_text: decision.reasonText,
          risk_level: risk,
          trigger_snapshot: {
            clinical: triggers.clinical,
            frustration: triggers.frustration,
            complexity: triggers.complexity,
            emergency: triggers.emergency,
          },
          status: "OPEN",
          sla_due_at: new Date(Date.now() + (decision.target === "ADMIN" ? 10 : 30) * 60 * 1000).toISOString(),
        });

        await mirrorEscalationToSupport(admin, user, decision, risk, userMessage);
        await notifyEscalation(admin, user.id, conversation.pharmacy_id, decision, risk);
      }

      return new Response(
        JSON.stringify({
          conversation_id: conversation.id,
          conversation_status: nextStatus,
          mode,
          risk_level: risk,
          escalation_target: decision.target,
          escalation_id: escalationId,
          triggers: triggers.all,
          reply: replyBlocks,
          actions: mergedActions,
          text,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Legacy chat action (kept for backward compatibility).
    if (action === "chat") {
      const chatHistory = (history || []).map((h: any) => ({
        role: h.role === "model" ? "model" : "user",
        parts: [{ text: h.content || h.text }],
      }));
      const contextText = productsContext ? `\n\nPRODUTOS:\n${JSON.stringify(productsContext)}` : "";
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...chatHistory, { role: "user", parts: [{ text: String(message || "") + contextText }] }],
        config: {
          systemInstruction:
            "Voce e o FarmoBot Angola da FarmoLink. Seja breve. Nunca prescreva dose personalizada.",
          temperature: 0.3,
        },
      });
      return new Response(JSON.stringify({ text: response.text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "vision") {
      if (!imageUrl) throw new Error("URL da imagem nao fornecida.");

      const imageResp = await fetch(imageUrl);
      const arrayBuffer = await imageResp.arrayBuffer();
      const base64Data = encodeBase64(new Uint8Array(arrayBuffer));

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
            { text: "Extraia os medicamentos e quantidades desta receita. Responda somente em JSON." },
            { inlineData: { data: base64Data, mimeType: "image/jpeg" } },
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

    return new Response(JSON.stringify({ error: "Acao nao reconhecida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
