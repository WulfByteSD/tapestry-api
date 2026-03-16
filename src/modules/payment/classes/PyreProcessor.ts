import axios from 'axios';
import PaymentProcessor from './PaymentProcess';
import { CommonTransactionType } from '../../../types/CommonTransactionType'; 
import CommonCaptureTypes from '../../../types/CommonCaptureTypes';
import CommonVoidTypes from '../../../types/CommonVoidTypes';
import CommonRefundTypes from '../../../types/CommonRefundTypes';

/**
 * @description PyreProcessing class, this class extends the PaymentProcessor class
 *              and implements the processPayment method to process payments with the nmi
 *              payment gateway.
 * @class PyreProcessing
 * @extends PaymentProcessor
 * @export
 * @version 1.0.0
 * @since 1.0.0
 *
 */
class PyreProcessing extends PaymentProcessor {
  constructor() {
    super();
  }

  processPayment(details: CommonTransactionType) {}

  async captureTransaction(details: CommonCaptureTypes) {}
  async voidTransaction(details: CommonVoidTypes) {}
  async refundTransaction(details: CommonRefundTypes) {}
  async createVault(
    customerId: string,
    details: {
      first_name: string;
      last_name?: string;
      address1?: string;
      address2?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      phone?: string;
      email?: string;
      currency?: string;
      creditCardDetails?: {
        ccnumber?: string;
        ccexp?: string;
      };
      achDetails?: {
        checkname: string;
        checkaba: string;
        checkaccount: string;
        account_holder_type: string;
        account_type: string;
      };
      paymentMethod?: 'creditcard' | 'ach';
      customer_vault?: string;
    }
  ) {
    try {
      // send a request to pyre to create a customer in the api
      const { data } = await axios.post(
        `${process.env.PYRE_API_URL}/vault/${customerId}`,
        {
          ...details,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.PYRE_API_KEY,
          },
        }
      );
      return {
        success: true,
        message: 'Customer Vault Created',
        ...data,
      };
    } catch (err: any) {
      console.error(err?.response?.data);
      return {
        success: false,
        message: `Error Creating Vault Customer - ${err?.response?.data?.message}`,
      };
    }
  }
  async deleteVault(vaultId: string) {
    try {
      // send a request to pyre to create a customer in the api
      const { data } = await axios.post(`${process.env.PYRE_API_URL}/vault/${vaultId}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.PYRE_API_KEY,
        },
      });

      return {
        success: true,
        message: 'Customer Vault Removed',
        ...data,
      };
    } catch (err: any) {
      console.error(err);
      return {
        success: false,
        message: 'Error Creating Customer',
      };
    }
  }
  async vaultTransaction(details: {
    customer_vault_id: string;
    security_key: string;
    amount: number;
    currency?: string;
    initiated_by?: string;
    stored_credential_indicator?: string;
  }) {}
  async getVault(vaultId: string) {
    try {
      // send a request to pyre to create a customer in the api
      const { data } = await axios.get(`${process.env.PYRE_API_URL}/vault/${vaultId}`, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.PYRE_API_KEY,
        },
      });
      return {
        success: true,
        ...data,
      };
    } catch (err: any) {
      console.error(err?.response?.data);
      return {
        success: false,
        message: `Error Fetching Customer - ${err?.response?.data?.message}`,
      };
    }
  }

  async fetchTransactions(customerId: string) {
    try {
      // send a request to pyre to create a customer in the api
      const { data } = await axios.get(`${process.env.PYRE_API_URL}/order`, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.PYRE_API_KEY,
        },
      });
      return {
        success: true,
        ...data,
      };
    } catch (err: any) {
      console.error(err?.response?.data);
      return {
        success: false,
        message: `Error Fetching Transactions - ${err?.response?.data?.message}`,
      };
    }
  }
  // create a function to return the name of the processor
  getProcessorName() {
    return 'pyreprocessing';
  }
}

export default PyreProcessing;
