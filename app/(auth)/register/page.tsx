"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../../lib/auth-client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [groep, setGroep] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
      groep: groep || undefined,
    });

    setLoading(false);
    if (error) {
      setError(error.message || "Registreren is niet gelukt.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F6F3FC" }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-sm" style={{ border: "1px solid #EAE3F7" }}>
        <h1 className="text-xl font-semibold mb-1" style={{ color: "#241B36" }}>Account aanmaken</h1>
        <p className="text-sm mb-6" style={{ color: "#6B5C87" }}>Voor leerkrachten van SHON</p>

        {error && (
          <p className="text-sm mb-4 rounded-lg px-3 py-2" style={{ background: "#FBEAEA", color: "#B03434" }}>{error}</p>
        )}

        <label className="block text-sm font-medium mb-1" style={{ color: "#241B36" }}>Naam</label>
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg px-3 py-2 mb-4 text-sm" style={{ border: "1px solid #DDD3EE" }} />

        <label className="block text-sm font-medium mb-1" style={{ color: "#241B36" }}>E-mailadres</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg px-3 py-2 mb-4 text-sm" style={{ border: "1px solid #DDD3EE" }} />

        <label className="block text-sm font-medium mb-1" style={{ color: "#241B36" }}>Wachtwoord</label>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg px-3 py-2 mb-4 text-sm" style={{ border: "1px solid #DDD3EE" }} />

        <label className="block text-sm font-medium mb-1" style={{ color: "#241B36" }}>Groep (optioneel)</label>
        <input type="text" placeholder="bijv. Groep 5" value={groep} onChange={(e) => setGroep(e.target.value)}
          className="w-full rounded-lg px-3 py-2 mb-6 text-sm" style={{ border: "1px solid #DDD3EE" }} />

        <button type="submit" disabled={loading} className="w-full rounded-lg py-2.5 text-sm font-medium text-white"
          style={{ background: "#3D2467", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Bezig..." : "Account aanmaken"}
        </button>

        <p className="text-sm mt-4 text-center" style={{ color: "#6B5C87" }}>
          Al een account? <a href="/login" style={{ color: "#3D2467", fontWeight: 500 }}>Inloggen</a>
        </p>
      </form>
    </div>
  );
}