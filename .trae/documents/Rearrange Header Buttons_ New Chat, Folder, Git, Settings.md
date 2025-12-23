I have successfully moved the "New Chat" button from the Directory Panel to the App Header and rearranged the buttons as requested (New Chat, Folder, Git, Settings).

The final step is to connect the button's functionality in `App.tsx`.

### Remaining Task:

1.  **Modify `frontend/src/App.tsx`**:
    *   Pass the existing `handleNewConversationFromDirectory` function to the `AppHeader` component via the `onNewChat` prop. This ensures the "New Chat" button in the header functions exactly as it did in the Directory Panel.

### Verification:
*   After this change, the "New Chat" button in the header will be fully functional, creating a new conversation in the current working directory.
