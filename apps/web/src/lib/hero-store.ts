/**
 * hero-store.ts — Zustand store untuk state hero 3D di halaman utama.
 *
 * Spec Bagian 8b:
 *   idle      → orbit lambat
 *   typing    → denyut halus
 *   reviewing → orbit lebih cepat, glow bernapas
 *   done      → settle tenang
 *   error     → meredup/desaturasi, tanpa efek dramatis
 *
 * Ingat aturan 3: animasi TIDAK menandakan progres.
 * State "reviewing" hanya berarti "review sedang dikirim", bukan tahap progress.
 */
import { create } from "zustand";

export type HeroState = "idle" | "typing" | "reviewing" | "done" | "error";

interface HeroStore {
  state: HeroState;
  setState: (s: HeroState) => void;
}

export const useHeroStore = create<HeroStore>((set) => ({
  state: "idle",
  setState: (state) => set({ state }),
}));
