# Development Guide - Overdive

Quick reference for editing and working with the codebase in VS Code.

## Opening Your Project

```bash
# Option 1: From terminal
cd /Users/thomasway/Documents/Obsidian.nosync/Freedive\ with\ Pat/Code/overdive-dreaming
code .

# Option 2: In VS Code, File → Open Folder → navigate to overdive-dreaming
```

## Workflow with Hot Reload

The dev server (`npm run dev`) automatically reloads when you save files:

1. **Keep dev server running** in terminal (or VS Code's integrated terminal: `` Ctrl+` ``)
2. **Edit any file** in VS Code
3. **Save** (`Cmd+S`)
4. **Browser auto-refreshes** - see changes instantly!

## Key VS Code Shortcuts

- `Cmd+P` - Quick file search (type filename)
- `Cmd+Shift+F` - Search across all files
- `Cmd+B` - Toggle sidebar
- `Cmd+J` - Toggle terminal
- `Cmd+/` - Comment/uncomment line
- `Opt+Up/Down` - Move line up/down
- `Cmd+D` - Select next occurrence (multi-cursor)
- `Cmd+Shift+L` - Select all occurrences

## File Organization

**Key files you'll edit most:**

```
src/routes/(app)/
├── dashboard/+page.svelte    # Feed page
├── dives/+page.svelte         # Log dive page
├── analytics/+page.svelte     # Analytics page
└── +layout.svelte             # Top nav (shared layout)

src/lib/components/
├── SessionCard.svelte         # Feed cards
├── RoutineSelector.svelte     # Routine picker
└── BottomNav.svelte           # Bottom navigation

src/lib/
├── types.ts                   # TypeScript types
├── utils/                     # Helper functions
└── firebase.ts                # Firebase setup

src/app.css                    # Global styles & CSS variables
```

## Svelte File Structure

Every `.svelte` file has this pattern:

```svelte
<script lang="ts">
  // JavaScript/TypeScript logic here
  let count = $state(0);
</script>

<!-- HTML markup here -->
<button onclick={() => count++}>
  Count: {count}
</button>

<style>
  /* Scoped CSS here (only applies to this component) */
  button {
    color: var(--color-primary);
  }
</style>
```

## Making Your First Edit

Try this simple change:

1. Open `src/routes/(app)/+layout.svelte`
2. Find line 35: `<h1 class="nav-title">Overdive [Proto]</h1>`
3. Change to: `<h1 class="nav-title">Overdive [Proto] 🌊</h1>`
4. Save (`Cmd+S`)
5. Check browser - should auto-update!

## Tips for Learning

- **Read before editing**: Open files that were just changed to see what was done
- **Use Cmd+Click**: Click on any component/function name while holding Cmd to jump to its definition
- **Hover for docs**: Hover over variables/functions to see their types
- **Format on save**: Enable in settings (search "format on save")
- **Use git**: Make a commit before experimenting, easy to revert if needed

## VS Code Settings (Optional)

Press `Cmd+,` for settings, search and enable:

- "Format On Save" ✓
- "Auto Save" → `afterDelay`
- "Tab Size" → `2` (match our project)

## Essential Extensions

Install these from the Extensions panel (`Cmd+Shift+X`):

**Must-have:**
- **Svelte for VS Code** (by Svelte) - Syntax highlighting, intellisense, formatting
- **Prettier - Code formatter** (by Prettier) - Auto-formatting
- **ESLint** (by Microsoft) - Code linting

**Recommended:**
- **Tailwind CSS IntelliSense** (by Tailwind Labs) - Tailwind autocomplete
- **GitLens** (by GitKraken) - Enhanced Git features
- **Error Lens** - Shows errors inline
- **Auto Rename Tag** - Renames paired HTML/Svelte tags

---

**Start simple**: Browse the files, make small tweaks to colors or text, and see the changes. The hot reload makes experimentation fun!
