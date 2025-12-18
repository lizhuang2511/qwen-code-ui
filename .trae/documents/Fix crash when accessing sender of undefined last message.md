I will fix the `TypeError: Cannot read properties of undefined (reading 'sender')` which occurs when the conversation history is empty.

**Changes:**

1. **`frontend/src/hooks/useConversationManager.ts`**:

   * Update `updateConversation` function signature to allow `lastMsg` to be `undefined` (since an empty conversation has no last message).

2. **`frontend/src/hooks/useMessageHandler.ts`**:

   * Update `UseMessageHandlerProps` interface to match the new `updateConversation` signature.

3. **`frontend/src/hooks/useToolCallConfirmation.ts`**:

   * Update `UseToolCallConfirmationProps` interface to match the new `updateConversation` signature.

4. **`frontend/src/hooks/useConversationEvents.ts`**:

   * Add null checks for `lastMsg` before accessing `lastMsg.sender` in 4 locations where it assumes a message exists.

   * This ensures that if the conversation is empty, it correctly falls back to creating a new message instead of crashing.

