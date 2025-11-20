<script lang="ts">
	import '../app.postcss';
	import HelpModal from '$lib/components/HelpModal.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import { showHelp, showSettings, themeMode } from '$lib/stores';

	export let data;
	export let params;
	export let form;
	const _kitProps = { data, params, form };

	function handleGlobalKeydown(e: KeyboardEvent) {
		// Toggle help on '?' or Shift+'/'
		if (e.key === '?' || (e.shiftKey && e.key === '/')) {
			$showHelp = !$showHelp;
		}
		
		// Close help on Escape
		if (e.key === 'Escape' && $showHelp) {
			$showHelp = false;
		}
	}

	// Apply theme (Tailwind dark mode + Origami data-theme hook)
	$: if (typeof document !== 'undefined') {
		const isDark = $themeMode === 'dark';
		document.documentElement.classList.toggle('dark', isDark);
		document.body.dataset.theme = isDark ? 'vesper' : 'vesper-light';
		document.body.dataset.mode = $themeMode;
	}
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

{#if $showHelp}
	<HelpModal />
{/if}

{#if $showSettings}
	<SettingsModal />
{/if}

<slot />
