# Navigation & Organization Features Guide

This guide explains how to use the new Navigation & Organization features in Deep Agents UI.

## Features Overview

The following features have been implemented to help you organize and navigate your threads:

1. **Thread Pinning** - Pin important threads to the top
2. **Thread Archiving** - Archive completed threads to reduce clutter
3. **Thread Tags/Labels** - Add custom tags for better organization
4. **Thread Folders/Collections** - Group related threads into folders
5. **Breadcrumb Navigation** - See your current location in the header
6. **Keyboard Navigation** - Navigate threads with keyboard shortcuts

---

## How to Use Each Feature

### 1. Thread Pinning

**Purpose**: Keep important threads at the top of your list for quick access.

**How to Pin a Thread**:
1. Hover over any thread in the sidebar
2. Click the **Pin** icon button (📌) that appears in the top-right corner
3. The thread will move to the "Pinned" section at the top

**How to Unpin**:
1. Hover over a pinned thread
2. Click the **Pin Off** icon button (the filled pin icon)
3. The thread will return to its normal position

**Visual Indicator**: Pinned threads show a pin icon (📌) next to the title.

---

### 2. Thread Archiving

**Purpose**: Hide completed or inactive threads to reduce clutter.

**How to Archive a Thread**:
1. Hover over any thread in the sidebar
2. Click the **Archive** icon button (📦) that appears in the top-right corner
3. The thread will be hidden from view (unless "Show Archived" is enabled)

**How to Unarchive**:
1. Enable "Show Archived" toggle (see below)
2. Hover over the archived thread
3. Click the **Archive Restore** icon button
4. The thread will return to normal view

**How to View Archived Threads**:
1. In the thread sidebar, find the **"Show Archived"** toggle switch
2. Toggle it ON to see archived threads
3. Toggle it OFF to hide them again

**Note**: Archived threads are hidden by default to keep your list clean.

---

### 3. Thread Tags/Labels

**Purpose**: Add custom tags to threads for categorization and easy searching.

**How to Add Tags**:
1. Hover over any thread in the sidebar
2. Click the **Tag** icon button (🏷️) that appears in the top-right corner
3. A dialog will open with tag management options
4. Type a tag name in the input field and press Enter, or click "Add"
5. The tag will be added to the thread

**How to Remove Tags**:
1. Open the tag dialog (click the Tag icon)
2. Click the **×** button on any tag badge to remove it

**How to Use Existing Tags**:
- In the tag dialog, you'll see a list of "Existing tags" used in other threads
- Click any existing tag badge (with a **+** prefix) to add it to the current thread

**Visual Indicators**:
- Threads with tags show a tag icon (🏷️) and count in the thread item
- Up to 3 tags are displayed as badges below the thread description
- If there are more than 3 tags, a "+N" badge shows the count

**Search**: Tags are included in search results, so you can search by tag name.

---

### 4. Thread Folders/Collections

**Purpose**: Organize threads into folders for better structure.

**How to Assign a Thread to a Folder**:
1. Hover over any thread in the sidebar
2. Click the **Folder** icon button (📁) that appears in the top-right corner
3. A dialog will open
4. Select an existing folder from the dropdown, or
5. Type a new folder name in the "Create new folder" input and press Enter
6. The thread will be assigned to that folder

**How to Remove a Thread from a Folder**:
1. Open the folder dialog (click the Folder icon)
2. Select "No folder" from the dropdown

**How to Group by Folder**:
1. In the thread sidebar, find the **"Group by Folder"** toggle switch
2. Toggle it ON to organize threads by folder
3. Threads will be grouped under folder headings
4. A folder filter dropdown will appear to filter by specific folder

**Visual Indicators**:
- Threads in folders show a folder icon (📁) next to the title
- When grouping is enabled, threads are organized under folder sections

**Folder Filtering**:
- When "Group by Folder" is enabled, a dropdown appears
- Select "All folders" to see all threads
- Select a specific folder to see only threads in that folder

---

### 5. Breadcrumb Navigation

**Purpose**: See your current location in the application hierarchy.

**Where to Find It**:
- The breadcrumb appears in the **header** (top of the page)
- It shows: **Home → Folder → Thread Title**

**What It Shows**:
- **Home** icon: Always visible, represents all threads
- **Folder name**: Only shown if the current thread is in a folder
- **Thread title**: The title of the currently selected thread

**When It Appears**:
- The breadcrumb only appears when a thread is selected
- It automatically updates when you switch threads

---

### 6. Keyboard Navigation

**Purpose**: Navigate threads quickly using keyboard shortcuts.

**Available Shortcuts**:

| Key | Action |
|-----|--------|
| **↑ (Arrow Up)** | Move focus to previous thread |
| **↓ (Arrow Down)** | Move focus to next thread |
| **Enter** | Select the focused thread |
| **Escape** | Clear focus |

**How to Use**:
1. Make sure no input field is focused (click outside any text inputs)
2. Press **Arrow Down** to start navigating
3. The focused thread will be highlighted with a ring
4. Press **Enter** to select the focused thread
5. The list will automatically scroll to keep the focused thread visible

**Note**: Keyboard navigation works with both time-based grouping and folder grouping.

---

## Organization Controls

Located below the search bar in the thread sidebar:

### Show Archived Toggle
- **ON**: Shows both active and archived threads
- **OFF**: Hides archived threads (default)

### Group by Folder Toggle
- **ON**: Organizes threads by folder (pinned threads appear first, then folders)
- **OFF**: Organizes threads by time (Today, Yesterday, This Week, Older)

### Folder Filter Dropdown
- Only appears when "Group by Folder" is enabled
- Allows filtering to a specific folder
- "All folders" shows threads from all folders

---

## Thread Actions Menu

When you hover over any thread, action buttons appear in the top-right corner:

1. **Pin/Unpin** (📌) - Pin or unpin the thread
2. **Archive/Unarchive** (📦) - Archive or restore the thread
3. **Tags** (🏷️) - Manage tags for the thread
4. **Folder** (📁) - Assign thread to a folder

**Note**: The actions menu only appears on hover to keep the UI clean.

---

## Visual Indicators

### Status Indicators
- **Green dot**: Idle (completed) threads
- **Blue dot**: Busy (running) threads
- **Orange dot**: Interrupted threads (need attention)
- **Red dot**: Error threads

### Organization Indicators
- **Pin icon** (📌): Pinned thread
- **Folder icon** (📁): Thread is in a folder
- **Tag icon** (🏷️) with count: Thread has tags
- **Tag badges**: Up to 3 tags displayed, with "+N" for additional tags

---

## Best Practices

### Organizing Your Threads

1. **Pin Important Threads**: Pin threads you reference frequently
2. **Use Folders for Projects**: Create folders for different projects or topics
3. **Tag by Category**: Use tags for cross-cutting concerns (e.g., "bug", "feature", "urgent")
4. **Archive Completed Work**: Archive threads when you're done with them

### Example Organization Structure

```
📌 Pinned
  - Current sprint planning
  - Important reference thread

📁 Project Alpha
  - Feature discussion
  - Bug reports

📁 Project Beta
  - Design review
  - Implementation notes

📁 No Folder
  - Miscellaneous threads
```

### Tagging Strategy

- **Status tags**: "todo", "in-progress", "done"
- **Type tags**: "bug", "feature", "question"
- **Priority tags**: "urgent", "important", "low"
- **Topic tags**: "api", "ui", "backend"

---

## Data Persistence

All organization data (pins, archives, tags, folders) is stored in your browser's **localStorage**. This means:

- ✅ Your organization persists across browser sessions
- ✅ Data is stored locally (not sent to server)
- ✅ Clearing browser data will reset organization
- ✅ Each browser/device has its own organization data

---

## Troubleshooting

### Threads not showing up?
- Check if "Show Archived" is enabled if you're looking for archived threads
- Verify your search/filter settings
- Check if the thread is in a filtered folder

### Can't see action buttons?
- Make sure you're hovering over the thread item
- The buttons appear in the top-right corner on hover

### Tags/Folders not saving?
- Check browser console for errors
- Verify localStorage is enabled in your browser
- Try refreshing the page

### Keyboard navigation not working?
- Make sure no input field is focused
- Click outside any text inputs first
- Try pressing Escape to clear focus, then Arrow keys

---

## Technical Details

- **Storage Key**: `deep-agent-thread-metadata`
- **Format**: JSON object mapping thread IDs to metadata
- **Metadata Structure**:
  ```typescript
  {
    pinned: boolean;
    archived: boolean;
    tags: string[];
    folder: string | null;
    pinnedAt?: number; // timestamp
    archivedAt?: number; // timestamp
  }
  ```

---

**Last Updated**: 2025-01-27

