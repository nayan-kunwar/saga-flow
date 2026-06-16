const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface SagaListItem {
  id: string;
  name: string;
  status: string;
  failureReason?: string;
  currentStep?: string;
  executionTimeMs?: number;
  totalRetries: number;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  COMPLETED: "#22c55e",
  RUNNING: "#3b82f6",
  FAILED: "#ef4444",
  COMPENSATING: "#f59e0b",
  COMPENSATED: "#a855f7",
  COMPENSATION_FAILED: "#dc2626",
  PENDING: "#94a3b8",
};

async function fetchSagas(): Promise<SagaListItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/sagas`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const sagas = await fetchSagas();

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Saga Instances</h2>
      {sagas.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>
          No sagas found. Start the API and run an example saga.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155", textAlign: "left" }}>
              <th style={{ padding: "0.75rem" }}>Saga ID</th>
              <th style={{ padding: "0.75rem" }}>Name</th>
              <th style={{ padding: "0.75rem" }}>Status</th>
              <th style={{ padding: "0.75rem" }}>Current Step</th>
              <th style={{ padding: "0.75rem" }}>Execution Time</th>
              <th style={{ padding: "0.75rem" }}>Retries</th>
              <th style={{ padding: "0.75rem" }}>Failure Reason</th>
            </tr>
          </thead>
          <tbody>
            {sagas.map((saga) => (
              <tr key={saga.id} style={{ borderBottom: "1px solid #1e293b" }}>
                <td style={{ padding: "0.75rem", fontFamily: "monospace", fontSize: "0.85rem" }}>
                  <a href={`/saga/${saga.id}`} style={{ color: "#60a5fa" }}>
                    {saga.id.slice(0, 8)}...
                  </a>
                </td>
                <td style={{ padding: "0.75rem" }}>{saga.name}</td>
                <td style={{ padding: "0.75rem" }}>
                  <span
                    style={{
                      background: statusColors[saga.status] ?? "#64748b",
                      color: "#fff",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "4px",
                      fontSize: "0.8rem",
                    }}
                  >
                    {saga.status}
                  </span>
                </td>
                <td style={{ padding: "0.75rem" }}>{saga.currentStep ?? "-"}</td>
                <td style={{ padding: "0.75rem" }}>
                  {saga.executionTimeMs ? `${saga.executionTimeMs}ms` : "-"}
                </td>
                <td style={{ padding: "0.75rem" }}>{saga.totalRetries}</td>
                <td style={{ padding: "0.75rem", color: "#f87171", fontSize: "0.85rem" }}>
                  {saga.failureReason ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
