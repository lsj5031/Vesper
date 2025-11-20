<script lang="ts">
    import { showSettings, themeMode } from '../stores';
    import { importOPML, exportOPML } from '../opml';
    import { importBackup, exportBackup } from '../backup';

    function close() {
        $showSettings = false;
    }

    let isDark: boolean;
    $: isDark = $themeMode === 'dark';

    function handleFileSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files?.length) {
            importOPML(input.files[0]).then(() => alert('Imported!'));
        }
    }

    function handleBackupSelect(e: Event) {
        const input = e.target as HTMLInputElement;
        if (input.files?.length) {
            importBackup(input.files[0]).then(() => alert('Restored!'));
        }
    }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-paper)'}`}>
    <button 
        class="fixed inset-0 cursor-default"
        on:click={close}
        aria-label="Close settings modal"
    ></button>
    
    <div 
        class="border border-o3-teal p-6 shadow-2xl max-w-md w-full rounded relative z-10"
        role="dialog"
        aria-modal="true"
        style={`background:var(--vesper-panel)`}
    >
        <div class="mb-6">
            <h2 class="text-2xl font-headline font-bold mb-2" style={`color:${isDark ? 'var(--o3-color-palette-white)' : 'var(--o3-color-palette-black-90)'}`}>Settings & Data</h2>
            <p class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Manage your feeds and data</p>
        </div>

        <div class="space-y-6">
            <!-- OPML -->
            <div class="space-y-2">
                <h3 class="text-sm font-bold text-o3-teal uppercase tracking-wider" style={`color:${isDark ? 'var(--o3-color-palette-teal)' : 'var(--o3-color-palette-teal)'}`}>OPML Import/Export</h3>
                <div class="flex gap-2">
                    <button 
                        class="flex-1 px-3 py-2 rounded text-xs font-semibold uppercase tracking-wide transition-colors border"
                        class:border-o3-teal={true}
                        class:text-o3-teal={true}
                        class:bg-o3-teal={false}
                        class:text-o3-black-90={false}
                        style={isDark ? 'border-opacity: 0.5; background: rgba(17, 153, 142, 0.1)' : 'border-opacity: 0.3; background: rgba(17, 153, 142, 0.05)'}
                        on:click={() => document.getElementById('opmlInput')?.click()}
                    >
                        Import OPML
                    </button>
                    <button 
                        class="flex-1 px-3 py-2 rounded text-xs font-semibold uppercase tracking-wide transition-colors border"
                        class:border-o3-teal={true}
                        class:text-o3-teal={true}
                        class:bg-o3-teal={false}
                        class:text-o3-black-90={false}
                        style={isDark ? 'border-opacity: 0.5; background: rgba(17, 153, 142, 0.1)' : 'border-opacity: 0.3; background: rgba(17, 153, 142, 0.05)'}
                        on:click={exportOPML}
                    >
                        Export OPML
                    </button>
                </div>
                <input type="file" id="opmlInput" class="hidden" on:change={handleFileSelect} accept=".opml,.xml" />
            </div>

            <!-- Backup -->
            <div class="space-y-2">
                <h3 class="text-sm font-bold text-o3-teal uppercase tracking-wider" style={`color:${isDark ? 'var(--o3-color-palette-teal)' : 'var(--o3-color-palette-teal)'}`}>Full Backup</h3>
                <div class="flex gap-2">
                    <button 
                        class="flex-1 px-3 py-2 rounded text-xs font-semibold uppercase tracking-wide transition-colors border"
                        class:border-o3-teal={true}
                        class:text-o3-teal={true}
                        class:bg-o3-teal={false}
                        class:text-o3-black-90={false}
                        style={isDark ? 'border-opacity: 0.5; background: rgba(17, 153, 142, 0.1)' : 'border-opacity: 0.3; background: rgba(17, 153, 142, 0.05)'}
                        on:click={() => document.getElementById('backupInput')?.click()}
                    >
                        Restore Backup
                    </button>
                    <button 
                        class="flex-1 px-3 py-2 rounded text-xs font-semibold uppercase tracking-wide transition-colors border"
                        class:border-o3-teal={true}
                        class:text-o3-teal={true}
                        class:bg-o3-teal={false}
                        class:text-o3-black-90={false}
                        style={isDark ? 'border-opacity: 0.5; background: rgba(17, 153, 142, 0.1)' : 'border-opacity: 0.3; background: rgba(17, 153, 142, 0.05)'}
                        on:click={exportBackup}
                    >
                        Backup Data
                    </button>
                </div>
                <input type="file" id="backupInput" class="hidden" on:change={handleBackupSelect} accept=".json" />
            </div>
        </div>

        <div class="mt-8 text-center">
            <button 
                class="px-4 py-2 rounded text-xs font-semibold uppercase tracking-wide transition-colors text-o3-black-40 hover:text-o3-black-60"
                class:hover:text-o3-black-50={isDark}
                on:click={close}
            >
                Close
            </button>
        </div>
    </div>
</div>

<style>
    :global(body) {
        overflow: hidden;
    }
</style>
