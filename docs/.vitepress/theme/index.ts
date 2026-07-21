import DefaultTheme from 'vitepress/theme';
import NThreadSimulator from './NThreadSimulator.vue';
import './simulator.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('NThreadSimulator', NThreadSimulator);
  },
};
