import { z } from "zod";

/**
 * Switches off Zod's run-time compiling of fast validators.
 *
 * The page is served under a Content Security Policy without 'unsafe-eval' (see vercel.json). Zod
 * would otherwise try `new Function("")` once, to find out whether it may compile code, and strict
 * policies report that probe as a violation even though Zod catches the error. Validating our small
 * messages without compiling costs nothing noticeable.
 *
 * Import this module before any module that makes a schema: `main.tsx` loads it first.
 */
z.config({ jitless: true });
