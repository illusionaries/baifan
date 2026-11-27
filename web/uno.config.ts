import { defineConfig, presetWind4 } from 'unocss'

/** UnoCSS 只留 utility 层；视觉 token 在 src/style.css 里 */
export default defineConfig({
  presets: [presetWind4()],
})
