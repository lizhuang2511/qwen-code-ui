I will fix the issue where the file manager path is inconsistent with the project detail path. This is caused by the active conversation's working directory overriding the project's directory in the global state.

Steps:
1.  Modify `frontend/src/pages/ProjectDetail.tsx` to:
    *   Get `setActiveConversation` from `useConversation`.
    *   Add a `useEffect` hook to call `setActiveConversation(null)` when the component mounts. This ensures that when viewing project details, we are not logically "in" a conversation, preventing the conversation's working directory from taking precedence.
    *   Keep the existing logic that sets the working directory to the project's path.

This will ensure that when the user enters the Project Detail page, the global working directory is correctly set to the project's path and not overwritten by a previous active conversation.