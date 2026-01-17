<script lang="ts">
    import { onDestroy } from 'svelte';
    import { liveQuery } from 'dexie';
    import Dexie from 'dexie';
    import { db } from '../db';
    import { importOPML } from '../opml';
    import { addNewFeed } from '../rss';
    import { themeMode } from '../stores';

    const feedCountStore = liveQuery(() => db.feeds.count());

    let dismissed = false;
    let newFeedUrl = '';
    let errorMessage: string | null = null;
    let isAdding = false;
    let isImporting = false;
    let previousBodyOverflow: string | null = null;

    $: isDark = $themeMode === 'dark';
    $: feedCount = $feedCountStore;
    $: shouldShow = typeof feedCount === 'number' && feedCount === 0 && !dismissed;

    function close() {
        dismissed = true;
        errorMessage = null;
    }

    $: if (typeof feedCount === 'number' && feedCount > 0) {
        dismissed = false;
        errorMessage = null;
        newFeedUrl = '';
    }

    $: if (typeof document !== 'undefined') {
        if (shouldShow) {
            if (previousBodyOverflow === null) {
                previousBodyOverflow = document.body.style.overflow;
            }
            document.body.style.overflow = 'hidden';
        } else if (previousBodyOverflow !== null) {
            document.body.style.overflow = previousBodyOverflow;
            previousBodyOverflow = null;
        }
    }

    onDestroy(() => {
        if (previousBodyOverflow !== null && typeof document !== 'undefined') {
            document.body.style.overflow = previousBodyOverflow;
        }
    });

    async function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files?.length) {
            errorMessage = null;
            isImporting = true;
            const file = input.files[0];
            try {
                await importOPML(file);
                close();
            } catch (err) {
                console.error('Failed to import OPML', err);
                errorMessage = 'Import failed. Make sure the OPML file is valid and try again.';
            } finally {
                isImporting = false;
                input.value = '';
            }
        }
    }

    async function handleAddFeed() {
        const url = newFeedUrl.trim();
        if (!url) return;
        
        errorMessage = null;
        isAdding = true;
        
        try {
            await addNewFeed(url);
            close();
        } catch (e) {
            if (e instanceof Dexie.ConstraintError) {
                errorMessage = 'Feed already exists.';
            } else {
                console.error('Failed to add feed', e);
                errorMessage = 'Could not add feed. Please check the URL and try again.';
            }
        } finally {
            isAdding = false;
        }
    }
</script>

{#if shouldShow}
    <div class="fixed inset-0 z-50 flex items-center justify-center" style={`background:${isDark ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.9)'}`}>
        <button 
            class="fixed inset-0 cursor-default"
            on:click={close}
            aria-label="Close onboarding modal"
        ></button>
        
        <div 
            class="border border-o3-teal p-8 shadow-2xl max-w-lg w-full rounded relative z-10"
            role="dialog"
            aria-modal="true"
            style={`background:var(--vesper-panel)`}
        >
            <div class="mb-6 text-center">
                <h2 class="text-3xl font-headline font-bold mb-3" style={`color:${isDark ? 'var(--o3-color-palette-white)' : 'var(--o3-color-palette-black-90)'}`}>Welcome to Vesper</h2>
                <p class="text-base" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Add your first feed or import your subscriptions to begin reading.</p>
            </div>

            {#if errorMessage}
                <div 
                    class="mb-4 rounded border border-o3-claret px-3 py-2"
                    style={`background:${isDark ? 'rgba(126, 15, 51, 0.12)' : 'rgba(126, 15, 51, 0.05)'}`}
                >
                    <p class="text-sm font-semibold text-o3-claret">Something went wrong</p>
                    <p class="text-xs" style={`color:${isDark ? 'var(--o3-color-palette-white-80)' : 'var(--o3-color-palette-black-70)'}`}>{errorMessage}</p>
                </div>
            {/if}

            <div class="space-y-6">
                <!-- Add Feed -->
                <div class="space-y-3">
                    <h3 class="text-sm font-bold uppercase tracking-wider" style={`color:${isDark ? 'var(--o3-color-palette-teal)' : 'var(--o3-color-palette-teal)'}`}>Add Your First Feed</h3>
                    <div class="flex gap-2">
                        <input 
                            type="text" 
                            bind:value={newFeedUrl} 
                            placeholder="Feed URL (https://example.com/rss)" 
                            class={`input text-sm h-10 rounded placeholder-o3-black-50 focus:ring-1 focus:ring-o3-teal flex-1 ${isDark ? 'bg-o3-black-80 border-none text-o3-paper' : 'bg-o3-white border border-o3-black-20 text-o3-black-90'}`}
                            on:keydown={(e) => e.key === 'Enter' && handleAddFeed()}
                            disabled={isAdding || isImporting}
                        />
                        <button
                            class="btn-vesper-secondary"
                            on:click={handleAddFeed}
                            disabled={!newFeedUrl.trim() || isAdding || isImporting}
                        >
                            {isAdding ? 'Adding…' : 'Add'}
                        </button>
                    </div>
                </div>

                <!-- Divider -->
                <div class="relative">
                    <div class="absolute inset-0 flex items-center">
                        <div class="w-full border-t" style={`border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}></div>
                    </div>
                    <div class="relative flex justify-center text-xs uppercase tracking-wider">
                        <span class="px-2" style={`background:var(--vesper-panel);color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-60)'}`}>or</span>
                    </div>
                </div>

                <!-- Import OPML -->
                <div class="space-y-3">
                    <h3 class="text-sm font-bold uppercase tracking-wider" style={`color:${isDark ? 'var(--o3-color-palette-teal)' : 'var(--o3-color-palette-teal)'}`}>Import from OPML</h3>
                    <button
                        class="btn-vesper-secondary w-full py-3"
                        on:click={() => document.getElementById('onboarding-opml-input')?.click()}
                        disabled={isAdding || isImporting}
                    >
                        {isImporting ? 'Importing…' : 'Choose OPML File'}
                    </button>
                    <input type="file" id="onboarding-opml-input" class="hidden" on:change={handleFileSelect} accept=".opml,.xml" />
                </div>
            </div>

            <div class="mt-8 text-center">
                <button
                    class="btn-vesper-text"
                    on:click={close}
                >
                    Skip for now
                </button>
            </div>
        </div>
    </div>
{/if}
