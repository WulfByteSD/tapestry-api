// modules/notification/email/SendGridProvider.ts
import { EmailPayload, EmailProvider } from './EmailProvider';
import Sparkpost from 'sparkpost';
import { ErrorUtil } from '../../../middleware/ErrorUtil';

const client = new Sparkpost(process.env.SPARKPOST_API_KEY || '');
export type SparkpostEmailPayload = {
  content: {
    template_id?: string;
    subject?: string;
  };
  recipients: Array<{
    address: { email: string };
    substitution_data?: { [key: string]: string };
  }>;
  options?: {
    open_tracking?: boolean;
    click_tracking?: boolean;
    transactional?: boolean;
    sandbox?: boolean;
    start_time?: string;
  };
};

export class SparkpostProvider implements EmailProvider {
  async sendEmail({ to, subject, html, from, data, templateId }: EmailPayload): Promise<void> {
    const emailPayload: SparkpostEmailPayload = {
      content: {
        template_id: templateId,
        subject,
      },
      recipients: [
        {
          address: { email: to },
          substitution_data: data,
        },
      ],
      options: {
        open_tracking: true,
        click_tracking: true,
        transactional: true,
      },
    };
    await client.transmissions.send(emailPayload).catch((err: any) => {
      console.error('Failed to send email via Sparkpost:', err); 
      throw new ErrorUtil('Failed to send email via Sparkpost', 500);
    });
  }
}
