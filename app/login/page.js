"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    const { data: perfil } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", data.user.id)
      .maybeSingle();

    const rol = perfil?.rol;

    if (rol === "tecnico") {
      router.push("/tecnico");
    } else {
      router.push("/jefe");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.logo}>
        <img src="/pangui-logo-inv.svg" alt="" className={styles.logoImage} />
      </div>

      <Link href="/debug-push" style={{ position: "fixed", bottom: 16, right: 16, fontSize: 12, color: "black", opacity: 0.5, textDecoration: "none" }}>
        debug push
      </Link>

      <div className={styles.card}>
        <h1 className={styles.heading}>Iniciar sesión</h1>
        <p className={styles.sub}>Gestión de órdenes de trabajo</p>

        <form onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Correo</label>
            <input
              className={styles.input}
              type="email"
              placeholder="usuario@universidad.cl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoCapitalize="none"
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.label}>Contraseña</label>
            <input
              className={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
