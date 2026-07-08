import { headers } from "next/headers";
import { auth } from "../../../lib/auth";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <div>
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Dashboard</p>
      <h1 className="text-2xl font-semibold" style={{ color: "#1F1730" }}>Welkom terug, {session?.user.name}</h1>
    </div>
  );
}