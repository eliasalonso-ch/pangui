/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./lib/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
  	extend: {
  		colors: {
  			// v2 surface stack — resolves to CSS vars, works in both modes
  			surface: {
  				0:       'var(--surface-0)',
  				1:       'var(--surface-1)',
  				2:       'var(--surface-2)',
  				hover:   'var(--surface-hover)',
  				active:  'var(--surface-active)',
  			},
  			// v2 foreground stack
  			fg: {
  				1: 'var(--fg-1)',
  				2: 'var(--fg-2)',
  				3: 'var(--fg-3)',
  				4: 'var(--fg-4)',
  			},
  			// v2 brand
  			brand: {
  				DEFAULT: 'var(--brand)',
  				hover:   'var(--brand-hover)',
  				active:  'var(--brand-active)',
  				fg:      'var(--brand-fg)',
  				tint:    'var(--brand-tint)',
  				'tint-2':'var(--brand-tint-2)',
  				// legacy static aliases kept for existing usages
  				mid:     '#2563EB',
  				dark:    '#1E3A8A',
  				light:   '#EFF6FF',
  			},
  			slate: {
  				'950': '#0A0F1E'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background-hsl))',
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
  		fontFamily: {
  			sans: [
  				'var(--font-sans)',
  				'Geist',
  				'system-ui',
  				'sans-serif'
  			],
  			heading: [
  				'var(--font-heading)',
  				'Inter',
  				'system-ui',
  				'sans-serif'
  			]
  		},
  		fontSize: {
  			'2xs':  ['10px', { lineHeight: '1.4' }],
  			'xs':   ['11px', { lineHeight: '1.4' }],
  			'sm':   ['12px', { lineHeight: '1.5' }],
  			'base': ['14px', { lineHeight: '1.5' }],
  			'md':   ['15px', { lineHeight: '1.5' }],
  			'lg':   ['16px', { lineHeight: '1.5' }],
  			'xl':   ['18px', { lineHeight: '1.3' }],
  			'2xl':  ['22px', { lineHeight: '1.3' }],
  			'3xl':  ['28px', { lineHeight: '1.2' }],
  			'4xl':  ['34px', { lineHeight: '1.15' }],
  		},
  		borderRadius: {
  			xs:   'var(--r-xs)',   // 4px
  			sm:   'var(--r-sm)',   // 6px
  			DEFAULT: 'var(--r-sm)',
  			md:   'var(--r-md)',   // 8px
  			lg:   'var(--r-lg)',   // 12px
  			xl:   'var(--r-xl)',   // 16px
  			'2xl': '1.25rem',
  			pill: 'var(--r-pill)', // 9999px
  		},
  		boxShadow: {
  			xs:    'var(--shadow-xs)',
  			sm:    'var(--shadow-sm)',
  			md:    'var(--shadow-md)',
  			lg:    'var(--shadow-lg)',
  			glow:  'var(--shadow-glow)',
  			focus: 'var(--shadow-focus)',
  		},
  		animation: {
  			'fade-in': 'fadeIn 0.5s ease forwards',
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		},
  		keyframes: {
  			fadeIn: {
  				from: { opacity: 0, transform: 'translateY(16px)' },
  				to:   { opacity: 1, transform: 'translateY(0)' }
  			},
  			'accordion-down': {
  				from: { height: '0' },
  				to:   { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to:   { height: '0' }
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
  corePlugins: {
    preflight: false,
  },
};
