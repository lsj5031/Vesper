<script lang="ts">
    import { showSettings } from '../stores';
    import { importOPML, exportOPML } from '../opml';
    import { importBackup, exportBackup } from '../backup';

    function close() {
        $showSettings = false;
    }

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

<div class="fixed inset-0 z-50 flex items-center justify-center bg-o3-black-90/90 backdrop-blur-sm">
    <button 
        class="fixed inset-0 cursor-default"
        on:click={close}
        aria-label="Close settings modal"
    ></button>
    
    <div 
        class="bg-o3-black-80 border border-o3-teal p-6 shadow-2xl max-w-md w-full rounded relative z-10"
        role="dialog"
        aria-modal="true"
    >
        <div class="mb-6">
            <h2 class="text-2xl font-headline font-bold text-o3-white mb-2">Settings & Data</h2>
            <p class="text-sm text-o3-black-40">Manage your feeds and data</p>
        </div>

        <div class="space-y-6">
            <!-- OPML -->
            <div class="space-y-2">
                <h3 class="text-sm font-bold text-o3-teal uppercase tracking-wider">OPML Import/Export</h3>
                <div class="flex gap-2">
                    <button class="btn btn-sm variant-filled-surface flex-1 border border-o3-black-30 hover:bg-o3-black-70 text-o3-paper" on:click={() => document.getElementById('opmlInput')?.click()}>
                        Import OPML
                    </button>
                    <button class="btn btn-sm variant-filled-surface flex-1 border border-o3-black-30 hover:bg-o3-black-70 text-o3-paper" on:click={exportOPML}>
                        Export OPML
                    </button>
                </div>
                <input type="file" id="opmlInput" class="hidden" on:change={handleFileSelect} accept=".opml,.xml" />
            </div>

            <!-- Backup -->
            <div class="space-y-2">
                <h3 class="text-sm font-bold text-o3-teal uppercase tracking-wider">Full Backup</h3>
                <div class="flex gap-2">
                    <button class="btn btn-sm variant-filled-surface flex-1 border border-o3-black-30 hover:bg-o3-black-70 text-o3-paper" on:click={() => document.getElementById('backupInput')?.click()}>
                        Restore Backup
                    </button>
                    <button class="btn btn-sm variant-filled-surface flex-1 border border-o3-black-30 hover:bg-o3-black-70 text-o3-paper" on:click={exportBackup}>
                        Backup Data
                    </button>
                </div>
                <input type="file" id="backupInput" class="hidden" on:change={handleBackupSelect} accept=".json" />
            </div>
        </div>

        <div class="mt-8 text-center">
            <button 
                class="text-sm text-o3-black-40 hover:text-o3-teal transition"
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
