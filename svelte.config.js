import cloudflare from '@sveltejs/adapter-cloudflare';
import staticAdapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isDesktop = process.env.BUILD_TARGET === 'desktop';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: isDesktop
			? staticAdapter({ fallback: 'index.html' })
			: cloudflare(),

		// Use relative paths for desktop (file:// loading)
		paths: {
			relative: isDesktop
		}
	}
};

export default config;
