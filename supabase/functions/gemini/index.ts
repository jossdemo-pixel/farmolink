
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.34.0";
import { encodeBase64 } from "https://deno.land/std@0.203.0/encoding/base64.ts";

// SHIM ROBUSTO: Define process.env para cumprir a regra de inicialização, 
// mas sem poluir o ambiente global de forma que quebre o SDK no Deno.
const processShim = {
  env: {
    get API_KEY() {
      return (globalThis as any).Deno.env.get("API_KEY");
    }
  }
};

// @ts-ignore: Injeta para cumprir a regra obrigatória de uso de process.env.API_KEY
globalThis.process = processShim;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handler para CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // REGRA OBRIGATÓRIA: Deve usar process.env.API_KEY diretamente
    const apiKey = (globalThis as any).process.env.API_KEY;
    
    if (!apiKey) {
      throw new Error("Chave API_KEY não encontrada nos Secrets do Supabase.");
    }

    const ai = new GoogleGenAI({ apiKey });
    const payload = await req.json();
    const { action, message, imageUrl, history, productsContext } = payload;

    // 1. MÓDULO CHATBOT (FarmoBot)
    if (action === 'chat') {
      const chatHistory = (history || []).map((h: any) => ({
        role: h.role === 'model' ? 'model' : 'user',
        parts: [{ text: h.content || h.text }]
      }));

      const contextText = productsContext ? `\n\nPRODUTOS EM STOCK:\n${JSON.stringify(productsContext)}` : "";

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...chatHistory, { role: 'user', parts: [{ text: message + contextText }] }],
        config: { 
          systemInstruction: `Você é o FarmoBot Angola, assistente da rede FarmoLink. 
          Use português de Angola. Nunca prescreva dosagens. 
          Seja breve e prestativo.`,
          temperature: 0.7,
        },
      });

      return new Response(JSON.stringify({ text: response.text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. MÓDULO VISION (Receitas)
    if (action === 'vision') {
      if (!imageUrl) throw new Error("URL da imagem não fornecida.");

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
                quantity: { type: Type.NUMBER }
              },
              required: ["name", "quantity"]
            }
          }
        },
        required: ["confidence", "extracted_text", "suggested_items"]
      };

      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { text: "Extraia os medicamentos e quantidades desta receita médica angolana. Responda apenas em JSON." },
            { inlineData: { data: base64Data, mimeType: 'image/jpeg' } }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        }
      });

      return new Response(JSON.stringify(JSON.parse(result.text || "{}")), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'ping') {
      return new Response(JSON.stringify({ status: "ok", env: "Deno/Edge" }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    return new Response(JSON.stringify({ error: "Ação não reconhecida" }), { status: 400, headers: corsHeaders });

  } catch (error: any) {
    // Retorna o erro detalhado para a consola do cliente
    console.error("CRITICAL_IA_ERROR:", error.message);
    return new Response(JSON.stringify({ 
      error: "Falha na Execução da IA", 
      details: error.message,
      type: error.name
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
