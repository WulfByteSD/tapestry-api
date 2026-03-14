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
<h1>Tapestry Terms of Service</h1>

<p>Welcome to Tapestry.</p>

<p>By using Tapestry, you agree to use the platform lawfully, respectfully, and in a way that does not harm the platform, its users, or its community.</p>

<h2>1. Accounts</h2>
<p>You are responsible for your account, your login credentials, and activity that occurs under your account.</p>

<h2>2. Platform Use</h2>
<p>You may use Tapestry to create characters, campaigns, settings, custom content, and related materials for personal or community use within the platform.</p>

<p>You may not use Tapestry to:</p>
<ul>
<li>violate the law</li>
<li>harass, threaten, or abuse others</li>
<li>upload malicious code</li>
<li>exploit or disrupt the platform</li>
<li>upload content you do not have the right to use</li>
</ul>

<h2>3. Platform Changes</h2>
<p>Tapestry may update, improve, suspend, or remove features at any time.</p>

<h2>4. Termination</h2>
<p>Tapestry may suspend or terminate accounts that violate these terms or abuse the platform.</p>

<h2>5. Disclaimer</h2>
<p>Tapestry is provided as-is and may change over time as the product evolves.</p>

<h2>6. Contact</h2>
<p>Questions about these terms may be directed to Tapestry support.</p>
    `.trim(),
  },
  {
    type: 'privacy',
    title: 'Privacy Policy',
    version: VERSION,
    effective_date: EFFECTIVE_DATE,
    content: `
<h1>Tapestry Privacy Policy</h1>

<p>Tapestry values your privacy.</p>

<h2>1. Information We Collect</h2>
<p>Tapestry may collect:</p>
<ul>
<li>account details such as email address</li>
<li>profile details you choose to provide</li>
<li>platform usage data</li>
<li>device and browser information</li>
<li>notification preferences and related delivery metadata</li>
</ul>

<h2>2. How We Use Information</h2>
<p>Tapestry may use your information to:</p>
<ul>
<li>operate and secure the platform</li>
<li>authenticate users</li>
<li>support campaigns, character tools, and Storyweaver tools</li>
<li>improve product quality and reliability</li>
<li>communicate important service updates</li>
</ul>

<h2>3. Notifications</h2>
<p>If you enable email, SMS, or push notifications, Tapestry may store related settings and technical delivery data needed to provide those notifications.</p>

<h2>4. Sharing</h2>
<p>Tapestry does not sell your personal information. Information may be shared with service providers only as necessary to operate the platform.</p>

<h2>5. Data Retention</h2>
<p>Tapestry may retain information for operational, legal, security, and backup purposes.</p>

<h2>6. Your Choices</h2>
<p>You may update account information, profile data, and notification preferences through the platform where available.</p>

<h2>7. Updates</h2>
<p>This policy may change over time. Continued use of Tapestry may require acceptance of updated versions.</p>
    `.trim(),
  },
  {
    type: 'content-license',
    title: 'Content License Policy',
    version: VERSION,
    effective_date: EFFECTIVE_DATE,
    content: `
<h1>Tapestry Content License Policy</h1>

<h2>1. Ownership</h2>
<p>You retain ownership of the custom content you create in Tapestry.</p>

<h2>2. Platform License</h2>
<p>By creating, uploading, storing, or sharing content through Tapestry, you grant Tapestry a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, adapt, format, back up, and distribute that content as needed to operate, secure, improve, and promote the Tapestry platform.</p>

<h2>3. Scope</h2>
<p>This license is limited to platform-related purposes and does not transfer ownership of your content to Tapestry.</p>

<h2>4. Responsibility</h2>
<p>You are responsible for making sure you have the rights to any content you upload or create through the platform.</p>

<h2>5. Removal</h2>
<p>If you remove content or close your account, Tapestry may retain copies as needed for backups, legal compliance, abuse prevention, and platform integrity.</p>
    `.trim(),
  },
  {
    type: 'storyweaver-policy',
    title: 'Storyweaver Policy',
    version: VERSION,
    effective_date: EFFECTIVE_DATE,
    content: `
<h1>Storyweaver Policy</h1>

<p>Storyweaver tools allow users to create and manage campaigns, custom content, and homebrew material inside Tapestry.</p>

<h2>1. Storyweaver Access</h2>
<p>By enabling Storyweaver access, you acknowledge that Storyweaver tools may allow you to create campaigns, settings, denizens, items, lore, and other custom content.</p>

<h2>2. Ownership</h2>
<p>You retain ownership of the custom content you create as a Storyweaver.</p>

<h2>3. Platform License</h2>
<p>By using Storyweaver tools, you grant Tapestry a non-exclusive, worldwide, royalty-free license to host, store, display, reproduce, adapt, and distribute your Storyweaver-created content as needed to operate, secure, improve, back up, and promote the Tapestry platform.</p>

<h2>4. Official Lore Consideration</h2>
<p>Tapestry may review Storyweaver-created content for inspiration, community spotlights, or possible official consideration.
Unless otherwise stated by a separate agreement, this policy alone does not transfer ownership of your content to Tapestry.</p>

<p>If Tapestry ever wants to directly incorporate substantial Storyweaver-created material into official canon, published setting material, or commercial products beyond normal platform use, Tapestry may request additional permission or terms.</p>

<h2>5. Community and Safety</h2>
<p>Storyweaver content must follow Tapestry's platform rules, community standards, and applicable laws.</p>

<h2>6. Policy Updates</h2>
<p>If this policy changes, Storyweavers may be required to review and accept the updated version before continuing to use Storyweaver tools.</p>
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
