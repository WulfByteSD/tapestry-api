import moment from 'moment'; 
import { ErrorUtil } from '../../../middleware/ErrorUtil';
import { AuthenticatedRequest } from '../../../types/AuthenticatedRequest';
import BillingAccount from '../../auth/model/BillingAccount';
import PaymentProcessorFactory from '../factory/PaymentProcessorFactory';
import { PaymentHandler } from './PaymentHandler';
import { getPaymentSafeCountryCode } from '../utils/countryHelpers';
import { validatePaymentFormData } from '../utils/paymentValidation';
import PaymentProcessingHandler from './PaymentProcessing.handler';

export class BillingHandler {
  constructor(private readonly paymentHandler: PaymentHandler = new PaymentHandler()) {}
  async updateVault(req: AuthenticatedRequest): Promise<Boolean> {
    const { id } = req.params;
    const { paymentFormValues, selectedPlans, billingCycle, paymentMethod } = req.body;
    // first step find the billing information from the provided profile id
    const billing = await BillingAccount.findOne({ profileId: id as any }).populate('payor profileId');
    if (!billing) {
      throw new ErrorUtil('Could not find billing information', 404);
    }
    const processorResult = await new PaymentProcessorFactory().smartChooseProcessor();
    const processor = processorResult.processor;
    if (!processor) {
      throw new ErrorUtil('No payment processor is configured', 500);
    }

    // Check if the selected plan is free
    const selectedPlan = selectedPlans[0];
    const isFree = selectedPlan.price === 0;

    // Validate payment form data for paid plans based on processor requirements
    if (!isFree) {
      validatePaymentFormData(processor.getProcessorName(), paymentFormValues, paymentMethod);
    }

    // Handle paid plans - require payment processing
    if (!isFree) {
      billing.payor = req.user;
      // we need to update our vaulting
      const vaultResponse = await processor.createVault(billing, {
        ...paymentFormValues,
        email: billing.email,
        paymentMethod: paymentMethod,
        country: getPaymentSafeCountryCode(paymentFormValues.country),
        // phone: billing.payor?.phoneNumber,
        stripeToken: paymentFormValues?.stripeToken, // For Stripe tokenized payments
        creditCardDetails: {
          ccnumber: paymentFormValues?.ccnumber,
          ccexp: paymentFormValues?.ccexp,
        } as any,
        cvv: paymentFormValues?.cvv,
        achDetails: paymentFormValues?.achDetails,
      } as any);

      if (!vaultResponse.success) {
        console.info(`[BillingHandler] - vaulting was not successful: ${vaultResponse.message}`);
        console.info(vaultResponse);
        throw new ErrorUtil(`${vaultResponse.message}`, 400);
      }

      billing.vaulted = true;

      // Initialize paymentProcessorData if it doesn't exist
      if (!billing.paymentProcessorData) {
        billing.paymentProcessorData = {};
      }
      const name = processor.getProcessorName();
      billing.paymentProcessorData[name] = {
        ...vaultResponse.data, // since processors can return different data its safest to just store what we get back to use later.
      };
    } else {
      // Handle free plans - no payment processing required
      if (!billing.payor) {
        billing.payor = req.user;
      }

      // For free plans, we don't need vaulting or customer creation
      billing.vaulted = true; // we dont have a vault for them, but this keeps the system from flagging them for updates
      // Keep existing customerId if any, otherwise create a placeholder for free plans
      if (!billing.customerId) {
        billing.customerId = `free_${req.user._id}_${Date.now()}`;
      }
    }

    // Update billing details for both free and paid plans
    billing.plan = selectedPlan._id;
    billing.isYearly = billingCycle === 'yearly';

    // For free plans, we might not need a nextBillingDate or set it far in the future
    if (isFree) {
      // For free plans, set billing date far in the future or undefined
      billing.nextBillingDate = undefined;
      billing.status = 'active'; // Set status to active for free plans
      billing.needsUpdate = false; // No need for update on free plans
    } else {
      // set the nextBillingDate to the first of next month
      // if the account needed update, we can assume they are switching plans or updating payment
      // so we will not change the nextBillingDate if its already set in the future

      // Only update nextBillingDate if needsUpdate is false (account is in good standing)
      // This prevents giving users a free month when they're updating due to failed payments
      if (!billing.needsUpdate) {
        // if nextBillingDate is not set or is in the past, set it to the first of next month
        if (!billing.nextBillingDate || !moment(billing.nextBillingDate).isAfter(moment())) {
          const nextMonth = moment().add(1, 'month').startOf('month');
          billing.nextBillingDate = nextMonth.toDate();
        }
      }
      billing.status = 'active';
      billing.needsUpdate = false; // if it was true set by admin, this will flip it off
      
      await billing.save();

      if (!billing.setupFeePaid) {
        // next we need to create an initial charge for them the "setup fee" they wont be charged their subscription
        // until their next billing date, but the setup fee is charged immediately.
        const paymentResults = await PaymentProcessingHandler.processPaymentForProfile(billing._id as any, 50, false, 'Account setup fee');
        if (paymentResults.success === false) {
          console.info(`[BillingHandler] - Initial setup fee payment failed: ${paymentResults.message}`);
        }
        // update the billing for the setup fee to being paid
        billing.setupFeePaid = true; // for now signup's dont have a setup fee
      }
    }

    // finally set the processor correctly
    billing.processor = processor.getProcessorName();
    await billing.save();

    return true;
  }

  /**
   * @description Fetch billing information for user from profile id
   */
  async getVault(id: string): Promise<any> {
    try {
      const billing = await BillingAccount.findOne({ profileId: id as any }).populate('plan');
      if (!billing) throw new ErrorUtil('Billing Account not found', 404);

      // Handle different processors
      let billingDetails = {};

      if (billing.processor === 'paynetworx') {
        // For PayNetWorx, return the stored token information
        const pnxData = billing.paymentProcessorData?.pnx || {};
        billingDetails = {
          tokenId: pnxData.tokenId,
          tokenName: pnxData.tokenName,
          vaulted: billing.vaulted,
        };
      } else if (billing.processor === 'stripe') {
        // For Stripe, return the stored customer and payment method information
        const stripeData = billing.paymentProcessorData?.stripe || {};
        billingDetails = {
          customerId: stripeData.customer?.id,
          paymentMethodId: stripeData.paymentMethod?.id,
          vaulted: billing.vaulted,
        };
      } else {
        // For other processors (like Pyre/NMI), fetch customer vault info
        const { payload } = await this.paymentHandler.fetchCustomer(billing.customerId);
        billingDetails = payload.vault;
      }

      return {
        ...billing.toObject(),
        billingDetails,
      };
    } catch (err) {
      console.error(err);
      throw new ErrorUtil('Something went wrong', 400);
    }
  }
}
