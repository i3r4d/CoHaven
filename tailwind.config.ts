import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms"; // Added for potential future use
import animate from "tailwindcss-animate"; // Keep existing animate plugin

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Keep existing palettes
        gold: {
          50: "#FBF8F1", 100: "#F9F3E2", 200: "#F2E4C0", 300: "#EACF95", 400: "#E3B564",
          500: "#D4AF37", 600: "#C49E32", 700: "#A47D28", 800: "#836420", 900: "#6F5018", 950: "#422E0C",
        },
        navy: {
          50: "#F0F1F3", 100: "#E1E3E7", 200: "#C3C8CF", 300: "#A5ACB7", 400: "#87919F",
          500: "#6A7587", 600: "#4F5A6D", 700: "#3D4656", 800: "#2B323F", 900: "#1A1F2C", 950: "#0D1015",
        },
        // Add Teal palette for accent
        teal: {
          50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
          500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'sans-serif'],
        serif: ['var(--font-serif)', 'serif'],
        poppins: ['var(--font-poppins)', 'sans-serif'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0", opacity: "0" }, to: { height: "var(--radix-accordion-content-height)", opacity: "1" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)", opacity: "1" }, to: { height: "0", opacity: "0" } },
        "fade-in": { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "fade-out": { "0%": { opacity: "1" }, "100%": { opacity: "0" } },
        // Add pulse animation
        pulse: { '50%': { opacity: '.5' } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "fade-out": "fade-out 0.5s ease-out",
        // Add pulse utility
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [animate, forms], // Added forms plugin
} satisfies Config;