# Switch Manager Frontend

## Why a Rewrite?

The original frontend was a single 5.2MB obfuscated JavaScript bundle (`switch_manager_panel.js`) that embedded frozen copies of Home Assistant components (ha-form, ha-selector, ha-dialog, etc.). This made it:

- Impossible to maintain or extend
- Incompatible with newer HA versions (frozen components diverged from HA runtime)
- Extremely large for what it does

## How the Original Was Reverse-Engineered

1. The obfuscated bundle was deobfuscated using [webcrack](https://github.com/j4k0xb/webcrack)
2. The resulting code was analyzed to understand the component structure, API calls, and event handling
3. Each component was rewritten in clean TypeScript, replacing bundled HA components with references to the HA runtime

## New Architecture

- **12 TypeScript source files** using lit-element
- **~69KB built bundle** (down from 5.2MB)
- Relies on Home Assistant's runtime components instead of bundling frozen copies
- Uses HA's native `ha-form`, `ha-selector`, `ha-dialog`, etc. from the global scope

## Build Instructions

```bash
npm install
npm run build
```

The built file is output to `../custom_components/switch_manager/assets/switch_manager_panel.js`.
