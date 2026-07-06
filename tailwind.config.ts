import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
  		fontFamily: {
  			sans: [
  				'Inter',
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif',
  				'Apple Color Emoji',
  				'Segoe UI Emoji',
  				'Segoe UI Symbol',
  				'Noto Color Emoji'
  			],
  			display: [
  				'Sora',
  				'system-ui',
  				'sans-serif'
  			],
  			serif: [
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			],
  			mono: [
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			]
  		},
  		colors: {
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
  			navy: {
  				DEFAULT: 'hsl(var(--navy))',
  				light: 'hsl(var(--navy-light))',
  				dark: 'hsl(var(--navy-dark))'
  			},
  			cyan: {
  				DEFAULT: 'hsl(var(--cyan))',
  				light: 'hsl(var(--cyan-light))',
  				glow: 'hsl(var(--cyan-glow))'
  			},
  			severity: {
  				critical: 'hsl(var(--critical))',
  				high: 'hsl(var(--high))',
  				medium: 'hsl(var(--medium))',
  				low: 'hsl(var(--low))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
		keyframes: {
			'accordion-down': {
				from: {
					height: '0'
				},
				to: {
					height: 'var(--radix-accordion-content-height)'
				}
			},
			'accordion-up': {
				from: {
					height: 'var(--radix-accordion-content-height)'
				},
				to: {
					height: '0'
				}
			},
			'fade-in': {
				from: {
					opacity: '0',
					transform: 'translateY(10px)'
				},
				to: {
					opacity: '1',
					transform: 'translateY(0)'
				}
			},
			'fade-in-up': {
				from: {
					opacity: '0',
					transform: 'translateY(20px)'
				},
				to: {
					opacity: '1',
					transform: 'translateY(0)'
				}
			},
			'slide-in-right': {
				from: {
					opacity: '0',
					transform: 'translateX(20px)'
				},
				to: {
					opacity: '1',
					transform: 'translateX(0)'
				}
			},
			'scale-in': {
				from: {
					opacity: '0',
					transform: 'scale(0.95)'
				},
				to: {
					opacity: '1',
					transform: 'scale(1)'
				}
			},
			'pulse-glow': {
				'0%, 100%': {
					boxShadow: '0 0 20px hsl(var(--cyan) / 0.3)'
				},
				'50%': {
					boxShadow: '0 0 40px hsl(var(--cyan) / 0.5)'
				}
			},
			'engine-pulse': {
				'0%, 100%': {
					boxShadow: '0 0 20px hsl(var(--accent) / 0.4)'
				},
				'50%': {
					boxShadow: '0 0 35px hsl(var(--accent) / 0.7)',
					borderColor: 'hsl(var(--accent))'
				}
			},
			'flow': {
				to: {
					strokeDashoffset: '-20'
				}
			},
			'scroll-left': {
				'0%': { transform: 'translateX(0)' },
				'100%': { transform: 'translateX(-50%)' }
			}
		},
		animation: {
			'accordion-down': 'accordion-down 0.2s ease-out',
			'accordion-up': 'accordion-up 0.2s ease-out',
			'fade-in': 'fade-in 0.5s ease-out',
			'fade-in-up': 'fade-in-up 0.6s ease-out',
			'slide-in-right': 'slide-in-right 0.5s ease-out',
			'scale-in': 'scale-in 0.3s ease-out',
			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
			'engine-pulse': 'engine-pulse 4s ease-in-out infinite',
			'flow': 'flow 3s linear infinite',
			'scroll-left': 'scroll-left 25s linear infinite'
		},
  		boxShadow: {
  			glow: '0 0 30px hsl(var(--cyan) / 0.3)',
  			'glow-lg': '0 0 60px hsl(var(--cyan) / 0.4)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
