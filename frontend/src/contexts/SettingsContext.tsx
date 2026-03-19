import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface SettingsContextType {
  replyFontSize: number;
  setReplyFontSize: (size: number) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [replyFontSize, setReplyFontSizeState] = useState<number>(14);

  const setReplyFontSize = async (size: number) => {
    setReplyFontSizeState(size);
    if (typeof window !== "undefined") {
      localStorage.setItem("reply-font-size", size.toString());
      if (window.pywebview?.api?.save_ui_settings) {
        await window.pywebview.api.save_ui_settings({ replyFontSize: size });
      }
    }
  };

  // Ensure state is updated correctly when component mounts
  useEffect(() => {
    const loadSettings = async () => {
      let size = 14;
      if (typeof window !== "undefined") {
        // Try pywebview first, fallback to localStorage
        if (window.pywebview?.api?.get_ui_settings) {
           const uiSettings = await window.pywebview.api.get_ui_settings();
           if (uiSettings && uiSettings.replyFontSize) {
               size = uiSettings.replyFontSize;
           } else {
               const saved = localStorage.getItem("reply-font-size");
               if (saved) size = parseInt(saved, 10);
           }
        } else {
           const saved = localStorage.getItem("reply-font-size");
           if (saved) size = parseInt(saved, 10);
        }
        setReplyFontSizeState(size);
      }
    };
    
    // Wait for pywebview to be ready if it's going to be available
    if (window.pywebview) {
        loadSettings();
    } else {
        window.addEventListener('pywebviewready', loadSettings);
        // Fallback in case pywebview is not used
        setTimeout(loadSettings, 500);
        return () => window.removeEventListener('pywebviewready', loadSettings);
    }
  }, []);

  return (
    <SettingsContext.Provider value={{ replyFontSize, setReplyFontSize }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};
