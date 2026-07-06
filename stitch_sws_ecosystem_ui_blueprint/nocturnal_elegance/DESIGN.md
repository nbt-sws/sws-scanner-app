---
name: Nocturnal Elegance
colors:
  surface: '#11131b'
  surface-dim: '#11131b'
  surface-bright: '#373942'
  surface-container-lowest: '#0c0e16'
  surface-container-low: '#191b24'
  surface-container: '#1d1f28'
  surface-container-high: '#282a32'
  surface-container-highest: '#33343e'
  on-surface: '#e2e1ee'
  on-surface-variant: '#ddbfc3'
  inverse-surface: '#e2e1ee'
  inverse-on-surface: '#2e3039'
  outline: '#a58a8e'
  outline-variant: '#564145'
  surface-tint: '#ffb2bf'
  primary: '#ffb2bf'
  on-primary: '#660028'
  primary-container: '#e86585'
  on-primary-container: '#5a0022'
  inverse-primary: '#a83354'
  secondary: '#c1c6da'
  on-secondary: '#2b3040'
  secondary-container: '#414657'
  on-secondary-container: '#b0b4c8'
  tertiary: '#bfc6dd'
  on-tertiary: '#293042'
  tertiary-container: '#8990a6'
  on-tertiary-container: '#22293b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffd9de'
  primary-fixed-dim: '#ffb2bf'
  on-primary-fixed: '#3f0016'
  on-primary-fixed-variant: '#88193d'
  secondary-fixed: '#dee2f7'
  secondary-fixed-dim: '#c1c6da'
  on-secondary-fixed: '#161b2a'
  on-secondary-fixed-variant: '#414657'
  tertiary-fixed: '#dbe2fa'
  tertiary-fixed-dim: '#bfc6dd'
  on-tertiary-fixed: '#141b2c'
  on-tertiary-fixed-variant: '#3f4659'
  background: '#11131b'
  on-background: '#e2e1ee'
  surface-variant: '#33343e'
typography:
  headline-xl:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base-unit: 4px
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style
The design system embodies a sophisticated, high-end digital experience tailored for luxury, night-mode-first applications. The aesthetic is a fusion of **Modern Corporate** precision and **Glassmorphism**, creating an atmosphere of exclusivity and calm. 

The target audience values refinement and visual comfort during late-hour usage. The UI should evoke a sense of "quiet luxury"—stable, professional, yet punctuated by vibrant, energetic accents. By utilizing deep navy surfaces and translucent layers, the system provides depth without clutter, ensuring a focused and premium user journey.

## Colors
The palette is anchored by a deep, expansive dark navy (#0a0c14) which serves as the canvas. The primary accent, a refined Midnight Rose (#e05e7e), is reserved for critical actions, active states, and brand highlights to ensure high contrast and visual "pop" against the dark background.

Secondary and tertiary navies are used for surface nesting and container differentiation. Functional colors for success, warning, and error should be desaturated to maintain the dark aesthetic, while text should leverage off-whites and cool grays to reduce eye strain.

## Typography
This design system utilizes a tiered typographic approach to balance modern professional appeal with technical precision. 
- **Headlines:** Manrope provides a balanced, contemporary feel with geometric influences that pair perfectly with dark backgrounds.
- **Body:** Inter is used for its exceptional legibility and neutral systematic tone, ensuring long-form content is easy to digest.
- **Labels/Data:** JetBrains Mono is introduced for metadata, labels, and small technical details to lean into the precise, developer-friendly side of the "Midnight" aesthetic.

## Layout & Spacing
The layout follows a **Fluid Grid** model with strict adherence to an 8px spatial rhythm. 

- **Desktop:** 12-column grid with 24px gutters. Content is centered with a max-width of 1280px to maintain readability on ultrawide monitors.
- **Tablet:** 8-column grid with 20px gutters. Margins scale down to 32px.
- **Mobile:** 4-column grid with 16px gutters and 16px side margins. 

Internal component spacing (padding/gap) should always be a multiple of the 4px base unit to ensure visual harmony and mathematical alignment.

## Elevation & Depth
Depth is created through **Tonal Layers** and **Glassmorphism** rather than traditional heavy shadows. 

1. **Base:** The background navy (#0a0c14).
2. **Surfaces:** Slightly lighter navy (#1a1f2e) with a subtle 1px inner stroke (10% white) to define edges.
3. **Overlays:** Semi-transparent blurs (Backdrop Filter: 12px blur) are used for navigation bars and modals to maintain context of the content beneath.
4. **Shadows:** Use extremely soft, large-radius ambient shadows with a hint of the primary rose color for active elevated elements to simulate a subtle glow.

## Shapes
The design system employs a **Rounded** shape language to soften the high-contrast color palette. Standard buttons and input fields utilize a 0.5rem (8px) radius. Larger cards and containers scale to 1rem or 1.5rem to create a distinct nesting hierarchy. This consistency ensures the UI feels approachable despite its dark and moody atmosphere.

## Components
- **Buttons:** Primary buttons use the Midnight Rose (#e05e7e) fill with white text. Secondary buttons use a transparent background with a 1px navy-light border.
- **Cards:** Use the secondary navy background with a 0.5rem corner radius. Include a very subtle hover state that increases the brightness of the background color by 5%.
- **Input Fields:** Darker than the surface they sit on, with a 1px border that glows Midnight Rose when focused.
- **Chips:** Highly desaturated versions of the primary color with high-contrast text for status indicators.
- **Lists:** Separated by thin, low-opacity (5-10%) white lines to maintain structure without breaking the flow of the dark background.
- **Glass Modals:** Use a 70% opacity navy background with a 20px backdrop blur for a premium, high-depth feel.