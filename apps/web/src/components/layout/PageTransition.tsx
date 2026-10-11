/**
 * PageTransition — framer-motion fade+slide untuk perpindahan halaman.
 *
 * Spec Bagian 2e: transisi halaman dengan framer-motion.
 * Menghormati prefers-reduced-motion via globals.css (durasi dikecilkan ke 0.01ms).
 */
"use client";

import { motion } from "framer-motion";

interface Props {
  children: React.ReactNode;
}

export function PageTransition({ children }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex flex-col flex-1 min-h-0"
    >
      {children}
    </motion.div>
  );
}
