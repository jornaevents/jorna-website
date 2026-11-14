// Kept out of lib/theme.ts (a client module) so the server-rendered root
// layout can inline it: a stored light/dark choice has to be on <html> before
// first paint, or the page flashes the system theme and then switches.
export const THEME_KEY = "jorna_theme";

export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
