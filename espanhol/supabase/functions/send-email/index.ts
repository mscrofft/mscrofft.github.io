// Supabase Edge Function — send-email
// Deploy: supabase functions deploy send-email
// Secret:  supabase secrets set RESEND_API_KEY=re_CDoToUah_EmWMmuAUCuvcexLu8p9mr4KG

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { nome, email, codigo, loginUrl } = await req.json();
    if (!nome || !email || !codigo) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const firstName = nome.split(" ")[0];
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_KEY) throw new Error("RESEND_API_KEY not set");

    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#FDFAF7;border-radius:16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="width:56px;height:56px;background:#E8622A;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;font-size:26px;">🌍</div>
          <h1 style="font-size:22px;font-weight:800;color:#1A1612;margin-top:12px;">Español Vivo</h1>
        </div>
        <p style="font-size:16px;color:#1A1612;margin-bottom:8px;">Olá, <strong>${firstName}</strong>!</p>
        <p style="font-size:14px;color:#6B6259;line-height:1.7;margin-bottom:24px;">
          Sua professora cadastrou você no <strong>Español Vivo</strong>. Use o código abaixo para acessar suas aulas:
        </p>
        <div style="background:#F4F1EC;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
          <div style="font-size:12px;color:#B0A89E;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Seu código de acesso</div>
          <div style="font-size:32px;font-weight:800;color:#E8622A;letter-spacing:2px;">${codigo}</div>
        </div>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${loginUrl}" style="display:inline-block;background:#E8622A;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;">Acessar minhas aulas →</a>
        </div>
        <p style="font-size:12px;color:#B0A89E;text-align:center;line-height:1.6;">
          Guarde este email. Você precisará do código toda vez que fizer login.<br>
          Em caso de dúvidas, fale com sua professora.
        </p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Español Vivo <onboarding@resend.dev>",
        to: [email],
        subject: `Seu acesso ao Español Vivo — código: ${codigo}`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Resend error");

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
