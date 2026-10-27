import { prisma } from "../../../lib/prisma";
import RegisterForm from "./register-form";

// Server component: haalt de scholen op zodat het client-formulier
// een dropdown kan tonen. (Alle scholen horen nu bij SHON.)
export default async function RegisterPage() {
  if (process.env.DEMO_MODE === "1") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F6F3FC" }}>
        <div className="max-w-sm rounded-xl bg-white p-6 text-center" style={{ border: "1px solid #E8DFF5" }}>
          <h1 className="text-lg font-semibold" style={{ color: "#1F1730" }}>Registreren is uitgeschakeld</h1>
          <p className="text-sm mt-2" style={{ color: "#6B5A85" }}>
            Dit is de demo-omgeving. Log in met een van de demo-accounts.
          </p>
          <a href="/login" className="inline-block mt-4 text-sm font-medium" style={{ color: "#3D2467" }}>Naar inloggen</a>
        </div>
      </div>
    );
  }
  const schools = await prisma.school.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  return <RegisterForm schools={schools} />;
}
