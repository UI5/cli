import colors from 'tailwindcss/colors'

/** @type {import('tailwindcss').Config} */
export default {
  // rely on html dark class instead of media:prefers-color-scheme
  // https://tailwindcss.com/docs/dark-mode#toggling-dark-mode-manually
  darkMode: 'class',
  content: [
    "./.vitepress/theme/**/*.{vue,js,ts,jsx,tsx}",
    "./src/**/*.{vue,js,ts,jsx,tsx,md}",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    colors: {
      /* defaults */
      current: 'currentColor',
      transparent: 'transparent',
      black: colors.black,
      white: colors.white,
      gray: colors.gray,
      slate: colors.slate,
      red: colors.red,
      green: colors.green,
      blue: colors.blue,
      /* custom
      ** https://uicolors.app/create
      */
      fire: {
        DEFAULT: '#ff5a37',
        secondary: '#ffa42c'
      },
      water: {
        DEFAULT: '#1873b4',
        secondary: '#53b8de'
      },
      'outrageous-orange': {
        DEFAULT: '#ff5a37', // outrageous-orange-400
        '50': '#fff2ed',
        '100': '#ffe1d4',
        '200': '#ffbfa8',
        '300': '#ff9371',
        '400': '#ff5a37',
        '500': '#fe3111',
        '600': '#ef1707',
        '700': '#c60b08',
        '800': '#9d0f12',
        '900': '#7e1012',
        '950': '#44060a',
      },
      'sunshade': {
        DEFAULT: '#ffa42c', // sunshade-400
        '50': '#fff8eb',
        '100': '#ffebc6',
        '200': '#ffd588',
        '300': '#ffb94a',
        '400': '#ffa42c',
        '500': '#f97a07',
        '600': '#dd5602',
        '700': '#b73806',
        '800': '#942a0c',
        '900': '#7a230d',
        '950': '#461002',
      },
      'denim': {
        DEFAULT: '#1873b4', // denim-600
        '50': '#f2f8fd',
        '100': '#e3effb',
        '200': '#c1e0f6',
        '300': '#8bc6ee',
        '400': '#4daae3',
        '500': '#268fd1',
        '600': '#1873b4',
        '700': '#45b90',
        '800': '#154d77',
        '900': '#174163',
        '950': '#0f2a42',
      },
      'viking': {
        DEFAULT: '#53b8de', // viking-400
        '50': '#f2f9fd',
        '100': '#e4f2fa',
        '200': '#c3e5f4',
        '300': '#8ed0eb',
        '400': '#53b8de',
        '500': '#2c9fcb',
        '600': '#1d80ac',
        '700': '#19678b',
        '800': '#185774',
        '900': '#194861',
        '950': '#112f40',
      },      
    },
  }, 
}
