import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function removeStorageTree(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  root: string,
): Promise<string | null> {
  const folders = [root];
  const files: string[] = [];

  while (folders.length) {
    const folder = folders.pop()!;
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) return `${bucket}: ${error.message}`;
    for (const item of data ?? []) {
      const path = `${folder}/${item.name}`;
      if (item.id) files.push(path);
      else folders.push(path);
    }
  }

  for (let index = 0; index < files.length; index += 100) {
    const { error } = await admin.storage.from(bucket).remove(files.slice(index, index + 100));
    if (error) return `${bucket}: ${error.message}`;
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration is incomplete." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authHeader.slice("Bearer ".length);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const actor = authData.user;
  if (authError || !actor) return json({ error: "Invalid administrator session." }, 401);

  const { data: actorRole, error: actorRoleError } = await admin.from("user_roles").select("role").eq("user_id", actor.id).eq("role", "admin").maybeSingle();
  if (actorRoleError || !actorRole) return json({ error: "Administrator access required." }, 403);

  let body: { userId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return json({ error: "A valid user ID is required." }, 400);
  if (reason.length < 3 || reason.length > 500) return json({ error: "Removal reason must be between 3 and 500 characters." }, 400);
  if (userId === actor.id) return json({ error: "You cannot remove your own administrator account." }, 409);

  const [{ data: targetAuth, error: targetAuthError }, { data: targetRole }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  if (targetAuthError || !targetAuth.user) return json({ error: "User not found." }, 404);
  if (targetRole) return json({ error: "Administrator accounts cannot be removed from this panel." }, 409);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return json({ error: deleteError.message }, 400);

  const cleanupResults = await Promise.all([
    removeStorageTree(admin, "avatars", userId),
    removeStorageTree(admin, "post-media", userId),
    removeStorageTree(admin, "job-proofs", userId),
  ]);
  const cleanupWarnings = cleanupResults.filter((item): item is string => Boolean(item));

  await admin.from("admin_audit_logs").insert({
    actor_id: actor.id,
    action: "user_permanently_removed",
    target_type: "user",
    target_id: userId,
    reason,
    metadata: {
      full_name: profile?.full_name ?? null,
      cleanup_warnings: cleanupWarnings,
    },
  });

  return json({ removed: true, userId, cleanupWarnings });
});
