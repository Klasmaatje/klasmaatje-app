import { getSchoolConfigBySlug } from "../lib/school-context";

export default async function Home() {
  const { organization, config } = await getSchoolConfigBySlug("shon");

  return (
    <div style={{ padding: 40 }}>
      <h1>{organization.name}</h1>
      <p>Label voor micro-analyse: {config.microAnalyseLabel}</p>
      <p>AI-provider: {config.aiProvider}</p>
    </div>
  );
}
