// modules/notification/email/EmailService.ts
import { EmailPayload, EmailProvider } from './EmailProvider';
import { EtherealProvider } from './EtherealProvider';
import { SendGridProvider } from './SendGridProvider';
import { SparkpostProvider } from './Sparkpost';
// import { MailgunProvider } from './MailgunProvider'; <-- add as needed

class EmailService {
  private static provider: EmailProvider;

  static init(providerName: 'sendgrid' | 'mailgun' | 'ethereal' | 'sparkpost' = 'sparkpost') {
    switch (providerName) {
      case 'sendgrid':
        // this.provider = new SendGridProvider(); // uncomment when SendGridProvider is implemented or needed
        break;
      case 'ethereal':
        this.provider = new EtherealProvider();
        break;
      case 'sparkpost':
        this.provider = new SparkpostProvider();
        break;
      // case 'mailgun':
      //   this.provider = new MailgunProvider();
      //   break;
      default:
        throw new Error(`Unknown email provider: ${providerName}`);
    }
  }

  static async sendEmail(payload: EmailPayload): Promise<void> {
    if (!this.provider) {
      throw new Error('Email provider not initialized');
    }
    await this.provider.sendEmail(payload);
  }
}

export { EmailService };
