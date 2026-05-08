import type { ReactNode } from "react";
import { motion } from "framer-motion";

// iMessage-style bubble entry. Same spec across mobile/desktop/web:
//   scale 0.5 → 1, opacity 0 → 1, translateY 8 → 0
//   spring stiffness 260, damping 22, mass 1 (≈ Apple's
//     spring(response: 0.35, dampingFraction: 0.75))
//   transform-origin: bottom-right for outgoing (user), bottom-left
//     for incoming (assistant / system).
// User bubble = align "right", everything else = "left".
export function ChatBubbleEnter({
  align,
  className,
  children,
}: {
  align: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={{ scale: 0.5, opacity: 0, y: 8 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22, mass: 1 }}
      style={{
        transformOrigin: align === "right" ? "bottom right" : "bottom left",
      }}
    >
      {children}
    </motion.div>
  );
}
