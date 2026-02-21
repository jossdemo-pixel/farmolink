import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ProfileRole = "ADMIN" | "PHARMACY" | "CUSTOMER";

type DispatchPayload = {
  title?: string;
  message?: string;
  type?: string;
  page?: string;
  audience?: "RX_TARGET_PHARMACY" | "ORDER_PHARMACY";
  prescriptionId?: string;
  orderId?: string;
  target?: "ALL" | ProfileRole;
  targetRole?: ProfileRole;
  singleUserId?: string;
  userIds?: string[];
  persistNotification?: boolean;
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

const normalizePrivateKey = (raw: string): string => {
  let key = String(raw || "").trim();
  // Remove wrapping quotes accidentally persisted in secrets.
  key = key.replace(/^"+|"+$/g, "");
  // Handle escaped newlines saved as \\n or \n.
  while (key.includes("\\\\n")) key = key.replace(/\\\\n/g, "\\n");
  key = key.replace(/\\n/g, "\n");
  return key.trim();
};

const createGoogleAccessToken = async (
  clientEmail: string,
  privateKeyPem: string,
): Promise<string | null> => {
  try {
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

    const normalizedPem = normalizePrivateKey(privateKeyPem);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(normalizedPem),
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
  } catch (e) {
    console.warn("FCM_KEY_PARSE_ERROR", (e as any)?.message || e);
    return null;
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

const getUserFromBearer = async (admin: any, authHeader: string) => {
  const token = extractBearerToken(authHeader);
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
};

const normalizeUniqueIds = (ids: string[]): string[] =>
  [...new Set(ids.map((v) => String(v || "").trim()).filter(Boolean))];

const getActorProfile = async (admin: any, userId: string) => {
  const { data } = await admin
    .from("profiles")
    .select("id, role, pharmacy_id")
    .eq("id", userId)
    .maybeSingle();
  return data || null;
};

const resolveRecipients = async (admin: any, payload: DispatchPayload): Promise<string[]> => {
  if (payload.singleUserId) return [payload.singleUserId];
  if (Array.isArray(payload.userIds) && payload.userIds.length > 0) {
    return normalizeUniqueIds(payload.userIds);
  }

  const target = (payload.target || payload.targetRole || "ALL") as "ALL" | ProfileRole;
  let query = admin.from("profiles").select("id");
  if (target !== "ALL") query = query.eq("role", target);

  const { data } = await query.limit(2000);
  return normalizeUniqueIds((data || []).map((row: any) => row.id));
};

const filterRecipientsForPharmacyActor = async (
  admin: any,
  pharmacyId: string,
  recipients: string[],
): Promise<string[]> => {
  if (!pharmacyId || recipients.length === 0) return [];

  const allowed = new Set<string>();

  const { data: orderRows } = await admin
    .from("orders")
    .select("customer_id")
    .eq("pharmacy_id", pharmacyId)
    .in("customer_id", recipients);

  for (const row of orderRows || []) {
    if (row?.customer_id) allowed.add(String(row.customer_id));
  }

  const { data: rxRows } = await admin
    .from("prescriptions")
    .select("id, customer_id, target_pharmacies")
    .in("customer_id", recipients);

  const targetKey = String(pharmacyId);
  for (const row of rxRows || []) {
    const targets = Array.isArray(row?.target_pharmacies) ? row.target_pharmacies : [];
    if (targets.includes(targetKey) && row?.customer_id) {
      allowed.add(String(row.customer_id));
    }
  }

  const { data: quoteRows } = await admin
    .from("prescription_quotes")
    .select("prescription_id")
    .eq("pharmacy_id", pharmacyId);
  const rxWithMyQuote = new Set<string>();
  for (const row of quoteRows || []) {
    if (row?.prescription_id) rxWithMyQuote.add(String(row.prescription_id));
  }
  for (const row of rxRows || []) {
    if (row?.id && rxWithMyQuote.has(String(row.id)) && row?.customer_id) {
      allowed.add(String(row.customer_id));
    }
  }

  return recipients.filter((id) => allowed.has(id));
};

const safeJsonArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || "").trim()).filter(Boolean);
};

const resolveRecipientsForCustomerAudience = async (
  admin: any,
  actorId: string,
  payload: DispatchPayload,
): Promise<{ recipients: string[]; error: string | null }> => {
  if (payload.audience === "RX_TARGET_PHARMACY" && payload.prescriptionId) {
    const { data: rx, error: rxError } = await admin
      .from("prescriptions")
      .select("id, customer_id, target_pharmacies")
      .eq("id", payload.prescriptionId)
      .maybeSingle();

    if (rxError || !rx?.id) return { recipients: [], error: "Prescription not found." };
    if (String(rx.customer_id || "") !== actorId) return { recipients: [], error: "Forbidden." };

    const pharmacyIds = safeJsonArray(rx.target_pharmacies);
    if (!pharmacyIds.length) return { recipients: [], error: null };

    const { data: users } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "PHARMACY")
      .in("pharmacy_id", pharmacyIds)
      .limit(2000);

    return { recipients: normalizeUniqueIds((users || []).map((u: any) => u.id)), error: null };
  }

  if (payload.audience === "ORDER_PHARMACY" && payload.orderId) {
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, customer_id, pharmacy_id")
      .eq("id", payload.orderId)
      .maybeSingle();

    if (orderError || !order?.id) return { recipients: [], error: "Order not found." };
    if (String(order.customer_id || "") !== actorId) return { recipients: [], error: "Forbidden." };
    if (!order.pharmacy_id) return { recipients: [], error: null };

    const { data: users } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "PHARMACY")
      .eq("pharmacy_id", String(order.pharmacy_id))
      .limit(2000);

    return { recipients: normalizeUniqueIds((users || []).map((u: any) => u.id)), error: null };
  }

  return { recipients: [], error: "Forbidden." };
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
          notification: {
            sound: "default",
            channel_id: "farmolink-important",
          },
        },
      },
    }),
  });

  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
};

const shouldDeactivateToken = (fcmError: string): boolean => {
  const normalized = String(fcmError || "").toUpperCase();
  return (
    normalized.includes("NOTREGISTERED") ||
    normalized.includes("UNREGISTERED") ||
    normalized.includes("INVALIDREGISTRATION") ||
    normalized.includes("REQUESTED ENTITY WAS NOT FOUND")
  );
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
    const hasFcmCredentials = !!(projectId && clientEmail && privateKey);

    const authHeader = req.headers.get("authorization") || "";
    const currentUser = await getUserFromBearer(admin, authHeader);
    if (!currentUser?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actor = await getActorProfile(admin, currentUser.id);
    if (!actor?.role) {
      return new Response(JSON.stringify({ error: "User profile not found." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: DispatchPayload = await req.json().catch(() => ({}));
    const title = String(payload?.title || "").trim();
    const message = String(payload?.message || "").trim();
    const type = String(payload?.type || "SYSTEM").trim();
    const page = String(payload?.page || "").trim();
    const persistNotification = payload.persistNotification !== false;

    if (!title || !message) {
      return new Response(JSON.stringify({ error: "Invalid payload (title/message)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let recipients = await resolveRecipients(admin, payload);

    if (actor.role === "CUSTOMER") {
      const scoped = await resolveRecipientsForCustomerAudience(admin, currentUser.id, payload);
      if (scoped.error) {
        return new Response(JSON.stringify({ error: scoped.error }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipients = scoped.recipients;
    } else if (actor.role !== "ADMIN") {
      if (actor.role !== "PHARMACY") {
        return new Response(JSON.stringify({ error: "Forbidden." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const allowedRecipients = await filterRecipientsForPharmacyActor(
        admin,
        String(actor.pharmacy_id || ""),
        recipients,
      );

      if (!allowedRecipients.length || allowedRecipients.length !== recipients.length) {
        return new Response(JSON.stringify({ error: "Forbidden audience for pharmacy actor." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipients = allowedRecipients;
    }

    if (!recipients.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, failed: 0, reason: "no_recipients" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (persistNotification && recipients.length > 0) {
      const rows = recipients.map((userId) => ({
        user_id: userId,
        title,
        message,
        type,
        is_read: false,
      }));
      await admin.from("notifications").insert(rows);
    }

    // Fallback: permite comunicados internos mesmo sem FCM configurado.
    if (!hasFcmCredentials) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          failed: 0,
          inactive: 0,
          recipients: recipients.length,
          reason: "fcm_not_configured",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = await createGoogleAccessToken(clientEmail, privateKey);
    if (!accessToken) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          failed: 0,
          inactive: 0,
          recipients: recipients.length,
          reason: "fcm_auth_unavailable",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: tokens, error: tokensError } = await admin
      .from("push_tokens")
      .select("token, user_id")
      .in("user_id", recipients)
      .eq("is_active", true);

    if (tokensError) {
      return new Response(JSON.stringify({ error: tokensError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tokens?.length) {
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          failed: 0,
          inactive: 0,
          recipients: recipients.length,
          reason: "no_tokens",
        }),
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
        if (shouldDeactivateToken(String(fcmError))) {
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
        recipients: recipients.length,
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
