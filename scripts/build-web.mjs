// Copies the static site into www/ for the Android app. The Worker-only _headers file is left out.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
cpSync('public', 'www', { recursive: true, filter: src => !src.endsWith('_headers') });
console.log('www ready');
