import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AccessError, assertCanManageSchoolGroups, classGroupScope } from "@/lib/access";
import { requireActor } from "@/lib/current-actor";
import { schoolYearOf, todayInNetherlands } from "@/lib/week";
import MemberForm from "./member-form";
import { removeGroupMember } from "./actions";

const ROLE_LABEL: Record<string, string> = {
  GROUP_TEACHER: "groepsleerkracht",
  SUBSTITUTE: "invaller",
};

function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Groepen</p>
      <div className="rounded-xl bg-white p-6 mt-2" style={{ border: "1px solid #E8DFF5" }}>
        <p className="font-medium mb-1" style={{ color: "#1F1730" }}>{title}</p>
        <p className="text-sm" style={{ color: "#6B5A85" }}>{text}</p>
      </div>
    </div>
  );
}

export default async function GroepenPage() {
  const actor = await requireActor();
  if (!actor.schoolId) {
    return <Notice title="Geen school gekoppeld" text="Je account hoort (nog) niet bij een school." />;
  }

  let school: { id: string; organizationId: string };
  try {
    school = await assertCanManageSchoolGroups(prisma, actor, actor.schoolId);
  } catch (e) {
    if (e instanceof AccessError && e.status === 404) notFound();
    if (e instanceof AccessError) {
      return <Notice title="Geen toegang" text="Alleen de schoolleiding kan groepen en koppelingen beheren." />;
    }
    throw e;
  }

  const schoolYear = schoolYearOf(todayInNetherlands());
  const [schoolInfo, groups, colleagues] = await Promise.all([
    prisma.school.findUnique({ where: { id: school.id }, select: { name: true } }),
    prisma.classGroup.findMany({
      where: { AND: [classGroupScope(actor), { schoolId: school.id, schoolYear }] },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { schoolId: school.id, organizationId: school.organizationId },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  groups.sort((a, b) => a.name.localeCompare(b.name, "nl", { numeric: true }));

  return (
    <div className="max-w-4xl">
      <p className="text-xs font-medium tracking-wide uppercase mb-1" style={{ color: "#8B6FB3" }}>Groepen</p>
      <h1 className="text-2xl font-semibold mb-1" style={{ color: "#1F1730" }}>{schoolInfo?.name}</h1>
      <p className="text-sm mb-6" style={{ color: "#6B5A85" }}>
        Schooljaar {schoolYear}. Koppel leerkrachten aan hun groep; zij zien die groep daarna in Mijn Week.
      </p>

      <div className="rounded-xl bg-white p-6 mb-6" style={{ border: "1px solid #E8DFF5" }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "#1F1730" }}>Leerkracht koppelen</h2>
        <MemberForm groups={groups.map((g) => ({ id: g.id, name: g.name }))} colleagues={colleagues} />
      </div>

      <div className="rounded-xl bg-white" style={{ border: "1px solid #E8DFF5" }}>
        <ul>
          {groups.map((g, i) => (
            <li
              key={g.id}
              className="flex flex-wrap items-start justify-between gap-3 px-6 py-4"
              style={i > 0 ? { borderTop: "1px solid #F0EAF8" } : undefined}
            >
              <span className="font-medium w-24" style={{ color: "#1F1730" }}>Groep {g.name}</span>
              <div className="flex-1 flex flex-wrap gap-2">
                {g.memberships.length === 0 && (
                  <span className="text-sm" style={{ color: "#A08DBD" }}>Nog niemand gekoppeld</span>
                )}
                {g.memberships.map((m) => (
                  <form key={m.id} action={removeGroupMember} className="flex items-center gap-2 rounded-full pl-3 pr-1 py-1 text-sm" style={{ background: "#F6F3FC", color: "#1F1730" }}>
                    <input type="hidden" name="classGroupId" value={g.id} />
                    <input type="hidden" name="userId" value={m.user.id} />
                    <span>{m.user.name} <span style={{ color: "#6B5A85" }}>({ROLE_LABEL[m.role] ?? m.role})</span></span>
                    <button
                      type="submit"
                      className="rounded-full w-6 h-6 text-xs"
                      style={{ color: "#6B5A85" }}
                      title={`${m.user.name} ontkoppelen van groep ${g.name}`}
                      aria-label={`${m.user.name} ontkoppelen van groep ${g.name}`}
                    >
                      ✕
                    </button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
