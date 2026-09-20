// Dev-only. The editor ships with no build step and no dependencies; this
// config exists so the behavioural tests can run it in jsdom.
module.exports = {
  testEnvironment: 'jsdom',
  testEnvironmentOptions: { url: 'http://localhost/' },
  // jest-canvas-mock first: it has to install its canvas stub on the jsdom
  // window before the editor loads, because a component default is
  // render_on_canvas: true.
  setupFiles: ['jest-canvas-mock', '<rootDir>/tests/setup/editor.js'],
  testMatch: ['<rootDir>/tests/behavior/**/*.spec.js'],
};
