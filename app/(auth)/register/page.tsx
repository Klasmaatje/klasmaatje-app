import { prisma } from "../../../lib/prisma";
import RegisterForm from "./register-form";

// Server component: haalt de scholen op zodat het client-formulier
// een dropdown kan tonen. (Alle scholen horen nu bij SHON.)
export default async function RegisterPage() {
  const schools = await prisma.school.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true },
  });

  return <RegisterForm schools={schools} />;
}
