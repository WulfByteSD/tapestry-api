import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { buildMongoURI } from '../config/db';
import LegalModel from '../modules/auth/model/LegalPages';

dotenv.config();

type SeedPolicy = {
  type: string;
  title: string;
  version: string;
  effective_date: Date;
  content: string;
};

const EFFECTIVE_DATE = new Date('2026-03-14T00:00:00.000Z');
const VERSION = '1';

const policies: SeedPolicy[] = [
  {
    type: 'terms',
    title: 'Terms of Service',
    version: VERSION,
    effective_date: EFFECTIVE_DATE,
    content: `
# Tapestry Terms of Service

Welcome to Tapestry.

By using Tapestry, you agree to use the platform lawfully, respectfully, and in a way that does not harm the platform, its users, or its community.

## 1. Accounts
You are responsible for your account, your login credentials, and activity that occurs under your account.

## 2. Platform Use
You may use Tapestry to create characters, campaigns, settings, custom content, and related materials for personal or community use within the platform.

You may not use Tapestry to:
- violate the law
- harass, threaten, or abuse others
- upload malicious code
- exploit or disrupt the platform
- upload content you do not have the right to use

## 3. Platform Changes
Tapestry may update, improve, suspend, or remove features at any time.

## 4. Termination
Tapestry may suspend or terminate accounts that violate these terms or abuse the platform.

## 5. Disclaimer
Tapestry is provided as-is and may change over time as the product evolves.

## 6. Contact
Questions about these terms may be directed to Tapestry support.
    `.trim(),
  },
  {
    type: 'privacy',
    title: 'Privacy Policy',
    version: VERSION,
    effective_date: EFFECTIVE_DATE,
    content: `
# Tapestry Privacy Policy

Tapestry values your privacy.

## 1. Information We Collect
Tapestry may collect:
- account details such as email address
- profile details you choose to provide
- platform usage data
- device and browser information
- notification preferences and related delivery metadata

## 2. How We Use Information
Tapestry may use your information to:
- operate and secure the platform
- authenticate users
- support campaigns, character tools, and Storyweaver tools
- improve product quality and reliability
- communicate important service updates

## 3. Notifications
If you enable email, SMS, or push notifications, Tapestry may store related settings and technical delivery data needed to provide those notifications.

## 4. Sharing
Tapestry does not sell your personal information. Information may be shared with service providers only as necessary to operate the platform.

## 5. Data Retention
Tapestry may retain information for operational, legal, security, and backup purposes.

## 6. Your Choices
You may update account information, profile data, and notification preferences through the platform where available.

## 7. Updates
This policy may change over time. Continued use of Tapestry may require acceptance of updated versions.
    `.trim(),
  },
  {
    type: 'content-license',
    title: 'Content License Policy',
    version: VERSION,
    effective_date: EFFECTIVE_DATE,
    content: `
# Tapestry Content License Policy

## 1. Ownership
You retain ownership of the custom content you create in Tapestry.

## 2. Platform License
By creating, uploading, storing, or sharing content through Tapestry, you grant Tapestry a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, adapt, format, back up, and distribute that content as needed to operate, secure, improve, and promote the Tapestry platform.

## 3. Scope
This license is limited to platform-related purposes and does not transfer ownership of your content to Tapestry.

## 4. Responsibility
You are responsible for making sure you have the rights to any content you upload or create through the platform.

## 5. Removal
If you remove content or close your account, Tapestry may retain copies as needed for backups, legal compliance, abuse prevention, and platform integrity.
    `.trim(),
  },
  {
    type: 'storyweaver-policy',
    title: 'Storyweaver Policy',
    version: VERSION,
    effective_date: EFFECTIVE_DATE,
    content: `
# Storyweaver Policy

Storyweaver tools allow users to create and manage campaigns, custom content, and homebrew material inside Tapestry.

## 1. Storyweaver Access
By enabling Storyweaver access, you acknowledge that Storyweaver tools may allow you to create campaigns, settings, denizens, items, lore, and other custom content.

## 2. Ownership
You retain ownership of the custom content you create as a Storyweaver.

## 3. Platform License
By using Storyweaver tools, you grant Tapestry a non-exclusive, worldwide, royalty-free license to host, store, display, reproduce, adapt, and distribute your Storyweaver-created content as needed to operate, secure, improve, back up, and promote the Tapestry platform.

## 4. Official Lore Consideration
Tapestry may review Storyweaver-created content for inspiration, community spotlights, or possible official consideration.
Unless otherwise stated by a separate agreement, this policy alone does not transfer ownership of your content to Tapestry.

If Tapestry ever wants to directly incorporate substantial Storyweaver-created material into official canon, published setting material, or commercial products beyond normal platform use, Tapestry may request additional permission or terms.

## 5. Community and Safety
Storyweaver content must follow Tapestry's platform rules, community standards, and applicable laws.

## 6. Policy Updates
If this policy changes, Storyweavers may be required to review and accept the updated version before continuing to use Storyweaver tools.
    `.trim(),
  },
];

async function main() {
  const uri = buildMongoURI();

  await mongoose.connect(uri, {
    dbName: process.env.MONGO_DBNAME,
  });

  console.info('Connected to MongoDB');
  console.info('Seeding legal policies...');

  for (const policy of policies) {
    await LegalModel.updateOne({ type: policy.type }, { $set: policy }, { upsert: true });

    console.info(`Seeded policy: ${policy.type} v${policy.version}`);
  }

  console.info(`Seeded ${policies.length} legal policies.`);
  await mongoose.disconnect();
  console.info('Disconnected from MongoDB');
}

main().catch(async (err) => {
  console.error('Policy seed failed:', err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
