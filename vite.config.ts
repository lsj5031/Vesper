import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'Vesper',
				short_name: 'Vesper',
				description: 'Offline-first RSS reader. Where the day settles.',
				start_url: '/',
				display: 'standalone',
				background_color: '#0f1419',
				theme_color: '#990f3d',
				icons: [
					{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
					{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
				]
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
			}
		})
	],
	resolve: {
		alias: {
			path: 'path-browserify'
		}
	},
	ssr: {
		noExternal: ['path-browserify']
	},
	build: {
		target: 'es2022'
	}
});
