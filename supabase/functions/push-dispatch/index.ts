import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const createAdminClient = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const base64UrlEncode = (value: string | Uint8Array): string => {
  const raw = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const base64 = btoa(String.fromCharCode(...raw));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const cleaned = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const createGoogleAccessToken = async (
  clientEmail: string,
  privateKeyPem: string,
): Promise<string | null> => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );

  const jwt = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenJson = await tokenRes.json().catch(() => ({}));
  return tokenJson?.access_token || null;
};

const isAdminUser = async (admin: any, userId: string): Promise<boolean> => {
  if (!admin || !userId) return false;
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("role", "ADMIN")
    .maybeSingle();
  return !!data?.id;
};

const getUserFromBearer = async (admin: any, authHeader: string) => {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
};

const sendToFcmToken = async (
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {},
) => {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: {
          priority: "HIGH",
          notification: { sound: "default" },
        },
      },
    }),
  });

  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createAdminClient();
    if (!admin) {
      return new Response(JSON.stringify({ error: "Missing Supabase admin env." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const projectId = Deno.env.get("FCM_PROJECT_ID") || "";
    const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL") || "";
    const privateKey = (Deno.env.get("FCM_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
      return new Response(JSON.stringify({ error: "Missing FCM credentials for HTTP v1." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const accessToken = await createGoogleAccessToken(clientEmail, privateKey);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Could not obtain Google access token." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("authorization") || "";
    const currentUser = await getUserFromBearer(admin, authHeader);
    if (!currentUser?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isAdmin = await isAdminUser(admin, currentUser.id);
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json().catch(() => ({}));
    const title = String(payload?.title || "").trim();
    const message = String(payload?.message || "").trim();
    const type = String(payload?.type || "SYSTEM").trim();
    const page = String(payload?.page || "").trim();
    const userIds = Array.isArray(payload?.userIds)
      ? payload.userIds.map((u: any) => String(u)).filter(Boolean)
      : [];

    if (!title || !message || userIds.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid payload." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tokens, error: tokensError } = await admin
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", userIds)
      .eq("is_active", true);

    if (tokensError) {
      return new Response(JSON.stringify({ error: tokensError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tokens?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, failed: 0, inactive: 0, reason: "no_tokens" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sent = 0;
    let failed = 0;
    const deactivateList: string[] = [];

    for (const t of tokens) {
      const result = await sendToFcmToken(accessToken, projectId, t.token, title, message, {
        type,
        page,
      });

      const fcmError =
        result?.json?.error?.status ||
        result?.json?.error?.message ||
        result?.json?.error ||
        "";

      if (result.ok && !fcmError) {
        sent += 1;
      } else {
        failed += 1;
        const normalized = String(fcmError).toUpperCase();
        if (
          normalized.includes("NOTREGISTERED") ||
          normalized.includes("INVALIDREGISTRATION")
        ) {
          deactivateList.push(t.token);
        }
      }
    }

    if (deactivateList.length > 0) {
      await admin
        .from("push_tokens")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("token", deactivateList);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        failed,
        inactive: deactivateList.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
