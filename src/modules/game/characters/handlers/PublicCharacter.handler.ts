import type { Request, Response } from 'express';
import CharacterModel from '../model/CharacterModel';
import { buildEffectiveAbilities } from '../helpers/buildEffectiveAbilities';

/** Anonymous, read-only character card. Ownership and journal data stay private. */
export async function getPublicCharacter(req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  // Slug resolution can be added here without changing the public URL contract.
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
    res.status(400).json({ success: false, message: 'A valid character ID is required.' });
    return;
  }

  try {
    const character = await CharacterModel.findOne({ _id: req.params.id, 'meta.deletedAt': null }).lean();
    if (!character) {
      res.status(404).json({ success: false, message: 'Character not found.' });
      return;
    }

    const sheet = character.sheet;
    const learnedAbilities = sheet.learnedAbilities ?? [];
    const inventory = sheet.inventory ?? [];
    // The existing enrichment helper requires at least one reference for its $or query.
    const hasAbilities = learnedAbilities.length > 0 || inventory.some((item) => item.grantedAbilities?.length);
    const effectiveAbilities = hasAbilities ? await buildEffectiveAbilities({ learnedAbilities, inventory }) : [];

    // Explicitly select the public contract. Never spread the stored character/sheet:
    // player, campaign, forkedFrom, meta, and sheet.noteCards are not public fields.
    res.status(200).json({
      success: true,
      payload: {
        _id: character._id,
        name: character.name,
        avatarUrl: character.avatarUrl,
        status: character.status,
        tags: character.tags,
        settingKey: character.settingKey,
        toneModules: character.toneModules,
        rulesetVersion: character.rulesetVersion,
        updatedAt: character.updatedAt,
        sheet: {
          archetypeKey: sheet.archetypeKey,
          weaveLevel: sheet.weaveLevel,
          profile: sheet.profile,
          aspects: sheet.aspects,
          dtn: sheet.dtn,
          skills: sheet.skills,
          features: sheet.features,
          resources: sheet.resources,
          learnedAbilities,
          conditions: sheet.conditions,
          inventory,
        },
        derived: { effectiveAbilities }, 
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Unable to load the character sheet.' });
  }
}
