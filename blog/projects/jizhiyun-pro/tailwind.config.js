module.exports = {
  darkMode: 'class',
  content: ['./index.html', './assets/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff', 100: '#d9eaff', 200: '#bcd9ff', 300: '#8ec0ff', 400: '#599cff',
          500: '#3373ff', 600: '#1c52f5', 700: '#163fe1', 800: '#1934b6', 900: '#1b338f'
        }
      },
      fontFamily: { sans: ['"Microsoft YaHei"', 'sans-serif'] }
    }
  }
}
