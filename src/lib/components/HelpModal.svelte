<script lang="ts">
    import { showHelp, themeMode } from '../stores';

    function close() {
        $showHelp = false;
    }

    let isDark: boolean;
    $: isDark = $themeMode === 'dark';
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center" style={`background:${isDark ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.9)'}`}>
    <button
        class="fixed inset-0"
        on:click={close}
        aria-label="Close help modal"
    ></button>
    
    <div 
        class="border border-o3-teal p-6 shadow-2xl max-w-md w-full rounded relative z-10"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        style={`background:var(--vesper-panel)`}
    >
        <div class="mb-6">
            <h2 id="help-title" class="text-2xl font-headline font-bold mb-2" style={`color:${isDark ? 'var(--o3-color-palette-white)' : 'var(--o3-color-palette-black-90)'}`}>Keyboard Shortcuts</h2>
            <p class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Press Escape to close</p>
        </div>

        <div class="space-y-3">
            <div class="flex justify-between items-start">
                <span class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Next Article</span>
                <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>j</kbd>
            </div>
            
            <div class="flex justify-between items-start">
                <span class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Previous Article</span>
                <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>k</kbd>
            </div>
            
            <div class="flex justify-between items-start">
                <span class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Refresh All Feeds</span>
                <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>r</kbd>
            </div>
            
            <div class="flex justify-between items-start">
                <span class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Toggle Help</span>
                <div class="flex gap-1">
                    <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>?</kbd>
                    <span class="text-xs" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>or</span>
                    <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>Shift</kbd>
                    <span class="text-xs" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>+</span>
                    <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>/</kbd>
                </div>
            </div>
            
            <div class="flex justify-between items-start">
                <span class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Star / Unstar Current Article</span>
                <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>s</kbd>
            </div>

            <div class="flex justify-between items-start">
                <span class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Open Original Link</span>
                <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>o</kbd>
            </div>

            <div class="flex justify-between items-start">
                <span class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Scroll Down Page</span>
                <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>Space</kbd>
            </div>

            <div class="flex justify-between items-start">
                <span class="text-sm" style={`color:${isDark ? 'var(--o3-color-palette-black-40)' : 'var(--o3-color-palette-black-70)'}`}>Close Modals</span>
                <kbd class="border rounded px-2 py-1 text-xs font-mono text-o3-teal" style={`background:${isDark ? 'var(--o3-color-palette-black-90)' : 'var(--o3-color-palette-black-10)'};border-color:${isDark ? 'var(--o3-color-palette-black-30)' : 'var(--o3-color-palette-black-20)'}`}>Esc</kbd>
            </div>
        </div>

        <div class="mt-6 text-center">
            <button
                class="btn-vesper-text"
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
