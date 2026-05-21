
import tailwindcssAnimate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

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
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			colors: {
				// SES color palette
				"soft-black": "#19191E", // Soft Black (25, 25, 30)
				"cyan-blue": "#0091D2", // Cyan Blue (0, 145, 210)
				"magenta": "#B40082", // Magenta (180, 0, 130)
				"dark-blue": "#003A70", // Dark Blue
				"dark-grey": "#505A64", // Dark Grey (80, 90, 100)
				"light-grey": "#AEB8C3", // Light Grey (174, 184, 195)
				"purple": "#6E2D87", // Purple (110, 45, 135)
				"green": "#008732", // Green (0, 135, 50)

				// Theme variables
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				// App-specific colors
				linkedin: {
					DEFAULT: '#0A66C2',
					dark: '#004182'
				},
				success: {
					DEFAULT: '#008732', // Using SES Green
					foreground: '#FFFFFF'
				},
				warning: {
					DEFAULT: '#FBBF24',
					foreground: '#92400E'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				"accordion-down": {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				"accordion-up": {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' },
				},
				"fade-in": {
					"0%": { opacity: "0", transform: "translateY(10px)" },
					"100%": { opacity: "1", transform: "translateY(0)" }
				},
				"slide-in": {
					"0%": { transform: "translateX(100%)" },
					"100%": { transform: "translateX(0)" }
				},
				"pulse-light": {
					"0%, 100%": { opacity: "1" },
					"50%": { opacity: "0.7" }
				},
				"scale": {
					"0%": { transform: "scale(0.95)" },
					"100%": { transform: "scale(1)" }
				}
			},
			animation: {
				"accordion-down": "accordion-down 0.2s ease-out",
				"accordion-up": "accordion-up 0.2s ease-out",
				"fade-in": "fade-in 0.3s ease-out",
				"slide-in": "slide-in 0.3s ease-out",
				"pulse-light": "pulse-light 2s ease-in-out infinite",
				"scale": "scale 0.2s ease-out"
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
