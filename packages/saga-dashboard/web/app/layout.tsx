export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0" }}>
        <header style={{ padding: "1rem 2rem", borderBottom: "1px solid #334155" }}>
          <h1 style={{ margin: 0, fontSize: "1.25rem" }}>SagaFlow Dashboard</h1>
        </header>
        <main style={{ padding: "2rem" }}>{children}</main>
      </body>
    </html>
  );
}
