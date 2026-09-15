import { createApp } from 'vue'
import { createPinia } from 'pinia'

import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/tokens.css'
import './styles/section.css'

import App from './App.vue'
import router from './router'
import { useTheme } from './stores/theme'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Theme is applied before the first paint so there is no light-to-dark flash.
useTheme(pinia).init()

app.use(router)
app.mount('#app')
