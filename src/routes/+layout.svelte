<script lang="ts">
	import '../app.postcss';
	import HelpModal from '$lib/components/HelpModal.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import { showHelp, showSettings } from '$lib/stores';

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
</script>

<svelte:window on:keydown={handleGlobalKeydown} />

{#if $showHelp}
	<HelpModal />
{/if}

{#if $showSettings}
	<SettingsModal />
{/if}

<slot />
