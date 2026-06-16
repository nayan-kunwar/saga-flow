const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface SagaDetail {
  id: string;
  name: string;
  status: string;
  failureReason?: string;
  context: Record<string, unknown>;
  steps: Array<{
    stepName: string;
    status: string;
    retries: number;
    startedAt?: string;
    completedAt?: string;
  }>;
}

export default async function SagaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let saga: SagaDetail | null = null;

  try {
    const res = await fetch(`${API_URL}/api/sagas/${id}`, { cache: "no-store" });
    if (res.ok) saga = await res.json();
  } catch {
    /* ignore */
  }

  if (!saga || "error" in saga) {
    return <p>Saga not found.</p>;
  }

  return (
    <div>
      <a href="/" style={{ color: "#60a5fa" }}>← Back</a>
      <h2>{saga.name}</h2>
      <p>Status: <strong>{saga.status}</strong></p>
      {saga.failureReason && <p style={{ color: "#f87171" }}>Failure: {saga.failureReason}</p>}
      <h3>Context</h3>
      <pre style={{ background: "#1e293b", padding: "1rem", borderRadius: "8px", overflow: "auto" }}>
        {JSON.stringify(saga.context, null, 2)}
      </pre>
      <h3>Steps</h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #334155" }}>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Step</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Status</th>
            <th style={{ padding: "0.5rem", textAlign: "left" }}>Retries</th>
          </tr>
        </thead>
        <tbody>
          {saga.steps.map((step) => (
            <tr key={step.stepName} style={{ borderBottom: "1px solid #1e293b" }}>
              <td style={{ padding: "0.5rem" }}>{step.stepName}</td>
              <td style={{ padding: "0.5rem" }}>{step.status}</td>
              <td style={{ padding: "0.5rem" }}>{step.retries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
