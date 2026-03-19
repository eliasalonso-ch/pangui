"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

function Row({ label, value, ok }) {
  const color = ok === true ? "#16a34a" : ok === false ? "#dc2626" : "#6b7280";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #e5e7eb" }}>
      <span style={{ fontWeight: 500, color: "#111" }}>{label}</span>
      <span style={{ color, fontFamily: "monospace", fontSize: 13, maxWidth: "60%", textAlign: "right", wordBreak: "break-all" }}>
        {String(value)}
      </span>
    </div>
  );
}

export default function DebugPushPage() {
  const [info, setInfo] = useState(null);
  const [userId, setUserId] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function collect() {
      const standalone =
        window.navigator.standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches;

      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const iosMatch = navigator.userAgent.match(/OS (\d+)_(\d+)/);
      const iosVersionMajor = iosMatch ? parseInt(iosMatch[1]) : null;
      const iosVersionMinor = iosMatch ? parseInt(iosMatch[2]) : null;
      const iosVersionStr = iosMatch ? `${iosVersionMajor}.${iosVersionMinor}` : "unknown";
      const iosPushSupported = !isIOS || (iosVersionMajor > 16 || (iosVersionMajor === 16 && iosVersionMinor >= 4));

      const swSupported = "serviceWorker" in navigator;
      const pushSupported = "PushManager" in window;
      const notifSupported = "Notification" in window;
      const permission = notifSupported ? Notification.permission : "unsupported";

      let swRegistered = false;
      let swScope = null;
      let subscription = null;
      let subEndpoint = null;
      let swError = null;

      if (swSupported) {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          swRegistered = regs.length > 0;
          swScope = regs[0]?.scope ?? null;

          const reg = await navigator.serviceWorker.ready;
          subscription = await reg.pushManager.getSubscription();
          subEndpoint = subscription?.endpoint ?? null;
        } catch (err) {
          swError = err.message;
        }
      }

      setInfo({
        standalone,
        isIOS,
        iosVersionStr,
        iosPushSupported,
        swSupported,
        pushSupported,
        notifSupported,
        permission,
        swRegistered,
        swScope,
        swError,
        hasSubscription: !!subscription,
        subEndpoint,
        ua: navigator.userAgent,
      });

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    }

    collect().catch(console.error);
  }, []);

  async function handleSubscribe() {
    setSubscribing(true);
    setTestResult(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setTestResult({ ok: false, msg: "Permission denied: " + permission });
        return;
      }
      function urlBase64ToUint8Array(b64) {
        const pad = "=".repeat((4 - (b64.length % 4)) % 4);
        const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
        const raw = atob(base64);
        return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setTestResult({ ok: false, msg: "Not logged in" }); return; }
      const { error } = await supabase.from("push_subscriptions").upsert({
        usuario_id: user.id,
        subscription: sub.toJSON(),
        device_info: navigator.userAgent.slice(0, 200),
      }, { onConflict: "usuario_id" });
      if (error) {
        setTestResult({ ok: false, msg: "Supabase error: " + error.message });
      } else {
        setTestResult({ ok: true, msg: "Subscribed and saved to Supabase ✓" });
        window.location.reload();
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setSubscribing(false);
    }
  }

  async function handleSaveToSupabase() {
    setSaving(true);
    setTestResult(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) { setTestResult({ ok: false, msg: "No local subscription found in browser." }); return; }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setTestResult({ ok: false, msg: "Not logged in." }); return; }
      const { error } = await supabase.from("push_subscriptions").upsert({
        usuario_id: user.id,
        subscription: sub.toJSON(),
        device_info: navigator.userAgent.slice(0, 200),
      }, { onConflict: "usuario_id" });
      if (error) {
        setTestResult({ ok: false, msg: "Supabase error: " + error.message });
      } else {
        setTestResult({ ok: true, msg: "Saved to Supabase ✓ Now tap Send test push." });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestPush() {
    if (!userId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, msg: "Push sent! Check your device for the notification." });
      } else {
        setTestResult({ ok: false, msg: data.error + (data.statusCode ? ` (${data.statusCode})` : "") });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setTesting(false);
    }
  }

  const s = { padding: "24px 20px", maxWidth: 560, margin: "0 auto", fontFamily: "sans-serif" };

  return (
    <div style={s}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Push Debug</h1>
        <button onClick={() => window.location.reload()} style={{ padding: "6px 14px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
          Reload
        </button>
      </div>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
        Open from the installed PWA icon, then login first.
      </p>

      {!info ? (
        <p style={{ color: "#6b7280" }}>Collecting info…</p>
      ) : (
        <>
          <div style={{ background: "#f9fafb", borderRadius: 12, padding: "0 16px", marginBottom: 16 }}>
            <Row label="iOS device" value={String(info.isIOS)} ok={null} />
            {info.isIOS && <Row label="iOS version" value={info.iosVersionStr} ok={info.iosPushSupported} />}
            {info.isIOS && <Row label="iOS push supported (≥16.4)" value={String(info.iosPushSupported)} ok={info.iosPushSupported} />}
            <Row label="Standalone (PWA mode)" value={String(info.standalone)} ok={info.standalone} />
            <Row label="SW supported" value={String(info.swSupported)} ok={info.swSupported} />
            <Row label="Push API supported" value={String(info.pushSupported)} ok={info.pushSupported} />
            <Row label="Notification API" value={String(info.notifSupported)} ok={info.notifSupported} />
            <Row label="SW registered" value={String(info.swRegistered)} ok={info.swRegistered} />
            <Row label="SW scope" value={info.swScope ?? "—"} ok={null} />
            {info.swError && <Row label="SW error" value={info.swError} ok={false} />}
            <Row label="Notification permission" value={info.permission} ok={info.permission === "granted"} />
            <Row label="Push subscription saved" value={info.hasSubscription ? "found ✓" : "none"} ok={info.hasSubscription} />
            {info.subEndpoint && (
              <Row label="Endpoint (last 40)" value={"…" + info.subEndpoint.slice(-40)} ok={null} />
            )}
            <Row label="User ID" value={userId ?? "⚠️ not logged in — login first"} ok={!!userId} />
          </div>
          {!userId && (
            <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: "#fef9c3", color: "#854d0e", fontSize: 13 }}>
              You are not logged in. Login first, then come back here via <strong>Más → Debug Push</strong> to see the full status.
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {info && !info.hasSubscription && info.permission !== "granted" && (
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            style={{ padding: "10px 20px", background: "#273D88", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
          >
            {subscribing ? "Subscribing…" : "Subscribe to push"}
          </button>
        )}

        {info?.hasSubscription && userId && (
          <button
            onClick={handleSaveToSupabase}
            disabled={saving}
            style={{ padding: "10px 20px", background: "#ea580c", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
          >
            {saving ? "Saving…" : "Save to Supabase"}
          </button>
        )}

        <button
          onClick={handleTestPush}
          disabled={testing || !userId || !info?.hasSubscription}
          style={{ padding: "10px 20px", background: info?.hasSubscription ? "#16a34a" : "#9ca3af", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: info?.hasSubscription ? "pointer" : "not-allowed" }}
        >
          {testing ? "Sending…" : "Send test push"}
        </button>
      </div>

      {testResult && (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: testResult.ok ? "#dcfce7" : "#fee2e2", color: testResult.ok ? "#166534" : "#991b1b", fontSize: 14 }}>
          {testResult.msg}
        </div>
      )}

      {info && info.permission === "denied" && (
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 13, lineHeight: 1.6 }}>
          <strong>🚫 Notifications blocked.</strong><br />
          iOS won't let the app re-ask. You must enable manually:<br />
          <strong>iPhone Settings → Pangui → Notifications → Allow Notifications</strong><br />
          Then come back and tap "Subscribe to push".
        </div>
      )}

      {info && info.isIOS && !info.standalone && (
        <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 8, background: "#fef9c3", color: "#854d0e", fontSize: 13, lineHeight: 1.5 }}>
          <strong>⚠️ Not in standalone mode.</strong><br />
          iOS push only works when the app is installed from Home Screen.<br />
          Safari → Share → "Add to Home Screen" → open from the icon.
        </div>
      )}
    </div>
  );
}
