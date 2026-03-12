const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3004";
const isLocalhost = API_URL.includes("localhost");

export const DB_URI = isLocalhost
  ? "sqlite:notesync_localhost.db"
  : "sqlite:notesync.db";
