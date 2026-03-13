"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ModeToggle() {
    const { theme, setTheme } = useTheme()

    // Update theme when localStorage changes (e.g. from Langflow)
    React.useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === "isDark" && e.newValue !== null) {
                const isDark = e.newValue === "true"
                const newTheme = isDark ? "dark" : "light"
                if (newTheme !== theme) {
                    setTheme(newTheme)
                }
            }
        }

        window.addEventListener("storage", handleStorageChange)
        return () => window.removeEventListener("storage", handleStorageChange)
    }, [theme, setTheme])

    // Function to sync with Langflow
    const toggleTheme = () => {
        const newTheme = theme === "dark" ? "light" : "dark"
        setTheme(newTheme)

        // Sync with Langflow by setting 'isDark' in localStorage
        localStorage.setItem("isDark", (newTheme === "dark").toString())

        // Trigger storage event for the same window (next-themes handles the 'theme' key)
        window.dispatchEvent(new Event("storage"))
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 px-0"
        >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
        </Button>
    )
}
