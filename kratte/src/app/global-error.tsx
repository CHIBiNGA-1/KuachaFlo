"use client";
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#f6f8f3",
          color: "#344b38",
          fontFamily: "system-ui,sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: 480,
            margin: "15vh auto",
            padding: 32,
            background: "white",
            border: "1px solid #e0e8d9",
            borderRadius: 12,
          }}
        >
          <h1 style={{ fontSize: 24 }}>A moment to reconnect.</h1>
          <p style={{ lineHeight: 1.8 }}>
            KraTte couldn’t load this view. Your saved business data is still
            in your workspace.
          </p>
          <button
            onClick={reset}
            style={{
              border: 0,
              borderRadius: 6,
              background: "#33794e",
              color: "white",
              padding: "11px 18px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
