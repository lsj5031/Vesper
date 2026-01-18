<script lang="ts">
import { onMount, onDestroy } from "svelte";
import { fade, scale } from "svelte/transition";
import { quintOut } from "svelte/easing";
import Dexie from "dexie";
import { showSettings, themeMode, userSettings } from "../stores";
import { importOPML, exportOPML } from "../opml";
import { importBackup, exportBackup } from "../backup";
import { addNewFeed } from "../rss";

let prevOverflow = "";
onMount(() => {
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
});
onDestroy(() => {
    document.body.style.overflow = prevOverflow;
});

function close() {
    $showSettings = false;
}

let isDark: boolean;
$: isDark = $themeMode === "dark";
let errorMessage: string | null = null;
let newFeedUrl = "";
let isAddingFeed = false;

let importProgress = {
    current: 0,
    total: 0,
    stage: "",
    currentFile: "",
};
let isImporting = false;

async function handleAddFeed() {
    const url = newFeedUrl.trim();
    if (!url || isAddingFeed) return;
    errorMessage = null;
    isAddingFeed = true;
    try {
        await addNewFeed(url);
        newFeedUrl = "";
    } catch (e) {
        if (e instanceof Dexie.ConstraintError) {
            errorMessage = "Feed already exists.";
        } else {
            console.error("Failed to add feed", e);
            errorMessage = "Could not add feed. Please try again.";
        }
    } finally {
        isAddingFeed = false;
    }
}

async function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
        errorMessage = null;
        const file = input.files[0];
        isImporting = true;
        importProgress = { current: 0, total: 0, stage: "Reading file...", currentFile: "" };
        try {
            await importOPML(
                file,
                (progress: { current: number; total: number; currentFile: string }) => {
                    importProgress = {
                        current: progress.current,
                        total: progress.total,
                        stage: "Importing feeds",
                        currentFile: progress.currentFile,
                    };
                }
            );
            close();
        } catch (err) {
            console.error("Failed to import OPML", err);
            errorMessage = "Import failed. Make sure the OPML file is valid and try again.";
        } finally {
            isImporting = false;
            input.value = "";
        }
    }
}

async function handleBackupSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
        errorMessage = null;
        isImporting = true;
        importProgress = { current: 0, total: 0, stage: "Reading file...", currentFile: "" };
        try {
            await importBackup(
                input.files[0],
                (progress: { stage: string; current: number; total: number }) => {
                    importProgress = {
                        current: progress.current,
                        total: progress.total,
                        stage: progress.stage,
                        currentFile: "",
                    };
                }
            );
            close();
        } catch (err) {
            console.error("Failed to restore backup", err);
            errorMessage = "Restore failed. Please confirm this is a Vesper backup JSON file.";
        } finally {
            isImporting = false;
            input.value = "";
        }
    }
}
</script>

<div
    class="fixed inset-0 z-50 flex items-center justify-center"
    style={`background:${isDark ? "var(--o3-color-palette-black-90)" : "var(--o3-color-palette-paper)"}`}
    transition:fade={{ duration: 200 }}
>
    <button class="fixed inset-0 cursor-default" on:click={close} aria-label="Close settings modal"
    ></button>

    <div
        class="border border-o3-teal p-6 shadow-2xl max-w-md w-full rounded relative z-10"
        role="dialog"
        aria-modal="true"
        style={`background:var(--vesper-panel)`}
        in:scale={{ start: 0.95, duration: 300, easing: quintOut }}
    >
        <div class="mb-6">
            <h2
                class="text-2xl font-headline font-bold mb-2"
                style={`color:${isDark ? "var(--o3-color-palette-white)" : "var(--o3-color-palette-black-90)"}`}
            >
                Settings & Data
            </h2>
            <p
                class="text-sm"
                style={`color:${isDark ? "var(--o3-color-palette-black-40)" : "var(--o3-color-palette-black-70)"}`}
            >
                Manage your feeds and data
            </p>
        </div>

        {#if errorMessage}
            <div
                class="mb-4 rounded border border-o3-claret px-3 py-2"
                style={`background:${isDark ? "rgba(126, 15, 51, 0.12)" : "rgba(126, 15, 51, 0.05)"}`}
            >
                <p class="text-sm font-semibold text-o3-claret">Something went wrong</p>
                <p
                    class="text-xs"
                    style={`color:${isDark ? "var(--o3-color-palette-white-80)" : "var(--o3-color-palette-black-70)"}`}
                >
                    {errorMessage}
                </p>
            </div>
        {/if}

        {#if isImporting}
            <div
                class="mb-4 rounded border border-o3-teal px-4 py-3"
                style={`background:${isDark ? "rgba(17, 153, 142, 0.12)" : "rgba(17, 153, 142, 0.05)"}`}
            >
                <p class="text-sm font-semibold text-o3-teal mb-2">{importProgress.stage}</p>
                {#if importProgress.total > 0}
                    <div class="w-full bg-o3-black-20 rounded-full h-2 mb-2 overflow-hidden">
                        <div
                            class="h-full bg-o3-teal transition-all duration-300 ease-out"
                            style="width: {(importProgress.current / importProgress.total) * 100}%"
                        ></div>
                    </div>
                    <p
                        class="text-xs"
                        style={`color:${isDark ? "var(--o3-color-palette-white-80)" : "var(--o3-color-palette-black-70)"}`}
                    >
                        {importProgress.current} / {importProgress.total}
                        {#if importProgress.currentFile}
                            — {importProgress.currentFile}
                        {/if}
                    </p>
                {:else}
                    <div class="flex items-center gap-2">
                        <div
                            class="animate-spin h-4 w-4 border-2 border-o3-teal border-t-transparent rounded-full"
                        ></div>
                        <p
                            class="text-xs"
                            style={`color:${isDark ? "var(--o3-color-palette-white-80)" : "var(--o3-color-palette-black-70)"}`}
                        >
                            Processing...
                        </p>
                    </div>
                {/if}
            </div>
        {/if}

        <div class="space-y-6">
            <!-- Theme -->
            <div class="space-y-2">
                <h3 class="text-sm font-bold uppercase tracking-wider text-o3-teal">Appearance</h3>
                <button
                    class="btn-vesper-secondary btn-vesper-small w-full"
                    on:click={() => {
                        $themeMode = $themeMode === "dark" ? "light" : "dark";
                    }}
                >
                    Switch to {$themeMode === "dark" ? "Day" : "Night"} Mode
                </button>
            </div>

            <!-- Direct Fetch Mode (Desktop) -->
            <div class="space-y-2">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-bold uppercase tracking-wider text-o3-teal">
                            Direct Fetch Mode
                        </h3>
                        <p
                            class="text-xs"
                            style={`color:${isDark ? "var(--o3-color-palette-black-40)" : "var(--o3-color-palette-black-70)"}`}
                        >
                            For desktop apps without server proxy
                        </p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            bind:checked={$userSettings.useDirectFetch}
                            class="sr-only peer"
                        />
                        <div
                            class="w-11 h-6 bg-o3-black-20 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-o3-teal rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-o3-teal"
                        ></div>
                    </label>
                </div>
                {#if $userSettings.useDirectFetch}
                    <p
                        class="text-xs p-2 rounded"
                        style={`background:${isDark ? "rgba(153, 15, 61, 0.12)" : "rgba(153, 15, 61, 0.05)"};color:${isDark ? "var(--o3-color-palette-white-80)" : "var(--o3-color-palette-black-70)"}`}
                    >
                        ⚠️ Some feeds may fail due to CORS. Disable if feeds don't load.
                    </p>
                {/if}
            </div>

            <!-- Add Feed -->
            <div class="space-y-2">
                <h3 class="text-sm font-bold uppercase tracking-wider text-o3-teal">Add Feed</h3>
                <div class="flex gap-2">
                    <input
                        type="text"
                        bind:value={newFeedUrl}
                        placeholder="Feed URL..."
                        class={`input text-sm h-9 rounded-none placeholder-o3-black-50 focus:ring-1 focus:ring-o3-teal flex-1 ${isDark ? "bg-o3-black-80 border-none text-o3-paper" : "bg-o3-white border border-o3-black-20 text-o3-black-90"}`}
                        on:keydown={(e) => e.key === "Enter" && handleAddFeed()}
                        disabled={isAddingFeed}
                    />
                    <button
                        class="btn-vesper-secondary btn-vesper-small"
                        on:click={handleAddFeed}
                        disabled={!newFeedUrl.trim() || isAddingFeed}
                    >
                        {isAddingFeed ? "Adding..." : "Add"}
                    </button>
                </div>
            </div>

            <!-- OPML -->
            <div class="space-y-2">
                <h3 class="text-sm font-bold uppercase tracking-wider text-o3-teal">
                    OPML Import/Export
                </h3>
                <div class="flex gap-2">
                    <button
                        class="btn-vesper-secondary btn-vesper-small flex-1"
                        on:click={() => document.getElementById("opmlInput")?.click()}
                    >
                        Import OPML
                    </button>
                    <button
                        class="btn-vesper-secondary btn-vesper-small flex-1"
                        on:click={exportOPML}
                    >
                        Export OPML
                    </button>
                </div>
                <input
                    type="file"
                    id="opmlInput"
                    class="hidden"
                    on:change={handleFileSelect}
                    accept=".opml,.xml"
                />
            </div>

            <!-- Backup -->
            <div class="space-y-2">
                <h3 class="text-sm font-bold uppercase tracking-wider text-o3-teal">Full Backup</h3>
                <div class="flex gap-2">
                    <button
                        class="btn-vesper-secondary btn-vesper-small flex-1"
                        on:click={() => document.getElementById("backupInput")?.click()}
                    >
                        Restore Backup
                    </button>
                    <button
                        class="btn-vesper-secondary btn-vesper-small flex-1"
                        on:click={() => exportBackup()}
                    >
                        Backup Data
                    </button>
                </div>
                <input
                    type="file"
                    id="backupInput"
                    class="hidden"
                    on:change={handleBackupSelect}
                    accept=".json"
                />
            </div>
        </div>

        <div class="mt-8 text-center">
            <button class="btn-vesper-text" on:click={close}> Close </button>
        </div>
    </div>
</div>
