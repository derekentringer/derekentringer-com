import { Link } from "react-router-dom";
import { useDocumentHead } from "../utils/useDocumentHead.ts";

export function NotFoundPage() {
  useDocumentHead({ title: "404 | Derek Entringer" });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        fontFamily: "'Roboto', sans-serif",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "64px", fontWeight: 100 }}>404</h1>
      <p style={{ fontSize: "20px", color: "#5bc2e7", marginBottom: "20px" }}>
        Page not found
      </p>
      <Link to="/" style={{ fontSize: "12px" }}>
        Go home
      </Link>
    </div>
  );
}
