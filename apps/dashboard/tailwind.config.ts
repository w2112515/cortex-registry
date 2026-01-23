import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Precision Constellation Palette (Task-26g)
        void: {
          DEFAULT: "#030303",      // 纯黑，非紫黑
          grid: "rgba(255,255,255,0.03)", // 3% 网格线
        },
        signal: {
          platinum: "#E8E8E8",     // Stellar (最高等级)
          electric: "#00D4FF",     // Healthy
          amber: "#FF9F1C",        // Moderate (克制的橙)
          dim: "#4A4A4A",          // Low / Inactive
          red: "#FF4444",          // Challenged
        },
        glass: {
          surface: "rgba(20,20,20,0.85)",
          border: "rgba(255,255,255,0.08)",
          highlight: "rgba(255,255,255,0.15)",
        },
        // Legacy aliases for compatibility
        neon: {
          cyan: "#00D4FF",
          magenta: "#FF9F1C",
          violet: "#4A4A4A",
        },
        stellar: {
          gold: "#E8E8E8",
          white: "#E8E8E8",
        },
      },
      fontFamily: {
        display: ["Rajdhani", "sans-serif"],
        mono: ["Space Mono", "monospace"],
      },
      animation: {
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
        "grid-flow": "gridFlow 20s linear infinite",
        "star-twinkle": "starTwinkle 2s ease-in-out infinite",
        "data-stream": "dataStream 1.5s linear infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.1)" },
        },
        gridFlow: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "100px 100px" },
        },
        starTwinkle: {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        dataStream: {
          "0%": { strokeDashoffset: "20" },
          "100%": { strokeDashoffset: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      boxShadow: {
        "neon-cyan": "0 0 20px rgba(0, 243, 255, 0.5), 0 0 40px rgba(0, 243, 255, 0.3)",
        "neon-magenta": "0 0 20px rgba(255, 0, 229, 0.5), 0 0 40px rgba(255, 0, 229, 0.3)",
        "neon-gold": "0 0 20px rgba(255, 215, 0, 0.5), 0 0 40px rgba(255, 215, 0, 0.3)",
      },
      backgroundImage: {
        "deep-space": "radial-gradient(ellipse at center, #0f0033 0%, #030014 70%)",
        "nebula-glow": "radial-gradient(circle at 30% 50%, rgba(123, 44, 191, 0.15) 0%, transparent 50%)",
      },
    },
  },
  plugins: [],
};
export default config;
