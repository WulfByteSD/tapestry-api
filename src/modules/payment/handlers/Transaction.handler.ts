import { ModelKey, ModelMap } from '../../../utils/ModelMap';
import PaymentProcessor from '../classes/PaymentProcess';
import PaymentProcessorFactory from '../factory/PaymentProcessorFactory';

export default class TransactionHandler {
  private processor: PaymentProcessor | null = null;
  private readonly modelMap: Record<ModelKey, any>;

  constructor() {
    this.modelMap = ModelMap;
  }

  private async getProcessor(): Promise<PaymentProcessor> {
    if (!this.processor) {
      this.processor = await new PaymentProcessorFactory().smartChooseProcessor().then((res) => {
        if (!res.processor) {
          throw new Error('No payment processor is configured');
        }
        console.info('Using payment processor:', res.processor.getProcessorName());
        return res.processor as PaymentProcessor;
      });
    }
    return this.processor as PaymentProcessor;
  }

  public processTransaction = async (profileId: string, data: any): Promise<any> => {
    try {
      // first we need to find the billing profile of the user we are running a transaction on
      const billingProfile = await this.modelMap['billing'].findOne({ profileId }).populate('profileId');

      if (!billingProfile) {
        throw new Error('Billing profile not found');
      }

      const processor = await this.getProcessor();

      // from the processor object on billing get the billing information that relates to that processor
      const processorInfo = billingProfile.paymentProcessorData[processor.getProcessorName() as any] || {};

      const processorResponse = (await processor.processPayment({
        amount: data.amount,
        currency: data.currency || 'USD',
        customerId: billingProfile.customer,
        ...processorInfo,
      })) as any;

      if (!processorResponse.success) {
        throw new Error('Payment processing failed');
      }

      // now we need to create a receipt in the database for the transaction
      const receipt = await this.modelMap['receipt'].create({
        profileId,
        transactionId: processorResponse.transactionId,
        billingAccountId: billingProfile._id,
        userId: billingProfile.profileId.userId,
        status: 'success',
        type: 'payment',
        amount: data.amount,
        currency: data.currency,
        processor: {
          name: processor.getProcessorName(),
          transactionId: processorResponse.transactionId,
          response: processorResponse.message,
        },
        customer: {
          id: billingProfile.customer,
          email: billingProfile.email,
          name: `${billingProfile.firstName} ${billingProfile.lastName}`,
          phone: billingProfile.phone || 'N/A',
        },
        transactionDate: new Date().toISOString(),
      });

      return {
        success: true,
        data: receipt,
      };
    } catch (error) {
      console.error('Error processing transaction:', error);
      throw error;
    }
  };

  public refundTransaction = async (transactionId: string, amount: number): Promise<any> => {
    try {
      // find the receipt for the transaction
      const receipt = await this.modelMap['receipt'].findById({ _id: transactionId });
      if (!receipt) {
        throw new Error('Transaction not found');
      }
      const processor = await this.getProcessor();
      const billingInfo = await this.modelMap['billing'].findById(receipt.billingAccountId);
      if (!billingInfo) {
        throw new Error('Billing information not found');
      }

      // run the refund through the payment processor
      const results = (await processor.refundTransaction({
        transactionId: receipt.processor.transactionId,
        amount,
        ...billingInfo.paymentProcessorData[(await processor).getProcessorName() as any],
      })) as any;
 
      if (!results.success) {
        throw new Error(`Refund Transaction failed: ${results.message}`);
      }
      // create a new receipt to reflect the refund
      const refundReceipt = await this.modelMap['receipt'].create({
        profileId: receipt.profileId,
        transactionId: results.data.id,
        billingAccountId: billingInfo._id,
        userId: billingInfo.profileId.userId,
        status: results.data.status,
        type: 'refund',
        amount: -Math.abs(amount), // refunds are negative amounts
        currency: receipt.currency,
        processor: {
          name: processor.getProcessorName(),
          transactionId: results.data.id,
          response: results.message,
          balanceTransaction: results.data.balance_transaction,
          charge: results.data.charge,
        },
        customer: {
          id: billingInfo.customer,
          email: billingInfo.email,
          name: `${billingInfo.firstName} ${billingInfo.lastName}`,
          phone: billingInfo.phone || 'N/A',
        },
        transactionDate: new Date().toISOString(),
      });
      return { success: true, data: refundReceipt };
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  };

  public voidTransaction = async (transactionId: string): Promise<any> => {
    try {
      // find the receipt for the transaction
      const receipt = await this.modelMap['receipt'].findById({ _id: transactionId });
      if (!receipt) {
        throw new Error('Transaction not found');
      }
      const processor = this.getProcessor();
      const billingInfo = await this.modelMap['billing'].findById(receipt.billingAccountId);
      if (!billingInfo) {
        throw new Error('Billing information not found');
      }
      // run the void through the payment processor
      const results = (await processor).voidTransaction({
        transactionId,
        customerId: billingInfo.customer,
        ...billingInfo.paymentProcessorData[(await processor).getProcessorName() as any],
      }) as any;
      if (!results.success) {
        throw new Error('Void processing failed' + (results.message ? `: ${results.message}` : ''));
      }
      // update the receipt to reflect the void
      const voidReceipt = await this.modelMap['receipt'].findOneAndUpdate(
        { transactionId },
        {
          $set: {
            status: 'voided',
            // set amount to 0 since the transaction was voided
            amount: 0,
            updatedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );

      return { success: true, data: voidReceipt };
    } catch (error) {
      console.error('Error processing void:', error);
      throw error;
    }
  };
}
