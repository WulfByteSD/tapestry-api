# Character Schemas

This folder contains schema definitions and their associated types that belong to the Character model.

Each schema file is organized as a separate module to improve maintainability and reduce the size of the main CharacterModel.ts file.

## Organization

Each schema file contains:

- TypeScript interface/type definitions
- Mongoose schema definitions
- Any nested schemas required by the main schema

These schemas are imported and composed in the main `CharacterModel.ts` file.

## Files

- `ResourceTrackSchema.ts` - HP, Threads, Resolve tracking
- `ConditionInstanceSchema.ts` - Status conditions applied to characters
- `NoteCardSchema.ts` - Character journal and note cards
- `AttackProfileSchema.ts` - Weapon/attack configurations
- `InventoryItemSchema.ts` - Character inventory items (includes nested schemas)
- `CharacterLearnedAbilitySchema.ts` - Learned abilities tracking
- `CharacterProfileSchema.ts` - Character biographical information
- `AspectBlockSchema.ts` - Character aspect definitions
