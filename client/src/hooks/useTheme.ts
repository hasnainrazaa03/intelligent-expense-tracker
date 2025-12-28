export const useTheme = () => {
  // We lock this to light so no other component can trigger dark mode
  const theme = 'light' as const;
  const toggleTheme = () => {
    console.log("Theme toggle disabled: App is locked to Light Mode.");
  };

  return { theme, toggleTheme };
};