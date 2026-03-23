import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { api } from "../lib/api";

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
      try {
        await api.save_ui_settings({ replyFontSize: size });
      } catch (e) {
        console.warn("Failed to save ui settings", e);
      }
    }
  };

  // Ensure state is updated correctly when component mounts
  useEffect(() => {
    const loadSettings = async () => {
      let size = 14;
      if (typeof window !== "undefined") {
        try {
           const uiSettings = await api.get_ui_settings();
           if (uiSettings && uiSettings.replyFontSize) {
               size = uiSettings.replyFontSize;
           } else {
               const saved = localStorage.getItem("reply-font-size");
               if (saved) size = parseInt(saved, 10);
           }
        } catch (e) {
           const saved = localStorage.getItem("reply-font-size");
           if (saved) size = parseInt(saved, 10);
        }
        setReplyFontSizeState(size);
      }
    };
    
    loadSettings();
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
