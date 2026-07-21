import { defineConfig } from 'vitepress';

const trNav = [
  { text: 'Başlangıç', link: '/getting-started' },
  { text: 'Mimari', link: '/architecture/overview' },
  { text: 'NThread', link: '/nthread/overview' },
  { text: 'Hooking', link: '/hooking/strategies' },
];

const trSidebar = [
  {
    text: 'Başlangıç',
    items: [
      { text: 'Genel bakış', link: '/getting-started' },
      { text: 'Güvenlik ve kapsam', link: '/safety' },
    ],
  },
  {
    text: 'Mimari',
    items: [
      { text: 'Genel bakış', link: '/architecture/overview' },
      { text: 'Tasarım kararları', link: '/architecture/decisions' },
      { text: 'Accessor zinciri', link: '/architecture/accessors' },
      { text: 'Windows x64 ABI', link: '/architecture/windows-x64-abi' },
    ],
  },
  {
    text: 'NThread',
    items: [
      { text: 'Neden NThread?', link: '/nthread/overview' },
      { text: 'Çağrı yaşam döngüsü', link: '/nthread/call-lifecycle' },
      { text: 'Thread seçimi', link: '/nthread/thread-selection' },
      { text: 'Çökme ve hata ayıklama', link: '/nthread/failure-modes' },
      { text: 'Sorun giderme', link: '/nthread/troubleshooting' },
    ],
  },
  {
    text: 'Hooking',
    items: [
      { text: 'NHook ve MinHook', link: '/hooking/strategies' },
      { text: 'Hook yaşam döngüsü', link: '/hooking/lifecycle' },
    ],
  },
  {
    text: 'Bileşenler',
    items: [
      { text: 'Paket haritası', link: '/packages' },
      { text: 'NThread accessor kullanımı', link: '/packages/nthread' },
      { text: 'XFFI kullanım rehberi', link: '/packages/xffi' },
      { text: 'Geliştirme ve test', link: '/development' },
      { text: 'Sorun giderme', link: '/troubleshooting' },
      { text: 'Kavram sözlüğü', link: '/glossary' },
    ],
  },
];

const enNav = [
  { text: 'Getting started', link: '/en/getting-started' },
  { text: 'Architecture', link: '/en/architecture/overview' },
  { text: 'NThread', link: '/en/nthread/overview' },
  { text: 'Hooking', link: '/en/hooking/strategies' },
];

const enSidebar = [
  {
    text: 'Getting started',
    items: [
      { text: 'Overview', link: '/en/getting-started' },
      { text: 'Safety and scope', link: '/en/safety' },
    ],
  },
  {
    text: 'Architecture',
    items: [
      { text: 'Overview', link: '/en/architecture/overview' },
      { text: 'Design decisions', link: '/en/architecture/decisions' },
      { text: 'Accessor chain', link: '/en/architecture/accessors' },
      { text: 'Windows x64 ABI', link: '/en/architecture/windows-x64-abi' },
    ],
  },
  {
    text: 'NThread',
    items: [
      { text: 'Why NThread?', link: '/en/nthread/overview' },
      { text: 'Call lifecycle', link: '/en/nthread/call-lifecycle' },
      { text: 'Thread selection', link: '/en/nthread/thread-selection' },
      { text: 'Failure modes', link: '/en/nthread/failure-modes' },
      { text: 'Troubleshooting', link: '/en/nthread/troubleshooting' },
    ],
  },
  {
    text: 'Hooking',
    items: [
      { text: 'NHook and MinHook', link: '/en/hooking/strategies' },
      { text: 'Hook lifecycle', link: '/en/hooking/lifecycle' },
    ],
  },
  {
    text: 'Components',
    items: [
      { text: 'Package map', link: '/en/packages' },
      { text: 'NThread accessors', link: '/en/packages/nthread' },
      { text: 'Using XFFI', link: '/en/packages/xffi' },
      { text: 'Development and testing', link: '/en/development' },
      { text: 'Troubleshooting', link: '/en/troubleshooting' },
      { text: 'Glossary', link: '/en/glossary' },
    ],
  },
];

export default defineConfig({
  // Local development uses `/`. GitHub Pages builds inject the repository
  // path (and, for branch previews, the preview path) through DOCS_BASE.
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  title: 'Exoproc',
  description: 'Cross-process instrumentation for Windows x64',
  locales: {
    root: {
      label: 'Türkçe',
      lang: 'tr-TR',
      themeConfig: {
        nav: trNav,
        sidebar: trSidebar,
        outlineTitle: 'Bu sayfada',
        docFooter: { prev: 'Önceki sayfa', next: 'Sonraki sayfa' },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        outlineTitle: 'On this page',
        docFooter: { prev: 'Previous page', next: 'Next page' },
      },
    },
  },
  themeConfig: {
    siteTitle: 'Exoproc',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/woldann/exoproc' },
    ],
    search: { provider: 'local' },
  },
});
