import { createContext, useContext, useState, ReactNode} from "react";

type Mode = "Selector" | "Draw"

interface AppContextType {
    mode: Mode;
    setMode: (mode: Mode) => void;
}

// setting default value to the contexts
const AppContext = createContext<AppContextType | undefined>(undefined);

// Custom hook
export const useAppContext = () => {
    const context = useContext(AppContext);
    if(!context){
        throw new Error("useAppContext should be inside the AppProvider");
    }

    return context;
}

// Global AppProvider
export const AppProvider: React.FC<{children: ReactNode}> = ({children}) => {
    const [mode, setMode] = useState<Mode>("Selector");
    return (
        <AppContext.Provider value = {{
            mode,
            setMode
        }}>
            {children}
        </AppContext.Provider>
    )
};